const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const TRACKS_CHANNEL = 'urn:x-cast:tv.sweet.castdrm';
const statusElement = document.getElementById('receiver-status');
const loaderElement = document.getElementById('receiver-loader');
const loaderLabelElement = document.getElementById('receiver-loader-label');
const idleElement = document.getElementById('receiver-idle');
const idleLabelElement = document.getElementById('receiver-idle-label');
const playerElement = document.getElementById('receiver-player');
const transitionElement = document.getElementById('receiver-transition');
const transitionArtworkElement = document.getElementById('receiver-transition-artwork');
const transitionTitleElement = document.getElementById('receiver-transition-title');
const transitionBadgeElement = document.getElementById('receiver-transition-badge');
const transitionSubtitleElement = document.getElementById('receiver-transition-subtitle');
const toastElement = document.getElementById('receiver-toast');
const toastLabelElement = document.getElementById('receiver-toast-label');
const pauseElement = document.getElementById('receiver-pause');
const pauseLabelElement = document.getElementById('receiver-pause-label');
const pauseTitleElement = document.getElementById('receiver-pause-title');
const pauseMetaElement = document.getElementById('receiver-pause-meta');
const pauseProgressElement = document.getElementById('receiver-pause-progress-fill');
const pauseProgressTrackElement = document.getElementById('receiver-pause-progress');
const pauseTimeElement = document.getElementById('receiver-pause-time');
const pauseDurationElement = document.getElementById('receiver-pause-duration');
const playStateIconElement = document.getElementById('receiver-play-state-icon');
const audioLabelElement = document.getElementById('receiver-audio-label');
const subtitlesLabelElement = document.getElementById('receiver-subtitles-label');
const qualityLabelElement = document.getElementById('receiver-quality-label');
const optionsElement = document.getElementById('receiver-options');
const optionsTitleElement = document.getElementById('receiver-options-title');
const optionsListElement = document.getElementById('receiver-options-list');
const seekPreviewElement = document.getElementById('receiver-seek-preview');
const seekFrameElement = document.getElementById('receiver-seek-frame');
const seekImageElement = document.getElementById('receiver-seek-image');
const seekTimeElement = document.getElementById('receiver-seek-time');
const errorElement = document.getElementById('receiver-error');
const errorTitleElement = document.getElementById('receiver-error-title');
const errorMessageElement = document.getElementById('receiver-error-message');
const errorCodeElement = document.getElementById('receiver-error-code');
const endElement = document.getElementById('receiver-end');
const endArtworkElement = document.getElementById('receiver-end-artwork');
const endTitleElement = document.getElementById('receiver-end-title');
const endMetaElement = document.getElementById('receiver-end-meta');
let idleTimer = null;
let transitionTimer = null;
let toastTimer = null;
let seekPreviewTimer = null;
let playbackHasError = false;
let currentPresentation = null;
let thumbnailCues = [];
let thumbnailRequestId = 0;
let thumbnailSprite = null;
let controlsTimer = null;
let menuSection = 'audio';
let menuSelection = 0;
let audioTrackCatalog = [];
let subtitleTrackCatalog = [];
let pendingSeek = null;
let seekRepeatCount = 0;
let seekCommitTimer = null;
let seekResetTimer = null;
let nativeOverlayObserver = null;

function suppressNativePlayerOverlay() {
  const playerShadowRoot = playerElement?.shadowRoot;
  const nativeOverlay = playerShadowRoot?.querySelector('tv-overlay');
  if (!nativeOverlay) {
    return;
  }

  // Keep CAF's overlay mounted because it participates in the receiver state
  // machine. Making only its pixels transparent avoids duplicate metadata,
  // progress and loading UI without touching the video or subtitle surfaces.
  nativeOverlay.style.setProperty('opacity', '0', 'important');
  nativeOverlay.style.setProperty('visibility', 'hidden', 'important');
  nativeOverlay.style.setProperty('pointer-events', 'none', 'important');
  nativeOverlay.setAttribute('aria-hidden', 'true');

  const overlayShadowRoot = nativeOverlay.shadowRoot;
  if (overlayShadowRoot && !overlayShadowRoot.getElementById('sweet-overlay-visibility')) {
    const style = document.createElement('style');
    style.id = 'sweet-overlay-visibility';
    style.textContent = [
      ':host {',
      '  opacity: 0 !important;',
      '  visibility: hidden !important;',
      '  pointer-events: none !important;',
      '}',
    ].join('\n');
    overlayShadowRoot.appendChild(style);
  }
}

function installNativePlayerOverlaySuppression() {
  const playerShadowRoot = playerElement?.shadowRoot;
  if (!playerShadowRoot) {
    window.setTimeout(installNativePlayerOverlaySuppression, 100);
    return;
  }
  suppressNativePlayerOverlay();
  nativeOverlayObserver?.disconnect();
  nativeOverlayObserver = new MutationObserver(suppressNativePlayerOverlay);
  nativeOverlayObserver.observe(playerShadowRoot, {childList: true, subtree: true});
}

