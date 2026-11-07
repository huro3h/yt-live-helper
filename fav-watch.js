// fav-watch.js — お気に入りチャンネルがライブを始めたら、その配信へ移動する
//   ライブ配信を見ている間だけ、1分ごとにお気に入りの「いま配信中か」を確認する。
//   新しく始まった配信が見つかったら、お気に入りの並び順(上が優先)で先頭のものへ移動する。
// DOM とネットワークしか使わないので ISOLATED world のままでよい。
//
// なぜサイドバー(ガイド)を読まないのか(実測 2026-09-23):
//   動画ページにはガイドが無く、裏で開くと最初の1回だけ /youtubei/v1/guide が飛ぶ。
//   閉じてもう一度開いても**再取得されない**(ネットワークログに何も出ず、ライブ判定も
//   1回目のまま)ため、ガイドの開閉を繰り返しても新しく始まった配信は検知できない。
//   そこで、お気に入りのチャンネルだけを名指しで確認する方式にした。
(function () {
  'use strict';

  // 1分ごと。お気に入り5件で 5リクエスト(約7.5KB)/分 = 約450KB/時で、配信の視聴そのもの
  // (1080pで毎時200〜400MB)に比べれば誤差。コストは件数に比例するので、数十件まで増やす
  // ようなら間隔を見直すこと。これより短くしても、Chrome が裏タブのタイマーを最短1分に
  // 丸めるため実効的な意味がない。
  const POLL_MS = 60000;
  const FIRST_POLL_MS = 8000; // 読み込み直後の1回目(このとき配信中のものは「既知」として記録するだけ)
  // resolve_url は clientVersion の形が合っていれば通る(実測: 2年前の日付でも 200、"2.0" は 404)。
  // ページから拾えなかったときの保険。
  const CLIENT_VERSION_FALLBACK = '2.20240101.00.00';
  // 絞り込み条件のキーワード欄の区切り(guide.js と同じ)
  const KEYWORD_SPLIT_RE = /[,，、\n]+/;
  // 絞り込み条件のトピック URL 欄の区切り(改行。空白やカンマで並べても読めるようにする)
  const URL_SPLIT_RE = /[\s,，、]+/;

  // storage から設定が届くまでは何もしない(2.6.1 の教訓)
  let settings = null;
  let timer = null;
  let polling = false;
  // このタブで「もう知っている配信」。チャンネルのパス → 動画ID。
  // 同じチャンネルでも動画IDが変われば新しい配信なので、もう一度移動の対象になる。
  const known = new Map();
  // 一度でも確認したチャンネル。「配信していない状態を見たことがある」ものだけを
  // 移動の対象にするための目印で、これが初回の記録だけで終わる仕組みも兼ねる
  // (ページを開いた時点で配信中だったもの、あとから追加したお気に入りが
  //  たまたま配信中だったものへは飛ばさない)。
  const checked = new Set();
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

  // ライブ配信のページにいるときだけ動かす。VOD や Shorts では何もしない。
  // (.ytp-time-display.ytp-live は live-inject.js と同じライブ判定。ISOLATED からも読める)
  const onLivePage = () => !!document.querySelector('.ytp-time-display.ytp-live');

  // innertube に渡す clientVersion。ページの HTML から1回だけ拾って使い回す
  // (ytcfg は MAIN world のものなのでここからは見えない)。
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

  // <channel>/live が「いま何に解決されるか」を YouTube 自身に聞く。
  // 配信中なら watchEndpoint(動画ID付き)、配信していなければ browseEndpoint(チャンネル)が返る
  // (実測。応答は約1.5KB / 60〜150ms で、ページを取りに行くより桁違いに軽い)。
  // 返り値: 動画ID(配信中) / null(配信していない) / undefined(確認できなかった)。
  // 失敗を「配信していない」と同じ扱いにすると、通信が一度こけただけで記録が消え、
  // 次の確認で「新しく始まった」と誤判定して見ていた配信から飛んでしまう。
  async function liveVideoId(path) {
    try {
      const data = await innertube('navigation/resolve_url', {
        url: `https://www.youtube.com${path}/live`,
      });
      if (!data) return undefined;
      const endpoint = data.endpoint;
      const watch = endpoint && endpoint.watchEndpoint;
      return (watch && watch.videoId) || null;
    } catch (e) {
      return undefined;
    }
  }

  // 待機所(開始前)やプレミア公開でも /live は動画に解決されるので、移動する直前に
  // 「本当にいま配信中か」だけ確かめる(約10KB)。videoDetails は再生できなくても返る。
  // 配信中なら、絞り込み条件の判定に使うタイトル・概要欄を返す(配信中でなければ null)。
  async function liveStream(videoId) {
    try {
      const data = await innertube('player', { videoId });
      const details = data && data.videoDetails;
      if (!details || details.isLive !== true || details.isUpcoming === true) return null;
      return { videoId, text: `${details.title || ''}\n${details.shortDescription || ''}` };
    } catch (e) {
      return null;
    }
  }

  // ===== 絞り込み条件(guide.js の配信終了後の移動と同じ判定) =====
  // 条件はオプション画面で登録する({ name, url, keywords, enabled })。ON の条件のどれかに
  // 合えば対象。url のある条件は配信の概要欄のトピックのリンク先で、トピックが無い配信と
  // url の無い条件はキーワード(タイトル・概要欄)で判定する。各 content script は単体で
  // 動くので、guide.js と同じ処理をここにも持つ。

  function youtubeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value.trim(), 'https://www.youtube.com');
      if (url.protocol !== 'https:') return null;
      if (url.hostname !== 'www.youtube.com' && url.hostname !== 'youtube.com') return null;
      return url;
    } catch (e) {
      return null;
    }
  }

  async function topicChannelId(value) {
    const url = youtubeUrl(value);
    if (!url) return null;
    const match = url.pathname.match(/^\/channel\/(UC[\w-]+)/);
    if (match) return match[1];
    try {
      const resolved = await innertube('navigation/resolve_url', { url: url.href });
      return resolved?.endpoint?.browseEndpoint?.browseId || null;
    } catch (e) {
      return null;
    }
  }

  // ON の条件を照合に使える形にする。使える条件が1つも無ければ null(= 絞り込まない)
  async function filterRules() {
    const rules = [];
    for (const filter of settings.liveFilters) {
      if (!filter || typeof filter !== 'object' || filter.enabled === false) continue;
      const ids = new Set();
      // トピックの URL は1行に1つ。同じ系列の別作品などをまとめて1つの条件にできる
      for (const url of String(filter.url || '').split(URL_SPLIT_RE)) {
        const id = await topicChannelId(url);
        if (id) ids.add(id);
      }
      const keywords = String(filter.keywords || '')
        .split(KEYWORD_SPLIT_RE)
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean);
      if (ids.size || keywords.length) rules.push({ ids, keywords });
    }
    return rules.length ? rules : null;
  }

  function topicChannelIds(data) {
    const ids = [];
    const walk = (node) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const attribute = node.videoAttributeViewModel;
      if (attribute) {
        const id = attribute.onTap?.innertubeCommand?.browseEndpoint?.browseId;
        if (id) ids.push(id);
        return;
      }
      Object.values(node).forEach(walk);
    };
    walk(data);
    return ids;
  }

  // トピックのカードは、url のある条件があるときだけ取りに行く(約400KB)
  async function matchesFilter(stream, rules) {
    let topics = null;
    if (rules.some((rule) => rule.ids.size)) {
      try {
        const data = await innertube('next', { videoId: stream.videoId });
        topics = data ? topicChannelIds(data) : [];
      } catch (e) {
        topics = [];
      }
    }
    const text = stream.text.toLowerCase();
    const hasKeyword = (rule) => rule.keywords.some((keyword) => text.includes(keyword));
    return rules.some((rule) => {
      if (rule.ids.size && topics.length) return topics.some((id) => rule.ids.has(id));
      return hasKeyword(rule);
    });
  }

  // いま見ているページ自身は移動先から除く(お気に入りの配信を見ている最中に、
  // その配信へ飛ばし直さないため)
  function currentVideoId() {
    const params = new URLSearchParams(location.search);
    const id = params.get('v');
    if (id) return id;
    const match = location.pathname.match(/^\/live\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  function currentChannelPath() {
    const link = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint');
    const href = link && link.getAttribute('href');
    if (href) return normalizePath(href);
    const match = location.pathname.match(/^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/live/);
    return match ? normalizePath(`/${match[1]}`) : null;
  }

  async function poll() {
    if (polling) return;
    if (!settings || !settings.watchFavorites) return;
    if (!settings.favoriteChannels.length || !onLivePage()) return;

    polling = true;
    try {
      const here = { videoId: currentVideoId(), channel: currentChannelPath() };
      // 新しく始まった配信(お気に入りの並び順 = 優先順)。移動先はループの後で、上から決める
      const targets = [];
      // いま見ている配信がお気に入りなら、その並び順。それより上のお気に入りにだけ移動する
      // (お気に入りを見ている最中に、優先度が同じか下のお気に入りが始まっても移動しない)。
      // お気に入り以外を見ているときは Infinity で、従来どおりどのお気に入りへも移動する。
      let hereRank = Infinity;

      for (const [index, favorite] of settings.favoriteChannels.entries()) {
        const path = typeof favorite.path === 'string' ? favorite.path : '';
        if (!path.startsWith('/')) continue;
        const key = normalizePath(path);
        const videoId = await liveVideoId(path);
        if (videoId === undefined) continue; // 確認できなかった。記録はそのまま次回へ

        const first = !checked.has(key); // このチャンネルを見るのが初めてかどうか
        checked.add(key);

        if (videoId === null) {
          known.delete(key); // 配信が終わった。次に始まったらまた対象になる
          continue;
        }
        const isNew = !first && known.get(key) !== videoId;
        known.set(key, videoId);

        const isHere = videoId === here.videoId || key === here.channel;
        if (isHere) {
          hereRank = Math.min(hereRank, index);
        } else if (isNew) {
          targets.push({ index, videoId });
        }
      }

      // 見ている配信の順位は全件を見終えるまで確定しないので、判定はループの後で行う
      // (下位の配信や条件に合わなかった配信が始まった記録は known に残るので、後から
      //  蒸し返されることもない)
      const rules = settings.watchFavoritesFilter ? await filterRules() : null;
      let target = null;
      for (const candidate of targets) {
        if (candidate.index >= hereRank) break; // 見ているお気に入り以下の順位
        const stream = await liveStream(candidate.videoId);
        if (!stream) continue; // 待機所・プレミア公開など
        // 「条件に合う配信だけ」が ON なら、ON の絞り込み条件のどれかに合うものだけ
        if (rules && !(await matchesFilter(stream, rules))) continue;
        target = candidate;
        break;
      }
      if (!target) return;
      if (!settings.watchFavorites || !onLivePage()) return; // 待っている間に条件が変わっていたら中止

      // /live の解決先は縦型の配信のこともあるので、着いた先で横型を探してもらう(horizontal.js)
      try {
        sessionStorage.setItem('ylh:prefer-horizontal', String(Date.now()));
      } catch (e) {
        // sessionStorage が使えなければ、そのまま移動する
      }
      location.assign(`https://www.youtube.com/watch?v=${target.videoId}`);
    } finally {
      polling = false;
    }
  }

  function schedule() {
    const on = !!settings && settings.watchFavorites && settings.favoriteChannels.length > 0;
    if (on && !timer) {
      timer = setInterval(poll, POLL_MS);
      setTimeout(poll, FIRST_POLL_MS);
    } else if (!on && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  const readFavorites = (value) => (Array.isArray(value) ? value : []);

  chrome.storage.local.get(
    ['watchFavorites', 'favoriteChannels', 'watchFavoritesFilter', 'liveFilters'],
    (stored) => {
      settings = {
        // 自動で移動する機能なので既定 OFF(autoNextLive と同じ扱い)
        watchFavorites: stored.watchFavorites === true,
        favoriteChannels: readFavorites(stored.favoriteChannels),
        // 移動先が減る設定なので既定 OFF
        watchFavoritesFilter: stored.watchFavoritesFilter === true,
        liveFilters: readFavorites(stored.liveFilters),
      };
      schedule();
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !settings) return;
    if (changes.watchFavorites) {
      settings.watchFavorites = changes.watchFavorites.newValue === true;
    }
    if (changes.favoriteChannels) {
      settings.favoriteChannels = readFavorites(changes.favoriteChannels.newValue);
    }
    if (changes.watchFavoritesFilter) {
      settings.watchFavoritesFilter = changes.watchFavoritesFilter.newValue === true;
    }
    if (changes.liveFilters) settings.liveFilters = readFavorites(changes.liveFilters.newValue);
    if (changes.watchFavorites || changes.favoriteChannels) schedule();
  });
})();
