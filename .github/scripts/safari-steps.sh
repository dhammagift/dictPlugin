#!/bin/bash
# Screenshots of each step a person takes to turn the extension on, as on a real Mac: the extension is listed in
# Settings > Extensions only with "Allow unsigned extensions" on (the CI build is ad-hoc signed), which asks for the
# user's password; the runner's is unknown, so set one first. Run after safari-e2e.sh (the app is installed).
set -uo pipefail
OUT=${OUT:-e2e/steps}
mkdir -p "$OUT"
APP="/Applications/Dhamma.gift Dictionary.app"
EXT="Dhamma.gift Search and Word Lookup"
PAGE="https://dhamma.gift/mn1"
PW="dg-$RANDOM-$RANDOM-$RANDOM"
shot() { screencapture -x "$OUT/$1.png" || echo "screencapture failed"; }
ui() { osascript -e "$1" 2>&1; }
click_named() {  # process, role, name prefix
  ui "tell application \"System Events\" to tell process \"$1\"
  set L to entire contents of window 1
  repeat with i from 1 to count of L
    set c to item i of L
    try
      if role of c is \"$2\" and (name of c as text) starts with \"$3\" then
        click c
        return \"clicked $3\"
      end if
    end try
  end repeat
  return \"not found: $3\"
end tell"
}
password() {  # answer Safari's password prompt, if one is up
  sleep 2
  if ui 'tell application "System Events" to get name of every process' | grep -q SecurityAgent; then
    ui 'tell application "System Events" to tell process "SecurityAgent" to set frontmost to true'
    ui 'tell application "System Events" to keystroke "a" using command down'
    ui "tell application \"System Events\" to keystroke \"$PW\""
    ui 'tell application "System Events" to keystroke return'
    sleep 2
    echo "password entered"
  fi
}

osascript -e 'quit app "Safari"'; osascript -e 'quit app "Dhamma.gift Dictionary"'; sleep 3
# dscl -passwd asks for the old password; sysadminctl as root resets it without one.
sudo sysadminctl -resetPasswordFor runner -newPassword "$PW" 2>&1 | tail -2
dscl . -authonly runner "$PW" && echo "runner password set" || echo "runner password NOT set"

# Developer tab: allow unsigned extensions and JavaScript from Apple Events (to find a word to click).
open -a Safari "about:blank"; sleep 5
ui 'tell application "Safari" to activate'
ui 'tell application "System Events" to keystroke "," using command down'; sleep 2
ui 'tell application "System Events" to tell process "Safari" to click button "Developer" of toolbar 1 of window 1'; sleep 1
click_named Safari AXCheckBox "Allow unsigned extensions"; password
click_named Safari AXCheckBox "Allow JavaScript from Apple Events"; password
shot 0-developer-settings
ui 'tell application "System Events" to keystroke "w" using command down'; sleep 1

# 1. The app: click its button.
open "$APP"; sleep 5
shot 1a-app
click_named "Dhamma.gift Dictionary" AXButton "Open Safari"; sleep 5
shot 1b-after-button

# 2. Tick the extension.
ui 'tell application "Safari" to activate'; sleep 1
click_named Safari AXCheckBox "$EXT"; sleep 3
shot 2-ticked
click_named Safari AXButton "Turn On"; sleep 2

# 3. Edit Websites…
click_named Safari AXButton "Edit Websites"; sleep 2
shot 3-edit-websites

# 4. Other websites: Allow.
ui 'tell application "System Events" to tell process "Safari"
  set L to entire contents of window 1
  set pops to {}
  repeat with i from 1 to count of L
    set c to item i of L
    try
      if role of c is "AXPopUpButton" then set end of pops to c
    end try
  end repeat
  set p to last item of pops
  click p
  delay 1
  click menu item "Allow" of menu 1 of p
  return value of p
end tell'
sleep 1
shot 4-allow
click_named Safari AXButton "Done"; sleep 1
ui 'tell application "System Events" to keystroke "w" using command down'; sleep 1

# 5. A page with Pali: click a word.
ui "tell application \"Safari\" to set URL of front document to \"$PAGE\""; sleep 10
POS=$(ui 'tell application "Safari" to do JavaScript "(() => { const w = [...document.querySelectorAll(\"span, p\")].find(e => /evaṃ|Evaṃ/.test(e.textContent) && e.children.length === 0); if (!w) return \"\"; w.scrollIntoView({block: \"center\"}); const r = w.getBoundingClientRect(); return [Math.round(r.left + 15), Math.round(r.top + r.height / 2), window.screenX, window.screenY + window.outerHeight - window.innerHeight].join(\",\"); })()" in front document')
echo "word position: $POS"
sleep 2
if [[ $POS =~ ^[0-9-]+,[0-9-]+,[0-9-]+,[0-9-]+$ ]]; then
  IFS=, read -r X Y WX WY <<<"$POS"
  swift - "$((WX + X))" "$((WY + Y))" <<'SWIFT'
import CoreGraphics
import Foundation
let p = CGPoint(x: Double(CommandLine.arguments[1])!, y: Double(CommandLine.arguments[2])!)
for t in [CGEventType.leftMouseDown, .leftMouseUp] {
  CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
  usleep(80_000)
}
SWIFT
fi
sleep 6
shot 5-word-clicked
ls -la "$OUT"
