const { app, BrowserWindow, shell, dialog, ipcMain, screen } = require('electron');
const path = require('path');
const http = require('http');
const autoUpdate = require('./auto-update.js');

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
const SPLASH_MIN_TIME = 2800;

// ── Maximizar (manual) ──
// Janelas frame:false + transparent:true têm um bug conhecido no Windows:
// o maximize() nativo às vezes calcula o tamanho errado (estoura a tela,
// cobre a barra de tarefas, deixa sobras). Por isso controlamos isso na
// mão: guardamos o tamanho/posição normal e, ao maximizar, ajustamos a
// janela para a área útil real da tela (workArea).
let isMaximized = false;
let normalBounds = null;

function setMaximizedState(maximized) {
  isMaximized = maximized;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('maximize-state', isMaximized);
  }
}

// IPC: renderer pede para reiniciar e instalar
ipcMain.on('install-update', () => {
  autoUpdate.quitAndInstall();
});

ipcMain.on('window-minimize', () => {
  mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;

  if (!isMaximized) {
    normalBounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(normalBounds) || screen.getPrimaryDisplay();
    mainWindow.setBounds(display.workArea);
    setMaximizedState(true);
  } else {
    if (normalBounds) mainWindow.setBounds(normalBounds);
    setMaximizedState(false);
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
  
    backgroundColor: '#00000000',
    transparent: true,
    maximizable: false,
  
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

  setTimeout(() => autoUpdate.init(mainWindow), 1000);
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