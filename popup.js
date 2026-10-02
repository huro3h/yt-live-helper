// popup.js
const jumpToLiveToggle = document.getElementById('jumpToLiveToggle');
const autoNextLiveToggle = document.getElementById('autoNextLiveToggle');
const autoNextLiveFields = document.getElementById('autoNextLiveFields');
const autoNextLiveTargetRadios = document.querySelectorAll('input[name="autoNextLiveTarget"]');
const autoNextLiveUrlInput = document.getElementById('autoNextLiveUrl');
const autoNextLiveSkipHiddenToggle = document.getElementById('autoNextLiveSkipHiddenToggle');
const autoNextLiveSkipHiddenRow = document.getElementById('autoNextLiveSkipHiddenRow');
const autoNextLiveSkipHiddenNote = document.getElementById('autoNextLiveSkipHiddenNote');
const watchFavoritesToggle = document.getElementById('watchFavoritesToggle');
const favoriteList = document.getElementById('favoriteList');
const favoriteEmpty = document.getElementById('favoriteEmpty');
const favoriteHint = document.getElementById('favoriteHint');
const allChatToggle = document.getElementById('allChatToggle');
const hidePinnedToggle = document.getElementById('hidePinnedToggle');
const hidePollsToggle = document.getElementById('hidePollsToggle');
const sortLiveChannelsToggle = document.getElementById('sortLiveChannelsToggle');
const expandSubscriptionsToggle = document.getElementById('expandSubscriptionsToggle');
const liveChannelDirectLinkToggle = document.getElementById('liveChannelDirectLinkToggle');
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
// 非表示の配信を除外するかどうか。移動先が「指定したページ」のときだけ意味を持つ
let autoNextLiveSkipHidden = true;
// 自動で移動する機能なので既定OFF（autoNextLive と同じ扱い）
let watchFavorites = false;
// お気に入りチャンネル。配列の並びがそのまま優先順位（上が優先）
let favoriteChannels = [];
let allChat = true;
let hidePinned = true;
let hidePolls = true;
let sortLiveChannels = true;
let expandSubscriptions = true;
let liveChannelDirectLink = true;
let autoQuality = true;
let useMaxQuality = false;
// select は先頭optionが初期選択になるため、未保存時は明示的に既定値へ戻す必要がある
const DEFAULT_QUALITY = 'hd1080';

