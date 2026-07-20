const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

playerManager.setMediaPlaybackInfoHandler((loadRequest, playbackConfig) => {
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
  }

  return playbackConfig;
});

const options = new cast.framework.CastReceiverOptions();
options.useShakaForHls = true;
context.start(options);
