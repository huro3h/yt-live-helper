const jumpToLiveToggle = document.getElementById('jumpToLiveToggle');
const autoNextLiveToggle = document.getElementById('autoNextLiveToggle');
const autoNextLiveFields = document.getElementById('autoNextLiveFields');
const autoNextLiveTargetRadios = document.querySelectorAll('input[name="autoNextLiveTarget"]');
const autoNextLiveUrlInput = document.getElementById('autoNextLiveUrl');
const autoNextLiveFallbackToggle = document.getElementById('autoNextLiveFallbackToggle');
const autoNextLiveSkipHiddenToggle = document.getElementById('autoNextLiveSkipHiddenToggle');
const autoNextLiveSkipHiddenRow = document.getElementById('autoNextLiveSkipHiddenRow');
const autoNextLiveSkipHiddenNote = document.getElementById('autoNextLiveSkipHiddenNote');
const autoNextLiveLimitViewersToggle = document.getElementById('autoNextLiveLimitViewersToggle');
const autoNextLiveLimitViewersRow = document.getElementById('autoNextLiveLimitViewersRow');
const autoNextLiveMaxViewersInput = document.getElementById('autoNextLiveMaxViewers');
const autoNextLiveMaxViewersRow = document.getElementById('autoNextLiveMaxViewersRow');
const autoNextLiveMaxViewersNote = document.getElementById('autoNextLiveMaxViewersNote');
const channelsPageHopToggle = document.getElementById('channelsPageHopToggle');
const channelsPageHopDelayInput = document.getElementById('channelsPageHopDelaySec');
const channelsPageHopDelayRow = document.getElementById('channelsPageHopDelayRow');
const channelsPageHopDelayNote = document.getElementById('channelsPageHopDelayNote');
const watchFavoritesToggle = document.getElementById('watchFavoritesToggle');
const watchFavoritesFilterToggle = document.getElementById('watchFavoritesFilterToggle');
const watchFavoritesFilterRow = document.getElementById('watchFavoritesFilterRow');
const watchFavoritesFilterNote = document.getElementById('watchFavoritesFilterNote');
const watchFavoritesNoticeInput = document.getElementById('watchFavoritesNoticeSec');
const watchFavoritesNoticeRow = document.getElementById('watchFavoritesNoticeRow');
const watchFavoritesNoticeNote = document.getElementById('watchFavoritesNoticeNote');
const autoLikeFavoritesToggle = document.getElementById('autoLikeFavoritesToggle');
const autoLikeDelayInput = document.getElementById('autoLikeDelaySec');
const autoLikeDelayRow = document.getElementById('autoLikeDelayRow');
const autoLikeDelayNote = document.getElementById('autoLikeDelayNote');
const favoriteList = document.getElementById('favoriteList');
const favoriteEmpty = document.getElementById('favoriteEmpty');
const favoriteHint = document.getElementById('favoriteHint');
const autoNextLiveFilterToggle = document.getElementById('autoNextLiveFilterToggle');
const autoNextLiveFilterRow = document.getElementById('autoNextLiveFilterRow');
const autoNextLiveFilterNote = document.getElementById('autoNextLiveFilterNote');
const liveFilterList = document.getElementById('liveFilterList');
const liveFilterEmpty = document.getElementById('liveFilterEmpty');
const editLiveFiltersButton = document.getElementById('editLiveFilters');
const allChatToggle = document.getElementById('allChatToggle');
const hidePinnedToggle = document.getElementById('hidePinnedToggle');
const hidePollsToggle = document.getElementById('hidePollsToggle');
const hideSystemMessagesToggle = document.getElementById('hideSystemMessagesToggle');
const preferHorizontalLiveToggle = document.getElementById('preferHorizontalLiveToggle');
const tabMuteMarkToggle = document.getElementById('tabMuteMarkToggle');
const tabMuteMarkPositionSelect = document.getElementById('tabMuteMarkPosition');
const tabMuteMarkPositionRow = document.getElementById('tabMuteMarkPositionRow');
const hideThumbnailActionsToggle = document.getElementById('hideThumbnailActionsToggle');
const sortLiveChannelsToggle = document.getElementById('sortLiveChannelsToggle');
const expandSubscriptionsToggle = document.getElementById('expandSubscriptionsToggle');
const liveChannelDirectLinkToggle = document.getElementById('liveChannelDirectLinkToggle');
const guideWindowButtonToggle = document.getElementById('guideWindowButtonToggle');
const guideWindowLiveInfoToggle = document.getElementById('guideWindowLiveInfoToggle');
const guideWindowAutoOpenToggle = document.getElementById('guideWindowAutoOpenToggle');
const translucentGuideToggle = document.getElementById('translucentGuideToggle');
const guideTransparencyFields = document.getElementById('guideTransparencyFields');
const guideTransparencyInput = document.getElementById('guideTransparency');
const guideTransparencyValue = document.getElementById('guideTransparencyValue');
const autoQualityToggle = document.getElementById('autoQualityToggle');
const useMaxQualityToggle = document.getElementById('useMaxQualityToggle');
const defaultQualitySelect = document.getElementById('defaultQuality');
const qualityFields = document.getElementById('qualityFields');
const appVersion = document.getElementById('appVersion');

appVersion.textContent = `v${chrome.runtime.getManifest().version}`;

