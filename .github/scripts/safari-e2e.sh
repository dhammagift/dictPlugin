#!/bin/bash
# End-to-end check of the Safari extension on a CI Mac: install the locally signed app, switch the extension on in
# Safari, open a page with Pali, click a word, see the dictionary popup. Screenshots, a video and UI dumps go to $OUT.
# Usage: safari-e2e.sh <path to .app>
set -uo pipefail
APP_SRC=$1
OUT=${OUT:-e2e}
mkdir -p "$OUT"
EXT_NAME="Dhamma.gift Search and Word Lookup"
PAGE="https://dhamma.gift/mn1"
n=0
shot() { n=$((n + 1)); screencapture -x "$OUT/$(printf %02d $n)-$1.png" || echo "screencapture failed"; }
ui() { osascript -e "$1" 2>&1; }
dump() { ui "tell application \"System Events\" to tell process \"$1\" to get entire contents of window 1" > "$OUT/ui-$2.txt"; }

sw_vers
defaults read /Applications/Safari.app/Contents/Info.plist CFBundleShortVersionString

# Install and launch the container app once: that registers the extension with Safari.
cp -R "$APP_SRC" /Applications/
APP="/Applications/$(basename "$APP_SRC")"
xattr -cr "$APP"
codesign -dv --entitlements - "$APP" 2>&1 | head -30
open "$APP"
sleep 8
shot app-window
pgrep -fl "Dhamma.gift Dictionary" || echo "app is not running"
ui 'tell application "System Events" to get {name, name of windows} of (processes whose background only is false)'
ls -la ~/Library/Logs/DiagnosticReports/ 2>/dev/null | tail -5
log show --last 1m --style compact --predicate 'process CONTAINS "Dhamma" OR eventMessage CONTAINS "dictlookup"' 2>/dev/null | tail -40
pluginkit -mAvvv -p com.apple.Safari.web-extension | tee "$OUT/pluginkit.txt"
osascript -e "quit app \"$(basename "$APP" .app)\""

# "Allow unsigned extensions" asks for an admin password; the runner user has none we know, so set one.
PW=e2e-$RANDOM$RANDOM
sudo dscl . -passwd /Users/runner "$PW"

open -a Safari "about:blank"
sleep 5
ui 'tell application "Safari" to activate'
# Settings > Advanced > "Show features for web developers" adds the Developer tab.
ui 'tell application "System Events" to keystroke "," using command down'
sleep 2
dump Safari settings-general
ui 'tell application "System Events" to tell process "Safari" to click button "Advanced" of toolbar 1 of window 1'
sleep 1
dump Safari settings-advanced
ui 'tell application "System Events" to tell process "Safari"
  repeat with c in (checkboxes of group 1 of group 1 of window 1)
    if name of c contains "web developers" and value of c is 0 then click c
  end repeat
end tell'
sleep 1
ui 'tell application "System Events" to tell process "Safari" to click button "Developer" of toolbar 1 of window 1'
sleep 1
dump Safari settings-developer
shot developer-tab
# Each of these developer switches may ask for the admin password (the prompt belongs to SecurityAgent).
dev_on() {
  ui "tell application \"System Events\" to tell process \"Safari\"
    set c to checkbox \"$1\" of group 1 of group 1 of window 1
    if value of c is 0 then click c
  end tell"
  sleep 2
  shot "auth-$2"
  ui 'tell application "System Events" to get {name, name of windows} of (processes whose background only is false)'
  ui "tell application \"System Events\" to tell process \"SecurityAgent\" to get entire contents of window 1" > "$OUT/ui-auth-$2.txt"
  ui "tell application \"System Events\"
    if exists process \"SecurityAgent\" then
      tell process \"SecurityAgent\"
        set frontmost to true
        keystroke \"$PW\"
        keystroke return
      end tell
    end if
  end tell"
  sleep 2
  ui "tell application \"System Events\" to tell process \"Safari\" to get value of checkbox \"$1\" of group 1 of group 1 of window 1"
}
dev_on "Allow unsigned extensions" unsigned
dev_on "Allow JavaScript from Apple Events" apple-events
dump Safari settings-developer-after
shot developer-after

# Extensions tab: switch ours on.
ui 'tell application "System Events" to tell process "Safari" to click button "Extensions" of toolbar 1 of window 1'
sleep 2
dump Safari settings-extensions
ui "tell application \"System Events\" to tell process \"Safari\"
  set L to entire contents of window 1
  set seen to {}
  repeat with i from 1 to count of L
    set c to item i of L
    try
      if role of c is \"AXCheckBox\" then
        set end of seen to (name of c as text) & \" = \" & (value of c as text)
        if (name of c as text) contains \"Dhamma\" and value of c is 0 then click c
      end if
    end try
  end repeat
  return seen
end tell"
sleep 2
shot extension-on
dump Safari extension-on
ui 'tell application "System Events" to keystroke "w" using command down'

# A page with Pali; record the rest.
screencapture -v -V 90 "$OUT/lookup.mov" &
REC=$!
ui "tell application \"Safari\" to set URL of front document to \"$PAGE\""
sleep 10
shot page
dump Safari page
# Safari may ask for website access first: take "Always Allow on Every Website" if offered.
ui 'tell application "System Events" to tell process "Safari"
  repeat with b in (entire contents of window 1)
    try
      if class of b is button and name of b contains "Every Website" then click b
    end try
  end repeat
end tell'
sleep 3
# Click a Pali word: find "evaṃ" in the page and click it through JS coordinates is not possible from AppleScript,
# so ask the page where the first Pali segment is and click there.
POS=$(ui 'tell application "Safari" to do JavaScript "(() => { const w = [...document.querySelectorAll(\"span, p\")].find(e => /evaṃ|Evaṃ/.test(e.textContent) && e.children.length === 0); if (!w) return \"\"; w.scrollIntoView({block: \"center\"}); const r = w.getBoundingClientRect(); return [Math.round(r.left + 15), Math.round(r.top + r.height / 2), window.screenX, window.screenY + window.outerHeight - window.innerHeight].join(\",\"); })()" in front document')
echo "word position: $POS"
sleep 2
if [[ $POS =~ ^[0-9-]+,[0-9-]+,[0-9-]+,[0-9-]+$ ]]; then
  IFS=, read -r X Y WX WY <<<"$POS"
  CX=$((WX + X)); CY=$((WY + Y))
  echo "click at $CX,$CY"
  # cliclick is not on the image; a CGEvent click from Swift is.
  swift - "$CX" "$CY" <<'SWIFT'
import CoreGraphics
import Foundation
let x = Double(CommandLine.arguments[1])!, y = Double(CommandLine.arguments[2])!
let p = CGPoint(x: x, y: y)
for t in [CGEventType.leftMouseDown, .leftMouseUp] {
  CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
  usleep(80_000)
}
SWIFT
fi
sleep 8
shot after-click
ui 'tell application "Safari" to do JavaScript "JSON.stringify({popup: !!document.querySelector(\".popupExt\"), shown: (document.querySelector(\".popupExt\") || {}).style?.display, iframe: (document.querySelector(\".dg-ext-iframe\") || {}).src})" in front document' | tee "$OUT/result.json"
dump Safari after-click
sleep 4
kill -INT $REC 2>/dev/null; wait $REC 2>/dev/null
ls -la "$OUT"
