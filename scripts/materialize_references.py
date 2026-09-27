"""Build isolated, locally served reference artifacts from inspected browser DOMs.

No page fetch, authentication state, third-party JavaScript, or tracking is replayed.
Only asset URLs observed in the saved DOM/CSS are downloaded.
"""
import hashlib
import html
import json
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'design-references/openai'
PLANS = json.loads((ROOT / 'docs/output-plan.json').read_text())
SITE = PLANS[0]['site']
SHARED = ROOT / 'public/sites' / SITE / 'shared'
SHARED.mkdir(parents=True, exist_ok=True)
manifest = {}
failures = []

def asset(url, folder):
    url = urllib.parse.urljoin('https://openai.com/', html.unescape(url))
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ('http', 'https'):
        return url
    bare = urllib.parse.urlunsplit(parsed._replace(fragment=''))
    key = (bare, str(folder))
    if key not in manifest:
        suffix = Path(parsed.path).suffix
        if len(suffix) > 8 or not suffix: suffix = '.bin'
        filename = hashlib.sha256(bare.encode()).hexdigest()[:16] + suffix
        path = folder / filename
        manifest[key] = {'source': bare, 'path': path, 'url': '/' + str(path.relative_to(ROOT / 'public'))}
    return manifest[key]['url'] + ('#' + parsed.fragment if parsed.fragment else '')

def download(item):
    path = item['path']
    if path.exists() and path.stat().st_size: return
    try:
        req = urllib.request.Request(item['source'], headers={'User-Agent': 'miRacle local design-reference capture'})
        with urllib.request.urlopen(req, timeout=45) as response:
            data = response.read()
            if 'text/html' in response.headers.get('Content-Type', ''):
                raise ValueError('Unexpected HTML returned for a static asset')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    except Exception as exc:
        failures.append({'url':item['source'], 'error':str(exc)})

VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
class Sanitizer(HTMLParser):
    def __init__(self, folder):
        super().__init__(convert_charrefs=False)
        self.folder, self.out, self.skip = folder, [], []
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if self.skip:
            if tag not in VOID: self.skip.append(tag)
            return
        if tag in {'script','noscript','next-route-announcer','nextjs-portal'} or (tag=='iframe' and not values.get('src','').startswith('https://player.vimeo.com/')):
            if tag not in VOID: self.skip.append(tag)
            return
        if tag == 'source' and 'prefers-color-scheme: dark' in values.get('media',''): return
        if tag == 'canvas' and (self.folder / 'canvas-0.png').exists():
            poster = '/' + str((self.folder / 'canvas-0.png').relative_to(ROOT / 'public'))
            self.out.append('<img src="'+poster+'" alt="Captured frame of the original animated figure" style="width:100%;height:100%;object-fit:contain">')
            self.skip.append(tag)
            return
        clean=[]
        for k,v in attrs:
            if k.startswith('on') or k in ('nonce','data-ready','inert'): continue
            if v is None: clean.append(k); continue
            if k in ('src','poster') and tag!='iframe' and v and not v.startswith('data:'):
                v=asset(v,self.folder)
            elif k=='srcset':
                v=', '.join(asset(p.strip().split()[0],self.folder)+(' '+p.strip().split()[1] if len(p.strip().split())>1 else '') for p in v.split(',') if p.strip())
            elif k in ('href','xlink:href'):
                if re.search(r'javascript:|vbscript:',v,re.I): continue
                if '.svg' in v and (tag=='use' or not tag=='a'): v=asset(v,SHARED)
                elif tag=='a' and v.startswith('/') and not v.startswith('//'):
                    path=urllib.parse.urlsplit(v).path
                    if path != '/' and path not in [urllib.parse.urlsplit(p['url']).path for p in PLANS]: v='https://openai.com'+v
            if k=='style':
                v=re.sub(r'url\(["\x27]?(https?://[^)"\x27]+)["\x27]?\)',lambda m:'url('+asset(m[1],self.folder)+')',v)
            clean.append(k+'="'+html.escape(v,quote=True)+'"')
        self.out.append('<'+tag+(' '+' '.join(clean) if clean else '')+'>')
    def handle_startendtag(self,tag,attrs): self.handle_starttag(tag,attrs)
    def handle_endtag(self,tag):
        if self.skip:
            if tag==self.skip[-1]: self.skip.pop()
            return
        if tag not in VOID:self.out.append('</'+tag+'>')
    def handle_data(self,data):
        if not self.skip:self.out.append(data)
    def handle_entityref(self,name):
        if not self.skip:self.out.append('&'+name+';')
    def handle_charref(self,name):
        if not self.skip:self.out.append('&#'+name+';')

