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
    public static void main(String[] args) throws Exception {
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
            guest.close(); check(a.closed.await(3, TimeUnit.SECONDS), "No notificó la desconexión");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); new DataOutputStream(bytes).writeInt(2 * 1024 * 1024);
            boolean oversized = false;
            try { LanTransport.readFrame(new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()))); } catch (IOException expected) { oversized = true; }
            check(oversized, "Aceptó un paquete fuera del límite");
            check(!LanTransport.local(InetAddress.getByName("8.8.8.8")), "Permitió una dirección pública");
            System.out.println("LAN nativa: autenticación, dos jugadores, 200 mensajes ordenados, UTF-8, desconexión y límites aprobados.");
        } finally { host.shutdown(); guest.shutdown(); third.shutdown(); }
    }
}
