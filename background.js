// Relays the keyboard shortcut (default Alt+Shift+F, user-customizable at
// chrome://extensions/shortcuts) to the content script of the active tab.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-fill-window') return;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_FILL_WINDOW' }).catch(() => {
      // No content script here (not a YouTube tab, or it hasn't been
      // reloaded since the extension was installed/updated). Nothing to do.
    });
  });
});