// A Web Receiver runs in the Chromecast/TV browser. navigator.language is
// therefore the receiver device locale, independent of the sender phone.
const receiverLocale = (navigator.language || 'en').toLowerCase();
const translations = {
  en: {
    connecting: 'Connecting to TV', loading: 'Loading', buffering: 'Buffering',
    cannotPlay: 'Unable to play', playbackError: 'Playback error',
    waiting: 'Waiting for a stream',
    tryAgain: 'Please try again or choose another video.',
    paused: 'Paused', finished: 'Playback finished', code: 'Code',
    audio: 'Audio', subtitles: 'Subtitles', quality: 'Quality', auto: 'Auto', off: 'Off',
    live: 'Live', recording: 'Recording', movie: 'Movie',
  },
  uk: {
    connecting: 'Підключення до телевізора', loading: 'Завантаження', buffering: 'Буферизація',
    cannotPlay: 'Не вдалося відтворити', playbackError: 'Помилка відтворення',
    waiting: 'Очікування трансляції',
    tryAgain: 'Спробуйте ще раз або виберіть інше відео.',
    paused: 'Пауза', finished: 'Відтворення завершено', code: 'Код',
    audio: 'Аудіо', subtitles: 'Субтитри', quality: 'Якість', auto: 'Авто', off: 'Вимкнено',
    live: 'Наживо', recording: 'Запис', movie: 'Фільм',
  },
  ru: {
    connecting: 'Подключение к телевизору', loading: 'Загрузка', buffering: 'Буферизация',
    cannotPlay: 'Не удалось воспроизвести', playbackError: 'Ошибка воспроизведения',
    waiting: 'Ожидание трансляции',
    tryAgain: 'Попробуйте ещё раз или выберите другое видео.',
    paused: 'Пауза', finished: 'Просмотр завершён', code: 'Код',
    audio: 'Аудио', subtitles: 'Субтитры', quality: 'Качество', auto: 'Авто', off: 'Выключены',
    live: 'Прямой эфир', recording: 'Запись', movie: 'Фильм',
  },
  sk: {
    connecting: 'Pripájanie k televízoru', loading: 'Načítava sa', buffering: 'Ukladanie do vyrovnávacej pamäte',
    cannotPlay: 'Prehrávanie nie je možné', playbackError: 'Chyba prehrávania',
    waiting: 'Čaká sa na vysielanie',
    tryAgain: 'Skúste to znova alebo vyberte iné video.',
    paused: 'Pozastavené', finished: 'Prehrávanie sa skončilo', code: 'Kód',
    audio: 'Zvuk', subtitles: 'Titulky', quality: 'Kvalita', auto: 'Automaticky', off: 'Vypnuté',
    live: 'Naživo', recording: 'Záznam', movie: 'Film',
  },
  cs: {
    connecting: 'Připojování k televizoru', loading: 'Načítání', buffering: 'Ukládání do vyrovnávací paměti',
    cannotPlay: 'Nelze přehrát', playbackError: 'Chyba přehrávání',
    waiting: 'Čekání na vysílání',
    tryAgain: 'Zkuste to znovu nebo vyberte jiné video.',
    paused: 'Pozastaveno', finished: 'Přehrávání skončilo', code: 'Kód',
    audio: 'Zvuk', subtitles: 'Titulky', quality: 'Kvalita', auto: 'Automaticky', off: 'Vypnuto',
    live: 'Živě', recording: 'Záznam', movie: 'Film',
  },
  hu: {
    connecting: 'Csatlakozás a TV-hez', loading: 'Betöltés', buffering: 'Pufferelés',
    cannotPlay: 'Nem játszható le', playbackError: 'Lejátszási hiba',
    waiting: 'Várakozás a közvetítésre',
    tryAgain: 'Próbálja újra, vagy válasszon másik videót.',
    paused: 'Szüneteltetve', finished: 'A lejátszás véget ért', code: 'Kód',
    audio: 'Hang', subtitles: 'Feliratok', quality: 'Minőség', auto: 'Automatikus', off: 'Kikapcsolva',
    live: 'Élő', recording: 'Felvétel', movie: 'Film',
  },
  bg: {
    connecting: 'Свързване с телевизора', loading: 'Зареждане', buffering: 'Буфериране',
    cannotPlay: 'Възпроизвеждането е невъзможно', playbackError: 'Грешка при възпроизвеждане',
    waiting: 'Изчакване на предаването',
    tryAgain: 'Опитайте отново или изберете друго видео.',
    paused: 'Пауза', finished: 'Възпроизвеждането приключи', code: 'Код',
    audio: 'Аудио', subtitles: 'Субтитри', quality: 'Качество', auto: 'Автоматично', off: 'Изключени',
    live: 'На живо', recording: 'Запис', movie: 'Филм',
  },
  pl: {
    connecting: 'Łączenie z telewizorem', loading: 'Ładowanie', buffering: 'Buforowanie',
    cannotPlay: 'Nie można odtworzyć', playbackError: 'Błąd odtwarzania',
    waiting: 'Oczekiwanie na transmisję',
    tryAgain: 'Spróbuj ponownie lub wybierz inny film.',
    paused: 'Wstrzymano', finished: 'Odtwarzanie zakończone', code: 'Kod',
    audio: 'Dźwięk', subtitles: 'Napisy', quality: 'Jakość', auto: 'Auto', off: 'Wyłączone',
    live: 'Na żywo', recording: 'Nagranie', movie: 'Film',
  },
  ro: {
    connecting: 'Conectare la televizor', loading: 'Se încarcă', buffering: 'Se stochează în buffer',
    cannotPlay: 'Redarea nu este disponibilă', playbackError: 'Eroare de redare',
    waiting: 'Se așteaptă transmisia',
    tryAgain: 'Încercați din nou sau alegeți alt videoclip.',
    paused: 'În pauză', finished: 'Redarea s-a încheiat', code: 'Cod',
    audio: 'Audio', subtitles: 'Subtitrări', quality: 'Calitate', auto: 'Automat', off: 'Dezactivate',
    live: 'În direct', recording: 'Înregistrare', movie: 'Film',
  },
  az: {
    connecting: 'Televizora qoşulur', loading: 'Yüklənir', buffering: 'Buferlənir',
    cannotPlay: 'Oxutmaq mümkün deyil', playbackError: 'Oxutma xətası',
    waiting: 'Yayım gözlənilir',
    tryAgain: 'Yenidən cəhd edin və ya başqa video seçin.',
    paused: 'Dayandırılıb', finished: 'Oxutma bitdi', code: 'Kod',
    audio: 'Səs', subtitles: 'Subtitrlər', quality: 'Keyfiyyət', auto: 'Avtomatik', off: 'Söndürülüb',
    live: 'Canlı', recording: 'Yazı', movie: 'Film',
  },
  sq: {
    connecting: 'Po lidhet me televizorin', loading: 'Po ngarkohet', buffering: 'Po ruhet në tampon',
    cannotPlay: 'Nuk mund të luhet', playbackError: 'Gabim në riprodhim',
    waiting: 'Në pritje të transmetimit',
    tryAgain: 'Provo përsëri ose zgjidh një video tjetër.',
    paused: 'Në pauzë', finished: 'Riprodhimi përfundoi', code: 'Kodi',
    audio: 'Audio', subtitles: 'Titrat', quality: 'Cilësia', auto: 'Automatike', off: 'Fikur',
    live: 'Drejtpërdrejt', recording: 'Regjistrim', movie: 'Film',
  },
  lv: {
    connecting: 'Savienojuma izveide ar televizoru', loading: 'Notiek ielāde', buffering: 'Buferizācija',
    cannotPlay: 'Neizdevās atskaņot', playbackError: 'Atskaņošanas kļūda',
    waiting: 'Gaida pārraidi',
    tryAgain: 'Mēģiniet vēlreiz vai izvēlieties citu video.',
    paused: 'Pauzēts', finished: 'Atskaņošana pabeigta', code: 'Kods',
    audio: 'Audio', subtitles: 'Subtitri', quality: 'Kvalitāte', auto: 'Automātiski', off: 'Izslēgti',
    live: 'Tiešraide', recording: 'Ieraksts', movie: 'Filma',
  },
  et: {
    connecting: 'Teleriga ühendamine', loading: 'Laadimine', buffering: 'Puhverdamine',
    cannotPlay: 'Esitamine ebaõnnestus', playbackError: 'Esituse tõrge',
    waiting: 'Ülekande ootamine',
    tryAgain: 'Proovige uuesti või valige mõni muu video.',
    paused: 'Peatatud', finished: 'Esitus lõppes', code: 'Kood',
    audio: 'Heli', subtitles: 'Subtiitrid', quality: 'Kvaliteet', auto: 'Automaatne', off: 'Väljas',
    live: 'Otse', recording: 'Salvestis', movie: 'Film',
  },
  el: {
    connecting: 'Σύνδεση με την τηλεόραση', loading: 'Φόρτωση', buffering: 'Προσωρινή αποθήκευση',
    cannotPlay: 'Δεν είναι δυνατή η αναπαραγωγή', playbackError: 'Σφάλμα αναπαραγωγής',
    waiting: 'Αναμονή μετάδοσης',
    tryAgain: 'Δοκιμάστε ξανά ή επιλέξτε άλλο βίντεο.',
    paused: 'Σε παύση', finished: 'Η αναπαραγωγή ολοκληρώθηκε', code: 'Κωδικός',
    audio: 'Ήχος', subtitles: 'Υπότιτλοι', quality: 'Ποιότητα', auto: 'Αυτόματο', off: 'Ανενεργοί',
    live: 'Ζωντανά', recording: 'Εγγραφή', movie: 'Ταινία',
  },
  lt: {
    connecting: 'Jungiama prie televizoriaus', loading: 'Įkeliama', buffering: 'Buferizuojama',
    cannotPlay: 'Nepavyko paleisti', playbackError: 'Atkūrimo klaida',
    waiting: 'Laukiama transliacijos',
    tryAgain: 'Bandykite dar kartą arba pasirinkite kitą vaizdo įrašą.',
    paused: 'Pristabdyta', finished: 'Atkūrimas baigtas', code: 'Kodas',
    audio: 'Garsas', subtitles: 'Subtitrai', quality: 'Kokybė', auto: 'Automatiškai', off: 'Išjungti',
    live: 'Tiesiogiai', recording: 'Įrašas', movie: 'Filmas',
  },
  sr: {
    connecting: 'Povezivanje sa televizorom', loading: 'Učitavanje', buffering: 'Baferovanje',
    cannotPlay: 'Reprodukcija nije moguća', playbackError: 'Greška pri reprodukciji',
    waiting: 'Čekanje prenosa',
    tryAgain: 'Pokušajte ponovo ili izaberite drugi video.',
    paused: 'Pauzirano', finished: 'Reprodukcija je završena', code: 'Kod',
    audio: 'Zvuk', subtitles: 'Titlovi', quality: 'Kvalitet', auto: 'Automatski', off: 'Isključeni',
    live: 'Uživo', recording: 'Snimak', movie: 'Film',
  },
  mk: {
    connecting: 'Поврзување со телевизорот', loading: 'Се вчитува', buffering: 'Баферизација',
    cannotPlay: 'Не може да се репродуцира', playbackError: 'Грешка при репродукција',
    waiting: 'Се чека пренос',
    tryAgain: 'Обидете се повторно или изберете друго видео.',
    paused: 'Паузирано', finished: 'Репродукцијата заврши', code: 'Код',
    audio: 'Аудио', subtitles: 'Преводи', quality: 'Квалитет', auto: 'Автоматски', off: 'Исклучени',
    live: 'Во живо', recording: 'Снимка', movie: 'Филм',
  },
  bs: {
    connecting: 'Povezivanje s televizorom', loading: 'Učitavanje', buffering: 'Baferovanje',
    cannotPlay: 'Reprodukcija nije moguća', playbackError: 'Greška pri reprodukciji',
    waiting: 'Čekanje prijenosa',
    tryAgain: 'Pokušajte ponovo ili odaberite drugi video.',
    paused: 'Pauzirano', finished: 'Reprodukcija je završena', code: 'Kod',
    audio: 'Zvuk', subtitles: 'Titlovi', quality: 'Kvalitet', auto: 'Automatski', off: 'Isključeni',
    live: 'Uživo', recording: 'Snimak', movie: 'Film',
  },
  sl: {
    connecting: 'Povezovanje s televizorjem', loading: 'Nalaganje', buffering: 'Medpomnjenje',
    cannotPlay: 'Predvajanje ni mogoče', playbackError: 'Napaka pri predvajanju',
    waiting: 'Čakanje na predvajanje',
    tryAgain: 'Poskusite znova ali izberite drug videoposnetek.',
    paused: 'Začasno ustavljeno', finished: 'Predvajanje je končano', code: 'Koda',
    audio: 'Zvok', subtitles: 'Podnapisi', quality: 'Kakovost', auto: 'Samodejno', off: 'Izklopljeni',
    live: 'V živo', recording: 'Posnetek', movie: 'Film',
  },
  hr: {
    connecting: 'Povezivanje s televizorom', loading: 'Učitavanje', buffering: 'Međuspremanje',
    cannotPlay: 'Reprodukcija nije moguća', playbackError: 'Pogreška pri reprodukciji',
    waiting: 'Čekanje prijenosa',
    tryAgain: 'Pokušajte ponovno ili odaberite drugi video.',
    paused: 'Pauzirano', finished: 'Reprodukcija je završena', code: 'Kôd',
    audio: 'Zvuk', subtitles: 'Titlovi', quality: 'Kvaliteta', auto: 'Automatski', off: 'Isključeni',
    live: 'Uživo', recording: 'Snimka', movie: 'Film',
  },
};

