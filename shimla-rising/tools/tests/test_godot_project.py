"""Godot project ke structural checks.

Godot editor is container mein download nahi ho sakta (GitHub releases blocked),
isliye project run karke test nahi kar sakte. Par jo cheezein sabse zyada tootti
hain -- galat res:// path, load_steps ka mismatch, undefined resource reference,
GDScript indentation -- wo yahan pakdi ja sakti hain, aur yahi CI mein chalta hai.
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
GODOT = ROOT / "godot"
SCENES = sorted(GODOT.glob("scenes/*.tscn"))
SCRIPTS = sorted(GODOT.glob("scripts/*.gd"))


def test_project_file_exists():
    cfg = (GODOT / "project.godot").read_text(encoding="utf-8")
    assert "config_version=5" in cfg          # Godot 4
    assert 'run/main_scene="res://scenes/Main.tscn"' in cfg


@pytest.mark.parametrize("path", SCENES + SCRIPTS + [GODOT / "project.godot"],
                         ids=lambda p: p.name)
def test_res_paths_resolve(path):
    """Har res:// reference ka target repo mein maujood ho."""
    missing = []
    for ref in re.findall(r"res://[A-Za-z0-9_./-]+", path.read_text(encoding="utf-8")):
        rel = ref.removeprefix("res://")
        if rel.startswith("data/"):
            # sync_godot_data.py se aata hai; asli file data/ mein hai
            if not (ROOT / rel).exists():
                missing.append(ref)
        elif not (GODOT / rel).exists():
            missing.append(ref)
    assert missing == []


@pytest.mark.parametrize("scene", SCENES, ids=lambda p: p.name)
def test_scene_resource_bookkeeping(scene):
    s = scene.read_text(encoding="utf-8")
    declared = set(re.findall(r'^\[(?:ext|sub)_resource[^\]]*id="([^"]+)"', s, re.M))
    used = set(re.findall(r'(?:ExtResource|SubResource)\("([^"]+)"\)', s))
    assert used - declared == set(), "undefined resource reference"

    steps = int(re.search(r"load_steps=(\d+)", s).group(1))
    count = len(re.findall(r"^\[(ext_resource|sub_resource)", s, re.M))
    assert steps == count + 1, "load_steps galat hai"


@pytest.mark.parametrize("script", SCRIPTS, ids=lambda p: p.name)
def test_gdscript_uses_tabs(script):
    """GDScript tabs use karta hai. Space-indent chupa hua parse error deta hai."""
    bad = [i + 1 for i, ln in enumerate(script.read_text(encoding="utf-8").splitlines())
           if ln.startswith(" ") and ln.strip() and not ln.lstrip().startswith(("#", "##"))]
    assert bad == [], f"space-indented lines: {bad[:10]}"


@pytest.mark.parametrize("script", SCRIPTS, ids=lambda p: p.name)
def test_gdscript_balanced_brackets(script):
    s = script.read_text(encoding="utf-8")
    s = re.sub(r'"[^"\n]*"', '""', s)              # strings hata do
    s = re.sub(r"#.*", "", s)                       # comments hata do
    for open_c, close_c in [("(", ")"), ("[", "]"), ("{", "}")]:
        assert s.count(open_c) == s.count(close_c), f"unbalanced {open_c}{close_c}"


def test_autoloads_point_at_real_scripts():
    cfg = (GODOT / "project.godot").read_text(encoding="utf-8")
    block = cfg.split("[autoload]")[1].split("[")[0]
    names = re.findall(r'^(\w+)="\*(res://[^"]+)"', block, re.M)
    assert names, "koi autoload nahi mila"
    for _, ref in names:
        assert (GODOT / ref.removeprefix("res://")).exists(), ref


def test_shared_data_is_synced():
    """godot/data/ shared data/ ke saath sync mein ho."""
    import subprocess
    r = subprocess.run(["python3", str(ROOT / "tools" / "sync_godot_data.py"), "--check"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
