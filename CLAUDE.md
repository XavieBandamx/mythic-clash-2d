# Mythic Clash 2D – Torneo de Dioses

Juego de peleas 2D en navegador (React + Canvas) con dioses de **Grecia, Egipto, México y Japón**. Tiene versus estilo Street Fighter, un arcade beat 'em up estilo Golden Axe, una torre estilo Mortal Kombat y un jefe final, **Origen**.

- **Repo:** https://github.com/XavieBandamx/mythic-clash-2d (privado), rama `main`.
- **Publicado:** https://mythic-clash-2d.vercel.app. **Cada push a `main` se publica solo en Vercel**, así que commit + push equivale a actualizar el juego en línea.
- Todo el texto del juego y los comentarios del código están en **español**.

## Estado vigente — actualización de Codex, 1 de noviembre de 2026

Esta guía describe la implementación actual, incluidas las mejoras de rutas, resultados, supervivencia y versus por Wi-Fi. No usar el orden fijo de reinos ni la selección del primer jefe disponible como referencia del arcade. Los detalles de estos modos están en `MODOS.md` y los de la APK en `ANDROID.md`.

- Android **1.1**, versionCode **2**, identificador `mx.mythicclash.game`. APK de depuración para pruebas; conservar su firma al actualizarla.
- Protocolo LAN **2**: ambos dispositivos deben actualizarse. Se juega por Wi-Fi local o punto de acceso sin datos. Bluetooth queda para después.
- El usuario y su hijo completaron el arcade cooperativo anterior en celulares físicos. Los modos nuevos necesitan otra prueba física; la prueba entre pestañas no demuestra su respuesta sobre una red real.
- Las fuentes y los recursos están incluidos en la APK. No duplicar sprites ni publicar originales o APK dentro de Git; las APK se adjuntan a versiones de GitHub.

## Cómo correrlo

- **Android / LAN:** ver `ANDROID.md`. Capacitor 8 empaqueta `dist` sin servidor remoto; `npm run android:apk` genera la APK de depuración. El menú Wi-Fi solo aparece en Android. `src/lan` gestiona sesiones y copias visuales; el anfitrión ejecuta el motor, el invitado solo renderiza. El plugin nativo `LocalWifiPlugin` usa `LanTransport` para TCP local y ZXing para QR sin internet. No agregar un servidor externo ni `server.url` para resolver la LAN. `npm run test:lan` y `tools/test-lan-native.ps1` verifican la sincronización y el transporte.

- Necesita **Node 24** (Vite 8 no corre con Node viejo).
- `npm install`
- `npm start` (o `npm run dev`): servidor en http://localhost:3000.
- `npm run lint`: revisión de tipos con `tsc --noEmit`. Correrlo después de cada cambio.
- `npm test`: regresiones del combate; `npm run test:runs`: rutas, resultados, supervivencia y récords; `npm run test:lan`: sincronización y versus.
- `npm run build`: genera `dist/`. Solo sirve para revisar que compile; Vercel compila solo.

## Cómo trabajar con el usuario

- Habla en **español mexicano casual** ("campeón"). Le gustan las respuestas claras, con secciones cortas.
- **No hacer commit ni push sin que lo pida.** Cuando dice "publícalo" quiere decir commit + push a `main`.
- Mensajes de commit en español, con un título y viñetas.
- **No quiere letreros flotantes de reacción** sobre los jefes ("¡BLOQUEA!", "¡CASTIGO!", "¡SE ZAFA!", "ORIGEN APRENDE…"): se quitaron por cursis. Sí se quedan los carteles de juego (nivel, jefe, mini-jefe, resultados).
- **No quiere figuras religiosas actuales como personajes:** nada de Jesucristo, Buda ni similares. Al proponer mitologías nuevas, preferir las que ya no se practican (nórdica, inca, celta, mesopotámica, china clásica como Sun Wukong) y tratar con cuidado las religiones vivas (hindú, yoruba).
- **No le gustó pixelear ni homologar el tamaño del pixel** de los sprites ("se ven horribles"). Para mejorar arte se piden versiones en alta resolución a Gemini.
- Lo juega y lo enseña **en celular** (Brave/Android), en vertical y en horizontal. Todo cambio de pantalla debe probarse en tamaño celular y **sin scroll** en las pantallas principales.
- Genera el arte él mismo. Desde el rediseño usa **ChatGPT** (de pago) para hojas de personajes, bestias, monstruos y medallones; antes usaba **Gemini Pro**. Los fondos y objetos los hace en **Grok**. Claude no genera imágenes: hay que darle **prompts completos, uno por personaje, listos para copiar** (no plantillas con huecos que llenar).
- Pega las imágenes en el chat; llegan a 1536x1024 (hojas) o 1254x1254 (medallones), igual que si las descargara.

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
    run.ts             Sorteo de ruta, desempeño y récords de supervivencia
    RunScreens.tsx      Mapa previo y resultados finales adaptables
    ArcadeRouteCard.tsx Componente antiguo sin uso en el flujo actual
  lan/
    LanLobby.tsx        Sala privada: personajes, modo, dificultad y arena
    protocol.ts        Validación y versión del protocolo LAN
    session.ts         Transporte nativo, entradas, carga, pausa y comandos
    snapshot.ts        Copias visuales del arcade y supervivencia
    versus.ts          Estado, controles e interpolación del duelo Wi-Fi
