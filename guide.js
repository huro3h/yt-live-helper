// guide.js — 左サイドバー(ガイド)の「登録チャンネル」欄の手入れ
//   (1) ライブ配信中のチャンネルを一覧の先頭へ移動
//   (2) 「もっと見る」を自動で展開したままにする
//   (3) ライブアイコンを、配信中の動画へ直接飛ぶリンクにする
//   (4) 見ている配信が終わったら、次のライブへ移動する
//       (終了の検知は live-inject.js。ここは遷移先を決めて飛ぶだけ)
//       移動先は2通り: 登録チャンネル一覧の先頭のライブ / 指定したページの先頭のライブ
// youtube.com 全体(トップフレームのみ)で動作。純粋な DOM 操作で、プレーヤーの
// 非公開メソッドは使わないため ISOLATED world のままでよい。

(function () {
  'use strict';

  // 登録チャンネルのセクションは「見出し行のリンク先が /feed/subscriptions」で特定する。
  // 見出しの文言(「登録チャンネル」)は言語設定で変わるので判定には使わない。
  const SUB_HEADER_SELECTOR =
    'ytd-guide-section-renderer #items > ytd-guide-collapsible-section-entry-renderer' +
    ' a[href="/feed/subscriptions"]';
  const SILENT_STYLE_ID = 'ylh-guide-silent-expand';
  const HOP_STYLE_ID = 'ylh-guide-hop';
  const GUIDE_BUTTON_SELECTOR = '#guide-button button, #guide-button';
  const FAV_STYLE_ID = 'ylh-guide-fav';
  const FAV_CLASS = 'ylh-fav-star';
  const FAV_ON_CLASS = 'ylh-fav-on';
  const FAV_ATTR = 'data-ylh-fav';
  const FAV_TITLE_ON = 'お気に入りから外す';
  const FAV_TITLE_OFF = 'お気に入りに追加';
  const LIVE_LINK_STYLE_ID = 'ylh-guide-live-link';
  const LIVE_LINK_ATTR = 'data-ylh-live-link';
  const LIVE_LINK_TITLE = 'ライブ配信を開く';

  const FAST_POLL_MS = 300;
  const FAST_POLL_LIMIT_MS = 15000;
  const SLOW_POLL_MS = 3000; // ガイドは初回表示まで描画されない場合があるので緩く待ち続ける
  const SETTLE_MS = 400;
  const REAPPLY_DEBOUNCE_MS = 500;
  const EXPAND_COOLDOWN_MS = 10000;
  const HOP_TIMEOUT_MS = 8000;
  const HOP_POLL_MS = 200;
  // 指定ページへ飛んだあと「先頭のライブを開く」ための目印(タブ内だけで完結する)
  const PICK_KEY = 'ylh:pick-live';
  const PICK_MAX_AGE_MS = 60000;
  const PICK_TIMEOUT_MS = 10000;
  const PICK_VISIBLE_WAIT_MS = 300000;
  // フィルタ拡張(YT Quick Filter など)は一覧の描画後、数回に分けて項目を隠す
  // (実測: 着地から約0.6秒で5件、約2.7秒で19件)。結果が落ち着くまで少し待つ
  const PICK_SETTLE_STEP_MS = 400;
  const PICK_SETTLE_MAX_MS = 3000;
  // 一覧のサムネイルに付くライブバッジ。文言ではなくクラス/属性で見る(言語非依存)
  const LIVE_BADGE_SELECTOR =
    'badge-shape.ytBadgeShapeLive,' +
    ' ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"]';
  const VIDEO_LINK_SELECTOR = 'a[href*="/watch?v="], a[href^="/live/"]';
  // 一覧の1アイテム。バッジから親をたどって見つけた要素を、ここまで広げてから中身を読む
  const LIST_ITEM_SELECTOR =
    'ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-video-renderer, yt-lockup-view-model';
  const CHANNEL_LINK_SELECTOR =
    'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]';
  // 「1615 人が視聴中」「1.6万 人が視聴中」(英語表示なら「1.2K watching」)。
  // 視聴者数は文言からしか読めないので、日本語と英語の表示だけ対応する
  const VIEWERS_RE = /(\d[\d,.]*)\s*(万|億|K|M)?\s*(?:人が視聴中|watching)/i;
  const VIEWERS_UNIT = { 万: 1e4, 億: 1e8, k: 1e3, m: 1e6 };
  // 視聴者数の上限の既定値(popup.js と同じ値)
  const DEFAULT_MAX_VIEWERS = 100;
  // 指定ページへ飛ぶ前に読んだ登録チャンネル一覧(視聴者数の上限から外すため)
  const PICK_CHANNELS_KEY = 'ylh:pick-channels';
  // 指定ページにライブが無かったときの次の行き先(移動前に読んだ登録チャンネルの先頭のライブ)
  const PICK_FALLBACK_KEY = 'ylh:pick-fallback';
  // 配信終了後の移動で、サイドバーにライブ表示が無いチャンネルを /live で確かめるときの同時数。
  // 1件 約1.5KB / 60〜150ms なので、登録100件でも 約150KB・数秒で終わる
  const LIVE_CHECK_BATCH = 10;
  // fav-watch.js と同じ。ページから clientVersion を拾えなかったときの保険
  const CLIENT_VERSION_FALLBACK = '2.20240101.00.00';

  // storage から設定が届くまでは何もしない(2.6.1 の教訓: 既定値で先走ると OFF 設定を無視する)
  let settings = null;
  let settingsArrived; // 下の settingsLoaded を解決する関数
  const settingsLoaded = new Promise((resolve) => {
    settingsArrived = resolve;
  });
  let applying = false;
  let lastExpandAt = 0;
  let snapshot = null; // 並べ替える前の「YouTube 本来の並び順」
  let reapplyTimer = null;
  let observedItems = null;
  let hopping = false;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function getSection() {
    const header = document.querySelector(SUB_HEADER_SELECTOR);
    return header ? header.closest('ytd-guide-section-renderer') : null;
  }

  // ライブ判定: .guide-entry-badge(赤いライブアイコン)が表示されているかで見る。バッジ要素
  // 自体は全エントリに存在し、ライブ中のものだけ display:block になる(未視聴を示す青い丸
  // #newness-dot とは別物)。要素の有無では判定できない(2.6.1 の .ytp-live-badge と同じ罠)。
  // aria-label の文言(「ライブ配信中。」)は言語依存なので使わない。
  //
  // 「バッジの中の svg の有無」で見てはいけない(実測): タブが裏にいる間、Polymer はアイコンを
  // 生成せず(disable-upgrade が付いたまま中身が空)、ライブ中でも svg が現れない。表示状態なら
  // 裏タブでも正しく block になるので、こちらだけが両方の状況で使える。
  // 表示の判定は計算値なので、ガイドが閉じている(祖先が display:none)間でも読める。
  const isLive = (entry) => {
    const badge = entry.querySelector('.guide-entry-badge');
    return !!badge && getComputedStyle(badge).display !== 'none';
  };

  // /@handle や /channel/<id> に /live を足した URL は、配信中ならそのまま視聴ページとして
  // 開ける(実測: /watch?v= へリダイレクトされるのではなく、その URL のままプレーヤーが載る)。
  // おかげでチャンネルページを経由せずに配信へ直行できる。
  function liveUrl(entry) {
    const link = entry.querySelector('a#endpoint') || entry.querySelector('a');
    const href = link && link.getAttribute('href');
    if (!href || !href.startsWith('/')) return null;
    return href.replace(/\/+$/, '') + '/live';
  }

  // クリック範囲を少し広げる(アイコンは16px角しかない)。見た目は hover 時の拡大だけ。
  function liveLinkStyle(on) {
    const existing = document.getElementById(LIVE_LINK_STYLE_ID);
    if (on) {
      if (existing) return;
      const style = document.createElement('style');
      style.id = LIVE_LINK_STYLE_ID;
      style.textContent =
        `ytd-guide-entry-renderer [${LIVE_LINK_ATTR}]{cursor:pointer;}` +
        `ytd-guide-entry-renderer [${LIVE_LINK_ATTR}]::after` +
        '{content:"";position:absolute;inset:-6px;}' +
        `ytd-guide-entry-renderer [${LIVE_LINK_ATTR}]:hover{transform:scale(1.25);}`;
      (document.head || document.documentElement).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }

  // ライブ中のエントリのアイコンにだけリンク先を持たせる。配信が終わったら外す。
  function markLiveLinks(entries, linked) {
    for (const entry of entries) {
      const badge = entry.querySelector('.guide-entry-badge');
      if (!badge) continue;
      const url = linked.has(entry) ? liveUrl(entry) : null;
      if (url) {
        if (badge.getAttribute(LIVE_LINK_ATTR) !== url) badge.setAttribute(LIVE_LINK_ATTR, url);
        if (badge.getAttribute('title') !== LIVE_LINK_TITLE) {
          badge.setAttribute('title', LIVE_LINK_TITLE);
        }
      } else if (badge.hasAttribute(LIVE_LINK_ATTR)) {
        badge.removeAttribute(LIVE_LINK_ATTR);
        badge.removeAttribute('title');
      }
    }
  }

  // お気に入りの★はアバターと名前の間の隙間に置く。実測(2026-11-07)でアバターは行の左端から
  // 12〜36px、名前は 60px から始まるので、24px の隙間の真ん中(中心 48px)に 16px の★を置く。
  // 以前は行の右端に置いていたが、ライブ中の行ではライブアイコンと近くて押しづらかった。
  // (アバターの上に重ねるのは不可。ホバーで出る位置がマウスカーソルの真下になり、矢印に隠れる)
  // エントリは position:relative(実測)なので、そのまま絶対配置できる。
  function favStyle() {
    if (document.getElementById(FAV_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FAV_STYLE_ID;
    style.textContent =
      `ytd-guide-entry-renderer .${FAV_CLASS}` +
      '{position:absolute;left:40px;top:50%;margin-top:-8px;width:16px;height:16px;' +
      'display:none;align-items:center;justify-content:center;box-sizing:border-box;' +
      'border-radius:50%;background:rgba(0,0,0,0.75);color:#fff;font-size:10px;' +
      'line-height:1;cursor:pointer;z-index:1;}' +
      // アイコンが小さいのでクリック範囲だけ広げる(ライブアイコンと同じ手)。
      // 左右4pxずつで、ちょうどアバターの右端から名前の左端までになる
      `ytd-guide-entry-renderer .${FAV_CLASS}::after` +
      '{content:"";position:absolute;inset:-4px;border-radius:50%;}' +
      // 普段はホバーしたときだけ。お気に入り登録済みのものは常に出す
      `ytd-guide-entry-renderer:hover .${FAV_CLASS}{display:flex;}` +
      `ytd-guide-entry-renderer .${FAV_CLASS}.${FAV_ON_CLASS}` +
      '{display:flex;background:#ff3d6b;}';
    (document.head || document.documentElement).appendChild(style);
  }

  const favoriteKeys = () =>
    new Set(
      (settings.favoriteChannels || [])
        .map((favorite) => favorite && favorite.path)
        .filter((path) => typeof path === 'string')
        .map(normalizePath)
    );

  function channelPath(entry) {
    const link = entry.querySelector('a#endpoint') || entry.querySelector('a');
    const href = link && link.getAttribute('href');
    return href && href.startsWith('/') ? href.replace(/\/+$/, '') : null;
  }

  function channelName(entry) {
    const link = entry.querySelector('a#endpoint');
    const title = link && link.getAttribute('title');
    if (title) return title;
    const label = entry.querySelector('.title');
    return (label && label.textContent.trim()) || channelPath(entry) || '';
  }

  // 登録チャンネルの各行に★を1つだけ置き、お気に入りの状態を反映する
  function markFavorites(entries) {
    const favorites = favoriteKeys();
    for (const entry of entries) {
      const path = channelPath(entry);
      if (!path) continue;
      let star = entry.querySelector(`:scope > .${FAV_CLASS}`);
      if (!star) {
        star = document.createElement('span');
        star.className = FAV_CLASS;
        entry.appendChild(star);
      }
      if (star.getAttribute(FAV_ATTR) !== path) star.setAttribute(FAV_ATTR, path);
      const on = favorites.has(normalizePath(path));
      const mark = on ? '★' : '☆';
      if (star.textContent !== mark) star.textContent = mark;
      star.classList.toggle(FAV_ON_CLASS, on);
      const title = on ? FAV_TITLE_ON : FAV_TITLE_OFF;
      if (star.getAttribute('title') !== title) star.setAttribute('title', title);
    }
  }

  // 追加は末尾。お気に入り同士の優先順位は配列の並び(上が優先)で、並べ替えはポップアップ側
  function toggleFavorite(star) {
    const path = star.getAttribute(FAV_ATTR);
    const entry = star.closest('ytd-guide-entry-renderer');
    if (!path || !entry) return;
    const key = normalizePath(path);
    const list = (settings.favoriteChannels || []).filter(
      (favorite) => favorite && typeof favorite.path === 'string'
    );
    const at = list.findIndex((favorite) => normalizePath(favorite.path) === key);
    const next = at >= 0 ? list.filter((_, i) => i !== at) : [...list, { path, name: channelName(entry) }];
    settings.favoriteChannels = next; // 保存の往復を待たずに見た目を更新する
    markFavorites([entry]);
    chrome.storage.local.set({ favoriteChannels: next });
  }

  function findFavStar(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node === document) break;
      if (node instanceof Element && node.classList && node.classList.contains(FAV_CLASS)) {
        return node;
      }
    }
    return null;
  }

  // ★はリンク(a#endpoint)の外にあるので本来 SPA 遷移は起きないが、行のどこを押しても
  // チャンネルへ飛ぶ作りに変わる可能性があるため、ライブアイコンと同じく capture で止める
  function onFavStarClick(event) {
    if (event.type === 'click' && event.button !== 0) return;
    const star = findFavStar(event);
    if (!star) return;
    event.preventDefault();
    event.stopPropagation();
    if (settings) toggleFavorite(star);
  }

  function findLiveLink(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node === document) break;
      if (node instanceof Element && node.hasAttribute(LIVE_LINK_ATTR)) return node;
    }
    return null;
  }

  // サイドバーのリンクは YouTube の SPA ルーターが href ではなく Polymer 側のエンドポイントを
  // 見て遷移するため、href を書き換えるだけでは効かない(実測: /@x/live を入れてもチャンネル
  // ページへ飛ぶ)。capture フェーズで止めれば確実に横取りできる(これも実測)。/live 側は
  // SPA のルーティング情報を持たない URL なので、遷移は通常のページ読み込みになる。
  // 横取りするのはアイコンの上だけ。チャンネル名をクリックしたときは従来どおり
  // チャンネルページへ飛ぶ。
  function onLiveBadgeClick(event) {
    if (event.type === 'click' && event.button !== 0) return;
    if (event.type === 'auxclick' && event.button !== 1) return;

    const badge = findLiveLink(event);
    const url = badge && badge.getAttribute(LIVE_LINK_ATTR);
    if (!url) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey) {
      window.open(url, '_blank', 'noopener');
    } else {
      location.assign(url);
    }
  }

  const shownEntries = (items) =>
    Array.from(items.querySelectorAll(':scope > ytd-guide-entry-renderer'));
  const hiddenEntries = (collapsible) =>
    collapsible
      ? Array.from(collapsible.querySelectorAll('#expandable-items > ytd-guide-entry-renderer'))
      : [];

  const expand = (collapsible) => collapsible.querySelector('#expander-item a')?.click();
  const collapse = (collapsible) => collapsible.querySelector('#collapser-item a')?.click();

  // 展開→折りたたみの一瞬を画面に見せないための一時 CSS。#expanded を隠すだけだと
  // 「もっと見る」行まで消えてサイドバーの高さが縮んでしまうので、展開中も
  // #expander-item を出したままにして見た目の高さを固定する。
  function silentStyle(on) {
    const existing = document.getElementById(SILENT_STYLE_ID);
    if (on) {
      if (existing) return;
      const style = document.createElement('style');
      style.id = SILENT_STYLE_ID;
      style.textContent =
        'ytd-guide-collapsible-entry-renderer[expanded] #expanded{display:none!important;}' +
        'ytd-guide-collapsible-entry-renderer[expanded] #expander-item{display:block!important;}';
      (document.head || document.documentElement).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }

  // 「もっと見る」の中身は展開するまで DOM に生成されない。並べ替えの対象にするには
  // 一度だけ展開して実体化させる必要がある(展開済みのエントリは畳んでも DOM に残る)。
  async function prepareList(collapsible) {
    const expanded = collapsible.hasAttribute('expanded');

    if (settings.expandSubscriptions) {
      if (!expanded) {
        expand(collapsible);
        await wait(SETTLE_MS);
      }
      return;
    }

    if (!settings.sortLiveChannels) return;
    if (expanded || hiddenEntries(collapsible).length) return; // 実体化済み
    if (Date.now() - lastExpandAt < EXPAND_COOLDOWN_MS) return; // 失敗時の連打防止

    lastExpandAt = Date.now();
    silentStyle(true);
    try {
      expand(collapsible);
      await wait(SETTLE_MS);
      collapse(collapsible);
      await wait(SETTLE_MS);
    } finally {
      silentStyle(false);
    }
    // 注意: 「移動してから畳む」順だと YouTube 側の再描画で並べ替えが巻き戻される。
    // 必ず畳んでから移動すること(この順序は実機で確認済み)。
  }

  function snapshotValid(items, collapsible) {
    if (!snapshot || snapshot.items !== items || !snapshot.header.isConnected) return false;
    const known = new Set([...snapshot.shown, ...snapshot.hidden]);
    for (const entry of known) {
      if (!entry.isConnected) return false; // ガイドが作り直された
    }
    // 知らないエントリが増えていたら(登録の追加・遅延描画)取り直す
    return [...shownEntries(items), ...hiddenEntries(collapsible)].every((entry) =>
      known.has(entry)
    );
  }

  function takeSnapshot(items, collapsible) {
    snapshot = {
      items,
      collapsible,
      header: items.firstElementChild, // 「登録チャンネル」見出し行
      shown: shownEntries(items),
      hidden: hiddenEntries(collapsible),
    };
  }

  // desired の順に並ぶよう、ずれている要素だけを動かす。
  // 既に正しい並びなら DOM を一切触らないので、MutationObserver と無限ループしない。
  function reconcile(parent, desired) {
    let prev = null;
    for (const el of desired) {
      const expected = prev ? prev.nextElementSibling : parent.firstElementChild;
      if (expected !== el) {
        if (prev) prev.after(el);
        else parent.prepend(el);
      }
      prev = el;
    }
  }

  function layout() {
    const { items, collapsible, header, shown, hidden } = snapshot;
    const all = [...shown, ...hidden]; // YouTube 本来の並び順
    const liveEntries = all.filter(isLive);

    // リンク化は並べ替えとは独立した機能なので、sortLiveChannels の ON/OFF とは無関係に効かせる
    liveLinkStyle(settings.liveChannelDirectLink);
    markLiveLinks(all, new Set(settings.liveChannelDirectLink ? liveEntries : []));

    // お気に入りの★は他の機能と独立(監視が OFF でも登録はできる)
    favStyle();
    markFavorites(all);

    // 上から「ライブ中のお気に入り」「ライブ中の残り」「配信外のお気に入り」の順に引き上げる。
    // お気に入り同士はポップアップの一覧の順(上が優先)、ライブ中の残りは YouTube 本来の並び順
    const top = settings.sortLiveChannels ? liftedOrder(all, liveEntries) : [];
    const lifted = new Set(top);

    // 表示部 = 見出し + 引き上げた分 + 元から表示されていた残り + 「もっと見る」
    const desired = [header, ...top, ...shown.filter((entry) => !lifted.has(entry))];
    if (collapsible) desired.push(collapsible);
    reconcile(items, desired);

    // 引き上げた分を除いた残りを「もっと見る」の中へ戻す
    // (配信が終わったチャンネルはここで元の位置に戻る)
    const expandable = collapsible && collapsible.querySelector('#expandable-items');
    if (expandable) reconcile(expandable, hidden.filter((entry) => !lifted.has(entry)));
  }

  function liftedOrder(all, liveEntries) {
    const rank = new Map();
    (settings.favoriteChannels || []).forEach((favorite, index) => {
      if (!favorite || typeof favorite.path !== 'string') return;
      const key = normalizePath(favorite.path);
      if (!rank.has(key)) rank.set(key, index);
    });
    const rankOf = (entry) => {
      const path = channelPath(entry);
      return path ? rank.get(normalizePath(path)) : undefined;
    };
    const isFavorite = (entry) => rankOf(entry) !== undefined;
    const byRank = (a, b) => rankOf(a) - rankOf(b);
    const live = new Set(liveEntries);
    return [
      ...liveEntries.filter(isFavorite).sort(byRank),
      ...liveEntries.filter((entry) => !isFavorite(entry)),
      ...all.filter((entry) => !live.has(entry) && isFavorite(entry)).sort(byRank),
    ];
  }

  async function apply() {
    if (!settings || applying) return;
    const section = getSection();
    if (!section) return;
    const items = section.querySelector('#items');
    if (!items) return;
    const collapsible = items.querySelector(':scope > ytd-guide-collapsible-entry-renderer');

    applying = true;
    try {
      if (collapsible) await prepareList(collapsible);
      if (!snapshotValid(items, collapsible)) takeSnapshot(items, collapsible);
      layout();
    } finally {
      applying = false;
    }
    observe(items);
  }

  // ライブ配信の開始/終了、YouTube 側のガイド再描画に追従する
  function observe(items) {
    if (observedItems === items) return;
    observedItems = items;
    new MutationObserver(() => {
      if (applying) return;
      clearTimeout(reapplyTimer);
      reapplyTimer = setTimeout(apply, REAPPLY_DEBOUNCE_MS);
    }).observe(items, { childList: true, subtree: true });
  }

  // 「登録チャンネルを常に展開」を OFF にしたときは畳む。畳むと YouTube が一覧を組み直して
  // 並べ替えも巻き戻るので、そのあと apply() で並べ直す。
  async function collapseNow() {
    const section = getSection();
    const collapsible = section?.querySelector('#items > ytd-guide-collapsible-entry-renderer');
    if (!collapsible || !collapsible.hasAttribute('expanded')) return;
    applying = true;
    try {
      collapse(collapsible);
      await wait(SETTLE_MS);
    } finally {
      applying = false;
    }
  }

  // ===== 配信が終わったら次のライブへ移動する =====
  // 終了の検知はプレーヤーの状態を見る必要があるため live-inject.js(MAIN world)が行い、
  // ylh:live-ended で知らせてくる。遷移先は「登録チャンネル一覧で一番上にあるライブ中の
  // チャンネル」(今の DOM の並び)。sortLiveChannels が ON ならライブ中のお気に入りが先頭に
  // 来るのでそれが優先され、OFF なら YouTube 本来の並び順で最初のライブになる。
  // URL はライブアイコンのリンクと同じ <channel>/live 形式。
  //
  // 注意(実測): watch ページにはガイド(ytd-guide-renderer)がそもそも存在せず、ミニガイドしか
  // 無い。ハンバーガーで開いた瞬間に YouTube が /youtubei/v1/guide を投げて一覧を作るので、
  // 何時間開きっぱなしのページでも「開いた時点の最新のライブ状況」が手に入る。開け閉めが
  // 画面に見えないよう、その間だけドロワーを透明にしておく(表示を消すと一覧が組まれない
  // 可能性があるので display ではなく opacity)。
  function hopStyle(on) {
    const existing = document.getElementById(HOP_STYLE_ID);
    if (on) {
      if (existing) return;
      const style = document.createElement('style');
      style.id = HOP_STYLE_ID;
      style.textContent =
        'tp-yt-app-drawer#guide{opacity:0!important;pointer-events:none!important;}';
      (document.head || document.documentElement).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }

  const guideButton = () => document.querySelector(GUIDE_BUTTON_SELECTOR);

  function closeGuide() {
    const drawer = document.querySelector('tp-yt-app-drawer#guide');
    if (drawer && drawer.hasAttribute('opened')) guideButton()?.click();
  }

  async function waitFor(fn, timeoutMs = HOP_TIMEOUT_MS) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const value = fn();
      if (value) return value;
      if (Date.now() >= until) return null;
      await wait(HOP_POLL_MS);
    }
  }

  const normalizePath = (href) => {
    let path = href;
    try {
      path = decodeURIComponent(href);
    } catch (e) {
      // 壊れたエスケープはそのまま比較する
    }
    return path.replace(/\/+$/, '').toLowerCase();
  };

  // いま見ている配信のチャンネル。終了直後のガイドにはまだライブ表示が残っていることが
  // あるので、同じチャンネルへ飛び直さないために除外する
  function currentChannelPath() {
    const match = location.pathname.match(/^\/(@[^/]+|(?:channel|c|user)\/[^/]+)\/live\/?$/);
    if (match) return normalizePath('/' + match[1]);
    const owner = document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint[href]');
    const href = owner && owner.getAttribute('href');
    return href && href.startsWith('/') ? normalizePath(href) : null;
  }

  // innertube の呼び出し(fav-watch.js と同じ作り。clientVersion は ytcfg が MAIN world にしか
  // 無いので、ページの HTML から1回だけ拾う)
  let cachedClientVersion = null;
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

  // サイドバーのライブ表示は YouTube のガイドの応答(badges.liveBroadcasting)そのままだが、
  // これが実際の配信と食い違うことがある(実測 2026-11-01: 配信中・公開・登録フィードにも
  // 「ライブ」と出ているチャンネルが、ログイン状態で取り直したガイドでも liveBroadcasting:false)。
  // そこでライブ表示の無いチャンネルは <channel>/live の解決先(fav-watch.js と同じ方法)で確かめ、
  // 待機所・プレミア公開・終わったばかりの配信を除くため /player で isLive も見る。
  async function isLiveByResolve(path) {
    try {
      const resolved = await innertube('navigation/resolve_url', {
        url: `https://www.youtube.com${path}/live`,
      });
      const videoId = resolved?.endpoint?.watchEndpoint?.videoId;
      if (!videoId) return false;
      const details = (await innertube('player', { videoId }))?.videoDetails;
      return !!details && details.isLive === true && details.isUpcoming !== true;
    } catch (e) {
      return false;
    }
  }

  // 登録チャンネル一覧の並び順で、最初にライブ中のチャンネルの /live URL を返す。
  // サイドバーでライブ表示のものはそのまま信じ、それより上にある表示の無いチャンネルだけを
  // まとめて問い合わせる(上から LIVE_CHECK_BATCH 件ずつ。並び順を崩さないよう、各まとまりの
  // 中で一番上のライブを採る)。配信終了後の移動でだけ使う(サイドバーの並べ替え等では使わない)。
  async function nextLiveUrl() {
    const section = getSection();
    const items = section && section.querySelector('#items');
    if (!items) return null;
    const collapsible = items.querySelector(':scope > ytd-guide-collapsible-entry-renderer');
    const current = currentChannelPath();

    let pending = []; // ライブ表示は無いが、問い合わせれば配信中かもしれないチャンネル
    const firstConfirmed = async () => {
      const results = await Promise.all(pending.map((c) => isLiveByResolve(c.path)));
      const index = results.indexOf(true);
      const found = index === -1 ? null : pending[index].url;
      pending = [];
      return found;
    };

    for (const entry of [...shownEntries(items), ...hiddenEntries(collapsible)]) {
      const url = liveUrl(entry);
      if (!url) continue;
      const path = url.replace(/\/live$/, '');
      if (path.startsWith('/feed/')) continue; // 一覧の見出しや「すべての登録チャンネル」
      if (current && normalizePath(path) === current) continue;
      if (isLive(entry)) {
        return (pending.length && (await firstConfirmed())) || url;
      }
      pending.push({ path, url });
      if (pending.length >= LIVE_CHECK_BATCH) {
        const found = await firstConfirmed();
        if (found) return found;
      }
    }
    return pending.length ? firstConfirmed() : null;
  }

  // 移動先に指定できるのは youtube.com のページだけ(拡張が任意のURLへ飛ばないようにする)。
  // 「/channel/<ID>/live」のようなパスだけの入力も受け付ける。
  function normalizeTargetUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    let url;
    try {
      url = new URL(value.trim(), 'https://www.youtube.com');
    } catch (e) {
      return null;
    }
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'www.youtube.com' && url.hostname !== 'youtube.com') return null;
    return url.href;
  }

  function setPickMark(channels, fallbackUrl = null) {
    try {
      sessionStorage.setItem(PICK_KEY, String(Date.now()));
      if (channels) sessionStorage.setItem(PICK_CHANNELS_KEY, JSON.stringify(channels));
      else sessionStorage.removeItem(PICK_CHANNELS_KEY);
      if (fallbackUrl) sessionStorage.setItem(PICK_FALLBACK_KEY, fallbackUrl);
      else sessionStorage.removeItem(PICK_FALLBACK_KEY);
    } catch (e) {
      // プライベートモード等で sessionStorage が使えない場合は、遷移だけして諦める
    }
  }

  function takePickMark() {
    try {
      const value = sessionStorage.getItem(PICK_KEY);
      const channels = sessionStorage.getItem(PICK_CHANNELS_KEY);
      const fallback = sessionStorage.getItem(PICK_FALLBACK_KEY);
      sessionStorage.removeItem(PICK_KEY);
      sessionStorage.removeItem(PICK_CHANNELS_KEY);
      sessionStorage.removeItem(PICK_FALLBACK_KEY);
      const parsed = channels ? JSON.parse(channels) : [];
      return {
        at: Number(value) || 0,
        channels: Array.isArray(parsed) ? parsed.filter((path) => typeof path === 'string') : [],
        // 書いたのはこの拡張だけだが、念のため youtube.com 以外へは飛ばない
        fallback: normalizeTargetUrl(fallback),
      };
    } catch (e) {
      return { at: 0, channels: [], fallback: null };
    }
  }

  // 登録チャンネル一覧(「もっと見る」の中身を含む)のチャンネルのパス
  function subscriptionPaths(items, collapsible) {
    return [...shownEntries(items), ...hiddenEntries(collapsible)]
      .map(channelPath)
      .filter((path) => path && path !== '/feed/subscriptions')
      .map(normalizePath);
  }

  // 一覧アイテムの「今の視聴者数」。読めなければ null
  function viewerCount(item) {
    for (const span of item.querySelectorAll('span')) {
      const match = span.textContent.match(VIEWERS_RE);
      if (!match) continue;
      const base = Number(match[1].replace(/,/g, ''));
      const unit = match[2] ? VIEWERS_UNIT[match[2].toLowerCase()] : 1;
      return Number.isFinite(base) ? Math.round(base * unit) : null;
    }
    return null;
  }

  function itemChannelPath(item) {
    const link = item.querySelector(CHANNEL_LINK_SELECTOR);
    const href = link && link.getAttribute('href');
    return href ? normalizePath(href) : null;
  }

  // 画面に出ているかどうか。他の拡張機能(YT Quick Filter など)が display:none で隠した
  // 項目を見分けるのに使う。checkVisibility() は祖先側の display:none も見るので、
  // どの階層で隠されていても判定できる
  // (Chrome 111+。manifest の minimum_chrome_version と同じなので必ず使える)。
  // 逆に言うと分かるのは display:none だけで、他のやり方(要素ごと削除する、透明にする等)で
  // 隠す拡張には効かない(相手の実装を当てにいかず、拾えるものだけを拾うという割り切り)。
  function isDisplayed(el) {
    if (typeof el.checkVisibility === 'function') return el.checkVisibility();
    return el.getClientRects().length > 0;
  }

  // 視聴者数の上限を満たすか。登録チャンネル(お気に入りを含む)は人数に関係なく通す。
  // 人数が読めないアイテムは、上限以下だと確かめられないので選ばない
  function withinViewerLimit(node, filter) {
    if (filter.maxViewers == null) return true;
    const item = node.closest(LIST_ITEM_SELECTOR) || node;
    const channel = itemChannelPath(item);
    if (channel && filter.exempt.has(channel)) return true;
    const count = viewerCount(item);
    return count !== null && count <= filter.maxViewers;
  }

  // 一覧ページで最初にライブバッジが付いているアイテムの動画URLを拾う。
  // アイテムの要素名はページ種別ごとに違う(ytd-grid-video-renderer / ytd-rich-item-renderer …)ので、
  // バッジから親をたどって最初に見つかる動画リンクを採る。
  // filter = { skipHidden, maxViewers(絞り込まないなら null), exempt(上限から外すチャンネル) }
  function firstLiveVideoHref(filter) {
    for (const badge of document.querySelectorAll(LIVE_BADGE_SELECTOR)) {
      if (filter.skipHidden && !isDisplayed(badge)) continue; // 隠されている項目は飛ばす
      let node = badge;
      for (let depth = 0; depth < 8 && node; depth++) {
        const link = node.querySelector && node.querySelector(VIDEO_LINK_SELECTOR);
        if (link) {
          if (!withinViewerLimit(node, filter)) break; // 人数が多すぎる → 次のアイテムへ
          return link.getAttribute('href');
        }
        node = node.parentElement;
      }
    }
    return null;
  }

  function waitForVisible() {
    if (document.visibilityState === 'visible') return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = (value) => {
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', onChange);
        resolve(value);
      };
      const onChange = () => {
        if (document.visibilityState === 'visible') done(true);
      };
      const timer = setTimeout(() => done(false), PICK_VISIBLE_WAIT_MS);
      document.addEventListener('visibilitychange', onChange);
    });
  }

  // フィルタ拡張は遅れて項目を隠すので、選んだ直後に先頭が消えることがある。
  // 同じ結果が2回続く(=落ち着いた)まで待ってから決める。上限を過ぎたら最後の結果を使う。
  async function settledLiveHref(href, filter) {
    const until = Date.now() + PICK_SETTLE_MAX_MS;
    let last = href;
    for (;;) {
      await wait(PICK_SETTLE_STEP_MS);
      const next = firstLiveVideoHref(filter);
      if (!next) return null; // 見えているライブが無くなった
      if (next === last) return next;
      last = next;
      if (Date.now() >= until) return next;
    }
  }

  // 指定ページに着いたあとの処理。ページが一覧なら先頭のライブへ、指定先がそのまま配信ページ
  // (チャンネルの /live など)ならそこで終わり。ライブが見つからなければ、目印に次の行き先
  // (登録チャンネルの先頭のライブ)があればそこへ、無ければ留まる。
  // 目印は最初に消すので、二度は走らない。
  async function pickLiveOnThisPage() {
    const mark = takePickMark();
    if (!mark.at || Date.now() - mark.at > PICK_MAX_AGE_MS) return;

    // 目印だけで動ける処理だが、「非表示の配信を除外」と「視聴者数で絞り込む」の設定は参照する
    await settingsLoaded;
    const skipHidden = settings.autoNextLiveSkipHidden;
    const filter = {
      skipHidden,
      maxViewers: settings.autoNextLiveLimitViewers ? settings.autoNextLiveMaxViewers : null,
      // 移動前に読んだ登録チャンネル + お気に入り。このページにサイドバーが出ていればそれも足す
      exempt: new Set([...mark.channels, ...favoriteKeys()]),
    };
    const section = getSection();
    const items = section && section.querySelector('#items');
    if (items) {
      const collapsible = items.querySelector(':scope > ytd-guide-collapsible-entry-renderer');
      for (const path of subscriptionPaths(items, collapsible)) filter.exempt.add(path);
    }

    const pick = () => {
      // 「表示されている」プレーヤーがあるときだけ配信ページ扱い。一覧ページにも非表示の
      // #movie_player が遅れて作られることがある(実測: トピックチャンネルの配信一覧で
      // 着地の約1.1秒後。display:none の ytd-watch-flexy の中)ので、存在だけでは判定できない
      const player = document.getElementById('movie_player');
      if (player && isDisplayed(player)) return { href: null }; // 配信ページそのもの
      const href = firstLiveVideoHref(filter);
      return href ? { href } : null;
    };

    let result = await waitFor(pick, PICK_TIMEOUT_MS);
    if (!result && document.visibilityState === 'hidden') {
      // 登録チャンネルフィードのような遅延描画のページは、裏タブだと中身が一切作られない(実測)。
      // タブが表に来たらもう一度だけ探す。
      if (await waitForVisible()) result = await waitFor(pick, PICK_TIMEOUT_MS);
    }
    if (result && !result.href) return; // 指定先がそのまま配信ページだった
    let href = result && result.href;
    // 除外しない設定なら、見つけた先頭をそのまま開く
    if (href && skipHidden) href = await settledLiveHref(href, filter);
    // 候補が無い・全部隠された → 次の行き先があればそこへ、無ければその場に留まる
    if (!href) href = mark.fallback;
    if (href) location.assign(href);
  }

  async function hopToNextLive() {
    if (!settings || !settings.autoNextLive || hopping) return;

    // 「指定したページ」は、移動先にそれを選んだときか「もう一方も探す」がONのときに使う。
    // そのページへ飛んでから先頭のライブを開く(2段階になるのは、一覧の中身は実際に
    // 開かないと分からないため)。URL 未設定・youtube.com 以外なら指定ページは使わない
    const pageFirst = settings.autoNextLiveTarget === 'page';
    const fallback = settings.autoNextLiveFallback;
    const pageUrl =
      pageFirst || fallback ? normalizeTargetUrl(settings.autoNextLiveUrl) : null;
    if (pageFirst && !pageUrl && !fallback) return;
    const goPage = (channels, fallbackUrl) => {
      setPickMark(channels, fallbackUrl);
      location.assign(pageUrl);
    };
    // 指定ページだけを探すなら、登録チャンネル一覧を読まずにそのまま飛ぶ。視聴者数で
    // 絞り込むとき(登録チャンネルを上限から外すため)と、指定ページに無ければ登録チャンネルを
    // 探すときは、飛ぶ前に登録チャンネル一覧を読んでおく
    if (pageUrl && pageFirst && !fallback && !settings.autoNextLiveLimitViewers) {
      goPage(null);
      return;
    }

    hopping = true;
    let openedByUs = false;
    let expandedByUs = null;
    let navigating = false;
    try {
      if (!getSection()) {
        const button = guideButton();
        if (!button) {
          if (pageUrl) {
            // 一覧が読めなくても指定ページへは移動する(お気に入りだけは上限から外れる)
            navigating = true;
            goPage(null);
          }
          return;
        }
        hopStyle(true);
        button.click();
        openedByUs = true;
      }

      // 見出しだけ先に出ることがあるので、エントリが並ぶまで待つ
      const items = await waitFor(() => {
        const section = getSection();
        return section?.querySelector('#items > ytd-guide-entry-renderer')
          ? section.querySelector('#items')
          : null;
      });
      if (!items) {
        if (pageUrl) {
          navigating = true;
          goPage(null);
        }
        return;
      }

      // 「もっと見る」の中身は展開するまで DOM に生成されない。ここだけはサイドバーの
      // 並べ替え・自動展開が OFF でも実体化させる(隠れているライブを候補から漏らさないため)
      const collapsible = items.querySelector(':scope > ytd-guide-collapsible-entry-renderer');
      const needsExpand =
        collapsible && !collapsible.hasAttribute('expanded') && !hiddenEntries(collapsible).length;
      if (needsExpand) {
        expand(collapsible);
        expandedByUs = collapsible;
        await wait(SETTLE_MS);
      }

      // 並べ替えの最中に読むと並びが途中の状態になりうるので、終わるのを待ってから選ぶ
      await waitFor(() => !applying);

      // 指定ページだけを探す(視聴者数の絞り込みのために一覧を読んだだけ)なら、ここは問い合わせない
      const url = pageFirst && !fallback ? null : await nextLiveUrl();
      if (pageUrl && (pageFirst || !url)) {
        // 指定ページが先なら、そこにライブが無かったときのために登録チャンネルの先頭を渡しておく
        navigating = true;
        goPage(subscriptionPaths(items, collapsible), pageFirst && fallback ? url : null);
        return;
      }
      if (!url) return; // ライブ中のチャンネルが無ければ何もしない(今のページに留まる)

      navigating = true;
      location.assign(url);
    } finally {
      // 遷移するときはページが切り替わるまでドロワーを隠したままにする(一瞬見えるのを防ぐ)
      if (!navigating) {
        if (expandedByUs && !settings.expandSubscriptions) collapse(expandedByUs);
        if (openedByUs) closeGuide();
        hopStyle(false);
      }
      hopping = false;
    }
  }

  function start() {
    const startedAt = Date.now();
    (function tick() {
      // 見出しだけ先に描画される場合があるので、エントリが出揃うまで待つ
      const section = getSection();
      if (section && section.querySelector('#items > ytd-guide-entry-renderer')) {
        apply();
        return;
      }
      // ガイドはサイドバーを開くまで描画されないことがあるため、諦めずに緩く待ち続ける
      const interval = Date.now() - startedAt < FAST_POLL_LIMIT_MS ? FAST_POLL_MS : SLOW_POLL_MS;
      setTimeout(tick, interval);
    })();
  }

  const maxViewersOf = (value) =>
    Number.isInteger(value) && value >= 1 ? value : DEFAULT_MAX_VIEWERS;

  chrome.storage.local.get(
    [
      'sortLiveChannels',
      'expandSubscriptions',
      'liveChannelDirectLink',
      'autoNextLive',
      'autoNextLiveTarget',
      'autoNextLiveUrl',
      'autoNextLiveFallback',
      'autoNextLiveSkipHidden',
      'autoNextLiveLimitViewers',
      'autoNextLiveMaxViewers',
      'favoriteChannels',
    ],
    (stored) => {
      settings = {
        sortLiveChannels:
          typeof stored.sortLiveChannels === 'boolean' ? stored.sortLiveChannels : true,
        expandSubscriptions:
          typeof stored.expandSubscriptions === 'boolean' ? stored.expandSubscriptions : true,
        liveChannelDirectLink:
          typeof stored.liveChannelDirectLink === 'boolean' ? stored.liveChannelDirectLink : true,
        // 自動で別の配信へ移動する機能なので、これだけは既定 OFF
        autoNextLive: stored.autoNextLive === true,
        autoNextLiveTarget: stored.autoNextLiveTarget === 'page' ? 'page' : 'subscriptions',
        autoNextLiveUrl: typeof stored.autoNextLiveUrl === 'string' ? stored.autoNextLiveUrl : '',
        // 行き先が増える設定なので既定 OFF
        autoNextLiveFallback: stored.autoNextLiveFallback === true,
        autoNextLiveSkipHidden: stored.autoNextLiveSkipHidden !== false,
        // 行き先が減る設定なので既定 OFF
        autoNextLiveLimitViewers: stored.autoNextLiveLimitViewers === true,
        autoNextLiveMaxViewers: maxViewersOf(stored.autoNextLiveMaxViewers),
        // お気に入りチャンネル(並び順 = 優先順位)。監視は fav-watch.js 側
        favoriteChannels: Array.isArray(stored.favoriteChannels) ? stored.favoriteChannels : [],
      };
      settingsArrived();
      start();
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !settings) return;
    // 遷移機能は一覧の見た目に影響しないので、値を控えるだけで並べ直しは不要
    if (changes.autoNextLive) settings.autoNextLive = changes.autoNextLive.newValue === true;
    if (changes.autoNextLiveTarget) {
      settings.autoNextLiveTarget =
        changes.autoNextLiveTarget.newValue === 'page' ? 'page' : 'subscriptions';
    }
    if (changes.autoNextLiveUrl) {
      const url = changes.autoNextLiveUrl.newValue;
      settings.autoNextLiveUrl = typeof url === 'string' ? url : '';
    }
    if (changes.autoNextLiveFallback) {
      settings.autoNextLiveFallback = changes.autoNextLiveFallback.newValue === true;
    }
    if (changes.autoNextLiveSkipHidden) {
      settings.autoNextLiveSkipHidden = changes.autoNextLiveSkipHidden.newValue !== false;
    }
    if (changes.autoNextLiveLimitViewers) {
      settings.autoNextLiveLimitViewers = changes.autoNextLiveLimitViewers.newValue === true;
    }
    if (changes.autoNextLiveMaxViewers) {
      settings.autoNextLiveMaxViewers = maxViewersOf(changes.autoNextLiveMaxViewers.newValue);
    }
    // ポップアップ側で並べ替え・削除されたときは★の表示を追従させる。
    // お気に入りは並び順にも効くので、このあと並べ直す
    if (changes.favoriteChannels) {
      const next = changes.favoriteChannels.newValue;
      settings.favoriteChannels = Array.isArray(next) ? next : [];
      const section = getSection();
      if (section) markFavorites([...section.querySelectorAll('ytd-guide-entry-renderer')]);
    }

    if (
      !changes.favoriteChannels &&
      !changes.sortLiveChannels &&
      !changes.expandSubscriptions &&
      !changes.liveChannelDirectLink
    ) {
      return;
    }

    let collapseRequested = false;
    if (changes.sortLiveChannels) {
      settings.sortLiveChannels = changes.sortLiveChannels.newValue !== false;
    }
    if (changes.expandSubscriptions) {
      settings.expandSubscriptions = changes.expandSubscriptions.newValue !== false;
      collapseRequested = !settings.expandSubscriptions;
    }
    if (changes.liveChannelDirectLink) {
      settings.liveChannelDirectLink = changes.liveChannelDirectLink.newValue !== false;
    }

    (async () => {
      if (collapseRequested) await collapseNow();
      apply();
    })();
  });

  // 設定の到着を待たずに付けてよい。リンク先を持つ要素が無ければ何も起きない
  document.addEventListener('click', onLiveBadgeClick, true);
  document.addEventListener('auxclick', onLiveBadgeClick, true);
  document.addEventListener('click', onFavStarClick, true);

  // 見ている配信が終わったという合図(live-inject.js から)
  document.addEventListener('ylh:live-ended', () => hopToNextLive());

  // 「指定したページ」へ飛ばされて来た直後かどうかを最初に確認する(設定の到着を待つ必要はない。
  // 目印を残せるのはこの拡張だけなので、残っていれば自分が飛ばしたということ)
  pickLiveOnThisPage();

  // ガイドは SPA 遷移をまたいで使い回されるため通常は再実行不要だが、
  // YouTube 側で作り直された場合の保険として遷移時にも確認する
  document.addEventListener('yt-navigate-finish', () => apply());
})();
