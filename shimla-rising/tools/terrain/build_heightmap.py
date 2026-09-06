#!/usr/bin/env python3
"""Shimla ka heightmap banata hai `data/terrain_control.json` ke asli landmark
elevations se.

Method
------
1. Regularised **thin-plate spline** (TPS) 45 control points se ek smooth surface
   nikaalta hai. Regularisation (lambda) TPS ko control points ke beech overshoot
   karne se rokta hai -- bina iske pahadon mein ajeeb spike aa jaate hain.
2. Uske upar **fBm value-noise** daala jaata hai, jiska amplitude slope ke hisaab se
   badhta hai. Isse dhalanon pe asli pahadi texture aati hai, aur valley/maidan
   (jaise Annandale) samtal rehte hain.
3. Output do formats mein:
   * `heightmap.png`     -- RGB8, R = high byte, G = low byte. Browser <canvas>
                            sirf 8-bit deta hai, isliye 16-bit precision do channels
                            mein pack ki hai. Web game yahi padhta hai.
   * `heightmap_16.png`  -- asli 16-bit grayscale. Godot, Blender, QGIS ke liye.
   * `heightmap_preview.png` -- hillshaded colour preview, sirf insaan ke dekhne ke liye.

NOTE: Ye landmark-accurate *approximation* hai, survey-grade DEM nahi. Asli
Copernicus GLO-30 satellite terrain ke liye `tools/shimla_pipeline/` chalao --
wo isi format mein output likhta hai, toh dono games apne aap upgrade ho jaate hain.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shimla_common.geo import GeoReference  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"


# ------------------------------------------------------- interpolation (bounded)


def _box_blur(a, radius):
    """Separable box blur via cumsum. Teen baar lagao to Gaussian jaisa ho jaata hai."""
    if radius < 1:
        return a
    k = 2 * radius + 1
    pad = np.pad(a, radius, mode="edge")
    c = np.cumsum(pad, axis=0)
    a = (c[k - 1:, :] - np.pad(c[:-k, :], ((1, 0), (0, 0)))) / k
    c = np.cumsum(a, axis=1)
    a = (c[:, k - 1:] - np.pad(c[:, :-k], ((0, 0), (1, 0)))) / k
    return a


def gaussian_blur(a, radius):
    for _ in range(3):
        a = _box_blur(a, radius)
    return a


def adaptive_sigma(px, pz, neighbours=3, lo=0.25, hi=0.90):
    """Har control point ke liye bandwidth (km), uske padosiyon ki doori se."""
    n = len(px)
    d = np.hypot(px[:, None] - px[None, :], pz[:, None] - pz[None, :])
    d.sort(axis=1)
    return np.clip(d[:, min(neighbours, n - 1)], lo, hi)


def idw(px, pz, ph, gx, gz, sig, eps2=9e-4, chunk=64):
    """Gaussian-tapered inverse-distance weighting (coords km mein).

    w = exp(-r^2 / 2s^2) / (r^2 + eps^2)

    Do wajah se yahi:
      * 1/(r^2+eps) ki wajah se control point pe value *exact* aati hai (eps ~ 30 m),
        jo pure Gaussian Shepard nahi de paata tha -- wo Jakhoo ko 400 m neeche kheench raha tha.
      * exp(-r^2/2s^2) door ke points ka asar kaat deta hai, isliye har pahadi apna
        character rakhti hai instead of poore map ka average ban jaane ke.
    Output hamesha min(ph)..max(ph) ke andar rehta hai -- TPS jaisi ringing nahi.
    """
    out = np.empty(gx.shape, dtype=np.float64)
    for i in range(0, gx.shape[0], chunk):
        sl = slice(i, min(i + chunk, gx.shape[0]))
        r2 = (gx[sl][..., None] - px) ** 2 + (gz[sl][..., None] - pz) ** 2
        w = np.exp(-r2 / (2.0 * sig * sig)) / (r2 + eps2)
        out[sl] = (w @ ph) / w.sum(axis=-1)
    return out


def sample_at(field, geo, px_km, pz_km, size):
    """Grid field ko control-point locations pe sample karo."""
    c = np.clip(((px_km * 1000 + geo.half_m) / geo.world_size_m * (size - 1)).round().astype(int), 0, size - 1)
    r = np.clip(((pz_km * 1000 + geo.half_m) / geo.world_size_m * (size - 1)).round().astype(int), 0, size - 1)
    return field[r, c]


# --------------------------------------------------------------- noise (spectral)


def spectral_noise(size, beta, rng, fmin=0.0, fmax=0.5, ridged=False):
    """Fractal noise via FFT spectral synthesis.

    White noise -> FFT -> 1/f^beta se scale -> inverse FFT.

    Lattice-based value/Perlin noise ki jagah yeh isliye: uska grid axis-aligned
    quilting paida karta tha jo hillshade mein saaf dikhti thi. Spectral synthesis
    poori tarah isotropic hai -- koi preferred direction nahi, koi seam nahi.

    beta  ~2.4 = mulayam pahadiyan,  ~1.7 = rukhad chattan
    fmin/fmax band-pass (cycles per pixel) -- alag-alag scale ke feature ke liye.
    """
    F = np.fft.fft2(rng.standard_normal((size, size)))
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.fftfreq(size)[None, :]
    f = np.hypot(fx, fy)
    f[0, 0] = 1.0

    amp = f ** (-beta / 2.0)
    amp[(f < fmin) | (f > fmax)] = 0.0
    amp[0, 0] = 0.0

    n = np.real(np.fft.ifft2(F * amp))
    n = (n - n.mean()) / (n.std() + 1e-12)
    n = np.clip(n * 0.23 + 0.5, 0.0, 1.0)
    if ridged:
        n = 1.0 - np.abs(2.0 * n - 1.0)
    return n


def ridged_multifractal(size, m_per_px, rng, lambda0_m=2400.0, octaves=6,
                        H=0.92, gain=1.9):
    """Ridged multifractal, spectral bands ke upar bana hua.

    Har octave ko alag se ridge kiya jaata hai (1 - |2n-1|), aur agla octave
    pichle se *multiply* hota hai. Yahi multiplicative weighting asli pahadon
    wali dendritic ridge-line aur drainage deti hai.

    Seedha ek band-passed field ko ridge karne se sirf alag-alag "worm" jaise
    blob bante hain -- ridges aapas mein judte hi nahi.
    """
    result = np.zeros((size, size))
    weight = np.ones((size, size))
    lam, total = lambda0_m, 0.0
    for i in range(octaves):
        f_lo = m_per_px / (lam * 1.7)
        f_hi = min(m_per_px / (lam * 0.65), 0.45)
        if f_lo >= f_hi:
            break
        n = spectral_noise(size, beta=2.0, rng=rng, fmin=f_lo, fmax=f_hi)
        sig = (1.0 - np.abs(2.0 * n - 1.0)) ** 2
        sig *= np.clip(weight, 0.0, 1.0)
        amp = 0.5 ** (i * H)
        result += sig * amp
        total += amp
        weight = sig * gain
        lam *= 0.5
    result /= total
    return (result - result.min()) / (np.ptp(result) + 1e-9)


# -------------------------------------------------------------------------- main


def build(size: int, lam: float, detail_m: float, seed: int, quiet: bool = False):
    """Terrain synthesise karo. Teen layer:
    base (asli landmark elevations) + ridges (domain-warped ridged fBm) + khad carving.
    """
    geo = GeoReference.load()
    ctrl = json.loads((DATA / "terrain_control.json").read_text(encoding="utf-8"))
    pts = ctrl["points"]

    px, pz, ph = [], [], []
    for p in pts:
        x, z = geo.to_world(p["lat"], p["lon"])
        px.append(x / 1000.0)          # km
        pz.append(z / 1000.0)
        ph.append(float(p["elev"]))
    px, pz, ph = np.array(px), np.array(pz), np.array(ph)

    half_km = geo.half_m / 1000.0
    axis = np.linspace(-half_km, half_km, size)
    gx, gz = np.meshgrid(axis, axis)       # row 0 = north (z=-half), col 0 = west (x=-half)

    sig = adaptive_sigma(px, pz)
    base = idw(px, pz, ph, gx, gz, sig)

    m_per_px = geo.world_size_m / (size - 1)
    rng = np.random.default_rng(seed)

    # --- ridged multifractal (bade ridge) + ek mahin texture band ---------
    ridge = ridged_multifractal(size, m_per_px, rng, lambda0_m=2600.0, octaves=6)
    fine = spectral_noise(size, beta=1.9, rng=rng,
                          fmin=m_per_px / 260.0, fmax=min(m_per_px / 45.0, 0.45)) - 0.5

    # --- detail ko slope se modulate karo --------------------------------
    dzdy, dzdx = np.gradient(base, m_per_px)
    slope_w = np.clip(np.hypot(dzdx, dzdy) / 0.30, 0.0, 1.0) ** 0.7
    relief = 0.30 + 0.70 * slope_w        # maidan (Annandale) shaant, dhalan rugged

    h = base + detail_m * relief * (ridge - 0.5) * 2.0 + detail_m * 0.30 * relief * fine

    # --- khad carving: nichli jagah gehri aur V-shaped --------------------
    depth = np.clip((base - geo.elev_min_m) / (geo.elev_max_m - geo.elev_min_m), 0, 1)
    h -= detail_m * 1.1 * (1.0 - ridge) ** 2 * (1.0 - depth) ** 1.5

    h = gaussian_blur(h, 1)

    # --- residual correction: asli landmark elevations wapas exact karo ---
    # Detail aur carving ne control points ko hila diya hoga. Yahan error naapo
    # aur usi IDW kernel se ek smooth correction field banakar wapas jodo --
    # isse texture bani rehti hai par Jakhoo phir se theek 2455 m pe aata hai.
    for _ in range(2):
        resid = ph - sample_at(h, geo, px, pz, size)
        # correction ke liye chaudi bandwidth -- warna har point pe bullseye ban jaata hai
        h = h + idw(px, pz, resid, gx, gz, sig * 2.6, eps2=6e-3)

    h = np.clip(h, geo.elev_min_m, geo.elev_max_m)

    # --- report: asli landmarks kitne bache -------------------------------
    errs = []
    for p in pts:
        x, z = geo.to_world(p["lat"], p["lon"])
        c = int(np.clip(round((x + geo.half_m) / geo.world_size_m * (size - 1)), 0, size - 1))
        r = int(np.clip(round((z + geo.half_m) / geo.world_size_m * (size - 1)), 0, size - 1))
        errs.append((p["id"], p["kind"], float(h[r, c]) - p["elev"]))
    lm = [e for e in errs if e[1] == "landmark"]
    worst = max(lm, key=lambda e: abs(e[2]))

    if not quiet:
        print(f"grid {size}x{size}  ({m_per_px:.2f} m/px)")
        print(f"elevation: {h.min():.0f} .. {h.max():.0f} m")
        print(f"landmark error: mean |dh| = {np.mean([abs(e[2]) for e in lm]):.1f} m, "
              f"worst = {worst[0]} {worst[2]:+.1f} m")

    return geo, h, m_per_px, errs


def encode(geo, h, size, m_per_px, out_dir: Path):
    lo, hi = geo.elev_min_m, geo.elev_max_m
    norm = np.clip((h - lo) / (hi - lo), 0.0, 1.0)
    u16 = np.round(norm * 65535).astype(np.uint16)

    # 16-bit grayscale -- Godot / Blender / QGIS
    Image.fromarray(u16).save(out_dir / "heightmap_16.png", optimize=True)

    # RGB8 packed -- browser canvas sirf 8-bit deta hai
    rgb = np.zeros((size, size, 3), dtype=np.uint8)
    rgb[..., 0] = (u16 >> 8).astype(np.uint8)
    rgb[..., 1] = (u16 & 0xFF).astype(np.uint8)
    Image.fromarray(rgb, mode="RGB").save(out_dir / "heightmap.png", optimize=True)

    # hillshaded preview -- sirf dekhne ke liye, game isse nahi padhta
    dy, dx = np.gradient(h, m_per_px)
    slope = np.arctan(np.hypot(dx, dy))
    aspect = np.arctan2(dy, -dx)
    az, alt = np.radians(315.0), np.radians(45.0)
    zen = np.pi / 2 - alt
    shade = np.clip(np.cos(zen) * np.cos(slope)
                    + np.sin(zen) * np.sin(slope) * np.cos(az - aspect), 0, 1)
    stops = np.array([[0.30, 0.42, 0.28], [0.42, 0.52, 0.30], [0.55, 0.55, 0.36],
                      [0.62, 0.55, 0.42], [0.72, 0.70, 0.66], [0.95, 0.95, 0.97]])
    t = norm * (len(stops) - 1)
    i0 = np.clip(t.astype(int), 0, len(stops) - 2)
    f = (t - i0)[..., None]
    col = stops[i0] * (1 - f) + stops[i0 + 1] * f
    prev = np.clip(col * (0.35 + 0.75 * shade[..., None]), 0, 1)
    Image.fromarray((prev * 255).astype(np.uint8)).save(out_dir / "heightmap_preview.png")

    meta = {
        "$comment": "tools/terrain/build_heightmap.py se generate hua. Haath se edit mat karo.",
        "size_px": size,
        "world_size_m": geo.world_size_m,
        "metres_per_pixel": round(m_per_px, 4),
        "elevation_min_m": lo,
        "elevation_max_m": hi,
        "source": "terrain_control.json (landmark IDW interpolation + ridged multifractal detail)",
        "files": {
            "heightmap.png": "RGB8. elevation = min + ((R*256 + G) / 65535) * (max - min). Web game.",
            "heightmap_16.png": "16-bit grayscale, same normalisation. Godot / Blender / GIS.",
            "heightmap_preview.png": "Hillshaded colour preview. Sirf dekhne ke liye.",
        },
        "orientation": "row 0 = north edge (z = -half), col 0 = west edge (x = -half)",
        "godot_import": {
            "$comment": "Godot HeightMapShape3D / ArrayMesh ke liye seedhe metre values.",
            "height_scale_m": hi - lo,
            "height_offset_m": lo,
        },
    }
    (out_dir / "terrain.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    _write_profile(geo, h, size, out_dir)
    return meta


def _write_profile(geo, h, size, out_dir: Path):
    """Jakhoo ki latitude par poorv-pashchim elevation cross-section.

    Loading screen isse dikhata hai. Ye asli profile hai heightmap se nikala
    hua -- sajaavat nahi -- isliye terrain badle to ye bhi apne aap badal jaata hai.
    """
    jak_lat, jak_lon = 31.0999, 77.1836
    _, jz = geo.to_world(jak_lat, jak_lon)
    row = int(np.clip(round((jz + geo.half_m) / geo.world_size_m * (size - 1)), 0, size - 1))
    prof = h[row, :]

    n_samples, vb_w, top, bot = 260, 1000.0, 12.0, 148.0
    idx = np.linspace(0, size - 1, n_samples).astype(int)
    vals = prof[idx]
    xs = np.linspace(0.0, vb_w, n_samples)
    ys = bot - (vals - geo.elev_min_m) / (geo.elev_max_m - geo.elev_min_m) * (bot - top)
    line = " ".join(f"{x:.1f} {y:.1f}" for x, y in zip(xs, ys))

    labels = []
    for name, lon in [("Summer Hill", 77.1470), ("The Ridge", 77.1734),
                      ("Jakhoo", 77.1836), ("Dhalli", 77.2050)]:
        x_m = (lon - geo.origin_lon) * geo.m_per_deg_lon
        if abs(x_m) > geo.half_m:
            continue
        col = int(np.clip(round((x_m + geo.half_m) / geo.world_size_m * (size - 1)), 0, size - 1))
        labels.append({
            "name": name,
            "x": round((x_m + geo.half_m) / geo.world_size_m * vb_w, 1),
            "y": round(bot - (prof[col] - geo.elev_min_m)
                       / (geo.elev_max_m - geo.elev_min_m) * (bot - top), 1),
            "elev": int(round(float(prof[col]))),
        })

    (out_dir / "profile.json").write_text(json.dumps({
        "$comment": "build_heightmap.py se generate hua. Shimla ka asli poorv-pashchim "
                    "cross-section, Jakhoo ki latitude par. viewBox 0 0 1000 160.",
        "viewbox": [1000, 160],
        "fill": f"M0 {bot} L{line} L{vb_w} {bot} Z",
        "line": f"M{line}",
        "labels": labels,
    }, indent=1) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Shimla heightmap generator")
    ap.add_argument("--size", type=int, default=1024, help="heightmap resolution (px)")
    ap.add_argument("--lambda", dest="lam", type=float, default=0.0,
                    help="base smoothing bandwidth bump (km); zyada = zyada smooth")
    ap.add_argument("--detail", type=float, default=78.0,
                    help="fractal detail amplitude (metres) dhalanon pe")
    ap.add_argument("--seed", type=int, default=311048, help="noise seed (Shimla ke coords se)")
    ap.add_argument("--out", type=Path, default=DATA)
    args = ap.parse_args()

    geo, h, mpp, _ = build(args.size, args.lam, args.detail, args.seed)
    args.out.mkdir(parents=True, exist_ok=True)
    meta = encode(geo, h, args.size, mpp, args.out)
    print("wrote:", ", ".join(sorted(meta["files"])), "+ terrain.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
