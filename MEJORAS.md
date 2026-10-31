# Combate, selección y arcade

Rama de trabajo: `mejora/combate-y-seleccion`. No se ha publicado.

## Combate

- **Ligero:** puede enlazar hasta dos acciones adicionales al conectar. Se pueden anticipar entradas por 9 pasos de simulación; fallar obliga a terminar la recuperación.
- **Fuerte:** tocar y soltar para atacar; mantener durante 24 pasos (0.4 s) y soltar aumenta el daño y permite romper guardia con cualquier dios.
- **Bloqueo preciso:** comenzar a bloquear hasta 7 pasos antes del impacto prepara un contraataque con +20% de daño. Requiere soltar y volver a defender; tiene 45 pasos de enfriamiento. También permite detener el fuerte de Susanoo.
- **Guardia:** la barra fina se desgasta con golpes bloqueados y se recupera al dejar de defender. Al agotarse, deja al defensor expuesto.
- **Identidad:** cada dios tiene alcance, preparación y recuperación propios. Sus pasivas y estilos siguen activos. Anubis obtiene evasión con bloqueo preciso en versus y un giro sin costo de vida cada 3 segundos en arcade.
- **Combos:** en versus, el contador exige golpear mientras el rival sigue aturdido. Las cadenas reducen su daño progresivamente para limitar el abuso.
- Los fuertes cargados y la guardia tienen indicadores integrados al HUD.
- Versus local y contra IA: 180 de vida por ronda, primero en ganar dos rondas, introducción con entradas bloqueadas, marcador persistente y secuencia de K.O. con caída a cámara lenta antes de la siguiente ronda. La torre conserva un enfrentamiento por piso.
- Un empate por doble K.O. o tiempo repite la ronda sin otorgar victoria. La maestría se entrega al ganar el combate completo.

## Arcade

- Vasijas rompibles con comida o magia. El símbolo verde indica comida; azul indica magia.
- Arte de objetos en `public/items` (originales en `art-src/items`): vasija de magia, carne, una vasija por reino entera y rota, y una trampa por reino (rayo, arena movediza, columna de fuego, remolino). Si una imagen no carga, se usa el dibujo por código.
- Peligros con aviso previo: rayos en Grecia, arena que atrae y frena en Egipto, fuego persistente en México y viento que desplaza en Japón. Saltar o cambiar de carril permite evitarlos. También afectan a los enemigos.
- Los corredores de Egipto y Japón atacan a distancia, con preparación visible. Las composiciones y posiciones de las oleadas varían entre reinos.
- Tras los resultados se elige **Fuerza** (+12% de daño), **Refugio** (+35 de vida y 12% menos daño recibido) o **Sabiduría** (+2 vasijas y 15% más daño mágico). La nueva elección sustituye la anterior; en cooperativo beneficia a ambos.
- Los jefes escapan después de un umbral de impactos recientes y respetan 5 segundos de enfriamiento. No dependen de una tirada aleatoria para escapar o retroceder ante un fuerte.
- En celular, **Giro** tiene botón propio. Sigue disponible con ataque + salto en teclado/control.
- Se corrigió un cierre de partida al desmontar a un enemigo mediante daño reflejado.
- Cada vida perdida congela la acción durante 2.2 segundos y muestra la caída, el personaje y el cambio de vidas. Después reaparece con invulnerabilidad; la última vida abre el continue solo tras esta secuencia. Funciona con dos jugadores y respeta el renacer de Osiris.

## Selección y maestría

Selección inspirada en los juegos de pelea: dos vistas grandes, retratos de los luchadores, cursores P1/P2 y una cuadrícula de seis columnas. Los retratos se extraen del sprite existente; las páginas de 18 casillas se generan del elenco completo, sin filas fijas por reino ni límite de 12 personajes. La navegación de teclado también admite filas incompletas y cambio de página. Adaptada a vertical y horizontal.

Se guardan victorias, reinos completados, mejor combo y mejor calificación por dios en el navegador. Los títulos son cosméticos: Sin rango, Iniciado, Ascendente y Leyenda. No modifican estadísticas ni bloquean personajes. Los récords previos conservan su almacenamiento original.

## Validación

```sh
npm run lint
npm test
npm run build
```

`npm test` ejecuta las clases reales con imágenes y almacenamiento simulados; no requiere dependencias adicionales. Para recorridos prolongados con los doce dioses, en PowerShell:

```powershell
$env:MYTHIC_SOAK='1'
npm test
```

Los recorridos usan un controlador sencillo con continues. Comprueban continuidad, estados y recursos; no sustituyen el ajuste de balance jugando en un celular real.
