// background.js — 「配信が始まったら移動」(watchFavorites) のショートカット切り替えとバッジ表示
//   よく切り替える設定なので、ポップアップを開かずにキーボードで ON/OFF できるようにし、
//   ツールバーのアイコンに ★ のバッジ(ON = 赤 / OFF = グレー)で状態を出す。
//   監視そのものは fav-watch.js が storage.onChanged で拾うので、ここは storage を書くだけ。
//   もう1つ、「サイドバーを別ウィンドウで開く」のウィンドウとタブの管理もここで行う(下の方)。
const ON_COLOR = '#ff3d6b'; // ポップアップのトグル(--accent)と同じ赤
const OFF_COLOR = '#6b6b8a'; // ポップアップの --text-muted と同じグレー

function showBadge(on) {
  chrome.action.setBadgeText({ text: '★' });
  chrome.action.setBadgeBackgroundColor({ color: on ? ON_COLOR : OFF_COLOR });
  chrome.action.setBadgeTextColor({ color: '#ffffff' });
  chrome.action.setTitle({
    title: `YouTube Live Helper（配信が始まったら移動: ${on ? 'ON' : 'OFF'}）`,
  });
}

// 既定 OFF(fav-watch.js / popup.js と同じ)
async function refreshBadge() {
  const { watchFavorites } = await chrome.storage.local.get('watchFavorites');
  showBadge(watchFavorites === true);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-watch-favorites') return;
  const { watchFavorites } = await chrome.storage.local.get('watchFavorites');
  // バッジは下の onChanged で更新される(ポップアップから切り替えたときと同じ経路)
  await chrome.storage.local.set({ watchFavorites: watchFavorites !== true });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.watchFavorites) {
    showBadge(changes.watchFavorites.newValue === true);
  }
});

// バッジはブラウザの再起動で消えるので、起動時とインストール/更新時に描き直す
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);

// ===== サイドバーを別ウィンドウで開く =====
// 登録チャンネル一覧だけを小さなポップアップウィンドウに出しておく。中身は本物の YouTube のページで、
// サイドバー以外を隠すのと一覧の更新は guide-window.js / guide-window-inject.js が行う。
// ここは「どのウィンドウがそれか」と「一覧で押したチャンネルをどのタブで開くか」を持つだけ。
// ウィンドウとタブの ID はブラウザを閉じると無効になるので storage.session に置く
// (Service Worker は止まることがあるので、変数だけには持たない)。
const GUIDE_WINDOW_KEY = 'guideWindowId';
const VIEWER_TAB_KEY = 'viewerTabId'; // 最後に表に出ていた YouTube のタブ(= 一覧のクリックで移動させるタブ)
const GUIDE_BOUNDS_KEY = 'guideWindowBounds'; // 位置と大きさは次に開くときのために storage.local に残す
// 一覧ウィンドウを左に付けて開くときに、左端を詰めたウィンドウ(閉じるときに戻すため)
const SHIFTED_WINDOW_KEY = 'guideShiftedWindowId';
const GUIDE_WINDOW_URL = 'https://www.youtube.com/feed/subscriptions';
const DEFAULT_GUIDE_BOUNDS = { width: 300, height: 800 };

// ウィンドウを作ってから ID を保存し終えるまでの間に、そのウィンドウのページが「自分はどれか」を
// 聞いてくることがある。保存が終わるまで答えを待たせる
let creatingGuideWindow = null;

async function guideWindowId() {
  if (creatingGuideWindow) await creatingGuideWindow;
  const { [GUIDE_WINDOW_KEY]: id } = await chrome.storage.session.get(GUIDE_WINDOW_KEY);
  return typeof id === 'number' ? id : null;
}