def sanitize(markup,folder):
    parser=Sanitizer(folder);parser.feed(markup);return ''.join(parser.out)

css_seen=set();css_chunks=[]
for plan in PLANS:
    research=ROOT/plan['research'];folder=ROOT/plan['assets'];folder.mkdir(parents=True,exist_ok=True)
    candidates=[research/n for n in ('capture-light-1440.json','capture-safari.json','capture-desktop.json','capture-initial.json')]
    capture=next((p for p in candidates if p.exists()),None)
    if capture is None:raise SystemExit('Missing inspected capture: '+plan['url'])
    data=json.loads(capture.read_text())
    for sheet in data['sheets']:
        css=sheet.get('css') or ''
        digest=hashlib.sha256(css.encode()).hexdigest()
        if digest in css_seen:continue
        css_seen.add(digest)
        def font_face(m):
            rule=m[0]
            if 'font-family: "OpenAI Sans"' not in rule:return ''
            if not re.search(r'font-weight: (400|500|700);',rule):return ''
            return re.sub(r'url\(["\x27]?([^\)"\x27]+)["\x27]?\)',lambda u:'url("'+asset(urllib.parse.urljoin(sheet.get('href') or plan['url'],u[1]),SHARED)+'")',rule)
        css=re.sub(r'@font-face\s*\{[^}]*\}',font_face,css)
        css=re.sub(r'url\("(?!/sites/)([^"\)]+)"\)',lambda u:'url("'+urllib.parse.urljoin(sheet.get('href') or plan['url'],u[1])+'")',css)
        css_chunks.append(css)
    content=sanitize(data['body'],folder)
    (research/'body.local.html').write_text(content)
    states={}
    for name in ('interaction-states','methods-states'):
        p=research/(name+'.json')
        if p.exists():
            def convert(value):
                if isinstance(value,dict):
                    return {k:sanitize(v,folder) if k=='html' and isinstance(v,str)
                            else [asset(url,folder) for url in v] if k=='sources' and isinstance(v,list)
                            else convert(v) for k,v in value.items()}
                if isinstance(value,list):return [convert(v) for v in value]
                return value
            states[name]=convert(json.loads(p.read_text()))
    plain=research/'capture-plain-language.json'
    if plain.exists():states['plain-language']={'html':sanitize(json.loads(plain.read_text())['body'],folder)}
    (research/'content.json').write_text(json.dumps({'title':data['title'],'url':plan['url'],'html':content,'states':states},ensure_ascii=False))
    (research/'PAGE_TOPOLOGY.md').write_text('# '+data['title']+'\n\nSource: '+plan['url']+'\n\n'+'\n'.join('- '+x['text'].strip() for x in data['styles'] if x['tag'] in ('H1','H2','H3') and x['text'])+'\n\nFixed header; centered article introduction; persistent section navigation; article body, figures and source links; footer.\n')
    (research/'BEHAVIORS.md').write_text('# Observed behaviors\n\nHeader stays fixed on scroll. Contents navigation follows sections; on narrower viewports it becomes a disclosure control. Source button transitions are 200 ms and pill-shaped. Inline source links underline.\n\nCaptured interaction payloads are in content.json. Reference pages are local design studies; external services (voice-agent sessions and remote video hosting) retain links to the original service. No source-site scripts or tracking are executed.\n')

(SHARED/'reference.css').write_text('\n'.join(css_chunks))
with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(download,list(manifest.values())))
report={'sources':[p['url'] for p in PLANS],'assets':[dict(source=x['source'],path=str(x['path'].relative_to(ROOT)),bytes=x['path'].stat().st_size if x['path'].exists() else None) for x in manifest.values()],'failures':failures}
(ROOT/'docs/asset-provenance.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'assets':len(manifest),'failures':len(failures),'cssBytes':(SHARED/'reference.css').stat().st_size},indent=2))
if failures:print(json.dumps(failures,indent=2))
