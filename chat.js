(function () {
  'use strict';

  if (!location.pathname.startsWith('/live_chat')) return;

  const MAX_WAIT_MS = 15000;
  const POLL_INTERVAL_MS = 300;

  const HIDE_STYLES = {
    hidePinned: {
      id: 'ylh-hide-pinned',
      css: 'yt-live-chat-banner-renderer:has(yt-live-chat-text-message-renderer){display:none!important;}',
    },
    hidePolls: {
      id: 'ylh-hide-polls',
      css:
        '#action-panel:has(yt-live-chat-poll-renderer),' +
        'yt-live-chat-banner-renderer:has(yt-live-chat-poll-renderer)' +
        '{display:none!important;}',
    },
  };

  function applyStyle(key, on) {
    const def = HIDE_STYLES[key];
    const existing = document.getElementById(def.id);
    if (on) {
      if (existing) return;
      const s = document.createElement('style');
      s.id = def.id;
      s.textContent = def.css;
      (document.head || document.documentElement).appendChild(s);
    } else if (existing) {
      existing.remove();
    }
  }

  let done = false;
  let opened = false;

  function startAllChat() {
    const startedAt = Date.now();
    (function tick() {
      if (done) return;
      trySwitch();
      if (!done && Date.now() - startedAt < MAX_WAIT_MS) {
        setTimeout(tick, POLL_INTERVAL_MS);
      }
    })();
  }

  function getMenuItems(selector) {
    let items = selector.querySelectorAll('tp-yt-paper-listbox a');
    if (!items.length) items = selector.querySelectorAll('#menu a');
    if (!items.length) items = selector.querySelectorAll('a.yt-dropdown-menu');
    return Array.from(items);
  }

  function trySwitch() {
    const selector = document.querySelector('#view-selector');
    if (!selector) return;

    const trigger =
      selector.querySelector('#trigger') ||
      selector.querySelector('tp-yt-paper-button');
    if (!trigger) return;

    if (!opened) {
      trigger.click();
      opened = true;
      return;
    }

    const items = getMenuItems(selector);
    if (items.length < 2) return;

    const selectedIdx = items.findIndex(
      (el) =>
        el.getAttribute('aria-selected') === 'true' ||
        el.classList.contains('iron-selected')
    );
    const lastIdx = items.length - 1;

    if (selectedIdx === lastIdx) {
      trigger.click();
    } else {
      items[lastIdx].click();
    }
    done = true;
  }

  chrome.storage.local.get(['allChat', 'hidePinned', 'hidePolls'], (stored) => {
    const allChat = typeof stored.allChat === 'boolean' ? stored.allChat : true;
    const hidePinned =
      typeof stored.hidePinned === 'boolean' ? stored.hidePinned : true;
    const hidePolls =
      typeof stored.hidePolls === 'boolean' ? stored.hidePolls : true;
    if (hidePinned) applyStyle('hidePinned', true);
    if (hidePolls) applyStyle('hidePolls', true);
    if (allChat) startAllChat();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.hidePinned) applyStyle('hidePinned', changes.hidePinned.newValue !== false);
    if (changes.hidePolls) applyStyle('hidePolls', changes.hidePolls.newValue !== false);
  });
})();
