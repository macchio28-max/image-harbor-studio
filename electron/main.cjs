// LoMa VIEWER desktop shell. Loads the published web app (works offline via its service worker)
// or a local URL set in LOMA_URL.
const { app, BrowserWindow } = require("electron");

const URL = process.env.LOMA_URL || "https://id-preview--2278fcc4-764e-426c-aed1-58606155f133.lovable.app";

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: "#0b0f17",
    titleBarStyle: "hiddenInset",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(URL);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
