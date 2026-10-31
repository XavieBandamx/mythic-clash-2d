# Mythic Clash 2D – Torneo de Dioses

Juego de peleas 2D en navegador (React + Canvas) con dioses de **Grecia, Egipto, México y Japón**. Tiene versus estilo Street Fighter, un arcade beat 'em up estilo Golden Axe, una torre estilo Mortal Kombat y un jefe final, **Origen**.

- **Repo:** https://github.com/XavieBandamx/mythic-clash-2d (privado), rama `main`.
- **Publicado:** https://mythic-clash-2d.vercel.app. **Cada push a `main` se publica solo en Vercel**, así que commit + push equivale a actualizar el juego en línea.
- Todo el texto del juego y los comentarios del código están en **español**.

## Cómo correrlo

- Necesita **Node 24** (Vite 8 no corre con Node viejo).
- `npm install`
- `npm start` (o `npm run dev`): servidor en http://localhost:3000.
- `npm run lint`: revisión de tipos con `tsc --noEmit`. Correrlo después de cada cambio.
- `npm run build`: genera `dist/`. Solo sirve para revisar que compile; Vercel compila solo.

## Cómo trabajar con el usuario

- Habla en **español mexicano casual** ("campeón"). Le gustan las respuestas claras, con secciones cortas.
- **No hacer commit ni push sin que lo pida.** Cuando dice "publícalo" quiere decir commit + push a `main`.
- Mensajes de commit en español, con un título y viñetas.
- **No quiere letreros flotantes de reacción** sobre los jefes ("¡BLOQUEA!", "¡CASTIGO!", "¡SE ZAFA!", "ORIGEN APRENDE…"): se quitaron por cursis. Sí se quedan los carteles de juego (nivel, jefe, mini-jefe, resultados).
- **No le gustó pixelear ni homologar el tamaño del pixel** de los sprites ("se ven horribles"). Para mejorar arte se piden versiones en alta resolución a Gemini.
- Lo juega y lo enseña **en celular** (Brave/Android), en vertical y en horizontal. Todo cambio de pantalla debe probarse en tamaño celular y **sin scroll** en las pantallas principales.
- Genera el arte él mismo. Las hojas de personajes las hace en **Gemini Pro**; los fondos y objetos, en **Grok**. ChatGPT ya no tiene créditos. Claude no genera imágenes: hay que darle prompts completos, listos para copiar.

## Estructura

```
src/
  App.tsx              Menús, selección, versus (Fighter, CanvasFighter, OrigenFighter), torre, HUD del versus
  ControlsMenu.tsx     Pantalla "Configurar Controles" (teclado, control, táctil)
  TouchControls.tsx    Joystick y botones táctiles (mandan teclas del jugador 1)
  game/
    deities.ts         Los 12 dioses: stats, estilo, pasiva, súper, colores
    styles.ts          Estilos Poder/Velocidad/Guardián/Alcance y números de las pasivas
    sprites.ts         Configuración de hojas de sprites (escalas por dios), segunda hoja (extra), carga y pantalla "Cargando…"
    arenas.ts          Arenas del versus (5 + la de Origen) y su dibujo
    tower.ts           Torre de los Dioses: pisos, IA por piso, finales de cada dios
    controls.ts        Controles configurables (se guardan en localStorage) y traducción de teclas
    gamepad.ts         Mandos → teclas (1.er control = P1)
    portraits.ts       Medallones de piedra de los dioses
    sound.ts           Sonidos sintetizados por código (no hay música real)
    core.ts            Paso fijo de simulación (60 Hz), partículas, colisiones
  arcade/
    engine.ts          Motor del arcade: Hero, Monster, Beast, Boss, ArcadeGame (oleadas, combos, resultados, récord, HUD)
    levels.ts          Niveles, oleadas, monstruos y sus estadísticas, mini-jefes, bestias, ORIGEN y FINAL_LEVEL
    draw.ts            Fondos con parallax, suelo, ambiente por reino, objetos de primer plano, dibujo de monstruos
    ArcadeMode.tsx     Canvas del arcade, teclado y botones tocables (continuar / volver)
    ArcadeRouteCard.tsx Tarjeta de la ruta del arcade en la selección
public/
  sprites/<dios>.webp          Hoja 4x4 de cada dios (filas: quieto, correr, ataque, golpe)
  sprites/<dios>-extra.webp    Segunda hoja (ninguna por ahora, se rehacen tras el rediseño)
  sprites/monsters/*.webp      13 monstruos + 4 mini-jefes
  sprites/beasts/*.webp        4 bestias montables
  portraits/*.webp             Medallones (12 dioses + Origen)
  arenas/*.webp                Arenas del versus
  backgrounds/*.webp           Fondos y suelos del arcade + Telar del Cosmos
  props/<reino>-N.webp         Objetos de primer plano del arcade (grecia y egipto)
art-src/                       Imágenes originales tal como salieron de Gemini/Grok (no se publican)
tools/process_sprites.py       Recorta una hoja 4x4 irregular a cuadros iguales con los pies alineados
```

