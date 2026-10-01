"""Rebuild the single-file game from a skeleton made by split_assets.py.

    python3 build_assets.py work/ ../IGMC_Night_Watch.html
"""
import os, re, sys

work, dst = sys.argv[1], sys.argv[2]
src = open(os.path.join(work, 'game.src.html'), encoding='utf-8').read()
read = lambda name: open(os.path.join(work, 'assets', name), encoding='utf-8').read()
out = re.sub(r'__BIGLINE_(\d+)__', lambda m: read(f'line_{m.group(1)}.txt'), src)
out = re.sub(r'__ASSET_([A-Za-z0-9]+)__', lambda m: read(m.group(1) + '.txt'), out)
open(dst, 'w', encoding='utf-8').write(out)
print('built', dst)
