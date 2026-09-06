# Pipeline — asli Shimla ka data

Repo mein jo terrain aata hai wo 45 asli landmark elevations se interpolate kiya
gaya hai. Shimla ka **aakar** sahi hai (Jakhoo peak, ridge, khad), par ye
survey-grade nahi hai.

Ye pipeline usse asli satellite DEM aur asli OpenStreetMap data se badal deti
hai — **usi format mein**, isliye web game aur Godot dono apne aap upgrade ho
jaate hain. Koi code badalna nahi padta.

---

## Chalao

```bash
pip install -r tools/requirements.txt

# 1. OpenTopography ki free API key lo:
#    https://portal.opentopography.org/ -> account banao -> My Account -> API key
export OPENTOPOGRAPHY_API_KEY=xxxxxxxx

# 2. pipeline chalao
python -m shimla_pipeline.run --preset shimla_core

# 3. dono engines ko naya data do
python tools/sync_godot_data.py
```

Options:

```bash
python -m shimla_pipeline.run --list-presets
python -m shimla_pipeline.run --only roads          # sirf OSM sadkein refresh
python -m shimla_pipeline.run --force               # cache ignore karo
python -m shimla_pipeline.run --preset shimla_extended   # 16.4 km, Kufri sameta
```

Downloads `tools/.cache/` mein cache hoti hain (gitignored) — dobara chalane pe
network hit nahi hoti.

---

## Kya hota hai

### 1. Copernicus GLO-30 DEM → `data/heightmap.png`

`fetch_dem.py` OpenTopography ke `globaldem` API se `COP30` GeoTIFF laata hai
preset ke bounding box ke liye.

`dem_to_heightmap.py` usse padhta hai (GeoTIFF khud parse karta hai — rasterio/
GDAL ki zaroorat nahi), world grid pe bilinear resample karta hai, aur do PNG
likhta hai:

- `heightmap.png` — RGB8, R = high byte, G = low byte. **Web game yahi padhta
  hai**, kyunki browser `<canvas>` sirf 8-bit deta hai.
- `heightmap_16.png` — asli 16-bit grayscale. Godot, Blender, QGIS ke liye.

`terrain.json` mein exact elevation range likh deta hai, aur `georeference.json`
ko bhi sync kar deta hai.

### 2. OpenStreetMap → `data/roads.json`

`fetch_osm.py` Overpass API se query karta hai (do mirrors, retry ke saath):
`highway`, `railway`, `building`, aur POI nodes.

`osm_to_roads.py` OSM ke `highway=*` ko game ke road types pe map karta hai.
25 m se chhoti ways chhod deta hai.

**Ek zaroori override:** Mall Road ko zabardasti `pedestrian` banaya jaata hai.
OSM mein uske kuch hisse `service`/`residential` tagged hote hain (delivery
access ki wajah se) — agar wo game mein drivable ho gaye to wanted system ka
sabse pehchana niyam hi toot jaata hai.

### 3. OSM footprints → `data/footprints.json`

`osm_to_footprints.py` building polygons nikalta hai, `building:levels` se
oonchai anumaan lagata hai, aur **har footprint ke chaaron kone ki zameen ki
oonchai** bhi nikalta hai. Shimla mein ghar dhalan pe stepped hote hain, aur
Blender script us drop se plinth banata hai.

---

## Ek imaandaar limitation

Copernicus GLO-30 ka posting **30 m** hai. `shimla_core` (8.2 km) ke liye wo
~271×271 samples hain, jinhe 1024×1024 tak upsample karna padta hai — 3.8×.
`shimla_extended` (16.4 km) pe ye behtar hai (~2.7×).

Iska matlab: DEM se aane wala terrain **asli hoga par mulayam hoga.** 30 m se
chhoti detail — ek gali ka cutting, ek retaining wall, ek nala — usme hai hi
nahi.

Shimla ke liye free mein 1–5 m DEM public available nahi hai. Vikalp:

- **Ise sweekar karo** — ridge aur valley sahi jagah pe honge, jo gameplay ke
  liye sabse zaroori hai.
- **Detail wapas daalo** — `build_heightmap.py` ka ridged-multifractal wala
  hissa DEM ke upar bhi chal sakta hai.
- **Erosion tool** — Gaea, World Creator ya Godot ke terrain plugins se
  `heightmap_16.png` ko refine karo, phir wapas isi format mein export karo.

---

## Blender assets

Dekho [tools/blender/README.md](../tools/blender/README.md).

---

## Attribution

OSM data **ODbL** hai aur Copernicus DEM ki apni shartein hain — dono ke liye
attribution zaroori hai agar tum build distribute karte ho.
Dekho [design/08-legal-and-attribution.md](../design/08-legal-and-attribution.md).
