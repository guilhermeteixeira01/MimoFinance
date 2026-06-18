const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const http = require('http');

if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, {
    electron: require(`${__dirname}/node_modules/electron`)
  });
}

let serverPort = 3131;
let mainWindow = null;

// ── Configuração do auto-updater ──
autoUpdater.autoDownload = true;          // baixa em background
autoUpdater.autoInstallOnAppQuit = true;  // instala quando o app fechar

function setupUpdater() {
  // Verifica atualizações silenciosamente ao iniciar
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update-downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    console.error('Erro no auto-updater:', err);
    mainWindow.webContents.send('update-error', { message: err.message });
  });
}

// IPC: renderer pede para reiniciar e instalar
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.on('window-minimize', () => {
  mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow.close();
});

function startServer() {
  process.env.PORT = serverPort;
  require('./server.js');
}

function waitForServer(callback, tries = 0) {
  http.get(`http://localhost:${serverPort}/api/dados`, () => {
    callback();
  }).on('error', () => {
    if (tries < 30) setTimeout(() => waitForServer(callback, tries + 1), 200);
    else console.error('Servidor não respondeu a tempo');
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 600,
    minHeight: 500,
  
    frame: false,
  
    backgroundColor: '#07070f',
  
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    },

    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  setTimeout(() => setupUpdater(), 1000);
}

app.whenReady().then(() => {
  startServer();
  waitForServer(() => createWindow());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});