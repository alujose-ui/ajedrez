# Problemas de ajedrez (PWA)

App para resolver problemas de ajedrez con dificultad creciente y tres fallos, al estilo Puzzle Rush, sin partidas ni distracciones. Funciona sin conexión una vez instalada.

## 1. Generar la base de datos (una vez)

```
pip install zstandard
python generar_bbdd.py
```

El script descarga la base de datos pública de problemas de Lichess (`lichess_db_puzzle.csv.zst`, varios cientos de MB) y genera `puzzles.json` con 30.000 problemas repartidos uniformemente entre los niveles 400 y 3000. Solo elige problemas con nivel fiable y bien valorados.

Opciones útiles:

- `--cantidad 50000` para cambiar el número de problemas.
- `--entrada fichero.csv` si ya tienes el CSV descargado y descomprimido.
- `--semilla 2` para obtener otra selección distinta.

Copia `puzzles.json` en la misma carpeta que `index.html`.

## 2. Probar en el ordenador

La app usa módulos JavaScript y un service worker, así que necesita servirse por HTTP; abrir `index.html` con doble clic no funciona.

```
python -m http.server 8000
```

Después abre http://localhost:8000 en el navegador.

## 3. Instalar en el móvil

1. Sube la carpeta completa a GitHub Pages o a cualquier hosting con HTTPS.
2. Abre la URL en Chrome desde Android.
3. En el menú ⋮, pulsa **Añadir a pantalla de inicio** (o **Instalar aplicación**).

Si más adelante cambias algún fichero o regeneras `puzzles.json`, sube el número de versión de `CACHE` en `sw.js`. Así los móviles descargan la versión nueva.

## Cómo se juega

- El rival hace la primera jugada y después te toca a ti. Juegas con el color que queda abajo.
- Para mover, toca la pieza y luego la casilla de destino, o arrástrala.
- Cada problema es de un nivel más alto que el anterior (+60 puntos). Al empezar puedes elegir el nivel inicial: 500, 1000 o 1500.
- Si fallas, aparece la solución completa escrita (por ejemplo `1. Ra7 Kf8 2. Rb8#`) y una flecha verde con la jugada correcta. Con ◀ ▶ la recorres en el tablero: la flecha verde marca tus jugadas y la roja las respuestas del rival.
- "Ver solución" durante un problema cuenta como fallo.
- Al terminar cada problema (acertado o fallado) puedes **analizar**: mueve piezas de cualquier color para probar otras jugadas. ◀ deshace tus jugadas y te devuelve a la solución. Si juegas justo la jugada de la solución, la línea avanza sola.
- En el análisis también puedes mover una pieza aunque no sea su turno.
- **Sugerencias del motor (💡)**: en tus variantes, Stockfish marca con una flecha azul la mejor jugada para el bando que mueve. También indica la evaluación o si hay mate. Sirve para ver por qué una jugada es mala: hazla y mira qué responde el rival. El botón 💡 activa o desactiva las sugerencias. Funciona sin conexión.
- Si prefieres el ritmo de Puzzle Rush, marca en el inicio "Al acertar, pasar directamente al siguiente problema". Con esa opción, solo te paras a analizar cuando fallas.
- Con 3 fallos termina la partida. Se guarda tu récord y puedes repasar los problemas fallados.

## Ficheros

| Fichero | Contenido |
|---|---|
| `index.html`, `app.js` | La app |
| `chess.js` | Reglas del ajedrez (librería chess.js, licencia BSD) |
| `pieces.css` | Piezas "cburnett" (las de Lichess) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Instalación como app y funcionamiento sin conexión |
| `stockfish-19-lite-single.js` / `.wasm` | Motor Stockfish 19 (versión ligera de un hilo, licencia GPL-3, ver `LICENSE-stockfish.txt`) |
| `generar_bbdd.py` | Genera `puzzles.json` |

Los ajustes están al principio de `app.js`: `SUBIDA` (lo que sube el nivel en cada problema), `MAX_FALLOS` y `T_MOTOR` (milisegundos que piensa el motor; 800 por defecto).
