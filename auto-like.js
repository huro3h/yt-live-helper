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
  // ボタンが描画された直後は aria-pressed がまだ実際の状態を反映していないことがあるので少し待つ
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

    const deadline = Date.now() + BUDGET_MS;
    while (Date.now() < deadline) {
      if (stale()) return;
      const videoId = currentVideoId();
      if (videoId && isDone(videoId)) return;
      const favorite = onLivePage() && signedIn() ? favoriteFor(currentChannelPath()) : null;
      if (videoId && favorite && likeButton()) {
        await sleep(SETTLE_MS);
        if (stale() || currentVideoId() !== videoId) return;
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

  chrome.storage.local.get(['autoLikeFavorites', 'favoriteChannels'], (stored) => {
    settings = {
      // 自分のアカウントで操作をする機能なので既定 OFF
      autoLikeFavorites: stored.autoLikeFavorites === true,
      favoriteChannels: readFavorites(stored.favoriteChannels),
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
    if (changes.autoLikeFavorites || changes.favoriteChannels) run();
  });

  document.addEventListener('yt-navigate-finish', run);
})();
