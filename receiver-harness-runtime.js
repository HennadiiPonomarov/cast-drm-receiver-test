(() => {
  const nativeMediaControlsOverlay = new URL(window.location.href)
    .searchParams.get('native-controls') === '1';
  const EVENT = {
    ERROR: 'ERROR',
    PLAYER_LOAD_COMPLETE: 'PLAYER_LOAD_COMPLETE',
    REQUEST_STOP: 'REQUEST_STOP',
    BUFFERING: 'BUFFERING',
    MEDIA_FINISHED: 'MEDIA_FINISHED',
    PAUSE: 'PAUSE',
    PLAYING: 'PLAYING',
    TIME_UPDATE: 'TIME_UPDATE',
    REQUEST_SEEK: 'REQUEST_SEEK',
  };

  const PLAYER_STATE = {
    IDLE: 'IDLE',
    BUFFERING: 'BUFFERING',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
  };

  class HarnessCastMediaPlayer extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({mode: 'open'});
      root.innerHTML = `
        <style>
          :host { position: fixed; inset: 0; display: block; background: #030608; }
          #visual { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
          #shade { position: absolute; inset: 0; background: rgba(0, 0, 0, .12); }
          tv-overlay { position: absolute; inset: 0; }
          .shaka-text-container {
            position: absolute; left: 8%; right: 8%; bottom: 8%; z-index: 2;
            display: flex; justify-content: center; color: white; font: 600 4.4vh Inter, Arial;
          }
          .shaka-text-container span { padding: .08em .28em; }
        </style>
        <img id="visual" alt="">
        <div id="shade"></div>
        <div class="shaka-text-container"><span id="caption"></span></div>
        <tv-overlay></tv-overlay>
      `;
    }

    setPresentation({backgroundUrl = '', caption = ''} = {}) {
      const image = this.shadowRoot.getElementById('visual');
      image.src = backgroundUrl;
      image.hidden = !backgroundUrl;
      this.shadowRoot.getElementById('caption').textContent = caption;
    }

    setCaption(caption = '') {
      this.shadowRoot.getElementById('caption').textContent = caption;
    }
  }

  if (!customElements.get('cast-media-player')) {
    customElements.define('cast-media-player', HarnessCastMediaPlayer);
  }

  class MockAudioTracksManager {
    constructor() {
      this.tracks = [];
      this.activeId = -1;
    }

    getTracks() { return this.tracks; }
    getActiveId() { return this.activeId; }
    getTrackById(id) {
      return this.tracks.find(track => String(track.trackId) === String(id));
    }
    setActiveById(id) {
      if (this.getTrackById(id)) {
        this.activeId = id;
      }
    }
  }

  class MockTextTracksManager {
    constructor(onChange) {
      this.tracks = [];
      this.activeIds = [];
      this.style = null;
      this.onChange = onChange;
    }

    getTracks() { return this.tracks; }
    getActiveIds() { return [...this.activeIds]; }
    getTrackById(id) {
      return this.tracks.find(track => String(track.trackId) === String(id));
    }
    setActiveByIds(ids) {
      this.activeIds = (Array.isArray(ids) ? ids : [])
        .filter(id => this.getTrackById(id));
      this.onChange(this.activeIds);
    }
    getTextTracksStyle() { return this.style; }
    setTextTrackStyle(style) { this.style = style; }
  }

  class MockPlayerManager {
    constructor() {
      this.interceptors = new Map();
      this.listeners = new Map();
      this.state = PLAYER_STATE.IDLE;
      this.currentTime = 0;
      this.duration = 0;
      this.audio = new MockAudioTracksManager();
      this.text = new MockTextTracksManager(ids => this.renderCaption(ids));
      this.playbackInfoHandler = null;
      this.tick = window.setInterval(() => this.advance(), 1000);
      this.currentRequest = null;
    }

    setMessageInterceptor(type, handler) { this.interceptors.set(type, handler); }
    setMediaPlaybackInfoHandler(handler) { this.playbackInfoHandler = handler; }
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(handler);
    }
    emit(type, data = {}) {
      for (const handler of this.listeners.get(type) || []) handler(data);
    }
    getDurationSec() { return this.duration; }
    getCurrentTimeSec() { return this.currentTime; }
    getPlayerState() { return this.state; }
    getAudioTracksManager() { return this.audio; }
    getTextTracksManager() { return this.text; }

    load(request) {
      const interceptor = this.interceptors.get('LOAD');
      this.currentRequest = interceptor ? interceptor(request) : request;
      const media = this.currentRequest.media || {};
      const data = media.customData || this.currentRequest.customData || {};
      if (this.playbackInfoHandler) {
        this.playbackInfoHandler(this.currentRequest, new cast.framework.PlaybackConfig());
      }
      const tracks = Array.isArray(media.tracks) ? media.tracks : [];
      this.audio.tracks = tracks.filter(track => track.type === 'AUDIO');
      this.audio.activeId = this.audio.tracks[0]?.trackId ?? -1;
      this.text.tracks = tracks.filter(track => track.type === 'TEXT');
      this.text.activeIds = [];
      this.currentTime = Number(this.currentRequest.currentTime) || 0;
      this.duration = data.isLive ? -1 : (Number(data.durationSec) || 8610);
      this.state = PLAYER_STATE.BUFFERING;
      this.updateVisual(media, data);
      this.emit(EVENT.BUFFERING, {isBuffering: true});
      window.setTimeout(() => {
        this.state = this.currentRequest.autoplay === false
          ? PLAYER_STATE.PAUSED
          : PLAYER_STATE.PLAYING;
        this.emit(EVENT.PLAYER_LOAD_COMPLETE, {});
        this.emit(EVENT.BUFFERING, {isBuffering: false});
        this.emit(this.state === PLAYER_STATE.PAUSED ? EVENT.PAUSE : EVENT.PLAYING, {});
      }, 450);
    }

    updateVisual(media, data) {
      const player = document.getElementById('receiver-player');
      const backgroundUrl = data.backgroundUrl
        || data.thumbnailImageUrl
        || media.metadata?.images?.[0]?.url
        || '';
      player?.setPresentation({backgroundUrl});
    }

    renderCaption(ids) {
      const selected = this.text.getTrackById(ids[0]);
      const player = document.getElementById('receiver-player');
      player?.setCaption(selected
        ? `${selected.name || selected.language}: browser receiver preview`
        : '');
    }

    play() {
      if (this.state === PLAYER_STATE.IDLE) return;
      this.state = PLAYER_STATE.PLAYING;
      this.emit(EVENT.PLAYING, {});
    }
    pause() {
      if (this.state === PLAYER_STATE.IDLE) return;
      this.state = PLAYER_STATE.PAUSED;
      this.emit(EVENT.PAUSE, {});
    }
    seek(position) {
      if (!Number.isFinite(position) || this.duration < 0) return;
      this.currentTime = Math.max(0, Math.min(this.duration, position));
      this.emit(EVENT.REQUEST_SEEK, {requestData: {currentTime: this.currentTime}});
      this.emit(EVENT.TIME_UPDATE, {});
    }
    stop() {
      this.state = PLAYER_STATE.IDLE;
      this.emit(EVENT.REQUEST_STOP, {});
    }
    advance() {
      if (this.state !== PLAYER_STATE.PLAYING) return;
      if (this.duration > 0) {
        this.currentTime = Math.min(this.duration, this.currentTime + 1);
        if (this.currentTime >= this.duration) {
          this.state = PLAYER_STATE.IDLE;
          this.emit(EVENT.MEDIA_FINISHED, {endedReason: 'END_OF_STREAM'});
          return;
        }
      }
      this.emit(EVENT.TIME_UPDATE, {});
    }
  }

  class MockContext {
    constructor() {
      this.player = new MockPlayerManager();
      this.customListeners = new Map();
    }
    getPlayerManager() { return this.player; }
    addCustomMessageListener(namespace, listener) {
      this.customListeners.set(namespace, listener);
    }
    sendCustomMessage(namespace, senderId, message) {
      window.dispatchEvent(new CustomEvent('sweet-harness-message', {detail: message}));
    }
    dispatchCustomMessage(namespace, message) {
      this.customListeners.get(namespace)?.({data: message, senderId: 'browser-harness'});
    }
    start() {}
    stop() { this.player.stop(); }
  }

  const context = new MockContext();
  const nativeControls = {
    hasMediaControlsOverlay: () => Promise.resolve(nativeMediaControlsOverlay),
  };
  const textEdge = {
    NONE: 'NONE', OUTLINE: 'OUTLINE', DROP_SHADOW: 'DROP_SHADOW',
    RAISED: 'RAISED', DEPRESSED: 'DEPRESSED',
  };

  window.cast = {
    framework: {
      CastReceiverContext: {getInstance: () => context},
      CastReceiverOptions: class CastReceiverOptions {},
      PlaybackConfig: class PlaybackConfig {},
      ContentProtection: {WIDEVINE: 'WIDEVINE'},
      ui: {
        Controls: {getInstance: () => nativeControls},
      },
      events: {
        EventType: EVENT,
        EndedReason: {END_OF_STREAM: 'END_OF_STREAM'},
      },
      messages: {
        MessageType: {LOAD: 'LOAD', EDIT_TRACKS_INFO: 'EDIT_TRACKS_INFO'},
        PlayerState: PLAYER_STATE,
        StreamType: {LIVE: 'LIVE', BUFFERED: 'BUFFERED'},
        HlsSegmentFormat: {TS: 'TS'},
        HlsVideoSegmentFormat: {MPEG2_TS: 'MPEG2_TS'},
        TextTrackWindowType: {ROUNDED_CORNERS: 'ROUNDED_CORNERS'},
        TextTrackEdgeType: textEdge,
        TextTrackStyle: class TextTrackStyle {},
      },
      system: {MessageType: {JSON: 'JSON'}},
    },
  };

  const background = 'assets/harness-video.jpg';
  const artwork = 'assets/harness-poster.jpg';
  const standardTracks = [
    {trackId: 1, type: 'AUDIO', name: 'English Stereo', language: 'en'},
    {trackId: 2, type: 'AUDIO', name: 'Slovak Stereo', language: 'sk'},
    {trackId: 101, type: 'TEXT', name: 'English', language: 'en'},
    {trackId: 102, type: 'TEXT', name: 'Slovak', language: 'sk'},
    {trackId: 103, type: 'TEXT', name: 'Czech', language: 'cs'},
  ];

  function requestFor(kind) {
    const now = Math.floor(Date.now() / 1000);
    const common = {
      contentId: `browser-harness:${kind}`,
      contentType: 'application/x-mpegURL',
      tracks: standardTracks.map(track => ({...track})),
      metadata: {
        title: kind === 'movie' ? 'Guardians of the Galaxy Vol. 3'
          : kind === 'recording' ? 'Discovery Channel HD'
            : 'National Geographic HD',
        subtitle: kind === 'series' ? 'Season 1, Episode 1' : '',
        images: [{url: artwork}],
      },
    };
    const customData = {
      contentKey: `browser-harness:${kind}`,
      backgroundUrl: background,
      artworkUrl: artwork,
      isLive: kind === 'live',
      isRecording: kind === 'recording',
      isMovie: kind === 'movie' || kind === 'series',
      isSeries: kind === 'series',
      contentKind: kind,
      channelTitle: kind === 'recording' ? 'Discovery Channel HD' : 'National Geographic HD',
      programmeTitle: kind === 'recording' ? 'Expedition Unknown' : '',
      programmeStart: now - 900,
      programmeEnd: now + 1800,
      durationSec: kind === 'recording' ? 3600 : 8610,
      selectedAudioId: 1,
      selectedSubtitleId: -1,
      qualityOptions: [
        {maxHeight: -1, label: 'Auto'},
        {maxHeight: 1080, label: '1080p'},
        {maxHeight: 720, label: '720p'},
        {maxHeight: 480, label: '480p'},
        {maxHeight: 360, label: '360p'},
      ],
    };
    return {autoplay: true, currentTime: kind === 'recording' ? 620 : 0, media: {...common, customData}};
  }

  function dispatchKey(key, keyCode) {
    const event = new KeyboardEvent('keydown', {
      key, keyCode, which: keyCode, bubbles: true, cancelable: true,
    });
    window.dispatchEvent(event);
  }

  function installPanel() {
    const host = document.createElement('div');
    host.id = 'sweet-harness-panel';
    host.style.cssText = 'position:fixed;right:16px;top:16px;z-index:2147483647';
    const root = host.attachShadow({mode: 'open'});
    root.innerHTML = `
      <style>
        :host { color-scheme: dark; }
        .panel { width: 300px; padding: 12px; border: 1px solid #33515d; border-radius: 8px;
          background: rgba(7,18,24,.94); color: #fff; font: 14px Inter, Arial; box-shadow: 0 12px 32px #0008; }
        .head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        strong { font-size:15px; } .hint { color:#9fb6bf; font-size:11px; margin-top:8px; line-height:1.4; }
        .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
        button { min-height:34px; border:1px solid #35515c; border-radius:5px; background:#162831;
          color:#fff; font:600 12px Inter,Arial; cursor:pointer; }
        button:hover, button:focus { border-color:#20c5c9; outline:none; background:#20414a; }
        .remote { margin-top:8px; grid-template-columns:repeat(5,1fr); }
        #collapse { width:32px; min-height:28px; } .collapsed .body { display:none; }
      </style>
      <div class="panel">
        <div class="head"><strong>Browser Cast</strong><button id="collapse">-</button></div>
        <div class="body">
          <div class="grid">
            <button data-action="movie">Фильм</button><button data-action="series">Сериал</button>
            <button data-action="live">Эфир</button><button data-action="recording">Запись</button>
            <button data-action="buffer">Буфер</button><button data-action="error">Ошибка</button>
          </div>
          <div class="grid remote">
            <button data-key="ArrowLeft">◀</button><button data-key="ArrowUp">▲</button>
            <button data-key="Enter">OK</button><button data-key="ArrowDown">▼</button>
            <button data-key="ArrowRight">▶</button>
          </div>
          <div class="grid" style="margin-top:6px">
            <button data-key="Escape">Назад</button><button data-action="pause">Пауза</button>
            <button data-action="play">Играть</button>
          </div>
          <div class="hint">Это UI-симулятор. Поиск Cast, сетевой протокол и аппаратный Widevine проверяются только на реальном устройстве.</div>
        </div>
      </div>
    `;
    document.body.append(host);
    const panel = root.querySelector('.panel');
    root.getElementById('collapse').addEventListener('click', event => {
      event.stopPropagation();
      panel.classList.toggle('collapsed');
      event.currentTarget.textContent = panel.classList.contains('collapsed') ? '+' : '-';
    });
    root.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.action;
        if (['movie', 'series', 'live', 'recording'].includes(action)) {
          context.player.load(requestFor(action));
        } else if (action === 'pause') {
          context.player.pause();
        } else if (action === 'play') {
          context.player.play();
        } else if (action === 'buffer') {
          context.player.emit(EVENT.BUFFERING, {isBuffering: true});
          window.setTimeout(() => context.player.emit(EVENT.BUFFERING, {isBuffering: false}), 2800);
        } else if (action === 'error') {
          context.player.emit(EVENT.ERROR, {errorCode: 905, reason: 'Browser harness error'});
        }
        window.setTimeout(() => document.body.focus(), 0);
      });
    });
    root.querySelectorAll('[data-key]').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.key;
        const keyCode = {ArrowLeft: 37, ArrowUp: 38, Enter: 13, ArrowDown: 40,
          ArrowRight: 39, Escape: 27}[key];
        dispatchKey(key, keyCode);
        window.setTimeout(() => document.body.focus(), 0);
      });
    });
  }

  window.SweetCastHarness = {
    context,
    installPanel,
    requestFor,
    nativeMediaControlsOverlay,
  };
})();
