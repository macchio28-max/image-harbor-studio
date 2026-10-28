// Adds SEND / SEND_MULTIPLE (Share menu) and VIEW ("Apri con...") image intent filters
// to the generated android/app/src/main/AndroidManifest.xml. Idempotent; run after `cap add/sync`.
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "android", "app", "src", "main", "AndroidManifest.xml");
if (!fs.existsSync(file)) { console.log("android/ non trovato: esegui prima `npx cap add android`"); process.exit(0); }
let xml = fs.readFileSync(file, "utf8");
// Activity attributes + permissions are enforced every run (idempotent).
xml = xml.replace(/<activity\b[^>]*MainActivity[^>]*>/, (tag) => {
  let t = tag;
  t = /android:launchMode="[^"]*"/.test(t) ? t.replace(/android:launchMode="[^"]*"/, 'android:launchMode="singleTask"') : t.replace("<activity", '<activity android:launchMode="singleTask"');
  t = /android:exported="[^"]*"/.test(t) ? t.replace(/android:exported="[^"]*"/, 'android:exported="true"') : t.replace("<activity", '<activity android:exported="true"');
  return t;
});
const perms = [
  '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
  '<uses-permission android:name="android.permission.READ_MEDIA_VISUAL_USER_SELECTED" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
];
for (const p of perms) {
  const name = p.match(/name="([^"]+)"/)[1];
  if (!xml.includes(`"${name}"`)) xml = xml.replace("</manifest>", `    ${p}\n</manifest>`);
}
// Android 11+ package visibility: without <queries> setPackage() to these apps fails silently.
const pkgs = ["com.openai.chatgpt", "com.facebook.stellar", "com.google.android.apps.bard", "com.google.android.apps.labs.flow",
  "com.adobe.lrmobile", "com.google.android.apps.docs", "com.microsoft.skydrive", "com.google.android.gm", "com.microsoft.office.outlook",
  "it.libero.mail", "com.yahoo.mobile.client.android.mail", "com.whatsapp", "org.localsend.localsend_app"];
xml = xml.replace(/\n?\s*<queries>[\s\S]*?<!-- loma-queries -->[\s\S]*?<\/queries>/, "");
const queries = `    <queries><!-- loma-queries -->
${pkgs.map((p) => `        <package android:name="${p}" />`).join("\n")}
        <intent><action android:name="android.intent.action.SEND" /><data android:mimeType="image/*" /></intent>
    </queries>`;
xml = xml.replace("</manifest>", `${queries}\n</manifest>`);
if (xml.includes("loma-intents")) { fs.writeFileSync(file, xml); console.log("Intent filter già presenti, attività e permessi aggiornati"); process.exit(0); }
const raw = ["image/x-canon-cr2", "image/x-canon-cr3", "image/x-nikon-nef", "image/x-sony-arw", "image/x-panasonic-rw2", "image/x-olympus-orf", "image/x-adobe-dng", "image/tiff"];
const ext = ["dng", "cr2", "cr3", "nef", "arw", "rw2", "orf", "tif", "tiff"];
const filters = `
            <!-- loma-intents -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND_MULTIPLE" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:mimeType="image/*" />
${raw.map((m) => `                <data android:mimeType="${m}" />`).join("\n")}
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:scheme="content" android:mimeType="application/octet-stream" />
${ext.map((e) => `                <data android:pathPattern=".*\\\\.${e}" />`).join("\n")}
            </intent-filter>
`;
xml = xml.replace(/(<activity\b[^>]*MainActivity[^>]*>)/, `$1${filters}`);
fs.writeFileSync(file, xml);
console.log("Intent filter SEND/VIEW aggiunti ad AndroidManifest.xml");
