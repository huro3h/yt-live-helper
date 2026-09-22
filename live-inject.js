// live-inject.js — ライブ配信ページを開いたら最新位置（ライブヘッド）へシークする / MAIN world
//
// 旧実装（~2.8.0）は ISOLATED world から .ytp-live-badge を1回クリックするだけだった。
// しかしページ読み込み直後のバッジは実際の再生位置に関わらず disabled
// （class に ytp-live-badge-is-livehead が付く）になっており、disabled な要素への
// element.click() はイベントを一切発火しない。そのため実機では合成クリックが1度も
// 飛んでおらず、シークがまったく行われていなかった（Chrome Dev で計測、読み込み後
// 17秒間で .ytp-live-badge へのクリックイベント0件）。保険として併記されていた
// player.seekToLiveHead() も、ISOLATED world からはプレーヤーのメソッドが見えないため
// 常に呼ばれない dead code だった。
//
// そこで MAIN world へ移し、
//   ・ライブヘッド到達判定を getProgressState().isAtLiveHead で行う
//   ・シーク自体は公式に近い seekToLiveHead() で行う（バッジのクリックはやめた）
//   ・1回で終わらせず、到達を確認できるまでリトライする
// という方式にした。バッジをクリックしなくなったので、2.6.1 の「通常動画の再生位置が
// 壊れる」バグの再発経路も構造的に消えている（seekToLiveHead() は通常動画では実測で no-op）。

(function () {
  'use strict';

  const MAX_WAIT_MS = 30000;
  const POLL_INTERVAL_MS = 300;
  const PLAYING = 1;

  // 設定が届くまでは何もしない。既定値で走らせると、機能をOFFにしていても
  // 初回ロードでシークしてしまう（2.6.1 で踏んだのと同じ罠）
  let settings = null;
  let lastVideoId = null;
  let runToken = 0;

  // チャンネルの配信は /@handle/live・/channel/<id>/live でも直接開ける。配信中なら
  // /watch?v= へリダイレクトされず、その URL のまま視聴ページになる(実測)。サイドバーの
  // ライブアイコンのリンク先もこの形式なので、こちらでもシークを効かせる必要がある。
  const CHANNEL_LIVE_RE = /^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)\/live\/?$/;

  function isWatchPage() {
    return (
      location.pathname === '/watch' ||
      location.pathname.startsWith('/live/') ||
      CHANNEL_LIVE_RE.test(location.pathname)
    );
  }

  function getVideoId() {
    if (location.pathname === '/watch') {
      return new URLSearchParams(location.search).get('v');
    }
    const match = location.pathname.match(/^\/live\/([\w-]{11})/);
    if (match) return match[1];
    // チャンネル形式の URL には動画IDが含まれないので、重複排除のキーにはパスを使う
    // (チャンネルごとに一意で、SPA 遷移すれば必ず変わる)
    return CHANNEL_LIVE_RE.test(location.pathname) ? location.pathname : null;
  }

  // ライブ配信中のときだけ .ytp-time-display に .ytp-live が付く。
  // 注意: .ytp-live-badge の有無は通常動画のプレーヤーでも true になるのでライブ判定に
  // 使ってはいけない（2.6.1 のバグ）。広告の再生中もライブ表示にならないため、
  // ここが false の間はただ待てばよい。
  function isLivePlayback() {
    return !!document.querySelector('.ytp-time-display.ytp-live');
  }

  function call(player, method) {
    try {
      return typeof player[method] === 'function' ? player[method]() : null;
    } catch (e) {
      // すべて非公開APIなので、失敗しても黙って次のtickに任せる
      return null;
    }
  }

  function seekToLiveHead(token) {
    const startedAt = Date.now();

    (function tick() {
      if (token !== runToken) return;

      const player = document.getElementById('movie_player');
      // プレーヤーが playing になるまでは判定しない。読み込み直後は再生位置が定まる前から
      // isAtLiveHead が true を返すため（実測: 再生開始前は current=0 のまま true）、
      // そこで成功と見なすと、その後に遅れた位置から再生が始まっても取りこぼす。
      if (player && isLivePlayback() && call(player, 'getPlayerState') === PLAYING) {
        const state = call(player, 'getProgressState');
        if (state) {
          if (state.isAtLiveHead) return; // ライブヘッドに到達。完了
          call(player, 'seekToLiveHead'); // 次のtickで到達を確認する
        }
      }

      if (Date.now() - startedAt < MAX_WAIT_MS) {
        setTimeout(tick, POLL_INTERVAL_MS);
      }
      // MAX_WAIT_MS を過ぎたら諦めて何もしない（ライブでない動画はここに落ちる）
    })();
  }

  function handleNavigation() {
    if (!settings || !settings.jumpToLive || !isWatchPage()) return;

    const videoId = getVideoId();
    if (!videoId || videoId === lastVideoId) return;
    lastVideoId = videoId;

    seekToLiveHead(++runToken);
  }

  // 設定が届くたびに実行を試みる。動画IDでの重複排除があるので同じ動画で二重に走ることはなく、
  // 逆にOFFのまま開いたページで後からトグルをONにしたときはその場で効く
  document.addEventListener('ylh:live-settings', (event) => {
    if (!event.detail) return;
    settings = event.detail;
    handleNavigation();
  });

  // YouTube は SPA なので通常のページ遷移イベントが発火しない
  document.addEventListener('yt-navigate-finish', handleNavigation);

  // live-bridge.js の初回配信より後に起動した場合の取りこぼし対策
  document.dispatchEvent(new CustomEvent('ylh:live-request'));
})();
