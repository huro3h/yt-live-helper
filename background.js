const ON_COLOR = '#ff3d6b';
const OFF_COLOR = '#6b6b8a';

function showBadge(on) {
  chrome.action.setBadgeText({ text: '★' });
  chrome.action.setBadgeBackgroundColor({ color: on ? ON_COLOR : OFF_COLOR });
  chrome.action.setBadgeTextColor({ color: '#ffffff' });
  chrome.action.setTitle({
    title: `YouTube Live Helper（配信が始まったら移動: ${on ? 'ON' : 'OFF'}）`,
  });
}

async function refreshBadge() {
  const { watchFavorites } = await chrome.storage.local.get('watchFavorites');
  showBadge(watchFavorites === true);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-watch-favorites') return;
  const { watchFavorites } = await chrome.storage.local.get('watchFavorites');
  await chrome.storage.local.set({ watchFavorites: watchFavorites !== true });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.watchFavorites) {
    showBadge(changes.watchFavorites.newValue === true);
  }
});

chrome.runtime.onStartup.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);

const GUIDE_WINDOW_KEY = 'guideWindowId';
const VIEWER_TAB_KEY = 'viewerTabId';
const GUIDE_BOUNDS_KEY = 'guideWindowBounds';
const SHIFTED_WINDOW_KEY = 'guideShiftedWindowId';
const AUTO_OPENED_KEY = 'guideAutoOpened';
const GUIDE_WINDOW_URL = 'https://www.youtube.com/feed/subscriptions';
const DEFAULT_GUIDE_BOUNDS = { width: 300, height: 800 };

const ALONE_KEY = 'guideAloneSince';
const ALONE_CLOSE_MS = 15000;

let guideQueue = Promise.resolve();
function inGuideQueue(task) {
  const run = guideQueue.then(task);
  guideQueue = run.catch(() => {});
  return run;
}

let creatingGuideWindow = null;

async function guideWindowId() {
  if (creatingGuideWindow) await creatingGuideWindow;
  const { [GUIDE_WINDOW_KEY]: id } = await chrome.storage.session.get(GUIDE_WINDOW_KEY);
  return typeof id === 'number' ? id : null;
}

