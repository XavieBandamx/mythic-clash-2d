import mx.mythicclash.game.LanTransport;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;

public class LanTransportTest {
    static class Events implements LanTransport.Listener {
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        final CountDownLatch connected = new CountDownLatch(1), closed = new CountDownLatch(1);
        public void connected() { connected.countDown(); }
        public void message(String data) { messages.add(data); }
        public void closed(String reason) { closed.countDown(); }
    }
    static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    static class CountWrites extends ByteArrayOutputStream {
        int calls;
        public synchronized void write(byte[] bytes, int offset, int length) { calls++; super.write(bytes, offset, length); }
        public synchronized void write(int value) { calls++; super.write(value); }
    }
    static void delayedPeer() throws Exception {
        int port;
        try (ServerSocket reservation = new ServerSocket(0)) { port = reservation.getLocalPort(); }
        FutureTask<Void> server = new FutureTask<>(() -> {
            Thread.sleep(250);
            try (ServerSocket listener = new ServerSocket(port, 1, InetAddress.getByName("127.0.0.1"))) {
                listener.setSoTimeout(4000);
                try (Socket socket = listener.accept()) {
                    socket.setSoTimeout(4000);
                    DataInputStream input = new DataInputStream(socket.getInputStream());
                    check("a".repeat(32).equals(LanTransport.readFrame(input)), "El reintento perdió la invitación");
                    LanTransport.writeFrame(new DataOutputStream(socket.getOutputStream()), "MYTHIC-LAN-1");
                    check("tras reintentar".equals(LanTransport.readFrame(input)), "No envió datos después de reintentar");
                }
            }
            return null;
        });
        Thread worker = new Thread(server); worker.setDaemon(true); worker.start();
        LanTransport client = new LanTransport();
        try { client.join("127.0.0.1", port, "a".repeat(32), new Events()); client.send("tras reintentar"); server.get(5, TimeUnit.SECONDS); }
        finally { client.shutdown(); server.cancel(true); }
    }
    public static void main(String[] args) throws Exception {
        delayedPeer();
        CountWrites frame = new CountWrites(); LanTransport.writeFrame(new DataOutputStream(frame), "control ágil ⚡");
        check(frame.calls == 1, "La cabecera genera una escritura TCP separada");
        check("control ágil ⚡".equals(LanTransport.readFrame(new DataInputStream(new ByteArrayInputStream(frame.toByteArray())))), "El marco unido no conserva UTF-8");
        LanTransport host = new LanTransport(), guest = new LanTransport(), third = new LanTransport();
        try {
            Events a = new Events(), b = new Events(); LanTransport.HostInfo room = host.host(a, true);
            try (Socket denied = new Socket("127.0.0.1", room.port)) {
                denied.setSoTimeout(2000);
                LanTransport.writeFrame(new DataOutputStream(denied.getOutputStream()), "0".repeat(32));
                check(denied.getInputStream().read() == -1, "Aceptó una invitación ajena");
            }
            guest.join("127.0.0.1", room.port, room.token, b);
            check(a.connected.await(3, TimeUnit.SECONDS) && b.connected.await(3, TimeUnit.SECONDS), "No se conectaron ambos extremos");
            for (int i = 0; i < 100; i++) { host.send("estado " + i + " · bendición ⚡"); guest.send("control " + i); }
            for (int i = 0; i < 100; i++) {
                check(("estado " + i + " · bendición ⚡").equals(b.messages.poll(3, TimeUnit.SECONDS)), "Estado incompleto, desordenado o UTF-8 corrupto");
                check(("control " + i).equals(a.messages.poll(3, TimeUnit.SECONDS)), "Control fuera de orden");
            }
            boolean rejected = false;
            try { third.join("127.0.0.1", room.port, room.token, new Events()); } catch (IOException expected) { rejected = true; }
            check(rejected, "Permitió un tercer jugador");
            guest.send("siguen conectados"); check("siguen conectados".equals(a.messages.poll(3, TimeUnit.SECONDS)), "El tercer jugador interrumpió la partida");
            int oldEpoch = host.epoch();
            guest.close(); check(a.closed.await(3, TimeUnit.SECONDS), "No notificó la desconexión");
            Events nextHost = new Events(), nextGuest = new Events();
            LanTransport.HostInfo nextRoom = host.host(nextHost, true);
            guest.join("127.0.0.1", nextRoom.port, nextRoom.token, nextGuest);
            boolean stale = false;
            try { host.send("estado de la sala anterior", oldEpoch); } catch (IOException expected) { stale = true; }
            check(stale, "Envió un mensaje de una sala cerrada a la siguiente");
            host.send("sala nueva"); check("sala nueva".equals(nextGuest.messages.poll(3, TimeUnit.SECONDS)), "La cola vieja contaminó la sala nueva");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); new DataOutputStream(bytes).writeInt(2 * 1024 * 1024);
            boolean oversized = false;
            try { LanTransport.readFrame(new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()))); } catch (IOException expected) { oversized = true; }
            check(oversized, "Aceptó un paquete fuera del límite");
            check(!LanTransport.local(InetAddress.getByName("8.8.8.8")), "Permitió una dirección pública");
            System.out.println("LAN nativa: reintento con anfitrión tardío, marco único, autenticación, 200 mensajes, UTF-8, cambio de sala y límites aprobados.");
        } finally { host.shutdown(); guest.shutdown(); third.shutdown(); }
    }
}
