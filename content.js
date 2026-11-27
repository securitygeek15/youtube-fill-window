// YouTube Fill Window - Content Script
// Features: Window Fill, Floating Glass Dynamic Island HUD, Picture-in-Picture (PiP), Edge-to-Edge Zoom

(() => {
  const ACTIVE_CLASS = 'ytwf-active';
  const CROP_CLASS = 'ytwf-crop-fill';
  const BTN_ACTIVE_CLASS = 'ytwf-active-btn';
  const PLAYER_SELECTOR = '#movie_player';
  const AUTO_ENABLE_KEY = 'ytwfAutoEnable';

  let isActive = false;
  let isCropFill = false;
  let moveState = null;
  let hudEl = null;
  let hudTimer = null;
  let hudHovered = false;

  function getPlayer() {
    return document.querySelector(PLAYER_SELECTOR);
  }

  function getVideo() {
    return document.querySelector('#movie_player video') || document.querySelector('video');
  }

  function isWatchPage() {
    const path = window.location.pathname;
    return path === '/watch' || path.startsWith('/embed/');
  }

  function isTypingContext(e) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      return true;
    }
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return true;
    }
    if (e.composedPath) {
      return e.composedPath().some((el) => el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    }
    return false;
  }

  function formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // ========================================================
  // PICTURE-IN-PICTURE (PiP)
  // ========================================================
  async function togglePiP() {
    const video = getVideo();
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
    updateHudState();
  }

  // ========================================================
  // DOM MOVEMENT (Prevent containing-block clipping)
  // ========================================================
  function movePlayerOut(player) {
    if (moveState) return;
    const placeholder = document.createComment('ytwf-placeholder');
    player.parentNode.insertBefore(placeholder, player);
    document.body.appendChild(player);
    moveState = { placeholder, originalParent: placeholder.parentNode };
  }

  function movePlayerBack(player) {
    if (!moveState) return;
    const { placeholder, originalParent } = moveState;

    if (placeholder && placeholder.parentNode && document.contains(placeholder)) {
      placeholder.parentNode.replaceChild(player, placeholder);
    } else if (originalParent && document.contains(originalParent)) {
      originalParent.appendChild(player);
      if (placeholder && placeholder.parentNode) placeholder.remove();
    } else {
      const natural = document.querySelector('ytd-player#ytd-player, #player-container-inner, #player-container, #player');
      if (natural) natural.appendChild(player);
      if (placeholder && placeholder.parentNode) placeholder.remove();
    }
    moveState = null;
  }

  function nudgeResize() {
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
  }

  // ========================================================
  // FLOATING GLASS DYNAMIC ISLAND HUD
  // ========================================================
  function createHud() {
    if (hudEl) return hudEl;

    hudEl = document.createElement('div');
    hudEl.className = 'ytwf-glass-hud';
    hudEl.innerHTML = `
      <!-- Play/Pause -->
      <button type="button" class="ytwf-hud-btn ytwf-hud-play" title="Play/Pause (Space)">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </button>

      <!-- Scrub Box -->
      <div class="ytwf-hud-scrub-wrap">
        <span class="ytwf-hud-time">0:00</span>
        <div class="ytwf-hud-progress-bg">
          <div class="ytwf-hud-progress-bar"></div>
        </div>
      </div>

      <!-- Speed Cycler -->
      <button type="button" class="ytwf-hud-btn ytwf-hud-speed-btn" title="Playback Speed (Click to cycle)">1x</button>

      <!-- Split-Screen Zoom/Fit -->
      <button type="button" class="ytwf-hud-btn ytwf-hud-zoom" title="Toggle Edge-to-Edge Zoom (Z)">
        <svg viewBox="0 0 24 24"><path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"/></svg>
      </button>

      <!-- Picture-in-Picture -->
      <button type="button" class="ytwf-hud-btn ytwf-hud-pip" title="Picture-in-Picture (P)">
        <svg viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg>
      </button>

      <!-- Exit Fill Window -->
      <button type="button" class="ytwf-hud-btn ytwf-hud-exit" title="Exit Fill Window (Esc)">
        <svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-14v3h3v2h-5V5h2z"/></svg>
      </button>
    `;

    // HUD Button Handlers
    const playBtn = hudEl.querySelector('.ytwf-hud-play');
    const speedBtn = hudEl.querySelector('.ytwf-hud-speed-btn');
    const zoomBtn = hudEl.querySelector('.ytwf-hud-zoom');
    const pipBtn = hudEl.querySelector('.ytwf-hud-pip');
    const exitBtn = hudEl.querySelector('.ytwf-hud-exit');
    const progressBg = hudEl.querySelector('.ytwf-hud-progress-bg');

    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const video = getVideo();
      if (!video) return;
      if (video.paused) video.play();
      else video.pause();
    });

    const speeds = [1, 1.25, 1.5, 1.75, 2];
    speedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const video = getVideo();
      if (!video) return;
      const currentIdx = speeds.indexOf(video.playbackRate);
      const nextIdx = (currentIdx + 1) % speeds.length;
      video.playbackRate = speeds[nextIdx];
      speedBtn.textContent = `${speeds[nextIdx]}x`;
    });

    zoomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCrop();
    });

    pipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePiP();
    });

    exitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      disable();
    });

    // Progress Bar Scrubbing
    progressBg.addEventListener('click', (e) => {
      e.stopPropagation();
      const video = getVideo();
      if (!video || !video.duration) return;
      const rect = progressBg.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      video.currentTime = ratio * video.duration;
    });

    // Hover detection to avoid auto-hiding while user hovers the HUD
    hudEl.addEventListener('mouseenter', () => {
      hudHovered = true;
      clearTimeout(hudTimer);
    });
    hudEl.addEventListener('mouseleave', () => {
      hudHovered = false;
      showHud();
    });

    return hudEl;
  }

  function showHud() {
    if (!isActive || !hudEl) return;
    hudEl.classList.add('visible');
    clearTimeout(hudTimer);
    if (!hudHovered) {
      hudTimer = setTimeout(() => {
        if (!hudHovered && hudEl) hudEl.classList.remove('visible');
      }, 2600);
    }
  }

  function updateHudState() {
    if (!hudEl) return;
    const video = getVideo();

    // Play/Pause icon
    const playBtn = hudEl.querySelector('.ytwf-hud-play');
    if (playBtn && video) {
      playBtn.innerHTML = video.paused
        ? '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    }

    // Time & Progress
    const timeEl = hudEl.querySelector('.ytwf-hud-time');
    const barEl = hudEl.querySelector('.ytwf-hud-progress-bar');
    if (timeEl && barEl && video && video.duration) {
      timeEl.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
      const pct = (video.currentTime / video.duration) * 100;
      barEl.style.width = `${pct}%`;
    }

    // Zoom indicator
    const zoomBtn = hudEl.querySelector('.ytwf-hud-zoom');
    if (zoomBtn) {
      zoomBtn.classList.toggle('active', isCropFill);
    }

    // PiP indicator
    const pipBtn = hudEl.querySelector('.ytwf-hud-pip');
    if (pipBtn) {
      pipBtn.classList.toggle('active', !!document.pictureInPictureElement);
    }
  }

  function setupPlayerHud(player) {
    if (!hudEl) {
      createHud();
    }
    if (!player.contains(hudEl)) {
      player.appendChild(hudEl);
    }

    // Show HUD on player mousemove
    player.addEventListener('mousemove', showHud);
    player.addEventListener('click', showHud);

    const video = getVideo();
    if (video) {
      video.addEventListener('timeupdate', updateHudState);
      video.addEventListener('play', updateHudState);
      video.addEventListener('pause', updateHudState);
      video.addEventListener('enterpictureinpicture', updateHudState);
      video.addEventListener('leavepictureinpicture', updateHudState);
    }
  }

  // ========================================================
  // IN-PLAYER BUTTON (NATIVE YOUTUBE BAR)
  // ========================================================
  function updateControlButton() {
    const btn = document.querySelector('.ytwf-btn');
    if (!btn) return;

    if (isActive) {
      btn.innerHTML =
        '<svg viewBox="0 0 36 36" width="100%" height="100%">' +
        '<rect x="7" y="7" width="22" height="22" rx="3" fill="none" stroke="#fff" stroke-width="2.2"></rect>' +
        '<line x1="7" y1="13.5" x2="29" y2="13.5" stroke="#fff" stroke-width="1.8"></line>' +
        '<polyline points="22,25 22,20 27,20" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
        '<line x1="22" y1="20" x2="28" y2="14" stroke="#fff" stroke-width="1.8" stroke-linecap="round"></line>' +
        '</svg>';
      btn.title = 'Exit Fill Window (Esc)';
      btn.setAttribute('aria-label', 'Exit Fill Window');
      btn.setAttribute('aria-pressed', 'true');
      btn.classList.add(BTN_ACTIVE_CLASS);
    } else {
      btn.innerHTML =
        '<svg viewBox="0 0 36 36" width="100%" height="100%">' +
        '<rect x="8" y="9" width="20" height="18" rx="2" fill="none" stroke="#fff" stroke-width="1.8"></rect>' +
        '<line x1="8" y1="14.5" x2="28" y2="14.5" stroke="#fff" stroke-width="1.8"></line>' +
        '</svg>';
      btn.title = 'Fill Window (Alt+Shift+F or W)';
      btn.setAttribute('aria-label', 'Fill Window');
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove(BTN_ACTIVE_CLASS);
    }
  }

  function ensureControlButton() {
    if (!isWatchPage()) {
      const existing = document.querySelector('.ytwf-btn');
      if (existing) existing.remove();
      return;
    }

    const player = getPlayer();
    if (!player) return;
    const controls = player.querySelector('.ytp-right-controls');
    if (!controls) return;

    let btn = controls.querySelector('.ytwf-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'ytp-button ytwf-btn';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
      });

      const fsBtn = controls.querySelector('.ytp-fullscreen-button');
      if (fsBtn) controls.insertBefore(btn, fsBtn);
      else controls.appendChild(btn);
    }

    updateControlButton();
  }

  // ========================================================
  // STATE MANAGEMENT
  // ========================================================
  function applyCropState(crop) {
    isCropFill = crop;
    document.documentElement.classList.toggle(CROP_CLASS, crop && isActive);
    const player = getPlayer();
    if (player) {
      player.classList.toggle(CROP_CLASS, crop && isActive);
    }
    updateHudState();
    nudgeResize();
  }

  function toggleCrop() {
    applyCropState(!isCropFill);
  }

  function applyState(active) {
    if (active && !isWatchPage()) {
      active = false;
    }

    isActive = active;
    document.documentElement.classList.toggle(ACTIVE_CLASS, active);
    document.documentElement.classList.toggle(CROP_CLASS, active && isCropFill);

    const player = getPlayer();
    if (player) {
      if (active) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        movePlayerOut(player);
        player.classList.add(ACTIVE_CLASS);
        player.classList.toggle(CROP_CLASS, isCropFill);
        setupPlayerHud(player);
        showHud();
      } else {
        player.classList.remove(ACTIVE_CLASS);
        player.classList.remove(CROP_CLASS);
        if (hudEl) hudEl.classList.remove('visible');
        movePlayerBack(player);
      }
    }

    updateControlButton();
    updateHudState();
    nudgeResize();
    notifyBackground();
  }

  function toggle() {
    applyState(!isActive);
  }
  function enable() {
    if (!isActive) applyState(true);
  }
  function disable() {
    if (isActive) applyState(false);
  }

  function notifyBackground() {
    try {
      chrome.runtime?.sendMessage?.({ type: 'STATE_CHANGED', active: isActive })?.catch?.(() => {});
    } catch (_) {}
  }

  // ========================================================
  // KEYBOARD SHORTCUTS
  // ========================================================
  document.addEventListener(
    'keydown',
    (e) => {
      // Escape key exits Fill Window
      if (e.key === 'Escape' && isActive) {
        const openPopup = document.querySelector(
          '.ytp-popup:not([style*="display: none"]), .ytp-settings-menu:not([style*="display: none"])'
        );
        if (openPopup && openPopup.offsetWidth > 0 && openPopup.offsetHeight > 0) {
          return;
        }
        disable();
        e.stopPropagation();
        return;
      }

      if (isTypingContext(e)) return;

      // 'P' key toggles Picture-in-Picture
      if ((e.key === 'p' || e.key === 'P') && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        togglePiP();
        return;
      }

      // 'W' key toggles Fill Window
      if ((e.key === 'w' || e.key === 'W') && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        toggle();
        return;
      }

      // 'Z' key toggles Zoom / Crop when active
      if (isActive && (e.key === 'z' || e.key === 'Z') && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        toggleCrop();
        return;
      }
    },
    true
  );

  // Runtime messaging
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
      case 'TOGGLE_FILL_WINDOW':
        toggle();
        sendResponse({ active: isActive, isPiP: !!document.pictureInPictureElement });
        break;
      case 'TOGGLE_PIP':
        togglePiP();
        sendResponse({ active: isActive, isPiP: !!document.pictureInPictureElement });
        break;
      case 'TOGGLE_CROP':
        toggleCrop();
        sendResponse({ active: isActive, isCropFill });
        break;
      case 'GET_STATE':
        sendResponse({
          active: isActive,
          isCropFill,
          isPiP: !!document.pictureInPictureElement,
          isWatchPage: isWatchPage()
        });
        break;
      case 'SET_STATE':
        applyState(!!message.active);
        sendResponse({ active: isActive });
        break;
      default:
        break;
    }
    return true;
  });

  function throttle(fn, wait) {
    let last = 0;
    let scheduled = null;
    return (...args) => {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        last = now;
        fn(...args);
      } else if (!scheduled) {
        scheduled = setTimeout(() => {
          last = Date.now();
          scheduled = null;
          fn(...args);
        }, remaining);
      }
    };
  }

  const throttledEnsureButton = throttle(ensureControlButton, 300);

  const observer = new MutationObserver(() => {
    throttledEnsureButton();
    if (isActive) {
      const player = getPlayer();
      if (player && !player.classList.contains(ACTIVE_CLASS)) {
        movePlayerOut(player);
        player.classList.add(ACTIVE_CLASS);
        player.classList.toggle(CROP_CLASS, isCropFill);
        setupPlayerHud(player);
        nudgeResize();
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('yt-navigate-finish', () => {
    if (!isWatchPage()) {
      if (isActive) disable();
      return;
    }
    setTimeout(ensureControlButton, 300);
    if (isActive) {
      setTimeout(() => applyState(true), 300);
    }
  });

  // Auto-enable preference
  chrome.storage?.sync?.get([AUTO_ENABLE_KEY], (result) => {
    if (result && result[AUTO_ENABLE_KEY] && isWatchPage()) {
      setTimeout(enable, 600);
    }
  });

  setTimeout(ensureControlButton, 500);
})();
