const { app, BrowserWindow, Menu, shell, session, screen, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { DisplayController, validResolution } = require('./display-controller.cjs');
const { GAME_URL, isGameURL, isExternalURL, allowPermission } = require('./policy.cjs');
const { startDisplayMode } = require('./display-mode.cjs');
let window;
let displayMode;
let selectedResolution = 1080;
let resolutionRequests = 0;
let saveDisplaySettings = Promise.resolve();
let restoringForQuit = false;
let failing = false;
async function loadGame() {
  if (!window || window.isDestroyed()) return;
  failing = false;
  try { await window.loadURL(GAME_URL); }
  catch { await showOffline(); }
}
async function showOffline() {
  if (failing || !window || window.isDestroyed()) return;
  failing = true;
  await window.loadFile(path.join(__dirname, 'offline.html')).catch(() => {});
}
async function createWindow() {
  try {
    const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'display-settings.json'), 'utf8'));
    if (validResolution(saved.height)) selectedResolution = saved.height;
  } catch { /* First launch keeps the default resolution. */ }
  displayMode = new DisplayController(size => startDisplayMode({
    resourcesPath: app.isPackaged ? process.resourcesPath : __dirname,
    displayId: window ? screen.getDisplayMatching(window.getBounds()).id : screen.getPrimaryDisplay().id,
    ...size,
  }));
  const initialMode = await displayMode.change(selectedResolution);
  window = new BrowserWindow({
    title: 'Office Core', width: 1920, height: 1080, minWidth: 960, minHeight: 600,
    backgroundColor: '#102630', show: false, fullscreen: true, icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, partition: 'persist:office-core' },
  });
  window.once('ready-to-show', () => {
    window.show();
    if (!initialMode.ok) void dialog.showMessageBox(window, { type: 'warning', message: 'Skärmen kunde inte växla till den sparade upplösningen.', detail: 'Spelet körs i fullskärm med skärmens nuvarande upplösning.\n' + initialMode.error });
  });
  window.on('closed', () => { window = undefined; void displayMode.restore(true); });
  window.on('enter-full-screen', () => { if (!resolutionRequests) void displayMode.change(selectedResolution); });
  window.on('leave-full-screen', () => { void displayMode.restore(); });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalURL(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isGameURL(url)) {
      event.preventDefault();
      if (isExternalURL(url)) void shell.openExternal(url);
    }
  });
  window.webContents.on('will-redirect', (event, url, _inPlace, mainFrame) => {
    if (mainFrame && !isGameURL(url)) event.preventDefault();
  });
  window.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
    if (mainFrame && code !== -3) void showOffline();
  });
  window.webContents.on('render-process-gone', () => { void showOffline(); });
  void loadGame();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  ipcMain.handle('office-core:set-resolution', async (event, height) => {
    if (!window || event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        !isGameURL(event.senderFrame.url) || !validResolution(height)) {
      return { ok: false, error: 'Upplösningen kunde inte ändras.' };
    }
    resolutionRequests++;
    try {
      const result = await displayMode.change(height);
      if (result.ok) {
        selectedResolution = height;
        saveDisplaySettings = saveDisplaySettings.then(() => fs.writeFile(path.join(app.getPath('userData'), 'display-settings.json'), JSON.stringify({ height }))).catch(() => {});
        await saveDisplaySettings;
      }
      return result;
    } finally { resolutionRequests--; }
  });
  ipcMain.on('office-core:quit', event => {
    if (window && event.sender === window.webContents &&
        event.senderFrame === window.webContents.mainFrame &&
        isGameURL(event.senderFrame.url)) app.quit();
  });
  app.on('before-quit', event => {
    if (!displayMode || restoringForQuit) return;
    event.preventDefault();
    restoringForQuit = true;
    void displayMode.restore(true).finally(() => app.quit());
  });
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(() => {
    const gameSession = session.fromPartition('persist:office-core');
    gameSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(allowPermission(permission, details.requestingUrl || contents.getURL())));
    gameSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => allowPermission(permission, requestingOrigin));
    const template = [
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: 'Spel', submenu: [{ label: 'Återanslut / ladda om', accelerator: 'CmdOrCtrl+R', click: () => { void loadGame(); } }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: process.platform === 'darwin' ? 'close' : 'quit' }] },
      { role: 'editMenu' },
      { label: 'Hjälp', submenu: [{ label: 'Öppna i webbläsaren', click: () => shell.openExternal(GAME_URL) }, { label: 'Om desktopversionen', click: () => require('electron').dialog.showMessageBox(window, { type: 'info', title: 'Office Core', message: `Office Core ${app.getVersion()}`, detail: 'Desktopversionen kör den publicerade spelklienten. Internet krävs. Spelinnehållet uppdateras via webbversionen; desktopprogrammet uppdateras genom en ny installation.' }) }] },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
