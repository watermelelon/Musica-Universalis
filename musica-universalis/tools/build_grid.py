"""
Musica Universalis: preprocesado de la imagen de aerosoles (NASA SVS 5669).

Salidas:
  public/data/grid.json         malla gruesa (barrido) + metadatos + zonas "puras"
  public/data/fine/<esp>.png    malla FINA, 8 bits por especie (hover y zoom)
  public/img/aerosols.jpg       imagen 1920x1080 para mostrar
  public/img/aerosols_4k.jpg    imagen 3840x2160 para el zoom
  raw/debug/mask_*.png          mascaras para revisar a ojo

Uso:  python tools/build_grid.py [ruta_imagen]
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SRC = sys.argv[1] if len(sys.argv) > 1 else "raw/Aerosols_2025-08-19T20_00_00_7680x4320.png"
DATA = Path("public/data")
FINE_DIR = DATA / "fine"
IMG_DIR = Path("public/img")
DEBUG = Path("raw/debug")

# ---- Resolucion ----
FINE_W, FINE_H = 1920, 1080   # malla fina: con una imagen de 7680x4320 cada celda promedia 4x4 pixeles
COLS, ROWS = 96, 90           # malla gruesa para el barrido (COLS = duracion; deben dividir a FINE_W / FINE_H)
BAND = 90                     # filas finas por tanda (controla el uso de memoria)

# ---- Intensidad ----
# "v"  : brillo (V). Sobre fondo oscuro, mas brillo = mas aerosol. Es una SUPOSICION: verificala con la barra de color.
# "sv" : saturacion x brillo (lo que usaban las versiones anteriores; penaliza el polvo palido)
STRENGTH = "v"
COVER_POWER = 0.5             # 0 = ignora cuanto de la celda esta cubierto; 1 = proporcional; 0.5 realza lo difuso

# ---- Zonas "puras" (una especie domina) ----
PURE_SHARE = 0.75             # fraccion minima de la especie en la celda
PURE_MIN_VAL = 0.35           # intensidad minima
PURE_MIN_CELLS = 6            # tamano minimo de la zona (celdas gruesas)

# Matiz en escala PIL 0-255 (grados = valor * 360 / 255). Medido sobre la imagen real:
#   polvo ~267-272 grados (189-193), sulfato ~120 (84-87), humo ~10-25 (7-18), sal marina ~195-213 (138-151)
# OJO: la tierra gris tiene matiz ~85 y brillo ~58; no bajes v_min de sulfato/sal marina de ~65.
LAYERS = {
    "seasalt": {"hue": [(118, 175)],           "s_min": 60, "v_min": 70},   # azul y azul-verdoso
    "dust":    {"hue": [(176, 229)],           "s_min": 30, "v_min": 60},   # violeta (el polvo real es ~270 grados)
    "smoke":   {"hue": [(230, 255), (0, 46)],  "s_min": 90, "v_min": 70},   # rojo, naranja y amarillo
    "sulfate": {"hue": [(47, 117)],            "s_min": 60, "v_min": 70},   # verde y amarillo-verdoso
}
# Los rangos cubren todo el circulo de matiz sin huecos ni solapes: lo que antes caia entre
# dos especies (cian, oliva, azul-violeta) ahora va a la mas cercana.


def mask_for(h, s, v, cfg):
    m = np.zeros(h.shape, dtype=bool)
    for lo, hi in cfg["hue"]:
        m |= (h >= lo) & (h <= hi)
    return m & (s >= cfg["s_min"]) & (v >= cfg["v_min"])


def block_mean(a, rows, bh, bw):
    return a.reshape(rows, bh, FINE_W, bw).mean(axis=(1, 3))


def normalize(a):
    pos = a[a > 0]
    hi = np.percentile(pos, 98) if pos.size else 1.0
    return np.clip(a / hi, 0, 1)


def find_zones(coarse):
    names = list(coarse)
    stack = np.stack([coarse[n] for n in names])
    total = stack.sum(axis=0)
    zones = []
    for i, n in enumerate(names):
        share = np.divide(stack[i], total, out=np.zeros_like(total), where=total > 0)
        pure = (stack[i] >= PURE_MIN_VAL) & (share >= PURE_SHARE)
        seen = np.zeros(pure.shape, dtype=bool)
        for r in range(ROWS):
            for c in range(COLS):
                if not pure[r, c] or seen[r, c]:
                    continue
                q, cells = deque([(r, c)]), []
                seen[r, c] = True
                while q:
                    y, x = q.popleft()
                    cells.append((y, x))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < ROWS and 0 <= xx < COLS and pure[yy, xx] and not seen[yy, xx]:
                            seen[yy, xx] = True
                            q.append((yy, xx))
                if len(cells) >= PURE_MIN_CELLS:
                    ys = [p[0] for p in cells]
                    xs = [p[1] for p in cells]
                    zones.append({
                        "species": n,
                        "cells": len(cells),
                        "cx": round((float(np.mean(xs)) + 0.5) / COLS, 3),
                        "cy": round((float(np.mean(ys)) + 0.5) / ROWS, 3),
                        "x0": round(min(xs) / COLS, 3), "x1": round((max(xs) + 1) / COLS, 3),
                        "y0": round(min(ys) / ROWS, 3), "y1": round((max(ys) + 1) / ROWS, 3),
                        "mean": round(float(np.mean([stack[i][p] for p in cells])), 3),
                    })
    zones.sort(key=lambda z: -z["cells"])
    return zones


def main():
    assert FINE_W % COLS == 0 and FINE_H % ROWS == 0, "COLS/ROWS deben dividir a FINE_W/FINE_H"
    for d in (DATA, FINE_DIR, IMG_DIR, DEBUG):
        d.mkdir(parents=True, exist_ok=True)

    img = Image.open(SRC).convert("RGB")
    W, H = img.size
    bw, bh = W // FINE_W, H // FINE_H
    if bw < 1 or bh < 1:
        sys.exit("La imagen es mas pequena que la malla fina; baja FINE_W/FINE_H.")
    Wc = FINE_W * bw
    print(f"Imagen {W}x{H}; cada celda fina promedia {bw}x{bh} pixeles")

    cover = {n: np.zeros((FINE_H, FINE_W), np.float32) for n in LAYERS}
    raw = {n: np.zeros((FINE_H, FINE_W), np.float32) for n in LAYERS}
    px_by = {n: 0 for n in LAYERS}
    colorful_total, unclassified_total = 0, 0
    hue_hist = np.zeros(16, np.int64)

    for r0 in range(0, FINE_H, BAND):
        r1 = min(FINE_H, r0 + BAND)
        rows = r1 - r0
        hsv = np.asarray(img.crop((0, r0 * bh, Wc, r1 * bh)).convert("HSV"))
        h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
        if STRENGTH == "v":
            strength = v.astype(np.float32) / 255.0
        else:
            strength = s.astype(np.float32) * v.astype(np.float32) / 65025.0

        covered = np.zeros(h.shape, dtype=bool)
        for name, cfg in LAYERS.items():
            m = mask_for(h, s, v, cfg)
            covered |= m
            px_by[name] += int(m.sum())
            mf = m.astype(np.float32)
            cv = block_mean(mf, rows, bh, bw)                 # fraccion de la celda con esta especie
            st = block_mean(strength * mf, rows, bh, bw)
            mean_st = np.divide(st, cv, out=np.zeros_like(cv), where=cv > 0)  # intensidad DENTRO de la especie
            cover[name][r0:r1] = cv
            raw[name][r0:r1] = mean_st * np.power(cv, COVER_POWER)

        colorful = (s >= 40) & (v >= 60)
        un = colorful & ~covered
        colorful_total += int(colorful.sum())
        unclassified_total += int(un.sum())
        if un.any():
            hue_hist += np.bincount(h[un] // 16, minlength=16)

    # ---- Malla fina: un PNG de 8 bits por especie ----
    fine = {}
    for name in LAYERS:
        fine[name] = normalize(raw[name])
        Image.fromarray((fine[name] * 255).round().astype(np.uint8)).save(
            FINE_DIR / f"{name}.png", optimize=True)
        Image.fromarray(((cover[name] > 0.25) * 255).astype(np.uint8)).resize((1280, 720)).save(
            DEBUG / f"mask_{name}.png")

    # ---- Malla gruesa para el barrido ----
    ph, pw = FINE_H // ROWS, FINE_W // COLS
    coarse = {}
    for name in LAYERS:
        c = fine[name].reshape(ROWS, ph, COLS, pw).mean(axis=(1, 3))
        coarse[name] = normalize(c)

    zones = find_zones(coarse)

    out = {
        "cols": COLS, "rows": ROWS,
        "source": "NASA SVS 5669 (GEOS, 2025-08-19 20:00 UTC)",
        "strength": STRENGTH,
        "fine": {"w": FINE_W, "h": FINE_H, "block_px": bw,
                 "files": {n: f"data/fine/{n}.png" for n in LAYERS}},
        "layers": {n: np.round(coarse[n], 3).tolist() for n in LAYERS},
        "zones": zones,
    }
    with open(DATA / "grid.json", "w") as f:
        json.dump(out, f)

    # ---- Imagenes para mostrar ----
    img.resize((1920, round(1920 * H / W)), Image.LANCZOS).save(IMG_DIR / "aerosols.jpg", quality=88)
    big = img if W <= 3840 else img.resize((3840, round(3840 * H / W)), Image.LANCZOS)
    big.save(IMG_DIR / "aerosols_4k.jpg", quality=86)

    # ---- Resumen ----
    total_px = W * H
    print("\nCobertura de pixeles por especie:")
    for n in LAYERS:
        active = int((coarse[n] > 0.15).sum())
        print(f"  {n:8s} {px_by[n] / total_px * 100:5.2f}% de la imagen | celdas gruesas activas (>0.15): {active}/{ROWS * COLS}")
    pct = unclassified_total / max(1, colorful_total) * 100
    print(f"\nPixeles coloridos sin clasificar: {pct:.1f}%")
    if unclassified_total:
        print("  Matiz (escala 0-255) de lo no clasificado:")
        for i, n in enumerate(hue_hist):
            if n / unclassified_total >= 0.03:
                print(f"    {i * 16:3d}-{i * 16 + 15:3d}: {n / unclassified_total * 100:5.1f}%")
    print("\nZonas puras (una especie domina), mas grandes primero:")
    for z in zones[:12]:
        print(f"  {z['species']:8s} {z['cells']:4d} celdas  centro=({z['cx']:.2f}, {z['cy']:.2f})  intensidad={z['mean']:.2f}")
    sizes = sum(p.stat().st_size for p in FINE_DIR.glob("*.png"))
    print(f"\nMalla fina: {sizes / 1e6:.2f} MB en total (4 PNG).  Listo: {DATA / 'grid.json'}")


if __name__ == "__main__":
    main()