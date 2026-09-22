// live-bridge.js — ライブヘッドへのシーク / ISOLATED world 側（watch・liveページのみ）
// chrome.storage に触れるのは ISOLATED world だけ、プレーヤーの非公開メソッド
// （getProgressState / seekToLiveHead）を呼べるのは MAIN world だけ。両者は document を
// 共有するので、設定を CustomEvent で live-inject.js へ橋渡しする（quality-bridge.js と同じ構成）。

(function () {
  'use strict';

  // autoNextLive だけ既定 OFF。自動で別の配信へ移動する機能なので、明示的に有効にしてもらう
  const DEFAULTS = { jumpToLive: true, autoNextLive: false };

  function sendSettings() {
    chrome.storage.local.get(DEFAULTS, (settings) => {
      document.dispatchEvent(new CustomEvent('ylh:live-settings', { detail: settings }));
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.jumpToLive || changes.autoNextLive) sendSettings();
  });

  // live-inject.js の初期化が先行して初回配信を取りこぼした場合の再送要求に応える
  document.addEventListener('ylh:live-request', sendSettings);

  sendSettings();
})();
