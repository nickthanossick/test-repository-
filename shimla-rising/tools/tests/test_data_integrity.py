"""data/ ke saare cross-references valid hain ya nahi.

Missions POIs ko point karte hain, POIs districts ko, dialogue characters ko.
Ek id ka typo bhi game mein silently toota mission ban jaata hai -- yahan pakdo.
"""
import json
from pathlib import Path

import pytest

DATA = Path(__file__).resolve().parents[2] / "data"
OBJECTIVE_TYPES = {"goto", "drive_to", "collect", "evade", "survive", "race"}


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def bundle():
    return {n: load(f"{n}.json") for n in
            ("pois", "districts", "missions", "characters", "vehicles", "dialogue", "roads")}


def test_poi_districts_exist(bundle):
    ids = {d["id"] for d in bundle["districts"]["districts"]}
    bad = [p["id"] for p in bundle["pois"]["pois"] if p["district"] not in ids]
    assert bad == []


def test_mission_references(bundle):
    pois = {p["id"] for p in bundle["pois"]["pois"]}
    chars = {c["id"] for c in bundle["characters"]["characters"]}
    missions = bundle["missions"]["missions"]
    ids = {m["id"] for m in missions}
    problems = []
    for m in missions:
        if m["giver"] not in chars:
            problems.append(f"{m['id']}: giver {m['giver']}")
        if m["start_poi"] not in pois:
            problems.append(f"{m['id']}: start_poi {m['start_poi']}")
        for u in m.get("unlocks", []):
            if u not in ids:
                problems.append(f"{m['id']}: unlocks {u}")
        for o in m["objectives"]:
            if o["type"] not in OBJECTIVE_TYPES:
                problems.append(f"{m['id']}/{o['id']}: unknown type {o['type']}")
            if "poi" in o and o["poi"] not in pois:
                problems.append(f"{m['id']}/{o['id']}: poi {o['poi']}")
            for c in o.get("checkpoints", []):
                if c not in pois:
                    problems.append(f"{m['id']}/{o['id']}: checkpoint {c}")
    assert problems == []


def test_every_story_mission_is_reachable(bundle):
    """a1_m1 se shuru karke har story mission unlock chain se milna chahiye."""
    missions = {m["id"]: m for m in bundle["missions"]["missions"]}
    seen, stack = set(), ["a1_m1"]
    while stack:
        mid = stack.pop()
        if mid in seen:
            continue
        seen.add(mid)
        stack.extend(missions[mid].get("unlocks", []))
    unreachable = [m["id"] for m in bundle["missions"]["missions"]
                   if not m.get("side") and m["id"] not in seen]
    assert unreachable == []


def test_dialogue_speakers_and_keys(bundle):
    chars = {c["id"] for c in bundle["characters"]["characters"]}
    missions = {m["id"] for m in bundle["missions"]["missions"]}
    problems = []
    for key, lines in bundle["dialogue"]["lines"].items():
        if not key.startswith("generic:") and key.split(":")[0] not in missions:
            problems.append(f"key {key}")
        for ln in lines:
            if ln["speaker"] not in chars:
                problems.append(f"{key}: speaker {ln['speaker']}")
    assert problems == []


def test_road_types_are_defined(bundle):
    types = set(bundle["roads"]["road_types"])
    bad = [r["id"] for r in bundle["roads"]["roads"] if r["type"] not in types]
    assert bad == []


def test_mall_road_is_pedestrian(bundle):
    """Game ka signature niyam: Mall Road pe gaadi ban hai. Asli Shimla jaisa."""
    mall = next(r for r in bundle["roads"]["roads"] if r["id"] == "the_mall")
    assert mall["type"] == "pedestrian"
    d = next(x for x in bundle["districts"]["districts"] if x["id"] == "the_mall")
    assert d["vehicle_restricted"] is True


def test_vehicles_have_sane_stats(bundle):
    for v in bundle["vehicles"]["vehicles"]:
        assert 60 <= v["top_speed_kmh"] <= 200, v["id"]
        assert 0.4 <= v["grip"] <= 1.5, v["id"]
        assert len(v["body"]) == 3, v["id"]
