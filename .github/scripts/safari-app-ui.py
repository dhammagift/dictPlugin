"""Add setup steps to the converter-generated container app window (macOS Safari extension).

The default page only says "You can turn on ... in Safari Extensions preferences". App Review
enabled the extension, saw nothing happen and rejected for 2.1(a): the extension also needs website
access, and lookups happen on web pages, not in the app. Usage: safari-app-ui.py <project dir>.
"""
import pathlib
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
