// YouTube Fill Window
//
// The problem this solves: the browser's native Fullscreen API always
// expands to cover the *entire monitor*, which fights with split-screen /
// snapped windows. Instead of calling requestFullscreen(), this toggles a
// CSS class that pins the player to fill the current tab's own viewport
// (100vw / 100vh). Because those units are scoped to the tab's own
// rendered area — not the physical screen — this fills just your window's
// share of the screen, whether that's an OS window-snap or a browser
// split-tab view.

(() => {
  const ACTIVE_CLASS = 'ytwf-active';
  const PLAYER_SELECTOR = '#movie_player';
  const AUTO_ENABLE_KEY = 'ytwfAutoEnable';

  let isActive = false;
  let moveState = null; // tracks #movie_player's original spot, so it can go back

  function getPlayer() {
    return document.querySelector(PLAYER_SELECTOR);
  }

  // Certain ancestor CSS properties (transform, filter, contain,
  // will-change — YouTube uses these for sticky-player behavior on
  // narrower/responsive layouts, which split-screen widths can trigger)
  // turn that ancestor into the containing block for a position:fixed
  // descendant, trapping our player inside it instead of the true
  // viewport. Moving the player to be a direct child of <body> while
  // active sidesteps this regardless of which ancestor was responsible.
  function movePlayerOut(player) {
    if (moveState) return;
    const placeholder = document.createComment('ytwf-placeholder');
    player.parentNode.insertBefore(placeholder, player);
    document.body.appendChild(player);
    moveState = { placeholder };
  }

  function movePlayerBack(player) {
    if (!moveState) return;
    const { placeholder } = moveState;
    if (placeholder?.parentNode) {
      placeholder.parentNode.replaceChild(player, placeholder);
    }
    moveState = null;
  }

  // YouTube's own resize handling recalculates the <video> element's size
  // based on its container's bounding box. Dispatching resize events after
  // we change the container's CSS nudges YouTube into rescaling correctly.
  function nudgeResize() {
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
  }

  function applyState(active) {
    isActive = active;
    document.documentElement.classList.toggle(ACTIVE_CLASS, active);
    const player = getPlayer();
    if (player) {
      if (active) {
        movePlayerOut(player);
        player.classList.add(ACTIVE_CLASS);
      } else {
        player.classList.remove(ACTIVE_CLASS);
        movePlayerBack(player);
      }
    }
    nudgeResize();
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

  // Escape exits, same as native fullscreen would.
  document.addEventListener(
    'keydown',
    (e) => {
      if (isActive && e.key === 'Escape') disable();
    },
    true
  );

  // Messages from the popup and from background.js (keyboard shortcut).
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
      case 'TOGGLE_FILL_WINDOW':
        toggle();
        sendResponse({ active: isActive });
        break;
      case 'GET_STATE':
        sendResponse({ active: isActive });
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

  // ---- In-player button, placed next to YouTube's own fullscreen button ----
  function ensureControlButton() {
    const player = getPlayer();
    if (!player) return;
    const controls = player.querySelector('.ytp-right-controls');
    if (!controls || controls.querySelector('.ytwf-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'ytp-button ytwf-btn';
    btn.title = 'Fill window (stays inside this browser window)';
    btn.setAttribute('aria-label', 'Fill window');
    btn.innerHTML =
      '<svg viewBox="0 0 36 36" width="100%" height="100%">' +
      '<rect x="8" y="9" width="20" height="18" rx="2" fill="none" stroke="#fff" stroke-width="1.8"></rect>' +
      '<line x1="8" y1="14.5" x2="28" y2="14.5" stroke="#fff" stroke-width="1.8"></line>' +
      '</svg>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    const fsBtn = controls.querySelector('.ytp-fullscreen-button');
    if (fsBtn) controls.insertBefore(btn, fsBtn);
    else controls.appendChild(btn);
  }

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

  // ---- Keep working across YouTube's single-page-app navigation ----
  const throttledEnsureButton = throttle(ensureControlButton, 500);

  const observer = new MutationObserver(() => {
    throttledEnsureButton();
    if (isActive) {
      const player = getPlayer();
      if (player && !player.classList.contains(ACTIVE_CLASS)) {
        movePlayerOut(player);
        player.classList.add(ACTIVE_CLASS);
        nudgeResize();
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(ensureControlButton, 300);
    if (isActive) setTimeout(() => applyState(true), 300);
  });

  // ---- Optional: auto-enable on every video, per saved preference ----
  chrome.storage?.sync?.get([AUTO_ENABLE_KEY], (result) => {
    if (result && result[AUTO_ENABLE_KEY]) {
      setTimeout(enable, 700);
    }
  });

  setTimeout(ensureControlButton, 500);
})();
