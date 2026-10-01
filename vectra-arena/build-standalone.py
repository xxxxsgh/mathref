#!/usr/bin/env python3
"""Builds vectra-arena-standalone.html: one file with the CSS and all game JS
inlined (Three.js still comes from the CDN). Run: python3 build-standalone.py"""
import os, re
os.chdir(os.path.dirname(os.path.abspath(__file__)))
html = open('index.html', encoding='utf-8').read()
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + open('style.css', encoding='utf-8').read() + '\n</style>')
html = html.replace('<link rel="icon" href="assets/icons/favicon.svg" type="image/svg+xml">', '')
html = re.sub(r"  <script>window\.THREE \|\| document\.write\('<script src=\"assets/vendor/three\.min\.js\"><\\/script>'\);</script>\n", '', html)
for src in re.findall(r'<script src="([a-z]+\.js)"></script>', html):
    js = open(src, encoding='utf-8').read().replace('</script', '<\\/script')
    html = html.replace(f'<script src="{src}"></script>', f'<script>\n/* ===== {src} ===== */\n{js}\n</script>')
assert 'src="assets/vendor' not in html and '<script src=' not in html.split('jsdelivr')[1].split('unpkg')[1][40:]
open('vectra-arena-standalone.html', 'w', encoding='utf-8').write(html)
print('vectra-arena-standalone.html', len(html), 'bytes')
