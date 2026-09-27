"""Capture the user-opened Safari reference tab without changing its session."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
script = ROOT / "scripts/capture_reference.js"
apple = '''on run argv
set js to read POSIX file (item 1 of argv) as «class utf8»
tell application "Safari" to do JavaScript js in current tab of front window
end run'''
result = subprocess.run(["osascript", "-e", apple, str(script)], check=True, text=True, capture_output=True)
data = json.loads(result.stdout)
if not data.get("styles") or data["title"] == "Just a moment...":
    raise SystemExit("Reference page is not available; leave verification to the user.")
plans = json.loads((ROOT / "design-references/openai/docs/output-plan.json").read_text())
plan = next((p for p in plans if data["url"].split("#")[0] == p["url"]), None)
if plan is None:
    raise SystemExit("The open tab is not one of the five planned reference pages.")
destination = ROOT / "design-references/openai" / plan["research"] / (sys.argv[1] if len(sys.argv)>1 else "capture-safari.json")
destination.write_text(json.dumps(data, ensure_ascii=False, indent=2))
print(json.dumps({"title":data["title"], "viewport":data["viewport"], "path":str(destination)}, indent=2))
