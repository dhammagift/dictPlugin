"""Add setup steps and a full-size app icon to the converter-generated macOS container app.

The default page only says "You can turn on ... in Safari Extensions preferences". App Review
enabled the extension, saw nothing happen and rejected for 2.1(a): the extension also needs website
access, and lookups happen on web pages, not in the app. Usage: safari-app-ui.py <project dir>.
"""
import html
import json
import os
import re
import pathlib
import shutil
import subprocess
import sys

# Safari's own name for the extension (the manifest's), as it shows in Settings > Extensions. Safari does
# not select a disabled extension there: it lands on "Add Extensions", so step 2 names exactly what to tick.
EXT_SOURCE = os.environ.get('EXT_SOURCE')
EXT_NAME = (json.load(open(pathlib.Path(EXT_SOURCE) / 'manifest.json'))['name'] if EXT_SOURCE
            else 'Dhamma.gift Search and Word Lookup')

STEPS = f"""<ol class="dg-steps">
    <li>Click the button below: Safari opens Settings &gt; Extensions. This window stays open.</li>
    <li>In the list on the left, tick &ldquo;{html.escape(EXT_NAME)}&rdquo;.</li>
    <li>Click &ldquo;Edit Websites&hellip;&rdquo; and set &ldquo;When visiting other websites&rdquo; to Allow. (Or, when Safari asks, choose &ldquo;Always Allow on Every Website&rdquo;.)</li>
    <li>Done: click any Pali word on a web page, for example dhamma.gift/mn1.</li>
</ol>
<p class="dg-note">If Safari says an app interfered with clicking, quit apps that control the screen (remote access, accessibility utilities) and tick it again.</p>
"""

# The page's CSP is default-src 'self': no inline styles, so the CSS goes into Style.css.
CSS = """
/* Dhamma.gift setup steps */
img { width: 72px; height: 72px; }
.dg-steps { font-size: 12px; text-align: left; margin: 0; padding-left: 1.4em; max-width: 34em; }
.dg-steps li { margin: 0.25em 0; }
.dg-note { font-size: 11px; opacity: 0.7; max-width: 38em; margin: 0; }
/* Never clip the button: let the page grow and scroll instead of centring in a fixed 100vh. */
body { height: auto; min-height: 100vh; box-sizing: border-box; padding: 16px 0; overflow-y: auto; }
"""


def one(root, name):
    found = [p for p in root.rglob(name) if 'DerivedData' not in p.parts]
    if len(found) != 1:
        sys.exit(f'expected exactly one {name}, found {found}')
    return found[0]


root = pathlib.Path(sys.argv[1])
html_path = one(root, 'Main.html')
html = html_path.read_text()
if 'dg-steps' not in html:
    if '<button' not in html:
        sys.exit(f'{html_path}: no <button> to insert the steps before')
    html = html.replace('<button', STEPS + '    <button', 1)
# The app no longer quits when the button is clicked (ViewController.swift sets the same text later).
html = re.sub(r'(<button class="open-preferences">)[^<]*', r'\1Open Safari Settings…', html)
html_path.write_text(html)

css_path = one(root, 'Style.css')
css = css_path.read_text()
if 'dg-steps' not in css:
    css_path.write_text(css + CSS)

print(html_path.read_text())

# The app's button: our ViewController (assets/safari/ViewController.swift) replaces the converter's,
# which quit the app without opening anything when Safari didn't know the extension yet. It relies
# on the converter's storyboard (class ViewController, outlet webView) and Script.js (message
# handler "controller", "open-preferences", show(enabled, useSettings) that leaves a non-boolean
# state alone): check those instead of shipping a button that silently does nothing.
REPO = pathlib.Path(__file__).resolve().parents[2]
vc_path = one(root, 'ViewController.swift')
vc = vc_path.read_text()
print(vc)
m = re.search(r'extensionBundleIdentifier\s*=\s*"([^"]+)"', vc)
if not m or not m.group(1).endswith('.Extension'):
    sys.exit(f'{vc_path}: no extensionBundleIdentifier ending in .Extension')
for needle in ('class ViewController: NSViewController', '@IBOutlet var webView: WKWebView!'):
    if needle not in vc:
        sys.exit(f'{vc_path}: converter template changed, "{needle}" not found')
script = one(root, 'Script.js').read_text()
print(script)
for needle in ('messageHandlers.controller.postMessage("open-preferences")', 'function show(',
               'typeof enabled === "boolean"'):
    if needle not in script:
        sys.exit(f'Script.js: converter template changed, "{needle}" not found')
ours = (REPO / 'assets/safari/ViewController.swift').read_text()
vc_path.write_text(ours.replace('__EXTENSION_BUNDLE_ID__', m.group(1)))
print(f'{vc_path}: replaced, extension {m.group(1)}')

# App icon: the converter fills AppIcon from the manifest's largest icon (128 px), blurry at the
# Mac App Store's 1024. Regenerate every macOS size from assets/safari/AppIcon-1024.png with sips.
ICON_SRC = pathlib.Path(__file__).resolve().parents[2] / 'assets/safari/AppIcon-1024.png'
iconset = one(root, 'AppIcon.appiconset')
for old in iconset.glob('*.png'):
    old.unlink()
images = []
for pt in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        name = f'icon_{pt}x{pt}{"@2x" if scale == 2 else ""}.png'
        px = pt * scale
        subprocess.run(['sips', '-z', str(px), str(px), str(ICON_SRC), '--out', str(iconset / name)],
                       check=True, stdout=subprocess.DEVNULL)
        images.append({'idiom': 'mac', 'size': f'{pt}x{pt}', 'scale': f'{scale}x', 'filename': name})
(iconset / 'Contents.json').write_text(json.dumps(
    {'images': images, 'info': {'author': 'xcode', 'version': 1}}, indent=2))
print(f'{iconset}: {sorted(p.name for p in iconset.iterdir())}')

# The app window shows Resources/Icon.png (also the 128 px manifest icon).
for icon in (p for p in root.rglob('Icon.png') if 'DerivedData' not in p.parts):
    shutil.copyfile(ICON_SRC, icon)
