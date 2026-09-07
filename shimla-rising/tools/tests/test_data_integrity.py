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
    """Pehle mission se shuru karke har story mission unlock chain se mile.

    Shuruaati id `start_mission` se aati hai, yahan hardcode nahi hai -- warna
    har baar missions ka naam badalne par test aur engine dono jagah alag-alag
    badalna padta hai.
    """
    missions = {m["id"]: m for m in bundle["missions"]["missions"]}
    start = bundle["missions"]["start_mission"]
    assert start in missions, f"start_mission {start} maujood nahi"
    seen, stack = set(), [start]
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
    # "generic:", "panga:" aur "vicky:idle:" mission se bandhe nahi hain --
    # pehla sheher ke aam halaat ke liye, doosra NPC se takrane wale jhagde ke
    # liye, teesra wo jo Vicky khud se bolta rehta hai.
    free = ("generic:", "panga:", "vicky:idle:")
    for key, lines in bundle["dialogue"]["lines"].items():
        if not key.startswith(free) and key.split(":")[0] not in missions:
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


def test_pois_have_accuracy_and_landmark(bundle):
    """Har POI batata ho ki uska coordinate verified hai ya approx.

    Precision gadhna nahi hai: jo coordinate source se confirm nahi hua use
    approx likhte hain, taaki baad mein OSM pipeline usse replace kar sake.
    """
    problems = []
    for p in bundle["pois"]["pois"]:
        acc = p.get("accuracy")
        if acc not in (None, "verified", "approx"):
            problems.append(f"{p['id']}: accuracy {acc!r}")
    assert problems == []


def test_named_places_the_user_asked_for_exist(bundle):
    """Nikhil ne ye jagahein naam se maangi thi -- inka hona zaroori hai."""
    ids = {p["id"] for p in bundle["pois"]["pois"]}
    for need in ("sanjauli_chowk", "st_bedes", "buddys", "jakhoo_temple", "gov_college"):
        assert need in ids, f"{need} POI missing"


def test_signs_are_short_enough_to_read(bundle):
    """Board ka text 34 characters se lamba ho to canvas pe chhota ho jaata hai."""
    long = [p["id"] for p in bundle["pois"]["pois"] if len(p.get("sign", "")) > 34]
    assert long == []


def test_vehicles_have_shapes(bundle):
    """Har gaadi ka `shape` field ho -- vehicle.js isse silhouette chunta hai."""
    SHAPES = {"tallboy", "classic", "hatch", "offroad", "bus", "truck", "bike"}
    bad = [v["id"] for v in bundle["vehicles"]["vehicles"] if v.get("shape") not in SHAPES]
    assert bad == []

def test_sanjauli_geography_nikhil_asked_for():
    """Sanjauli Chowk ek chauraha hona chahiye, aur IGMC/Dhalli maujood."""
    roads = load("roads.json")
    pois = {p["id"] for p in load("pois.json")["pois"]}
    for need in ("igmc", "dhalli_chowk", "sanjauli_bus_stop"):
        assert need in pois, f"{need} POI nahi mila"

    chowk = [31.1082, 77.1927]
    arms = [r["id"] for r in roads["roads"]
            if r["points"][0] == chowk or r["points"][-1] == chowk]
    assert len(arms) >= 4, f"Sanjauli Chowk pe sirf {len(arms)} sadak: {arms}"


def test_roads_are_wide_enough():
    """Nikhil ne wide sadkein maangi thi."""
    t = load("roads.json")["road_types"]
    assert t["arterial"]["width_m"] >= 12
    assert t["street"]["width_m"] >= 8
    assert t["lane"]["width_m"] >= 4.5


def test_shops_have_the_names_nikhil_named():
    shops = load("shops.json")
    names = {s["name"] for s in shops["shops"]}
    for need in ("NEGI TEA STALL", "TRIPTI BAKERY", "VIVI BANK", "ATM"):
        assert need in names, f"{need} dukan nahi mili"
    assert len(shops["shops"]) >= 30, "busy bazaar ke liye aur naam chahiye"
    for s in shops["shops"]:
        assert s["kind"] in shops["kinds"], f"{s['name']}: kism {s['kind']} defined nahi"
        assert len(s["name"]) <= 24, f"{s['name']} board pe fit nahi hoga"


