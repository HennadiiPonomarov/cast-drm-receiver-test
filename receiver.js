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

function limitMasterPlaylist(manifest, maxHeight) {
  const lines = manifest.split(/\r?\n/);
  const filtered = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^#EXT-X-STREAM-INF:.*RESOLUTION=\d+x(\d+)/.exec(line);
    if (match && Number(match[1]) > maxHeight) {
      // In an HLS master playlist the URI is the next line after STREAM-INF.
      if (index + 1 < lines.length && !lines[index + 1].startsWith('#')) {
        index += 1;
      }
      continue;
    }
    filtered.push(line);
  }

  return filtered.join('\n');
}

function normalizeLiveMasterPlaylist(manifest) {
  // SWEET's default audio entry uses "df", which is not an ISO-639 code.
  // LANGUAGE is optional on EXT-X-MEDIA, so remove only that invalid attr.
  return manifest.replace(/,LANGUAGE="df"(?=,|\r?$)/gm, '');
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
  if (media?.contentType?.toLowerCase().includes('mpegurl') &&
      (customData.isLive || customData.isRecording)) {
    media.hlsSegmentFormat = cast.framework.messages.HlsSegmentFormat.TS;
    media.hlsVideoSegmentFormat = cast.framework.messages.HlsVideoSegmentFormat.MPEG2_TS;
  }
  return loadRequest;
});

playerManager.setMediaPlaybackInfoHandler((loadRequest, playbackConfig) => {
  showLoading(loadRequest.media);
  const drm = loadRequest.media?.customData || loadRequest.customData || {};

  if (drm.licenseUrl) {
    playbackConfig.licenseUrl = drm.licenseUrl;
    playbackConfig.protectionSystem = cast.framework.ContentProtection.WIDEVINE;
  }

  if (drm.licenseHeaders) {
    playbackConfig.licenseRequestHandler = requestInfo => {
      Object.assign(requestInfo.headers, drm.licenseHeaders);
    };
  }

  if (drm.isLive || Number.isFinite(drm.maxHeight)) {
    if (Number.isFinite(drm.maxHeight)) {
      playbackConfig.shakaConfig = {
        ...(playbackConfig.shakaConfig || {}),
        restrictions: {
          ...((playbackConfig.shakaConfig || {}).restrictions || {}),
          maxHeight: drm.maxHeight,
        },
      };
    }
    playbackConfig.manifestHandler = manifest => {
      let normalized = drm.isLive ? normalizeLiveMasterPlaylist(manifest) : manifest;
      if (Number.isFinite(drm.maxHeight)) {
        normalized = limitMasterPlaylist(normalized, drm.maxHeight);
      }
      return normalized;
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
// MPL is deprecated and no longer receives critical HLS fixes. Shaka is the
// current Cast HLS engine and handles both live MPEG-TS and Widevine streams.
options.useShakaForHls = true;
options.customNamespaces = {
  [TRACKS_CHANNEL]: cast.framework.system.MessageType.JSON,
};
context.start(options);