let jumpToLive = true;
let autoNextLive = false;
const DEFAULT_NEXT_LIVE_TARGET = 'subscriptions';
let autoNextLiveFallback = false;
let autoNextLiveSkipHidden = true;
let autoNextLiveLimitViewers = false;
const DEFAULT_MAX_VIEWERS = 100;
const MIN_MAX_VIEWERS = 1;
const MAX_MAX_VIEWERS = 10000000;
let channelsPageHop = false;
const DEFAULT_CHANNELS_PAGE_HOP_DELAY_SEC = 60;
const MIN_CHANNELS_PAGE_HOP_DELAY_SEC = 10;
const MAX_CHANNELS_PAGE_HOP_DELAY_SEC = 3600;
let autoNextLiveFilter = false;
let liveFilters = [];
let watchFavorites = false;
let watchFavoritesFilter = false;
const DEFAULT_FAV_NOTICE_SEC = 20;
const MIN_FAV_NOTICE_SEC = 5;
const MAX_FAV_NOTICE_SEC = 300;
let autoLikeFavorites = false;
const DEFAULT_LIKE_DELAY_SEC = 120;
const MIN_LIKE_DELAY_SEC = 10;
const MAX_LIKE_DELAY_SEC = 3600;
let favoriteChannels = [];
let allChat = true;
let hidePinned = true;
let hidePolls = true;
let hideSystemMessages = true;
let preferHorizontalLive = true;
let tabMuteMark = true;
let hideThumbnailActions = true;
let sortLiveChannels = true;
let expandSubscriptions = true;
let liveChannelDirectLink = true;
let guideWindowButton = true;
let guideWindowLiveInfo = true;
let guideWindowAutoOpen = false;
let translucentGuide = true;
const DEFAULT_GUIDE_TRANSPARENCY = 45;
const MIN_GUIDE_TRANSPARENCY = 0;
const MAX_GUIDE_TRANSPARENCY = 100;
let autoQuality = true;
let useMaxQuality = false;
const DEFAULT_QUALITY = 'hd1080';

const SETTING_KEYS = [
  'jumpToLive',
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
  'watchFavorites',
  'watchFavoritesFilter',
  'watchFavoritesNoticeSec',
  'autoLikeFavorites',
  'autoLikeDelaySec',
  'favoriteChannels',
  'allChat',
  'hidePinned',
  'hidePolls',
  'hideSystemMessages',
  'preferHorizontalLive',
  'tabMuteMark',
  'tabMuteMarkPosition',
  'hideThumbnailActions',
  'sortLiveChannels',
  'expandSubscriptions',
  'liveChannelDirectLink',
  'guideWindowButton',
  'guideWindowLiveInfo',
  'guideWindowAutoOpen',
  'translucentGuide',
  'guideTransparency',
  'autoQuality',
  'useMaxQuality',
  'defaultQuality',
];

