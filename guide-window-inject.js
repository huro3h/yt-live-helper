(function () {
  'use strict';

  if (window.top !== window) return;

  const SCROLLER_SELECTOR = '#guide-inner-content';
  const SCROLL_RESTORE_DELAYS_MS = [1500, 3000];

  let refreshing = false;

  function cookie(name) {
    for (const part of document.cookie.split('; ')) {
      const at = part.indexOf('=');
      if (part.slice(0, at) === name) return part.slice(at + 1);
    }
    return null;
  }

  async function sha1Hex(text) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function authorization() {
    const sapisid = cookie('SAPISID') || cookie('__Secure-3PAPISID');
    if (!sapisid) return null;
    const now = Math.floor(Date.now() / 1000);
    return `SAPISIDHASH ${now}_${await sha1Hex(`${now} ${sapisid} ${location.origin}`)}`;
  }

  async function fetchGuide() {
    const ytcfg = window.ytcfg;
    const context = ytcfg && ytcfg.get('INNERTUBE_CONTEXT');
    const auth = await authorization();
    if (!context || !auth) return null;
    const res = await fetch('/youtubei/v1/guide?prettyPrint=false', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        authorization: auth,
        'x-origin': location.origin,
        'x-goog-authuser': String(ytcfg.get('SESSION_INDEX') ?? 0),
      },
      body: JSON.stringify({ context }),
    });
    return res.ok ? res.json() : null;
  }

  function liveKey(data) {
    const parts = [];
    const walk = (node) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const entry = node.guideEntryRenderer;
      const id = entry && entry.navigationEndpoint?.browseEndpoint?.browseId;
      if (id && id.startsWith('UC')) parts.push(`${id}:${entry.badges?.liveBroadcasting ? 1 : 0}`);
      Object.values(node).forEach(walk);
    };
    walk(data);
    return parts.join(',');
  }

  async function refresh() {
    if (refreshing) return;
    const guide = document.querySelector('ytd-guide-renderer');
    const controller = guide && guide.polymerController;
    if (!controller || !controller.data) return;
    refreshing = true;
    try {
      const fresh = await fetchGuide();
      const key = fresh ? liveKey(fresh) : '';
      if (!key || key === liveKey(controller.data)) return;
      const scroller = document.querySelector(SCROLLER_SELECTOR);
      const scrollTop = scroller ? scroller.scrollTop : 0;
      controller.data = fresh;
      if (scroller && scrollTop) {
        for (const delay of SCROLL_RESTORE_DELAYS_MS) {
          setTimeout(() => {
            scroller.scrollTop = scrollTop;
          }, delay);
        }
      }
    } catch (e) {
    } finally {
      refreshing = false;
    }
  }

  document.addEventListener('ylh:guide-refresh', refresh);
})();