`public/sprites/sprites_homologados/` es un intento viejo de homologar sprites y **no se usa**. Nunca se ha subido a git y se puede borrar.

## Lo que ya existe

### Modos de juego (menú principal)
- **Versus local (P1 vs P2)** y **contra la IA**, con 3 dificultades. Hay 5 arenas pintadas: Coliseo del Olimpo, Tribunal de Osiris, Cancha de Tenochtitlan, Dojo de la Tormenta y Torre de Babel. Antes de pelear se elige la arena (o aleatoria).
- **Arcade (Camino de los Dioses)**: beat 'em up de 4 niveles (Grecia, Egipto, México, Japón) y un nivel final contra **Origen**, el Tejedor de Mundos, un jefe no jugable al doble de tamaño.
- **Arcade cooperativo** para 2 jugadores.
- **Torre de los Dioses**: 8 pisos de versus contra rivales al azar (2 por reino), IA que sube de nivel, 3 continues, Origen en la cima y un final escrito para cada dios.
- **Configurar Controles**: reasignar teclado (P1 y P2), botones del control y tamaño/lado de los botones táctiles.
- Con controles táctiles (en celular salen solos) se ocultan Versus Local y Arcade Cooperativo, porque no hay controles para un segundo jugador.

### Dioses
- 12 dioses, cada uno con un **estilo** (Poder, Velocidad, Guardián, Alcance), una **pasiva única** (rayo de Zeus, quemadura de Ra, esquiva de Anubis, renacer de Osiris, doble salto de Quetzalcóatl…) y un **súper propio** en versus.
- Las hojas principales están en **alta resolución** (~250–300 px de alto) y se escalan hacia abajo en `SPRITE_SHEET_OVERRIDES` (`sprites.ts`).
- **Rediseño:** las hojas principales de 11 dioses se rehicieron en ChatGPT con **Susanoo como modelo** de altura, complexión y estilo (mismo tamaño en los 16 cuadros, de pie sin auras ni nubes). Los originales están en `art-src/gods/<dios>-v2.webp` (Susanoo conserva su hoja). Todas comparten una sola escala (`REDESIGN_SCALE` en `sprites.ts`), porque medir por la altura en idle encoge a los de corona o penacho alto.
- **Segunda hoja** (filas: salto, defensa, súper, golpe fuerte + victoria): **por ahora ningún dios la tiene**. Las de Zeus, Poseidón y Hades se quitaron porque ya no combinan con el rediseño; se harán las de los 12 a partir de las hojas nuevas. El código sigue listo (`EXTRA_SHEET_OVERRIDES`): en versus se usa para salto, bloqueo, súper, golpe fuerte y victoria; en arcade, para salto, magia, remate del combo y embestida. Sin ella, el dios usa la hoja principal.

### Arcade
- Oleadas, jinetes sobre **bestias montables** (Cerbero, Cocodrilo de Sobek, Jaguar de Guerra, Kirin), duende ladrón que suelta magia y comida, y **mini-jefe a mitad de nivel** (Cíclope, Escorpión Gigante, Guerrero Águila, Oni Gigante).
- **Jefes astutos** (`Boss.iq` según nivel y dificultad): se cubren, castigan golpes fallados, hacen antiaéreo y se zafan de combos. Origen además aprende si saltas, spameas o abusas de la magia.
- **Puntuación:**
  - **Combo** con multiplicador hasta ×5 (`comboMultiplier`).
  - **Resultados por nivel** con bonos de tiempo, sin morir y combo, más calificación **S/A/B/C** (`levelRank`).
  - **Récord por dios** en localStorage (`mythic-clash-records`).