function translate(key) {
  const language = receiverLocale.split('-')[0];
  return (translations[language] || translations.en)[key] || translations.en[key];
}

document.documentElement.lang = receiverLocale;

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

function setLayerVisible(element, visible) {
  if (element) {
    element.classList.toggle('visible', visible);
  }
}

function clearTimer(timer) {
  if (timer !== null) {
    clearTimeout(timer);
  }
  return null;
}

function formatTime(totalSeconds) {
  const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function secureMediaUrl(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.replace(/^http:\/\//i, 'https://');
}

function metadataImage(metadata) {
  const image = Array.isArray(metadata?.images) ? metadata.images[0] : null;
  return secureMediaUrl(image?.url || image || '');
}

function presentationFor(media, customData = {}) {
  const metadata = media?.metadata || {};
  const qualityOptions = Array.isArray(customData.qualityOptions)
    ? customData.qualityOptions
        .map(option => ({
          maxHeight: option?.maxHeight !== null && Number.isFinite(Number(option?.maxHeight))
            ? Number(option.maxHeight)
            : -1,
          label: option?.label || translate('auto'),
        }))
    : [];
  return {
    title: metadata.title || customData.title || '',
    subtitle: metadata.subtitle || customData.subtitle || '',
    artworkUrl: metadataImage(metadata) || secureMediaUrl(customData.artworkUrl || ''),
    isLive: Boolean(customData.isLive),
    isRecording: Boolean(customData.isRecording),
    isMovie: Boolean(customData.isMovie) || (!customData.isLive && !customData.isRecording),
    thumbnailsPlaylistUrl: secureMediaUrl(customData.thumbnailsPlaylistUrl || ''),
    thumbnailImageUrl: secureMediaUrl(customData.thumbnailImageUrl || ''),
    thumbnailInterval: Number(customData.thumbnailInterval) || 0,
    thumbnailCols: Number(customData.thumbnailCols) || 0,
    thumbnailRows: Number(customData.thumbnailRows) || 0,
    qualityOptions,
    maxHeight: customData.maxHeight !== null && customData.maxHeight !== undefined
      && Number.isFinite(Number(customData.maxHeight))
      ? Number(customData.maxHeight)
      : -1,
  };
}

function presentationBadge(presentation = currentPresentation) {
  if (presentation?.isLive) {
    return translate('live');
  }
  if (presentation?.isRecording) {
    return translate('recording');
  }
  return translate('movie');
}

function hideTransition() {
  transitionTimer = clearTimer(transitionTimer);
  setLayerVisible(transitionElement, false);
}

function showTransition() {
  if (!currentPresentation?.title) {
    return;
  }
  transitionTimer = clearTimer(transitionTimer);
  if (transitionTitleElement) {
    transitionTitleElement.textContent = currentPresentation.title;
  }
  if (transitionBadgeElement) {
    transitionBadgeElement.textContent = presentationBadge();
  }
  if (transitionSubtitleElement) {
    transitionSubtitleElement.textContent = currentPresentation.subtitle;
    transitionSubtitleElement.hidden = !currentPresentation.subtitle;
  }
  if (transitionArtworkElement) {
    transitionArtworkElement.hidden = !currentPresentation.artworkUrl;
    if (currentPresentation.artworkUrl) {
      transitionArtworkElement.src = currentPresentation.artworkUrl;
    }
  }
  setLayerVisible(transitionElement, true);
}

function scheduleTransitionHide(delay = 1500) {
  transitionTimer = clearTimer(transitionTimer);
  transitionTimer = setTimeout(hideTransition, delay);
}

function showToast(message, duration = 1800) {
  if (!message || !toastElement || !toastLabelElement) {
    return;
  }
  toastTimer = clearTimer(toastTimer);
  toastLabelElement.textContent = message;
  toastElement.classList.add('visible');
  toastTimer = setTimeout(() => {
    toastTimer = null;
    toastElement.classList.remove('visible');
  }, duration);
}

function hidePause() {
  controlsTimer = clearTimer(controlsTimer);
  hideOptions();
  setLayerVisible(pauseElement, false);
}

function updatePauseProgress() {
  const position = playerManager.getCurrentTimeSec();
  const duration = playerManager.getDurationSec();
  const boundedDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const percentage = boundedDuration > 0
    ? Math.max(0, Math.min(100, (position / boundedDuration) * 100))
    : 0;
  if (pauseProgressElement) {
    pauseProgressElement.style.width = `${percentage}%`;
  }
  if (pauseProgressTrackElement) {
    pauseProgressTrackElement.style.setProperty('--progress', `${percentage}%`);
  }
  if (pauseTimeElement) {
    pauseTimeElement.textContent = boundedDuration > 0 ? formatTime(position) : presentationBadge();
  }
  if (pauseDurationElement) {
    pauseDurationElement.textContent = boundedDuration > 0 ? formatTime(boundedDuration) : '';
  }
}

function updateControlLabels() {
  if (audioLabelElement) {
    audioLabelElement.textContent = translate('audio');
  }
  if (subtitlesLabelElement) {
    subtitlesLabelElement.textContent = translate('subtitles');
  }
  if (qualityLabelElement) {
    qualityLabelElement.textContent = translate('quality');
  }
}

function showPause(autoHide = false) {
  if (!currentPresentation?.title || playbackHasError) {
    return;
  }
  hideTransition();
  if (pauseLabelElement) {
    pauseLabelElement.textContent = currentPresentation.subtitle || presentationBadge();
  }
  if (pauseTitleElement) {
    pauseTitleElement.textContent = currentPresentation.title;
  }
  if (pauseMetaElement) {
    pauseMetaElement.textContent = currentPresentation.subtitle || presentationBadge();
  }
  updatePauseProgress();
  updateControlLabels();
  if (playStateIconElement) {
    playStateIconElement.src = isPlaybackPaused()
      ? 'assets/player/play.svg'
      : 'assets/player/pause.svg';
  }
  setLayerVisible(pauseElement, true);
  controlsTimer = clearTimer(controlsTimer);
  if (autoHide && !isPlaybackPaused()) {
    controlsTimer = setTimeout(hidePause, 2800);
  }
}

function optionItems(section = menuSection) {
  if (section === 'audio') {
    return audioTrackCatalog.map(track => ({
      id: track.trackId,
      label: track.name || track.language || String(track.trackId),
      selected: track.trackId === playerManager.getAudioTracksManager().getActiveId(),
    }));
  }
  if (section === 'subtitles') {
    const activeIds = playerManager.getTextTracksManager().getActiveIds();
    return [
      {id: -1, label: translate('off'), selected: activeIds.length === 0},
      ...subtitleTrackCatalog.map(track => ({
        id: track.trackId,
        label: track.name || track.language || String(track.trackId),
        selected: activeIds.includes(track.trackId),
      })),
    ];
  }
  return (currentPresentation?.qualityOptions || []).map(option => ({
    id: option.maxHeight,
    label: option.label,
    selected: option.maxHeight === currentPresentation.maxHeight
      || (option.maxHeight < 0 && currentPresentation.maxHeight < 0),
  }));
}

function renderOptions() {
  const items = optionItems();
  menuSelection = Math.max(0, Math.min(menuSelection, Math.max(0, items.length - 1)));
  if (optionsTitleElement) {
    optionsTitleElement.textContent = translate(menuSection);
  }
  if (optionsListElement) {
    optionsListElement.textContent = '';
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `receiver-option-row${index === menuSelection ? ' selected' : ''}`;
      row.textContent = item.label;
      optionsListElement.appendChild(row);
    });
  }
}

