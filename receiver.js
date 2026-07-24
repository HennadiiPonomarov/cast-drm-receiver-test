const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const TRACKS_CHANNEL = 'urn:x-cast:tv.sweet.castdrm';
const statusElement = document.getElementById('receiver-status');
const loadingElement = document.getElementById('receiver-loading');
const loadingTitleElement = document.getElementById('receiver-loading-title');
const loadingArtworkElement = document.getElementById('receiver-loading-artwork');
const playerElement = document.querySelector('cast-media-player');

// Apply the dark receiver shell directly to the custom element as well. CAF
// keeps its player UI in a shadow root, so these variables must be set on the
// element rather than only on body/html styles.
if (playerElement) {
  const playerStyles = {
    '--background': '#000',
    '--background-color': '#000',
    '--background-image': 'none',
    '--logo-background': '#000',
    '--logo-color': '#000',
    '--logo-image': 'none',
    '--splash-background': '#000',
    '--splash-color': '#000',
    '--splash-image': 'none',
    '--watermark-background': 'transparent',
    '--watermark-color': 'transparent',
    '--watermark-image': 'none',
  };
  Object.entries(playerStyles).forEach(([name, value]) => {
    playerElement.style.setProperty(name, value);
  });
}

function sendReceiverMessage(payload) {
  try {
    context.sendCustomMessage(TRACKS_CHANNEL, undefined, payload);
  } catch (error) {
    console.warn('[SWEET Receiver] Cannot notify sender', error);
  }
}

function showReceiverStatus(message) {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = message;
  statusElement.classList.add('visible');
}

function hideReceiverStatus() {
  if (statusElement) {
    statusElement.classList.remove('visible');
  }
}

function showLoading(media) {
  const metadata = media?.metadata || {};
  const title = metadata.title || 'SWEET.TV';
  const artwork = Array.isArray(metadata.images) ? metadata.images[0]?.url : null;

  if (loadingTitleElement) {
    loadingTitleElement.textContent = title;
  }
  if (loadingArtworkElement) {
    if (artwork && /^https:\/\//.test(artwork)) {
      loadingArtworkElement.src = artwork;
      loadingArtworkElement.style.display = 'block';
    } else {
      loadingArtworkElement.removeAttribute('src');
      loadingArtworkElement.style.display = 'none';
    }
  }
  if (loadingElement) {
    loadingElement.classList.add('visible');
  }
}

function hideLoading() {
  if (loadingElement) {
    loadingElement.classList.remove('visible');
  }
}

function toTrackPayload(track) {
  return {
    id: track.trackId,
    name: track.name || '',
    language: track.language || '',
  };
}

function sendTrackCatalog() {
  try {
    const audioTracks = playerManager.getAudioTracksManager().getTracks().map(toTrackPayload);
    const subtitleTracks = playerManager.getTextTracksManager().getTracks().map(toTrackPayload);
    sendReceiverMessage({
      type: 'tracks',
      audio: audioTracks,
      subtitles: subtitleTracks,
    });
  } catch (error) {
    console.warn('[SWEET Receiver] Track catalog is not ready', error);
  }
}

function applyTrackSelection(message) {
  const audioId = Number(message.audioId);
  const subtitleId = Number(message.subtitleId);

  if (Number.isFinite(audioId) && audioId >= 0) {
    playerManager.getAudioTracksManager().setActiveById(audioId);
  }
  playerManager.getTextTracksManager().setActiveByIds(
    Number.isFinite(subtitleId) && subtitleId >= 0 ? [subtitleId] : []);
}

// The live and catch-up playlists use MPEG-TS HLS segments. Keep the format
// explicit for receivers that do not infer it reliably from the playlist.
playerManager.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, loadRequest => {
  const media = loadRequest.media;
  const customData = media?.customData || loadRequest.customData || {};
  if (customData.isLive) {
    media.streamType = cast.framework.messages.StreamType.LIVE;
    media.duration = -1;
  }
  if (media?.contentType?.toLowerCase().includes('mpegurl')) {
    if (!customData.licenseUrl && (customData.isLive || customData.isRecording)) {
      // Clear live and catch-up streams use MPEG-TS.
      media.hlsSegmentFormat = cast.framework.messages.HlsSegmentFormat.TS;
      media.hlsVideoSegmentFormat = cast.framework.messages.HlsVideoSegmentFormat.MPEG2_TS;
    }
  }
  return loadRequest;
});