async function init() {
  const stored = await chrome.storage.local.get(SETTING_KEYS);
  if (typeof stored.jumpToLive === 'boolean') {
    jumpToLive = stored.jumpToLive;
  }
  if (typeof stored.autoNextLive === 'boolean') {
    autoNextLive = stored.autoNextLive;
  }
  if (typeof stored.autoNextLiveFallback === 'boolean') {
    autoNextLiveFallback = stored.autoNextLiveFallback;
  }
  if (typeof stored.autoNextLiveSkipHidden === 'boolean') {
    autoNextLiveSkipHidden = stored.autoNextLiveSkipHidden;
  }
  if (typeof stored.autoNextLiveLimitViewers === 'boolean') {
    autoNextLiveLimitViewers = stored.autoNextLiveLimitViewers;
  }
  if (typeof stored.channelsPageHop === 'boolean') {
    channelsPageHop = stored.channelsPageHop;
  }
  if (typeof stored.watchFavorites === 'boolean') {
    watchFavorites = stored.watchFavorites;
  }
  if (typeof stored.watchFavoritesFilter === 'boolean') {
    watchFavoritesFilter = stored.watchFavoritesFilter;
  }
  if (typeof stored.autoLikeFavorites === 'boolean') {
    autoLikeFavorites = stored.autoLikeFavorites;
  }
  if (Array.isArray(stored.favoriteChannels)) {
    favoriteChannels = stored.favoriteChannels.filter(
      (favorite) => favorite && typeof favorite.path === 'string'
    );
  }
  if (typeof stored.allChat === 'boolean') {
    allChat = stored.allChat;
  }
  if (typeof stored.hidePinned === 'boolean') {
    hidePinned = stored.hidePinned;
  }
  if (typeof stored.hidePolls === 'boolean') {
    hidePolls = stored.hidePolls;
  }
  if (typeof stored.hideSystemMessages === 'boolean') {
    hideSystemMessages = stored.hideSystemMessages;
  }
  if (typeof stored.autoNextLiveFilter === 'boolean') {
    autoNextLiveFilter = stored.autoNextLiveFilter;
  }
  liveFilters = readLiveFilters(stored.liveFilters);
  if (typeof stored.preferHorizontalLive === 'boolean') {
    preferHorizontalLive = stored.preferHorizontalLive;
  }
  if (typeof stored.tabMuteMark === 'boolean') {
    tabMuteMark = stored.tabMuteMark;
  }
  if (typeof stored.hideThumbnailActions === 'boolean') {
    hideThumbnailActions = stored.hideThumbnailActions;
  }
  if (typeof stored.guideWindowButton === 'boolean') {
    guideWindowButton = stored.guideWindowButton;
  }
  if (typeof stored.guideWindowLiveInfo === 'boolean') {
    guideWindowLiveInfo = stored.guideWindowLiveInfo;
  }
  if (typeof stored.guideWindowAutoOpen === 'boolean') {
    guideWindowAutoOpen = stored.guideWindowAutoOpen;
  }
  if (typeof stored.sortLiveChannels === 'boolean') {
    sortLiveChannels = stored.sortLiveChannels;
  }
  if (typeof stored.expandSubscriptions === 'boolean') {
    expandSubscriptions = stored.expandSubscriptions;
  }
  if (typeof stored.liveChannelDirectLink === 'boolean') {
    liveChannelDirectLink = stored.liveChannelDirectLink;
  }
  if (typeof stored.translucentGuide === 'boolean') {
    translucentGuide = stored.translucentGuide;
  }
  if (typeof stored.autoQuality === 'boolean') {
    autoQuality = stored.autoQuality;
  }
  if (typeof stored.useMaxQuality === 'boolean') {
    useMaxQuality = stored.useMaxQuality;
  }
  defaultQualitySelect.value =
    typeof stored.defaultQuality === 'string' ? stored.defaultQuality : DEFAULT_QUALITY;
  const nextLiveTarget =
    stored.autoNextLiveTarget === 'page' ? 'page' : DEFAULT_NEXT_LIVE_TARGET;
  for (const radio of autoNextLiveTargetRadios) {
    radio.checked = radio.value === nextLiveTarget;
  }
  autoNextLiveUrlInput.value =
    typeof stored.autoNextLiveUrl === 'string' ? stored.autoNextLiveUrl : '';
  autoNextLiveMaxViewersInput.value = String(
    parseMaxViewers(stored.autoNextLiveMaxViewers) ?? DEFAULT_MAX_VIEWERS
  );
  channelsPageHopDelayInput.value = String(
    parseChannelsPageHopDelay(stored.channelsPageHopDelaySec) ?? DEFAULT_CHANNELS_PAGE_HOP_DELAY_SEC
  );
  autoLikeDelayInput.value = String(parseDelaySec(stored.autoLikeDelaySec) ?? DEFAULT_LIKE_DELAY_SEC);
  watchFavoritesNoticeInput.value = String(
    parseFavNoticeSec(stored.watchFavoritesNoticeSec) ?? DEFAULT_FAV_NOTICE_SEC
  );
  jumpToLiveToggle.classList.toggle('on', jumpToLive);
  autoNextLiveToggle.classList.toggle('on', autoNextLive);
  autoNextLiveFallbackToggle.classList.toggle('on', autoNextLiveFallback);
  autoNextLiveSkipHiddenToggle.classList.toggle('on', autoNextLiveSkipHidden);
  autoNextLiveLimitViewersToggle.classList.toggle('on', autoNextLiveLimitViewers);
  autoNextLiveFilterToggle.classList.toggle('on', autoNextLiveFilter);
  channelsPageHopToggle.classList.toggle('on', channelsPageHop);
  renderLiveFilters();
  watchFavoritesToggle.classList.toggle('on', watchFavorites);
  watchFavoritesFilterToggle.classList.toggle('on', watchFavoritesFilter);
  syncWatchFavoritesFields();
  autoLikeFavoritesToggle.classList.toggle('on', autoLikeFavorites);
  allChatToggle.classList.toggle('on', allChat);
  hidePinnedToggle.classList.toggle('on', hidePinned);
  hidePollsToggle.classList.toggle('on', hidePolls);
  hideSystemMessagesToggle.classList.toggle('on', hideSystemMessages);
  preferHorizontalLiveToggle.classList.toggle('on', preferHorizontalLive);
  tabMuteMarkToggle.classList.toggle('on', tabMuteMark);
  tabMuteMarkPositionSelect.value = stored.tabMuteMarkPosition === 'bottom' ? 'bottom' : 'top';
  syncTabMuteMarkFields();
  hideThumbnailActionsToggle.classList.toggle('on', hideThumbnailActions);
  sortLiveChannelsToggle.classList.toggle('on', sortLiveChannels);
  expandSubscriptionsToggle.classList.toggle('on', expandSubscriptions);
  liveChannelDirectLinkToggle.classList.toggle('on', liveChannelDirectLink);
  guideWindowButtonToggle.classList.toggle('on', guideWindowButton);
  guideWindowLiveInfoToggle.classList.toggle('on', guideWindowLiveInfo);
  guideWindowAutoOpenToggle.classList.toggle('on', guideWindowAutoOpen);
  translucentGuideToggle.classList.toggle('on', translucentGuide);
  guideTransparencyInput.value = String(parseGuideTransparency(stored.guideTransparency) ?? DEFAULT_GUIDE_TRANSPARENCY);
  syncGuideTransparencyFields();
  autoQualityToggle.classList.toggle('on', autoQuality);
  useMaxQualityToggle.classList.toggle('on', useMaxQuality);
  syncQualityFields();
  syncNextLiveFields();
  syncAutoLikeFields();
  enableFavoriteDnd();
  renderFavorites();
}

function renderFavorites() {
  favoriteEmpty.hidden = favoriteChannels.length > 0;
  favoriteHint.hidden = favoriteChannels.length < 2;
  favoriteList.textContent = '';
  favoriteChannels.forEach((favorite, index) => {
    const row = document.createElement('div');
    row.className = 'fav-row';
    row.dataset.path = favorite.path;

    row.appendChild(makeHandle());

    const name = document.createElement('span');
    name.className = 'fav-name';
    name.textContent = favorite.name || favorite.path;
    name.title = favorite.path;
    row.appendChild(name);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'fav-btn remove';
    remove.textContent = '×';
    remove.title = 'お気に入りから外す';
    remove.addEventListener('click', () => removeFavorite(index));
    row.appendChild(remove);

    favoriteList.appendChild(row);
  });
}

function makeHandle() {
  const handle = document.createElement('span');
  handle.className = 'fav-handle';
  handle.textContent = '⠿';
  handle.title = 'ドラッグして並べ替え';
  handle.setAttribute('draggable', 'true');
  return handle;
}

