# Musica Universalis

Instrumento web en español: imagen de aerosoles → cuadrículas por capa → sonidos con afinación justa. JavaScript puro, Vite y Tone.js. La versión actual usa `public/index.html` y `public/app.js`; `src/` conserva módulos de la interfaz anterior para su desarrollo posterior.

## Arrancar

Requiere Node.js 20.19+ o 22.12+ y Python 3.10+ para procesar imágenes.

```sh
npm install
npm run dev
```

En PowerShell, si las políticas bloquean `npm.ps1`, usa `npm.cmd` en lugar de `npm`. Los datos e imagen de aerosoles están incluidos: Python solo es necesario para regenerarlos. Vite sirve `public/` como raíz y compila la aplicación en `dist/`, incluyendo `data/` e `img/`.

## Procesar tus frames

El entorno Python está en `.venv/`, en la raíz del workspace (`MUSICAUNIVERSALIS/`), junto a la carpeta `musica-universalis/`. Solo las dependencias van dentro del entorno; el código, los frames y los datos permanecen en el proyecto. VS Code tiene configurado ese intérprete como predeterminado; si ya habías seleccionado otro, usa **Python: Select Interpreter** y elige `.venv/Scripts/python.exe`.

Desde la raíz del workspace, en PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe musica-universalis/tools/build_grid.py
```

Si ya estás dentro de `musica-universalis/`:

```powershell
..\.venv\Scripts\python.exe -m pip install -r requirements.txt
..\.venv\Scripts\python.exe tools/build_grid.py
```

Estos comandos usan el entorno sin necesidad de activarlo ni cambiar la política de ejecución de PowerShell. El `requirements.txt` de la raíz remite al del proyecto, que contiene las versiones instaladas en tu entorno. Si necesitas recrearlo, ejecuta `py -3.11 -m venv .venv` desde la raíz y después instala los requisitos. Vite y Tone.js usan `node_modules/`, independiente de Python.

El script procesa `raw/Aerosols_2025-08-19T20_00_00_7680x4320.png`. La carpeta `raw/` permanece local y no se sube al repositorio: al clonar, coloca ahí tu PNG original si quieres regenerar los datos. El script conserva esa imagen, genera `public/img/aerosols.jpg` a un máximo de 1920 × 1080, y guarda una cuadrícula de 96 × 48 por capa en `public/data/grid.json`. Las máscaras de depuración se guardan en `raw/debug/`. Puedes ajustar `SRC`, `COLS`, `ROWS` y los umbrales HSV en el script. Las rutas se resuelven respecto del proyecto, independientemente de la carpeta desde la que lo ejecutes.

El JSON contiene `cols`, `rows`, `source` y `layers` (`seasalt`, `dust`, `smoke`, `sulfate`). Cada capa es una matriz de intensidades entre 0 y 1 estimadas mediante color y normalizadas por percentiles; no son concentraciones físicas. La aplicación actual lee directamente las cuatro capas y asigna una voz diferente a cada una.

## Uso

- **Escuchar**: inicia el reloj musical; el audio requiere interacción del usuario.
- **Pausar**: pausa el barrido y silencia el audio.
- El mapa muestra la columna actual y el sonido se desplaza de izquierda a derecha. Se recomienda usar auriculares.

La versión actual usa una escala pentatónica justa con raíz D3 (146.83 Hz) y razones 1, 9/8, 5/4, 3/2 y 5/3. Cada capa selecciona su celda más intensa en cada columna; el umbral y la probabilidad dependen de esa intensidad. Cuatro voces, un drone, reverberación y paneo estéreo acompañan el barrido a 70 BPM. El reloj usa corcheas y vuelve al inicio tras la última columna.

## Verificar y compilar

```sh
npm test
npm run build
npm run preview
```

`dist/` contiene la app estática; no necesita backend. Tone.js se importa desde el paquete npm y se incluye en la compilación. No abrir el HTML fuente por `file://`: usa Vite. Para servir la compilación, usa `npm run preview` o un servidor HTTP sobre `dist/`.

## Hosting

**Netlify:** importa este directorio como base del sitio. `netlify.toml` define `npm run build` y salida `dist`; también puedes subir `dist/` manualmente.

**GitHub Pages:** compila y publica el contenido de `dist/` mediante GitHub Actions o la rama de despliegue que prefieras. `base: './'` permite alojarlo en un subdirectorio. Si el repositorio contiene este proyecto dentro de otra carpeta, ejecuta los comandos dentro de `musica-universalis/`. Para acceso desde móviles usa el enlace HTTPS publicado. El proyecto no se publica automáticamente ni incluye un QR: genera el QR cuando tengas la URL definitiva.

## Estructura

```text
tools/build_grid.py       Procesamiento Pillow + numpy
public/data/grid.json    Datos precalculados
public/img/              Frames normalizados
public/index.html        Entrada HTML
public/app.js            Carga y coordinación
public/img/aerosols.jpg  Imagen de aerosoles para el navegador
src/data.js              Adaptación de capas al instrumento
src/audio/scale.js       Afinación justa y acordes
src/audio/engine.js      Tone.js, reloj, sintetizadores, drone, reverb
src/audio/spatial.js     Posicionamiento HRTF
src/ui/map.js            Canvas, cuadrícula y barrido
src/ui/controls.js       Controles y teclado
src/a11y.js              Avisos ARIA, voz y contraste
src/style.css            Estilos adaptables
```
