package shop.printer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.app.Activity;
import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;

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

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        if (html == null || html.isEmpty()) {
            call.reject("html required");
            return;
        }
        String jobName = call.getString("jobName", "Shop Ledger Receipt");
        Activity activity = (Activity) getContext();
        activity.runOnUiThread(() -> {
            WebView webView = new WebView(getContext());
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    try {
                        PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                        printManager.print(jobName, adapter, new PrintAttributes.Builder().build());
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject(e.getMessage() != null ? e.getMessage() : "Print failed");
                    }
                }
            });
            webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
}
