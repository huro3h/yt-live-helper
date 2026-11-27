(() => {
  'use strict';

  const FALLBACK_INTERVAL_MS = 1500;

  let settings = null;
  let fallbackTimerId = null;

  document.addEventListener('ylh:quality-settings', (event) => {
    settings = event.detail;
    if (settings.autoQuality) {
      applyQualityToAllPlayers();
      startFallbackTimer();
    } else {
      stopFallbackTimer();
    }
  });

  document.dispatchEvent(new CustomEvent('ylh:quality-request'));

  function pickTargetQuality(available) {
    if (!available || available.length === 0) return null;
    if (settings.useMaxQuality) return available[0];
    if (available.includes(settings.defaultQuality)) return settings.defaultQuality;
    return available[0];
  }

  function applyQualityToPlayer(player) {
    if (
      typeof player.getAvailableQualityLevels !== 'function' ||
      typeof player.setPlaybackQualityRange !== 'function'
    ) {
      return;
    }
    try {
      const available = player.getAvailableQualityLevels();
      const target = pickTargetQuality(available);
      if (!target) return;
      if (typeof player.getPlaybackQuality === 'function' && player.getPlaybackQuality() === target) {
        return;
      }
      player.setPlaybackQualityRange(target, target);
    } catch {
    }
  }

  function applyQualityToAllPlayers() {
    if (!settings || !settings.autoQuality) return;
    document.querySelectorAll('.html5-video-player').forEach(applyQualityToPlayer);
  }

  function startFallbackTimer() {
    if (fallbackTimerId !== null) return;
    fallbackTimerId = setInterval(applyQualityToAllPlayers, FALLBACK_INTERVAL_MS);
  }

  function stopFallbackTimer() {
    if (fallbackTimerId === null) return;
    clearInterval(fallbackTimerId);
    fallbackTimerId = null;
  }

  document.addEventListener('yt-navigate-finish', applyQualityToAllPlayers);
})();
