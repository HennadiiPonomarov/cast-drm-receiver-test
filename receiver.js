const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const TRACKS_CHANNEL = 'urn:x-cast:tv.sweet.castdrm';
const RECEIVER_BUILD = 'track-switch-5';
const statusElement = document.getElementById('receiver-status');
const loaderElement = document.getElementById('receiver-loader');
const loaderLabelElement = document.getElementById('receiver-loader-label');
const playerElement = document.querySelector('cast-media-player');
let receiverIsBuffering = false;
let suppressLoaderUntilLoadComplete = false;
let suppressLoaderUntilBufferEnds = false;
let trackLoaderSafetyTimer = null;
let trackSelectionSequence = 0;

// A Web Receiver runs in the Chromecast/TV browser. navigator.language is
// therefore the receiver device locale, independent of the sender phone.
const receiverLocale = (navigator.language || 'en').toLowerCase();
const translations = {
  en: {
    connecting: 'Connecting to TV', loading: 'Loading', buffering: 'Buffering',
    cannotPlay: 'Unable to play', playbackError: 'Playback error',
  },
  uk: {
    connecting: 'Підключення до телевізора', loading: 'Завантаження', buffering: 'Буферизація',
    cannotPlay: 'Не вдалося відтворити', playbackError: 'Помилка відтворення',
  },
  ru: {
    connecting: 'Подключение к телевизору', loading: 'Загрузка', buffering: 'Буферизация',
    cannotPlay: 'Не удалось воспроизвести', playbackError: 'Ошибка воспроизведения',
  },
  sk: {
    connecting: 'Pripájanie k televízoru', loading: 'Načítava sa', buffering: 'Ukladanie do vyrovnávacej pamäte',
    cannotPlay: 'Prehrávanie nie je možné', playbackError: 'Chyba prehrávania',
  },
  cs: {
    connecting: 'Připojování k televizoru', loading: 'Načítání', buffering: 'Ukládání do vyrovnávací paměti',
    cannotPlay: 'Nelze přehrát', playbackError: 'Chyba přehrávání',
  },
  hu: {
    connecting: 'Csatlakozás a TV-hez', loading: 'Betöltés', buffering: 'Pufferelés',
    cannotPlay: 'Nem játszható le', playbackError: 'Lejátszási hiba',
  },
  bg: {
    connecting: 'Свързване с телевизора', loading: 'Зареждане', buffering: 'Буфериране',
    cannotPlay: 'Възпроизвеждането е невъзможно', playbackError: 'Грешка при възпроизвеждане',
  },
  pl: {
    connecting: 'Łączenie z telewizorem', loading: 'Ładowanie', buffering: 'Buforowanie',
    cannotPlay: 'Nie można odtworzyć', playbackError: 'Błąd odtwarzania',
  },
  ro: {
    connecting: 'Conectare la televizor', loading: 'Se încarcă', buffering: 'Se stochează în buffer',
    cannotPlay: 'Redarea nu este disponibilă', playbackError: 'Eroare de redare',
  },
  az: {
    connecting: 'Televizora qoşulur', loading: 'Yüklənir', buffering: 'Buferlənir',
    cannotPlay: 'Oxutmaq mümkün deyil', playbackError: 'Oxutma xətası',
  },
  sq: {
    connecting: 'Po lidhet me televizorin', loading: 'Po ngarkohet', buffering: 'Po ruhet në tampon',
    cannotPlay: 'Nuk mund të luhet', playbackError: 'Gabim në riprodhim',
  },
  lv: {
    connecting: 'Savienojuma izveide ar televizoru', loading: 'Notiek ielāde', buffering: 'Buferizācija',
    cannotPlay: 'Neizdevās atskaņot', playbackError: 'Atskaņošanas kļūda',
  },
  et: {
    connecting: 'Teleriga ühendamine', loading: 'Laadimine', buffering: 'Puhverdamine',
    cannotPlay: 'Esitamine ebaõnnestus', playbackError: 'Esituse tõrge',
  },
  el: {
    connecting: 'Σύνδεση με την τηλεόραση', loading: 'Φόρτωση', buffering: 'Προσωρινή αποθήκευση',
    cannotPlay: 'Δεν είναι δυνατή η αναπαραγωγή', playbackError: 'Σφάλμα αναπαραγωγής',
  },
  lt: {
    connecting: 'Jungiama prie televizoriaus', loading: 'Įkeliama', buffering: 'Buferizuojama',
    cannotPlay: 'Nepavyko paleisti', playbackError: 'Atkūrimo klaida',
  },
  sr: {
    connecting: 'Povezivanje sa televizorom', loading: 'Učitavanje', buffering: 'Baferovanje',
    cannotPlay: 'Reprodukcija nije moguća', playbackError: 'Greška pri reprodukciji',
  },
  mk: {
    connecting: 'Поврзување со телевизорот', loading: 'Се вчитува', buffering: 'Баферизација',
    cannotPlay: 'Не може да се репродуцира', playbackError: 'Грешка при репродукција',
  },
  bs: {
    connecting: 'Povezivanje s televizorom', loading: 'Učitavanje', buffering: 'Baferovanje',
    cannotPlay: 'Reprodukcija nije moguća', playbackError: 'Greška pri reprodukciji',
  },
  sl: {
    connecting: 'Povezovanje s televizorjem', loading: 'Nalaganje', buffering: 'Medpomnjenje',
    cannotPlay: 'Predvajanje ni mogoče', playbackError: 'Napaka pri predvajanju',
  },
  hr: {
    connecting: 'Povezivanje s televizorom', loading: 'Učitavanje', buffering: 'Međuspremanje',
    cannotPlay: 'Reprodukcija nije moguća', playbackError: 'Pogreška pri reprodukciji',
  },
};

