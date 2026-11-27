(function () {
  'use strict';

  if (window.top !== window) return;

  const STEP_MS = 500;
  const BUDGET_MS = 60000;
  const DEFAULT_LIKE_DELAY_SEC = 120;
  const MIN_LIKE_DELAY_SEC = 10;
  const MAX_LIKE_DELAY_SEC = 3600;
  const SETTLE_MS = 2000;
  const DONE_KEY = 'ylh:auto-liked';
  const CLIENT_VERSION_FALLBACK = '2.20240101.00.00';

  let settings = null;
  let runToken = 0;
  let cachedClientVersion = null;

  const normalizePath = (href) => {
    let path = href;
    try {
      path = decodeURIComponent(href);
    } catch (e) {
    }
    return path.replace(/\/+$/, '').toLowerCase();
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const onLivePage = () => !!document.querySelector('.ytp-time-display.ytp-live');

  const CHANNEL_LIVE_RE = /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/live\/?$/;

  const isWatchPath = () =>
    location.pathname === '/watch' ||
    location.pathname.startsWith('/live/') ||
    CHANNEL_LIVE_RE.test(location.pathname);

  function currentVideoId() {
    const params = new URLSearchParams(location.search);
    const id = params.get('v');
    if (id) return id;
    const match = location.pathname.match(/^\/live\/([^/?#]+)/);
    if (match) return match[1];
    const flexy = document.querySelector('ytd-watch-flexy');
    return (flexy && flexy.getAttribute('video-id')) || null;
  }

  function currentChannelPath() {
    const match = location.pathname.match(CHANNEL_LIVE_RE);
    if (match) return normalizePath(`/${match[1]}`);
    const link = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint');
    const href = link && link.getAttribute('href');
    return href ? normalizePath(href) : null;
  }

  function favoriteFor(channel) {
    if (!channel) return null;
    return (
      settings.favoriteChannels.find(
        (favorite) => typeof favorite.path === 'string' && normalizePath(favorite.path) === channel
      ) || null
    );
  }

  const signedIn = () => !!document.querySelector('#avatar-btn');

  function likeButton() {
    const buttons = document.querySelectorAll('like-button-view-model button[aria-pressed]');
    for (const button of buttons) {
      if (button.closest('#movie_player')) continue;
      if (button.checkVisibility()) return button;
    }
    return null;
  }

  function readDone() {
    try {
      const list = JSON.parse(sessionStorage.getItem(DONE_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  const isDone = (videoId) => readDone().includes(videoId);

  function markDone(videoId) {
    try {
      const list = readDone().filter((id) => id !== videoId);
      list.push(videoId);
      sessionStorage.setItem(DONE_KEY, JSON.stringify(list.slice(-50)));
    } catch (e) {
    }
  }

  function clientVersion() {
    if (cachedClientVersion) return cachedClientVersion;
    let version = null;
    try {
      const html = document.documentElement.innerHTML;
      const match =
        html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([\d.]+)"/) ||
        html.match(/"clientVersion":"([\d.]+)"/);
      version = match && match[1];
    } catch (e) {
      version = null;
    }
    cachedClientVersion = version || CLIENT_VERSION_FALLBACK;
    return cachedClientVersion;
  }

  async function liveVideoId(path) {
    try {
      const res = await fetch('/youtubei/v1/navigation/resolve_url?prettyPrint=false', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: clientVersion() } },
          url: `https://www.youtube.com${path}/live`,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const watch = data && data.endpoint && data.endpoint.watchEndpoint;
      return (watch && watch.videoId) || null;
    } catch (e) {
      return null;
    }
  }

  async function run() {
    const token = ++runToken;
    const stale = () => token !== runToken || !settings || !settings.autoLikeFavorites;
    if (stale() || !isWatchPath()) return;

    const startedAt = Date.now();
    const deadline = startedAt + BUDGET_MS;
    while (Date.now() < deadline) {
      if (stale()) return;
      const videoId = currentVideoId();
      if (videoId && isDone(videoId)) return;
      const favorite = onLivePage() && signedIn() ? favoriteFor(currentChannelPath()) : null;
      if (videoId && favorite && likeButton()) {
        const settledAt = Date.now() + SETTLE_MS;
        while (Date.now() < Math.max(settledAt, startedAt + settings.likeDelaySec * 1000)) {
          await sleep(STEP_MS);
          if (stale() || currentVideoId() !== videoId || isDone(videoId)) return;
        }
        if ((await liveVideoId(favorite.path)) !== videoId) return;
        if (stale() || currentVideoId() !== videoId || !onLivePage()) return;
        const button = likeButton();
        if (!button) return;
        markDone(videoId);
        if (button.getAttribute('aria-pressed') !== 'true') button.click();
        return;
      }
      await sleep(STEP_MS);
    }
  }

  const readFavorites = (value) => (Array.isArray(value) ? value : []);

  const readDelaySec = (value) =>
    Number.isInteger(value) && value >= MIN_LIKE_DELAY_SEC && value <= MAX_LIKE_DELAY_SEC ? value : DEFAULT_LIKE_DELAY_SEC;

  chrome.storage.local.get(['autoLikeFavorites', 'favoriteChannels', 'autoLikeDelaySec'], (stored) => {
    settings = {
      autoLikeFavorites: stored.autoLikeFavorites === true,
      favoriteChannels: readFavorites(stored.favoriteChannels),
      likeDelaySec: readDelaySec(stored.autoLikeDelaySec),
    };
    run();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !settings) return;
    if (changes.autoLikeFavorites) {
      settings.autoLikeFavorites = changes.autoLikeFavorites.newValue === true;
    }
    if (changes.favoriteChannels) {
      settings.favoriteChannels = readFavorites(changes.favoriteChannels.newValue);
    }
    if (changes.autoLikeDelaySec) {
      settings.likeDelaySec = readDelaySec(changes.autoLikeDelaySec.newValue);
    }
    if (changes.autoLikeFavorites || changes.favoriteChannels) run();
  });

  document.addEventListener('yt-navigate-finish', run);

  document.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      if (!event.target.closest('like-button-view-model, dislike-button-view-model')) return;
      const videoId = currentVideoId();
      if (videoId) markDone(videoId);
    },
    true
  );
})();
