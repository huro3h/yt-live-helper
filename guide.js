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
  const FAV_LIVE_CLASS = 'ylh-fav-live';
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

  // お気に入りの★は行の右端に置く。アバターの上に重ねると、ホバーしたときに出る位置が
  // ちょうどマウスカーソルの真下になり、矢印に隠れて見えなかった(実測してやり直した)。
  // ライブ中の行は右端をライブアイコンが使っているので、その分だけ左にずらす。
  // エントリは position:relative(実測)なので、そのまま絶対配置できる。
  function favStyle() {
    if (document.getElementById(FAV_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FAV_STYLE_ID;
    style.textContent =
      `ytd-guide-entry-renderer .${FAV_CLASS}` +
      '{position:absolute;right:2px;top:50%;margin-top:-10px;width:20px;height:20px;' +
      'display:none;align-items:center;justify-content:center;box-sizing:border-box;' +
      'border-radius:50%;background:rgba(0,0,0,0.75);color:#fff;font-size:12px;' +
      'line-height:1;cursor:pointer;z-index:1;}' +
      // アイコンが小さいのでクリック範囲だけ広げる(ライブアイコンと同じ手)
      `ytd-guide-entry-renderer .${FAV_CLASS}::after` +
      '{content:"";position:absolute;inset:-4px;border-radius:50%;}' +
      // ライブ中の行はライブアイコン(右端16px)を避ける(24pxだと実測で4px重なった)
      `ytd-guide-entry-renderer .${FAV_CLASS}.${FAV_LIVE_CLASS}{right:30px;}` +
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
      star.classList.toggle(FAV_LIVE_CLASS, isLive(entry));
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

    const live = settings.sortLiveChannels ? liveEntries : [];
    const lifted = new Set(live);

    // 表示部 = 見出し + ライブ中(本来の並び順) + 元から表示されていた残り + 「もっと見る」
    const desired = [header, ...live, ...shown.filter((entry) => !lifted.has(entry))];
    if (collapsible) desired.push(collapsible);
    reconcile(items, desired);

    // 引き上げた分を除いた残りを「もっと見る」の中へ戻す
    // (配信が終わったチャンネルはここで元の位置に戻る)
    const expandable = collapsible && collapsible.querySelector('#expandable-items');
    if (expandable) reconcile(expandable, hidden.filter((entry) => !lifted.has(entry)));
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
  // チャンネル」= YouTube 本来の並び順で最初のライブなので、sortLiveChannels の ON/OFF で
  // 結果は変わらない。URL はライブアイコンのリンクと同じ <channel>/live 形式。
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

  function nextLiveUrl() {
    const section = getSection();
    const items = section && section.querySelector('#items');
    if (!items) return null;
    const collapsible = items.querySelector(':scope > ytd-guide-collapsible-entry-renderer');
    const current = currentChannelPath();

    for (const entry of [...shownEntries(items), ...hiddenEntries(collapsible)]) {
      if (!isLive(entry)) continue;
      const url = liveUrl(entry);
      if (!url) continue;
      if (current && normalizePath(url.replace(/\/live$/, '')) === current) continue;
      return url;
    }
    return null;
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

  function setPickMark() {
    try {
      sessionStorage.setItem(PICK_KEY, String(Date.now()));
    } catch (e) {
      // プライベートモード等で sessionStorage が使えない場合は、遷移だけして諦める
    }
  }

  function takePickMark() {
    try {
      const value = sessionStorage.getItem(PICK_KEY);
      sessionStorage.removeItem(PICK_KEY);
      return Number(value) || 0;
    } catch (e) {
      return 0;
    }
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

  // 一覧ページで最初にライブバッジが付いているアイテムの動画URLを拾う。
  // アイテムの要素名はページ種別ごとに違う(ytd-grid-video-renderer / ytd-rich-item-renderer …)ので、
  // バッジから親をたどって最初に見つかる動画リンクを採る。
  function firstLiveVideoHref(skipHidden) {
    for (const badge of document.querySelectorAll(LIVE_BADGE_SELECTOR)) {
      if (skipHidden && !isDisplayed(badge)) continue; // 隠されている項目は飛ばす
      let node = badge;
      for (let depth = 0; depth < 8 && node; depth++) {
        const link = node.querySelector && node.querySelector(VIDEO_LINK_SELECTOR);
        if (link) return link.getAttribute('href');
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
  async function settledLiveHref(href) {
    const until = Date.now() + PICK_SETTLE_MAX_MS;
    let last = href;
    for (;;) {
      await wait(PICK_SETTLE_STEP_MS);
      const next = firstLiveVideoHref(true);
      if (!next) return null; // 見えているライブが無くなった
      if (next === last) return next;
      last = next;
      if (Date.now() >= until) return next;
    }
  }

  // 指定ページに着いたあとの処理。ページが一覧なら先頭のライブへ、指定先がそのまま配信ページ
  // (チャンネルの /live など)ならそこで終わり。目印は最初に消すので、二度は走らない。
  async function pickLiveOnThisPage() {
    const markedAt = takePickMark();
    if (!markedAt || Date.now() - markedAt > PICK_MAX_AGE_MS) return;

    // 目印だけで動ける処理だが、「非表示の配信を除外」の設定だけは参照する
    await settingsLoaded;
    const skipHidden = settings.autoNextLiveSkipHidden;

    const pick = () => {
      // 「表示されている」プレーヤーがあるときだけ配信ページ扱い。一覧ページにも非表示の
      // #movie_player が遅れて作られることがある(実測: トピックチャンネルの配信一覧で
      // 着地の約1.1秒後。display:none の ytd-watch-flexy の中)ので、存在だけでは判定できない
      const player = document.getElementById('movie_player');
      if (player && isDisplayed(player)) return { href: null }; // 配信ページそのもの
      const href = firstLiveVideoHref(skipHidden);
      return href ? { href } : null;
    };

    let result = await waitFor(pick, PICK_TIMEOUT_MS);
    if (!result && document.visibilityState === 'hidden') {
      // 登録チャンネルフィードのような遅延描画のページは、裏タブだと中身が一切作られない(実測)。
      // タブが表に来たらもう一度だけ探す。
      if (await waitForVisible()) result = await waitFor(pick, PICK_TIMEOUT_MS);
    }
    if (!result || !result.href) return;
    if (!skipHidden) {
      location.assign(result.href); // 除外しない設定なら、見つけた先頭をそのまま開く
      return;
    }

    const href = await settledLiveHref(result.href);
    if (!href) return; // 候補が全部隠された → 何もせずその場に留まる
    location.assign(href);
  }

  async function hopToNextLive() {
    if (!settings || !settings.autoNextLive || hopping) return;

    // 移動先が「指定したページ」のとき。そのページへ飛んでから先頭のライブを開く
    // (2段階になるのは、一覧の中身は実際に開かないと分からないため)
    if (settings.autoNextLiveTarget === 'page') {
      const url = normalizeTargetUrl(settings.autoNextLiveUrl);
      if (!url) return; // URL 未設定・youtube.com 以外なら何もしない
      setPickMark();
      location.assign(url);
      return;
    }

    hopping = true;
    let openedByUs = false;
    let expandedByUs = null;
    let navigating = false;
    try {
      if (!getSection()) {
        const button = guideButton();
        if (!button) return;
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
      if (!items) return;

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

      const url = nextLiveUrl();
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

  chrome.storage.local.get(
    [
      'sortLiveChannels',
      'expandSubscriptions',
      'liveChannelDirectLink',
      'autoNextLive',
      'autoNextLiveTarget',
      'autoNextLiveUrl',
      'autoNextLiveSkipHidden',
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
        autoNextLiveSkipHidden: stored.autoNextLiveSkipHidden !== false,
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
    if (changes.autoNextLiveSkipHidden) {
      settings.autoNextLiveSkipHidden = changes.autoNextLiveSkipHidden.newValue !== false;
    }
    // ポップアップ側で並べ替え・削除されたときは★の表示を追従させる
    if (changes.favoriteChannels) {
      const next = changes.favoriteChannels.newValue;
      settings.favoriteChannels = Array.isArray(next) ? next : [];
      const section = getSection();
      if (section) markFavorites([...section.querySelectorAll('ytd-guide-entry-renderer')]);
    }

    if (
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