function showOptions(section = menuSection) {
  menuSection = section;
  const items = optionItems();
  const selectedIndex = items.findIndex(item => item.selected);
  menuSelection = selectedIndex >= 0 ? selectedIndex : 0;
  renderOptions();
  optionsElement?.classList.add('visible');
}

function hideOptions() {
  optionsElement?.classList.remove('visible');
}

function applySelectedOption() {
  const item = optionItems()[menuSelection];
  if (!item) {
    return;
  }
  if (menuSection === 'audio') {
    playerManager.getAudioTracksManager().setActiveById(item.id);
  } else if (menuSection === 'subtitles') {
    playerManager.getTextTracksManager().setActiveByIds(item.id < 0 ? [] : [item.id]);
  } else {
    sendReceiverMessage({
      type: 'quality-request',
      maxHeight: item.id,
      positionMs: Math.round(playerManager.getCurrentTimeSec() * 1000),
    });
    currentPresentation.maxHeight = item.id;
  }
  showToast(`${translate(menuSection)}: ${item.label}`);
  hideOptions();
  showPause(true);
}

function hideError() {
  setLayerVisible(errorElement, false);
}

function showError(code) {
  hideLoader();
  hideTransition();
  hidePause();
  hideSeekPreview();
  if (errorTitleElement) {
    errorTitleElement.textContent = translate('cannotPlay');
  }
  if (errorMessageElement) {
    errorMessageElement.textContent = translate('tryAgain');
  }
  if (errorCodeElement) {
    errorCodeElement.textContent = `${translate('code')}: ${code}`;
  }
  setLayerVisible(errorElement, true);
}