- **¿CONTINUAR?** con cuenta regresiva de 10 s y botón tocable. Continuar cuesta la mitad de los puntos.
- **Ambiente animado por reino** (hojas, arena, brasas, pétalos, polvo de estrellas) y **objetos de primer plano con parallax**, que por ahora solo hay en Grecia y Egipto.

### Celular
- Pantallas adaptables en vertical y horizontal. La variante de Tailwind `short:` (definida en `index.css`) aplica a pantallas de menos de 500 px de alto, o sea el celular en horizontal.
- Joystick y botones táctiles que se mantienen presionados (`TouchControls.tsx`):
  - **Versus y torre:** Bloqueo, Súper, Fuerte, Golpe.
  - **Arcade:** Magia, Salto, Ataque y Pausa.
- Todas las imágenes están en **WebP**. Mientras cargan sale "CARGANDO…" en vez de dibujos por código.

## Flujo para meter arte nuevo

1. Guarda el original en `art-src/...`.
2. Recorta la hoja 4x4: `python tools/process_sprites.py <carpeta_origen> <carpeta_salida> id=archivo.jpg`. Genera `id.png`, `_debug_id.png` (para revisar los cortes) y `_meta.json` con `frameWidth`, `frameHeight` e `idleHeight`.
   - Si salen chispas sueltas pegadas a otro cuadro, bórralas en el original y vuelve a procesar.
   - Cuidado: el script tiene una regla vieja que recorta la columna izquierda si el id es `hades` o `quetzalcoatl`. Para esos procesa con otro id (por ejemplo `hades-hd`).
3. Convierte a WebP (calidad 90) dentro de `public/...` y nunca subas PNG grandes:
   ```python
   Image.open(png).save(webp, 'WEBP', quality=90, method=6)
   ```
4. Registra la hoja:
   - **Dios:** `SPRITE_SHEET_OVERRIDES`, con `scale` ≈ (alto deseado en pantalla) / `idleHeight`.
   - **Segunda hoja:** `EXTRA_SHEET_OVERRIDES`, con `scale` = escala del dios × (alto de pie en la 1.ª hoja / alto de la guardia de pie en la 2.ª, fila 2 cuadro 1).
   - **Monstruo:** `MONSTER_SPRITES` en `levels.ts`.
