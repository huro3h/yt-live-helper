// background.js — 「配信が始まったら移動」(watchFavorites) のショートカット切り替えとバッジ表示
//   よく切り替える設定なので、ポップアップを開かずにキーボードで ON/OFF できるようにし、
//   ツールバーのアイコンに ★ のバッジ(ON = 赤 / OFF = グレー)で状態を出す。
//   監視そのものは fav-watch.js が storage.onChanged で拾うので、ここは storage を書くだけ。
const ON_COLOR = '#ff3d6b'; // ポップアップのトグル(--accent)と同じ赤
const OFF_COLOR = '#6b6b8a'; // ポップアップの --text-muted と同じグレー

function showBadge(on) {
  chrome.action.setBadgeText({ text: '★' });
  chrome.action.setBadgeBackgroundColor({ color: on ? ON_COLOR : OFF_COLOR });
  chrome.action.setBadgeTextColor({ color: '#ffffff' });
  chrome.action.setTitle({
    title: `YouTube Live Helper（配信が始まったら移動: ${on ? 'ON' : 'OFF'}）`,
  });
}

// 既定 OFF(fav-watch.js / popup.js と同じ)
async function refreshBadge() {
  const { watchFavorites } = await chrome.storage.local.get('watchFavorites');
  showBadge(watchFavorites === true);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-watch-favorites') return;
  const { watchFavorites } = await chrome.storage.local.get('watchFavorites');
  // バッジは下の onChanged で更新される(ポップアップから切り替えたときと同じ経路)
  await chrome.storage.local.set({ watchFavorites: watchFavorites !== true });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.watchFavorites) {
    showBadge(changes.watchFavorites.newValue === true);
  }
});

// バッジはブラウザの再起動で消えるので、起動時とインストール/更新時に描き直す
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);