playerManager.setMediaPlaybackInfoHandler((loadRequest, playbackConfig) => {
  showLoading(loadRequest.media);
  const drm = loadRequest.media?.customData || loadRequest.customData || {};

  // A PlaybackConfig can be reused between loads. Clear the DRM-specific
  // values first so a clear channel cannot inherit a prior movie's license.
  playbackConfig.licenseUrl = undefined;
  playbackConfig.protectionSystem = undefined;
  playbackConfig.licenseRequestHandler = undefined;
  playbackConfig.shakaConfig = undefined;

  if (drm.licenseUrl) {
    playbackConfig.licenseUrl = drm.licenseUrl;
    playbackConfig.protectionSystem = cast.framework.ContentProtection.WIDEVINE;
    // CAF maps licenseUrl for the legacy player. With Shaka HLS enabled, also
    // provide the EME key-system mapping explicitly: live Widevine HLS uses
    // the same signed license endpoint as VOD, but is initialized by Shaka.
    playbackConfig.shakaConfig = {
      drm: {
        servers: {
          'com.widevine.alpha': drm.licenseUrl,
        },
      },
    };
  }

  if (drm.licenseHeaders) {
    playbackConfig.licenseRequestHandler = requestInfo => {
      Object.assign(requestInfo.headers, drm.licenseHeaders);
    };
  }

  if (Number.isFinite(drm.maxHeight)) {
    playbackConfig.shakaConfig = {
      ...(playbackConfig.shakaConfig || {}),
      restrictions: {
        ...((playbackConfig.shakaConfig || {}).restrictions || {}),
        maxHeight: drm.maxHeight,
      },
    };
  }

  return playbackConfig;
});

function sanitizeErrorValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/https?:\/\/[^\s"']+/gi, '<url>')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer <redacted>')
    .slice(0, 240);
}

function getErrorDetails(event) {
  const details = {};
  for (const key of ['name', 'message', 'reason', 'errorCode', 'detailedErrorCode']) {
    if (event && event[key] !== undefined) {
      details[key] = sanitizeErrorValue(event[key]);
    }
  }
  if (event?.error) {
    for (const key of ['name', 'message', 'code', 'severity']) {
      if (event.error[key] !== undefined) {
        details[`error.${key}`] = sanitizeErrorValue(event.error[key]);
      }
    }
  }
  try {
    const serializedEvent = JSON.stringify(event);
    if (serializedEvent && serializedEvent !== '{}') {
      details.event = sanitizeErrorValue(serializedEvent);
    }
  } catch (_) {
    // Error events may contain non-serializable platform objects.
  }
  return details;
}

// Keep errors observable on a physical receiver without displaying stream URLs
// or credentials. This distinguishes receiver configuration failures from
// server-side authorization or media failures.
playerManager.addEventListener(cast.framework.events.EventType.ERROR, event => {
  const code = event.detailedErrorCode || event.errorCode || event.reason || 'unknown';
  const details = getErrorDetails(event);
  console.error('[SWEET Receiver] Playback error', event);
  showLoading();
  showReceiverStatus(`Playback error: ${code}`);
  sendReceiverMessage({
    type: 'receiver-error',
    code: String(code),
    details,
  });
});

playerManager.addEventListener(cast.framework.events.EventType.PLAYER_LOAD_COMPLETE, () => {
  hideLoading();
  hideReceiverStatus();
  sendTrackCatalog();
});

context.addCustomMessageListener(TRACKS_CHANNEL, event => {
  try {
    const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (message?.type === 'request-tracks') {
      sendTrackCatalog();
    } else if (message?.type === 'select-tracks') {
      applyTrackSelection(message);
    }
  } catch (error) {
    console.warn('[SWEET Receiver] Invalid custom message', error);
  }
});

const options = new cast.framework.CastReceiverOptions();
// Use Cast's stable HLS pipeline. Shaka HLS is still an opt-in path with
// receiver-specific compatibility gaps; Widevine live streams must first be
// validated on the platform player before enabling it again.
options.useShakaForHls = false;
options.customNamespaces = {
  [TRACKS_CHANNEL]: cast.framework.system.MessageType.JSON,
};
context.start(options);
