# Rutas, resultados, supervivencia y versus Wi-Fi

## Arcade

- Cada aventura sortea los cinco reinos y sus guardianes. El Origen siempre es el sexto encuentro.
- Los guardianes excluyen los personajes de ambos jugadores. Si juegan Zeus y Poseidón, Grecia conserva a Hades; si usan otros dioses, Zeus y Poseidón también pueden ser jefes.
- El dispositivo recuerda la ruta reciente para evitar repetir inicio y guardianes cuando existen alternativas.
- Enemigos, peligros, objetos y arte pertenecen al reino; vida, daño e inteligencia de jefes crecen según la posición en la aventura.
- Antes de comenzar se muestra el mapa. En Wi-Fi cada jugador confirma que está listo y ambos esperan la carga de recursos.
- Los resultados finales reúnen puntuación del equipo, tiempo, enemigos comunes, minijefes, jefes, total derrotado, caídas, continuaciones y rescates. El rango global promedia los valores originales de desempeño de todas las etapas y jugadores antes de convertirlos a S/A/B/C. El desglose conserva el rango de cada jugador por etapa.

## Supervivencia

- Solitario, dos jugadores con teclado/mandos, o cooperativo entre dos APK por Wi-Fi.
- Una arena por oleada, alternando los reinos de la ruta. No hay etapa final ni límite de oleadas.
- Cada cinco oleadas hay un jefe y elección independiente de bendiciones. La dificultad sube mediante daño, resistencia, frecuencia de ataque, cantidad/combinación de enemigos y más atacantes simultáneos.
- Se mantienen vidas y rescates; no hay continuaciones. Los descansos con jefe recuperan recursos; las oleadas normales no rellenan la vida gratuitamente.
- El récord cuenta oleadas superadas y después puntos acumulados del equipo. Los diez mejores se separan por solitario/cooperativo y dificultad; muestran los personajes: «Anubis y Amaterasu — Oleada 28».
- Los récords son locales. En Wi-Fi el resultado final se guarda en ambos dispositivos cuando reciben el cierre. Salir antes del final no registra la partida.

## Sala Wi-Fi

- El anfitrión elige arcade, supervivencia o versus; en versus también selecciona la arena.
- Cada jugador controla su personaje con los controles habituales de P1 en su dispositivo. El anfitrión representa a P1 y el invitado a P2.
- Versus conserva rondas, K.O., victorias y revancha compartida. El anfitrión ejecuta el combate y reloj; publica a 30 Hz después de simular y el invitado interpola las posiciones. El inicio espera recursos y confirmación del estado inicial; los mensajes anteriores no se reutilizan en una revancha. Los toques breves se conservan hasta el siguiente paso de simulación.
- Pausa compartida y detención al perder la conexión. Dos dispositivos en la misma red privada o punto de acceso, sin servidores externos ni Bluetooth.
- El protocolo usa versión 4: ambos dispositivos deben actualizar la APK. Android conserva el identificador y usa versionCode 4 / versionName 1.3.

## Verificación

```powershell
npm run lint
npm test
npm run test:runs
npm run test:lan
npm run android:sync
# Con JAVA_HOME apuntando al JDK 21:
cd android
.\gradlew.bat assembleDebug --console=plain
```

Se verifican rutas de todas las parejas, ausencia de repeticiones evitables, identidad de cada reino, acumulación de resultados, 31 oleadas, récords, ausencia de continuaciones, tiempo final congelado, snapshots de supervivencia y sincronización del versus. La interfaz se revisó en vertical 360×640 y 390×844, y horizontal 844×390. Se probó el versus con dos instancias reales de App y transporte de prueba entre pestañas: selección, inicio, controles remotos y pausa compartida.

El usuario confirmó el arcade cooperativo de la versión anterior en dos celulares físicos. Las rutas nuevas, supervivencia y versus necesitan una nueva prueba en esos dispositivos, especialmente para evaluar respuesta y dificultad durante partidas largas.

El reino nórdico integra Odín, Thor y Loki como guardianes. Sun Wukong es invitado jugable sin reino propio. La Torre tiene diez rivales más Origen. Los encuentros de jefe de supervivencia rotan por los cinco reinos.
