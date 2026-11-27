(function () {
  'use strict';

  const DEFAULTS = { jumpToLive: true, autoNextLive: false };

  function sendSettings() {
    chrome.storage.local.get(DEFAULTS, (settings) => {
      document.dispatchEvent(new CustomEvent('ylh:live-settings', { detail: settings }));
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.jumpToLive || changes.autoNextLive) sendSettings();
  });

  document.addEventListener('ylh:live-request', sendSettings);

  sendSettings();
})();
