// popup.js
const jumpToLiveToggle = document.getElementById('jumpToLiveToggle');
const autoNextLiveToggle = document.getElementById('autoNextLiveToggle');
const autoNextLiveFields = document.getElementById('autoNextLiveFields');
const autoNextLiveTargetRadios = document.querySelectorAll('input[name="autoNextLiveTarget"]');
const autoNextLiveUrlInput = document.getElementById('autoNextLiveUrl');
const autoNextLiveSkipHiddenToggle = document.getElementById('autoNextLiveSkipHiddenToggle');
const autoNextLiveSkipHiddenRow = document.getElementById('autoNextLiveSkipHiddenRow');
const autoNextLiveSkipHiddenNote = document.getElementById('autoNextLiveSkipHiddenNote');
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