function hideEnd() {
  setLayerVisible(endElement, false);
}

function showEnd() {
  hideLoader();
  hideTransition();
  hidePause();
  hideSeekPreview();
  if (endArtworkElement) {
    endArtworkElement.hidden = !currentPresentation?.artworkUrl;
    if (currentPresentation?.artworkUrl) {
      endArtworkElement.src = currentPresentation.artworkUrl;
    }
  }
  if (endTitleElement) {
    endTitleElement.textContent = currentPresentation?.title || '';
  }
  if (endMetaElement) {
    endMetaElement.textContent = translate('finished');
  }
  setLayerVisible(endElement, true);
}

function parseVttTime(value) {
  const parts = value.trim().split(':').map(Number);
  if (parts.some(part => !Number.isFinite(part))) {
    return 0;
  }
  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }
  if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }
  return parts[0] || 0;
}

function parseThumbnailVtt(text, playlistUrl) {
  const cues = [];
  const blocks = String(text || '').replace(/\r/g, '').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    const timeLineIndex = lines.findIndex(line => line.includes('-->'));
    if (timeLineIndex < 0 || !lines[timeLineIndex + 1]) {
      continue;
    }
    const [startText, endText] = lines[timeLineIndex].split('-->').map(value => value.trim().split(/\s+/)[0]);
    const target = lines[timeLineIndex + 1];
    const cropMatch = target.match(/#xywh=(\d+),(\d+),(\d+),(\d+)/i);
    let imageUrl = target.split('#')[0];
    try {
      imageUrl = new URL(imageUrl, playlistUrl).href;
    } catch (_) {
      continue;
    }
    cues.push({
      start: parseVttTime(startText),
      end: parseVttTime(endText),
      imageUrl: secureMediaUrl(imageUrl),
      crop: cropMatch ? cropMatch.slice(1).map(Number) : null,
    });
  }
  return cues;
}

