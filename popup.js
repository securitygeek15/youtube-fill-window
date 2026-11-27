const toggleRow = document.getElementById('toggleRow');
const pipBtn = document.getElementById('pipBtn');
const statusEl = document.getElementById('status');
const autoEnableEl = document.getElementById('autoEnable');
const shortcutKeysEl = document.getElementById('shortcutKeys');
const changeShortcutBtn = document.getElementById('changeShortcut');

const AUTO_ENABLE_KEY = 'ytwfAutoEnable';

function setPressed(active) {
  toggleRow.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function setStatus(text, warn = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('warn', warn);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refresh() {
  const tab = await getActiveTab();
  if (!tab?.url || !tab.url.includes('youtube.com')) {
    setStatus('Open a YouTube video tab to use this.', true);
    toggleRow.disabled = true;
    if (pipBtn) pipBtn.disabled = true;
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATE' });
    toggleRow.disabled = false;
    if (pipBtn) pipBtn.disabled = false;
    setPressed(!!res?.active);

    if (res?.isPiP) {
      setStatus('Picture-in-Picture active.');
    } else if (res?.active) {
      setStatus('Fill Window active on this tab.');
    } else {
      setStatus('Ready on this video.');
    }
  } catch {
    setStatus('Reload this tab (Ctrl+R) to activate.', true);
    toggleRow.disabled = true;
  }
}

toggleRow.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_FILL_WINDOW' });
    setPressed(!!res?.active);
    setStatus(res?.active ? 'Fill Window active.' : 'Off.');
  } catch {
    setStatus('Reload this tab (Ctrl+R) to activate.', true);
  }
});

if (pipBtn) {
  pipBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PIP' });
      setStatus(res?.isPiP ? 'Picture-in-Picture opened!' : 'Picture-in-Picture closed.');
    } catch {
      setStatus('Reload this tab (Ctrl+R) to activate.', true);
    }
  });
}

autoEnableEl.addEventListener('change', () => {
  chrome.storage.sync.set({ [AUTO_ENABLE_KEY]: autoEnableEl.checked });
});

chrome.storage.sync.get([AUTO_ENABLE_KEY], (result) => {
  autoEnableEl.checked = !!result[AUTO_ENABLE_KEY];
});

chrome.commands.getAll((commands) => {
  const cmd = commands.find((c) => c.name === 'toggle-fill-window');
  shortcutKeysEl.textContent = cmd?.shortcut || 'Alt+Shift+F';
});

changeShortcutBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

refresh();
