# Musica Universalis

Python image preprocessing and a JavaScript audio visualization app. Open this repository's root folder in VS Code; the web application lives in `musica-universalis/`.

## Python setup (Windows / PowerShell)

Use Python 3.11 to match the verified environment. The virtual environment is local and is not committed to Git.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe musica-universalis/tools/build_grid.py
```

Before preprocessing on a fresh clone, place your source image at `musica-universalis/raw/Aerosols_2025-08-19T20_00_00_7680x4320.png`. Original media in `raw/` stays local and is excluded from Git. Processing generates `musica-universalis/public/data/grid.json` and `public/img/aerosols.jpg`; those processed files are included so the web app runs immediately after cloning. The root requirements file references the application's pinned requirements. VS Code defaults to `.venv/Scripts/python.exe`; select it manually if a different interpreter is already selected.

## Web app

Install Node.js 20.19+ or 22.12+, then:

```powershell
cd musica-universalis
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Open the local URL printed by Vite and click **Escuchar** to enable audio. The production output is `musica-universalis/dist/`. Python handles preprocessing; Vite and Tone.js run the browser app. The virtual environment, Node dependencies, caches, debug masks, and build output are excluded from Git.

See [the application README](musica-universalis/README.md) for data format and hosting details.
