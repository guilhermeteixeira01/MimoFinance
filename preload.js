const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updater', {
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, data) => cb(data)),
  onUpdateProgress:   (cb) => ipcRenderer.on('update-progress',   (_, data) => cb(data)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, data) => cb(data)),
  onUpdateError:      (cb) => ipcRenderer.on('update-error',      (_, data) => cb(data)),
  installUpdate: () => ipcRenderer.send('install-update'),
});

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close')
});
