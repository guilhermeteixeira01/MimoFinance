/**
 * Auto Update
 * ------------
 * Usa o electron-updater para checar, baixar e instalar atualizações
 * automaticamente, a partir dos releases publicados no GitHub
 * (configurado em package.json > build > publish).
 *
 * Mesma arquitetura do NeuraCS Launcher: a lógica do autoUpdater fica
 * isolada aqui, fora do main.js, e este módulo expõe init/checkForUpdates/
 * quitAndInstall. Os nomes dos canais IPC foram mantidos iguais aos que o
 * preload.js e o app.js já usam (update-available, update-progress,
 * update-downloaded, update-error), então o front-end não precisa mudar.
 *
 * Fluxo:
 * 1. App abre → init(mainWindow) → checkForUpdates()
 * 2. Se tem update disponível → autoUpdater baixa automaticamente
 *    (autoDownload = true, igual já era no main.js antigo)
 * 3. Quando termina de baixar → avisa a renderer (botão "Reiniciar e atualizar")
 * 4. Usuário clica → quitAndInstall()
 * 5. Enquanto o app fica aberto, reverifica a cada 4h (igual NeuraCS)
 *
 * IMPORTANTE: autoUpdater só funciona em app empacotado (.exe/.dmg/.AppImage
 * instalado), NÃO funciona com `npm start` / `electron .` em modo dev.
 * Para testar de verdade, gere um build com `npm run build` (local, sem
 * publicar) ou `npm run release` (builda E publica no GitHub Releases).
 */

const { autoUpdater } = require('electron-updater');
const { app } = require('electron');

let mainWindow = null;

// Reverifica de tempos em tempos enquanto o app fica aberto — assim,
// se uma atualização sair enquanto o usuário já está com o app aberto há
// horas, ele ainda vai detectar sem precisar reabrir.
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 horas

function init(win) {
  mainWindow = win;

  autoUpdater.autoDownload = true;          // baixa em background, sem perguntar
  autoUpdater.autoInstallOnAppQuit = true;  // instala quando o app fechar

  autoUpdater.on('update-available', (info) => {
    send('update-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    send('update-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    send('update-downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdate] Erro:', err);
    send('update-error', { message: err?.message || String(err) });
  });

  // Primeira checagem logo no boot...
  checkForUpdates();

  // ...e depois reverifica periodicamente enquanto o app estiver aberto.
  setInterval(() => {
    checkForUpdates();
  }, CHECK_INTERVAL_MS);
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function checkForUpdates() {
  // Evita erro feio em modo dev (sem app empacotado / sem release publicado)
  if (!app.isPackaged) {
    console.log('[AutoUpdate] Ignorado: app não está empacotado (modo dev).');
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[AutoUpdate] Falha ao checar updates:', err);
  });
}

function quitAndInstall() {
  autoUpdater.quitAndInstall();
}

module.exports = {
  init,
  checkForUpdates,
  quitAndInstall,
};
