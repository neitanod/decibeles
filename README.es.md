# Decibeles

[English](README.md) · **Español**

Un decibelímetro que vive en el navegador del teléfono. Se instala como app,
se apunta al ambiente y dice cuánto ruido hay — en dB(A), dB(C) o dB(Z) — con
un dial en vivo, el espectro, la dosis de exposición y el historial de cada
medición.

**Probalo:** https://decibeles.ip1.cc

Funciona sin conexión, no pide cuenta y no manda audio a ningún lado: cada
muestra se procesa en el dispositivo.

## Qué hace

- **Medidor en vivo** con un dial analógico (aguja con física de resorte,
  marcas de pico y de Leq) y una lectura digital grande.
- **Ponderaciones de frecuencia A, C y Z** (IEC 61672) y **ponderaciones
  temporales Fast y Slow**, calculadas todas a la vez para que el cambio sea
  instantáneo.
- **Estadísticas de la sesión:** mínimo, máximo, Leq, pico y los niveles
  estadísticos L10, L50 y L90.
- **Gráfico de historia** del último minuto o de la sesión entera, coloreado
  por zona de ruido.
- **Espectro en tercios de octava** (25 Hz – 16 kHz) con marcas de pico y la
  frecuencia dominante, con su nota musical.
- **Cascada (espectrograma)** sobre un eje de frecuencia logarítmico.
- **Dosis de exposición** según el criterio NIOSH (85 dB(A) durante 8 h,
  tasa de intercambio de 3 dB), con el tiempo seguro al nivel actual y la
  proyección a 8 horas.
- **Escala de referencia** de sonidos cotidianos con la marca «vos estás acá».
- **Semáforo de ruido** para el aula, la oficina o el taller: pantalla
  completa, umbrales configurables y promedio de algunos segundos, así un
  portazo no lo pone en rojo.
- **Eventos ruidosos:** cada tramo por encima de un umbral configurable
  (70 dB(A) por defecto) durante medio segundo o más queda anotado con su
  hora, duración y máximo — sirve para documentar ruidos molestos.
- **Modo nocturno** para medir toda la noche: pantalla casi negra con los
  números tenues, que se corren cada minuto, la pantalla siempre encendida y
  doble toque para salir.
- **Alerta de nivel** con vibración y un destello en la pantalla.
- **Marcas** para señalar momentos durante una medición («pasó un colectivo»).
- **Historial de sesiones** guardado solo en el dispositivo (IndexedDB), con
  una página por sesión: evolución, distribución del nivel, nombre y notas.
- **Exportaciones:** una tarjeta en imagen para compartir, un reporte
  imprimible (o en PDF), CSV (una fila por segundo) y JSON; exportar e
  importar el historial completo.
- **Calibración** contra un sonómetro de referencia, o a mano.
- **Tres temas** (Estudio, Fósforo, Papel), **castellano e inglés**.
- **PWA instalable:** funciona sin conexión, se actualiza sola, mantiene la
  pantalla encendida mientras mide y muestra su sello de compilación.

## Cómo mide

El micrófono se abre con la cancelación de eco, la supresión de ruido y el
control automático de ganancia apagados, porque cada uno torcería la lectura.
Un `AudioWorklet` corre los filtros de ponderación A y C — cascadas de
biquads diseñadas con la transformada bilineal, con los polos pre-deformados —
y mantiene los promedios exponenciales Fast (125 ms) y Slow (1 s) más la
energía de cada bloque, que es lo que integra el Leq. Veinte veces por segundo
le pasa los valores cuadráticos medios al hilo principal, que aplica el offset
de calibración y convierte a decibeles.

Pausar suelta el micrófono (se apaga el indicador del sistema) y reanudar arma
un grafo de audio nuevo que sigue sumando a la misma sesión.

Los filtros de ponderación se prueban contra los valores nominales de
IEC 61672-1 a 44,1 y 48 kHz (`tests/weighting.test.mjs`).

### Sobre la precisión

Los micrófonos de los teléfonos son distintos entre sí y el navegador no
informa su sensibilidad, así que el offset de fábrica (dB SPL = dBFS + 100)
es una estimación. Para tener números confiables, poné un sonómetro de
referencia al lado del teléfono y usá **Ajustes → Calibración**. Aun
calibrado, un teléfono no es un sonómetro certificado clase 1 o clase 2: las
lecturas son orientativas.

## Desarrollo

Sin framework y sin bundler: módulos ES nativos en `web/`.

```bash
node --test tests/*.test.mjs   # filtros de ponderación y estadísticas
./build.sh                     # web/ → dist/, con sello de versión y precache
node tools/serve.mjs           # sirve dist/ en http://localhost:8642
./deploy.sh                    # compila y publica en decibeles.ip1.cc
python3 tools/icons.py         # vuelve a dibujar los íconos
```

`build.sh` escribe el sello de compilación (`web/js/build.js`), lista todos
los archivos en el precache del service worker y escribe `version.txt`, que la
app consulta para enterarse de que hay una versión nueva.

## Licencia

MIT