function rowAfterPointer(y) {
  const rows = [...favoriteList.querySelectorAll('.fav-row')];
  let closest = { offset: Number.NEGATIVE_INFINITY, row: null };
  for (const row of rows) {
    const box = row.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, row };
    }
  }
  return closest.row;
}

const dropLine = document.createElement('div');
dropLine.className = 'fav-drop-line';

function showDropLine(after) {
  const rows = [...favoriteList.querySelectorAll('.fav-row')];
  if (rows.length === 0) return;
  const last = rows[rows.length - 1];
  const y = after ? after.offsetTop : last.offsetTop + last.offsetHeight;
  dropLine.style.top = `${y}px`;
  if (!dropLine.isConnected) favoriteList.appendChild(dropLine);
}

const AUTO_SCROLL_ZONE = 64;
const AUTO_SCROLL_MAX_SPEED = 18;

function autoScrollSpeed(y) {
  const bottom = window.innerHeight;
  if (y < AUTO_SCROLL_ZONE) {
    return -AUTO_SCROLL_MAX_SPEED * Math.min(1, (AUTO_SCROLL_ZONE - y) / AUTO_SCROLL_ZONE);
  }
  if (y > bottom - AUTO_SCROLL_ZONE) {
    return AUTO_SCROLL_MAX_SPEED * Math.min(1, (y - (bottom - AUTO_SCROLL_ZONE)) / AUTO_SCROLL_ZONE);
  }
  return 0;
}

function enableFavoriteDnd() {
  let dragging = null;
  let dropBefore = null;
  let dropped = false;
  let pointerY = null;
  let lastDragoverAt = 0;
  let scrollFrame = 0;

  function autoScrollStep() {
    scrollFrame = 0;
    if (!dragging) return;
    if (pointerY != null && performance.now() - lastDragoverAt < 200) {
      const speed = autoScrollSpeed(pointerY);
      const scroller = document.scrollingElement;
      const before = scroller.scrollTop;
      if (speed !== 0) scroller.scrollTop += speed;
      if (scroller.scrollTop !== before && dropLine.isConnected) {
        dropBefore = rowAfterPointer(pointerY);
        showDropLine(dropBefore);
      }
    }
    scrollFrame = requestAnimationFrame(autoScrollStep);
  }

  document.addEventListener('dragover', (event) => {
    if (!dragging) return;
    pointerY = event.clientY;
    lastDragoverAt = performance.now();
  });

  favoriteList.addEventListener('dragstart', (event) => {
    const from = event.target instanceof Element ? event.target : event.target.parentElement;
    const handle = from && from.closest('.fav-handle');
    if (!handle) return;
    dragging = handle.closest('.fav-row');
    if (!dragging) return;
    dropBefore = dragging.nextElementSibling;
    dropped = false;
    dragging.classList.add('dragging');
    pointerY = null;
    if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScrollStep);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragging.dataset.path || '');
    event.dataTransfer.setDragImage(dragging, 12, dragging.offsetHeight / 2);
  });

  favoriteList.addEventListener('dragover', (event) => {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dropBefore = rowAfterPointer(event.clientY);
    showDropLine(dropBefore);
  });

  favoriteList.addEventListener('dragleave', (event) => {
    if (!dragging || favoriteList.contains(event.relatedTarget)) return;
    dropLine.remove();
  });

  favoriteList.addEventListener('drop', (event) => {
    if (!dragging) return;
    event.preventDefault();
    dropped = true;
  });

  favoriteList.addEventListener('dragend', () => {
    if (!dragging) return;
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    dropLine.remove();
    dragging.classList.remove('dragging');
    const moved = dragging;
    dragging = null;
    if (!dropped || dropBefore === moved || dropBefore === moved.nextElementSibling) return;
    if (dropBefore == null) {
      favoriteList.appendChild(moved);
    } else {
      favoriteList.insertBefore(moved, dropBefore);
    }
    const byPath = new Map(favoriteChannels.map((favorite) => [favorite.path, favorite]));
    const next = [...favoriteList.querySelectorAll('.fav-row')]
      .map((row) => byPath.get(row.dataset.path))
      .filter(Boolean);
    if (next.length !== favoriteChannels.length) {
      renderFavorites();
      return;
    }
    saveFavorites(next);
  });
}

function removeFavorite(index) {
  saveFavorites(favoriteChannels.filter((_, i) => i !== index));
}

function saveFavorites(next) {
  favoriteChannels = next;
  renderFavorites();
  chrome.storage.local.set({ favoriteChannels: next });
}

function syncNextLiveFields() {
  const pageMode = selectedNextLiveTarget() === 'page' || autoNextLiveFallback;
  autoNextLiveFields.classList.toggle('disabled', !autoNextLive);
  autoNextLiveUrlInput.disabled = !autoNextLive || !pageMode;
  autoNextLiveSkipHiddenRow.classList.toggle('row-disabled', !pageMode);
  autoNextLiveSkipHiddenNote.classList.toggle('row-disabled', !pageMode);
  autoNextLiveLimitViewersRow.classList.toggle('row-disabled', !pageMode);
  const limitOn = pageMode && autoNextLiveLimitViewers;
  autoNextLiveMaxViewersInput.disabled = !autoNextLive || !limitOn;
  autoNextLiveMaxViewersRow.classList.toggle('row-disabled', !limitOn);
  autoNextLiveMaxViewersNote.classList.toggle('row-disabled', !limitOn);
  const subscriptionsMode = selectedNextLiveTarget() === 'subscriptions' || autoNextLiveFallback;
  autoNextLiveFilterRow.classList.toggle('row-disabled', !subscriptionsMode);
  autoNextLiveFilterNote.classList.toggle('row-disabled', !subscriptionsMode);
  channelsPageHopDelayInput.disabled = !autoNextLive || !channelsPageHop;
  channelsPageHopDelayRow.classList.toggle('row-disabled', !channelsPageHop);
  channelsPageHopDelayNote.classList.toggle('row-disabled', !channelsPageHop);
}

