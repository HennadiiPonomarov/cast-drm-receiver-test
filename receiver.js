const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const statusElement = document.getElementById('receiver-status');
let statusTimeout;

function reportStatus(message, persistent = false) {
  console.info('[SWEET Receiver]', message);
  context.setApplicationState(message);

  if (!statusElement) {
    return;
  }
  statusElement.textContent = message;
  statusElement.classList.add('visible');
  clearTimeout(statusTimeout);
  if (!persistent) {
    statusTimeout = setTimeout(() => statusElement.classList.remove('visible'), 3200);
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
  const drm = loadRequest.media?.customData || loadRequest.customData || {};

  if (drm.licenseUrl) {
    playbackConfig.licenseUrl = drm.licenseUrl;
    playbackConfig.protectionSystem = cast.framework.ContentProtection.WIDEVINE;
    playbackConfig.shakaConfig = {
      ...(playbackConfig.shakaConfig || {}),
      drm: {
        ...((playbackConfig.shakaConfig || {}).drm || {}),
        servers: {
          ...((playbackConfig.shakaConfig || {}).drm?.servers || {}),
          'com.widevine.alpha': drm.licenseUrl,
        },
      },
    };
  }

  if (drm.licenseHeaders) {
    playbackConfig.licenseRequestHandler = requestInfo => {
      Object.assign(requestInfo.headers, drm.licenseHeaders);
      return requestInfo;
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

playerManager.addEventListener(cast.framework.events.EventType.PLAYER_LOAD_COMPLETE, () => {
  reportStatus('SWEET.TV: поток загружен');
});

playerManager.addEventListener(cast.framework.events.EventType.ERROR, event => {
  const code = event.detailedErrorCode || event.reason || event.errorCode || 'unknown';
  reportStatus(`SWEET.TV: ошибка потока (${code})`, true);
  console.error('[SWEET Receiver] Playback error', event);
});

const options = new cast.framework.CastReceiverOptions();
options.useShakaForHls = true;
context.start(options);
