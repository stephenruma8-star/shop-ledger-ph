package shop.updater;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "ShopUpdater")
public class ShopUpdater extends Plugin {
    private BroadcastReceiver receiver = null;

    @PluginMethod
    public void fetchAndInstall(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "Shop-Ledger-Mobile-update.apk");
        if (url == null || url.isEmpty()) {
            call.reject("download url required");
            return;
        }
        Context ctx = getContext();
        // Android 8+: sideloading needs a per-app opt-in first.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!ctx.getPackageManager().canRequestPackageInstalls()) {
                try {
                    Intent si = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + ctx.getPackageName()));
                    si.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(si);
                } catch (Exception ignored) {}
                call.reject("ENABLE_INSTALL: allow installs for Shop Ledger, then tap Download again");
                return;
            }
        }
        try {
            if (receiver != null) {
                try { ctx.unregisterReceiver(receiver); } catch (Exception ignored) {}
                receiver = null;
            }
            DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                call.reject("no download service on this device");
                return;
            }
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle("Shop Ledger update");
            req.setDescription("Downloading new version…");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            req.setMimeType("application/vnd.android.package-archive");
            final long mine = dm.enqueue(req);
            receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id != mine) return;
                    try { c.unregisterReceiver(this); } catch (Exception ignored) {}
                    receiver = null;
                    try {
                        File apk = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), fileName);
                        Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", apk);
                        Intent ins = new Intent(Intent.ACTION_VIEW);
                        ins.setDataAndType(uri, "application/vnd.android.package-archive");
                        ins.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        c.startActivity(ins);
                    } catch (Exception ignored) {}
                }
            };
            ctx.registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
            JSObject ret = new JSObject();
            ret.put("started", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Download failed");
        }
    }
}
