(function () {
  'use strict';

  if (window.top !== window) return;

  const STYLE_ID = 'ylh-hide-thumbnail-actions';
  const CSS = 'ytd-thumbnail #hover-overlays ytd-thumbnail-overlay-toggle-button-renderer{display:none!important;}';

  function applyStyle(on) {
    const existing = document.getElementById(STYLE_ID);
    if (on) {
      if (existing) return;
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = CSS;
      (document.head || document.documentElement).appendChild(s);
    } else if (existing) {
      existing.remove();
    }
  }

  chrome.storage.local.get(['hideThumbnailActions'], (stored) => {
    applyStyle(stored.hideThumbnailActions !== false);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.hideThumbnailActions) return;
    applyStyle(changes.hideThumbnailActions.newValue !== false);
  });
})();
