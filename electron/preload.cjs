const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("lomaDesktop", {
  platform: process.platform,
  isReadOnly: (p) => ipcRenderer.invoke("loma:isReadOnly", p),
  getPathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ""; } },
  pickApp: (name) => ipcRenderer.invoke("loma:pickApp", name),
  getApps: () => ipcRenderer.invoke("loma:getApps"),
  setApp: (name, p) => ipcRenderer.invoke("loma:setApp", name, p),
  openDialog: (opts) => ipcRenderer.invoke("loma:openDialog", opts),
  launchApp: (exe, files) => ipcRenderer.invoke("loma:launchApp", exe, files),
  launchWithData: async (exe, fileName, blob) =>
    ipcRenderer.invoke("loma:launchWithData", exe, fileName, new Uint8Array(await blob.arrayBuffer())),
  clearCache: () => ipcRenderer.invoke("loma:clearCache"),
  getInitialFile: () => ipcRenderer.invoke("loma:getInitialFile"),
  onFileOpened: (cb) => {
    const h = (_e, f) => cb(f);
    ipcRenderer.on("loma:onFileOpened", h);
    return () => ipcRenderer.removeListener("loma:onFileOpened", h);
  },
  openPath: (p) => ipcRenderer.invoke("loma:openPath", p),
  openExternal: (u) => ipcRenderer.invoke("loma:openExternal", u),
  cloudDir: (kind) => ipcRenderer.invoke("loma:cloudDir", kind),
  pickFolder: (title, start) => ipcRenderer.invoke("loma:pickFolder", title, start),
  saveToFolder: async (dir, name, src) =>
    ipcRenderer.invoke("loma:saveToFolder", dir, name, typeof src === "string" ? src : new Uint8Array(await src.arrayBuffer())),
  copyImage: async (blob) => ipcRenderer.invoke("loma:copyImage", new Uint8Array(await blob.arrayBuffer())),
  shareFile: async (src, name) =>
    ipcRenderer.invoke("loma:shareFile", typeof src === "string" ? src : new Uint8Array(await src.arrayBuffer()), name),
  getGoogleToken: () => ipcRenderer.invoke("loma:getGoogleToken"),
  hasGoogleToken: () => ipcRenderer.invoke("loma:hasGoogleToken"),
  signOutGoogle: () => ipcRenderer.invoke("loma:signOutGoogle"),
  getMsToken: (cid) => ipcRenderer.invoke("loma:getMsToken", cid),
  hasMsToken: () => ipcRenderer.invoke("loma:hasMsToken"),
  signOutMs: () => ipcRenderer.invoke("loma:signOutMs"),
  showInFolder: (p) => ipcRenderer.invoke("loma:showInFolder", p),
});
