// horizontal.js — 縦型と横型の配信を同時に行っているチャンネルで、横型のほうへ切り替える
//   チャンネルの /live は YouTube が配信中の1本を選んで開くため、縦型(スマホ向け)と
//   横型を同時に配信していると縦型に着くことがある(実測 2026-11-07: 4秒あとに始まった
//   縦型のほうへ解決された。選び方は非公開で、URL で横型を指定する方法も無い)。
//   そこで着いた配信が縦型なら、同じチャンネルで配信中の横型の配信へ移り直す。
//
// 対象は「<channel>/live で開いたページ」と「この拡張が移動させたページ」だけ。
// 縦型の配信を自分で選んで開いた(/watch?v= を直接開いた)ときは何もしない。
// DOM とネットワークしか使わないので ISOLATED world のままでよい。
(function () {
  'use strict';

  // fav-watch.js / guide.js が移動の直前に書く目印(タブ内だけで完結する)
  const MARK_KEY = 'ylh:prefer-horizontal';
  const MARK_MAX_AGE_MS = 60000;
  const CHANNEL_LIVE_RE = /^\/(@[^/]+|(?:channel|c|user)\/[^/]+)\/live\/?$/;
  // 縦型のタイトルに付く慣習的な目印。移り先の候補を選ぶときに使う(一覧には縦横比が無い)
  const VERTICAL_TITLE_RE = /縦型|縦配信|縦画面|#shorts|vertical/i;
  // 【縦型】のように括弧でくくった「縦型」は、縦型の配信の名札として多く使われる(ユーザー談)。
  // 着いた配信のタイトルにこれがあれば、映像を待たずに縦型と決める。括弧の無い「縦型」は
  // 「縦型も同時配信中」のような横型の配信にも出うるので、実際の映像の縦横比で確かめる
  // (実測: 縦型は 1080x1920)
  const VERTICAL_TAG_RE = /[【\[［(（]\s*縦型[^】\]］)）]*[】\]］)）]/;
  // 広告が終わって本編の映像が出るまで待つ(live-inject.js の頭出しと同じ上限)
  const PLAYER_WAIT_MS = 30000;
  const PLAYER_POLL_MS = 500;
  const LIVE_BADGE_STYLE = 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE';
  // fav-watch.js と同じ。ページから clientVersion を拾えなかったときの保険
  const CLIENT_VERSION_FALLBACK = '2.20240101.00.00';

  // storage から設定が届くまでは何もしない(2.6.1 の教訓)
  let settings = null;
  let settingsArrived;
  const settingsLoaded = new Promise((resolve) => {
    settingsArrived = resolve;
  });
  let checkedUrl = null;
  let cachedClientVersion = null;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(fn, timeoutMs) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const value = fn();
      if (value) return value;
      if (Date.now() >= until) return null;
      await wait(PLAYER_POLL_MS);
    }
  }

  function takeMark() {
    try {
      const at = Number(sessionStorage.getItem(MARK_KEY)) || 0;
      sessionStorage.removeItem(MARK_KEY);
      return at > 0 && Date.now() - at <= MARK_MAX_AGE_MS;
    } catch (e) {
      return false;
    }
  }

  // innertube の呼び出し(fav-watch.js と同じ作り。clientVersion は ytcfg が MAIN world にしか
  // 無いので、ページの HTML から1回だけ拾う)
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

  function innertube(endpoint, body) {
    return fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: clientVersion() } },
        ...body,
      }),
    }).then((res) => (res.ok ? res.json() : null));
  }

  function channelPath(match) {
    if (match) return '/' + match[1];
    const owner = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint[href]');
    const href = owner && owner.getAttribute('href');
    return href && href.startsWith('/') ? href.replace(/\/+$/, '') : null;
  }

  function pageTitle() {
    const h1 = document.querySelector('ytd-watch-metadata h1');
    return (h1 && h1.textContent.trim()) || document.title;
  }

  // 本編のライブ映像が出たところで、その動画IDと縦横比を読む。
  // 広告中(.ad-showing)の映像は横長なので、終わるまで待つ。
  // タイトルに【縦型】があれば、映像を待たずにその時点で縦型と答える
  function readPlayer() {
    const player = document.getElementById('movie_player');
    const video = player && player.querySelector('video');
    const videoId = document.querySelector('ytd-watch-flexy')?.getAttribute('video-id');
    if (!video || !videoId) return null;
    if (!document.querySelector('.ytp-time-display.ytp-live')) return null;
    if (VERTICAL_TAG_RE.test(pageTitle())) return { videoId, portrait: true };
    if (player.classList.contains('ad-showing')) return null;
    if (!video.videoWidth || !video.videoHeight) return null;
    return { videoId, portrait: video.videoHeight > video.videoWidth };
  }

  // チャンネルの「ライブ」タブ(/streams)から、いま配信中の動画を並び順で拾う。
  // 縦型か横型かを示す項目は応答に無い(実測: 同時配信中の2本は動画ID・タイトル・視聴者数
  // 以外まったく同じ形。/player にも映像サイズは返らない)ので、タイトルだけを持ち帰る。
  async function channelLives(path) {
    const resolved = await innertube('navigation/resolve_url', {
      url: `https://www.youtube.com${path}/streams`,
    });
    const browse = resolved?.endpoint?.browseEndpoint;
    if (!browse || !browse.browseId) return [];
    const data = await innertube('browse', { browseId: browse.browseId, params: browse.params });
    const lives = [];
    const walk = (node) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const lockup = node.lockupViewModel;
      if (lockup && lockup.contentId) {
        const badges = JSON.stringify(lockup.contentImage || {});
        if (badges.includes(LIVE_BADGE_STYLE)) {
          lives.push({
            videoId: lockup.contentId,
            title: lockup.metadata?.lockupMetadataViewModel?.title?.content || '',
          });
        }
        return;
      }
      // 旧来の形(videoRenderer)で返ってきたとき用
      const renderer = node.videoRenderer || node.gridVideoRenderer;
      if (renderer && renderer.videoId) {
        const live = (renderer.thumbnailOverlays || []).some(
          (o) => o.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE'
        );
        if (live) {
          lives.push({
            videoId: renderer.videoId,
            title: renderer.title?.runs?.[0]?.text || renderer.title?.simpleText || '',
          });
        }
        return;
      }
      Object.values(node).forEach(walk);
    };
    walk(data);
    return lives;
  }

  async function check() {
    const match = location.pathname.match(CHANNEL_LIVE_RE);
    const marked = takeMark();
    if (!match && !marked) return;
    const url = location.href;
    if (checkedUrl === url) return;
    checkedUrl = url;

    await settingsLoaded;
    if (!settings.preferHorizontalLive) return;

    const state = await waitFor(readPlayer, PLAYER_WAIT_MS);
    // 映像が読めなかったら何もしない。括弧の無い「縦型」だけでは決めない
    if (!state || location.href !== url || !state.portrait) return;

    const path = channelPath(match);
    if (!path) return;
    let lives = [];
    try {
      lives = await channelLives(path);
    } catch (e) {
      return;
    }
    // 移り先の映像は開くまで分からないので、タイトルで縦型と分かるものは外す。
    // 横型が見つからなければ(縦型だけの配信など)そのまま留まる
    const target = lives.find(
      (live) => live.videoId !== state.videoId && !VERTICAL_TITLE_RE.test(live.title)
    );
    if (!target || location.href !== url || !settings.preferHorizontalLive) return;
    // 戻るボタンで縦型へ戻されないよう、履歴を置き換える
    location.replace(`https://www.youtube.com/watch?v=${target.videoId}`);
  }

  chrome.storage.local.get(['preferHorizontalLive'], (stored) => {
    settings = { preferHorizontalLive: stored.preferHorizontalLive !== false };
    settingsArrived();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !settings || !changes.preferHorizontalLive) return;
    settings.preferHorizontalLive = changes.preferHorizontalLive.newValue !== false;
  });

  check();
  // YouTube 内のリンクから SPA で <channel>/live へ来た場合
  document.addEventListener('yt-navigate-finish', () => check());
})();
