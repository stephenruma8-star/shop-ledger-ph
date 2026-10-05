package shop.printer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.util.Base64;

import java.net.InetSocketAddress;
import java.net.Socket;

@CapacitorPlugin(name = "ShopPrinter")
public class ShopPrinter extends Plugin {
    @PluginMethod
    public void send(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 9100);
        String data = call.getString("data");
        if (host == null || host.isEmpty() || data == null) {
            call.reject("host and data required");
            return;
        }
        final byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("bad data");
            return;
        }
        new Thread(() -> {
            try (Socket sock = new Socket()) {
                sock.connect(new InetSocketAddress(host, port), 10000);
                sock.getOutputStream().write(bytes);
                sock.getOutputStream().flush();
                Thread.sleep(300);
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Print failed");
            }
        }).start();
    }
}
