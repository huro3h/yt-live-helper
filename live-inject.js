(function () {
  'use strict';

  const MAX_WAIT_MS = 30000;
  const POLL_INTERVAL_MS = 300;
  const END_POLL_INTERVAL_MS = 1000;
  const PLAYING = 1;
  const ENDED = 0;
  const END_CONFIRM_TICKS = 2;

  let settings = null;
  let lastVideoId = null;
  let seekedVideoId = null;
  let runToken = 0;
  let sawLivePlayback = false;
  let endedTicks = 0;
  let endNotified = false;

  const CHANNEL_LIVE_RE = /^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)\/live\/?$/;

  function isWatchPage() {
    return (
      location.pathname === '/watch' ||
      location.pathname.startsWith('/live/') ||
      CHANNEL_LIVE_RE.test(location.pathname)
    );
  }

  function getVideoId() {
    if (location.pathname === '/watch') {
      return new URLSearchParams(location.search).get('v');
    }
    const match = location.pathname.match(/^\/live\/([\w-]{11})/);
    if (match) return match[1];
    return CHANNEL_LIVE_RE.test(location.pathname) ? location.pathname : null;
  }

  function isLivePlayback() {
    return !!document.querySelector('.ytp-time-display.ytp-live');
  }

  function isLiveStreamPage(player) {
    if (isLivePlayback()) return true;
    const response = call(player, 'getPlayerResponse');
    return !!(response && response.videoDetails && response.videoDetails.isLive);
  }

  function call(player, method) {
    try {
      return typeof player[method] === 'function' ? player[method]() : null;
    } catch (e) {
      return null;
    }
  }

  function seekToLiveHead(token) {
    const startedAt = Date.now();

    (function tick() {
      if (token !== runToken) return;

      const player = document.getElementById('movie_player');
      if (player && isLivePlayback() && call(player, 'getPlayerState') === PLAYING) {
        const state = call(player, 'getProgressState');
        if (state) {
          if (state.isAtLiveHead) return;
          call(player, 'seekToLiveHead');
        }
      }

      if (Date.now() - startedAt < MAX_WAIT_MS) {
        setTimeout(tick, POLL_INTERVAL_MS);
      }
    })();
  }

  function handleNavigation() {
    if (!settings || !isWatchPage()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    if (videoId !== lastVideoId) {
      lastVideoId = videoId;
      sawLivePlayback = false;
      endedTicks = 0;
      endNotified = false;
    }

    if (!settings.jumpToLive || videoId === seekedVideoId) return;
    seekedVideoId = videoId;

    seekToLiveHead(++runToken);
  }

  function checkEnd() {
    if (!settings || !settings.autoNextLive || endNotified || !isWatchPage()) return;

    const player = document.getElementById('movie_player');
    if (!player) return;

    if (!sawLivePlayback && isLiveStreamPage(player)) sawLivePlayback = true;
    if (!sawLivePlayback) return;

    if (call(player, 'getPlayerState') !== ENDED) {
      endedTicks = 0;
      return;
    }
    if (++endedTicks < END_CONFIRM_TICKS) return;

    endNotified = true;
    document.dispatchEvent(new CustomEvent('ylh:live-ended'));
  }

  document.addEventListener('ylh:live-settings', (event) => {
    if (!event.detail) return;
    settings = event.detail;
    handleNavigation();
  });

  document.addEventListener('yt-navigate-finish', handleNavigation);

  setInterval(checkEnd, END_POLL_INTERVAL_MS);

  document.dispatchEvent(new CustomEvent('ylh:live-request'));
})();
