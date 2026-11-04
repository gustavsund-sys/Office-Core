const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('officeCoreDesktop', Object.freeze({
  setResolution: height => ipcRenderer.invoke('office-core:set-resolution', height),
  quit: () => ipcRenderer.send('office-core:quit'),
}));
