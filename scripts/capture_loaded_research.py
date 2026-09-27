"""Capture completed, visible research charts from the user-opened Safari page."""
import json
import time
from pathlib import Path
from safari_reference import evaluate

root = Path(__file__).resolve().parents[1]
target = root / 'design-references/openai/docs/research/openai-com-2387c885/index--research-acceleration-view-inside-openai-edcd988a'
assert 'research-acceleration-view-inside-openai' in evaluate('location.href')
states = []
for index in range(12):
    evaluate(f'document.querySelectorAll(\'button[data-analytics="rsi-view-methods"]\')[{index}].click(); "opened"')
    for attempt in range(20):
        time.sleep(.3)
        ready = evaluate('JSON.stringify([...document.querySelectorAll(\'[role="dialog"]\')].find(x=>x.textContent.startsWith("Additional information"))?.querySelectorAll(\'[aria-busy="true"]\').length)')
        if ready == '0': break
    if ready != '0': raise RuntimeError(f'Drawer {index} still loading')
    state = json.loads(evaluate('JSON.stringify((()=>{const x=[...document.querySelectorAll(\'[role="dialog"]\')].find(x=>x.textContent.startsWith("Additional information"));return {html:x.outerHTML,text:x.textContent}})())'))
    states.append({'index':index, **state})
    evaluate('document.querySelector(\'button[aria-label="Close drawer"]\').click(); "closed"')
    time.sleep(.35)
    print(f'Captured drawer {index + 1}/12', flush=True)
(target / 'methods-states.json').write_text(json.dumps(states, ensure_ascii=False))
height = int(evaluate('document.documentElement.scrollHeight'))
for top in range(0, height, 700):
    evaluate(f'window.scrollTo({{top:{top},behavior:"instant"}});"scroll"')
    time.sleep(.5)
evaluate('window.scrollTo({top:0,behavior:"instant"});"top"')
time.sleep(.4)
capture = evaluate((root / 'scripts/capture_reference.js').read_text())
(target / 'capture-light-1440.json').write_text(capture)
print('Saved fully loaded page and drawers', flush=True)