function translate(key) {
  const language = receiverLocale.split('-')[0];
  return (translations[language] || translations.en)[key] || translations.en[key];
}

document.documentElement.lang = receiverLocale;

// Apply the dark receiver shell directly to the custom element as well. CAF
// keeps its player UI in a shadow root, so these variables must be set on the
// element rather than only on body/html styles.
if (playerElement) {
  const playerStyles = {
    '--background': '#000',
    '--background-color': '#000',
    '--background-image': 'none',
    '--logo-background': 'transparent',
    '--logo-color': 'transparent',
    '--logo-image': "url('assets/transparent.svg')",
    '--splash-background': '#000',
    '--splash-color': '#000',
    '--splash-image': "url('assets/transparent.svg')",
    '--spinner-image': "url('assets/transparent.svg')",
    '--buffering-image': "url('assets/transparent.svg')",
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

function showReceiverStatus(message, type = 'info') {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = message;
  statusElement.classList.toggle('error', type === 'error');
  statusElement.classList.add('visible');
}

function hideReceiverStatus() {
  if (statusElement) {
    statusElement.classList.remove('visible');
    statusElement.classList.remove('error');
  }
}

function showLoader(label = translate('loading')) {
  if (loaderLabelElement) {
    loaderLabelElement.textContent = label;
  }
  if (loaderElement) {
    loaderElement.classList.add('visible');
  }
}

function hideLoader() {
  if (loaderElement) {
    loaderElement.classList.remove('visible');
  }
}

function suppressLoaderForTrackChange() {
  suppressLoaderUntilBufferEnds = true;
  if (trackLoaderSafetyTimer !== null) {
    clearTimeout(trackLoaderSafetyTimer);
  }
  trackLoaderSafetyTimer = setTimeout(() => {
    suppressLoaderUntilBufferEnds = false;
    trackLoaderSafetyTimer = null;
    showBufferLoaderWhenNeeded();
  }, 8000);
  hideLoader();
}

function showBufferLoaderWhenNeeded() {
  if (!receiverIsBuffering
      || suppressLoaderUntilLoadComplete
      || suppressLoaderUntilBufferEnds) {
    hideLoader();
    return;
  }
  showLoader(translate('buffering'));
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
      receiverBuild: RECEIVER_BUILD,
      audio: audioTracks,
      subtitles: subtitleTracks,
    });
  } catch (error) {
    console.warn('[SWEET Receiver] Track catalog is not ready', error);
  }
}

function activeTrackState() {
  const audioManager = playerManager.getAudioTracksManager();
  const textManager = playerManager.getTextTracksManager();
  return {
    audioId: audioManager.getActiveId(),
    subtitleIds: textManager.getActiveIds(),
  };
}

