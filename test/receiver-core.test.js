const test = require('node:test');
const assert = require('node:assert/strict');
const {
  nativeHeaderPresentation,
  nativeHeaderVisibilityMode,
  nativeOverlayMetadata,
  resolveHlsPackaging,
} = require('../receiver-core.js');

test('does not show a generic subtitle for a live channel', () => {
  const header = nativeHeaderPresentation({
    title: 'Widevine DRM',
    channelTitle: 'National Geographic HD',
    subtitle: 'Live',
    artworkUrl: 'https://static.sweet.tv/natgeo.png',
    isLive: true,
  });

  assert.deepEqual(header, {
    visible: true,
    layout: 'channel',
    title: 'National Geographic HD',
    subtitle: '',
    artworkUrl: 'https://static.sweet.tv/natgeo.png',
  });
});

test('shows the programme below a channel title for a recording', () => {
  const header = nativeHeaderPresentation({
    title: 'Discovery recording',
    channelTitle: 'Discovery Channel HD',
    programmeTitle: 'Gold Rush',
    isRecording: true,
  });

  assert.equal(header.layout, 'channel');
  assert.equal(header.title, 'Discovery Channel HD');
  assert.equal(header.subtitle, 'Gold Rush');
});

test('keeps a secondary line only for series', () => {
  const movie = nativeHeaderPresentation({
    title: 'Guardians of the Galaxy Vol. 3',
    subtitle: 'Widevine DRM',
    isMovie: true,
  });
  const series = nativeHeaderPresentation({
    title: 'Miraculous: Tales of Ladybug & Cat Noir',
    subtitle: 'Season 1, Episode 1',
    isSeries: true,
  });

  assert.equal(movie.subtitle, '');
  assert.equal(series.subtitle, 'Season 1, Episode 1');
});

test('uses a channel title when a live payload has no media title', () => {
  const header = nativeHeaderPresentation({
    channelTitle: 'TVN',
    isLive: true,
  });

  assert.equal(header.visible, true);
  assert.equal(header.title, 'TVN');
  assert.equal(header.layout, 'channel');
});

test('keeps native artwork metadata but removes duplicated native copy', () => {
  const metadata = nativeOverlayMetadata({
    title: 'National Geographic HD',
    subtitle: 'Widevine DRM',
    images: [{url: 'https://static.sweet.tv/natgeo.png'}],
    metadataType: 0,
  });

  assert.equal(metadata.title, '');
  assert.equal(metadata.subtitle, '');
  assert.deepEqual(metadata.images, [{url: 'https://static.sweet.tv/natgeo.png'}]);
  assert.equal(metadata.metadataType, 0);
});

test('keeps the native header through the initial WebOS overlay hand-off', () => {
  assert.equal(nativeHeaderVisibilityMode({
    hasPresentation: true,
    overlayVisibility: false,
    initial: true,
  }), 'grace');
  assert.equal(nativeHeaderVisibilityMode({
    hasPresentation: true,
    overlayVisibility: null,
  }), 'grace');
  assert.equal(nativeHeaderVisibilityMode({
    hasPresentation: true,
    overlayVisibility: true,
  }), 'follow');
  assert.equal(nativeHeaderVisibilityMode({
    hasPresentation: true,
    overlayVisibility: false,
  }), 'hide');
  assert.equal(nativeHeaderVisibilityMode({
    hasPresentation: false,
    overlayVisibility: true,
  }), 'hide');
});

test('maps only fully declared CMAF/fMP4 HLS packaging', () => {
  assert.deepEqual(resolveHlsPackaging({
    hlsSegmentFormat: 'fmp4',
    hlsVideoSegmentFormat: 'FMP4',
  }), {
    segmentFormat: 'FMP4',
    videoSegmentFormat: 'FMP4',
  });
  assert.equal(resolveHlsPackaging({hlsSegmentFormat: 'FMP4'}), null);
});

test('maps MPEG-TS packaging and leaves unknown formats for CAF autodetection', () => {
  assert.deepEqual(resolveHlsPackaging({
    hlsSegmentFormat: 'TS',
    hlsVideoSegmentFormat: 'MPEG2_TS',
  }), {
    segmentFormat: 'TS',
    videoSegmentFormat: 'MPEG2_TS',
  });
  assert.equal(resolveHlsPackaging({
    hlsSegmentFormat: 'TS',
    hlsVideoSegmentFormat: 'FMP4',
  }), null);
});
