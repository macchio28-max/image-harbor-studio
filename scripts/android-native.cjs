// Writes MainActivity.java with a JavascriptInterface bridge ("LomaAndroid") that hands images
// received via SEND / SEND_MULTIPLE / VIEW intents (content:// or file://) to the web app as base64.
// Also sets launchMode=singleTask so a second share reuses the open app. Run after `cap add/sync`.
const fs = require("fs");
const path = require("path");
const main = path.join(__dirname, "..", "android", "app", "src", "main");
if (!fs.existsSync(main)) { console.log("android/ non trovato: esegui prima `npx cap add android`"); process.exit(0); }
const dir = path.join(main, "java", "com", "loma", "viewer");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "MainActivity.java"), `package com.loma.viewer;

import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Parcelable;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;
import com.getcapacitor.BridgeWebViewClient;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private final List<JSONObject> readyFiles = new ArrayList<>();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        cleanCache();
        WebView wv = getBridge().getWebView();
        wv.addJavascriptInterface(new Bridge(), "LomaAndroid");
        wv.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                Log.i(TAG, "pagina caricata: " + url);
                pushToJs();
            }
        });
        handleIntent(getIntent());
    }

    private static final String TAG = "LomaAndroid";

    // Pushes pending files to window.__lomaReceiveSharedFiles (cold start + onNewIntent); polling still works.
    private void pushToJs() {
        runOnUiThread(() -> {
            String json;
            synchronized (readyFiles) {
                if (readyFiles.isEmpty()) return;
                JSONArray out = new JSONArray();
                for (JSONObject o : readyFiles) out.put(o);
                json = out.toString();
            }
            String js = "(function(j){if(window.__lomaReceiveSharedFiles){window.__lomaReceiveSharedFiles(j);return 'ok';}return 'wait';})(" + JSONObject.quote(json) + ")";
            getBridge().getWebView().evaluateJavascript(js, res -> {
                Log.i(TAG, "push a JS: " + res);
                if (res != null && res.contains("ok")) synchronized (readyFiles) { readyFiles.clear(); }
            });
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        pushToJs();
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Log.i(TAG, "intent ricevuto, action=" + action + " type=" + intent.getType());
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action) && !Intent.ACTION_VIEW.equals(action)) return;
        LinkedHashSet<Uri> uris = new LinkedHashSet<>();
        ClipData clip = intent.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri u = clip.getItemAt(i).getUri();
                if (u != null) uris.add(u);
            }
        }
        if (intent.hasExtra(Intent.EXTRA_STREAM)) {
            try {
                ArrayList<Parcelable> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null) for (Parcelable p : list) if (p instanceof Uri) uris.add((Uri) p);
            } catch (Exception ignored) {}
            try {
                Parcelable p = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (p instanceof Uri) uris.add((Uri) p);
            } catch (Exception ignored) {}
        }
        if (intent.getData() != null) uris.add(intent.getData());
        Log.i(TAG, "uri trovati: " + uris.size());
        for (Uri u : uris) {
            try {
                getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception e) { Log.i(TAG, "permesso persistente non disponibile per " + u); }
            JSONObject o = read(u);
            if (o != null) synchronized (readyFiles) { readyFiles.add(o); }
        }
        intent.setAction(null);
        intent.setData(null);
        intent.setClipData(null);
        intent.removeExtra(Intent.EXTRA_STREAM);
    }

    private File cacheDir() {
        File d = new File(getCacheDir(), "shared_photos");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    // Removes files left over from previous sessions so the device doesn't fill up.
    private void cleanCache() {
        File[] old = cacheDir().listFiles();
        if (old != null) for (File f : old) f.delete();
    }

    private int seq = 0;

    // Streams the Uri straight to cache (no full-file Base64 in RAM); JS later reads it in chunks.
    private JSONObject read(Uri u) {
        try (InputStream in = getContentResolver().openInputStream(u)) {
            if (in == null) return null;
            String name = nameOf(u);
            String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
            String id = String.valueOf(++seq);
            File out = new File(cacheDir(), "shared_" + System.currentTimeMillis() + "_" + id + "_" + safe);
            long total = 0;
            try (OutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) { os.write(buf, 0, n); total += n; }
            }
            Log.i(TAG, "copiato " + u + " -> " + out.getName() + " byte=" + total);
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("name", name);
            String t = getContentResolver().getType(u);
            o.put("type", t != null ? t : "");
            o.put("size", total);
            o.put("path", out.getAbsolutePath());
            synchronized (cached) { cached.put(id, out); }
            return o;
        } catch (Exception e) {
            Log.e(TAG, "copia fallita " + u, e);
            return null;
        }
    }

    private final java.util.HashMap<String, File> cached = new java.util.HashMap<>();

    private String nameOf(Uri u) {
        if ("content".equals(u.getScheme())) {
            try (Cursor c = getContentResolver().query(u, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (i >= 0) return c.getString(i);
                }
            } catch (Exception ignored) {}
        }
        String s = u.getLastPathSegment();
        return s != null ? s : "condivisa.jpg";
    }

    private class Bridge {
        @JavascriptInterface
        public String takeFiles() {
            synchronized (readyFiles) {
                JSONArray out = new JSONArray();
                for (JSONObject o : readyFiles) out.put(o);
                readyFiles.clear();
                Log.i(TAG, "takeFiles: " + out.length() + " file");
                return out.toString();
            }
        }

        @JavascriptInterface
        public String getFileList() {
            synchronized (readyFiles) {
                JSONArray out = new JSONArray();
                for (JSONObject o : readyFiles) out.put(o);
                return out.toString();
            }
        }

        @JavascriptInterface
        public String getFileChunk(String id, int offset, int length) {
            File f;
            synchronized (cached) { f = cached.get(id); }
            if (f == null || length <= 0) return "";
            try (RandomAccessFile r = new RandomAccessFile(f, "r")) {
                r.seek(offset);
                byte[] b = new byte[(int) Math.min(length, Math.max(0, r.length() - offset))];
                r.readFully(b);
                return Base64.encodeToString(b, Base64.NO_WRAP);
            } catch (Exception e) {
                Log.e(TAG, "chunk fallito " + id, e);
                return "";
            }
        }

        @JavascriptInterface
        public void releaseFile(String id) {
            File f;
            synchronized (cached) { f = cached.remove(id); }
            if (f != null) f.delete();
        }
    }
}
`);
const mf = path.join(main, "AndroidManifest.xml");
let xml = fs.readFileSync(mf, "utf8");
if (/launchMode="[^"]*"/.test(xml)) xml = xml.replace(/android:launchMode="[^"]*"/, 'android:launchMode="singleTask"');
else xml = xml.replace(/(<activity\b)/, '$1 android:launchMode="singleTask"');
fs.writeFileSync(mf, xml);
console.log("MainActivity con ponte immagini Android scritta");
