const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('officeCoreDesktop', Object.freeze({
  quit: () => ipcRenderer.send('office-core:quit'),
}));