function readLiveFilters(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((filter) => filter && typeof filter === 'object');
}

function renderLiveFilters() {
  liveFilterEmpty.hidden = liveFilters.length > 0;
  liveFilterList.textContent = '';
  liveFilters.forEach((filter) => {
    const row = document.createElement('div');
    row.className = 'toggle-row';
    const label = document.createElement('span');
    label.className = 'toggle-label';
    label.textContent = typeof filter.name === 'string' && filter.name.trim() ? filter.name : '（名前なし）';
    const toggle = document.createElement('div');
    toggle.className = 'toggle';
    toggle.classList.toggle('on', filter.enabled !== false);
    toggle.addEventListener('click', () => {
      filter.enabled = filter.enabled === false;
      toggle.classList.toggle('on', filter.enabled);
      chrome.storage.local.set({ liveFilters });
    });
    row.append(label, toggle);
    liveFilterList.appendChild(row);
  });
}

editLiveFiltersButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

guideWindowButtonToggle.addEventListener('click', () => {
  guideWindowButton = !guideWindowButton;
  guideWindowButtonToggle.classList.toggle('on', guideWindowButton);
  chrome.storage.local.set({ guideWindowButton });
});

guideWindowLiveInfoToggle.addEventListener('click', () => {
  guideWindowLiveInfo = !guideWindowLiveInfo;
  guideWindowLiveInfoToggle.classList.toggle('on', guideWindowLiveInfo);
  chrome.storage.local.set({ guideWindowLiveInfo });
});

guideWindowAutoOpenToggle.addEventListener('click', () => {
  guideWindowAutoOpen = !guideWindowAutoOpen;
  guideWindowAutoOpenToggle.classList.toggle('on', guideWindowAutoOpen);
  chrome.storage.local.set({ guideWindowAutoOpen });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.liveFilters) return;
  liveFilters = readLiveFilters(changes.liveFilters.newValue);
  renderLiveFilters();
});

function selectedNextLiveTarget() {
  for (const radio of autoNextLiveTargetRadios) {
    if (radio.checked) return radio.value;
  }
  return DEFAULT_NEXT_LIVE_TARGET;
}

function parseMaxViewers(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(n) && n >= MIN_MAX_VIEWERS && n <= MAX_MAX_VIEWERS ? n : null;
}

function parseGuideTransparency(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(n) && n >= MIN_GUIDE_TRANSPARENCY && n <= MAX_GUIDE_TRANSPARENCY ? n : null;
}

function syncGuideTransparencyFields() {
  guideTransparencyFields.classList.toggle('disabled', !translucentGuide);
  guideTransparencyValue.textContent = `${guideTransparencyInput.value}%`;
}

function parseChannelsPageHopDelay(value) {
  const sec = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(sec) &&
    sec >= MIN_CHANNELS_PAGE_HOP_DELAY_SEC &&
    sec <= MAX_CHANNELS_PAGE_HOP_DELAY_SEC
    ? sec
    : null;
}

function parseDelaySec(value) {
  const sec = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(sec) && sec >= MIN_LIKE_DELAY_SEC && sec <= MAX_LIKE_DELAY_SEC ? sec : null;
}

function parseFavNoticeSec(value) {
  const sec = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(sec) && sec >= MIN_FAV_NOTICE_SEC && sec <= MAX_FAV_NOTICE_SEC ? sec : null;
}

function syncWatchFavoritesFields() {
  watchFavoritesNoticeInput.disabled = !watchFavorites;
  watchFavoritesNoticeRow.classList.toggle('row-disabled', !watchFavorites);
  watchFavoritesNoticeNote.classList.toggle('row-disabled', !watchFavorites);
  watchFavoritesFilterRow.classList.toggle('row-disabled', !watchFavorites);
  watchFavoritesFilterNote.classList.toggle('row-disabled', !watchFavorites);
}

function syncAutoLikeFields() {
  autoLikeDelayInput.disabled = !autoLikeFavorites;
  autoLikeDelayRow.classList.toggle('row-disabled', !autoLikeFavorites);
  autoLikeDelayNote.classList.toggle('row-disabled', !autoLikeFavorites);
}

function syncQualityFields() {
  qualityFields.classList.toggle('disabled', !autoQuality);
  defaultQualitySelect.disabled = !autoQuality || useMaxQuality;
}

jumpToLiveToggle.addEventListener('click', () => {
  jumpToLive = !jumpToLive;
  jumpToLiveToggle.classList.toggle('on', jumpToLive);
  chrome.storage.local.set({ jumpToLive });
});

autoNextLiveToggle.addEventListener('click', () => {
  autoNextLive = !autoNextLive;
  autoNextLiveToggle.classList.toggle('on', autoNextLive);
  syncNextLiveFields();
  chrome.storage.local.set({ autoNextLive });
});

chrome.commands.getAll((commands) => {
  const command = commands.find((c) => c.name === 'toggle-watch-favorites');
  if (command && command.shortcut) {
    document.getElementById('watchFavoritesShortcut').textContent = command.shortcut;
  }
});

document.getElementById('openShortcutSettings').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.watchFavorites) return;
  watchFavorites = changes.watchFavorites.newValue === true;
  watchFavoritesToggle.classList.toggle('on', watchFavorites);
  syncWatchFavoritesFields();
});

