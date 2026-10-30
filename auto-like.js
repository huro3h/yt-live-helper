// auto-like.js — お気に入りチャンネルのライブ配信を開いたら、自動で高評価(いいね)を押す
//   「配信が始まったら移動」による自動移動でも、自分で開いたときでも動く。ライブ中の配信だけが対象で、
//   アーカイブや待機所では押さない。DOM とネットワークしか使わないので ISOLATED world のままでよい。
//
// matches が youtube.com 全体なのは、ホームやサイドバーから SPA 遷移で配信を開いたときにも
// 動かすため(/watch* だけにすると、最初に開いたページが配信でない限り注入されない)。
//
// いいねボタンは押すたびに ON/OFF が切り替わるので、**押されていないことを確かめてから1回だけ**押す。
// 押した(または押してあった)動画IDはタブ単位で覚えておき、自分で取り消したものを押し直さない。
(function () {
  'use strict';

  if (window.top !== window) return;

  const STEP_MS = 500;
  // 広告(プリロール)の間はライブ判定のクラスが付かないので、seek より長めに待つ
  const BUDGET_MS = 60000;
  // 開いた瞬間に押すと不自然なので、画面遷移から少し待ってから押す(秒数はポップアップで設定。popup.js と同じ値)
  const DEFAULT_LIKE_DELAY_SEC = 120;
  // 下限は、遷移直後の JS の処理や DOM の読み込みが落ち着くまでの余裕
  const MIN_LIKE_DELAY_SEC = 10;
  const MAX_LIKE_DELAY_SEC = 3600;
  // ボタンが描画された直後は aria-pressed がまだ実際の状態を反映していないことがあるので、
  // 広告などでボタンが出るのが遅れ、待ち時間を過ぎてから見つかった場合も最低これだけは待つ
  const SETTLE_MS = 2000;
  const DONE_KEY = 'ylh:auto-liked';
  // fav-watch.js と同じ保険(resolve_url は形が合っていれば古い clientVersion でも通る)
  const CLIENT_VERSION_FALLBACK = '2.20240101.00.00';

  // storage から設定が届くまでは何もしない(2.6.1 の教訓)
  let settings = null;
  let runToken = 0;
  let cachedClientVersion = null;

  const normalizePath = (href) => {
    let path = href;
    try {
      path = decodeURIComponent(href);
    } catch (e) {
      // 壊れたエスケープはそのまま比較に使う
    }
    return path.replace(/\/+$/, '').toLowerCase();
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const onLivePage = () => !!document.querySelector('.ytp-time-display.ytp-live');

  const CHANNEL_LIVE_RE = /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/live\/?$/;

  const isWatchPath = () =>
    location.pathname === '/watch' ||
    location.pathname.startsWith('/live/') ||
    CHANNEL_LIVE_RE.test(location.pathname);

  // <channel>/live の形は URL に動画IDを持たないので、watch ページ本体の属性から取る
  function currentVideoId() {
    const params = new URLSearchParams(location.search);
    const id = params.get('v');
    if (id) return id;
    const match = location.pathname.match(/^\/live\/([^/?#]+)/);
    if (match) return match[1];
    const flexy = document.querySelector('ytd-watch-flexy');
    return (flexy && flexy.getAttribute('video-id')) || null;
  }

  function currentChannelPath() {
    const match = location.pathname.match(CHANNEL_LIVE_RE);
    if (match) return normalizePath(`/${match[1]}`);
    const link = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint');
    const href = link && link.getAttribute('href');
    return href ? normalizePath(href) : null;
  }

  function favoriteFor(channel) {
    if (!channel) return null;
    return (
      settings.favoriteChannels.find(
        (favorite) => typeof favorite.path === 'string' && normalizePath(favorite.path) === channel
      ) || null
    );
  }

  // ログアウト中に押すとログインを促すダイアログが出るだけなので、ログイン中だけ動かす
  const signedIn = () => !!document.querySelector('#avatar-btn');

  // いいねボタンは同じものが3つある(実測 2026-10-29): プレーヤー内のクイック操作(通常は非表示)、
  // 動画下の操作列(表示中)、旧レイアウトの残骸(非表示)。表示されているものだけを使う。
  function likeButton() {
    const buttons = document.querySelectorAll('like-button-view-model button[aria-pressed]');
    for (const button of buttons) {
      if (button.closest('#movie_player')) continue;
      if (button.checkVisibility()) return button;
    }
    return null;
  }

  function readDone() {
    try {
      const list = JSON.parse(sessionStorage.getItem(DONE_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  const isDone = (videoId) => readDone().includes(videoId);

  function markDone(videoId) {
    try {
      const list = readDone().filter((id) => id !== videoId);
      list.push(videoId);
      sessionStorage.setItem(DONE_KEY, JSON.stringify(list.slice(-50)));
    } catch (e) {
      // 保存できなくても、このページの中では runToken で二重に押さない
    }
  }

  function clientVersion() {
    if (cachedClientVersion) return cachedClientVersion;
    let version = null;
    try {
      const html = document.documentElement.innerHTML;
      const match =
        html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([\d.]+)"/) ||
        html.match(/"clientVersion":"([\d.]+)"/);
      version = match && match[1];
    } catch (e) {
      version = null;
    }
    cachedClientVersion = version || CLIENT_VERSION_FALLBACK;
    return cachedClientVersion;
  }

  // お気に入りの <channel>/live がいま何の動画に解決されるかを聞く(fav-watch.js と同じ方法)。
  // SPA 遷移の直後は、チャンネル名の欄が前の動画のまま残っていることがあるので、
  // DOM だけで「お気に入りの配信だ」と決めると別の動画にいいねしかねない。その確認に使う。
  async function liveVideoId(path) {
    try {
      const res = await fetch('/youtubei/v1/navigation/resolve_url?prettyPrint=false', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: clientVersion() } },
          url: `https://www.youtube.com${path}/live`,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const watch = data && data.endpoint && data.endpoint.watchEndpoint;
      return (watch && watch.videoId) || null;
    } catch (e) {
      return null;
    }
  }

  async function run() {
    const token = ++runToken;
    const stale = () => token !== runToken || !settings || !settings.autoLikeFavorites;
    if (stale() || !isWatchPath()) return;

    const startedAt = Date.now();
    const deadline = startedAt + BUDGET_MS;
    while (Date.now() < deadline) {
      if (stale()) return;
      const videoId = currentVideoId();
      if (videoId && isDone(videoId)) return;
      const favorite = onLivePage() && signedIn() ? favoriteFor(currentChannelPath()) : null;
      if (videoId && favorite && likeButton()) {
        // 待つ間に別の配信へ移ったり、自分でいいね/低評価を押したりしたらやめる。
        // 秒数は待っている間に変えても反映されるよう、毎回 settings から読む
        const settledAt = Date.now() + SETTLE_MS;
        while (Date.now() < Math.max(settledAt, startedAt + settings.likeDelaySec * 1000)) {
          await sleep(STEP_MS);
          if (stale() || currentVideoId() !== videoId || isDone(videoId)) return;
        }
        if ((await liveVideoId(favorite.path)) !== videoId) return; // お気に入りの配信ではなかった
        if (stale() || currentVideoId() !== videoId || !onLivePage()) return;
        const button = likeButton();
        if (!button) return;
        markDone(videoId);
        if (button.getAttribute('aria-pressed') !== 'true') button.click();
        return;
      }
      await sleep(STEP_MS);
    }
  }

  const readFavorites = (value) => (Array.isArray(value) ? value : []);

  const readDelaySec = (value) =>
    Number.isInteger(value) && value >= MIN_LIKE_DELAY_SEC && value <= MAX_LIKE_DELAY_SEC ? value : DEFAULT_LIKE_DELAY_SEC;

  chrome.storage.local.get(['autoLikeFavorites', 'favoriteChannels', 'autoLikeDelaySec'], (stored) => {
    settings = {
      // 自分のアカウントで操作をする機能なので既定 OFF
      autoLikeFavorites: stored.autoLikeFavorites === true,
      favoriteChannels: readFavorites(stored.favoriteChannels),
      likeDelaySec: readDelaySec(stored.autoLikeDelaySec),
    };
    run();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !settings) return;
    if (changes.autoLikeFavorites) {
      settings.autoLikeFavorites = changes.autoLikeFavorites.newValue === true;
    }
    if (changes.favoriteChannels) {
      settings.favoriteChannels = readFavorites(changes.favoriteChannels.newValue);
    }
    // 秒数の変更は待機中のループが読み直すので、run() はやり直さない(やり直すと待ち時間の起点がずれる)
    if (changes.autoLikeDelaySec) {
      settings.likeDelaySec = readDelaySec(changes.autoLikeDelaySec.newValue);
    }
    if (changes.autoLikeFavorites || changes.favoriteChannels) run();
  });

  document.addEventListener('yt-navigate-finish', run);

  // 自分でいいね/低評価を押した動画は、以後この機能では押さない(待っている間に押した場合も含む)。
  // 拡張機能自身の click() は isTrusted が false なので区別できる
  document.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      if (!event.target.closest('like-button-view-model, dislike-button-view-model')) return;
      const videoId = currentVideoId();
      if (videoId) markDone(videoId);
    },
    true
  );
})();
