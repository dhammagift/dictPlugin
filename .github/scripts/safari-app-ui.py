"""Add setup steps and a full-size app icon to the converter-generated macOS container app.

The default page only says "You can turn on ... in Safari Extensions preferences". App Review
enabled the extension, saw nothing happen and rejected for 2.1(a): the extension also needs website
access, and lookups happen on web pages, not in the app. Usage: safari-app-ui.py <project dir>.
"""
import json
import pathlib
import shutil
import subprocess
import sys

STEPS = """<ol class="dg-steps">
    <li>Click the button below and turn on the Dhamma.gift extension in Safari Settings &rarr; Extensions.</li>
    <li>In Safari Settings &rarr; Websites, select the extension and set &ldquo;When visiting other websites&rdquo; to Allow.</li>
    <li>Click any Pali word on a web page to look it up, or select text and choose Dhamma.gift from the context menu. The toolbar button turns lookups on and off.</li>
</ol>
"""

# The page's CSP is default-src 'self': no inline styles, so the CSS goes into Style.css.
CSS = """
/* Dhamma.gift setup steps */
img { width: 72px; height: 72px; }
.dg-steps { font-size: 12px; text-align: left; margin: 0; padding-left: 1.4em; max-width: 34em; }
.dg-steps li { margin: 0.25em 0; }
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
    html_path.write_text(html)

css_path = one(root, 'Style.css')
css = css_path.read_text()
if 'dg-steps' not in css:
    css_path.write_text(css + CSS)

print(html_path.read_text())

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
