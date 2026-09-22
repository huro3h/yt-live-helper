// guide.js — 左サイドバー(ガイド)の「登録チャンネル」欄の並べ替え
//   (1) ライブ配信中のチャンネルを一覧の先頭へ移動
//   (2) 「もっと見る」を自動で展開したままにする
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

  const FAST_POLL_MS = 300;
  const FAST_POLL_LIMIT_MS = 15000;
  const SLOW_POLL_MS = 3000; // ガイドは初回表示まで描画されない場合があるので緩く待ち続ける
  const SETTLE_MS = 400;
  const REAPPLY_DEBOUNCE_MS = 500;
  const EXPAND_COOLDOWN_MS = 10000;

  // storage から設定が届くまでは何もしない(2.6.1 の教訓: 既定値で先走ると OFF 設定を無視する)
  let settings = null;
  let applying = false;
  let lastExpandAt = 0;
  let snapshot = null; // 並べ替える前の「YouTube 本来の並び順」
  let reapplyTimer = null;
  let observedItems = null;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function getSection() {
    const header = document.querySelector(SUB_HEADER_SELECTOR);
    return header ? header.closest('ytd-guide-section-renderer') : null;
  }

  // ライブ判定: ライブ中のエントリだけ .guide-entry-badge の中に赤いライブアイコン(svg)が
  // 描画される。未視聴を示す青い丸(#newness-dot)とは別物で、要素自体は全エントリに存在し
  // CSS で display:none にされているだけなので「バッジ要素の有無」では判定できない
  // (2.6.1 の .ytp-live-badge と同じ罠)。aria-label の文言は言語依存なので使わない。
  const isLive = (entry) => !!entry.querySelector('.guide-entry-badge svg');

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
    const live = settings.sortLiveChannels ? all.filter(isLive) : [];
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

  chrome.storage.local.get(['sortLiveChannels', 'expandSubscriptions'], (stored) => {
    settings = {
      sortLiveChannels:
        typeof stored.sortLiveChannels === 'boolean' ? stored.sortLiveChannels : true,
      expandSubscriptions:
        typeof stored.expandSubscriptions === 'boolean' ? stored.expandSubscriptions : true,
    };
    start();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !settings) return;
    if (!changes.sortLiveChannels && !changes.expandSubscriptions) return;

    let collapseRequested = false;
    if (changes.sortLiveChannels) {
      settings.sortLiveChannels = changes.sortLiveChannels.newValue !== false;
    }
    if (changes.expandSubscriptions) {
      settings.expandSubscriptions = changes.expandSubscriptions.newValue !== false;
      collapseRequested = !settings.expandSubscriptions;
    }

    (async () => {
      if (collapseRequested) await collapseNow();
      apply();
    })();
  });

  // ガイドは SPA 遷移をまたいで使い回されるため通常は再実行不要だが、
  // YouTube 側で作り直された場合の保険として遷移時にも確認する
  document.addEventListener('yt-navigate-finish', () => apply());
})();
