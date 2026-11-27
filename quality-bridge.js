(function () {
  'use strict';

  const DEFAULTS = { autoQuality: true, defaultQuality: 'hd1080', useMaxQuality: false };

  function sendSettings() {
    chrome.storage.local.get(DEFAULTS, (settings) => {
      document.dispatchEvent(new CustomEvent('ylh:quality-settings', { detail: settings }));
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.autoQuality || changes.defaultQuality || changes.useMaxQuality) {
      sendSettings();
    }
  });

  document.addEventListener('ylh:quality-request', sendSettings);

  sendSettings();
})();
