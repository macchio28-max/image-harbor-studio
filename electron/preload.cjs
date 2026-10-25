const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("lomaDesktop", {
  platform: process.platform,
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
});
