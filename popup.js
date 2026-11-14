// popup.js
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
const watchFavoritesToggle = document.getElementById('watchFavoritesToggle');
const watchFavoritesFilterToggle = document.getElementById('watchFavoritesFilterToggle');
const watchFavoritesFilterRow = document.getElementById('watchFavoritesFilterRow');
const watchFavoritesFilterNote = document.getElementById('watchFavoritesFilterNote');
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
const preferHorizontalLiveToggle = document.getElementById('preferHorizontalLiveToggle');
const hideThumbnailActionsToggle = document.getElementById('hideThumbnailActionsToggle');
const sortLiveChannelsToggle = document.getElementById('sortLiveChannelsToggle');
const expandSubscriptionsToggle = document.getElementById('expandSubscriptionsToggle');
const liveChannelDirectLinkToggle = document.getElementById('liveChannelDirectLinkToggle');
const guideWindowButtonToggle = document.getElementById('guideWindowButtonToggle');
const guideWindowLiveInfoToggle = document.getElementById('guideWindowLiveInfoToggle');
const translucentGuideToggle = document.getElementById('translucentGuideToggle');
const guideTransparencyFields = document.getElementById('guideTransparencyFields');
const guideTransparencyInput = document.getElementById('guideTransparency');
const guideTransparencyValue = document.getElementById('guideTransparencyValue');
const autoQualityToggle = document.getElementById('autoQualityToggle');
const useMaxQualityToggle = document.getElementById('useMaxQualityToggle');
const defaultQualitySelect = document.getElementById('defaultQuality');
const qualityFields = document.getElementById('qualityFields');
const appVersion = document.getElementById('appVersion');

// ヘッダー右端に manifest のバージョンを表示する（手動更新が不要になるよう実行時に取得）
appVersion.textContent = `v${chrome.runtime.getManifest().version}`;

let jumpToLive = true;
// 自動で別の配信へ移動する機能なので、これだけは既定OFF（明示的に有効にしてもらう）
let autoNextLive = false;
// ラジオは checked を明示しないと何も選ばれないので、既定値を必ず入れる（select と同じ罠）
const DEFAULT_NEXT_LIVE_TARGET = 'subscriptions';
// 選んだ移動先にライブが無いとき、もう一方の移動先も探すかどうか。行き先が増えるので既定OFF
let autoNextLiveFallback = false;
// 非表示の配信を除外するかどうか。移動先が「指定したページ」のときだけ意味を持つ
let autoNextLiveSkipHidden = true;
// 視聴者数の上限で絞り込むかどうか。これも「指定したページ」のときだけ。行き先が減るので既定OFF
let autoNextLiveLimitViewers = false;
// 視聴者数の上限（guide.js と同じ値）
const DEFAULT_MAX_VIEWERS = 100;
const MIN_MAX_VIEWERS = 1;
const MAX_MAX_VIEWERS = 10000000;
// 登録チャンネルから探すとき、絞り込み条件に合う配信だけにするかどうか。行き先が減るので既定OFF
let autoNextLiveFilter = false;
// 絞り込み条件。[{name, url, keywords, enabled}]。編集はオプション画面（options.js）、ここはON/OFFだけ
let liveFilters = [];
// 自動で移動する機能なので既定OFF（autoNextLive と同じ扱い）
let watchFavorites = false;
// お気に入りの自動移動を、絞り込み条件に合う配信だけにするかどうか。移動先が減るので既定OFF
let watchFavoritesFilter = false;
// 自分のアカウントで高評価を押す機能なので既定OFF
let autoLikeFavorites = false;
// 配信を開いてから押すまでの秒数（auto-like.js と同じ値）
const DEFAULT_LIKE_DELAY_SEC = 120;
const MIN_LIKE_DELAY_SEC = 10;
const MAX_LIKE_DELAY_SEC = 3600;
// お気に入りチャンネル。配列の並びがそのまま優先順位（上が優先）
let favoriteChannels = [];
let allChat = true;
let hidePinned = true;
let hidePolls = true;
let preferHorizontalLive = true;
let hideThumbnailActions = true;
let sortLiveChannels = true;
let expandSubscriptions = true;
let liveChannelDirectLink = true;
let guideWindowButton = true;
let guideWindowLiveInfo = true;
let translucentGuide = true;
// サイドバーの透過率(%)。guide.js と同じ値
const DEFAULT_GUIDE_TRANSPARENCY = 45;
const MIN_GUIDE_TRANSPARENCY = 0;
const MAX_GUIDE_TRANSPARENCY = 100;
let autoQuality = true;
let useMaxQuality = false;
// select は先頭optionが初期選択になるため、未保存時は明示的に既定値へ戻す必要がある
const DEFAULT_QUALITY = 'hd1080';

