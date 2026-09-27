"""Small Safari adapter for inspecting the five user-authorized public references."""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

def evaluate(js):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".js") as f:
        f.write(js)
        f.flush()
        script = '''on run argv
set js to read POSIX file (item 1 of argv) as «class utf8»
tell application "Safari" to do JavaScript js in current tab of front window
end run'''
        return subprocess.check_output(["osascript", "-e", script, f.name], text=True).strip()

def resize(width, height=1000):
    values=json.loads(evaluate("JSON.stringify({w:innerWidth,h:innerHeight})"))
    bounds=subprocess.check_output(["osascript","-e",'tell application "Safari" to get bounds of front window'],text=True)
    left,top,right,bottom=map(int,bounds.split(','))
    new_right=left+right-left+width-values['w']
    new_bottom=top+bottom-top+height-values['h']
    subprocess.run(["osascript","-e",f'tell application "Safari" to set bounds of front window to {{{left},{top},{new_right},{new_bottom}}}'],check=True)
    return evaluate("JSON.stringify({viewport:[innerWidth,innerHeight],title:document.title})")

def screenshot(path):
    wid=subprocess.check_output(["osascript","-e",'tell application "Safari" to get id of front window'],text=True).strip()
    subprocess.run(["/usr/sbin/screencapture","-x","-l",wid,str(path)],check=True)

if __name__=='__main__':
    if sys.argv[1]=='eval': print(evaluate(sys.stdin.read()))
    elif sys.argv[1]=='resize': print(resize(int(sys.argv[2])))
    elif sys.argv[1]=='screenshot': screenshot(Path(sys.argv[2]))