async function init() {
  const stored = await chrome.storage.local.get([
    'jumpToLive',
    'autoNextLive',
    'autoNextLiveTarget',
    'autoNextLiveUrl',
    'autoNextLiveSkipHidden',
    'watchFavorites',
    'favoriteChannels',
    'allChat',
    'hidePinned',
    'hidePolls',
    'sortLiveChannels',
    'expandSubscriptions',
    'liveChannelDirectLink',
    'autoQuality',
    'useMaxQuality',
    'defaultQuality',
  ]);
  if (typeof stored.jumpToLive === 'boolean') {
    jumpToLive = stored.jumpToLive;
  }
  if (typeof stored.autoNextLive === 'boolean') {
    autoNextLive = stored.autoNextLive;
  }
  if (typeof stored.autoNextLiveSkipHidden === 'boolean') {
    autoNextLiveSkipHidden = stored.autoNextLiveSkipHidden;
  }
  if (typeof stored.watchFavorites === 'boolean') {
    watchFavorites = stored.watchFavorites;
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
  if (typeof stored.sortLiveChannels === 'boolean') {
    sortLiveChannels = stored.sortLiveChannels;
  }
  if (typeof stored.expandSubscriptions === 'boolean') {
    expandSubscriptions = stored.expandSubscriptions;
  }
  if (typeof stored.liveChannelDirectLink === 'boolean') {
    liveChannelDirectLink = stored.liveChannelDirectLink;
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
  jumpToLiveToggle.classList.toggle('on', jumpToLive);
  autoNextLiveToggle.classList.toggle('on', autoNextLive);
  autoNextLiveSkipHiddenToggle.classList.toggle('on', autoNextLiveSkipHidden);
  watchFavoritesToggle.classList.toggle('on', watchFavorites);
  allChatToggle.classList.toggle('on', allChat);
  hidePinnedToggle.classList.toggle('on', hidePinned);
  hidePollsToggle.classList.toggle('on', hidePolls);
  sortLiveChannelsToggle.classList.toggle('on', sortLiveChannels);
  expandSubscriptionsToggle.classList.toggle('on', expandSubscriptions);
  liveChannelDirectLinkToggle.classList.toggle('on', liveChannelDirectLink);
  autoQualityToggle.classList.toggle('on', autoQuality);
  useMaxQualityToggle.classList.toggle('on', useMaxQuality);
  syncQualityFields();
  syncNextLiveFields();
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

// ドラッグ中の行を除いて、縦の中心がカーソルのすぐ下にある行
// ＝ ドラッグ中の行を手前に差し込むべき行。null なら末尾へ
function rowAfterPointer(y) {
  const rows = [...favoriteList.querySelectorAll('.fav-row:not(.dragging)')];
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

// 並べ替えの配線。リスナーは行ではなく一覧側に付けるので、
// renderFavorites() が中身を作り直しても張り直す必要がない
function enableFavoriteDnd() {
  let dragging = null;

  favoriteList.addEventListener('dragstart', (event) => {
    // チャンネル名を選択してドラッグしたときは target がテキストノードになる（実測）。
    // その場合は掴んでいないので、ブラウザ既定のテキストのドラッグに任せて何もしない
    const from = event.target instanceof Element ? event.target : event.target.parentElement;
    const handle = from && from.closest('.fav-handle');
    if (!handle) return;
    dragging = handle.closest('.fav-row');
    if (!dragging) return;
    dragging.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragging.dataset.path || '');
    // 既定のドラッグ画像はつかんだハンドルだけになるので、行全体を運んでいるように見せる
    event.dataTransfer.setDragImage(dragging, 12, dragging.offsetHeight / 2);
  });

  favoriteList.addEventListener('dragover', (event) => {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const after = rowAfterPointer(event.clientY);
    if (after == null) {
      favoriteList.appendChild(dragging);
    } else if (after !== dragging) {
      favoriteList.insertBefore(dragging, after);
    }
  });

  favoriteList.addEventListener('drop', (event) => {
    if (dragging) event.preventDefault();
  });

  // 並びの確定はここ1か所。drop ではなく dragend で保存するのは、行がカーソルの下で
  // 入れ替わり続けるせいで drop が来ないことがある（実測）ため。dragend は必ず来る
  favoriteList.addEventListener('dragend', () => {
    if (!dragging) return;
    dragging.classList.remove('dragging');
    dragging = null;
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

// 移動先がURL指定のときだけ入力欄と「非表示の配信を除外」を使う。
// 親トグルがOFFなら移動先の設定ごと無効化する
function syncNextLiveFields() {
  const pageMode = selectedNextLiveTarget() === 'page';
  autoNextLiveFields.classList.toggle('disabled', !autoNextLive);
  autoNextLiveUrlInput.disabled = !autoNextLive || !pageMode;
  autoNextLiveSkipHiddenRow.classList.toggle('row-disabled', !pageMode);
  autoNextLiveSkipHiddenNote.classList.toggle('row-disabled', !pageMode);
}

function selectedNextLiveTarget() {
  for (const radio of autoNextLiveTargetRadios) {
    if (radio.checked) return radio.value;
  }
  return DEFAULT_NEXT_LIVE_TARGET;
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
});

watchFavoritesToggle.addEventListener('click', () => {
  watchFavorites = !watchFavorites;
  watchFavoritesToggle.classList.toggle('on', watchFavorites);
  chrome.storage.local.set({ watchFavorites });
});

autoNextLiveSkipHiddenToggle.addEventListener('click', () => {
  autoNextLiveSkipHidden = !autoNextLiveSkipHidden;
  autoNextLiveSkipHiddenToggle.classList.toggle('on', autoNextLiveSkipHidden);
  chrome.storage.local.set({ autoNextLiveSkipHidden });
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

init();