// ポップアップで扱う設定のキー。設定の書き出し・読み込みもこの一覧が対象
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
  'watchFavorites',
  'watchFavoritesFilter',
  'autoLikeFavorites',
  'autoLikeDelaySec',
  'favoriteChannels',
  'allChat',
  'hidePinned',
  'hidePolls',
  'preferHorizontalLive',
  'hideThumbnailActions',
  'sortLiveChannels',
  'expandSubscriptions',
  'liveChannelDirectLink',
  'guideWindowButton',
  'guideWindowLiveInfo',
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
  if (typeof stored.autoNextLiveFilter === 'boolean') {
    autoNextLiveFilter = stored.autoNextLiveFilter;
  }
  liveFilters = readLiveFilters(stored.liveFilters);
  if (typeof stored.preferHorizontalLive === 'boolean') {
    preferHorizontalLive = stored.preferHorizontalLive;
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
  autoLikeDelayInput.value = String(parseDelaySec(stored.autoLikeDelaySec) ?? DEFAULT_LIKE_DELAY_SEC);
  jumpToLiveToggle.classList.toggle('on', jumpToLive);
  autoNextLiveToggle.classList.toggle('on', autoNextLive);
  autoNextLiveFallbackToggle.classList.toggle('on', autoNextLiveFallback);
  autoNextLiveSkipHiddenToggle.classList.toggle('on', autoNextLiveSkipHidden);
  autoNextLiveLimitViewersToggle.classList.toggle('on', autoNextLiveLimitViewers);
  autoNextLiveFilterToggle.classList.toggle('on', autoNextLiveFilter);
  renderLiveFilters();
  watchFavoritesToggle.classList.toggle('on', watchFavorites);
  watchFavoritesFilterToggle.classList.toggle('on', watchFavoritesFilter);
  syncWatchFavoritesFields();
  autoLikeFavoritesToggle.classList.toggle('on', autoLikeFavorites);
  allChatToggle.classList.toggle('on', allChat);
  hidePinnedToggle.classList.toggle('on', hidePinned);
  hidePollsToggle.classList.toggle('on', hidePolls);
  preferHorizontalLiveToggle.classList.toggle('on', preferHorizontalLive);
  hideThumbnailActionsToggle.classList.toggle('on', hideThumbnailActions);
  sortLiveChannelsToggle.classList.toggle('on', sortLiveChannels);
  expandSubscriptionsToggle.classList.toggle('on', expandSubscriptions);
  liveChannelDirectLinkToggle.classList.toggle('on', liveChannelDirectLink);
  guideWindowButtonToggle.classList.toggle('on', guideWindowButton);
  guideWindowLiveInfoToggle.classList.toggle('on', guideWindowLiveInfo);
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

// お気に入りの一覧。登録はサイドバーの★から行うので、ここでは並べ替えと削除だけ。
// 監視が OFF でも編集できる（先に登録してから ON にする流れを塞がないため）
function renderFavorites() {
  favoriteEmpty.hidden = favoriteChannels.length > 0;
  // 1件だけなら並べ替えようがないので、案内は2件以上のときだけ出す
  favoriteHint.hidden = favoriteChannels.length < 2;
  favoriteList.textContent = '';
  favoriteChannels.forEach((favorite, index) => {
    const row = document.createElement('div');
    row.className = 'fav-row';
    // 並べ替え後はDOMの並びから保存する。path がその行の識別子
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

// つかむ場所を手前のハンドルだけに限る（行全体を draggable にすると、
// × ボタンやチャンネル名のテキスト選択がドラッグに食われる）
function makeHandle() {
  const handle = document.createElement('span');
  handle.className = 'fav-handle';
  handle.textContent = '⠿';
  handle.title = 'ドラッグして並べ替え';
  handle.setAttribute('draggable', 'true');
  return handle;
}

// 縦の中心がカーソルのすぐ下にある行＝ドラッグ中の行を手前に差し込むべき行。null なら末尾へ。
// ドラッグ中の行も候補に含める（自分の上に戻したときに、線が自分の上下どちらかの端に出るように）
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

// ドロップしたときに入る位置を示す線。一覧の中に絶対配置で重ねる。
// renderFavorites() が一覧を空にするので、ドラッグのたびに差し込み直す
const dropLine = document.createElement('div');
dropLine.className = 'fav-drop-line';

// after の手前（null なら末尾）に線を引く
function showDropLine(after) {
  const rows = [...favoriteList.querySelectorAll('.fav-row')];
  if (rows.length === 0) return;
  const last = rows[rows.length - 1];
  const y = after ? after.offsetTop : last.offsetTop + last.offsetHeight;
  dropLine.style.top = `${y}px`;
  if (!dropLine.isConnected) favoriteList.appendChild(dropLine);
}

// ドラッグ中にカーソルをポップアップの上端・下端へ寄せたときの自動スクロール。
// ブラウザ任せだと端のごく狭い範囲でしか動かず遅いので、自前で広めの帯と速さを持つ。
// 帯の奥（端）へ寄せるほど速くなる
const AUTO_SCROLL_ZONE = 64; // px。端からこの距離に入ったらスクロールし始める
const AUTO_SCROLL_MAX_SPEED = 18; // px / フレーム。いちばん端に寄せたときの速さ

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

// 並べ替えの配線。リスナーは行ではなく一覧側に付けるので、
// renderFavorites() が中身を作り直しても張り直す必要がない。
// ドラッグ中は行を動かさず、入る位置を線で示すだけにして、ドロップで初めて並びを変える
function enableFavoriteDnd() {
  let dragging = null;
  // 線の位置＝この行の手前に入る。null なら末尾
  let dropBefore = null;
  let dropped = false;
  // 自動スクロール用。カーソルの位置は一覧の外（見出しの上など）にいるときも拾う
  let pointerY = null;
  let lastDragoverAt = 0;
  let scrollFrame = 0;

  function autoScrollStep() {
    scrollFrame = 0;
    if (!dragging) return;
    // dragover は止まっていても数十ms おきに来る。来なくなった＝ポップアップの外に出たので止める
    if (pointerY != null && performance.now() - lastDragoverAt < 200) {
      const speed = autoScrollSpeed(pointerY);
      const scroller = document.scrollingElement;
      const before = scroller.scrollTop;
      if (speed !== 0) scroller.scrollTop += speed;
      // 行がカーソルの下を流れていくので、線も追いかけて引き直す
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
    // チャンネル名を選択してドラッグしたときは target がテキストノードになる（実測）。
    // その場合は掴んでいないので、ブラウザ既定のテキストのドラッグに任せて何もしない
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
    // 既定のドラッグ画像はつかんだハンドルだけになるので、行全体を運んでいるように見せる
    event.dataTransfer.setDragImage(dragging, 12, dragging.offsetHeight / 2);
  });

  favoriteList.addEventListener('dragover', (event) => {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dropBefore = rowAfterPointer(event.clientY);
    showDropLine(dropBefore);
  });

  // 一覧の外へ出たら線を消す（そこで離しても並びは変わらないので）。
  // 子要素をまたぐたびにも dragleave が来るので、行き先が一覧の中なら無視する
  favoriteList.addEventListener('dragleave', (event) => {
    if (!dragging || favoriteList.contains(event.relatedTarget)) return;
    dropLine.remove();
  });

  favoriteList.addEventListener('drop', (event) => {
    if (!dragging) return;
    event.preventDefault();
    dropped = true;
  });

  // 後片付けと保存はここ1か所。一覧の外で離した・Esc で取り消したときは drop が来ないので並びを変えない
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
      // 取りこぼしたら並びを触らず、保存済みの状態で描き直す
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

// 指定したページを探すとき(移動先がURL指定か、「もう一方も探す」がON)だけ入力欄と
// 「非表示の配信を除外」「視聴者数で絞り込む」を使う。親トグルがOFFなら移動先の設定ごと無効化する
function syncNextLiveFields() {
  const pageMode = selectedNextLiveTarget() === 'page' || autoNextLiveFallback;
  autoNextLiveFields.classList.toggle('disabled', !autoNextLive);
  autoNextLiveUrlInput.disabled = !autoNextLive || !pageMode;
  autoNextLiveSkipHiddenRow.classList.toggle('row-disabled', !pageMode);
  autoNextLiveSkipHiddenNote.classList.toggle('row-disabled', !pageMode);
  autoNextLiveLimitViewersRow.classList.toggle('row-disabled', !pageMode);
  // 上限の人数は絞り込みがONのときだけ意味を持つ
  const limitOn = pageMode && autoNextLiveLimitViewers;
  autoNextLiveMaxViewersInput.disabled = !autoNextLive || !limitOn;
  autoNextLiveMaxViewersRow.classList.toggle('row-disabled', !limitOn);
  autoNextLiveMaxViewersNote.classList.toggle('row-disabled', !limitOn);
  // 「条件に合う配信だけ」は登録チャンネルを探すとき(移動先がそれか、「もう一方も探す」がON)だけ
  const subscriptionsMode = selectedNextLiveTarget() === 'subscriptions' || autoNextLiveFallback;
  autoNextLiveFilterRow.classList.toggle('row-disabled', !subscriptionsMode);
  autoNextLiveFilterNote.classList.toggle('row-disabled', !subscriptionsMode);
}

function readLiveFilters(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((filter) => filter && typeof filter === 'object');
}

// 絞り込み条件の一覧。ここでは名前とON/OFFだけを扱い、中身の編集はオプション画面で行う
// （キーワードが増えるとポップアップでは窮屈なため）。
// 「条件に合う配信だけ」が OFF でも切り替えられる（先に選んでから ON にする流れを塞がないため）
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

// 登録チャンネル一覧を別ウィンドウで開くボタン(YouTube のハンバーガーの右に出す。guide-window.js)
guideWindowButtonToggle.addEventListener('click', () => {
  guideWindowButton = !guideWindowButton;
  guideWindowButtonToggle.classList.toggle('on', guideWindowButton);
  chrome.storage.local.set({ guideWindowButton });
});

// 別ウィンドウの一覧のライブ中の行に、配信の情報を出す(guide-window.js)
guideWindowLiveInfoToggle.addEventListener('click', () => {
  guideWindowLiveInfo = !guideWindowLiveInfo;
  guideWindowLiveInfoToggle.classList.toggle('on', guideWindowLiveInfo);
  chrome.storage.local.set({ guideWindowLiveInfo });
});

// オプション画面で条件を編集したら、開いているポップアップにも反映する
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

// 範囲内の整数だけを有効とし、それ以外は null（保存しない）
function parseMaxViewers(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(n) && n >= MIN_MAX_VIEWERS && n <= MAX_MAX_VIEWERS ? n : null;
}

// 範囲内の整数秒だけを有効とし、それ以外は null（保存しない）
function parseGuideTransparency(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(n) && n >= MIN_GUIDE_TRANSPARENCY && n <= MAX_GUIDE_TRANSPARENCY ? n : null;
}

// 透過率は透過が OFF なら使われないので無効化する
function syncGuideTransparencyFields() {
  guideTransparencyFields.classList.toggle('disabled', !translucentGuide);
  guideTransparencyValue.textContent = `${guideTransparencyInput.value}%`;
}

function parseDelaySec(value) {
  const sec = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(sec) && sec >= MIN_LIKE_DELAY_SEC && sec <= MAX_LIKE_DELAY_SEC ? sec : null;
}

// 秒数は自動いいねがOFFなら使われないので無効化する
// 「条件に合う配信だけ」は「配信が始まったら移動」がONのときだけ意味を持つ
function syncWatchFavoritesFields() {
  watchFavoritesFilterRow.classList.toggle('row-disabled', !watchFavorites);
  watchFavoritesFilterNote.classList.toggle('row-disabled', !watchFavorites);
}

function syncAutoLikeFields() {
  autoLikeDelayInput.disabled = !autoLikeFavorites;
  autoLikeDelayRow.classList.toggle('row-disabled', !autoLikeFavorites);
  autoLikeDelayNote.classList.toggle('row-disabled', !autoLikeFavorites);
}

// 「常に最高画質」がONのときデフォルト画質は使われない。親トグルがOFFなら画質設定ごと無効化する
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

// ショートカットはユーザーが chrome://extensions/shortcuts で変えられるので、実際の割り当てを表示する
// （既定のキーが他の拡張機能と衝突すると、割り当てられずに空になる）
chrome.commands.getAll((commands) => {
  const command = commands.find((c) => c.name === 'toggle-watch-favorites');
  if (command && command.shortcut) {
    document.getElementById('watchFavoritesShortcut').textContent = command.shortcut;
  }
});

// chrome:// のページは普通のリンクでは開けないので tabs.create で開く（tabs 権限は不要）
document.getElementById('openShortcutSettings').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// ショートカットで切り替えられたとき、開いているポップアップの表示も追従させる
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

// URL欄と同じく、閉じたときに取りこぼさないよう入力のたびに保存する（範囲外・入力途中は保存しない）
autoLikeDelayInput.addEventListener('input', () => {
  const sec = parseDelaySec(autoLikeDelayInput.value);
  if (sec !== null) chrome.storage.local.set({ autoLikeDelaySec: sec });
});

// 空欄や範囲外のまま離れたら、保存されている値に表示を戻す
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

// 秒数欄と同じく、入力のたびに保存する（範囲外・入力途中は保存しない）
autoNextLiveMaxViewersInput.addEventListener('input', () => {
  const n = parseMaxViewers(autoNextLiveMaxViewersInput.value);
  if (n !== null) chrome.storage.local.set({ autoNextLiveMaxViewers: n });
});

// 空欄や範囲外のまま離れたら、保存されている値に表示を戻す
autoNextLiveMaxViewersInput.addEventListener('blur', async () => {
  if (parseMaxViewers(autoNextLiveMaxViewersInput.value) !== null) return;
  const stored = await chrome.storage.local.get('autoNextLiveMaxViewers');
  autoNextLiveMaxViewersInput.value = String(
    parseMaxViewers(stored.autoNextLiveMaxViewers) ?? DEFAULT_MAX_VIEWERS
  );
});

for (const radio of autoNextLiveTargetRadios) {
  radio.addEventListener('change', () => {
    syncNextLiveFields();
    chrome.storage.local.set({ autoNextLiveTarget: selectedNextLiveTarget() });
  });
}

// change だとポップアップを閉じたときに取りこぼすので、入力のたびに保存する
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

preferHorizontalLiveToggle.addEventListener('click', () => {
  preferHorizontalLive = !preferHorizontalLive;
  preferHorizontalLiveToggle.classList.toggle('on', preferHorizontalLive);
  chrome.storage.local.set({ preferHorizontalLive });
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

// つまみを動かしている間も、開いている動画ページにそのまま反映する
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

// ===== 設定の書き出し・読み込み =====
// 書き出しはポップアップからそのままダウンロードできるが、読み込みのファイル選択を
// ツールバーのポップアップで開くとポップアップごと閉じて、選んだファイルを受け取れない。
// そのため読み込みはポップアップを別タブ(popup.html?tab)で開き直してから行う
const BACKUP_APP = 'yt-live-helper';
const isTab = new URLSearchParams(location.search).has('tab');
const backupStatus = document.getElementById('backupStatus');
const importFileInput = document.getElementById('importFile');

function showBackupStatus(text, isError = false) {
  backupStatus.textContent = text;
  backupStatus.classList.toggle('error', isError);
}

function backupFileName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `yt-live-helper-settings-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
}

document.getElementById('exportSettings').addEventListener('click', async () => {
  // 一度も変えていない設定は保存されていない(既定値で動く)ので、ファイルにも入れない
  const settings = await chrome.storage.local.get(SETTING_KEYS);
  const backup = {
    app: BACKUP_APP,
    version: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    settings,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName();
  a.click();
  // すぐに破棄するとダウンロードが始まる前に URL が消えることがあるので少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showBackupStatus(`書き出しました（${Object.keys(settings).length}項目）`);
});

document.getElementById('importSettings').addEventListener('click', () => {
  if (isTab) {
    importFileInput.click();
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?tab') });
    window.close();
  }
});

// ファイルにある設定で置き換える。ファイルに無い設定は保存を消して既定値に戻す
// (書き出した時点で既定値のままだった設定は、ファイルに入っていないため)
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
  // 知らないキーは捨てる。値の形は各スクリプトが読み込むときに確かめ、おかしければ既定値で動く
  const next = {};
  for (const key of SETTING_KEYS) {
    if (Object.hasOwn(settings, key)) next[key] = settings[key];
  }
  await chrome.storage.local.remove(SETTING_KEYS.filter((key) => !Object.hasOwn(next, key)));
  await chrome.storage.local.set(next);
  sessionStorage.setItem('ylh:import-done', String(Object.keys(next).length));
  // 画面の各項目を読み込んだ設定で作り直す
  location.reload();
});

if (isTab) document.body.classList.add('tab');

init().then(() => {
  const imported = sessionStorage.getItem('ylh:import-done');
  if (imported !== null) {
    sessionStorage.removeItem('ylh:import-done');
    showBackupStatus(`読み込みました（${imported}項目）`);
  }
});
