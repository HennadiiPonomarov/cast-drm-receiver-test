const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const TRACKS_CHANNEL = 'urn:x-cast:tv.sweet.castdrm';
const statusElement = document.getElementById('receiver-status');
const loadingElement = document.getElementById('receiver-loading');
const loadingTitleElement = document.getElementById('receiver-loading-title');
const loadingArtworkElement = document.getElementById('receiver-loading-artwork');

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
    context.sendCustomMessage(TRACKS_CHANNEL, undefined, {
      type: 'tracks',
      audio: audioTracks,
      subtitles: subtitleTracks,
    });
  } catch (error) {
    console.warn('[SWEET Receiver] Track catalog is not ready', error);
  }
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

  if (Number.isFinite(drm.maxHeight)) {
    playbackConfig.shakaConfig = {
      ...(playbackConfig.shakaConfig || {}),
      restrictions: {
        ...((playbackConfig.shakaConfig || {}).restrictions || {}),
        maxHeight: drm.maxHeight,
      },
    };
    playbackConfig.manifestHandler = (manifest, responseInfo, shakaRequest) =>
      limitMasterPlaylist(manifest, drm.maxHeight);
  }

  return playbackConfig;
});

// Keep errors observable on a physical receiver without displaying stream URLs
// or credentials. This is needed to distinguish a receiver failure from a
// server-side authorization or playback failure.
playerManager.addEventListener(cast.framework.events.EventType.ERROR, event => {
  const code = event.detailedErrorCode || event.errorCode || event.reason || 'unknown';
  console.error('[SWEET Receiver] Playback error', event);
  showLoading();
  showReceiverStatus(`Playback error: ${code}`);
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
    }
  } catch (error) {
    console.warn('[SWEET Receiver] Invalid custom message', error);
  }
});

const options = new cast.framework.CastReceiverOptions();
options.useShakaForHls = true;
options.customNamespaces = {
  [TRACKS_CHANNEL]: cast.framework.system.MessageType.JSON,
};
context.start(options);
