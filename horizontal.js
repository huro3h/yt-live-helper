(function () {
  'use strict';

  const MARK_KEY = 'ylh:prefer-horizontal';
  const MARK_MAX_AGE_MS = 60000;
  const CHANNEL_LIVE_RE = /^\/(@[^/]+|(?:channel|c|user)\/[^/]+)\/live\/?$/;
  const VERTICAL_TITLE_RE = /縦型|縦配信|縦画面|#shorts|vertical/i;
  const VERTICAL_TAG_RE = /[【\[［(（]\s*縦型[^】\]］)）]*[】\]］)）]/;
  const PLAYER_WAIT_MS = 30000;
  const PLAYER_POLL_MS = 500;
  const LIVE_BADGE_STYLE = 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE';
  const CLIENT_VERSION_FALLBACK = '2.20240101.00.00';

  let settings = null;
  let settingsArrived;
  const settingsLoaded = new Promise((resolve) => {
    settingsArrived = resolve;
  });
  let checkedUrl = null;
  let cachedClientVersion = null;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(fn, timeoutMs) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const value = fn();
      if (value) return value;
      if (Date.now() >= until) return null;
      await wait(PLAYER_POLL_MS);
    }
  }

  function takeMark() {
    try {
      const at = Number(sessionStorage.getItem(MARK_KEY)) || 0;
      sessionStorage.removeItem(MARK_KEY);
      return at > 0 && Date.now() - at <= MARK_MAX_AGE_MS;
    } catch (e) {
      return false;
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

  function innertube(endpoint, body) {
    return fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: clientVersion() } },
        ...body,
      }),
    }).then((res) => (res.ok ? res.json() : null));
  }

  function channelPath(match) {
    if (match) return '/' + match[1];
    const owner = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint[href]');
    const href = owner && owner.getAttribute('href');
    return href && href.startsWith('/') ? href.replace(/\/+$/, '') : null;
  }

  function pageTitle() {
    const h1 = document.querySelector('ytd-watch-metadata h1');
    return (h1 && h1.textContent.trim()) || document.title;
  }

  function readPlayer() {
    const player = document.getElementById('movie_player');
    const video = player && player.querySelector('video');
    const videoId = document.querySelector('ytd-watch-flexy')?.getAttribute('video-id');
    if (!video || !videoId) return null;
    if (!document.querySelector('.ytp-time-display.ytp-live')) return null;
    if (VERTICAL_TAG_RE.test(pageTitle())) return { videoId, portrait: true };
    if (player.classList.contains('ad-showing')) return null;
    if (!video.videoWidth || !video.videoHeight) return null;
    return { videoId, portrait: video.videoHeight > video.videoWidth };
  }

  async function channelLives(path) {
    const resolved = await innertube('navigation/resolve_url', {
      url: `https://www.youtube.com${path}/streams`,
    });
    const browse = resolved?.endpoint?.browseEndpoint;
    if (!browse || !browse.browseId) return [];
    const data = await innertube('browse', { browseId: browse.browseId, params: browse.params });
    const lives = [];
    const walk = (node) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const lockup = node.lockupViewModel;
      if (lockup && lockup.contentId) {
        const badges = JSON.stringify(lockup.contentImage || {});
        if (badges.includes(LIVE_BADGE_STYLE)) {
          lives.push({
            videoId: lockup.contentId,
            title: lockup.metadata?.lockupMetadataViewModel?.title?.content || '',
          });
        }
        return;
      }
      const renderer = node.videoRenderer || node.gridVideoRenderer;
      if (renderer && renderer.videoId) {
        const live = (renderer.thumbnailOverlays || []).some(
          (o) => o.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE'
        );
        if (live) {
          lives.push({
            videoId: renderer.videoId,
            title: renderer.title?.runs?.[0]?.text || renderer.title?.simpleText || '',
          });
        }
        return;
      }
      Object.values(node).forEach(walk);
    };
    walk(data);
    return lives;
  }

  async function check() {
    const match = location.pathname.match(CHANNEL_LIVE_RE);
    const marked = takeMark();
    if (!match && !marked) return;
    const url = location.href;
    if (checkedUrl === url) return;
    checkedUrl = url;

    await settingsLoaded;
    if (!settings.preferHorizontalLive) return;

    const state = await waitFor(readPlayer, PLAYER_WAIT_MS);
    if (!state || location.href !== url || !state.portrait) return;

    const path = channelPath(match);
    if (!path) return;
    let lives = [];
    try {
      lives = await channelLives(path);
    } catch (e) {
      return;
    }
    const target = lives.find(
      (live) => live.videoId !== state.videoId && !VERTICAL_TITLE_RE.test(live.title)
    );
    if (!target || location.href !== url || !settings.preferHorizontalLive) return;
    location.replace(`https://www.youtube.com/watch?v=${target.videoId}`);
  }

  chrome.storage.local.get(['preferHorizontalLive'], (stored) => {
    settings = { preferHorizontalLive: stored.preferHorizontalLive !== false };
    settingsArrived();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !settings || !changes.preferHorizontalLive) return;
    settings.preferHorizontalLive = changes.preferHorizontalLive.newValue !== false;
  });

  check();
  document.addEventListener('yt-navigate-finish', () => check());
})();