watchFavoritesToggle.addEventListener('click', () => {
  watchFavorites = !watchFavorites;
  watchFavoritesToggle.classList.toggle('on', watchFavorites);
  syncWatchFavoritesFields();
  chrome.storage.local.set({ watchFavorites });
});

watchFavoritesFilterToggle.addEventListener('click', () => {
  watchFavoritesFilter = !watchFavoritesFilter;
  watchFavoritesFilterToggle.classList.toggle('on', watchFavoritesFilter);
  chrome.storage.local.set({ watchFavoritesFilter });
});

autoLikeFavoritesToggle.addEventListener('click', () => {
  autoLikeFavorites = !autoLikeFavorites;
  autoLikeFavoritesToggle.classList.toggle('on', autoLikeFavorites);
  syncAutoLikeFields();
  chrome.storage.local.set({ autoLikeFavorites });
});

watchFavoritesNoticeInput.addEventListener('input', () => {
  const sec = parseFavNoticeSec(watchFavoritesNoticeInput.value);
  if (sec !== null) chrome.storage.local.set({ watchFavoritesNoticeSec: sec });
});

watchFavoritesNoticeInput.addEventListener('blur', async () => {
  if (parseFavNoticeSec(watchFavoritesNoticeInput.value) !== null) return;
  const stored = await chrome.storage.local.get('watchFavoritesNoticeSec');
  watchFavoritesNoticeInput.value = String(
    parseFavNoticeSec(stored.watchFavoritesNoticeSec) ?? DEFAULT_FAV_NOTICE_SEC
  );
});

autoLikeDelayInput.addEventListener('input', () => {
  const sec = parseDelaySec(autoLikeDelayInput.value);
  if (sec !== null) chrome.storage.local.set({ autoLikeDelaySec: sec });
});

autoLikeDelayInput.addEventListener('blur', async () => {
  if (parseDelaySec(autoLikeDelayInput.value) !== null) return;
  const stored = await chrome.storage.local.get('autoLikeDelaySec');
  autoLikeDelayInput.value = String(parseDelaySec(stored.autoLikeDelaySec) ?? DEFAULT_LIKE_DELAY_SEC);
});

autoNextLiveFallbackToggle.addEventListener('click', () => {
  autoNextLiveFallback = !autoNextLiveFallback;
  autoNextLiveFallbackToggle.classList.toggle('on', autoNextLiveFallback);
  syncNextLiveFields();
  chrome.storage.local.set({ autoNextLiveFallback });
});

autoNextLiveSkipHiddenToggle.addEventListener('click', () => {
  autoNextLiveSkipHidden = !autoNextLiveSkipHidden;
  autoNextLiveSkipHiddenToggle.classList.toggle('on', autoNextLiveSkipHidden);
  chrome.storage.local.set({ autoNextLiveSkipHidden });
});

autoNextLiveFilterToggle.addEventListener('click', () => {
  autoNextLiveFilter = !autoNextLiveFilter;
  autoNextLiveFilterToggle.classList.toggle('on', autoNextLiveFilter);
  chrome.storage.local.set({ autoNextLiveFilter });
});

autoNextLiveLimitViewersToggle.addEventListener('click', () => {
  autoNextLiveLimitViewers = !autoNextLiveLimitViewers;
  autoNextLiveLimitViewersToggle.classList.toggle('on', autoNextLiveLimitViewers);
  syncNextLiveFields();
  chrome.storage.local.set({ autoNextLiveLimitViewers });
});

autoNextLiveMaxViewersInput.addEventListener('input', () => {
  const n = parseMaxViewers(autoNextLiveMaxViewersInput.value);
  if (n !== null) chrome.storage.local.set({ autoNextLiveMaxViewers: n });
});

autoNextLiveMaxViewersInput.addEventListener('blur', async () => {
  if (parseMaxViewers(autoNextLiveMaxViewersInput.value) !== null) return;
  const stored = await chrome.storage.local.get('autoNextLiveMaxViewers');
  autoNextLiveMaxViewersInput.value = String(
    parseMaxViewers(stored.autoNextLiveMaxViewers) ?? DEFAULT_MAX_VIEWERS
  );
});

channelsPageHopToggle.addEventListener('click', () => {
  channelsPageHop = !channelsPageHop;
  channelsPageHopToggle.classList.toggle('on', channelsPageHop);
  syncNextLiveFields();
  chrome.storage.local.set({ channelsPageHop });
});

channelsPageHopDelayInput.addEventListener('input', () => {
  const sec = parseChannelsPageHopDelay(channelsPageHopDelayInput.value);
  if (sec !== null) chrome.storage.local.set({ channelsPageHopDelaySec: sec });
});

channelsPageHopDelayInput.addEventListener('blur', async () => {
  if (parseChannelsPageHopDelay(channelsPageHopDelayInput.value) !== null) return;
  const stored = await chrome.storage.local.get('channelsPageHopDelaySec');
  channelsPageHopDelayInput.value = String(
    parseChannelsPageHopDelay(stored.channelsPageHopDelaySec) ?? DEFAULT_CHANNELS_PAGE_HOP_DELAY_SEC
  );
});

for (const radio of autoNextLiveTargetRadios) {
  radio.addEventListener('change', () => {
    syncNextLiveFields();
    chrome.storage.local.set({ autoNextLiveTarget: selectedNextLiveTarget() });
  });
}

autoNextLiveUrlInput.addEventListener('input', () => {
  chrome.storage.local.set({ autoNextLiveUrl: autoNextLiveUrlInput.value.trim() });
});

allChatToggle.addEventListener('click', () => {
  allChat = !allChat;
  allChatToggle.classList.toggle('on', allChat);
  chrome.storage.local.set({ allChat });
});

