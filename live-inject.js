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
  const END_POLL_INTERVAL_MS = 1000;
  const PLAYING = 1;
  const ENDED = 0;
  // 広告の切り替わりなどで一瞬 ENDED を挟む可能性があるので、連続で観測できたときだけ終了とみなす
  const END_CONFIRM_TICKS = 2;

  // 設定が届くまでは何もしない。既定値で走らせると、機能をOFFにしていても
  // 初回ロードでシークしてしまう（2.6.1 で踏んだのと同じ罠）
  let settings = null;
  let lastVideoId = null; // 終了監視のリセット用（jumpToLive の ON/OFF に関わらず更新する）
  let seekedVideoId = null; // シーク済みの動画（後からトグルをONにしても効くよう別に持つ）
  let runToken = 0;
  let sawLivePlayback = false; // このページでライブ再生を実際に確認したか
  let endedTicks = 0;
  let endNotified = false;

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

  // このページがライブ配信かどうか。.ytp-live は再生が始まるまで付かないため、プレーヤーの
  // 初期データも併用する。配信が終わったあとに開いたアーカイブでは isLive が立たないので
  // (実測: 終了済みは isLiveContent だけが true)、通常動画と取り違える心配はない。
  function isLiveStreamPage(player) {
    if (isLivePlayback()) return true;
    const response = call(player, 'getPlayerResponse');
    return !!(response && response.videoDetails && response.videoDetails.isLive);
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
    if (!settings || !isWatchPage()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    if (videoId !== lastVideoId) {
      lastVideoId = videoId;
      // 別の配信に移ったので終了監視をやり直す
      sawLivePlayback = false;
      endedTicks = 0;
      endNotified = false;
    }

    if (!settings.jumpToLive || videoId === seekedVideoId) return;
    seekedVideoId = videoId;

    seekToLiveHead(++runToken);
  }

  // 配信の終了検知。「通常動画の再生終了」と区別するため、このページがライブ配信だと
  // 確認できた場合に限って発火する。
  // 判定自体はプレーヤーの状態（ENDED）で行う。配信が終わると、ライブヘッドで見ていれば
  // その場で、遅れて見ていても DVR の終端に追いついた時点で ENDED になる。
  // 遷移先の決定（登録チャンネル一覧の先頭のライブ）は guide.js 側の担当。
  function checkEnd() {
    if (!settings || !settings.autoNextLive || endNotified || !isWatchPage()) return;

    const player = document.getElementById('movie_player');
    if (!player) return;

    if (!sawLivePlayback && isLiveStreamPage(player)) sawLivePlayback = true;
    if (!sawLivePlayback) return; // 通常動画では絶対に発火させない

    if (call(player, 'getPlayerState') !== ENDED) {
      endedTicks = 0;
      return;
    }
    if (++endedTicks < END_CONFIRM_TICKS) return;

    endNotified = true;
    document.dispatchEvent(new CustomEvent('ylh:live-ended'));
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

  // 終了は「いつ起きるか分からない」ので、イベントではなく緩いポーリングで見張る
  // （設定OFFのときは checkEnd が即座に抜けるだけなのでコストはない）
  setInterval(checkEnd, END_POLL_INTERVAL_MS);

  // live-bridge.js の初回配信より後に起動した場合の取りこぼし対策
  document.dispatchEvent(new CustomEvent('ylh:live-request'));
})();