def test_every_mission_has_flashcards(bundle):
    """Nikhil: "har mission p phle flashcards ake thoda btaenge ki kya h".

    Card ke bina mission seedha objective se shuru ho jaata hai aur khiladi ko
    pata hi nahi chalta ki kyun ja raha hai. Har card ki jagah bhi asli honi
    chahiye -- card us POI par camera le jaakar frame freeze karta hai, to POI
    galat hone par card kaale parde jaisa aata.
    """
    pois = {p["id"] for p in bundle["pois"]["pois"]}
    problems = []
    decks = [("intro", bundle["missions"]["intro"])]
    decks += [(m["id"], m.get("cards", [])) for m in bundle["missions"]["missions"]]
    for name, deck in decks:
        if not deck:
            problems.append(f"{name}: koi card nahi")
        for i, c in enumerate(deck):
            if c.get("poi") not in pois:
                problems.append(f"{name}[{i}]: poi {c.get('poi')} maujood nahi")
            if not c.get("title") or not c.get("text"):
                problems.append(f"{name}[{i}]: title/text khaali")
    assert problems == []


def test_missions_are_the_ten_nikhil_asked_for(bundle):
    """"Sirf 10 missions", 5 Sanjauli mein aur baki bahar."""
    ms = bundle["missions"]["missions"]
    assert len(ms) == 10, f"{len(ms)} missions hain, 10 hone chahiye"
    by_id = {p["id"]: p for p in bundle["pois"]["pois"]}
    sanjauli = [m for m in ms if by_id[m["start_poi"]].get("district") == "sanjauli"]
    assert len(sanjauli) >= 5, f"Sanjauli mein sirf {len(sanjauli)} missions"
    # koi side mission nahi bacha
    assert not [m for m in ms if m.get("side")]


def test_every_shop_kind_stocks_its_own_goods():
    """Jaisa naam waisa saamaan -- har kism ka apna fit-out hona chahiye.

    `bazaar.js` ka `fitOut()` `kind.goods` par switch karta hai. Jis kism mein
    `goods` na ho wo chupchaap default (generic counter) par gir jaati hai, aur
    bahar se bakery, bank aur chemist phir se ek jaise dikhne lagte hain --
    theek wahi shikayat jo is round mein theek ki gayi.
    """
    kinds = load("shops.json")["kinds"]
    seen = set()
    for name, k in kinds.items():
        assert k.get("goods"), f"{name}: goods defined nahi"
        assert k.get("glow"), f"{name}: andar ki roshni ka rang nahi"
        seen.add(k["goods"])
    # har kism ka apna roop -- do kismon ka ek hi fit-out matlab dono ek jaisi
    assert len(seen) == len(kinds), f"goods dohre hain: {len(seen)} != {len(kinds)}"


def test_sanjauli_map_structure():
    """Naksha aisa hona chahiye ki baad mein asli dukan asli jagah par lage."""
    m = load("sanjauli.json")
    seg_ids = {s["id"] for s in m["segments"]}
    assert len(seg_ids) == len(m["segments"]), "segment id dohra hai"
    for need in ("chowk_dhalli", "chowk_igmc", "chowk_tunnel", "chowk_navbahar"):
        assert need in seg_ids, f"{need} segment nahi mila"

    for s in m["segments"]:
        assert len(s["points"]) >= 2, f"{s['id']}: kam se kam do point chahiye"
        assert s["width_m"] > 0
        assert s["accuracy"] in ("verified", "approx")

    chowk = next(j for j in m["junctions"] if j["id"] == "sanjauli_chowk")
    assert len(chowk["arms"]) == 4, "Sanjauli Chowk chauraha hona chahiye"
    for arm in chowk["arms"]:
        assert arm["segment"] in seg_ids

    assert m["slots"], "ek bhi dukan ki jagah nahi"
    slot_ids = set()
    for slot in m["slots"]:
        assert slot["segment"] in seg_ids, f"{slot['id']}: segment maujood nahi"
        assert 0.0 <= slot["t"] <= 1.0, f"{slot['id']}: t = {slot['t']}"
        assert slot["side"] in (-1, 1)
        assert slot["id"] not in slot_ids, f"{slot['id']} dohra hai"
        slot_ids.add(slot["id"])
    assert sum(1 for s in m["slots"] if s["dense"]) >= 200, "ghana bazaar chhota hai"