async function loadThumbnailCues(playlistUrl, sprite = null) {
  const requestId = ++thumbnailRequestId;
  thumbnailCues = [];
  thumbnailSprite = sprite?.imageUrl && sprite.interval > 0 && sprite.cols > 0 && sprite.rows > 0
    ? sprite
    : null;
  if (!playlistUrl) {
    return;
  }
  try {
    const response = await fetch(playlistUrl, {credentials: 'omit'});
    if (!response.ok) {
      return;
    }
    const cues = parseThumbnailVtt(await response.text(), playlistUrl);
    if (requestId === thumbnailRequestId) {
      thumbnailCues = cues;
    }
  } catch (_) {
    // A missing thumbnail preview must not affect playback.
  }
}

function thumbnailCueAt(positionSeconds) {
  const cue = thumbnailCues.find(item => positionSeconds >= item.start && positionSeconds < item.end)
    || thumbnailCues.find(cue => positionSeconds < cue.end)
    || null;
  if (cue || !thumbnailSprite) {
    return cue;
  }
  const index = Math.max(0, Math.floor(positionSeconds / thumbnailSprite.interval));
  const totalFrames = thumbnailSprite.cols * thumbnailSprite.rows;
  const frame = Math.min(index, totalFrames - 1);
  return {
    start: frame * thumbnailSprite.interval,
    end: (frame + 1) * thumbnailSprite.interval,
    imageUrl: thumbnailSprite.imageUrl,
    spriteFrame: frame,
  };
}

function renderThumbnailCue(cue) {
  if (!seekImageElement || !seekFrameElement) {
    return;
  }
  if (!cue?.imageUrl) {
    seekFrameElement.hidden = true;
    seekImageElement.style.display = 'none';
    return;
  }
  seekFrameElement.hidden = false;
  seekImageElement.onload = () => {
    let crop = cue.crop;
    if (!crop && Number.isFinite(cue.spriteFrame) && thumbnailSprite) {
      const frameWidth = seekImageElement.naturalWidth / thumbnailSprite.cols;
      const frameHeight = seekImageElement.naturalHeight / thumbnailSprite.rows;
      const column = cue.spriteFrame % thumbnailSprite.cols;
      const row = Math.floor(cue.spriteFrame / thumbnailSprite.cols);
      crop = [column * frameWidth, row * frameHeight, frameWidth, frameHeight];
    }
    crop = crop || [0, 0, seekImageElement.naturalWidth, seekImageElement.naturalHeight];
    const [x, y, width, height] = crop;
    if (!width || !height) {
      seekImageElement.style.display = 'none';
      return;
    }
    const scale = Math.min(240 / width, 135 / height);
    seekFrameElement.style.width = `${Math.round(width * scale)}px`;
    seekFrameElement.style.height = `${Math.round(height * scale)}px`;
    seekImageElement.style.width = `${Math.round(seekImageElement.naturalWidth * scale)}px`;
    seekImageElement.style.height = `${Math.round(seekImageElement.naturalHeight * scale)}px`;
    seekImageElement.style.left = `${Math.round(-x * scale)}px`;
    seekImageElement.style.top = `${Math.round(-y * scale)}px`;
    seekImageElement.style.display = 'block';
  };
  seekImageElement.onerror = () => {
    seekImageElement.style.display = 'none';
  };
  seekImageElement.src = cue.imageUrl;
}

