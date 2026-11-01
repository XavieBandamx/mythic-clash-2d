package mx.mythicclash.game;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** Sockets y enmarcado independientes de Android para poder probar el transporte real en JVM. */
public final class LanTransport {
    public interface Listener { void connected(); void message(String data); void closed(String reason); }
    public static final class HostInfo {
        public final List<String> addresses; public final int port; public final String token;
        HostInfo(List<String> addresses, int port, String token) { this.addresses = addresses; this.port = port; this.token = token; }
    }
    private final ExecutorService workers = Executors.newCachedThreadPool();
    private final Object writeLock = new Object();
    private volatile ServerSocket server;
    private volatile Socket peer;
    private volatile int generation;
    public static boolean local(InetAddress address) { return address.isSiteLocalAddress() || address.isLinkLocalAddress() || address.isLoopbackAddress(); }
    public static void writeFrame(DataOutputStream out, String message) throws IOException {
        byte[] bytes = message.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 1 || bytes.length > 1024 * 1024) throw new IOException("Mensaje demasiado grande");
        out.writeInt(bytes.length); out.write(bytes); out.flush();
    }
    public static String readFrame(DataInputStream in) throws IOException {
        int length = in.readInt();
        if (length < 1 || length > 1024 * 1024) throw new IOException("Mensaje inválido");
        byte[] bytes = new byte[length]; in.readFully(bytes); return new String(bytes, StandardCharsets.UTF_8);
    }
    public synchronized void close() {
        generation++;
        try { if (peer != null) peer.close(); } catch (IOException ignored) {}
        try { if (server != null) server.close(); } catch (IOException ignored) {}
        peer = null; server = null;
    }
    public void shutdown() { close(); workers.shutdownNow(); }
    public HostInfo host(Listener events) throws IOException { return host(events, false); }
    public HostInfo host(Listener events, boolean allowLoopback) throws IOException {
        close(); final int round = generation;
        List<String> addresses = new ArrayList<>();
        for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!network.isUp() || network.isLoopback()) continue;
            for (InetAddress address : Collections.list(network.getInetAddresses())) if (address instanceof Inet4Address && address.isSiteLocalAddress()) addresses.add(address.getHostAddress());
        }
        if (addresses.isEmpty() && allowLoopback) addresses.add("127.0.0.1");
        if (addresses.isEmpty()) throw new IOException("Conéctate al Wi-Fi o activa un punto de acceso antes de crear la sala");
        final ServerSocket listener = new ServerSocket(0);
        synchronized (this) { if (generation != round) { listener.close(); throw new IOException("Sala cerrada"); } server = listener; }
        final String token = UUID.randomUUID().toString().replace("-", "");
        workers.execute(() -> {
            try {
                while (generation == round && !listener.isClosed()) {
                    Socket candidate = listener.accept();
                    try {
                        candidate.setSoTimeout(4000); candidate.setTcpNoDelay(true);
                        if (!local(candidate.getInetAddress()) || peer != null) throw new IOException("Sala ocupada");
                        String supplied = readFrame(new DataInputStream(candidate.getInputStream()));
                        if (!MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8))) throw new IOException("Invitación inválida");
                        synchronized (this) {
                            if (generation != round) throw new IOException("Sala cerrada");
                            writeFrame(new DataOutputStream(candidate.getOutputStream()), "MYTHIC-LAN-1"); peer = candidate;
                        }
                        candidate.setSoTimeout(10000); events.connected();
                        workers.execute(() -> read(candidate, round, events));
                    } catch (Exception denied) { try { candidate.close(); } catch (IOException ignored) {} }
                }
            } catch (IOException error) { if (generation == round) { close(); events.closed("La sala se cerró"); } }
        });
        return new HostInfo(addresses, listener.getLocalPort(), token);
    }
    public void join(String host, int port, String token, Listener events) throws IOException {
        close(); final int round = generation; Socket candidate = new Socket();
        try {
            if (!host.matches("\\d{1,3}(\\.\\d{1,3}){3}") || !token.matches("[a-f0-9]{32}") || port < 1024 || port > 65535) throw new IOException("Invitación inválida");
            InetAddress address = InetAddress.getByName(host);
            if (!local(address)) throw new IOException("La dirección debe pertenecer a la red local");
            candidate.connect(new InetSocketAddress(address, port), 6000); candidate.setSoTimeout(6000); candidate.setTcpNoDelay(true);
            writeFrame(new DataOutputStream(candidate.getOutputStream()), token);
            if (!"MYTHIC-LAN-1".equals(readFrame(new DataInputStream(candidate.getInputStream())))) throw new IOException("Versión de sala incompatible");
            synchronized (this) { if (generation != round) throw new IOException("Conexión cancelada"); peer = candidate; }
            candidate.setSoTimeout(10000); events.connected(); workers.execute(() -> read(candidate, round, events));
        } catch (IOException error) { candidate.close(); throw error; }
    }
    public void send(String data) throws IOException {
        synchronized (writeLock) {
            Socket socket = peer;
            if (socket == null || socket.isClosed()) throw new IOException("Compañero desconectado");
            writeFrame(new DataOutputStream(socket.getOutputStream()), data);
        }
    }
    private void read(Socket socket, int round, Listener events) {
        try {
            DataInputStream in = new DataInputStream(socket.getInputStream());
            while (round == generation && socket == peer) events.message(readFrame(in));
        } catch (IOException error) { if (round == generation && socket == peer) { close(); events.closed("Se perdió la conexión con el compañero"); } }
    }
}
