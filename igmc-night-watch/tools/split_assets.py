"""Split the single-file game into an editable skeleton plus its inlined assets.

    python3 split_assets.py ../IGMC_Night_Watch.html work/

writes work/game.src.html (the code, ~1 MB, with __ASSET_n__ / __BIGLINE_n__
placeholders) and work/assets/*.txt (the base64 payloads). Edit the skeleton,
then rebuild with build_assets.py.
"""
import os, re, sys

src_path, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(out_dir, 'assets'), exist_ok=True)
src = open(src_path, encoding='utf-8').read()

count = 0
def keep(m):
    global count
    key = f'{count:03d}'
    open(os.path.join(out_dir, 'assets', key + '.txt'), 'w', encoding='utf-8').write(m.group(0))
    count += 1
    return f'__ASSET_{key}__'

skel = re.sub(r'data:([a-zA-Z0-9/+.\-]+);base64,([A-Za-z0-9+/=]{500,})', keep, src)
lines = skel.split('\n')
for i, line in enumerate(lines):
    if len(line) > 1000:                     # raw base64 tables (vents, bodies, stingers)
        open(os.path.join(out_dir, 'assets', f'line_{i + 1}.txt'), 'w', encoding='utf-8').write(line)
        lines[i] = f'__BIGLINE_{i + 1}__'
open(os.path.join(out_dir, 'game.src.html'), 'w', encoding='utf-8').write('\n'.join(lines))
print(count, 'assets split out')
