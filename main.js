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
let splashWindow = null;

// Tempo mínimo (ms) que a tela de carregamento fica visível,
// mesmo que o app esteja pronto antes disso (evita "flash" rápido demais)
const SPLASH_MIN_TIME = 1800;

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

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 380,
    height: 420,
    frame: false,
    resizable: false,
    movable: true,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow.show());
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

    show: false,
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Só mostra a janela principal (e fecha a splash) quando o conteúdo
  // já estiver carregado e pronto para ser exibido.
  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  setTimeout(() => setupUpdater(), 1000);
}

app.whenReady().then(() => {
  const splashStart = Date.now();
  createSplashWindow();

  startServer();
  waitForServer(() => {
    const elapsed = Date.now() - splashStart;
    const remaining = Math.max(0, SPLASH_MIN_TIME - elapsed);
    setTimeout(() => createWindow(), remaining);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});