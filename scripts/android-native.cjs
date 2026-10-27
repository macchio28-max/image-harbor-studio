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

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private final ArrayList<Uri> pending = new ArrayList<>();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new Bridge(), "LomaAndroid");
        collect(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        collect(intent);
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
            "window.__lomaAndroidFiles && window.__lomaAndroidFiles()", null));
    }

    private synchronized void collect(Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String a = intent.getAction();
        if (Intent.ACTION_SEND.equals(a)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) pending.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(a)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) pending.addAll(list);
        } else if (Intent.ACTION_VIEW.equals(a) && intent.getData() != null) {
            pending.add(intent.getData());
        }
        intent.setAction(null);
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
        public synchronized String takeFiles() {
            JSONArray out = new JSONArray();
            for (Uri u : pending) {
                try (InputStream in = getContentResolver().openInputStream(u)) {
                    if (in == null) continue;
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[1 << 16];
                    int n;
                    while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                    JSONObject o = new JSONObject();
                    o.put("name", nameOf(u));
                    o.put("type", getContentResolver().getType(u));
                    o.put("data", Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
                    out.put(o);
                } catch (Exception ignored) {}
            }
            pending.clear();
            return out.toString();
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
