// popup.js
const jumpToLiveToggle = document.getElementById('jumpToLiveToggle');
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
  jumpToLiveToggle.classList.toggle('on', jumpToLive);
  allChatToggle.classList.toggle('on', allChat);
  hidePinnedToggle.classList.toggle('on', hidePinned);
  hidePollsToggle.classList.toggle('on', hidePolls);
  sortLiveChannelsToggle.classList.toggle('on', sortLiveChannels);
  expandSubscriptionsToggle.classList.toggle('on', expandSubscriptions);
  liveChannelDirectLinkToggle.classList.toggle('on', liveChannelDirectLink);
  autoQualityToggle.classList.toggle('on', autoQuality);
  useMaxQualityToggle.classList.toggle('on', useMaxQuality);
  syncQualityFields();
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
