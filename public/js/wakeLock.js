'use strict';
(function () {
  const DRAW = window.DRAW;
  if (!DRAW) {
    console.error('[DRAW] wakeLock.js loaded before state.js');
    return;
  }

  const WakeLock = {
    sentinel: null,
    wanted: false,

    isSupported() {
      return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
    },

    /** Request a screen wake lock. Idempotent. */
    async acquire() {
      this.wanted = true;
      if (!this.isSupported()) return false;
      if (this.sentinel && !this.sentinel.released) return true;
      try {
        this.sentinel = await navigator.wakeLock.request('screen');
        this.sentinel.addEventListener('release', () => {
          // Browser released it (tab hidden, battery, etc.).
          // We'll try again when the page becomes visible.
          this.sentinel = null;
        });
        return true;
      } catch (err) {
        // NotAllowedError on some browsers when the page isn't focused yet.
        console.warn('[wakeLock] acquire failed:', err && err.message);
        return false;
      }
    },

    async release() {
      this.wanted = false;
      if (!this.sentinel) return;
      try {
        await this.sentinel.release();
      } catch {}
      this.sentinel = null;
    },

    init() {
      if (!this.isSupported()) {
        // Silent — the app still works, just without screen lock.
        return;
      }

      // Re-acquire whenever the page becomes visible and we still want it.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.wanted) {
          this.acquire();
        }
      });

      // First user interaction acquires the lock (required on some browsers).
      const firstTouch = () => {
        this.acquire();
        window.removeEventListener('pointerdown', firstTouch);
        window.removeEventListener('keydown', firstTouch);
        window.removeEventListener('touchstart', firstTouch);
      };
      window.addEventListener('pointerdown', firstTouch, { once: false });
      window.addEventListener('keydown', firstTouch, { once: false });
      window.addEventListener('touchstart', firstTouch, { once: false, passive: true });

      // Auto-acquire on load if the tab is already visible.
      if (document.visibilityState === 'visible') {
        this.acquire();
      }
    },
  };

  DRAW.WakeLock = WakeLock;
})();