public/
  portraits/*.webp             Medallones (12 dioses + Origen), 256x256 con fondo transparente
  arenas/*.webp                Arenas del versus
  backgrounds/*.webp           Fondos y suelos del arcade + Telar del Cosmos
  items/*.webp                 Magia, comida, vasija-N / vasija-rota-N y trampa-N del arcade (N = nivel 0 Grecia … 3 Japón)
  props/<reino>-N.webp         Objetos de primer plano del arcade (6 por reino: grecia, egipto, mexico, japon)
assets/sprites/                Todas las hojas: <id>.webp / <id>-extra.webp y sus fuentes <id>-original.webp / <id>-extra-original.webp
art-src/                       Otros originales (fondos, objetos y medallones; no se publican)
art-src/logo/                  Logo (logo-v1) e ícono (icono-v1) sobre fondo verde: aprobados pero AÚN NO se usan en el juego
tools/process_sprites.py       Recorta una hoja 4x4 irregular a cuadros iguales con los pies alineados
```

Los originales y los recortes están juntos en `assets/sprites/`: 47 hojas de juego y 47 originales con sufijo `-original.webp`. `spriteAssetSrc()` resuelve las mismas URLs y caché para todos los modos. El glob de Vite excluye los originales del empaquetado; solo publica los recortes. No duplicar hojas en `public`, en `characters` ni por modo. Se retiraron las versiones antiguas con reemplazo vigente.

## Lo que ya existe

### Modos de juego (menú principal)
- **Versus local (P1 vs P2)** y **contra la IA**, con 3 dificultades. Hay 5 arenas pintadas: Coliseo del Olimpo, Tribunal de Osiris, Cancha de Tenochtitlan, Dojo de la Tormenta y Torre de Babel. Antes de pelear se elige la arena (o aleatoria).
- **Arcade (Camino de los Dioses)**: beat 'em up de cuatro reinos en orden variable (Grecia, Egipto, México, Japón), guardianes sorteados entre los dioses que no usan los jugadores, dificultad por etapa y un nivel final contra **Origen**, el Tejedor de Mundos, un jefe no jugable al doble de tamaño. Rediseñado como titán cósmico con máscara dorada, con sus dos hojas (`assets/sprites/origen-original.webp` y `origen-extra-v2.webp`).
- **Arcade cooperativo** para 2 jugadores. Al caer, si el compañero sigue vivo hay 8 segundos para rescatarlo: acercarse (100 px en X y 36 en profundidad) y mantener abajo 1.5 segundos, sin recibir golpes. El rescatado vuelve con 35% de vida, sin gastar vida ni ganar magia. Si expira el plazo o caen ambos, se procesa la pérdida de vida normal; vencer al jefe recupera al compañero que siga caído. Continuar cuesta la mitad de los puntos del jugador que regresa, tanto individualmente como cuando caen ambos. Cada jugador activo elige su propia bendición con sus controles o su panel; el siguiente reino espera ambas confirmaciones. Un jugador sin vidas no bloquea la elección y puede continuar en el siguiente combate.
- **Tácticas cooperativas:** una pareja de enemigos por oleada se enlaza, recibe 60% del daño y reparte sus objetivos. Dos jugadores deben golpear a miembros distintos dentro de 120 ticks para romper el enlace y abrirlos. Los jefes pueden plantar una guardia de 240 ticks con orientación fija: dos jugadores golpeando desde lados opuestos en 120 ticks la rompen y dejan una apertura. Solo se activa con espacio lateral y no interrumpe poderes ni introducciones. Anillos en el suelo y un aviso en el HUD explican las tácticas; se cancelan cuando no quedan dos jugadores en pie. Los rayos alternan jugadores y fijan su posición al aparecer el círculo. La vida adicional cooperativa baja a ×1.15 en monstruos y ×1.25 en jefes. El modo individual conserva su comportamiento. `MYTHIC_COOP_SOAK=1` ejecuta recorridos automáticos de dos parejas además de las pruebas normales.
- **Torre de los Dioses**: 8 pisos de versus contra rivales al azar (2 por reino), IA que sube de nivel, 3 continues, Origen en la cima y un final escrito para cada dios.
- **Configurar Controles**: reasignar teclado (P1 y P2), botones del control y tamaño/lado de los botones táctiles.
- **Supervivencia** individual o cooperativa: arenas con oleadas sin etapa final, dificultad creciente por estadísticas y presión, jefes y bendiciones cada cinco oleadas. Conserva vidas/rescates, pero no permite continuaciones. Récords por oleada superada y después puntos del equipo, separados por modalidad y dificultad; muestran los personajes y se guardan localmente en ambos dispositivos al recibir el cierre.
- **Sala Wi-Fi (Android):** arcade cooperativo, supervivencia cooperativa o versus 1 contra 1. El anfitrión decide modo/arena y simula; el invitado controla a P2 desde sus controles habituales de P1. Pausa compartida, rondas, K.O. y revancha en versus. Al desconectarse se detiene la partida; no existe reconexión o migración de anfitrión.
- Con controles táctiles se ocultan Versus Local, Arcade Cooperativo local y Supervivencia Cooperativa local; sus variantes entre dispositivos se eligen en la sala Wi-Fi.
- **Vistas previas aprobadas:** versus local Zeus/Ra; supervivencia Minotauro/Guardián Chacal; supervivencia cooperativa Escorpión/Oni Gigante/Guerrero Águila con tamaños grandes y el Águila dibujado delante del Oni; Torre Hades/Susanoo/Mictlantecuhtli. La sala Wi-Fi tiene ilustración de controles y conexión, sin repetir una pareja de dioses. No reducir los monstruos para resolver su superposición: ajustar el orden de dibujo.

### Dioses
- 12 dioses, cada uno con un **estilo** (Poder, Velocidad, Guardián, Alcance), una **pasiva única** (rayo de Zeus, quemadura de Ra, esquiva de Anubis, renacer de Osiris, doble salto de Quetzalcóatl…) y un **súper propio** en versus.
- Las hojas principales están en **alta resolución** (~250–300 px de alto) y se escalan hacia abajo en `SPRITE_SHEET_OVERRIDES` (`sprites.ts`).
- **Rediseño:** las hojas principales de 11 dioses se rehicieron en ChatGPT con **Susanoo como modelo** de altura, complexión y estilo (mismo tamaño en los 16 cuadros, de pie sin auras ni nubes). Los originales están en `assets/sprites/<dios>-original.webp`. Después Susanoo también se rehízo, con Amaterasu nueva como modelo, para que no quedara atrás. Todas comparten una sola escala (`REDESIGN_SCALE` en `sprites.ts`), porque medir por la altura en idle encoge a los de corona o penacho alto.
- Con el mismo modelo se rehicieron también las **4 bestias**, los **17 monstruos y mini-jefes** y los **13 medallones** (originales en `assets/sprites`, `assets/sprites` y `art-src/portraits`, con sufijo `-v2`).
- **Segunda hoja** (filas: salto, defensa, súper, golpe fuerte + victoria): **los 12 dioses y Origen la tienen**, hecha en ChatGPT a partir de su hoja rediseñada (`EXTRA_SHEET_OVERRIDES`): en versus se usa para salto, bloqueo, súper, golpe fuerte y victoria; en arcade, para salto, magia, remate del combo y embestida del héroe, y para poderes, guardia y salto de los jefes. Sin ella, el dios usa la hoja principal.

### Arcade
- Oleadas, jinetes sobre **bestias montables** (Cerbero, Cocodrilo de Sobek, Jaguar de Guerra, Kirin), duende ladrón que suelta magia y comida, y **mini-jefe a mitad de nivel** (Cíclope, Escorpión Gigante, Guerrero Águila, Oni Gigante).
- **Jefes astutos** (`Boss.iq` según nivel y dificultad): se cubren, castigan golpes fallados, hacen antiaéreo y se zafan de combos. Origen además aprende si saltas, spameas o abusas de la magia.
- **Puntuación:**
  - **Combo** con multiplicador hasta ×5 (`comboMultiplier`).
  - **Resultados por nivel** con bonos de tiempo, sin morir y combo, más calificación **S/A/B/C** (`levelRank`).
  - **Resultados de toda la aventura:** rango global desde el promedio de valores de desempeño de todas las etapas y jugadores, desglose por etapa, puntos del equipo, tiempo, enemigos comunes, minijefes, jefes, caídas, continuaciones y rescates. El tiempo final queda congelado.
  - **Récord por dios** en localStorage (`mythic-clash-records`).
- **¿CONTINUAR?** con cuenta regresiva de 10 s y botón tocable. Continuar cuesta la mitad de los puntos.
- **Ambiente animado por reino** (hojas, arena, brasas, pétalos, polvo de estrellas) y **objetos de primer plano con parallax**: 6 por reino en los 4 reinos.

### Celular
- Pantallas adaptables en vertical y horizontal. La variante de Tailwind `short:` (definida en `index.css`) aplica a pantallas de menos de 500 px de alto, o sea el celular en horizontal.
- Joystick y botones táctiles que se mantienen presionados (`TouchControls.tsx`):
  - **Versus y torre:** Bloqueo, Súper, Fuerte, Golpe.
  - **Arcade:** Magia, Salto, Ataque y Pausa.
- Todas las imágenes están en **WebP**. Mientras cargan sale "CARGANDO…" en vez de dibujos por código.

## Flujo para meter arte nuevo

1. Guarda el original de una hoja en `assets/sprites/<id>-original.webp` (o `<id>-extra-original.webp`). Para fondos, props y otros tipos se conserva `art-src/...`.
2. Recorta la hoja 4x4: `python tools/process_sprites.py assets/sprites <carpeta_temporal> id=id-original.webp`. Genera `id.png`, `_debug_id.png` (para revisar los cortes) y `_meta.json` con `frameWidth`, `frameHeight` e `idleHeight`. Usa una carpeta temporal para estos archivos intermedios; a `assets/sprites` solo regresa el WebP final.
   - Si salen chispas sueltas pegadas a otro cuadro, bórralas en el original y vuelve a procesar.
   - Cuidado: el script conserva una regla de recorte para hojas antiguas de `hades` o `quetzalcoatl`; no se aplica a los originales actuales `-original.webp`.
3. Convierte a WebP (calidad 90) en `assets/sprites/<id>.webp` (o `<id>-extra.webp`) y nunca subas PNG grandes:
   ```python
   Image.open(png).save(webp, 'WEBP', quality=90, method=6)
   ```
4. Registra la hoja:
   - **Dios:** `SPRITE_SHEET_OVERRIDES`, con `scale` ≈ (alto deseado en pantalla) / `idleHeight`.
   - **Segunda hoja:** `EXTRA_SHEET_OVERRIDES`, con `scale` = escala del dios × alto de pie en la 1.ª hoja / promedio de la guardia (fila 2, cuadro 1) y la victoria (fila 4, cuadro 3) en la 2.ª. Procesar con id `<dios>-extra` para evitar la regla vieja de `hades` y `quetzalcoatl`.
   - **Monstruo:** `MONSTER_SPRITES` en `levels.ts`.
5. **Objetos de primer plano:** van sobre fondo verde (#00FF00), 6 en fila. Se recortan con `python tools/cut_props.py art-src/props/<reino>-v2.webp public/props/<reino> 0.56` (por figura conectada, une chispas y pétalos sueltos al objeto más cercano, quita el halo verde y escala para que el más alto mida ~515 px). Después se agrega el reino a `PROP_COUNT` en `engine.ts`.
6. Para que el usuario pase imágenes en alta, debe **descargarlas con el botón de Gemini/Grok**. Si las copia y pega se achican a 1024 px.

### Herramientas en esta compu
- Python 3.13 está en `%LOCALAPPDATA%\Programs\Python\Python313\python.exe` (con numpy y Pillow). En Git Bash: `"$LOCALAPPDATA/Programs/Python/Python313/python.exe"`.
- Si `process_sprites.py` dice "no se encontraron 3 huecos entre cuadros", hay cuadros pegados (lanzas, garrotes, efectos). Se borra una columna de 3 px en el punto más delgado cerca de x = 384, 768 o 1152 de esa fila y se vuelve a procesar. Si un arma se mete en el cuadro vecino, se borra solo la punta.
- **Medallones:** se recorta el círculo (caja de lo que no es negro), se pone máscara circular y se guarda a 256x256 WebP en `public/portraits/`.
- **Bestias:** `height` en `BEASTS` (`levels.ts`) = `idleHeight` × 0.73 (la escala de los dioses). `seat` es el punto de la silla en px de hoja desde el centro y desde los pies; se ajusta montando a un dios y viendo que se siente en la silla.

### Prompts que sí funcionaron
- **Rediseño con modelo (ChatGPT):** adjuntar primero la hoja a corregir y luego `assets/sprites/susanoo-original.webp`, diciendo "MASTER REFERENCE for size, body proportions and art quality only. Do NOT draw Susanoo". Pedir mismo tamaño en los 16 cuadros, idle de pie sin auras, efectos solo en el ataque, 4x4, 1536x1024 y fondo negro.
- **Medallones (ChatGPT):** adjuntar un medallón nuevo del mismo reino como modelo y pedir el **símbolo o animal sagrado** del dios tallado en relieve (no su cara), mismo aro dorado y mismo borde por reino (meandro griego, jeroglíficos con disco alado, escalonado azteca, olas y nubes con torii).
- **Mejorar resolución de una hoja (Gemini Pro, chat nuevo, adjuntar la hoja):** pedir "high resolution upscale… This is an upscale, NOT a new drawing… keep the exact same 4x4 layout… copy every pose exactly… 4K… at least 250 pixels tall".
- **Personaje nuevo con estilo de referencia (Gemini):** decir explícitamente "Use it ONLY as a reference for the art style… Do NOT draw the character from the reference". Si no, dibuja al de la referencia.
- **Segunda hoja de un dios:** adjuntar su hoja rediseñada (`assets/sprites/<dios>-original.webp`) y usar esta plantilla, cambiando los rasgos y el súper de cada dios:

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

## Pendientes actuales (en orden de prioridad)

1. **Prueba física de la versión 1.1:** versus Wi-Fi (respuesta de golpes, bloqueo, carga fuerte y revancha), supervivencia larga, récords en ambos dispositivos y resultados de un arcade completo con ruta variable. Probar también con punto de acceso sin datos.
2. **Conexión y balance:** medir los tropiezos iniciales reportados; señal del router, carga y sincronización son hipótesis, no diagnósticos confirmados. Evaluar latencia del invitado y escalado de oleadas antes de ajustar valores. No atribuir el problema a velocidad de internet: la LAN no requiere salida a internet.
3. **Android para distribución estable:** firma de lanzamiento y respaldo de la clave, icono/pantalla inicial definitivos. La APK sigue firmada para depuración. Los logos aprobados de `art-src/logo/` aún no están integrados y quedan fuera de esta publicación.
4. **Audio y presentación:** música de menú/reinos/jefes con licencia comprobada y fondos del arcade en capas. Hoy hay efectos sintetizados y fondos de una sola imagen.
5. **Más adelante, a decisión del usuario:** personajes nuevos (el punto 5 se pospuso expresamente), progresión/logros/aspectos/reto diario y Bluetooth. No dar estos elementos por autorizados o terminados.
6. **Detalles heredados:** poses de agachado extra sin uso, conversión WebP manual en la herramienta de recorte y ayudas de teclado que todavía muestran J/K/L cuando se reasignan controles.

Validación de esta entrega: 58 regresiones de combate, 12 de rutas/supervivencia/resultados y 6 LAN; recorridos automáticos con los 12 dioses y dos parejas; compilaciones web y Android. Interfaz de ruta/resultados revisada en vertical 360×640 y 390×844 y horizontal 844×390. El versus se comprobó entre dos instancias reales de App con transporte simulado (sala, personajes, movimiento remoto y pausa compartida).

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
