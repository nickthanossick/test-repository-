/* Preload — runs before the game page, in an isolated world.
   Its only job is to flag to the page that it is running inside the hardened
   desktop shell, which turns on the Ultra-PC graphics tier and the in-page
   anti-tamper guard. Nothing else from Node/Electron is exposed. */
'use strict';

const { contextBridge } = require('electron');

try {
  contextBridge.exposeInMainWorld('__NW_DESKTOP__', true);
} catch (_) {
  /* contextIsolation disabled fallback (should not happen in this build) */
  // eslint-disable-next-line no-undef
  window.__NW_DESKTOP__ = true;
}