5. **Objetos de primer plano:** van sobre fondo verde (#00FF00). Se recortan por figura conectada (no por columnas, porque se pegan), se quita el halo verde y se guardan como `public/props/<reino>-N.webp`. Después se agrega el reino a `PROP_COUNT` en `engine.ts`. No hay scipy instalado: el recorte se hizo con un BFS sobre una rejilla de 4 px.
6. Para que el usuario pase imágenes en alta, debe **descargarlas con el botón de Gemini/Grok**. Si las copia y pega se achican a 1024 px.

### Prompts que sí funcionaron
- **Mejorar resolución de una hoja (Gemini Pro, chat nuevo, adjuntar la hoja):** pedir "high resolution upscale… This is an upscale, NOT a new drawing… keep the exact same 4x4 layout… copy every pose exactly… 4K… at least 250 pixels tall".
- **Personaje nuevo con estilo de referencia (Gemini):** decir explícitamente "Use it ONLY as a reference for the art style… Do NOT draw the character from the reference". Si no, dibuja al de la referencia.
- **Segunda hoja de un dios:** adjuntar `art-src/gods/<dios>.jpg` y usar esta plantilla, cambiando los rasgos y el súper de cada dios:

```text
The attached image is the sprite sheet of a character from my 2D fighting game. I need a SECOND sprite sheet of this exact same character with new animations.

Output requirements:
- Generate the image at 4K resolution (or the highest available), landscape.
- Same character size as in the attached sheet: every frame at least 250 pixels tall.

Fidelity rules (very important):
- It must be the exact same character: same face, <RASGOS DEL DIOS>. Do not redesign anything.
- Same 16-bit pixel art style, same colors, same outlines and shading as the attached sheet.
- Character always facing right, full body always visible.

Layout (very important):
- Exactly 4 rows and exactly 4 columns (16 frames), evenly spaced, with empty black space between frames.
- Row 1 (jump): crouching to take off, rising in the air, at the top of the jump, landing.
- Row 2 (defense): guard stance blocking, blocking while being pushed back by a hit, crouching low, crouching block.
- Row 3 (super attack): <SÚPER DEL DIOS>, 4 frames from charging the power to full release and recovery.
- Row 4: frames 1 and 2 a powerful heavy attack (big wind-up, then the hit with an impact effect); frames 3 and 4 a triumphant victory pose.
- Feet on the same baseline in every frame of a row (except the mid-air jump frames).
- Effects must not overlap into neighboring frames.

Plain solid pure black background. No text, no labels, no numbers, no grid lines, no floor, no other characters.
```

## Lo que falta (en orden de prioridad)

1. **Segunda hoja de los 12 dioses**, hecha a partir de las hojas rediseñadas. Se generan con la plantilla de arriba; luego se miden, se registran en `EXTRA_SHEET_OVERRIDES` y entran solas. Zeus (rayo), Poseidón (marea) y Hades (fuego morado) tenían súper en la versión anterior. Súper de los demás (para la fila 3):
   - **Ra:** haz solar del báculo.
   - **Anubis:** embestida de sombras con garras doradas.
   - **Osiris:** pilares de arena y barrera verde.
   - **Quetzalcóatl:** tornado verde de plumas.
   - **Huitzilopochtli:** embestida envuelto en la serpiente de fuego.
   - **Mictlantecuhtli:** garras de hueso que brotan del suelo.
   - **Amaterasu:** destello del espejo sagrado.
   - **Susanoo:** ráfaga de cortes de viento.
   - **Raijin:** ondas eléctricas de los tambores.
2. **Objetos de primer plano de México y Japón** (Grok, fondo verde, 6 objetos en fila). Los prompts ya se le dieron al usuario:
   - **México:** cabeza de serpiente de piedra, helecho, pilar con grabados aztecas, brasero, cactus y agave.
   - **Japón:** linterna de piedra, pilar de torii, rama de cerezo, bambú, farol de papel y zorro de piedra.
3. **Música:** hoy solo hay sonidos sintetizados. Faltan una pista por reino, una de menú, una de jefe y una de Origen, de OpenGameArt o Pixabay Music (gratis y libres). Suno gratis no deja descargar.
4. **Variedad en el arcade:** objetos que se rompen (vasijas y estatuas que sueltan comida, magia o puntos) y trampas por reino (rayos, arenas movedizas, lava, viento).
5. **Fondos del arcade en capas** para un parallax real. Hoy cada fondo es una sola imagen.
6. **Lo que hace volver a jugar:** desbloquear dioses, logros, aspectos alternos de colores y reto diario.
7. **Ajustes pendientes de probar jugando:**
   - Dificultad de Origen (en arcade y torre).
   - Dureza de los mini-jefes.
   - Que el joystick se sienta bien en un celular real.
8. **Detalles chicos:**
   - Las poses de agachado de la segunda hoja no se usan (el juego no distingue entre bloquear de pie y agachado).
   - `tools/process_sprites.py` guarda PNG, que luego hay que pasar a WebP a mano.
   - Los textos de ayuda que mencionan J/K/L no cambian si el jugador reasigna las teclas.
   - Opcional: mejorar en alta los 5 monstruos de Gemini que vienen a media resolución (guerrero-jaguar, tzitzimitl, oni-menor, oni-mayor y kappa).

## Cómo probar sin jugar a mano

En el navegador del dev server se puede importar el motor y simularlo directo:
```js
const E = await import('/src/arcade/engine.ts');
const { DEITIES } = await import('/src/game/deities.ts');
const g = new E.ArcadeGame(DEITIES[0], 'NORMAL');
g.step({ left:false, right:true, up:false, down:false, attack:false, jump:false, magic:false, tapLeft:false, tapRight:false });
g.render(canvas.getContext('2d'));
```
Con eso se han corrido bots que juegan niveles enteros para revisar combos, mini-jefes, resultados y continuar. Para ver una pantalla, se dibuja en un canvas encimado de 1280×720.
