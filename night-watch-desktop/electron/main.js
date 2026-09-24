/* ═══════════════════════════════════════════════════════════════════════
   IGMC: NIGHT WATCH — Electron main process (hardened).

   Security posture:
     • contextIsolation ON, nodeIntegration OFF, sandbox ON
     • devtools disabled in the packaged build; application menu removed
     • navigation + window.open locked down
     • single-instance lock
   The heavy anti-tamper (asar integrity + fuses) is applied at BUILD time
   by electron-builder ("electronFuses" in package.json).

   Graphics posture (Ultra-PC):
     • high-performance GPU forced, GPU blocklist ignored
     • frame-rate cap lifted, GPU rasterization + zero-copy on
     • fullscreen, background throttling off
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('node:path');

const isDev = !app.isPackaged || process.argv.includes('--dev');

/* ── GPU / performance flags (must be set before app is ready) ─────────── */
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-frame-rate-limit');       // uncapped fps
app.commandLine.appendSwitch('disable-gpu-vsync');              // let the game pace itself
app.commandLine.appendSwitch('canvas-oop-rasterization');
app.commandLine.appendSwitch(
  'enable-features',
  'CanvasOopRasterization,Vulkan,DefaultANGLEVulkan'
);

/* Single instance — a second launch just focuses the running game. */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(createWindow);
}

function createWindow() {
  // No default menu → no View ▸ Toggle DevTools, no reload shortcuts.
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#05060a',
    show: false,
    fullscreen: !isDev,
    autoHideMenuBar: true,
    title: 'IGMC: Night Watch',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      devTools: isDev,               // OFF in the shipped build
      backgroundThrottling: false,   // keep rendering at full rate
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'dist-web', 'index.html'));

  /* Lock navigation: the game is one local page. External links open in the
     user's real browser instead of hijacking the game window. */
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  /* In the packaged build, refuse every attempt to open devtools. */
  if (!isDev) {
    win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());
  }

  /* Allow the game's optional online extras (voice audio, bloom, GLTF) while
     keeping everything else closed. Tighten or remove this block if you
     localise all assets for a fully offline build. */
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const u = details.url;
    const ok =
      u.startsWith('file://') ||
      u.startsWith('data:') ||
      u.startsWith('blob:') ||
      u.startsWith('devtools://') ||
      /^https:\/\/(cdn\.jsdelivr\.net|[a-z0-9.]*fal\.media)\//i.test(u);
    cb({ cancel: !ok });
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
