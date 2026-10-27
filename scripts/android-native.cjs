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
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
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
        getBridge().getWebView().addJavascriptInterface(new Bridge(), "LomaAndroid");
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
        runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(
            "window.__lomaAndroidFiles && window.__lomaAndroidFiles()", null));
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
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
        for (Uri u : uris) {
            JSONObject o = read(u);
            if (o != null) synchronized (readyFiles) { readyFiles.add(o); }
        }
        intent.setAction(null);
        intent.setData(null);
        intent.setClipData(null);
        intent.removeExtra(Intent.EXTRA_STREAM);
    }

    private JSONObject read(Uri u) {
        try (InputStream in = getContentResolver().openInputStream(u)) {
            if (in == null) return null;
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            JSONObject o = new JSONObject();
            o.put("name", nameOf(u));
            String t = getContentResolver().getType(u);
            o.put("type", t != null ? t : "");
            o.put("data", Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
            return o;
        } catch (Exception e) {
            return null;
        }
    }

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
                return out.toString();
            }
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
