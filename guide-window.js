(function () {
  'use strict';

  if (window.top !== window) return;

  const WINDOW_ATTR = 'data-ylh-guide-window';
  const STYLE_ID = 'ylh-guide-window';
  const REFRESH_EVENT = 'ylh:guide-refresh';
  const REFRESH_MS = 60000;
  const KEEP_OPEN_MS = 1000;
  const ALIVE_MS = 10000;
  const REOPEN_COOLDOWN_MS = 3000;
  const FAV_CLASS = 'ylh-fav-star';
  const LIVE_LINK_ATTR = 'data-ylh-live-link';
  const GUIDE_BUTTON_SELECTOR = '#guide-button button, #guide-button';
  const OPEN_BUTTON_ID = 'ylh-guide-window-button';
  const OPEN_BUTTON_STYLE_ID = 'ylh-guide-window-button-style';
  const OPEN_BUTTON_TITLE = '登録チャンネルを別ウィンドウで表示／閉じる';
  const OPEN_BUTTON_CHECK_MS = 1000;
  const INFO_CLASS = 'ylh-live-info';
  const INFO_STYLE_ID = 'ylh-live-info-style';
  const INFO_LINK_ATTR = 'data-ylh-info-link';
  const INFO_RENDER_MS = 1000;
  const LABEL_CLASS = 'ylh-live-label';
  const LABELS_ATTR = 'data-ylh-labels';
  const LABEL_COLOR_ATTR = 'data-ylh-color';
  const DEFAULT_LABEL_COLOR = 'blue';
  const LABEL_COLORS = {
    red: ['#d93025', '#ff6b6b'],
    orange: ['#e8710a', '#ffa94d'],
    yellow: ['#b08800', '#ffd43b'],
    lime: ['#5c940d', '#a9e34b'],
    green: ['#188038', '#51cf66'],
    sky: ['#0b8bb3', '#66d9e8'],
    blue: ['#065fd4', '#3ea6ff'],
    purple: ['#7b3fc4', '#b197fc'],
    pink: ['#d6336c', '#f783ac'],
    brown: ['#8b5a2b', '#c8a07a'],
    gray: ['#606060', '#aaaaaa'],
    black: ['#0f0f0f', '#f1f1f1'],
  };
  const SUB_HEADER_SELECTOR =
    'ytd-guide-section-renderer #items > ytd-guide-collapsible-section-entry-renderer' +
    ' a[href="/feed/subscriptions"]';
  const CLIENT_VERSION_FALLBACK = '2.20240101.00.00';
  const KEYWORD_SPLIT_RE = /[,，、\n]+/;
  const URL_SPLIT_RE = /[\s,，、]+/;

  const scope = `:root[${WINDOW_ATTR}][${WINDOW_ATTR}]`;
  const drawer = `${scope} tp-yt-app-drawer#guide`;
  const subs =
    ':has(#items > ytd-guide-collapsible-section-entry-renderer a[href="/feed/subscriptions"])';
  const CSS =
    `${scope} #masthead-container,${scope} ytd-page-manager,${scope} ytd-mini-guide-renderer,` +
    `${drawer} #header,${drawer} #scrim{display:none!important;}` +
    `${drawer}${subs} ytd-guide-section-renderer:not(${subs}),` +
    `${drawer}${subs} ytd-guide-signin-promo-renderer,` +
    `${drawer}${subs} ytd-guide-renderer #footer{display:none!important;}` +
    `${drawer} #contentContainer{width:100vw!important;transform:none!important;` +
    'background-color:var(--yt-spec-base-background)!important;}' +
    `${drawer} #guide-content{background-color:transparent!important;text-shadow:none!important;}` +
    `${drawer} ytd-guide-renderer{width:100%!important;}`;

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  let lastOpenAt = 0;
  function keepOpen() {
    const guide = document.querySelector('tp-yt-app-drawer#guide');
    if (guide && guide.hasAttribute('opened')) return;
    if (Date.now() - lastOpenAt < REOPEN_COOLDOWN_MS) return;
    const button = document.querySelector(GUIDE_BUTTON_SELECTOR);
    if (!button) return;
    lastOpenAt = Date.now();
    button.click();
  }

  function targetUrl(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (node.classList.contains(FAV_CLASS)) return null;
      const live = node.getAttribute(LIVE_LINK_ATTR) || node.getAttribute(INFO_LINK_ATTR);
      if (live) return live;
      if (node.tagName === 'A') {
        const href = node.getAttribute('href');
        return href && href !== '#' ? href : null;
      }
    }
    return null;
  }

  function onClick(event) {
    if (event.type === 'click' && event.button !== 0) return;
    if (event.type === 'auxclick' && event.button !== 1) return;
    const href = targetUrl(event);
    if (!href) return;
    let url;
    try {
      url = new URL(href, location.origin);
    } catch (e) {
      return;
    }
    if (url.origin !== location.origin) return;
    event.preventDefault();
    event.stopPropagation();
    const inNewTab = event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey;
    if (!send({ type: 'guide-window:open', url: url.href, inNewTab })) window.close();
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

  const textOf = (node) =>
    (node && (node.simpleText ?? (node.runs || []).map((run) => run.text).join(''))) || '';

  function metadataTitle(data) {
    for (const action of data?.actions || []) {
      const title = textOf(action.updateTitleAction?.title);
      if (title) return title;
    }
    return '';
  }

  function metadataViewers(data) {
    for (const action of data?.actions || []) {
      const renderer = action.updateViewershipAction?.viewCount?.videoViewCountRenderer;
      const count = Number(renderer?.originalViewCount);
      if (renderer?.originalViewCount && Number.isFinite(count)) return count;
    }
    for (const mutation of data?.frameworkUpdates?.entityBatchUpdate?.mutations || []) {
      const count = Number(mutation.payload?.viewCountEntity?.viewCountNumber);
      if (Number.isFinite(count)) return count;
    }
    return null;
  }

  const liveInfo = new Map();
  const infoPending = new Set();
  const infoTriedAt = new Map();
  let infoEnabled = false;
  let infoTimer = null;
  let labelRules = [];
  let labelRulesToken = 0;
  const topicIdCache = new Map();

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
    if (topicIdCache.has(url.href)) return topicIdCache.get(url.href);
    try {
      const resolved = await innertube('navigation/resolve_url', { url: url.href });
      if (!resolved) return null;
      const id = resolved.endpoint?.browseEndpoint?.browseId || null;
      topicIdCache.set(url.href, id);
      return id;
    } catch (e) {
      return null;
    }
  }

  async function updateLabelRules(value) {
    const token = ++labelRulesToken;
    const rules = [];
    for (const filter of Array.isArray(value) ? value : []) {
      if (!filter || typeof filter !== 'object' || filter.enabled === false) continue;
      const name = typeof filter.name === 'string' ? filter.name.trim() : '';
      if (!name) continue;
      const ids = new Set();
      for (const url of String(filter.url || '').split(URL_SPLIT_RE)) {
        const id = await topicChannelId(url);
        if (id) ids.add(id);
      }
      const keywords = String(filter.keywords || '')
        .split(KEYWORD_SPLIT_RE)
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean);
      const color = Object.hasOwn(LABEL_COLORS, filter.color) ? filter.color : DEFAULT_LABEL_COLOR;
      if (ids.size || keywords.length) rules.push({ name, color, ids, keywords });
    }
    if (token === labelRulesToken) labelRules = rules;
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

  function matchedLabels(info) {
    const text = `${info.title}\n${info.description}`.toLowerCase();
    const labels = [];
    for (const rule of labelRules) {
      const hit =
        rule.ids.size && info.topics?.length
          ? info.topics.some((id) => rule.ids.has(id))
          : rule.keywords.some((keyword) => text.includes(keyword));
      if (hit && !labels.some((label) => label.name === rule.name)) {
        labels.push({ name: rule.name, color: rule.color });
      }
    }
    return labels;
  }

  function setLabels(line, labels) {
    const key = labels.map(({ name, color }) => `${color}:${name}`).join('\n');
    if ((line.getAttribute(LABELS_ATTR) ?? '') === key) return;
    line.setAttribute(LABELS_ATTR, key);
    line.querySelectorAll(`.${LABEL_CLASS}`).forEach((label) => label.remove());
    for (const { name, color } of labels) {
      const label = document.createElement('span');
      label.className = LABEL_CLASS;
      label.setAttribute(LABEL_COLOR_ATTR, color);
      label.textContent = name;
      line.appendChild(label);
    }
  }

  async function fetchLiveInfo(path) {
    try {
      const resolved = await innertube('navigation/resolve_url', {
        url: `https://www.youtube.com${path}/live`,
      });
      if (!resolved) return undefined;
      const videoId = resolved.endpoint?.watchEndpoint?.videoId;
      if (!videoId) return null;
      let info = liveInfo.get(path);
      if (!info || info.videoId !== videoId) {
        const player = await innertube('player', { videoId });
        if (!player) return undefined;
        const details = player.videoDetails;
        if (!details || details.isLive !== true || details.isUpcoming === true) return null;
        const start = Date.parse(
          player.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.startTimestamp
        );
        info = {
          videoId,
          title: details.title || '',
          startMs: Number.isFinite(start) ? start : null,
          viewers: null,
          description: details.shortDescription || '',
          topics: null,
        };
      }
      if (info.topics === null && labelRules.some((rule) => rule.ids.size)) {
        const next = await innertube('next', { videoId });
        if (next) info = { ...info, topics: topicChannelIds(next) };
      }
      const metadata = await innertube('updated_metadata', { videoId });
      return {
        ...info,
        title: metadataTitle(metadata) || info.title,
        viewers: metadataViewers(metadata) ?? info.viewers,
      };
    } catch (e) {
      return undefined;
    }
  }

  function requestLiveInfo(path) {
    if (infoPending.has(path)) return;
    infoPending.add(path);
    infoTriedAt.set(path, Date.now());
    fetchLiveInfo(path)
      .then((info) => {
        if (!infoEnabled) return;
        if (info) liveInfo.set(path, info);
        else if (info === null) liveInfo.delete(path);
      })
      .finally(() => infoPending.delete(path));
  }

  function elapsedText(ms) {
    const total = Math.max(0, Math.floor(ms / 60000));
    const h = Math.floor(total / 60);
    const m = String(total % 60).padStart(2, '0');
    return h ? `${h}h${m}m` : `${m}m`;
  }

  function statsText(info, now) {
    const parts = [];
    if (info.viewers != null) parts.push(`${info.viewers.toLocaleString('ja-JP')}人視聴`);
    if (info.startMs != null) parts.push(elapsedText(now - info.startMs));
    return parts.join(' · ');
  }

  function setText(line, text) {
    if (line.firstChild.data !== text) line.firstChild.data = text;
  }

  function infoBox() {
    const box = document.createElement('div');
    box.className = INFO_CLASS;
    for (let i = 0; i < 2; i++) {
      const line = document.createElement('div');
      line.appendChild(document.createTextNode(''));
      box.appendChild(line);
    }
    return box;
  }

  function isLiveEntry(entry) {
    const badge = entry.querySelector('.guide-entry-badge');
    return !!badge && getComputedStyle(badge).display !== 'none';
  }

  function entryPath(entry) {
    const link = entry.querySelector('a#endpoint');
    const href = link && link.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('/feed/')) return null;
    return href.replace(/\/+$/, '');
  }

  function renderLiveInfo() {
    const header = document.querySelector(SUB_HEADER_SELECTOR);
    const section = header && header.closest('ytd-guide-section-renderer');
    if (!section) return;
    const now = Date.now();
    for (const entry of section.querySelectorAll('ytd-guide-entry-renderer')) {
      const path = entryPath(entry);
      const live = !!path && isLiveEntry(entry);
      if (live && now - (infoTriedAt.get(path) ?? 0) >= REFRESH_MS) requestLiveInfo(path);
      const info = live ? liveInfo.get(path) : null;
      let box = entry.querySelector(`:scope > .${INFO_CLASS}`);
      if (!info) {
        box?.remove();
        continue;
      }
      if (!box) {
        const link = entry.querySelector(':scope > a#endpoint');
        if (!link) continue;
        box = infoBox();
        link.after(box);
      }
      const url = `/watch?v=${info.videoId}`;
      if (box.getAttribute(INFO_LINK_ATTR) !== url) box.setAttribute(INFO_LINK_ATTR, url);
      if (box.title !== info.title) box.title = info.title;
      setText(box.firstChild, info.title);
      setText(box.lastChild, statsText(info, now));
      setLabels(box.lastChild, matchedLabels(info));
    }
  }

  function liveInfoStyle() {
    if (document.getElementById(INFO_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = INFO_STYLE_ID;
    style.textContent =
      `${scope} .${INFO_CLASS}{display:block;margin-top:-8px;padding:0 12px 6px 60px;` +
      'font-family:Roboto,Arial,sans-serif;font-size:12px;line-height:16px;color:#606060;' +
      'cursor:pointer;}' +
      `${scope}[dark] .${INFO_CLASS}{color:#aaaaaa;}` +
      `${scope} .${INFO_CLASS} > div{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}` +
      `${scope} .${LABEL_CLASS}{display:inline-block;margin-left:6px;padding:0 7px;border-radius:999px;` +
      'border:1px solid currentColor;font-size:11px;line-height:13px;vertical-align:1px;}' +
      Object.entries(LABEL_COLORS)
        .map(
          ([key, [light, dark]]) =>
            `${scope} .${LABEL_CLASS}[${LABEL_COLOR_ATTR}="${key}"]{color:${light};}` +
            `${scope}[dark] .${LABEL_CLASS}[${LABEL_COLOR_ATTR}="${key}"]{color:${dark};}`
        )
        .join('') +
      `${scope} ytd-guide-entry-renderer:has(> .${INFO_CLASS}):hover{background-color:rgba(0,0,0,0.05);border-radius:10px;}` +
      `${scope}[dark] ytd-guide-entry-renderer:has(> .${INFO_CLASS}):hover{background-color:rgba(255,255,255,0.1);}` +
      `${scope} ytd-guide-entry-renderer:has(> .${INFO_CLASS}):hover > #endpoint.yt-simple-endpoint{background-color:transparent;}` +
      `${scope} ytd-guide-entry-renderer:has(> .${INFO_CLASS}) > .${FAV_CLASS}{top:20px;}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function showLiveInfo(on) {
    infoEnabled = on;
    clearInterval(infoTimer);
    infoTimer = null;
    if (on) {
      liveInfoStyle();
      renderLiveInfo();
      infoTimer = setInterval(renderLiveInfo, INFO_RENDER_MS);
    } else {
      liveInfo.clear();
      infoTriedAt.clear();
      document.querySelectorAll(`.${INFO_CLASS}`).forEach((box) => box.remove());
    }
  }

  function reportAlive() {
    try {
      chrome.runtime.sendMessage({ type: 'guide-window:alive' }).catch(() => {
        if (!chrome.runtime?.id) window.close();
      });
    } catch (e) {
      window.close();
    }
  }

  function startGuideWindow() {
    document.documentElement.setAttribute(WINDOW_ATTR, '');
    addStyle();
    window.addEventListener('click', onClick, true);
    window.addEventListener('auxclick', onClick, true);
    setInterval(keepOpen, KEEP_OPEN_MS);
    setInterval(() => document.dispatchEvent(new CustomEvent(REFRESH_EVENT)), REFRESH_MS);
    setInterval(reportAlive, ALIVE_MS);
    chrome.storage.local.get(['guideWindowLiveInfo', 'liveFilters'], (stored) => {
      updateLabelRules(stored.liveFilters);
      showLiveInfo(stored.guideWindowLiveInfo !== false);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.liveFilters) updateLabelRules(changes.liveFilters.newValue);
      if (changes.guideWindowLiveInfo) {
        showLiveInfo(changes.guideWindowLiveInfo.newValue !== false);
      }
    });
  }

  const ICON_SVG =
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">' +
    '<path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm2 0v14h4V5H5z' +
    'm6 0v14h8V5h-8zM6 7h2v2H6V7zm0 4h2v2H6v-2zm0 4h2v2H6v-2z"/></svg>';

  function openButtonStyle() {
    if (document.getElementById(OPEN_BUTTON_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = OPEN_BUTTON_STYLE_ID;
    style.textContent =
      `#${OPEN_BUTTON_ID}{display:inline-flex;align-items:center;justify-content:center;` +
      'flex:none;width:40px;height:40px;margin-left:4px;padding:0;border:none;border-radius:50%;' +
      'background:transparent;color:#606060;cursor:pointer;}' +
      `#${OPEN_BUTTON_ID}:hover{background:rgba(0,0,0,0.08);color:#0f0f0f;}` +
      `#${OPEN_BUTTON_ID}:active{background:rgba(0,0,0,0.14);}` +
      `html[dark] #${OPEN_BUTTON_ID}{color:#aaaaaa;}` +
      `html[dark] #${OPEN_BUTTON_ID}:hover{background:rgba(255,255,255,0.12);color:#f1f1f1;}` +
      `html[dark] #${OPEN_BUTTON_ID}:active{background:rgba(255,255,255,0.2);}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function currentScreen() {
    return {
      left: screen.availLeft,
      top: screen.availTop,
      width: screen.availWidth,
      height: screen.availHeight,
    };
  }

  function onOpenButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!send({ type: 'guide-window:toggle', screen: currentScreen() })) stopViewer();
  }

  function placeOpenButton() {
    const existing = document.getElementById(OPEN_BUTTON_ID);
    const anchor = document.querySelector('ytd-masthead #start #guide-button');
    if (!anchor) return;
    if (existing && existing.previousElementSibling === anchor) return;
    const button = existing || document.createElement('button');
    if (!existing) {
      button.id = OPEN_BUTTON_ID;
      button.type = 'button';
      button.title = OPEN_BUTTON_TITLE;
      button.setAttribute('aria-label', OPEN_BUTTON_TITLE);
      button.innerHTML = ICON_SVG;
      button.addEventListener('click', onOpenButtonClick);
    }
    openButtonStyle();
    anchor.after(button);
  }

  let openButtonTimer = null;
  function showOpenButton(on) {
    clearInterval(openButtonTimer);
    openButtonTimer = null;
    if (on) {
      placeOpenButton();
      openButtonTimer = setInterval(placeOpenButton, OPEN_BUTTON_CHECK_MS);
    } else {
      document.getElementById(OPEN_BUTTON_ID)?.remove();
    }
  }

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch (e) {
      return false;
    }
  }

  function send(message) {
    if (!extensionAlive()) return false;
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  }

  function stopViewer() {
    document.removeEventListener('visibilitychange', reportViewer);
    window.removeEventListener('focus', reportViewer);
    document.removeEventListener('visibilitychange', askAutoOpen);
    showOpenButton(false);
  }

  function reportViewer() {
    if (document.visibilityState !== 'visible') return;
    if (!send({ type: 'guide-window:viewer' })) stopViewer();
  }

  function loggedIn() {
    return document.cookie
      .split('; ')
      .some((part) => part.startsWith('SAPISID=') || part.startsWith('__Secure-3PAPISID='));
  }

  let autoOpenAsked = false;
  function askAutoOpen() {
    if (autoOpenAsked || document.visibilityState !== 'visible' || !loggedIn()) return;
    autoOpenAsked = true;
    if (!send({ type: 'guide-window:auto-open', screen: currentScreen() })) stopViewer();
  }

  function startViewer() {
    reportViewer();
    document.addEventListener('visibilitychange', reportViewer);
    window.addEventListener('focus', reportViewer);
    chrome.storage.local.get(['guideWindowButton', 'guideWindowAutoOpen'], (stored) => {
      showOpenButton(stored.guideWindowButton !== false);
      if (stored.guideWindowAutoOpen !== true) return;
      askAutoOpen();
      document.addEventListener('visibilitychange', askAutoOpen);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.guideWindowButton) {
        showOpenButton(changes.guideWindowButton.newValue !== false);
      }
    });
  }

  chrome.runtime
    .sendMessage({ type: 'guide-window:whoami' })
    .then((response) => (response && response.isGuideWindow ? startGuideWindow() : startViewer()))
    .catch(() => {
    });
})();
