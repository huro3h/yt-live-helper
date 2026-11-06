// thumbnail.js — 動画一覧のサムネイルにカーソルを合わせると右上に出る「後で見る」「キューに追加」を非表示にする
//   トピックチャンネルの配信一覧(/channel/<id>/live)など、ytd-thumbnail を使う一覧が対象。
//   chat.js の非表示と同じく <style> を1つ挿すだけ。後から読み込まれた行にも自動で効き、
//   ボタン自体は押さないので「後で見る」の中身には一切触れない。
//
// 実測(2026-11-07): ボタンは ytd-thumbnail の #hover-overlays の中にある
// ytd-thumbnail-overlay-toggle-button-renderer(aria-label が「後で見る」「キューに追加」)。
// プレーヤー内の「後で見る」ボタン(#movie_player 配下)は別物なので、ytd-thumbnail の中だけに絞る。
(function () {
  'use strict';

  if (window.top !== window) return;

  const STYLE_ID = 'ylh-hide-thumbnail-actions';
  const CSS = 'ytd-thumbnail #hover-overlays ytd-thumbnail-overlay-toggle-button-renderer{display:none!important;}';

  function applyStyle(on) {
    const existing = document.getElementById(STYLE_ID);
    if (on) {
      if (existing) return;
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = CSS;
      (document.head || document.documentElement).appendChild(s);
    } else if (existing) {
      existing.remove();
    }
  }

  chrome.storage.local.get(['hideThumbnailActions'], (stored) => {
    applyStyle(stored.hideThumbnailActions !== false);
  });

  // ページを読み込み直さなくても即時反映(CSS の付け外し)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.hideThumbnailActions) return;
    applyStyle(changes.hideThumbnailActions.newValue !== false);
  });
})();
