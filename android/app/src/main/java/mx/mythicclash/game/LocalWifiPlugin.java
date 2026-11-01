package mx.mythicclash.game;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import androidx.activity.result.ActivityResult;
import com.journeyapps.barcodescanner.ScanOptions;
import com.journeyapps.barcodescanner.ScanIntentResult;
import java.util.concurrent.*;

@CapacitorPlugin(name = "LocalWifi")
public class LocalWifiPlugin extends Plugin {
    private final LanTransport transport = new LanTransport();
    private final ExecutorService io = Executors.newCachedThreadPool();
    private final ExecutorService writes = Executors.newSingleThreadExecutor();
    private void event(String name, String key, Object value) {
        JSObject data = new JSObject(); data.put(key, value); notifyListeners(name, data);
    }
    private final LanTransport.Listener events = new LanTransport.Listener() {
        public void connected() { event("peer", "connected", true); }
        public void message(String message) { event("message", "data", message); }
        public void closed(String reason) { event("closed", "reason", reason); }
    };
    @PluginMethod public void host(PluginCall call) {
        io.execute(() -> {
            try {
                LanTransport.HostInfo host = transport.host(events);
                JSObject result = new JSObject(); result.put("addresses", new JSArray(host.addresses)); result.put("port", host.port); result.put("token", host.token); call.resolve(result);
            } catch (Exception error) { call.reject(error.getMessage()); }
        });
    }
    @PluginMethod public void join(PluginCall call) {
        final String host = call.getString("host", ""), token = call.getString("token", ""); final int port = call.getInt("port", 0);
        io.execute(() -> {
            try { transport.join(host, port, token, events); call.resolve(); }
            catch (Exception error) { call.reject("No se pudo entrar. Revisa el Wi-Fi y la invitación."); }
        });
    }
    @PluginMethod public void send(PluginCall call) {
        final String data = call.getString("data", "");
        writes.execute(() -> { try { transport.send(data); call.resolve(); } catch (Exception error) { call.reject("No se pudo enviar el mensaje"); } });
    }
    @PluginMethod public void close(PluginCall call) { transport.close(); call.resolve(); }
    @PluginMethod public void copy(PluginCall call) {
        android.content.ClipboardManager clipboard = (android.content.ClipboardManager) getContext().getSystemService(android.content.Context.CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Invitación Mythic Clash", call.getString("text", ""))); call.resolve();
    }
    @PluginMethod public void scan(PluginCall call) {
        ScanOptions options = new ScanOptions(); options.setDesiredBarcodeFormats(ScanOptions.QR_CODE);
        options.setPrompt("Escanea el QR de la sala Mythic Clash"); options.setBeepEnabled(false); options.setOrientationLocked(false);
        startActivityForResult(call, options.createScanIntent(getContext()), "scanResult");
    }
    @ActivityCallback private void scanResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        ScanIntentResult scan = ScanIntentResult.parseActivityResult(result.getResultCode(), result.getData());
        JSObject data = new JSObject(); if (scan.getContents() != null) data.put("text", scan.getContents()); call.resolve(data);
    }
    @Override protected void handleOnPause() { event("suspended", "paused", true); }
    @Override protected void handleOnDestroy() { transport.shutdown(); io.shutdownNow(); writes.shutdownNow(); }
}
