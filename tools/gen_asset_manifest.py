#!/usr/bin/env python3
# 扫描 assets/ 下所有 PNG，生成 asset_manifest.js 供 asset_viewer.html 使用
# 用法: python3 tools/gen_asset_manifest.py  （新增素材后重新跑一次即可）
import os, struct, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'asset_manifest.js')

def png_size(path):
    with open(path, 'rb') as f:
        f.seek(16)
        return struct.unpack('>II', f.read(8))

items = []
for root, dirs, files in os.walk(os.path.join(ROOT, 'assets')):
    dirs.sort()
    for f in sorted(files):
        if not f.endswith('.png'):
            continue
        p = os.path.join(root, f)
        w, h = png_size(p)
        items.append({
            'path': os.path.relpath(p, ROOT),
            'w': w, 'h': h,
            'kb': round(os.path.getsize(p) / 1024, 1),
        })

with open(OUT, 'w') as f:
    f.write('// 由 tools/gen_asset_manifest.py 自动生成，勿手改\n')
    f.write('window.ASSET_MANIFEST = ' + json.dumps(items, ensure_ascii=False) + ';\n')
print(f'{len(items)} PNGs -> {os.path.relpath(OUT, ROOT)}')