function sendTrackSelectionResult(sequence, requestedAudioId, requestedSubtitleId, error) {
  if (sequence !== trackSelectionSequence) {
    return;
  }
  let active = {audioId: -1, subtitleIds: []};
  try {
    active = activeTrackState();
  } catch (stateError) {
    error = error || stateError;
  }
  const subtitleIds = Array.isArray(active.subtitleIds) ? active.subtitleIds : [];
  sendReceiverMessage({
    type: 'tracks-selected',
    requestedAudioId,
    requestedSubtitleId,
    activeAudioId: Number.isFinite(active.audioId) ? active.audioId : -1,
    activeSubtitleIds: subtitleIds,
    success: !error
      && (requestedAudioId < 0 || active.audioId === requestedAudioId)
      && (requestedSubtitleId < 0
        ? subtitleIds.length === 0
        : subtitleIds.includes(requestedSubtitleId)),
    error: error ? sanitizeErrorValue(error.message || error) : '',
  });
}

function applyTrackSelection(message) {
  const audioId = Number(message.audioId);
  const subtitleId = Number(message.subtitleId);
  const audioLanguage = String(message.audioLanguage || '');
  const subtitleLanguage = String(message.subtitleLanguage || '');
  const requestedAudioId = Number.isFinite(audioId) ? audioId : -1;
  const requestedSubtitleId = Number.isFinite(subtitleId) ? subtitleId : -1;
  const sequence = ++trackSelectionSequence;
  let lastError = null;

  const applyRequestedTracks = () => {
    if (sequence !== trackSelectionSequence) {
      return;
    }
    // Track changes can emit BUFFERING while the current frame remains usable.
    // Renew suppression for each Shaka retry so no retry flashes the overlay.
    suppressLoaderForTrackChange();
    const audioManager = playerManager.getAudioTracksManager();
    const textManager = playerManager.getTextTracksManager();
    try {
      if (requestedAudioId >= 0) {
        if (audioManager.getTrackById(requestedAudioId)) {
          audioManager.setActiveById(requestedAudioId);
        } else if (audioLanguage) {
          audioManager.setActiveByLanguage(audioLanguage);
        }
      }
      if (requestedSubtitleId >= 0) {
        if (textManager.getTrackById(requestedSubtitleId)) {
          textManager.setActiveByIds([requestedSubtitleId]);
        } else if (subtitleLanguage) {
          textManager.setActiveByLanguage(subtitleLanguage);
        }
      } else {
        textManager.setActiveByIds([]);
      }
    } catch (error) {
      lastError = error;
      console.warn('[SWEET Receiver] Cannot apply track selection', error);
    }
  };

  applyRequestedTracks();
  // Shaka may rebuild its track list immediately after a variant switch.
  // Reapply once the new variant is stable, then report the actual active IDs.
  setTimeout(applyRequestedTracks, 180);
  setTimeout(() => {
    applyRequestedTracks();
    sendTrackSelectionResult(
      sequence, requestedAudioId, requestedSubtitleId, lastError);
  }, 650);
}

function clearTrackLoaderSuppression() {
  suppressLoaderUntilBufferEnds = false;
  if (trackLoaderSafetyTimer !== null) {
    clearTimeout(trackLoaderSafetyTimer);
    trackLoaderSafetyTimer = null;
  }
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
  const drm = loadRequest.media?.customData || loadRequest.customData || {};
  if (drm.suppressLoader) {
    suppressLoaderUntilLoadComplete = true;
    hideLoader();
  } else {
    suppressLoaderUntilLoadComplete = false;
    showLoader();
  }

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
  suppressLoaderUntilLoadComplete = false;
  clearTrackLoaderSuppression();
  showLoader(translate('cannotPlay'));
  showReceiverStatus(`${translate('playbackError')}: ${code}`, 'error');
  sendReceiverMessage({
    type: 'receiver-error',
    code: String(code),
    details,
  });
});

playerManager.addEventListener(cast.framework.events.EventType.PLAYER_LOAD_COMPLETE, () => {
  receiverIsBuffering = false;
  suppressLoaderUntilLoadComplete = false;
  clearTrackLoaderSuppression();
  hideLoader();
  hideReceiverStatus();
  sendTrackCatalog();
});

playerManager.addEventListener(cast.framework.events.EventType.BUFFERING, event => {
  receiverIsBuffering = Boolean(event.isBuffering);
  if (receiverIsBuffering) {
    showBufferLoaderWhenNeeded();
  } else {
    clearTrackLoaderSuppression();
    hideLoader();
  }
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
// Widevine CMAF HLS must use Shaka. MPL is legacy and stalls after buffering
// encrypted fMP4 segments on this receiver. HLS segment format fields above
// are intentionally limited to clear MPEG-TS streams: they apply to MPL only.
options.useShakaForHls = true;
options.customNamespaces = {
  [TRACKS_CHANNEL]: cast.framework.system.MessageType.JSON,
};
context.start(options);

hideLoader();
