// guide-window-inject.js — 「サイドバーを別ウィンドウで開く」の一覧を最新にする(MAIN world)
//   guide-window.js が1分ごとに ylh:guide-refresh を投げてくる(一覧用のウィンドウでだけ)ので、
//   そのたびにガイドを取り直し、ライブ状況が変わっていればサイドバーに差し込む。
//
// 実測(2026-11-08、ログイン状態の Chrome Dev):
//   - YouTube はガイドを最初に1回取ったきりで、開け閉めしても取り直さない。内部の
//     guideService.fetchGuideData() も手元の結果を返すだけで、通信は起きない
//   - /youtubei/v1/guide は、ページと同じ SAPISIDHASH の Authorization ヘッダーを付ければ
//     ログイン状態の一覧を返す(登録100件で約100KB・約170ms)。付けないとログアウト状態の一覧になる
//   - ytd-guide-renderer の data に応答を入れると、サイドバーが作り直される。作り直しで
//     「もっと見る」は閉じるが、guide.js が DOM の変化を拾って展開・並べ替えをやり直す(約2.5秒)
// ytcfg と Polymer の data は MAIN world からしか見えないので、この部分だけ MAIN で動かす。

(function () {
  'use strict';

  if (window.top !== window) return;

  const SCROLLER_SELECTOR = '#guide-inner-content';
  // 作り直したあと guide.js が並べ直すまで待ってから、スクロール位置を戻す
  const SCROLL_RESTORE_DELAYS_MS = [1500, 3000];

  let refreshing = false;

  function cookie(name) {
    for (const part of document.cookie.split('; ')) {
      const at = part.indexOf('=');
      if (part.slice(0, at) === name) return part.slice(at + 1);
    }
    return null;
  }

  async function sha1Hex(text) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // YouTube のページ自身が付けているのと同じ形の認証ヘッダー
  async function authorization() {
    const sapisid = cookie('SAPISID') || cookie('__Secure-3PAPISID');
    if (!sapisid) return null; // ログアウト中(登録チャンネルが無いので取り直す意味も無い)
    const now = Math.floor(Date.now() / 1000);
    return `SAPISIDHASH ${now}_${await sha1Hex(`${now} ${sapisid} ${location.origin}`)}`;
  }

  async function fetchGuide() {
    const ytcfg = window.ytcfg;
    const context = ytcfg && ytcfg.get('INNERTUBE_CONTEXT');
    const auth = await authorization();
    if (!context || !auth) return null;
    const res = await fetch('/youtubei/v1/guide?prettyPrint=false', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        authorization: auth,
        'x-origin': location.origin,
        'x-goog-authuser': String(ytcfg.get('SESSION_INDEX') ?? 0),
      },
      body: JSON.stringify({ context }),
    });
    return res.ok ? res.json() : null;
  }

  // チャンネルごとの「ライブ中かどうか」を並べた文字列。登録の増減もこれで分かる
  function liveKey(data) {
    const parts = [];
    const walk = (node) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const entry = node.guideEntryRenderer;
      const id = entry && entry.navigationEndpoint?.browseEndpoint?.browseId;
      if (id && id.startsWith('UC')) parts.push(`${id}:${entry.badges?.liveBroadcasting ? 1 : 0}`);
      Object.values(node).forEach(walk);
    };
    walk(data);
    return parts.join(',');
  }

  async function refresh() {
    if (refreshing) return;
    const guide = document.querySelector('ytd-guide-renderer');
    const controller = guide && guide.polymerController;
    if (!controller || !controller.data) return; // まだサイドバーが出来ていない
    refreshing = true;
    try {
      const fresh = await fetchGuide();
      const key = fresh ? liveKey(fresh) : '';
      // チャンネルが1つも無い応答(ログアウト状態の一覧など)では差し替えない
      if (!key || key === liveKey(controller.data)) return;
      // 作り直すとスクロール位置が先頭に戻るので、あとで戻す
      const scroller = document.querySelector(SCROLLER_SELECTOR);
      const scrollTop = scroller ? scroller.scrollTop : 0;
      controller.data = fresh;
      if (scroller && scrollTop) {
        for (const delay of SCROLL_RESTORE_DELAYS_MS) {
          setTimeout(() => {
            scroller.scrollTop = scrollTop;
          }, delay);
        }
      }
    } catch (e) {
      // 非公開の API なので、失敗したら今の一覧のまま次の回を待つ
    } finally {
      refreshing = false;
    }
  }

  document.addEventListener('ylh:guide-refresh', refresh);
})();
