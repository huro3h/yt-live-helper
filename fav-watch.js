(function () {
  'use strict';

  const POLL_MS = 60000;
  const FIRST_POLL_MS = 8000;
  const DEFAULT_NOTICE_SEC = 20;
  const MIN_NOTICE_SEC = 5;
  const MAX_NOTICE_SEC = 300;
  const noticeSec = (value) =>
    Number.isInteger(value) && value >= MIN_NOTICE_SEC && value <= MAX_NOTICE_SEC
      ? value
      : DEFAULT_NOTICE_SEC;
  const TOAST_ID = 'ylh-fav-toast';
  const CLIENT_VERSION_FALLBACK = '2.20240101.00.00';
  const KEYWORD_SPLIT_RE = /[,，、\n]+/;
  const URL_SPLIT_RE = /[\s,，、]+/;

  let settings = null;
  let timer = null;
  let polling = false;
  const known = new Map();
  const checked = new Set();
  let cachedClientVersion = null;

  const normalizePath = (href) => {
    let path = href;
    try {
      path = decodeURIComponent(href);
    } catch (e) {
    }
    return path.replace(/\/+$/, '').toLowerCase();
  };

  const onLivePage = () => !!document.querySelector('.ytp-time-display.ytp-live');

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

  async function liveVideoId(path) {
    try {
      const data = await innertube('navigation/resolve_url', {
        url: `https://www.youtube.com${path}/live`,
      });
      if (!data) return undefined;
      const endpoint = data.endpoint;
      const watch = endpoint && endpoint.watchEndpoint;
      return (watch && watch.videoId) || null;
    } catch (e) {
      return undefined;
    }
  }

  async function liveStream(videoId) {
    try {
      const data = await innertube('player', { videoId });
      const details = data && data.videoDetails;
      if (!details || details.isLive !== true || details.isUpcoming === true) return null;
      return {
        videoId,
        title: details.title || '',
        author: details.author || '',
        text: `${details.title || ''}\n${details.shortDescription || ''}`,
      };
    } catch (e) {
      return null;
    }
  }

  function youtubeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value.trim(), 'https://www.youtube.com');
      if (url.protocol !== 'https:') return null;
      if (url.hostname !== 'www.youtube.com' && url.hostname !== 'youtube.com') return null;
      return url;
    } catch (e) {
      return null;
    }
  }

  async function topicChannelId(value) {
    const url = youtubeUrl(value);
    if (!url) return null;
    const match = url.pathname.match(/^\/channel\/(UC[\w-]+)/);
    if (match) return match[1];
    try {
      const resolved = await innertube('navigation/resolve_url', { url: url.href });
      return resolved?.endpoint?.browseEndpoint?.browseId || null;
    } catch (e) {
      return null;
    }
  }

  async function filterRules() {
    const rules = [];
    for (const filter of settings.liveFilters) {
      if (!filter || typeof filter !== 'object' || filter.enabled === false) continue;
      const ids = new Set();
      for (const url of String(filter.url || '').split(URL_SPLIT_RE)) {
        const id = await topicChannelId(url);
        if (id) ids.add(id);
      }
      const keywords = String(filter.keywords || '')
        .split(KEYWORD_SPLIT_RE)
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean);
      if (ids.size || keywords.length) rules.push({ ids, keywords });
    }
    return rules.length ? rules : null;
  }

  function topicChannelIds(data) {
    const ids = [];
    const walk = (node) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const attribute = node.videoAttributeViewModel;
      if (attribute) {
        const id = attribute.onTap?.innertubeCommand?.browseEndpoint?.browseId;
        if (id) ids.push(id);
        return;
      }
      Object.values(node).forEach(walk);
    };
    walk(data);
    return ids;
  }

  async function matchesFilter(stream, rules) {
    let topics = null;
    if (rules.some((rule) => rule.ids.size)) {
      try {
        const data = await innertube('next', { videoId: stream.videoId });
        topics = data ? topicChannelIds(data) : [];
      } catch (e) {
        topics = [];
      }
    }
    const text = stream.text.toLowerCase();
    const hasKeyword = (rule) => rule.keywords.some((keyword) => text.includes(keyword));
    return rules.some((rule) => {
      if (rule.ids.size && topics.length) return topics.some((id) => rule.ids.has(id));
      return hasKeyword(rule);
    });
  }

  function currentVideoId() {
    const params = new URLSearchParams(location.search);
    const id = params.get('v');
    if (id) return id;
    const match = location.pathname.match(/^\/live\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function currentChannelPath() {
    const link = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint');
    const href = link && link.getAttribute('href');
    if (href) return normalizePath(href);
    const match = location.pathname.match(/^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/live/);
    return match ? normalizePath(`/${match[1]}`) : null;
  }

  async function poll() {
    if (polling) return;
    if (!settings || !settings.watchFavorites) return;
    if (!settings.favoriteChannels.length || !onLivePage()) return;

    polling = true;
    try {
      const here = { videoId: currentVideoId(), channel: currentChannelPath() };
      const targets = [];
      let hereRank = Infinity;

      for (const [index, favorite] of settings.favoriteChannels.entries()) {
        const path = typeof favorite.path === 'string' ? favorite.path : '';
        if (!path.startsWith('/')) continue;
        const key = normalizePath(path);
        const videoId = await liveVideoId(path);
        if (videoId === undefined) continue;

        const first = !checked.has(key);
        checked.add(key);

        if (videoId === null) {
          known.delete(key);
          continue;
        }
        const isNew = !first && known.get(key) !== videoId;
        known.set(key, videoId);

        const isHere = videoId === here.videoId || key === here.channel;
        if (isHere) {
          hereRank = Math.min(hereRank, index);
        } else if (isNew) {
          targets.push({ index, videoId });
        }
      }

      const rules = settings.watchFavoritesFilter ? await filterRules() : null;
      let target = null;
      for (const candidate of targets) {
        if (candidate.index >= hereRank) break;
        const stream = await liveStream(candidate.videoId);
        if (!stream) continue;
        if (rules && !(await matchesFilter(stream, rules))) continue;
        target = { ...candidate, stream };
        break;
      }
      if (!target) return;
      if (!settings.watchFavorites || !onLivePage()) return;

      const startHref = location.href;
      const proceed = await showNotice(target.stream, () =>
        !settings.watchFavorites || location.href !== startHref || !onLivePage()
      );
      if (!proceed) return;

      try {
        sessionStorage.setItem('ylh:prefer-horizontal', String(Date.now()));
      } catch (e) {
      }
      location.assign(`https://www.youtube.com/watch?v=${target.videoId}`);
    } finally {
      polling = false;
    }
  }

  function toastStyle() {
    if (document.getElementById(`${TOAST_ID}-style`)) return;
    const style = document.createElement('style');
    style.id = `${TOAST_ID}-style`;
    style.textContent = `
#${TOAST_ID}{position:absolute;right:12px;bottom:64px;z-index:1000;max-width:min(300px,50%);
  padding:7px 10px;border-radius:6px;background:rgba(15,15,15,.35);color:#fff;
  font:12px/1.4 Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased;
  text-shadow:0 1px 1px rgba(0,0,0,.85),0 0 1px rgba(0,0,0,.85);box-shadow:0 2px 8px rgba(0,0,0,.2)}
#${TOAST_ID}.ylh-fixed{position:fixed;right:24px;bottom:24px}
#movie_player:has(> #ylh-mute-mark.ylh-bottom) > #${TOAST_ID}{bottom:126px}
#${TOAST_ID} .ylh-fav-toast-head{color:#ff8fab;font-size:11px;font-weight:500}
#${TOAST_ID} .ylh-fav-toast-channel{font-weight:500;font-size:13px;margin-top:1px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${TOAST_ID} .ylh-fav-toast-title{color:#eee;margin-top:1px;overflow:hidden;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
#${TOAST_ID} .ylh-fav-toast-stay{display:block;margin:4px 0 0 auto;padding:0;border:0;background:none;
  color:#fff;font:500 11px/1.4 Roboto,Arial,sans-serif;text-decoration:underline;
  text-underline-offset:2px;text-shadow:inherit;cursor:pointer}
#${TOAST_ID} .ylh-fav-toast-stay:hover{color:#ff8fab}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function showNotice(stream, cancelled) {
    toastStyle();
    document.getElementById(TOAST_ID)?.remove();
    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    const head = document.createElement('div');
    head.className = 'ylh-fav-toast-head';
    const channel = document.createElement('div');
    channel.className = 'ylh-fav-toast-channel';
    channel.textContent = stream.author || '(チャンネル名不明)';
    const title = document.createElement('div');
    title.className = 'ylh-fav-toast-title';
    title.textContent = stream.title;
    const stay = document.createElement('button');
    stay.type = 'button';
    stay.className = 'ylh-fav-toast-stay';
    stay.textContent = '現在のチャンネルにとどまる';
    let stayed = false;
    stay.addEventListener('click', (event) => {
      event.preventDefault();
      stayed = true;
    });
    toast.append(head, channel, title, stay);
    for (const type of ['click', 'mousedown', 'mouseup', 'dblclick', 'pointerdown', 'pointerup']) {
      toast.addEventListener(type, (event) => event.stopPropagation());
    }

    const player = document.getElementById('movie_player');
    if (player) player.appendChild(toast);
    else {
      toast.classList.add('ylh-fixed');
      document.body.appendChild(toast);
    }

    const end = Date.now() + settings.noticeSec * 1000;
    return new Promise((resolve) => {
      const tick = () => {
        if (stayed || cancelled()) {
          clearInterval(id);
          toast.remove();
          resolve(false);
          return;
        }
        const left = Math.ceil((end - Date.now()) / 1000);
        if (left <= 0) {
          clearInterval(id);
          resolve(true);
          return;
        }
        head.textContent = `お気に入りの配信が始まりました・${left}秒後に移動します`;
      };
      const id = setInterval(tick, 250);
      tick();
    });
  }

  function schedule() {
    const on = !!settings && settings.watchFavorites && settings.favoriteChannels.length > 0;
    if (on && !timer) {
      timer = setInterval(poll, POLL_MS);
      setTimeout(poll, FIRST_POLL_MS);
    } else if (!on && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  const readFavorites = (value) => (Array.isArray(value) ? value : []);

  chrome.storage.local.get(
    ['watchFavorites', 'favoriteChannels', 'watchFavoritesFilter', 'watchFavoritesNoticeSec', 'liveFilters'],
    (stored) => {
      settings = {
        watchFavorites: stored.watchFavorites === true,
        favoriteChannels: readFavorites(stored.favoriteChannels),
        watchFavoritesFilter: stored.watchFavoritesFilter === true,
        noticeSec: noticeSec(stored.watchFavoritesNoticeSec),
        liveFilters: readFavorites(stored.liveFilters),
      };
      schedule();
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !settings) return;
    if (changes.watchFavorites) {
      settings.watchFavorites = changes.watchFavorites.newValue === true;
    }
    if (changes.favoriteChannels) {
      settings.favoriteChannels = readFavorites(changes.favoriteChannels.newValue);
    }
    if (changes.watchFavoritesFilter) {
      settings.watchFavoritesFilter = changes.watchFavoritesFilter.newValue === true;
    }
    if (changes.watchFavoritesNoticeSec) {
      settings.noticeSec = noticeSec(changes.watchFavoritesNoticeSec.newValue);
    }
    if (changes.liveFilters) settings.liveFilters = readFavorites(changes.liveFilters.newValue);
    if (changes.watchFavorites || changes.favoriteChannels) schedule();
  });
})();
