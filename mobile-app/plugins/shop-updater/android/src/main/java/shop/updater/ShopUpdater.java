package shop.updater;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
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
import java.io.FileInputStream;
import java.security.MessageDigest;

@CapacitorPlugin(name = "ShopUpdater")
public class ShopUpdater extends Plugin {
    private BroadcastReceiver receiver = null;

    @PluginMethod
    public void fetchAndInstall(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "Shop-Ledger-Mobile-update.apk");
        final String expectedSha256 = call.getString("expectedSha256", "");
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
            // Save into the app's OWN external files dir. Scoped storage (API 29+)
            // can make a public Downloads file unreadable to the installer via
            // FileProvider, which is the usual cause of "update offered but
            // install fails". An app-owned file is always shareable.
            req.setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, fileName);
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
                            File apk = new File(c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fName);
                            // Integrity gate: never hand an unverified APK to the installer.
                            if (!apk.isFile() || apk.length() == 0) {
                                toastSafe(c, "Update blocked: download missing");
                                return;
                            }
                            if (expectedSha256 != null && !expectedSha256.isEmpty()) {
                                String want = expectedSha256.trim().toLowerCase();
                                if (want.startsWith("sha256:")) want = want.substring(7);
                                String got = sha256Hex(apk);
                                if (got == null || !got.equalsIgnoreCase(want)) {
                                    try { apk.delete(); } catch (Exception ignored) {}
                                    toastSafe(c, "Update blocked: checksum mismatch");
                                    return;
                                }
                            }
                            String apkSigner = apkSignerSha256(c, apk.getAbsolutePath());
                            String ownSigner = ownSignerSha256(c);
                            if (apkSigner == null || ownSigner == null || !apkSigner.equalsIgnoreCase(ownSigner)) {
                                try { apk.delete(); } catch (Exception ignored) {}
                                toastSafe(c, "Update blocked: signature mismatch");
                                return;
                            }
                            Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", apk);
                            Intent ins = new Intent(Intent.ACTION_VIEW);
                            ins.setDataAndType(uri, "application/vnd.android.package-archive");
                            ins.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                            // Some Android versions only grant the URI through
                            // the intent's clip data, not the data field.
                            ins.setClipData(ClipData.newRawUri("", uri));
                            c.startActivity(ins);
                            return;
                        } catch (Exception ignored) {}
                    }
                    try { Toast.makeText(c, "Update downloaded - open Downloads and tap the APK to install", Toast.LENGTH_LONG).show(); } catch (Exception ignored) {}
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

    // ---------- integrity helpers ----------
    private static void toastSafe(Context c, String msg) {
        try { Toast.makeText(c, msg, Toast.LENGTH_LONG).show(); } catch (Exception ignored) {}
    }

    private static String sha256Hex(File f) {
        FileInputStream in = null;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            in = new FileInputStream(f);
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            try { if (in != null) in.close(); } catch (Exception ignored) {}
        }
    }

    private static String sha256Hex(Signature sig) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(sig.toByteArray());
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private static String apkSignerSha256(Context ctx, String apkPath) {
        try {
            PackageManager pm = ctx.getPackageManager();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo info = pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNING_CERTIFICATES);
                if (info == null || info.signingInfo == null) return null;
                Signature[] sigs = info.signingInfo.getApkContentsSigners();
                return (sigs != null && sigs.length > 0) ? sha256Hex(sigs[0]) : null;
            } else {
                PackageInfo info = pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNATURES);
                if (info == null || info.signatures == null || info.signatures.length == 0) return null;
                return sha256Hex(info.signatures[0]);
            }
        } catch (Exception e) {
            return null;
        }
    }

    private static String ownSignerSha256(Context ctx) {
        try {
            PackageManager pm = ctx.getPackageManager();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo info = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                if (info == null || info.signingInfo == null) return null;
                Signature[] sigs = info.signingInfo.getApkContentsSigners();
                return (sigs != null && sigs.length > 0) ? sha256Hex(sigs[0]) : null;
            } else {
                PackageInfo info = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNATURES);
                if (info == null || info.signatures == null || info.signatures.length == 0) return null;
                return sha256Hex(info.signatures[0]);
            }
        } catch (Exception e) {
            return null;
        }
    }
}
