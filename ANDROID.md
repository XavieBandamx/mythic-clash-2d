# Android y cooperativo Wi-Fi local — primera alfa

La app conserva React y Canvas dentro de Capacitor 8. Todos los escenarios, sprites y fuentes se empaquetan en la APK. No usa Google Fonts ni carga el juego desde Vercel al abrirse. La versión web sigue funcionando.

## Instalar y jugar

1. Instala la misma APK en los dos dispositivos Android (Android 7 / API 24 o superior).
2. Para jugar solo no hace falta conectarse a ninguna red.
3. Para el cooperativo conecta ambos dispositivos al mismo Wi-Fi. También se puede probar compartiendo un punto de acceso desde uno de ellos, sin datos móviles; su funcionamiento depende del teléfono y de que la red permita comunicación entre clientes.
4. En la app abre **Cooperativo Wi-Fi**. Uno elige **Crear sala**.
5. El otro elige **Escanear QR del anfitrión**, concede acceso a la cámara cuando Android lo solicite y después toca **Unirme a la sala**. También puede pegar o escribir la invitación completa.
6. En **Mi equipo**, cada jugador elige su dios y toca **Estoy listo**. El anfitrión elige la dificultad e inicia.

Cada teléfono usa sus controles del jugador 1 para manejar a su propio dios. El invitado controla al segundo personaje de la partida; su HUD y su panel de bendición muestran su propio estado. Rescates, enemigos enlazados, guardias, vidas y bendiciones los resuelve el anfitrión.

## Alcance y límites de esta alfa

- Exactamente dos participantes. Sin cuentas, servidores externos, internet ni Bluetooth.
- IPv4 de red privada: 10/8, 172.16/12 y 192.168/16. La sala utiliza un puerto efímero y un secreto aleatorio; no se publica en ningún directorio.
- Si el teléfono muestra varias direcciones, el anfitrión puede elegir la interfaz que comparte con el otro dispositivo antes de escanear el QR.
- Mantén ambos juegos abiertos; el anfitrión debe permanecer en primer plano. Al suspender la app se solicita pausa; si deja de responder se corta la sesión. No hay migración de anfitrión ni recuperación de sala en esta versión.
- Una desconexión detiene la partida y pide volver al menú para crear una nueva sala. El cooperativo local de un solo dispositivo permanece disponible.
- Las redes de invitados de algunos routers aíslan dispositivos. En ese caso hay que usar una red que permita comunicación local o probar un punto de acceso.
- Los récords de la partida se guardan en el anfitrión. El invitado recibe el estado visual y no ejecuta una segunda simulación.
- La APK es de desarrollo, firmada con la clave de depuración local. No es una publicación en Google Play.

## Construir

Requisitos: Node 24, JDK 21, Android SDK 36 y licencias Android aceptadas. Configura `ANDROID_HOME` o el archivo ignorado `android/local.properties` con tu SDK.

```powershell
npm install
npm run android:apk
```

La salida queda en `android/app/build/outputs/apk/debug/app-debug.apk`. `capacitor.config.ts` no contiene `server.url`: se cargan los recursos incluidos. `android:sync` reconstruye y copia `dist` a la app; las copias generadas no se versionan ni duplican los sprites fuente en Git.

## Modos y actualización 1.1

La sala ahora permite arcade, supervivencia cooperativa y versus 1 contra 1. El anfitrión selecciona el modo y, en versus, la arena. Ambos teléfonos deben instalar la versión nueva: el protocolo Wi-Fi es versión 2. Se conserva el identificador de la aplicación y la firma de depuración para actualizar la instalación anterior.

Consulta [MODOS.md](MODOS.md) para las rutas variables, resultados finales, reglas de supervivencia, récords y pruebas de los modos nuevos. La confirmación del usuario en celulares físicos corresponde al arcade cooperativo anterior; los modos nuevos todavía requieren esa prueba.

## Arquitectura y pruebas

- `LocalWifiPlugin.java` conecta la interfaz Capacitor con `LanTransport.java` (sockets TCP y marcos UTF-8 con longitud).
- La autenticación permite un solo compañero con la invitación completa. El transporte rechaza direcciones públicas, un tercer jugador y mensajes de más de 1 MiB.
- `src/lan/session.ts` gestiona personajes, listo, controles, pausa, carga, comandos y desconexión. El invitado no puede enviar estados del mundo al anfitrión.
- El anfitrión simula a 60 Hz; envía copias visuales a hasta 20 Hz. El invitado interpola posiciones y cámara y conserva las clases y referencias de actores, monturas, rescates y tácticas. No se transmiten imágenes.
- El QR se genera localmente. ZXing incorpora el lector en la APK, sin descargar modelos.

```powershell
npm run lint
npm test
npm run test:lan
./tools/test-lan-native.ps1
```

Las pruebas LAN verifican identidad de actores, referencias circulares, rescates, guardias, cambios de reino, entradas y autoridad. La prueba Java ejecuta el transporte nativo real en JVM con dos extremos, 200 mensajes, UTF-8, rechazo de invitación incorrecta y tercer participante, desconexión y límites de tamaño.

Se comprobó además el flujo de dos instancias en navegador con un transporte local de prueba: sala, selección, listo, inicio, movimiento del invitado, copia visual y pausa. Esto **no sustituye la validación en dos teléfonos físicos**, pendiente por falta de dispositivos conectados. Las pantallas de sala se revisaron en vertical pequeña y horizontal.