function showSeekPreview(positionSeconds, autoHide = false) {
  const position = Math.max(0, Number(positionSeconds) || 0);
  seekPreviewTimer = clearTimer(seekPreviewTimer);
  if (seekTimeElement) {
    seekTimeElement.textContent = formatTime(position);
  }
  renderThumbnailCue(thumbnailCueAt(position));
  if (seekPreviewElement) {
    const duration = playerManager.getDurationSec();
    if (Number.isFinite(duration) && duration > 0) {
      // The Smart TV timeline spans from 5vw to 95vw. Keep the preview
      // anchored to that same coordinate system so it follows the scrubber.
      const timelinePercentage = 5 + ((position / duration) * 90);
      const percentage = Math.max(10, Math.min(90, timelinePercentage));
      seekPreviewElement.style.left = `${percentage}%`;
    } else {
      seekPreviewElement.style.left = '50%';
    }
    seekPreviewElement.classList.add('visible');
  }
  if (autoHide) {
    seekPreviewTimer = setTimeout(hideSeekPreview, 1300);
  }
}

function hideSeekPreview() {
  seekPreviewTimer = clearTimer(seekPreviewTimer);
  if (seekPreviewElement) {
    seekPreviewElement.classList.remove('visible');
  }
}

function resetPresentationLayers() {
  hideError();
  hideEnd();
  hidePause();
  hideSeekPreview();
  hideReceiverStatus();
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

function showIdle() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (idleLabelElement) {
    idleLabelElement.textContent = translate('waiting');
  }
  hideTransition();
  hidePause();
  hideSeekPreview();
  hideEnd();
  if (idleElement) {
    idleElement.classList.add('visible');
  }
}

function hideIdle() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (idleElement) {
    idleElement.classList.remove('visible');
  }
}

function scheduleIdle() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (!playbackHasError) {
      hideLoader();
      hideReceiverStatus();
      showIdle();
    }
  }, 450);
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
    audioTrackCatalog = playerManager.getAudioTracksManager().getTracks();
    subtitleTrackCatalog = playerManager.getTextTracksManager().getTracks();
    const audioTracks = audioTrackCatalog.map(toTrackPayload);
    const subtitleTracks = subtitleTrackCatalog.map(toTrackPayload);
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
  const audioManager = playerManager.getAudioTracksManager();
  const textManager = playerManager.getTextTracksManager();
  const previousAudioId = audioManager.getActiveId();
  const previousSubtitleIds = textManager.getActiveIds();

  if (Number.isFinite(audioId) && audioId >= 0) {
    audioManager.setActiveById(audioId);
  }
  textManager.setActiveByIds(
    Number.isFinite(subtitleId) && subtitleId >= 0 ? [subtitleId] : []);

  const feedback = [];
  if (Number.isFinite(audioId) && audioId >= 0 && audioId !== previousAudioId) {
    const track = audioManager.getTrackById(audioId);
    feedback.push(`${translate('audio')}: ${track?.name || track?.language || audioId}`);
  }
  const previousSubtitleId = previousSubtitleIds.length > 0 ? previousSubtitleIds[0] : -1;
  if (subtitleId !== previousSubtitleId) {
    const track = Number.isFinite(subtitleId) && subtitleId >= 0
      ? textManager.getTrackById(subtitleId)
      : null;
    feedback.push(`${translate('subtitles')}: ${track?.name || track?.language || translate('off')}`);
  }
  if (feedback.length > 0) {
    showToast(feedback.join(' · '));
  }
}

function isOptionsVisible() {
  return Boolean(optionsElement?.classList.contains('visible'));
}

function cycleMenuSection(direction) {
  const sections = ['audio', 'subtitles', 'quality'];
  let index = sections.indexOf(menuSection);
  for (let attempts = 0; attempts < sections.length; attempts += 1) {
    index = (index + direction + sections.length) % sections.length;
    if (optionItems(sections[index]).length > 0) {
      menuSection = sections[index];
      menuSelection = 0;
      renderOptions();
      return;
    }
  }
}

function seekStepSeconds() {
  seekResetTimer = clearTimer(seekResetTimer);
  seekRepeatCount += 1;
  const accelerated = seekRepeatCount > 11
    ? Math.min(180, 30 + ((seekRepeatCount - 11) * 4))
    : 30;
  seekResetTimer = setTimeout(() => {
    seekRepeatCount = 0;
    seekResetTimer = null;
  }, 400);
  return accelerated;
}

