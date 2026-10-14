package shop.updater;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;
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
            final DownloadManager fdm = dm;
            final String fName = fileName;
            final long downloadId;
            try {
                downloadId = dm.enqueue(req);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Download failed to start");
                return;
            }
            receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id != downloadId) return;
                    try { c.unregisterReceiver(this); } catch (Exception ignored) {}
                    receiver = null;
                    boolean ok = false;
                    try {
                        DownloadManager.Query q = new DownloadManager.Query().setFilterById(downloadId);
                        Cursor cur = fdm.query(q);
                        if (cur != null) {
                            try {
                                if (cur.moveToFirst()) {
                                    int st = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                                    ok = (st == DownloadManager.STATUS_SUCCESSFUL);
                                }
                            } finally { try { cur.close(); } catch (Exception ignored) {} }
                        }
                    } catch (Exception ignored) {}
                    if (ok) {
                        try {
                            File apk = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), fName);
                            Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", apk);
                            Intent ins = new Intent(Intent.ACTION_VIEW);
                            ins.setDataAndType(uri, "application/vnd.android.package-archive");
                            ins.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                            c.startActivity(ins);
                            return;
                        } catch (Exception ignored) {}
                    }
                    try { Toast.makeText(c, "Update downloaded — open Downloads and tap the APK to install", Toast.LENGTH_LONG).show(); } catch (Exception ignored) {}
                }
            };
            try {
                // Android 13+ throws SecurityException without an explicit export flag.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    ctx.registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_NOT_EXPORTED);
                } else {
                    ctx.registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
                }
            } catch (Exception e) {
                try { ctx.unregisterReceiver(receiver); } catch (Exception ignored) {}
                receiver = null;
                call.reject(e.getMessage() != null ? e.getMessage() : "Could not watch download");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("started", true);
            ret.put("downloadId", downloadId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Download failed");
        }
    }

    @PluginMethod
    public void queryProgress(PluginCall call) {
        long downloadId = -1;
        try { downloadId = call.getData().optLong("downloadId", -1); } catch (Exception ignored) {}
        if (downloadId < 0) {
            call.reject("downloadId required");
            return;
        }
        JSObject ret = new JSObject();
        try {
            DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                call.reject("no download service on this device");
                return;
            }
            Cursor cur = dm.query(new DownloadManager.Query().setFilterById(downloadId));
            boolean found = false;
            if (cur != null) {
                try {
                    if (cur.moveToFirst()) {
                        found = true;
                        int st = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        long dl = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        long total = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                        ret.put("status", st == DownloadManager.STATUS_SUCCESSFUL ? "done"
                                : st == DownloadManager.STATUS_FAILED ? "failed" : "active");
                        ret.put("downloaded", dl);
                        ret.put("total", total);
                    }
                } finally { try { cur.close(); } catch (Exception ignored) {} }
            }
            if (!found) ret.put("status", "unknown");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "query failed");
        }
    }
}
