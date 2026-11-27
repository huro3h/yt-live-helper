(function () {
  'use strict';

  if (window.top !== window) return;

  const MARK_ID = 'ylh-mute-mark';
  const STYLE_ID = `${MARK_ID}-style`;
  const CHECK_MS = 1000;
  const BOTTOM_CLASS = 'ylh-bottom';

  let enabled = null;
  let muted = false;
  let bottom = false;
  let timer = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${MARK_ID}{position:absolute;top:12px;right:12px;z-index:1000;width:50px;height:50px;
  display:flex;align-items:center;justify-content:center;border-radius:5px;
  background:rgba(255,59,59,.28);pointer-events:none}
#${MARK_ID}.${BOTTOM_CLASS}{top:auto;bottom:64px}
#${MARK_ID} svg{width:36px;height:36px;fill:none;stroke:#ff3b3b;stroke-width:1.5;
  stroke-linecap:round;stroke-linejoin:round;opacity:.8;filter:drop-shadow(0 0 1px rgba(0,0,0,.7))}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function createMark() {
    const mark = document.createElement('div');
    mark.id = MARK_ID;
    mark.title = 'このタブはミュートされています';
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const el = (tag, attrs) => {
      const node = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      return node;
    };
    const SLASH = 'M3 3 21 21';
    const mask = el('mask', { id: `${MARK_ID}-cut`, maskUnits: 'userSpaceOnUse', x: '0', y: '0', width: '24', height: '24' });
    mask.append(
      el('rect', { x: '0', y: '0', width: '24', height: '24', fill: '#fff', stroke: 'none' }),
      el('path', { d: SLASH, stroke: '#000', 'stroke-width': '4.5' })
    );
    const speaker = el('g', { mask: `url(#${MARK_ID}-cut)` });
    for (const d of ['M11 5 6 9H2v6h4l5 4V5z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14']) {
      speaker.appendChild(el('path', { d }));
    }
    svg.append(el('defs', {}), speaker, el('path', { d: SLASH }));
    svg.firstChild.appendChild(mask);
    mark.appendChild(svg);
    return mark;
  }

  function render() {
    const existing = document.getElementById(MARK_ID);
    const player = document.getElementById('movie_player');
    if (!enabled || !muted || !player) {
      existing?.remove();
      return;
    }
    ensureStyle();
    if (existing && existing.parentElement === player) {
      existing.classList.toggle(BOTTOM_CLASS, bottom);
      return;
    }
    existing?.remove();
    const mark = createMark();
    mark.classList.toggle(BOTTOM_CLASS, bottom);
    player.appendChild(mark);
  }

  function update() {
    render();
    const want = enabled && muted;
    if (want && !timer) timer = setInterval(render, CHECK_MS);
    if (!want && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function askState() {
    try {
      chrome.runtime.sendMessage({ type: 'mute-mark:get' }, (response) => {
        if (chrome.runtime.lastError || !response) return;
        muted = response.muted === true;
        update();
      });
    } catch (e) {
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'mute-mark:state') return false;
    muted = message.muted === true;
    update();
    return false;
  });

  chrome.storage.local.get(['tabMuteMark', 'tabMuteMarkPosition'], (stored) => {
    enabled = stored.tabMuteMark !== false;
    bottom = stored.tabMuteMarkPosition === 'bottom';
    askState();
    update();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes.tabMuteMark && !changes.tabMuteMarkPosition)) return;
    if (changes.tabMuteMark) enabled = changes.tabMuteMark.newValue !== false;
    if (changes.tabMuteMarkPosition) bottom = changes.tabMuteMarkPosition.newValue === 'bottom';
    update();
  });

  document.addEventListener('yt-navigate-finish', () => update());
})();
