(function exposeReceiverCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SweetReceiverCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createReceiverCore() {
  'use strict';

  function text(value) {
    return String(value || '').trim();
  }

  /**
   * Returns a CAF-compatible HLS packaging description only when both media
   * segment formats are known. Guessing TS for CMAF causes black video on
   * affected Cast devices, so unknown streams must remain autodetected.
   */
  function resolveHlsPackaging(customData = {}) {
    const segmentFormat = text(customData.hlsSegmentFormat).toUpperCase();
    const videoSegmentFormat = text(customData.hlsVideoSegmentFormat).toUpperCase();

    if (segmentFormat === 'FMP4' && videoSegmentFormat === 'FMP4') {
      return {segmentFormat: 'FMP4', videoSegmentFormat: 'FMP4'};
    }
    if (segmentFormat === 'TS' && videoSegmentFormat === 'MPEG2_TS') {
      return {segmentFormat: 'TS', videoSegmentFormat: 'MPEG2_TS'};
    }
    return null;
  }

  /**
   * Builds only the copy rendered by the receiver above OEM native controls.
   * The native player receives artwork separately; it must not receive the
   * sender's generic DRM/type labels, otherwise LG renders duplicate metadata.
   */
  function nativeHeaderPresentation(presentation = {}) {
    const isChannel = Boolean(presentation.isLive || presentation.isRecording);
    const mediaTitle = text(presentation.title);
    const channelTitle = text(presentation.channelTitle);
    const programmeTitle = text(presentation.programmeTitle);
    const title = isChannel ? (channelTitle || mediaTitle) : mediaTitle;

    let subtitle = '';
    if (presentation.isRecording) {
      subtitle = programmeTitle || (mediaTitle !== title ? mediaTitle : '');
    } else if (presentation.isSeries) {
      subtitle = text(presentation.subtitle);
    }

    return {
      visible: Boolean(title),
      layout: isChannel ? 'channel' : 'movie',
      title,
      subtitle,
      artworkUrl: text(presentation.artworkUrl),
    };
  }

  /**
   * LG/WebOS renders a native metadata panel in addition to Custom Receiver
   * DOM. Keep visual assets available to the platform, but remove textual
   * fields: our header is the single source of title, episode and programme
   * copy, so the native panel must not duplicate it underneath.
   */
  function nativeOverlayMetadata(metadata = {}) {
    return {
      ...metadata,
      title: '',
      subtitle: '',
    };
  }

  /**
   * Native CAF overlays are not consistent across receiver devices. In
   * particular, WebOS can report its overlay as hidden before it has painted
   * the first native controls frame. Keep the receiver header briefly while
   * that hand-off settles instead of immediately hiding it.
   */
  function nativeHeaderVisibilityMode({
    hasPresentation = false,
    overlayVisibility = null,
    initial = false,
  } = {}) {
    if (!hasPresentation) {
      return 'hide';
    }
    if (overlayVisibility === true) {
      return 'follow';
    }
    if (initial || overlayVisibility === null) {
      return 'grace';
    }
    return 'hide';
  }

  return Object.freeze({
    nativeHeaderPresentation,
    nativeHeaderVisibilityMode,
    nativeOverlayMetadata,
    resolveHlsPackaging,
  });
});
