"""Sanjauli ka structured naksha banata hai.

Aaj sadkein points ki ek lambi ladi hain, isliye "Negi Tea Stall ko chowk se
60 m aage baayein taraf lagao" kehna mumkin nahi tha. Yahan har sadak ka tukda
naam ke saath hai, aur uspe dukanon ke *slot* pehle se gine hue hain -- taaki
baad mein asli dukan apni asli jagah par lag sake.

Coordinates jo pakke nahi hain unpe accuracy "approx" hai. Precision gadhni
nahi hai -- pipeline chalne par asli OSM geometry inhe replace kar degi.
"""
import json
import math

M_PER_DEG_LAT = 110871.3
M_PER_DEG_LON = 95360.8

CHOWK = (31.1082, 77.1927)


def dist_m(a, b):
    dy = (b[0] - a[0]) * M_PER_DEG_LAT
    dx = (b[1] - a[1]) * M_PER_DEG_LON
    return math.hypot(dx, dy)


def length_m(pts):
    return sum(dist_m(pts[i - 1], pts[i]) for i in range(1, len(pts)))


SEGMENTS = [
    # Chowk se Dhalli -- NH-5 (Hindustan-Tibet Road). Sanjauli ka main bazaar
    # isi ke dono taraf hai.
    dict(id="chowk_dhalli", name="Sanjauli - Dhalli Road (NH-5)", road="nh5_east",
         type="arterial", width_m=12.5, oneway=False, accuracy="approx",
         points=[CHOWK, (31.1090, 77.1942), (31.1098, 77.1956), (31.1105, 77.1968),
                 (31.1113, 77.1982), (31.1121, 77.1996), (31.1128, 77.2010),
                 (31.1136, 77.2026), (31.1143, 77.2038), (31.1150, 77.2050)]),
    # Chowk se paschim -- 1852 wala single-lane tunnel, phir Lakkar Bazaar/Mall
    dict(id="chowk_tunnel", name="Sanjauli Tunnel Road", road="sanjauli_tunnel_road",
         type="arterial", width_m=12.5, oneway=False, accuracy="approx",
         points=[CHOWK, (31.1078, 77.1916), (31.1072, 77.1901), (31.1068, 77.1885),
                 (31.1063, 77.1868), (31.1058, 77.1849), (31.1054, 77.1830)]),
    # Chowk se neeche IGMC -- Nikhil ne kaha "neeche ka rasta IGMC ko jaega"
    dict(id="chowk_igmc", name="Sanjauli - IGMC Road", road="igmc_road",
         type="arterial", width_m=12.5, oneway=False, accuracy="approx",
         points=[CHOWK, (31.1074, 77.1912), (31.1066, 77.1893), (31.1058, 77.1872),
                 (31.1050, 77.1851), (31.1042, 77.1830), (31.1035, 77.1812),
                 (31.1033, 77.1808)]),
    # Chowk se dakshin -- Navbahar, jahan St. Bede's aur Buddy's hain
    dict(id="chowk_navbahar", name="Navbahar Road", road="navbahar_road",
         type="street", width_m=8.5, oneway=False, accuracy="approx",
         points=[CHOWK, (31.1060, 77.1912), (31.1030, 77.1896), (31.1000, 77.1878),
                 (31.0975, 77.1862), (31.0958, 77.1870), (31.0946, 77.1874)]),
    # Bazaar ki tang lane -- gaadi nahi, sirf paidal
    dict(id="bazaar_lane", name="Sanjauli Bazaar Lane", road="sanjauli_inner",
         type="lane", width_m=5.0, oneway=False, accuracy="approx",
         points=[CHOWK, (31.1086, 77.1935), (31.1090, 77.1942), (31.1095, 77.1949),
                 (31.1101, 77.1956), (31.1106, 77.1951)]),
    # Chowk se upar -- Upper Sanjauli ka rehaishi ilaaka aur Dhingu Mata
    dict(id="upper_sanjauli", name="Upper Sanjauli Road", road="upper_sanjauli",
         type="street", width_m=8.5, oneway=False, accuracy="approx",
         points=[CHOWK, (31.1090, 77.1924), (31.1098, 77.1920), (31.1107, 77.1918),
                 (31.1116, 77.1921), (31.1124, 77.1928)]),
    dict(id="dhingu_mata_road", name="Dhingu Mata Road", road="dhingu_mata_road",
         type="lane", width_m=5.0, oneway=False, accuracy="approx",
         points=[(31.1116, 77.1921), (31.1124, 77.1912), (31.1132, 77.1906),
                 (31.1140, 77.1903)]),
    dict(id="dhalli_bazaar", name="Dhalli Bazaar", road="dhalli_bazaar_road",
         type="street", width_m=8.5, oneway=False, accuracy="approx",
         points=[(31.1150, 77.2050), (31.1156, 77.2058), (31.1162, 77.2067),
                 (31.1168, 77.2076)]),
    # College ka rasta -- Nikhil: "college k raste ko left side se Sanjauli s
    # b connect kr dio".
    #
    # Ye `chowk_tunnel` se nikalta hai (wahi arterial jo Chowk se tunnel aur
    # Mall ko jaata hai), campus ke saamne se guzarta hai aur uske **baayen
    # pehlu** par gate par khatam hota hai -- wahi taraf jahan ARTS/B.COM/
    # LIBRARY wala neeche ka terrace hai.
    #
    # Bindu haath se nahi chune: campus ke apne local frame (u = daayen,
    # v = saamne, rukh `pois.json` ke facing_deg 40.699 se) mein rakhe gaye
    # aur wahan se lat/lon nikale. Isliye rasta campus ke aakaar ke saath
    # baithta hai, uske aar-paar nahi jaata:
    #     local(24,-45) (32,-44) (-8,-42) (-22,-39) (-34,-36 = gate)
    # Dhalan halki hai -- 65 m mein sirf 3 m, kyunki ye contour ke saath chalta
    # hai; seedha upar se aane wala rasta 40% ka hota, jo gaadi chadh hi na
    # paati.
    dict(id="college_road", name="Government College Road", road="gov_college_road",
         type="street", width_m=8.5, oneway=False, accuracy="approx",
         points=[(31.106943, 77.189071), (31.107028, 77.188938),
                 (31.107108, 77.188797), (31.107170, 77.188666),
                 (31.107220, 77.188550)]),
]