// 一覧ウィンドウを、ボタンを押したタブのウィンドウ(main)の左側に、高さを揃えて付けて開く。
// 左に一覧ウィンドウぶんの余白が無ければ(画面いっぱいのウィンドウなど)、main の右端は動かさずに
// 左端を一覧ウィンドウの幅だけ右へ詰める。高さを揃えてあるので、そのあとは main に付いて動く。
// 全画面のウィンドウや、main が分からないときは、前回の位置で開く(開いていれば前に出すだけ)。
// screen はボタンのあるページから見た画面の範囲({ left, top, width, height })
async function showGuideWindow(mainWindowId, screen) {
  const { [GUIDE_BOUNDS_KEY]: saved } = await chrome.storage.local.get(GUIDE_BOUNDS_KEY);
  const savedBounds = saved && typeof saved === 'object' ? saved : {};
  const width = Number.isInteger(savedBounds.width) ? savedBounds.width : DEFAULT_GUIDE_BOUNDS.width;

  let docked = null; // 付けて開くときの一覧ウィンドウの位置
  let mainBounds = null; // main を詰めるときの main の新しい位置
  let main = null;
  if (typeof mainWindowId === 'number') {
    try {
      main = await chrome.windows.get(mainWindowId);
    } catch (e) {
      main = null;
    }
  }
  if (main && main.type === 'normal' && (main.state === 'normal' || main.state === 'maximized')) {
    const screenLeft = Number.isFinite(screen?.left) ? screen.left : 0;
    if (main.left - width >= screenLeft) {
      docked = { left: main.left - width, top: main.top, width, height: main.height };
    } else {
      const left = screenLeft + width;
      mainBounds = {
        state: 'normal',
        left,
        top: main.top,
        width: Math.max(main.left + main.width - left, width),
        height: main.height,
      };
      docked = { left: screenLeft, top: main.top, width, height: main.height };
    }
  }

  // 自分で動かしている間は「付いているウィンドウに付いて動く」処理を止める
  suppressFollowUntil = Date.now() + SUPPRESS_FOLLOW_MS;
  try {
    if (mainBounds) {
      await chrome.windows.update(main.id, mainBounds);
      await chrome.storage.session.set({ [SHIFTED_WINDOW_KEY]: main.id });
    }
    const id = await guideWindowId();
    if (id !== null) {
      try {
        await chrome.windows.update(id, { ...(docked || {}), focused: true });
        return;
      } catch (e) {
        // 閉じられていた → 作り直す
      }
    }
    creatingGuideWindow = (async () => {
      const win = await chrome.windows.create({
        url: GUIDE_WINDOW_URL,
        type: 'popup',
        ...DEFAULT_GUIDE_BOUNDS,
        ...(docked || savedBounds),
      });
      await chrome.storage.session.set({ [GUIDE_WINDOW_KEY]: win.id });
    })();
    try {
      await creatingGuideWindow;
    } finally {
      creatingGuideWindow = null;
    }
  } finally {
    suppressFollowUntil = Date.now() + SUPPRESS_FOLLOW_MS;
    await rememberNormalWindows(); // 付けた相手の今の位置を、次に動いたときの基準にする
  }
}

// 一覧で押したチャンネルを開く。普通のクリックは見ているタブをそのまま移動させ、
// 中クリック・修飾キー付きはその隣に裏で新しいタブを開く。
// 見ているタブが無ければ(閉じた・まだ YouTube を開いていない)、通常のウィンドウに新しいタブで開く
async function openFromGuide(url, inNewTab) {
  const { [VIEWER_TAB_KEY]: tabId } = await chrome.storage.session.get(VIEWER_TAB_KEY);
  let viewer = null;
  if (typeof tabId === 'number') {
    try {
      viewer = await chrome.tabs.get(tabId);
    } catch (e) {
      viewer = null;
    }
  }
  if (viewer && !inNewTab) {
    await chrome.tabs.update(viewer.id, { url, active: true });
    return;
  }
  if (viewer) {
    await chrome.tabs.create({ url, active: false, windowId: viewer.windowId, index: viewer.index + 1 });
    return;
  }
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    const tab = await chrome.tabs.create({ url, windowId: win.id });
    if (!inNewTab) await chrome.storage.session.set({ [VIEWER_TAB_KEY]: tab.id });
  } catch (e) {
    await chrome.windows.create({ url });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  if (message.type === 'guide-window:toggle') {
    toggleGuideWindow(sender.tab?.windowId, message.screen);
    return false;
  }
  if (message.type === 'guide-window:whoami') {
    guideWindowId().then((id) => {
      sendResponse({ isGuideWindow: id !== null && sender.tab?.windowId === id });
    });
    return true; // sendResponse を非同期で呼ぶ
  }
  if (message.type === 'guide-window:viewer') {
    if (typeof sender.tab?.id === 'number') {
      chrome.storage.session.set({ [VIEWER_TAB_KEY]: sender.tab.id });
    }
    return false;
  }
  if (message.type === 'guide-window:open') {
    // 開くのは youtube.com のページだけ(guide-window.js でも確かめているが、念のためここでも見る)
    let url = null;
    try {
      url = new URL(message.url);
    } catch (e) {
      url = null;
    }
    if (url && url.protocol === 'https:' && url.hostname === 'www.youtube.com') {
      openFromGuide(url.href, message.inNewTab === true);
    }
    return false;
  }
  return false;
});

// ヘッダーのボタンは押すたびに開く・閉じるを切り替える
async function toggleGuideWindow(mainWindowId, screen) {
  const id = await guideWindowId();
  let guide = null;
  if (id !== null) {
    try {
      guide = await chrome.windows.get(id);
    } catch (e) {
      guide = null; // 閉じられていた
    }
  }
  if (guide) await closeGuideWindow(guide);
  else await showGuideWindow(mainWindowId, screen);
}

// 閉じる。開くときに左端を詰めたウィンドウがあり、一覧ウィンドウがまだその左に付いていれば、
// 詰めた分だけ左端を戻す(右端はそのまま)。手で離していたら、そのウィンドウには触らない
async function closeGuideWindow(guide) {
  const { [SHIFTED_WINDOW_KEY]: shiftedId } = await chrome.storage.session.get(SHIFTED_WINDOW_KEY);
  let shifted = null;
  if (typeof shiftedId === 'number') {
    try {
      shifted = await chrome.windows.get(shiftedId);
    } catch (e) {
      shifted = null;
    }
  }
  suppressFollowUntil = Date.now() + SUPPRESS_FOLLOW_MS;
  await chrome.windows.remove(guide.id);
  if (shifted && shifted.state === 'normal' && dockSide(boundsOf(guide), boundsOf(shifted)) === 'left') {
    await chrome.windows.update(shifted.id, {
      left: guide.left,
      width: shifted.width + (shifted.left - guide.left),
    });
  }
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  if ((await guideWindowId()) === windowId) {
    await chrome.storage.session.remove([GUIDE_WINDOW_KEY, SHIFTED_WINDOW_KEY]);
  }
});