async function showGuideWindow(mainWindowId, screen, { focus = true } = {}) {
  const { [GUIDE_BOUNDS_KEY]: saved } = await chrome.storage.local.get(GUIDE_BOUNDS_KEY);
  const savedBounds = saved && typeof saved === 'object' ? saved : {};
  const width = Number.isInteger(savedBounds.width) ? savedBounds.width : DEFAULT_GUIDE_BOUNDS.width;

  let docked = null;
  let mainBounds = null;
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

  await chrome.storage.session.set({ [AUTO_OPENED_KEY]: true });
  suppressFollowUntil = Date.now() + SUPPRESS_FOLLOW_MS;
  try {
    if (mainBounds) {
      await chrome.windows.update(main.id, mainBounds);
      await chrome.storage.session.set({ [SHIFTED_WINDOW_KEY]: main.id });
    }
    const id = await guideWindowId();
    if (id !== null) {
      try {
        await chrome.windows.update(id, { ...(docked || {}), ...(focus ? { focused: true } : {}) });
        return;
      } catch (e) {
      }
    }
    creatingGuideWindow = (async () => {
      const win = await chrome.windows.create({
        url: GUIDE_WINDOW_URL,
        type: 'popup',
        focused: focus,
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
    await rememberNormalWindows();
  }
}

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

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.mutedInfo) return;
  chrome.tabs
    .sendMessage(tabId, { type: 'mute-mark:state', muted: changeInfo.mutedInfo.muted === true })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  if (message.type === 'mute-mark:get') {
    sendResponse({ muted: sender.tab?.mutedInfo?.muted === true });
    return false;
  }
  if (message.type === 'guide-window:toggle') {
    inGuideQueue(() => toggleGuideWindow(sender.tab?.windowId, message.screen)).catch(() => {});
    return false;
  }
  if (message.type === 'guide-window:auto-open') {
    if (typeof sender.tab?.windowId === 'number') autoOpenGuideWindow(sender.tab.windowId, message.screen);
    return false;
  }
  if (message.type === 'guide-window:whoami') {
    inGuideQueue(() => identifyGuideWindow(sender))
      .then((isGuideWindow) => sendResponse({ isGuideWindow }))
      .catch(() => sendResponse({ isGuideWindow: false }));
    return true;
  }
  if (message.type === 'guide-window:alive') {
    inGuideQueue(() => checkAliveGuideWindow(sender)).catch(() => {});
    return false;
  }
  if (message.type === 'guide-window:viewer') {
    if (typeof sender.tab?.id === 'number') {
      chrome.storage.session.set({ [VIEWER_TAB_KEY]: sender.tab.id });
    }
    return false;
  }
  if (message.type === 'guide-window:open') {
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

let autoOpenQueue = Promise.resolve();

function autoOpenGuideWindow(mainWindowId, screen) {
  autoOpenQueue = autoOpenQueue
    .then(() => inGuideQueue(async () => {
      const { [AUTO_OPENED_KEY]: done } = await chrome.storage.session.get(AUTO_OPENED_KEY);
      if (done) return;
      const { guideWindowAutoOpen } = await chrome.storage.local.get('guideWindowAutoOpen');
      if (guideWindowAutoOpen !== true) return;
      let main = null;
      try {
        main = await chrome.windows.get(mainWindowId);
      } catch (e) {
        main = null;
      }
      if (!main || main.type !== 'normal') return;
      await showGuideWindow(mainWindowId, screen, { focus: false });
    }))
    .catch(() => {});
}

async function identifyGuideWindow(sender) {
  const windowId = sender.tab?.windowId;
  if (typeof windowId !== 'number') return false;
  const id = await guideWindowId();
  if (id === windowId) return true;
  if (!(await isLostGuideWindow(sender))) return false;
  if (id !== null) {
    let known = null;
    try {
      known = await chrome.windows.get(id);
    } catch (e) {
      known = null;
    }
    if (known) {
      await removeWindow(windowId);
      return false;
    }
  }
  await chrome.storage.session.set({ [GUIDE_WINDOW_KEY]: windowId, [AUTO_OPENED_KEY]: true });
  return true;
}

async function isLostGuideWindow(sender) {
  let path = '';
  try {
    const url = new URL(sender.url || sender.tab?.url || '');
    path = url.hostname === 'www.youtube.com' ? url.pathname : '';
  } catch (e) {
    path = '';
  }
  if (!path.startsWith(new URL(GUIDE_WINDOW_URL).pathname)) return false;
  try {
    const win = await chrome.windows.get(sender.tab.windowId, { populate: true });
    return win.type === 'popup' && win.tabs.length === 1;
  } catch (e) {
    return false;
  }
}

async function removeWindow(windowId) {
  try {
    await chrome.windows.remove(windowId);
  } catch (e) {
  }
}

async function checkAliveGuideWindow(sender) {
  const windowId = sender.tab?.windowId;
  if (!(await identifyGuideWindow(sender))) return;
  const normals = await chrome.windows.getAll({ windowTypes: ['normal'] });
  if (normals.length > 0) {
    await chrome.storage.session.remove(ALONE_KEY);
    return;
  }
  const { [ALONE_KEY]: since } = await chrome.storage.session.get(ALONE_KEY);
  if (typeof since !== 'number') {
    await chrome.storage.session.set({ [ALONE_KEY]: Date.now() });
    return;
  }
  if (Date.now() - since < ALONE_CLOSE_MS) return;
  await chrome.storage.session.remove([ALONE_KEY, AUTO_OPENED_KEY]);
  await removeWindow(windowId);
}

async function toggleGuideWindow(mainWindowId, screen) {
  const id = await guideWindowId();
  let guide = null;
  if (id !== null) {
    try {
      guide = await chrome.windows.get(id);
    } catch (e) {
      guide = null;
    }
  }
  if (guide) await closeGuideWindow(guide);
  else await showGuideWindow(mainWindowId, screen);
}

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
  const id = await guideWindowId();
  if (id === null) return;
  if (id === windowId) {
    await chrome.storage.session.remove([GUIDE_WINDOW_KEY, SHIFTED_WINDOW_KEY, ALONE_KEY]);
    return;
  }
  const normals = await chrome.windows.getAll({ windowTypes: ['normal'] });
  if (normals.length > 0) return;
  await chrome.storage.session.remove(AUTO_OPENED_KEY);
  try {
    await chrome.windows.remove(id);
  } catch (e) {
  }
});

const WINDOW_BOUNDS_KEY = 'windowBounds';
const DOCK_TOLERANCE = 8;
const SUPPRESS_FOLLOW_MS = 1000;
let suppressFollowUntil = 0;

const boundsOf = ({ left, top, width, height }) => ({ left, top, width, height });
const near = (a, b) => Math.abs(a - b) <= DOCK_TOLERANCE;
const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

function dockSide(g, m) {
  const vertical = overlaps(g.top, g.top + g.height, m.top, m.top + m.height);
  const horizontal = overlaps(g.left, g.left + g.width, m.left, m.left + m.width);
  if (vertical && near(g.left, m.left + m.width)) return 'right';
  if (vertical && near(g.left + g.width, m.left)) return 'left';
  if (horizontal && near(g.top, m.top + m.height)) return 'bottom';
  if (horizontal && near(g.top + g.height, m.top)) return 'top';
  return null;
}

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
  await rememberNormalWindows();
});
