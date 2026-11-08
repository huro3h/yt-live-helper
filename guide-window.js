// guide-window.js — 「サイドバーを別ウィンドウで開く」で開いたウィンドウの中の処理
//   そのウィンドウは本物の YouTube のページ(/feed/subscriptions)で、サイドバー以外を CSS で隠し、
//   サイドバーを開いたままにする。中身が本物のサイドバーなので、guide.js の並べ替え・★・
//   ライブアイコンのリンクはそのまま効く。
//   - 一覧で押したリンクはこのウィンドウでは開かず、見ているタブで開く(background.js 経由)
//   - 1分ごとに一覧を最新にする(実際の取り直しは MAIN world の guide-window-inject.js)
//   どのウィンドウが一覧用かは background.js が知っているので、読み込むたびに聞く。
//   一覧用でない普通の YouTube のタブでは、「今見ているタブ」として background.js に知らせ、
//   ヘッダーのハンバーガーの右に「一覧を別ウィンドウで開く」ボタンを置く(ポップアップでON/OFF)。
// ISOLATED world(chrome.runtime が要るため)。youtube.com 全体・トップフレームのみ。

(function () {
  'use strict';

  if (window.top !== window) return;

  const WINDOW_ATTR = 'data-ylh-guide-window';
  const STYLE_ID = 'ylh-guide-window';
  const REFRESH_EVENT = 'ylh:guide-refresh';
  // ガイドのライブ表示は YouTube が最初に1回取ったきりで更新されない(実測)ので、こちらで取り直す
  const REFRESH_MS = 60000;
  const KEEP_OPEN_MS = 1000;
  // ハンバーガーを押してから開くまでに少しかかるので、その間に押し直して閉じてしまわないようにする
  const REOPEN_COOLDOWN_MS = 3000;
  const FAV_CLASS = 'ylh-fav-star'; // guide.js の★。押したときの処理は guide.js に任せる
  const LIVE_LINK_ATTR = 'data-ylh-live-link'; // guide.js が付けるライブアイコンのリンク先
  const GUIDE_BUTTON_SELECTOR = '#guide-button button, #guide-button';
  const OPEN_BUTTON_ID = 'ylh-guide-window-button';
  const OPEN_BUTTON_STYLE_ID = 'ylh-guide-window-button-style';
  const OPEN_BUTTON_TITLE = '登録チャンネルを別ウィンドウで表示／閉じる';
  // ヘッダーは SPA 遷移をまたいで使い回されるが、作り直されることもあるので、無くなっていたら置き直す
  const OPEN_BUTTON_CHECK_MS = 1000;

  // サイドバー以外を隠し、開いたサイドバーをウィンドウの幅いっぱいにする。
  // guide.js の「動画ページでサイドバーを透過」(#ylh-guide-glass)は重ねて開いたサイドバーに効くので、
  // ここでは打ち消す。向こうのセレクタより強くするため、属性セレクタを2回重ねている
  const scope = `:root[${WINDOW_ATTR}][${WINDOW_ATTR}]`;
  const drawer = `${scope} tp-yt-app-drawer#guide`;
  // 登録チャンネルの欄(guide.js と同じく見出し行のリンク先で見分ける)。ログイン中でこの欄があるときだけ、
  // ホーム・マイページなど他の欄とフッターを隠して一覧を上に詰める
  const subs =
    ':has(#items > ytd-guide-collapsible-section-entry-renderer a[href="/feed/subscriptions"])';
  const CSS =
    `${scope} #masthead-container,${scope} ytd-page-manager,${scope} ytd-mini-guide-renderer,` +
    `${drawer} #header,${drawer} #scrim{display:none!important;}` +
    `${drawer}${subs} ytd-guide-section-renderer:not(${subs}),` +
    `${drawer}${subs} ytd-guide-signin-promo-renderer,` +
    `${drawer}${subs} ytd-guide-renderer #footer{display:none!important;}` +
    `${drawer} #contentContainer{width:100vw!important;transform:none!important;` +
    'background-color:var(--yt-spec-base-background)!important;}' +
    `${drawer} #guide-content{background-color:transparent!important;text-shadow:none!important;}` +
    `${drawer} ytd-guide-renderer{width:100%!important;}`;

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  // 幅が狭いウィンドウでは、サイドバーは重ねて開く引き出し(閉じた状態)になる。
  // 開いていなければハンバーガーを押して開く(初回はこの操作で YouTube が一覧を取りに行く)
  let lastOpenAt = 0;
  function keepOpen() {
    const guide = document.querySelector('tp-yt-app-drawer#guide');
    if (guide && guide.hasAttribute('opened')) return;
    if (Date.now() - lastOpenAt < REOPEN_COOLDOWN_MS) return;
    const button = document.querySelector(GUIDE_BUTTON_SELECTOR);
    if (!button) return;
    lastOpenAt = Date.now();
    button.click();
  }

  // 押されたリンクの行き先。★は対象外(guide.js がお気に入りの登録/解除をする)。
  // ライブアイコンは guide.js が付けた /live の URL、それ以外はリンクの href
  function targetUrl(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (node.classList.contains(FAV_CLASS)) return null;
      const live = node.getAttribute(LIVE_LINK_ATTR);
      if (live) return live;
      if (node.tagName === 'A') {
        const href = node.getAttribute('href');
        return href && href !== '#' ? href : null; // 「もっと見る」などは href が無い
      }
    }
    return null;
  }

  // window の capture で受けるので、document で待っている guide.js のライブアイコンの処理や
  // YouTube の SPA 遷移より先に止められる
  function onClick(event) {
    if (event.type === 'click' && event.button !== 0) return;
    if (event.type === 'auxclick' && event.button !== 1) return;
    const href = targetUrl(event);
    if (!href) return;
    let url;
    try {
      url = new URL(href, location.origin);
    } catch (e) {
      return;
    }
    if (url.origin !== location.origin) return; // youtube.com の外へのリンクはそのまま
    event.preventDefault();
    event.stopPropagation();
    const inNewTab = event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey;
    chrome.runtime.sendMessage({ type: 'guide-window:open', url: url.href, inNewTab });
  }

  function startGuideWindow() {
    document.documentElement.setAttribute(WINDOW_ATTR, '');
    addStyle();
    window.addEventListener('click', onClick, true);
    window.addEventListener('auxclick', onClick, true);
    setInterval(keepOpen, KEEP_OPEN_MS);
    setInterval(() => document.dispatchEvent(new CustomEvent(REFRESH_EVENT)), REFRESH_MS);
  }

  // ===== 普通のタブ: ハンバーガーの右のボタン =====
  // 形は YouTube のヘッダーのアイコンボタン(40px の丸、ホバーで薄い背景)に合わせる。
  // アイコンは「左に細い一覧が付いたウィンドウ」。色は YouTube の CSS 変数に頼らずグレーを直に指定する
  // (変数だとダークテーマで暗い色になり、見えなかった)。html[dark] がダークテーマの目印
  const ICON_SVG =
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">' +
    '<path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm2 0v14h4V5H5z' +
    'm6 0v14h8V5h-8zM6 7h2v2H6V7zm0 4h2v2H6v-2zm0 4h2v2H6v-2z"/></svg>';

  function openButtonStyle() {
    if (document.getElementById(OPEN_BUTTON_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = OPEN_BUTTON_STYLE_ID;
    style.textContent =
      `#${OPEN_BUTTON_ID}{display:inline-flex;align-items:center;justify-content:center;` +
      'flex:none;width:40px;height:40px;margin-left:4px;padding:0;border:none;border-radius:50%;' +
      'background:transparent;color:#606060;cursor:pointer;}' +
      `#${OPEN_BUTTON_ID}:hover{background:rgba(0,0,0,0.08);color:#0f0f0f;}` +
      `#${OPEN_BUTTON_ID}:active{background:rgba(0,0,0,0.14);}` +
      `html[dark] #${OPEN_BUTTON_ID}{color:#aaaaaa;}` +
      `html[dark] #${OPEN_BUTTON_ID}:hover{background:rgba(255,255,255,0.12);color:#f1f1f1;}` +
      `html[dark] #${OPEN_BUTTON_ID}:active{background:rgba(255,255,255,0.2);}`;
    (document.head || document.documentElement).appendChild(style);
  }

  // 押すたびに開く・閉じるを切り替える(開いていれば閉じる)。開くときは、このタブのウィンドウの
  // 左側に付けて開く。画面の左端までの余白を測るのに、
  // ページから見える画面の範囲(screen.avail*)を一緒に渡す(background.js からは画面の大きさが分からない)
  function onOpenButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    chrome.runtime.sendMessage({
      type: 'guide-window:toggle',
      screen: {
        left: screen.availLeft,
        top: screen.availTop,
        width: screen.availWidth,
        height: screen.availHeight,
      },
    });
  }

  function placeOpenButton() {
    const existing = document.getElementById(OPEN_BUTTON_ID);
    const anchor = document.querySelector('ytd-masthead #start #guide-button');
    if (!anchor) return;
    if (existing && existing.previousElementSibling === anchor) return;
    const button = existing || document.createElement('button');
    if (!existing) {
      button.id = OPEN_BUTTON_ID;
      button.type = 'button';
      button.title = OPEN_BUTTON_TITLE;
      button.setAttribute('aria-label', OPEN_BUTTON_TITLE);
      button.innerHTML = ICON_SVG;
      button.addEventListener('click', onOpenButtonClick);
    }
    openButtonStyle();
    anchor.after(button);
  }

  let openButtonTimer = null;
  function showOpenButton(on) {
    clearInterval(openButtonTimer);
    openButtonTimer = null;
    if (on) {
      placeOpenButton();
      openButtonTimer = setInterval(placeOpenButton, OPEN_BUTTON_CHECK_MS);
    } else {
      document.getElementById(OPEN_BUTTON_ID)?.remove();
    }
  }

  // 普通のタブ: 表に出たら「今見ているタブ」として知らせる(一覧で押したチャンネルはこのタブで開く)
  function reportViewer() {
    if (document.visibilityState !== 'visible') return;
    chrome.runtime.sendMessage({ type: 'guide-window:viewer' }).catch(() => {});
  }

  function startViewer() {
    reportViewer();
    document.addEventListener('visibilitychange', reportViewer);
    window.addEventListener('focus', reportViewer);
    // 既定 ON(popup.js と同じ)
    chrome.storage.local.get('guideWindowButton', (stored) => {
      showOpenButton(stored.guideWindowButton !== false);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.guideWindowButton) {
        showOpenButton(changes.guideWindowButton.newValue !== false);
      }
    });
  }

  chrome.runtime
    .sendMessage({ type: 'guide-window:whoami' })
    .then((response) => (response && response.isGuideWindow ? startGuideWindow() : startViewer()))
    .catch(() => {
      // 拡張の更新直後などで background に届かないときは、普通のタブとして何もしない
    });
})();
