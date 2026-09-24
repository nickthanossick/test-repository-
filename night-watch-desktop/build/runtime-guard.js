/* ═══════════════════════════════════════════════════════════════════════
   IGMC: NIGHT WATCH — desktop runtime guard + Ultra-PC graphics tier.

   Injected as a NON-module <script> AFTER the game core. It references only
   the public `window.IGMC` API and standard browser globals, so it keeps
   working after the game core is obfuscated and never reaches into engine
   internals (which would be fragile).

   The Ultra boost works by mutating the numbers the game's OWN quality
   pipeline already reads (IGMC.Quality.cfg.high), then calling the game's
   own apply(). Nothing about the render loop is rewritten.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DESKTOP =
    (typeof window.__NW_DESKTOP__ !== 'undefined' && !!window.__NW_DESKTOP__) ||
    / Electron\//.test(navigator.userAgent || '');

  /* ─────────────── Ultra-PC graphics ─────────────── */
  function boostUltra() {
    try {
      var IGMC = window.IGMC;
      if (!IGMC) return false;
      var Q = IGMC.Quality;
      var R = IGMC.renderer;
      if (!Q || !R || !Q.cfg || !Q.cfg.high) return false;

      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var maxAniso = 16;
      try {
        if (R.capabilities && typeof R.capabilities.getMaxAnisotropy === 'function') {
          maxAniso = R.capabilities.getMaxAnisotropy() || 16;
        }
      } catch (_) {}

      /* On a strong PC we render at native resolution with 4K shadows,
         full anisotropic filtering, more simultaneous room lights and a
         longer draw distance than the mobile-safe defaults. */
      var ULTRA = {
        dpr: dpr, shadows: true, shadowMap: 4096, soft: true,
        aniso: maxAniso, exposure: 1.15, lights: 16, far: 60
      };
      Object.assign(Q.cfg.high, ULTRA);
      if (Q.cfg.ultra) Object.assign(Q.cfg.ultra, ULTRA);

      try { Q.apply('high'); } catch (_) {}
      try { R.setPixelRatio(dpr); } catch (_) {}

      /* Push anisotropy onto textures that are already live. */
      try {
        var MAT = IGMC.MAT || {};
        Object.keys(MAT).forEach(function (k) {
          var m = MAT[k];
          if (m && m.map) { m.map.anisotropy = maxAniso; m.map.needsUpdate = true; }
        });
      } catch (_) {}

      return true;
    } catch (_) { return false; }
  }

  if (DESKTOP) {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (boostUltra() || tries > 80) clearInterval(iv);
    }, 250);
    /* Re-assert once more after the first minute in case the menu's own
       delayed quality pass runs after us. */
    setTimeout(boostUltra, 4000);
    setTimeout(boostUltra, 12000);
  }

  /* ─────────────── Anti-tamper / anti-devtools (desktop only) ───────────────
     The hard enforcement lives in the Electron main process (devtools off,
     menu removed, node integration off, asar integrity fuse). This is the
     belt-and-suspenders layer inside the page. */
  if (DESKTOP) {
    var block = function (e) { e.preventDefault(); e.stopPropagation(); return false; };
    window.addEventListener('contextmenu', block, { capture: true });
    window.addEventListener('dragstart', block, { capture: true });
    window.addEventListener('selectstart', block, { capture: true });

    window.addEventListener('keydown', function (e) {
      var k = (e.key || '').toLowerCase();
      if (e.key === 'F12') return block(e);
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) return block(e);
      if ((e.ctrlKey || e.metaKey) && (k === 'u' || k === 's' || k === 'p')) return block(e);
    }, { capture: true });
  }
})();