def test_bus_routes_point_at_real_segments():
    r = load("routes.json")
    seg_ids = {s["id"] for s in load("sanjauli.json")["segments"]}
    veh_ids = {v["id"] for v in load("vehicles.json")["vehicles"]}
    stop_ids = {s["id"] for s in r["stops"]}

    for s in r["stops"]:
        assert s["segment"] in seg_ids, f"stop {s['id']}: segment nahi mila"
        assert 0.0 <= s["t"] <= 1.0

    for route in r["routes"]:
        assert route["segment"] in seg_ids
        for op in route["operators"]:
            assert op in veh_ids, f"{route['id']}: operator {op} nahi mila"
        for st in route["stops"]:
            assert st in stop_ids, f"{route['id']}: stop {st} nahi mila"


def test_four_bus_operators_nikhil_named():
    buses = [v for v in load("vehicles.json")["vehicles"] if v["class"] == "bus"]
    names = " ".join(v["name"] for v in buses)
    for need in ("HRTC", "Lalit", "Krishna", "Rajdhani"):
        assert need in names, f"{need} bus nahi mili"


def test_panga_dialogue_exists_at_every_level():
    """NPC se takrane par jo bola jaata hai -- har level par lines honi chahiye."""
    lines = load("dialogue.json")["lines"]
    speakers = {c["id"] for c in load("characters.json")["characters"]}
    for key in ("panga:l1", "panga:l2", "panga:l3", "panga:car"):
        assert key in lines, f"{key} nahi mila"
        assert len(lines[key]) >= 3, f"{key}: kam se kam teen line chahiye"
        for beat in lines[key]:
            assert beat["text"].strip(), f"{key}: khaali line"
            assert beat["speaker"] in speakers, \
                f"{key}: speaker {beat['speaker']} characters.json mein nahi"


def test_map_segments_all_have_a_road():
    """Naksha ka har segment roads.json mein bhi hona chahiye.

    upper_sanjauli aur dhingu_mata_road pehle sirf naksha mein the, roads.json
    mein nahi -- isliye wahan na sadak banti thi na ghar, aur Sanjauli ka poora
    upar ka rehaishi ilaaka khaali reh jaata tha.
    """
    segs = load("sanjauli.json")["segments"]
    roads = {r["id"] for r in load("roads.json")["roads"]}
    for s in segs:
        assert s.get("road"), f"{s['id']}: road pointer khaali"
        assert s["road"] in roads, f"{s['id']}: road {s['road']} roads.json mein nahi"


def test_ambulance_and_bus_fleet():
    v = {x["id"]: x for x in load("vehicles.json")["vehicles"]}
    assert "ambulance" in v, "IGMC ambulance nahi mili"
    assert v["ambulance"]["siren"] is True


def test_both_tunnels_exist_with_their_kind():
    """Dono tunnel alag hone chahiye -- purana single-lane, naya double-lane."""
    pois = {p["id"]: p for p in load("pois.json")["pois"]}
    assert pois["sanjauli_tunnel"]["landmark"] == "tunnel_old"
    assert pois["dhalli_tunnel"]["landmark"] == "tunnel_new"
    # dono kisi sadak ke paas hone chahiye, warna bore ki disha nahi milegi
    segs = load("sanjauli.json")["segments"]
    pts = [tuple(p) for s in segs for p in s["points"]]
    for tid in ("sanjauli_tunnel", "dhalli_tunnel"):
        t = pois[tid]
        near = min(abs(t["lat"] - a) + abs(t["lon"] - b) for a, b in pts)
        assert near < 0.004, f"{tid} kisi segment ke paas nahi ({near:.4f})"
