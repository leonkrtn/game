// The only thing the game page gets from the app: fullscreen and quit.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  toggleFullscreen: () => ipcRenderer.invoke('fs:toggle'),
  isFullscreen: () => ipcRenderer.invoke('fs:get'),
  onFullscreen: (cb) => ipcRenderer.on('fs', (_e, on) => cb(on)),
  quit: () => ipcRenderer.send('quit'),
});
