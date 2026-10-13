#!/usr/bin/env python3
"""
يبني نسخة بملف HTML واحد يجمع كل شيء (CSS + JS).
مفيدة للنقل السريع أو الفتح المباشر بدون خادم.
"""
import os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
APP = os.path.join(ROOT, 'app')

def read(p):
    with open(os.path.join(APP, p), encoding='utf-8') as f:
        return f.read()

def build():
    html = read('index.html')
    css = read('css/style.css')
    js_files = ['js/store.js', 'js/ai.js', 'js/assist.js', 'js/calendar.js', 'js/ui.js']
    js = '\n\n'.join('/* ==== ' + f + ' ==== */\n' + read(f) for f in js_files)

    # استبدل وسم CSS بالكامل
    html = re.sub(r'<link rel="stylesheet" href="css/style\.css">',
                  '<style>\n' + css + '\n</style>', html)

    # استبدل كل وسوم السكربت المحلية بسكربت واحد مضمّن
    html = re.sub(r'<script src="js/[^"]+"></script>\s*', '', html)
    html = html.replace('</body>', '<script>\n' + js + '\n</script>\n</body>')

    # لا حاجة لـ manifest و service worker في النسخة الواحدة
    html = re.sub(r'<link rel="manifest"[^>]*>\s*', '', html)
    html = html.replace("navigator.serviceWorker.register('sw.js')", "Promise.reject(new Error('single-file'))")

    out_dir = os.path.join(ROOT, 'dist')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, 'daftar-hood-standalone.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    return out, len(html)

if __name__ == '__main__':
    path, size = build()
    print('بُني: ' + path)
    print('الحجم: ' + str(round(size / 1024, 1)) + ' ك.ب')