hidePinnedToggle.addEventListener('click', () => {
  hidePinned = !hidePinned;
  hidePinnedToggle.classList.toggle('on', hidePinned);
  chrome.storage.local.set({ hidePinned });
});

hidePollsToggle.addEventListener('click', () => {
  hidePolls = !hidePolls;
  hidePollsToggle.classList.toggle('on', hidePolls);
  chrome.storage.local.set({ hidePolls });
});

hideSystemMessagesToggle.addEventListener('click', () => {
  hideSystemMessages = !hideSystemMessages;
  hideSystemMessagesToggle.classList.toggle('on', hideSystemMessages);
  chrome.storage.local.set({ hideSystemMessages });
});

preferHorizontalLiveToggle.addEventListener('click', () => {
  preferHorizontalLive = !preferHorizontalLive;
  preferHorizontalLiveToggle.classList.toggle('on', preferHorizontalLive);
  chrome.storage.local.set({ preferHorizontalLive });
});

tabMuteMarkToggle.addEventListener('click', () => {
  tabMuteMark = !tabMuteMark;
  tabMuteMarkToggle.classList.toggle('on', tabMuteMark);
  syncTabMuteMarkFields();
  chrome.storage.local.set({ tabMuteMark });
});

function syncTabMuteMarkFields() {
  tabMuteMarkPositionSelect.disabled = !tabMuteMark;
  tabMuteMarkPositionRow.classList.toggle('row-disabled', !tabMuteMark);
}

tabMuteMarkPositionSelect.addEventListener('change', () => {
  chrome.storage.local.set({ tabMuteMarkPosition: tabMuteMarkPositionSelect.value });
});

hideThumbnailActionsToggle.addEventListener('click', () => {
  hideThumbnailActions = !hideThumbnailActions;
  hideThumbnailActionsToggle.classList.toggle('on', hideThumbnailActions);
  chrome.storage.local.set({ hideThumbnailActions });
});

sortLiveChannelsToggle.addEventListener('click', () => {
  sortLiveChannels = !sortLiveChannels;
  sortLiveChannelsToggle.classList.toggle('on', sortLiveChannels);
  chrome.storage.local.set({ sortLiveChannels });
});

expandSubscriptionsToggle.addEventListener('click', () => {
  expandSubscriptions = !expandSubscriptions;
  expandSubscriptionsToggle.classList.toggle('on', expandSubscriptions);
  chrome.storage.local.set({ expandSubscriptions });
});

liveChannelDirectLinkToggle.addEventListener('click', () => {
  liveChannelDirectLink = !liveChannelDirectLink;
  liveChannelDirectLinkToggle.classList.toggle('on', liveChannelDirectLink);
  chrome.storage.local.set({ liveChannelDirectLink });
});

translucentGuideToggle.addEventListener('click', () => {
  translucentGuide = !translucentGuide;
  translucentGuideToggle.classList.toggle('on', translucentGuide);
  syncGuideTransparencyFields();
  chrome.storage.local.set({ translucentGuide });
});

guideTransparencyInput.addEventListener('input', () => {
  syncGuideTransparencyFields();
  const value = parseGuideTransparency(guideTransparencyInput.value);
  if (value !== null) chrome.storage.local.set({ guideTransparency: value });
});

autoQualityToggle.addEventListener('click', () => {
  autoQuality = !autoQuality;
  autoQualityToggle.classList.toggle('on', autoQuality);
  syncQualityFields();
  chrome.storage.local.set({ autoQuality });
});

useMaxQualityToggle.addEventListener('click', () => {
  useMaxQuality = !useMaxQuality;
  useMaxQualityToggle.classList.toggle('on', useMaxQuality);
  syncQualityFields();
  chrome.storage.local.set({ useMaxQuality });
});

defaultQualitySelect.addEventListener('change', () => {
  chrome.storage.local.set({ defaultQuality: defaultQualitySelect.value });
});

const BACKUP_APP = 'yt-live-helper';
const DEFAULT_BACKUP_FILE_NAME = 'yt-live-helper-settings.json';
const isTab = new URLSearchParams(location.search).has('tab');
const backupStatus = document.getElementById('backupStatus');
const importFileInput = document.getElementById('importFile');
const exportDirLabel = document.getElementById('exportDir');
const exportFileNameInput = document.getElementById('exportFileName');
const EXPORT_DB = 'ylh-backup';
const EXPORT_STORE = 'handles';
const EXPORT_DIR_KEY = 'exportDir';
const EXPORT_NAME_KEY = 'fileName';
const OLD_EXPORT_FILE_KEY = 'exportFile';
const canPickFolder = typeof window.showDirectoryPicker === 'function';

function showBackupStatus(text, isError = false) {
  backupStatus.textContent = text;
  backupStatus.classList.toggle('error', isError);
}

function exportDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EXPORT_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(EXPORT_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function exportStore(mode, fn) {
  const db = await exportDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(EXPORT_STORE, mode);
      const request = fn(tx.objectStore(EXPORT_STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const loadExport = (key) => exportStore('readonly', (store) => store.get(key)).then((v) => v ?? null, () => null);
const saveExport = (key, value) => exportStore('readwrite', (store) => store.put(value, key));
const loadExportDir = () => loadExport(EXPORT_DIR_KEY);

async function loadExportFileName() {
  return (await loadExport(EXPORT_NAME_KEY)) ?? (await loadExport(OLD_EXPORT_FILE_KEY))?.name ?? DEFAULT_BACKUP_FILE_NAME;
}

function normalizeFileName(input) {
  const name = input.trim();
  if (!name || /[/\\:]/.test(name) || name.startsWith('.')) return null;
  return name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
}

const BAD_FILE_NAME = 'ファイル名に / \\ : は使えません。先頭を . にもできません';

exportFileNameInput.addEventListener('input', async () => {
  const name = normalizeFileName(exportFileNameInput.value);
  if (!name) {
    showBackupStatus(BAD_FILE_NAME, true);
    return;
  }
  showBackupStatus('');
  await saveExport(EXPORT_NAME_KEY, name);
});
exportFileNameInput.addEventListener('change', async () => {
  exportFileNameInput.value = normalizeFileName(exportFileNameInput.value) ?? (await loadExportFileName());
});
exportFileNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) exportFileNameInput.blur();
});

async function showExportTarget() {
  exportFileNameInput.value = await loadExportFileName();
  if (!canPickFolder) {
    exportDirLabel.textContent = 'ダウンロードフォルダ';
    document.getElementById('changeExportTarget').hidden = true;
    return;
  }
  const dir = await loadExportDir();
  exportDirLabel.textContent = dir ? dir.name : '（フォルダは初回に選びます）';
}

async function backupJson() {
  const stored = await chrome.storage.local.get(SETTING_KEYS);
  const settings = {};
  for (const key of SETTING_KEYS) {
    if (Object.hasOwn(stored, key)) settings[key] = stored[key];
  }
  const backup = { app: BACKUP_APP, version: chrome.runtime.getManifest().version, settings };
  return { text: `${JSON.stringify(backup, null, 2)}\n`, count: Object.keys(settings).length };
}

function downloadBackup(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function writeBackup(dir, name, text) {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}

const BACKUP_TAB_MESSAGES = {
  pick: '「書き出す」を押して、書き出し先のフォルダを選んでください',
  permission: '「書き出す」を押すと、書き出し先のフォルダへの書き込みの許可を確認します',
  change: '「フォルダを変更」を押して、書き出し先のフォルダを選んでください',
};

function openBackupTab(kind) {
  chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?tab&backup=${kind}`) });
  window.close();
}

async function pickExportDir(current) {
  try {
    const dir = await window.showDirectoryPicker({
      id: 'ylh-backup',
      mode: 'readwrite',
      ...(current ? { startIn: current } : {}),
    });
    await saveExport(EXPORT_DIR_KEY, dir);
    return dir;
  } catch (e) {
    if (e && e.name === 'AbortError') return null;
    throw e;
  }
}

async function exportSettings({ chooseDir = false } = {}) {
  const name = normalizeFileName(exportFileNameInput.value);
  if (!name) {
    showBackupStatus(BAD_FILE_NAME, true);
    return;
  }
  exportFileNameInput.value = name;
  await saveExport(EXPORT_NAME_KEY, name);
  const { text, count } = await backupJson();
  if (!canPickFolder) {
    downloadBackup(text, name);
    showBackupStatus(`書き出しました（${count}項目）`);
    return;
  }
  let dir = chooseDir ? null : await loadExportDir();
  let granted = dir && (await dir.queryPermission({ mode: 'readwrite' })) === 'granted';
  if (!granted && dir && !isTab) {
    granted = (await dir.requestPermission({ mode: 'readwrite' }).catch(() => 'prompt')) === 'granted';
  }
  if (!granted) {
    if (!isTab) {
      openBackupTab(chooseDir ? 'change' : dir ? 'permission' : 'pick');
      return;
    }
    if (dir) granted = (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
    if (!granted) {
      dir = await pickExportDir(dir || (await loadExportDir()));
      if (!dir) {
        showBackupStatus('書き出しをやめました');
        return;
      }
    }
  }
  try {
    await writeBackup(dir, name, text);
  } catch (e) {
    showBackupStatus('書き出せませんでした。「フォルダを変更」から書き出し先を選び直してください', true);
    return;
  }
  await showExportTarget();
  showBackupStatus(`${dir.name}/${name} に書き出しました（${count}項目）`);
}

document.getElementById('exportSettings').addEventListener('click', () => {
  exportSettings().catch(() => showBackupStatus('書き出せませんでした', true));
});

document.getElementById('changeExportTarget').addEventListener('click', () => {
  exportSettings({ chooseDir: true }).catch(() => showBackupStatus('書き出せませんでした', true));
});

document.getElementById('importSettings').addEventListener('click', () => {
  if (isTab) {
    importFileInput.click();
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?tab') });
    window.close();
  }
});

importFileInput.addEventListener('change', async () => {
  const file = importFileInput.files[0];
  importFileInput.value = '';
  if (!file) return;
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (e) {
    showBackupStatus('JSONとして読めないファイルです', true);
    return;
  }
  const settings = backup && backup.app === BACKUP_APP ? backup.settings : null;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    showBackupStatus('このアプリの設定ファイルではありません', true);
    return;
  }
  const next = {};
  for (const key of SETTING_KEYS) {
    if (Object.hasOwn(settings, key)) next[key] = settings[key];
  }
  await chrome.storage.local.remove(SETTING_KEYS.filter((key) => !Object.hasOwn(next, key)));
  await chrome.storage.local.set(next);
  sessionStorage.setItem('ylh:import-done', String(Object.keys(next).length));
  location.reload();
});

if (isTab) document.body.classList.add('tab');

showExportTarget();

init().then(() => {
  const backupMessage = BACKUP_TAB_MESSAGES[new URLSearchParams(location.search).get('backup')];
  if (isTab && backupMessage) showBackupStatus(backupMessage);
  const imported = sessionStorage.getItem('ylh:import-done');
  if (imported !== null) {
    sessionStorage.removeItem('ylh:import-done');
    showBackupStatus(`読み込みました（${imported}項目）`);
  }
});
