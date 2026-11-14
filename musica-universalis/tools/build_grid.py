import json
from pathlib import Path
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "raw/Aerosols_2025-08-19T20_00_00_7680x4320.png"
OUT = ROOT / "public/data/grid.json"
DEBUG = ROOT / "raw/debug"
COLS, ROWS = 96, 48          # 7680/96 = 80 px, 4320/48 = 90 px por celda

# Matiz en escala 0-255 (PIL). Ajusta estos rangos viendo las máscaras.
# Cada capa: lista de rangos (h_min, h_max), saturación mínima, brillo mínimo
LAYERS = {
    "seasalt": {"hue": [(135, 175)], "s_min": 60, "v_min": 70},   # azul
    "dust":    {"hue": [(205, 240)], "s_min": 50, "v_min": 80},   # rosa/magenta
    "smoke":   {"hue": [(0, 28), (243, 255)], "s_min": 90, "v_min": 90},  # naranja/rojo
    "sulfate": {"hue": [(60, 110)], "s_min": 60, "v_min": 70},    # verde
}

def mask_for(h, s, v, cfg):
    m = np.zeros(h.shape, dtype=bool)
    for lo, hi in cfg["hue"]:
        m |= (h >= lo) & (h <= hi)
    return m & (s >= cfg["s_min"]) & (v >= cfg["v_min"])

def main():
    DEBUG.mkdir(parents=True, exist_ok=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "public/img").mkdir(parents=True, exist_ok=True)

    img = Image.open(SRC).convert("RGB")
    preview = img.copy()
    preview.thumbnail((1920, 1080), Image.Resampling.LANCZOS)
    preview.save(ROOT / "public/img/aerosols.jpg", quality=90)
    hsv = np.asarray(img.convert("HSV")).astype(np.int16)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    H, W = h.shape
    bh, bw = H // ROWS, W // COLS

    out = {"cols": COLS, "rows": ROWS, "source": "NASA SVS 5669 (GEOS, 2025-08-19 20:00 UTC)", "layers": {}}

    for name, cfg in LAYERS.items():
        m = mask_for(h, s, v, cfg)
        Image.fromarray((m * 255).astype(np.uint8)).resize((1280, 720)).save(DEBUG / f"mask_{name}.png")

        # Intensidad aproximada: saturación x brillo, solo donde hay máscara
        inten = (s / 255.0) * (v / 255.0) * m
        grid = inten[: bh * ROWS, : bw * COLS].reshape(ROWS, bh, COLS, bw).mean(axis=(1, 3))

        # Estirar contraste por percentiles
        hi = np.percentile(grid[grid > 0], 98) if (grid > 0).any() else 1.0
        grid = np.clip(grid / hi, 0, 1)
        out["layers"][name] = np.round(grid, 3).tolist()
        print(f"{name}: {m.mean()*100:.1f}% de píxeles, celdas activas: {(grid>0.05).sum()}")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f)
    print("Listo:", OUT)

if __name__ == "__main__":
    main()
