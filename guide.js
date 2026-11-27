(function () {
  'use strict';

  const SUB_HEADER_SELECTOR =
    'ytd-guide-section-renderer #items > ytd-guide-collapsible-section-entry-renderer' +
    ' a[href="/feed/subscriptions"]';
  const SILENT_STYLE_ID = 'ylh-guide-silent-expand';
  const HOP_STYLE_ID = 'ylh-guide-hop';
  const GUIDE_BUTTON_SELECTOR = '#guide-button button, #guide-button';
  const FAV_STYLE_ID = 'ylh-guide-fav';
  const GLASS_STYLE_ID = 'ylh-guide-glass';
  const DEFAULT_GUIDE_TRANSPARENCY = 45;
  const MIN_GUIDE_TRANSPARENCY = 0;
  const MAX_GUIDE_TRANSPARENCY = 100;
  const FAV_CLASS = 'ylh-fav-star';
  const FAV_ON_CLASS = 'ylh-fav-on';
  const FAV_ATTR = 'data-ylh-fav';
  const FAV_TITLE_ON = 'お気に入りから外す';
  const FAV_TITLE_OFF = 'お気に入りに追加';
  const LIVE_LINK_STYLE_ID = 'ylh-guide-live-link';
  const LIVE_LINK_ATTR = 'data-ylh-live-link';
  const LIVE_LINK_TITLE = 'ライブ配信を開く';

  const FAST_POLL_MS = 300;
  const FAST_POLL_LIMIT_MS = 15000;
  const SLOW_POLL_MS = 3000;
  const SETTLE_MS = 400;
  const REAPPLY_DEBOUNCE_MS = 500;
  const EXPAND_COOLDOWN_MS = 10000;
  const HOP_TIMEOUT_MS = 8000;
  const HOP_POLL_MS = 200;
  const PICK_KEY = 'ylh:pick-live';
  const PICK_MAX_AGE_MS = 60000;
  const PICK_TIMEOUT_MS = 10000;
  const PICK_VISIBLE_WAIT_MS = 300000;
  const PICK_SETTLE_STEP_MS = 400;
  const PICK_SETTLE_MAX_MS = 3000;
  const LIVE_BADGE_SELECTOR =
    'badge-shape.ytBadgeShapeLive,' +
    ' ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"]';
  const VIDEO_LINK_SELECTOR = 'a[href*="/watch?v="], a[href^="/live/"]';
  const LIST_ITEM_SELECTOR =
    'ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model';
  const CHANNEL_LINK_SELECTOR =
    'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]';
  const VIEWERS_RE = /(\d[\d,.]*)\s*(万|億|K|M)?\s*(?:人が視聴中|watching)/i;
  const VIEWERS_UNIT = { 万: 1e4, 億: 1e8, k: 1e3, m: 1e6 };
  const DEFAULT_MAX_VIEWERS = 100;
  const PICK_CHANNELS_KEY = 'ylh:pick-channels';
  const PICK_FALLBACK_KEY = 'ylh:pick-fallback';
  const PREFER_HORIZONTAL_KEY = 'ylh:prefer-horizontal';
  const LIVE_CHECK_BATCH = 10;
  const KEYWORD_SPLIT_RE = /[,，、\n]+/;
  const URL_SPLIT_RE = /[\s,，、]+/;
  const CLIENT_VERSION_FALLBACK = '2.20240101.00.00';
  const CHANNELS_PAGE_PATH = '/feed/channels';
  const DEFAULT_CHANNELS_PAGE_HOP_DELAY_SEC = 60;
  const MIN_CHANNELS_PAGE_HOP_DELAY_SEC = 10;
  const MAX_CHANNELS_PAGE_HOP_DELAY_SEC = 3600;
  const GUIDE_WINDOW_ATTR = 'data-ylh-guide-window';

  let settings = null;
  let settingsArrived;
  const settingsLoaded = new Promise((resolve) => {
    settingsArrived = resolve;
  });
  let applying = false;
  let lastExpandAt = 0;
  let snapshot = null;
  let reapplyTimer = null;
  let observedItems = null;
  let hopping = false;
  let channelsPageTimer = null;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function getSection() {
    const header = document.querySelector(SUB_HEADER_SELECTOR);
    return header ? header.closest('ytd-guide-section-renderer') : null;
  }

  const isLive = (entry) => {
    const badge = entry.querySelector('.guide-entry-badge');
    return !!badge && getComputedStyle(badge).display !== 'none';
  };

  function liveUrl(entry) {
    const link = entry.querySelector('a#endpoint') || entry.querySelector('a');
    const href = link && link.getAttribute('href');
    if (!href || !href.startsWith('/')) return null;
    return href.replace(/\/+$/, '') + '/live';
  }

  function liveLinkStyle(on) {
    const existing = document.getElementById(LIVE_LINK_STYLE_ID);
    if (on) {
      if (existing) return;
      const style = document.createElement('style');
      style.id = LIVE_LINK_STYLE_ID;
      style.textContent =
        `ytd-guide-entry-renderer [${LIVE_LINK_ATTR}]{cursor:pointer;}` +
        `ytd-guide-entry-renderer [${LIVE_LINK_ATTR}]::after` +
        '{content:"";position:absolute;inset:-6px;}' +
        `ytd-guide-entry-renderer [${LIVE_LINK_ATTR}]:hover{transform:scale(1.25);}`;
      (document.head || document.documentElement).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }

  function glassStyle(on, transparency) {
    const existing = document.getElementById(GLASS_STYLE_ID);
    if (on) {
      const alpha = (100 - transparency) / 100;
      const drawer = 'tp-yt-app-drawer#guide:not([persistent])';
      const style = existing || document.createElement('style');
      style.id = GLASS_STYLE_ID;
      style.textContent =
        `${drawer} #contentContainer{background-color:rgba(255,255,255,${alpha})!important;}` +
        `html[dark] ${drawer} #contentContainer{background-color:rgba(15,15,15,${alpha})!important;}` +
        `${drawer} #guide-content{background-color:transparent!important;}` +
        `${drawer} #scrim{background-color:transparent!important;}` +
        `${drawer} #guide-content{text-shadow:0 0 3px rgba(255,255,255,0.9);}` +
        `html[dark] ${drawer} #guide-content{text-shadow:0 0 3px rgba(0,0,0,0.9);}`;
      if (!existing) (document.head || document.documentElement).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }

  const guideTransparencyOf = (value) =>
    Number.isInteger(value) && value >= MIN_GUIDE_TRANSPARENCY && value <= MAX_GUIDE_TRANSPARENCY
      ? value
      : DEFAULT_GUIDE_TRANSPARENCY;

  let glass = { on: true, transparency: DEFAULT_GUIDE_TRANSPARENCY };

  function markLiveLinks(entries, linked) {
    for (const entry of entries) {
      const badge = entry.querySelector('.guide-entry-badge');
      if (!badge) continue;
      const url = linked.has(entry) ? liveUrl(entry) : null;
      if (url) {
        if (badge.getAttribute(LIVE_LINK_ATTR) !== url) badge.setAttribute(LIVE_LINK_ATTR, url);
        if (badge.getAttribute('title') !== LIVE_LINK_TITLE) {
          badge.setAttribute('title', LIVE_LINK_TITLE);
        }
      } else if (badge.hasAttribute(LIVE_LINK_ATTR)) {
        badge.removeAttribute(LIVE_LINK_ATTR);
        badge.removeAttribute('title');
      }
    }
  }

  function favStyle() {
    if (document.getElementById(FAV_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FAV_STYLE_ID;
    style.textContent =
      `ytd-guide-entry-renderer .${FAV_CLASS}` +
      '{position:absolute;left:40px;top:50%;margin-top:-8px;width:16px;height:16px;' +
      'display:none;align-items:center;justify-content:center;box-sizing:border-box;' +
      'border-radius:50%;background:rgba(0,0,0,0.75);color:#fff;font-size:10px;' +
      'line-height:1;cursor:pointer;z-index:1;}' +
      `ytd-guide-entry-renderer .${FAV_CLASS}::after` +
      '{content:"";position:absolute;inset:-4px;border-radius:50%;}' +
      `ytd-guide-entry-renderer:hover .${FAV_CLASS}{display:flex;}` +
      `ytd-guide-entry-renderer .${FAV_CLASS}.${FAV_ON_CLASS}` +
      '{display:flex;background:#ff3d6b;}';
    (document.head || document.documentElement).appendChild(style);
  }

  const favoriteKeys = () =>
    new Set(
      (settings.favoriteChannels || [])
        .map((favorite) => favorite && favorite.path)
        .filter((path) => typeof path === 'string')
        .map(normalizePath)
    );

  function channelPath(entry) {
    const link = entry.querySelector('a#endpoint') || entry.querySelector('a');
    const href = link && link.getAttribute('href');
    return href && href.startsWith('/') ? href.replace(/\/+$/, '') : null;
  }

  function channelName(entry) {
    const link = entry.querySelector('a#endpoint');
    const title = link && link.getAttribute('title');
    if (title) return title;
    const label = entry.querySelector('.title');
    return (label && label.textContent.trim()) || channelPath(entry) || '';
  }

  function markFavorites(entries) {
    const favorites = favoriteKeys();
    for (const entry of entries) {
      const path = channelPath(entry);
      if (!path) continue;
      let star = entry.querySelector(`:scope > .${FAV_CLASS}`);
      if (!star) {
        star = document.createElement('span');
        star.className = FAV_CLASS;
        entry.appendChild(star);
      }
      if (star.getAttribute(FAV_ATTR) !== path) star.setAttribute(FAV_ATTR, path);
      const on = favorites.has(normalizePath(path));
      const mark = on ? '★' : '☆';
      if (star.textContent !== mark) star.textContent = mark;
      star.classList.toggle(FAV_ON_CLASS, on);
      const title = on ? FAV_TITLE_ON : FAV_TITLE_OFF;
      if (star.getAttribute('title') !== title) star.setAttribute('title', title);
    }
  }

  function toggleFavorite(star) {
    const path = star.getAttribute(FAV_ATTR);
    const entry = star.closest('ytd-guide-entry-renderer');
    if (!path || !entry) return;
    const key = normalizePath(path);
    const list = (settings.favoriteChannels || []).filter(
      (favorite) => favorite && typeof favorite.path === 'string'
    );
    const at = list.findIndex((favorite) => normalizePath(favorite.path) === key);
    const next = at >= 0 ? list.filter((_, i) => i !== at) : [...list, { path, name: channelName(entry) }];
    settings.favoriteChannels = next;
    markFavorites([entry]);
    chrome.storage.local.set({ favoriteChannels: next });
  }

  function findFavStar(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node === document) break;
      if (node instanceof Element && node.classList && node.classList.contains(FAV_CLASS)) {
        return node;
      }
    }
    return null;
  }

  function onFavStarClick(event) {
    if (event.type === 'click' && event.button !== 0) return;
    const star = findFavStar(event);
    if (!star) return;
    event.preventDefault();
    event.stopPropagation();
    if (settings) toggleFavorite(star);
  }

  function findLiveLink(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node === document) break;
      if (node instanceof Element && node.hasAttribute(LIVE_LINK_ATTR)) return node;
    }
    return null;
  }

  function onLiveBadgeClick(event) {
    if (event.type === 'click' && event.button !== 0) return;
    if (event.type === 'auxclick' && event.button !== 1) return;

    const badge = findLiveLink(event);
    const url = badge && badge.getAttribute(LIVE_LINK_ATTR);
    if (!url) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey) {
      window.open(url, '_blank', 'noopener');
    } else {
      location.assign(url);
    }
  }

  const shownEntries = (items) =>
    Array.from(items.querySelectorAll(':scope > ytd-guide-entry-renderer'));
  const hiddenEntries = (collapsible) =>
    collapsible
      ? Array.from(collapsible.querySelectorAll('#expandable-items > ytd-guide-entry-renderer'))
      : [];

  const expand = (collapsible) => collapsible.querySelector('#expander-item a')?.click();
  const collapse = (collapsible) => collapsible.querySelector('#collapser-item a')?.click();

  function silentStyle(on) {
    const existing = document.getElementById(SILENT_STYLE_ID);
    if (on) {
      if (existing) return;
      const style = document.createElement('style');
      style.id = SILENT_STYLE_ID;
      style.textContent =
        'ytd-guide-collapsible-entry-renderer[expanded] #expanded{display:none!important;}' +
        'ytd-guide-collapsible-entry-renderer[expanded] #expander-item{display:block!important;}';
      (document.head || document.documentElement).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }

  async function prepareList(collapsible) {
    const expanded = collapsible.hasAttribute('expanded');

    if (settings.expandSubscriptions) {
      if (!expanded) {
        expand(collapsible);
        await wait(SETTLE_MS);
      }
      return;
    }

    if (!settings.sortLiveChannels) return;
    if (expanded || hiddenEntries(collapsible).length) return;
    if (Date.now() - lastExpandAt < EXPAND_COOLDOWN_MS) return;

    lastExpandAt = Date.now();
    silentStyle(true);
    try {
      expand(collapsible);
      await wait(SETTLE_MS);
      collapse(collapsible);
      await wait(SETTLE_MS);
    } finally {
      silentStyle(false);
    }
  }

  function snapshotValid(items, collapsible) {
    if (!snapshot || snapshot.items !== items || !snapshot.header.isConnected) return false;
    const known = new Set([...snapshot.shown, ...snapshot.hidden]);
    for (const entry of known) {
      if (!entry.isConnected) return false;
    }
    return [...shownEntries(items), ...hiddenEntries(collapsible)].every((entry) =>
      known.has(entry)
    );
  }

  function takeSnapshot(items, collapsible) {
    snapshot = {
      items,
      collapsible,
      header: items.firstElementChild,
      shown: shownEntries(items),
      hidden: hiddenEntries(collapsible),
    };
  }

  function reconcile(parent, desired) {
    let prev = null;
    for (const el of desired) {
      const expected = prev ? prev.nextElementSibling : parent.firstElementChild;
      if (expected !== el) {
        if (prev) prev.after(el);
        else parent.prepend(el);
      }
      prev = el;
    }
  }

  function layout() {
    const { items, collapsible, header, shown, hidden } = snapshot;
    const all = [...shown, ...hidden];
    const liveEntries = all.filter(isLive);

    liveLinkStyle(settings.liveChannelDirectLink);
    markLiveLinks(all, new Set(settings.liveChannelDirectLink ? liveEntries : []));

    favStyle();
    markFavorites(all);

    const top = settings.sortLiveChannels ? liftedOrder(all, liveEntries) : [];
    const lifted = new Set(top);

    const desired = [header, ...top, ...shown.filter((entry) => !lifted.has(entry))];
    if (collapsible) desired.push(collapsible);
    reconcile(items, desired);

    const expandable = collapsible && collapsible.querySelector('#expandable-items');
    if (expandable) reconcile(expandable, hidden.filter((entry) => !lifted.has(entry)));
  }

  function liftedOrder(all, liveEntries) {
    const rank = new Map();
    (settings.favoriteChannels || []).forEach((favorite, index) => {
      if (!favorite || typeof favorite.path !== 'string') return;
      const key = normalizePath(favorite.path);
      if (!rank.has(key)) rank.set(key, index);
    });
    const rankOf = (entry) => {
      const path = channelPath(entry);
      return path ? rank.get(normalizePath(path)) : undefined;
    };
    const isFavorite = (entry) => rankOf(entry) !== undefined;
    const byRank = (a, b) => rankOf(a) - rankOf(b);
    const live = new Set(liveEntries);
    return [
      ...liveEntries.filter(isFavorite).sort(byRank),
      ...liveEntries.filter((entry) => !isFavorite(entry)),
      ...all.filter((entry) => !live.has(entry) && isFavorite(entry)).sort(byRank),
    ];
  }

  async function apply() {
    if (!settings || applying) return;
    const section = getSection();
    if (!section) return;
    const items = section.querySelector('#items');
    if (!items) return;
    const collapsible = items.querySelector(':scope > ytd-guide-collapsible-entry-renderer');

    applying = true;
    try {
      if (collapsible) await prepareList(collapsible);
      if (!snapshotValid(items, collapsible)) takeSnapshot(items, collapsible);
      layout();
    } finally {
      applying = false;
    }
    observe(items);
  }

  function observe(items) {
    if (observedItems === items) return;
    observedItems = items;
    new MutationObserver(() => {
      if (applying) return;
      clearTimeout(reapplyTimer);
      reapplyTimer = setTimeout(apply, REAPPLY_DEBOUNCE_MS);
    }).observe(items, { childList: true, subtree: true });
  }

  async function collapseNow() {
    const section = getSection();
    const collapsible = section?.querySelector('#items > ytd-guide-collapsible-entry-renderer');
    if (!collapsible || !collapsible.hasAttribute('expanded')) return;
    applying = true;
    try {
      collapse(collapsible);
      await wait(SETTLE_MS);
    } finally {
      applying = false;
    }
  }

  function hopStyle(on) {
    const existing = document.getElementById(HOP_STYLE_ID);
    if (on) {
      if (existing) return;
      const style = document.createElement('style');
      style.id = HOP_STYLE_ID;
      style.textContent =
        'tp-yt-app-drawer#guide{opacity:0!important;pointer-events:none!important;}';
      (document.head || document.documentElement).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }

  const guideButton = () => document.querySelector(GUIDE_BUTTON_SELECTOR);

  function closeGuide() {
    const drawer = document.querySelector('tp-yt-app-drawer#guide');
    if (drawer && drawer.hasAttribute('opened')) guideButton()?.click();
  }

  async function waitFor(fn, timeoutMs = HOP_TIMEOUT_MS) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const value = fn();
      if (value) return value;
      if (Date.now() >= until) return null;
      await wait(HOP_POLL_MS);
    }
  }

  const normalizePath = (href) => {
    let path = href;
    try {
      path = decodeURIComponent(href);
    } catch (e) {
    }
    return path.replace(/\/+$/, '').toLowerCase();
  };

  function currentChannelPath() {
    const match = location.pathname.match(/^\/(@[^/]+|(?:channel|c|user)\/[^/]+)\/live\/?$/);
    if (match) return normalizePath('/' + match[1]);
    const owner = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint[href]');
    const href = owner && owner.getAttribute('href');
    return href && href.startsWith('/') ? normalizePath(href) : null;
  }

  let cachedClientVersion = null;
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

  async function liveStream(path) {
    try {
      const resolved = await innertube('navigation/resolve_url', {
        url: `https://www.youtube.com${path}/live`,
      });
      const videoId = resolved?.endpoint?.watchEndpoint?.videoId;
      if (!videoId) return null;
      const details = (await innertube('player', { videoId }))?.videoDetails;
      if (!details || details.isLive !== true || details.isUpcoming === true) return null;
      return { videoId, text: `${details.title || ''}\n${details.shortDescription || ''}` };
    } catch (e) {
      return null;
    }
  }

  const isLiveByResolve = async (path) => !!(await liveStream(path));

  function hopCandidates() {
    const section = getSection();
    const items = section && section.querySelector('#items');
    if (!items) return null;
    const collapsible = items.querySelector(':scope > ytd-guide-collapsible-entry-renderer');
    const current = currentChannelPath();
    const candidates = [];
    for (const entry of [...shownEntries(items), ...hiddenEntries(collapsible)]) {
      const url = liveUrl(entry);
      if (!url) continue;
      const path = url.replace(/\/live$/, '');
      if (path.startsWith('/feed/')) continue;
      if (current && normalizePath(path) === current) continue;
      candidates.push({ entry, path, url });
    }
    return candidates;
  }

  async function nextLiveUrl() {
    const candidates = hopCandidates();
    if (!candidates) return null;
    if (settings.autoNextLiveFilter) {
      const rules = await filterRules();
      if (rules) return nextFilteredLiveUrl(candidates, rules);
    }

    let pending = [];
    const firstConfirmed = async () => {
      const results = await Promise.all(pending.map((c) => isLiveByResolve(c.path)));
      const index = results.indexOf(true);
      const found = index === -1 ? null : pending[index].url;
      pending = [];
      return found;
    };

    for (const { entry, path, url } of candidates) {
      if (isLive(entry)) {
        return (pending.length && (await firstConfirmed())) || url;
      }
      pending.push({ path, url });
      if (pending.length >= LIVE_CHECK_BATCH) {
        const found = await firstConfirmed();
        if (found) return found;
      }
    }
    return pending.length ? firstConfirmed() : null;
  }

  async function filterRules() {
    const rules = [];
    for (const filter of settings.liveFilters) {
      if (filter.enabled === false) continue;
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

  async function topicChannelId(value) {
    const url = normalizeTargetUrl(value);
    if (!url) return null;
    const match = new URL(url).pathname.match(/^\/channel\/(UC[\w-]+)/);
    if (match) return match[1];
    try {
      const resolved = await innertube('navigation/resolve_url', { url });
      return resolved?.endpoint?.browseEndpoint?.browseId || null;
    } catch (e) {
      return null;
    }
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

  async function nextFilteredLiveUrl(candidates, rules) {
    for (let start = 0; start < candidates.length; start += LIVE_CHECK_BATCH) {
      const batch = candidates.slice(start, start + LIVE_CHECK_BATCH);
      const streams = await Promise.all(batch.map((c) => liveStream(c.path)));
      for (const [index, stream] of streams.entries()) {
        if (stream && (await matchesFilter(stream, rules))) return batch[index].url;
      }
    }
    return null;
  }

  function normalizeTargetUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    let url;
    try {
      url = new URL(value.trim(), 'https://www.youtube.com');
    } catch (e) {
      return null;
    }
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'www.youtube.com' && url.hostname !== 'youtube.com') return null;
    return url.href;
  }

  function setPickMark(channels, fallbackUrl = null) {
    try {
      sessionStorage.setItem(PICK_KEY, String(Date.now()));
      if (channels) sessionStorage.setItem(PICK_CHANNELS_KEY, JSON.stringify(channels));
      else sessionStorage.removeItem(PICK_CHANNELS_KEY);
      if (fallbackUrl) sessionStorage.setItem(PICK_FALLBACK_KEY, fallbackUrl);
      else sessionStorage.removeItem(PICK_FALLBACK_KEY);
    } catch (e) {
    }
  }

  function takePickMark() {
    try {
      const value = sessionStorage.getItem(PICK_KEY);
      const channels = sessionStorage.getItem(PICK_CHANNELS_KEY);
      const fallback = sessionStorage.getItem(PICK_FALLBACK_KEY);
      sessionStorage.removeItem(PICK_KEY);
      sessionStorage.removeItem(PICK_CHANNELS_KEY);
      sessionStorage.removeItem(PICK_FALLBACK_KEY);
      const parsed = channels ? JSON.parse(channels) : [];
      return {
        at: Number(value) || 0,
        channels: Array.isArray(parsed) ? parsed.filter((path) => typeof path === 'string') : [],
        fallback: normalizeTargetUrl(fallback),
      };
    } catch (e) {
      return { at: 0, channels: [], fallback: null };
    }
  }

  function subscriptionPaths(items, collapsible) {
    return [...shownEntries(items), ...hiddenEntries(collapsible)]
      .map(channelPath)
      .filter((path) => path && path !== '/feed/subscriptions')
      .map(normalizePath);
  }

  function viewerCount(item) {
    for (const span of item.querySelectorAll('span')) {
      const match = span.textContent.match(VIEWERS_RE);
      if (!match) continue;
      const base = Number(match[1].replace(/,/g, ''));
      const unit = match[2] ? VIEWERS_UNIT[match[2].toLowerCase()] : 1;
      return Number.isFinite(base) ? Math.round(base * unit) : null;
    }
    return null;
  }

  function itemChannelPath(item) {
    const link = item.querySelector(CHANNEL_LINK_SELECTOR);
    const href = link && link.getAttribute('href');
    return href ? normalizePath(href) : null;
  }

  function isDisplayed(el) {
    if (typeof el.checkVisibility === 'function') return el.checkVisibility();
    return el.getClientRects().length > 0;
  }

  function withinViewerLimit(node, filter) {
    if (filter.maxViewers == null) return true;
    const item = node.closest(LIST_ITEM_SELECTOR) || node;
    const channel = itemChannelPath(item);
    if (channel && filter.exempt.has(channel)) return true;
    const count = viewerCount(item);
    return count !== null && count <= filter.maxViewers;
  }

  function firstLiveVideoHref(filter) {
    for (const badge of document.querySelectorAll(LIVE_BADGE_SELECTOR)) {
      if (filter.skipHidden && !isDisplayed(badge)) continue;
      let node = badge;
      for (let depth = 0; depth < 8 && node; depth++) {
        const link = node.querySelector && node.querySelector(VIDEO_LINK_SELECTOR);
        if (link) {
          if (!withinViewerLimit(node, filter)) break;
          return link.getAttribute('href');
        }
        node = node.parentElement;
      }
    }
    return null;
  }

  function waitForVisible() {
    if (document.visibilityState === 'visible') return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = (value) => {
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', onChange);
        resolve(value);
      };
      const onChange = () => {
        if (document.visibilityState === 'visible') done(true);
      };
      const timer = setTimeout(() => done(false), PICK_VISIBLE_WAIT_MS);
      document.addEventListener('visibilitychange', onChange);
    });
  }

  async function settledLiveHref(href, filter) {
    const until = Date.now() + PICK_SETTLE_MAX_MS;
    let last = href;
    for (;;) {
      await wait(PICK_SETTLE_STEP_MS);
      const next = firstLiveVideoHref(filter);
      if (!next) return null;
      if (next === last) return next;
      last = next;
      if (Date.now() >= until) return next;
    }
  }

  async function pickLiveOnThisPage() {
    const mark = takePickMark();
    if (!mark.at || Date.now() - mark.at > PICK_MAX_AGE_MS) return;

    await settingsLoaded;
    const skipHidden = settings.autoNextLiveSkipHidden;
    const filter = {
      skipHidden,
      maxViewers: settings.autoNextLiveLimitViewers ? settings.autoNextLiveMaxViewers : null,
      exempt: new Set([...mark.channels, ...favoriteKeys()]),
    };
    const section = getSection();
    const items = section && section.querySelector('#items');
    if (items) {
      const collapsible = items.querySelector(':scope > ytd-guide-collapsible-entry-renderer');
      for (const path of subscriptionPaths(items, collapsible)) filter.exempt.add(path);
    }

    const pick = () => {
      const player = document.getElementById('movie_player');
      if (player && isDisplayed(player)) return { href: null };
      const href = firstLiveVideoHref(filter);
      return href ? { href } : null;
    };

    let result = await waitFor(pick, PICK_TIMEOUT_MS);
    if (!result && document.visibilityState === 'hidden') {
      if (await waitForVisible()) result = await waitFor(pick, PICK_TIMEOUT_MS);
    }
    if (result && !result.href) return;
    let href = result && result.href;
    if (href && skipHidden) href = await settledLiveHref(href, filter);
    if (!href) href = mark.fallback;
    if (!href) return;
    try {
      sessionStorage.setItem(PREFER_HORIZONTAL_KEY, String(Date.now()));
    } catch (e) {
    }
    location.assign(href);
  }

  async function hopToNextLive() {
    if (!settings || !settings.autoNextLive || hopping) return;

    const pageFirst = settings.autoNextLiveTarget === 'page';
    const fallback = settings.autoNextLiveFallback;
    const pageUrl =
      pageFirst || fallback ? normalizeTargetUrl(settings.autoNextLiveUrl) : null;
    if (pageFirst && !pageUrl && !fallback) return;
    const goPage = (channels, fallbackUrl) => {
      setPickMark(channels, fallbackUrl);
      location.assign(pageUrl);
    };
    if (pageUrl && pageFirst && !fallback && !settings.autoNextLiveLimitViewers) {
      goPage(null);
      return;
    }

    hopping = true;
    let openedByUs = false;
    let expandedByUs = null;
    let navigating = false;
    try {
      if (!getSection()) {
        const button = guideButton();
        if (!button) {
          if (pageUrl) {
            navigating = true;
            goPage(null);
          }
          return;
        }
        hopStyle(true);
        button.click();
        openedByUs = true;
      }

      const items = await waitFor(() => {
        const section = getSection();
        return section?.querySelector('#items > ytd-guide-entry-renderer')
          ? section.querySelector('#items')
          : null;
      });
      if (!items) {
        if (pageUrl) {
          navigating = true;
          goPage(null);
        }
        return;
      }

      const collapsible = items.querySelector(':scope > ytd-guide-collapsible-entry-renderer');
      const needsExpand =
        collapsible && !collapsible.hasAttribute('expanded') && !hiddenEntries(collapsible).length;
      if (needsExpand) {
        expand(collapsible);
        expandedByUs = collapsible;
        await wait(SETTLE_MS);
      }

      await waitFor(() => !applying);

      const url = pageFirst && !fallback ? null : await nextLiveUrl();
      if (pageUrl && (pageFirst || !url)) {
        navigating = true;
        goPage(subscriptionPaths(items, collapsible), pageFirst && fallback ? url : null);
        return;
      }
      if (!url) return;

      navigating = true;
      location.assign(url);
    } finally {
      if (!navigating) {
        if (expandedByUs && !settings.expandSubscriptions) collapse(expandedByUs);
        if (openedByUs) closeGuide();
        hopStyle(false);
      }
      hopping = false;
    }
  }

  function scheduleChannelsPageHop() {
    clearTimeout(channelsPageTimer);
    channelsPageTimer = null;
    if (!settings || !settings.autoNextLive || !settings.channelsPageHop) return;
    if (location.pathname.replace(/\/+$/, '') !== CHANNELS_PAGE_PATH) return;
    channelsPageTimer = setTimeout(async () => {
      channelsPageTimer = null;
      if (location.pathname.replace(/\/+$/, '') !== CHANNELS_PAGE_PATH) return;
      if (document.documentElement.hasAttribute(GUIDE_WINDOW_ATTR)) return;
      await hopToNextLive();
      scheduleChannelsPageHop();
    }, settings.channelsPageHopDelaySec * 1000);
  }

  function start() {
    const startedAt = Date.now();
    (function tick() {
      const section = getSection();
      if (section && section.querySelector('#items > ytd-guide-entry-renderer')) {
        apply();
        return;
      }
      const interval = Date.now() - startedAt < FAST_POLL_LIMIT_MS ? FAST_POLL_MS : SLOW_POLL_MS;
      setTimeout(tick, interval);
    })();
  }

  const liveFiltersOf = (value) =>
    Array.isArray(value) ? value.filter((filter) => filter && typeof filter === 'object') : [];

  const channelsPageHopDelayOf = (value) =>
    Number.isInteger(value) &&
    value >= MIN_CHANNELS_PAGE_HOP_DELAY_SEC &&
    value <= MAX_CHANNELS_PAGE_HOP_DELAY_SEC
      ? value
      : DEFAULT_CHANNELS_PAGE_HOP_DELAY_SEC;

  const maxViewersOf = (value) =>
    Number.isInteger(value) && value >= 1 ? value : DEFAULT_MAX_VIEWERS;

  chrome.storage.local.get(
    [
      'sortLiveChannels',
      'expandSubscriptions',
      'liveChannelDirectLink',
      'autoNextLive',
      'autoNextLiveTarget',
      'autoNextLiveUrl',
      'autoNextLiveFallback',
      'autoNextLiveSkipHidden',
      'autoNextLiveLimitViewers',
      'autoNextLiveMaxViewers',
      'autoNextLiveFilter',
      'liveFilters',
      'channelsPageHop',
      'channelsPageHopDelaySec',
      'favoriteChannels',
      'translucentGuide',
      'guideTransparency',
    ],
    (stored) => {
      glass = {
        on: stored.translucentGuide !== false,
        transparency: guideTransparencyOf(stored.guideTransparency),
      };
      glassStyle(glass.on, glass.transparency);
      settings = {
        sortLiveChannels:
          typeof stored.sortLiveChannels === 'boolean' ? stored.sortLiveChannels : true,
        expandSubscriptions:
          typeof stored.expandSubscriptions === 'boolean' ? stored.expandSubscriptions : true,
        liveChannelDirectLink:
          typeof stored.liveChannelDirectLink === 'boolean' ? stored.liveChannelDirectLink : true,
        autoNextLive: stored.autoNextLive === true,
        autoNextLiveTarget: stored.autoNextLiveTarget === 'page' ? 'page' : 'subscriptions',
        autoNextLiveUrl: typeof stored.autoNextLiveUrl === 'string' ? stored.autoNextLiveUrl : '',
        autoNextLiveFallback: stored.autoNextLiveFallback === true,
        autoNextLiveSkipHidden: stored.autoNextLiveSkipHidden !== false,
        autoNextLiveLimitViewers: stored.autoNextLiveLimitViewers === true,
        autoNextLiveMaxViewers: maxViewersOf(stored.autoNextLiveMaxViewers),
        autoNextLiveFilter: stored.autoNextLiveFilter === true,
        liveFilters: liveFiltersOf(stored.liveFilters),
        channelsPageHop: stored.channelsPageHop === true,
        channelsPageHopDelaySec: channelsPageHopDelayOf(stored.channelsPageHopDelaySec),
        favoriteChannels: Array.isArray(stored.favoriteChannels) ? stored.favoriteChannels : [],
      };
      settingsArrived();
      start();
      scheduleChannelsPageHop();
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !settings) return;
    if (changes.translucentGuide || changes.guideTransparency) {
      if (changes.translucentGuide) glass.on = changes.translucentGuide.newValue !== false;
      if (changes.guideTransparency) glass.transparency = guideTransparencyOf(changes.guideTransparency.newValue);
      glassStyle(glass.on, glass.transparency);
    }
    if (changes.autoNextLive) settings.autoNextLive = changes.autoNextLive.newValue === true;
    if (changes.autoNextLiveTarget) {
      settings.autoNextLiveTarget =
        changes.autoNextLiveTarget.newValue === 'page' ? 'page' : 'subscriptions';
    }
    if (changes.autoNextLiveUrl) {
      const url = changes.autoNextLiveUrl.newValue;
      settings.autoNextLiveUrl = typeof url === 'string' ? url : '';
    }
    if (changes.autoNextLiveFallback) {
      settings.autoNextLiveFallback = changes.autoNextLiveFallback.newValue === true;
    }
    if (changes.autoNextLiveSkipHidden) {
      settings.autoNextLiveSkipHidden = changes.autoNextLiveSkipHidden.newValue !== false;
    }
    if (changes.autoNextLiveLimitViewers) {
      settings.autoNextLiveLimitViewers = changes.autoNextLiveLimitViewers.newValue === true;
    }
    if (changes.autoNextLiveMaxViewers) {
      settings.autoNextLiveMaxViewers = maxViewersOf(changes.autoNextLiveMaxViewers.newValue);
    }
    if (changes.autoNextLiveFilter) {
      settings.autoNextLiveFilter = changes.autoNextLiveFilter.newValue === true;
    }
    if (changes.liveFilters) settings.liveFilters = liveFiltersOf(changes.liveFilters.newValue);
    if (changes.autoNextLive || changes.channelsPageHop || changes.channelsPageHopDelaySec) {
      if (changes.channelsPageHop) settings.channelsPageHop = changes.channelsPageHop.newValue === true;
      if (changes.channelsPageHopDelaySec) {
        settings.channelsPageHopDelaySec = channelsPageHopDelayOf(changes.channelsPageHopDelaySec.newValue);
      }
      scheduleChannelsPageHop();
    }
    if (changes.favoriteChannels) {
      const next = changes.favoriteChannels.newValue;
      settings.favoriteChannels = Array.isArray(next) ? next : [];
      const section = getSection();
      if (section) markFavorites([...section.querySelectorAll('ytd-guide-entry-renderer')]);
    }

    if (
      !changes.favoriteChannels &&
      !changes.sortLiveChannels &&
      !changes.expandSubscriptions &&
      !changes.liveChannelDirectLink
    ) {
      return;
    }

    let collapseRequested = false;
    if (changes.sortLiveChannels) {
      settings.sortLiveChannels = changes.sortLiveChannels.newValue !== false;
    }
    if (changes.expandSubscriptions) {
      settings.expandSubscriptions = changes.expandSubscriptions.newValue !== false;
      collapseRequested = !settings.expandSubscriptions;
    }
    if (changes.liveChannelDirectLink) {
      settings.liveChannelDirectLink = changes.liveChannelDirectLink.newValue !== false;
    }

    (async () => {
      if (collapseRequested) await collapseNow();
      apply();
    })();
  });

  document.addEventListener('click', onLiveBadgeClick, true);
  document.addEventListener('auxclick', onLiveBadgeClick, true);
  document.addEventListener('click', onFavStarClick, true);

  document.addEventListener('ylh:live-ended', () => hopToNextLive());

  pickLiveOnThisPage();

  document.addEventListener('yt-navigate-finish', () => {
    apply();
    scheduleChannelsPageHop();
  });
})();