function previewRemoteSeek(direction) {
  const duration = playerManager.getDurationSec();
  if (!Number.isFinite(duration) || duration <= 0) {
    return;
  }
  const current = pendingSeek === null ? playerManager.getCurrentTimeSec() : pendingSeek;
  pendingSeek = Math.max(0, Math.min(duration, current + (direction * seekStepSeconds())));
  showPause();
  showSeekPreview(pendingSeek);
  seekCommitTimer = clearTimer(seekCommitTimer);
  seekCommitTimer = setTimeout(() => {
    const target = pendingSeek;
    pendingSeek = null;
    seekCommitTimer = null;
    if (Number.isFinite(target)) {
      playerManager.seek(target);
    }
    hideSeekPreview();
    showPause(true);
  }, 650);
}

function togglePlayback() {
  if (isPlaybackPaused()) {
    playerManager.play();
  } else {
    playerManager.pause();
  }
  showPause(true);
}

function isPlaybackPaused() {
  return playerManager.getPlayerState()
    !== cast.framework.messages.PlayerState.PLAYING;
}

function handleReceiverKey(event) {
  const key = event.key || '';
  const code = event.keyCode;
  const left = key === 'ArrowLeft' || code === 37;
  const right = key === 'ArrowRight' || code === 39;
  const up = key === 'ArrowUp' || code === 38;
  const down = key === 'ArrowDown' || code === 40;
  const enter = key === 'Enter' || key === ' ' || code === 13 || code === 23;
  const back = key === 'Escape' || key === 'Backspace' || code === 4 || code === 27;
  const playPause = key === 'MediaPlayPause' || code === 179;

  if (!(left || right || up || down || enter || back || playPause)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();

  if (isOptionsVisible()) {
    if (left || right) {
      cycleMenuSection(left ? -1 : 1);
    } else if (up || down) {
      const items = optionItems();
      if (items.length > 0) {
        menuSelection = (menuSelection + (up ? -1 : 1) + items.length) % items.length;
        renderOptions();
      }
    } else if (enter) {
      applySelectedOption();
    } else if (back) {
      hideOptions();
      showPause(true);
    }
    return;
  }

  if (left || right) {
    previewRemoteSeek(left ? -1 : 1);
  } else if (down) {
    showPause();
    showOptions('audio');
  } else if (up) {
    showPause(true);
  } else if (enter || playPause) {
    togglePlayback();
  } else if (back) {
    hidePause();
  }
}

document.addEventListener('keydown', handleReceiverKey, true);

// The live and catch-up playlists use MPEG-TS HLS segments. Keep the format
// explicit for receivers that do not infer it reliably from the playlist.
playerManager.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, loadRequest => {
  const media = loadRequest.media;
  const customData = media?.customData || loadRequest.customData || {};
  currentPresentation = presentationFor(media, customData);
  resetPresentationLayers();
  hideIdle();
  hideTransition();
  loadThumbnailCues(currentPresentation.thumbnailsPlaylistUrl, {
    imageUrl: currentPresentation.thumbnailImageUrl,
    interval: currentPresentation.thumbnailInterval,
    cols: currentPresentation.thumbnailCols,
    rows: currentPresentation.thumbnailRows,
  });
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
  playbackHasError = false;
  hideIdle();
  hideError();
  hideEnd();
  showLoader();
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
  playbackHasError = true;
  hideIdle();
  showError(code);
  sendReceiverMessage({
    type: 'receiver-error',
    code: String(code),
    details,
  });
});

playerManager.addEventListener(cast.framework.events.EventType.PLAYER_LOAD_COMPLETE, () => {
  playbackHasError = false;
  suppressNativePlayerOverlay();
  hideIdle();
  hideLoader();
  hideReceiverStatus();
  hideTransition();
  sendTrackCatalog();
});

playerManager.addEventListener(cast.framework.events.EventType.MEDIA_FINISHED, event => {
  const endedReason = event.endedReason;
  const endedNaturally = endedReason === cast.framework.events.EndedReason.END_OF_STREAM;
  if (endedNaturally && currentPresentation?.isMovie && !playbackHasError) {
    showEnd();
    return;
  }
  scheduleIdle();
});

playerManager.addEventListener(cast.framework.events.EventType.BUFFERING, event => {
  if (event.isBuffering) {
    showLoader();
  } else {
    hideLoader();
  }
});

playerManager.addEventListener(cast.framework.events.EventType.PAUSE, () => {
  hideLoader();
  showPause();
});

playerManager.addEventListener(cast.framework.events.EventType.PLAYING, () => {
  if (pauseElement?.classList.contains('visible')) {
    showPause(true);
  } else {
    hidePause();
  }
  hideEnd();
});

if (cast.framework.events.EventType.TIME_UPDATE) {
  playerManager.addEventListener(cast.framework.events.EventType.TIME_UPDATE, () => {
    if (pauseElement?.classList.contains('visible')) {
      updatePauseProgress();
    }
  });
}

playerManager.addEventListener(cast.framework.events.EventType.REQUEST_SEEK, event => {
  const position = event.requestData?.currentTime;
  if (Number.isFinite(position)) {
    showPause(true);
    showSeekPreview(position, true);
  }
});

context.addCustomMessageListener(TRACKS_CHANNEL, event => {
  try {
    const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (message?.type === 'request-tracks') {
      sendTrackCatalog();
    } else if (message?.type === 'select-tracks') {
      applyTrackSelection(message);
    } else if (message?.type === 'seek-preview') {
      if (message.visible === false) {
        hideSeekPreview();
      } else {
        showPause(true);
        showSeekPreview(Number(message.positionMs) / 1000);
      }
    } else if (message?.type === 'show-options') {
      showPause();
      showOptions(message.section || 'audio');
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

installNativePlayerOverlaySuppression();
hideLoader();
showIdle();