JUNCTIONS = [
    dict(id="sanjauli_chowk", name="Sanjauli Chowk", lat=CHOWK[0], lon=CHOWK[1],
         radius_m=17.0, accuracy="approx", island=True,
         arms=[dict(segment="chowk_dhalli", sign="DHALLI", km=4),
               dict(segment="chowk_igmc", sign="IGMC", km=2),
               dict(segment="chowk_tunnel", sign="THE MALL", km=3),
               dict(segment="chowk_navbahar", sign="NAVBAHAR", km=1)]),
    dict(id="dhalli_chowk", name="Dhalli Chowk", lat=31.1150, lon=77.2050,
         radius_m=13.0, accuracy="approx", island=False,
         arms=[dict(segment="chowk_dhalli", sign="SANJAULI", km=4),
               dict(segment="dhalli_bazaar", sign="KUFRI", km=12)]),
    dict(id="tunnel_mouth", name="Sanjauli Tunnel", lat=31.1068, lon=77.1885,
         radius_m=9.0, accuracy="approx", island=False,
         arms=[dict(segment="chowk_tunnel", sign="LAKKAR BAZAAR", km=2),
               dict(segment="college_road", sign="GOVT COLLEGE", km=0)]),
    dict(id="college_gate", name="Government College Gate", lat=31.107220,
         lon=77.188550, radius_m=8.0, accuracy="approx", island=False,
         arms=[dict(segment="college_road", sign="SANJAULI", km=1)]),
]

# Bazaar kis-kis tukde par ghana hai. (segment, kitne metre tak ghana, kul kitna)
SHOP_STRETCHES = [
    ("chowk_dhalli", 520, 1400),
    ("bazaar_lane", 260, 400),
    ("chowk_tunnel", 220, 340),
    ("dhalli_bazaar", 300, 420),
    # College ke gate ke bahar -- har Indian college ke bahar yahi hoti hain:
    # photocopy, stationery, chai aur momo. Mission 1-3 inhi ke beech chalte hain.
    #
    # Slot segment ke shuru se gine jaate hain aur gate uske *aakhir* mein hai
    # (t=1), isliye 58.8 m mein se sirf pehle 40 m -- warna dukanein theek gate
    # ke mooh par khadi ho jaati hain aur phaatak dikhta hi nahi.
    ("college_road", 40, 40),
]
FRONTAGE_M = 5.0


def build_slots():
    seg_by_id = {s["id"]: s for s in SEGMENTS}
    slots = []
    for seg_id, dense_m, total_m in SHOP_STRETCHES:
        seg = seg_by_id[seg_id]
        L = length_m(seg["points"])
        span = min(total_m, L)
        n = int(span // FRONTAGE_M)
        for i in range(n):
            d = (i + 0.5) * FRONTAGE_M
            for side, tag in ((-1, "L"), (1, "R")):
                slots.append(dict(
                    id=f"{seg_id}_{tag}_{i:03d}",
                    segment=seg_id,
                    t=round(d / L, 5),          # 0..1 segment par
                    side=side,                  # -1 baayein, +1 daayein
                    frontage_m=FRONTAGE_M,
                    dense=d <= dense_m,         # ghane hisse mein hai ya nahi
                    shop=None,                  # Nikhil yahan asli dukan ka id likhenge
                ))
    return slots


slots = build_slots()
doc = {
    "_comment": (
        "Sanjauli ka structured naksha. Har sadak ka tukda naam ke saath hai aur "
        "uspe dukanon ke slot pehle se gine hue hain, taaki baad mein asli dukan "
        "apni asli jagah par lag sake: shops.json mein 'slot' likh do. "
        "Coordinates abhi approx hain -- OSM is container se block hai (403). "
        "tools/shimla_pipeline --preset sanjauli chalane par asli geometry aayegi."
    ),
    "origin": {"lat": CHOWK[0], "lon": CHOWK[1], "name": "Sanjauli Chowk"},
    "source": "hand-authored",
    "segments": [dict(s, length_m=round(length_m(s["points"]), 1)) for s in SEGMENTS],
    "junctions": JUNCTIONS,
    "slots": slots,
}
with open("data/sanjauli.json", "w") as f:
    json.dump(doc, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"segments {len(SEGMENTS)}  junctions {len(JUNCTIONS)}  slots {len(slots)}")
for s in doc["segments"]:
    print(f"  {s['id']:18} {s['length_m']:7.1f} m  {s['type']}")
print("dense slots:", sum(1 for s in slots if s["dense"]))
