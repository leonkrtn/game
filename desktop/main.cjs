// Desktop shell for "Rien ne va plus": one fullscreen window running the offline game build.
// The window owns fullscreen, so Esc never drops you out, and Chromium gets the GPU flags for games.
const { app, BrowserWindow, ipcMain, Menu, powerSaveBlocker, shell } = require('electron');
const path = require('node:path');

// Rendering: always use the GPU, prefer the discrete one on dual-GPU Macs, never throttle.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.setName('Rien ne va plus');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    fullscreen: true,
    backgroundColor: '#000000',
    title: 'Rien ne va plus',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  // The page's own fullscreen API would be left with Esc: send it to the window instead.
  win.webContents.on('enter-html-full-screen', () => {
    win.webContents.executeJavaScript('document.exitFullscreen && document.exitFullscreen()').catch(() => {});
    win.setFullScreen(true);
  });
  const report = () => win.webContents.send('fs', win.isFullScreen());
  win.on('enter-full-screen', report);
  win.on('leave-full-screen', report);
  // Links (if any) open in the real browser, never inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  // No zooming the game by accident.
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.on('before-input-event', (event, input) => {
    if ((input.meta || input.control) && ['+', '-', '=', '0'].includes(input.key)) event.preventDefault();
  });
  win.loadFile(path.join(__dirname, 'game.html'));
}

ipcMain.handle('fs:toggle', () => {
  const next = !win.isFullScreen();
  win.setFullScreen(next);
  return next;
});
ipcMain.handle('fs:get', () => win.isFullScreen());
ipcMain.on('quit', () => app.quit());

app.whenReady().then(() => {
  powerSaveBlocker.start('prevent-display-sleep');
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu', submenu: [{ role: 'about', label: 'Über Rien ne va plus' }, { type: 'separator' }, { role: 'hide', label: 'Ausblenden' }, { type: 'separator' }, { role: 'quit', label: 'Beenden' }] },
    { label: 'Ansicht', submenu: [{ role: 'togglefullscreen', label: 'Vollbild' }] },
  ]));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