// ===== 一覧ウィンドウを通常のウィンドウにくっつけておく =====
// 一覧ウィンドウを通常のウィンドウの上下左右の辺にぴったり付けておくと、通常のウィンドウを
// 動かしたり大きさを変えたりしたときに、付けた辺に沿って一緒に動く。
// 「付いていたか」は動く前の位置で判断する必要があるので、通常のウィンドウの最後の位置を
// storage.session に控えておく(一覧ウィンドウを開いた・動かしたときと、通常のウィンドウが動いたとき)。
// onBoundsChanged はドラッグの途中では来ない(離したときに1回)ので、追従もドラッグを離したときになる。
const WINDOW_BOUNDS_KEY = 'windowBounds';
const DOCK_TOLERANCE = 8; // px。手で合わせたときのずれと、OS のスナップの誤差を許す
// 一覧ウィンドウを付けて開くとき、自分で main を動かした分の onBoundsChanged は少し遅れて届く。
// それに反応して一覧ウィンドウを動かし直さないよう、その間は追従を止める
const SUPPRESS_FOLLOW_MS = 1000;
let suppressFollowUntil = 0;

const boundsOf = ({ left, top, width, height }) => ({ left, top, width, height });
const near = (a, b) => Math.abs(a - b) <= DOCK_TOLERANCE;
const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

// 一覧ウィンドウ g が通常のウィンドウ m のどの辺に付いているか(付いていなければ null)
function dockSide(g, m) {
  const vertical = overlaps(g.top, g.top + g.height, m.top, m.top + m.height);
  const horizontal = overlaps(g.left, g.left + g.width, m.left, m.left + m.width);
  if (vertical && near(g.left, m.left + m.width)) return 'right';
  if (vertical && near(g.left + g.width, m.left)) return 'left';
  if (horizontal && near(g.top, m.top + m.height)) return 'bottom';
  if (horizontal && near(g.top + g.height, m.top)) return 'top';
  return null;
}

// 通常のウィンドウが prev → next に動いたときの、一覧ウィンドウの新しい位置。
// 付いた辺はそのまま保ち、辺に沿った向きはずれ幅を保つ。高さ(上下に付けたときは幅)が
// ぴったり揃っていたら、大きさを変えたときも揃えたままにする
function followedBounds(g, prev, next, side) {
  if (side === 'left' || side === 'right') {
    const aligned = near(g.top, prev.top) && near(g.height, prev.height);
    return {
      left: side === 'right' ? next.left + next.width : next.left - g.width,
      top: aligned ? next.top : g.top + (next.top - prev.top),
      ...(aligned ? { height: next.height } : {}),
    };
  }
  const aligned = near(g.left, prev.left) && near(g.width, prev.width);
  return {
    top: side === 'bottom' ? next.top + next.height : next.top - g.height,
    left: aligned ? next.left : g.left + (next.left - prev.left),
    ...(aligned ? { width: next.width } : {}),
  };
}

async function rememberNormalWindows() {
  const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const map = {};
  for (const w of wins) if (w.state === 'normal') map[w.id] = boundsOf(w);
  await chrome.storage.session.set({ [WINDOW_BOUNDS_KEY]: map });
}

async function followNormalWindow(win) {
  const { [WINDOW_BOUNDS_KEY]: map = {} } = await chrome.storage.session.get(WINDOW_BOUNDS_KEY);
  const prev = map[win.id];
  const next = boundsOf(win);
  // 最大化・全画面・最小化のときは追わない(戻したときの位置が基準になるよう、控えも更新しない)
  if (win.state !== 'normal') return;
  map[win.id] = next;
  await chrome.storage.session.set({ [WINDOW_BOUNDS_KEY]: map });
  if (Date.now() < suppressFollowUntil) return;
  if (!prev || (await guideWindowId()) === null) return;
  let guide;
  try {
    guide = await chrome.windows.get(await guideWindowId());
  } catch (e) {
    return;
  }
  const side = dockSide(boundsOf(guide), prev);
  if (!side) return;
  await chrome.windows.update(guide.id, followedBounds(boundsOf(guide), prev, next, side));
}

chrome.windows.onBoundsChanged.addListener(async (win) => {
  if ((await guideWindowId()) !== win.id) {
    if (win.type === 'normal') await followNormalWindow(win);
    return;
  }
  const { left, top, width, height } = win;
  await chrome.storage.local.set({ [GUIDE_BOUNDS_KEY]: { left, top, width, height } });
  // 一覧ウィンドウを手で付けた(離した)ときの、相手の位置を控え直す
  await rememberNormalWindows();
});
