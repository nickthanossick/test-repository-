#!/usr/bin/env python3
"""Shared `data/` folder ko `godot/data/` mein copy karta hai.

Kyun zaroori hai
----------------
Web game `data/` ko seedha fetch kar leta hai (bas ek relative URL hai).
Godot aisa nahi kar sakta: export ke baad sirf wahi files pack mein jaati hain
jo `res://` ke andar hain, yaani `godot/` folder ke andar. Symlink bhi bharosemand
nahi -- Windows pe git symlinks default se off hain.

Isliye ek chhota sa explicit copy step. `godot/data/` gitignored hai, taaki
data ki do copies commit na hon aur sach hamesha ek hi jagah rahe: `data/`.

Chalao:
    python tools/sync_godot_data.py
    python tools/sync_godot_data.py --check     # sirf batao, copy mat karo
"""

from __future__ import annotations

import argparse
import filecmp
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data"
DST = ROOT / "godot" / "data"

# preview sirf insaan ke dekhne ke liye hai -- game build mein bhejne ka koi matlab nahi
SKIP = {"heightmap_preview.png"}


def files() -> list[Path]:
    return sorted(p for p in SRC.rglob("*")
                  if p.is_file() and p.name not in SKIP and "schema" not in p.parts)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true",
                    help="exit 1 agar sync ki zaroorat hai (CI ke liye)")
    args = ap.parse_args()

    if not SRC.is_dir():
        print(f"error: {SRC} nahi mila", file=sys.stderr)
        return 2

    stale, copied = [], 0
    for src in files():
        rel = src.relative_to(SRC)
        dst = DST / rel
        if dst.exists() and filecmp.cmp(src, dst, shallow=False):
            continue
        stale.append(str(rel))
        if not args.check:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            copied += 1

    # source se hataayi gayi files yahan se bhi hatao
    expected = {p.relative_to(SRC) for p in files()}
    for p in sorted(DST.rglob("*")) if DST.is_dir() else []:
        if p.is_file() and p.relative_to(DST) not in expected:
            stale.append(f"(extra) {p.relative_to(DST)}")
            if not args.check:
                p.unlink()

    if args.check:
        if stale:
            print("godot/data/ purana hai:\n  " + "\n  ".join(stale))
            print("\nchalao: python tools/sync_godot_data.py")
            return 1
        print(f"godot/data/ up to date ({len(files())} files)")
        return 0

    print(f"synced {copied} file(s) -> godot/data/  ({len(files())} total)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
