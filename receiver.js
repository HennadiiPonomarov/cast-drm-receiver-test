const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const TRACKS_CHANNEL = 'urn:x-cast:tv.sweet.castdrm';
const SEEK_PREVIEW_WIDTH = 208;
const SEEK_PREVIEW_HEIGHT = 117;
const LOADER_DELAY_MS = 2000;
const SUBTITLE_STYLE_RETRY_DELAYS_MS = [0, 60, 140, 300, 600, 1000];
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
const pauseElement = document.getElementById('receiver-pause');
const pauseLabelElement = document.getElementById('receiver-pause-label');
const pauseTitleElement = document.getElementById('receiver-pause-title');
const pauseMetaElement = document.getElementById('receiver-pause-meta');
const pauseArtworkElement = document.getElementById('receiver-pause-artwork');
const pauseProgressElement = document.getElementById('receiver-pause-progress-fill');
const pauseProgressTrackElement = document.getElementById('receiver-pause-progress');
const pauseTimelineElement = document.getElementById('receiver-pause-timeline');
const pauseTimeElement = document.getElementById('receiver-pause-time');
const pauseDurationElement = document.getElementById('receiver-pause-duration');
const playStateIconElement = document.getElementById('receiver-play-state-icon');
const playLabelElement = document.getElementById('receiver-play-label');
const controlElements = Array.from(document.querySelectorAll('[data-control]'));
const rewindLabelElement = document.getElementById('receiver-rewind-label');
const forwardLabelElement = document.getElementById('receiver-forward-label');
const audioLabelElement = document.getElementById('receiver-audio-label');
const subtitlesLabelElement = document.getElementById('receiver-subtitles-label');
const qualityLabelElement = document.getElementById('receiver-quality-label');
const qualityStateIconElement = document.getElementById('receiver-quality-state-icon');
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
let loaderDelayTimer = null;
let transitionTimer = null;
let seekPreviewTimer = null;
let playbackHasError = false;
let currentPresentation = null;
let thumbnailCues = [];
let thumbnailRequestId = 0;
let thumbnailSprite = null;
let thumbnailRenderReported = false;
let thumbnailRenderKey = '';
let controlsTimer = null;
let menuSection = 'audio';
let menuSelection = 0;
let menuFocusArea = 'list';
let audioTrackCatalog = [];
let subtitleTrackCatalog = [];
let pendingSeek = null;
let previewSeekPosition = null;
let seekRepeatCount = 0;
let seekCommitTimer = null;
let seekSettleTimer = null;
let seekResetTimer = null;
let seekPreviewFrame = null;
let timelineBoundsCache = null;
let subtitleStyleApplyTimer = null;
let subtitleStyleApplyToken = 0;
let nativeOverlayObserver = null;
let controlsFocusArea = 'timeline';
let controlSelection = 1;
let suppressBackKeyUp = false;
let subtitleFontScale = 1;
let subtitleForegroundColor = '#FFFFFFFF';
let subtitleStyleDirty = false;

const CONTROL_ORDER = ['rewind', 'play', 'forward', 'audio', 'subtitles', 'quality'];
const SUBTITLE_SIZE_OPTIONS = [
  {value: 0.75, labelKey: 'small'},
  {value: 1, labelKey: 'medium'},
  {value: 1.25, labelKey: 'large'},
];
const SUBTITLE_COLOR_OPTIONS = [
  {value: '#FFFFFFFF', labelKey: 'white'},
  {value: '#FFF200FF', labelKey: 'yellow'},
  {value: '#20C5C9FF', labelKey: 'cyan'},
];

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
    subtitleSize: 'Subtitle size', subtitleColor: 'Subtitle color',
    small: 'Small', medium: 'Medium', large: 'Large',
    white: 'White', yellow: 'Yellow', cyan: 'Cyan',
    live: 'Live', recording: 'Recording', movie: 'Movie',
  },
  uk: {
    connecting: 'Підключення до телевізора', loading: 'Завантаження', buffering: 'Буферизація',
    cannotPlay: 'Не вдалося відтворити', playbackError: 'Помилка відтворення',
    waiting: 'Очікування трансляції',
    tryAgain: 'Спробуйте ще раз або виберіть інше відео.',
    paused: 'Пауза', finished: 'Відтворення завершено', code: 'Код',
    audio: 'Аудіо', subtitles: 'Субтитри', quality: 'Якість', auto: 'Авто', off: 'Вимкнено',
    subtitleSize: 'Розмір субтитрів', subtitleColor: 'Колір субтитрів',
    small: 'Малий', medium: 'Середній', large: 'Великий',
    white: 'Білий', yellow: 'Жовтий', cyan: 'Бірюзовий',
    live: 'Наживо', recording: 'Запис', movie: 'Фільм',
  },
  ru: {
    connecting: 'Подключение к телевизору', loading: 'Загрузка', buffering: 'Буферизация',
    cannotPlay: 'Не удалось воспроизвести', playbackError: 'Ошибка воспроизведения',
    waiting: 'Ожидание трансляции',
    tryAgain: 'Попробуйте ещё раз или выберите другое видео.',
    paused: 'Пауза', finished: 'Просмотр завершён', code: 'Код',
    audio: 'Аудио', subtitles: 'Субтитры', quality: 'Качество', auto: 'Авто', off: 'Выключены',
    subtitleSize: 'Размер субтитров', subtitleColor: 'Цвет субтитров',
    small: 'Маленький', medium: 'Средний', large: 'Большой',
    white: 'Белый', yellow: 'Жёлтый', cyan: 'Бирюзовый',
    live: 'Прямой эфир', recording: 'Запись', movie: 'Фильм',
  },
  sk: {
    connecting: 'Pripájanie k televízoru', loading: 'Načítava sa', buffering: 'Ukladanie do vyrovnávacej pamäte',
    cannotPlay: 'Prehrávanie nie je možné', playbackError: 'Chyba prehrávania',
    waiting: 'Čaká sa na vysielanie',
    tryAgain: 'Skúste to znova alebo vyberte iné video.',
    paused: 'Pozastavené', finished: 'Prehrávanie sa skončilo', code: 'Kód',
    audio: 'Zvuk', subtitles: 'Titulky', quality: 'Kvalita', auto: 'Automaticky', off: 'Vypnuté',
    subtitleSize: 'Veľkosť titulkov', subtitleColor: 'Farba titulkov',
    small: 'Malé', medium: 'Stredné', large: 'Veľké',
    white: 'Biela', yellow: 'Žltá', cyan: 'Tyrkysová',
    live: 'Naživo', recording: 'Záznam', movie: 'Film',
  },
  cs: {
    connecting: 'Připojování k televizoru', loading: 'Načítání', buffering: 'Ukládání do vyrovnávací paměti',
    cannotPlay: 'Nelze přehrát', playbackError: 'Chyba přehrávání',
    waiting: 'Čekání na vysílání',
    tryAgain: 'Zkuste to znovu nebo vyberte jiné video.',
    paused: 'Pozastaveno', finished: 'Přehrávání skončilo', code: 'Kód',
    audio: 'Zvuk', subtitles: 'Titulky', quality: 'Kvalita', auto: 'Automaticky', off: 'Vypnuto',
    subtitleSize: 'Velikost titulků', subtitleColor: 'Barva titulků',
    small: 'Malé', medium: 'Střední', large: 'Velké',
    white: 'Bílá', yellow: 'Žlutá', cyan: 'Tyrkysová',
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

const seekControlLabels = {
  en: ['30 sec.\nbackward', '30 sec.\nforward'],
  uk: ['30 сек.\nназад', '30 сек.\nвперед'],
  ru: ['30 сек.\nназад', '30 сек.\nвперёд'],
  sk: ['30 s.\ndozadu', '30 s.\ndopredu'],
  cs: ['30 s.\ndozadu', '30 s.\ndopředu'],
  hu: ['30 mp.\nvissza', '30 mp.\nelőre'],
  bg: ['30 сек.\nназад', '30 сек.\nнапред'],
  pl: ['30 sek.\nwstecz', '30 sek.\nnaprzód'],
  ro: ['30 sec.\nînapoi', '30 sec.\nînainte'],
  az: ['30 san.\ngeriyə', '30 san.\nirəli'],
  sq: ['30 sek.\npas', '30 sek.\npara'],
  lv: ['30 sek.\natpakaļ', '30 sek.\nuz priekšu'],
  et: ['30 sek.\ntagasi', '30 sek.\nedasi'],
  el: ['30 δευτ.\nπίσω', '30 δευτ.\nμπροστά'],
  lt: ['30 sek.\natgal', '30 sek.\nį priekį'],
  sr: ['30 sek.\nnazad', '30 sek.\nnapred'],
  mk: ['30 сек.\nнаназад', '30 сек.\nнапред'],
  bs: ['30 sek.\nnazad', '30 sek.\nnaprijed'],
  sl: ['30 sek.\nnazaj', '30 sek.\nnaprej'],
  hr: ['30 sek.\nnatrag', '30 sek.\nnaprijed'],
};

const playbackControlLabels = {
  en: ['Play', 'Pause'],
  uk: ['Відтворити', 'Пауза'],
  ru: ['Играть', 'Пауза'],
  sk: ['Prehrať', 'Pozastaviť'],
  cs: ['Přehrát', 'Pozastavit'],
  hu: ['Lejátszás', 'Szünet'],
  bg: ['Пусни', 'Пауза'],
  pl: ['Odtwórz', 'Pauza'],
  ro: ['Redare', 'Pauză'],
  az: ['Oynat', 'Fasilə'],
  sq: ['Luaj', 'Pauzë'],
  lv: ['Atskaņot', 'Pauze'],
  et: ['Esita', 'Peata'],
  el: ['Αναπαραγωγή', 'Παύση'],
  lt: ['Leisti', 'Pristabdyti'],
  sr: ['Pusti', 'Pauza'],
  mk: ['Пушти', 'Пауза'],
  bs: ['Pusti', 'Pauza'],
  sl: ['Predvajaj', 'Premor'],
  hr: ['Reproduciraj', 'Pauza'],
};

function translate(key) {
  const language = receiverLocale.split('-')[0];
  return (translations[language] || translations.en)[key] || translations.en[key];
}

function seekControlLabel(direction) {
  const language = receiverLocale.split('-')[0];
  const labels = seekControlLabels[language] || seekControlLabels.en;
  return labels[direction < 0 ? 0 : 1];
}

function playbackControlLabel(paused) {
  const language = receiverLocale.split('-')[0];
  const labels = playbackControlLabels[language] || playbackControlLabels.en;
  return labels[paused ? 0 : 1];
}

function qualityIconPath(maxHeight) {
  const height = Number(maxHeight);
  if (!Number.isFinite(height) || height < 0) {
    return 'assets/player/auto.svg';
  }
  if (height < 720) {
    return 'assets/player/sd.svg';
  }
  if (height < 1080) {
    return 'assets/player/hd.svg';
  }
  if (height < 1440) {
    return 'assets/player/fhd.svg';
  }
  if (height < 2160) {
    return 'assets/player/2k.svg';
  }
  return 'assets/player/4k.svg';
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
    selectedAudioId: Number.isFinite(Number(customData.selectedAudioId))
      ? Number(customData.selectedAudioId)
      : -1,
    selectedSubtitleId: Number.isFinite(Number(customData.selectedSubtitleId))
      ? Number(customData.selectedSubtitleId)
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

function hidePause() {
  controlsTimer = clearTimer(controlsTimer);
  hideOptions();
  setLayerVisible(pauseElement, false);
  hideSeekPreview();
}

function controlsAreVisible() {
  return Boolean(pauseElement?.classList.contains('visible'));
}

function renderControlsFocus() {
  pauseTimelineElement?.classList.toggle('focused', controlsFocusArea === 'timeline');
  controlElements.forEach(element => {
    const index = CONTROL_ORDER.indexOf(element.dataset.control);
    element.classList.toggle(
      'focused',
      controlsFocusArea === 'actions' && index === controlSelection);
  });
}

function setControlsFocus(area, selection = controlSelection) {
  controlsFocusArea = area === 'actions' ? 'actions' : 'timeline';
  if (controlsFocusArea === 'actions') {
    controlSelection = Math.max(0, Math.min(CONTROL_ORDER.length - 1, selection));
  }
  renderControlsFocus();
}

function cacheTimelineBounds() {
  const bounds = pauseProgressTrackElement?.getBoundingClientRect();
  timelineBoundsCache = bounds?.width > 0
    ? {left: bounds.left, width: bounds.width}
    : null;
}

function scheduleControlsHide(delay = 2800) {
  controlsTimer = clearTimer(controlsTimer);
  controlsTimer = setTimeout(() => {
    controlsTimer = null;
    const state = playerManager.getPlayerState();
    if (state === cast.framework.messages.PlayerState.PAUSED) {
      return;
    }
    if (state === cast.framework.messages.PlayerState.PLAYING) {
      hidePause();
      sendReceiverMessage({
        type: 'controls-status',
        state: 'hidden',
        reason: 'auto',
      });
      return;
    }
    scheduleControlsHide(700);
  }, delay);
}

function updatePauseProgress(positionOverride = null, durationOverride = null) {
  const hasPositionOverride = positionOverride !== null
    && Number.isFinite(Number(positionOverride));
  const actualPosition = hasPositionOverride
    ? Number(positionOverride)
    : playerManager.getCurrentTimeSec();
  const isScrubbing = positionOverride !== null
    || pendingSeek !== null
    || previewSeekPosition !== null;
  const position = positionOverride !== null && Number.isFinite(Number(positionOverride))
    ? Number(positionOverride)
    : (pendingSeek !== null && Number.isFinite(Number(pendingSeek))
      ? Number(pendingSeek)
      : (previewSeekPosition !== null && Number.isFinite(Number(previewSeekPosition))
        ? Number(previewSeekPosition)
        : actualPosition));
  const duration = durationOverride !== null && Number.isFinite(Number(durationOverride))
    ? Number(durationOverride)
    : playerManager.getDurationSec();
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
  pauseTimelineElement?.classList.toggle('scrubbing', isScrubbing);
  if (pauseTimeElement) {
    pauseTimeElement.textContent = boundedDuration > 0 ? formatTime(position) : presentationBadge();
  }
  if (pauseDurationElement) {
    pauseDurationElement.textContent = boundedDuration > 0 ? formatTime(boundedDuration) : '';
  }
}

function updateControlLabels() {
  if (rewindLabelElement) {
    rewindLabelElement.textContent = seekControlLabel(-1);
  }
  if (forwardLabelElement) {
    forwardLabelElement.textContent = seekControlLabel(1);
  }
  if (playLabelElement) {
    playLabelElement.textContent = playbackControlLabel(isPlaybackPaused());
  }
  if (audioLabelElement) {
    audioLabelElement.textContent = translate('audio');
  }
  if (subtitlesLabelElement) {
    subtitlesLabelElement.textContent = translate('subtitles');
  }
  if (qualityLabelElement) {
    qualityLabelElement.textContent = translate('quality');
  }
  if (qualityStateIconElement) {
    qualityStateIconElement.src = qualityIconPath(currentPresentation?.maxHeight);
  }
}

function showPause(autoHide = false) {
  if (!currentPresentation?.title || playbackHasError) {
    return;
  }
  if (isOptionsVisible()) {
    setLayerVisible(pauseElement, false);
    return;
  }
  const wasVisible = controlsAreVisible();
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
  if (pauseArtworkElement) {
    pauseArtworkElement.hidden = !currentPresentation.artworkUrl;
    pauseArtworkElement.classList.toggle(
      'channel',
      Boolean(currentPresentation.isLive || currentPresentation.isRecording));
    if (currentPresentation.artworkUrl) {
      pauseArtworkElement.src = currentPresentation.artworkUrl;
    }
  }
  updatePauseProgress();
  updateControlLabels();
  if (playStateIconElement) {
    playStateIconElement.src = isPlaybackPaused()
      ? 'assets/player/play.svg'
      : 'assets/player/pause.svg';
  }
  setLayerVisible(pauseElement, true);
  if (!timelineBoundsCache) {
    requestAnimationFrame(cacheTimelineBounds);
  }
  if (!wasVisible) {
    setControlsFocus('timeline');
  } else {
    renderControlsFocus();
  }
  controlsTimer = clearTimer(controlsTimer);
  if (autoHide) {
    scheduleControlsHide();
  }
}

function normalizedRgba(value) {
  return String(value || '').trim().toUpperCase();
}

function syncSubtitleStyleState() {
  if (subtitleStyleDirty) {
    return;
  }
  try {
    const style = playerManager.getTextTracksManager().getTextTracksStyle();
    if (Number.isFinite(Number(style?.fontScale))) {
      subtitleFontScale = Number(style.fontScale);
    }
    if (style?.foregroundColor) {
      subtitleForegroundColor = normalizedRgba(style.foregroundColor);
    }
  } catch (error) {
    console.warn('[SWEET Receiver] Subtitle style is not ready', error);
  }
}

function applySubtitleStyle(markDirty = true) {
  if (markDirty) {
    // Keep the choice even when no text track is active yet. Some CAF
    // receivers reject styling until a subtitle track has been enabled.
    subtitleStyleDirty = true;
  }
  try {
    const manager = playerManager.getTextTracksManager();
    const current = manager.getTextTracksStyle();
    const style = new cast.framework.messages.TextTrackStyle();
    if (current) {
      Object.assign(style, current);
    }
    style.fontScale = subtitleFontScale;
    style.foregroundColor = subtitleForegroundColor;
    manager.setTextTrackStyle(style);
  } catch (error) {
    console.warn('[SWEET Receiver] Cannot apply subtitle style', error);
  }
}

function cancelSubtitleStyleRestore() {
  subtitleStyleApplyTimer = clearTimer(subtitleStyleApplyTimer);
  subtitleStyleApplyToken += 1;
}

function scheduleSubtitleStyleRestore(expectedIds) {
  cancelSubtitleStyleRestore();
  const activeIds = Array.isArray(expectedIds) ? expectedIds : [];
  if (activeIds.length === 0 || !subtitleStyleDirty) {
    return;
  }
  const token = subtitleStyleApplyToken;
  let attempt = 0;
  const restore = () => {
    subtitleStyleApplyTimer = null;
    if (token !== subtitleStyleApplyToken) {
      return;
    }
    try {
      const manager = playerManager.getTextTracksManager();
      const enabledIds = manager.getActiveIds();
      if (activeIds.every(id => enabledIds.includes(id))) {
        applySubtitleStyle(false);
      }
    } catch (error) {
      console.warn('[SWEET Receiver] Subtitle activation is not ready', error);
    }
    attempt += 1;
    if (attempt < SUBTITLE_STYLE_RETRY_DELAYS_MS.length) {
      subtitleStyleApplyTimer = setTimeout(
        restore,
        SUBTITLE_STYLE_RETRY_DELAYS_MS[attempt]);
    }
  };
  subtitleStyleApplyTimer = setTimeout(
    restore,
    SUBTITLE_STYLE_RETRY_DELAYS_MS[attempt]);
}

function setActiveSubtitleIds(ids) {
  const activeIds = Array.isArray(ids) ? ids : [];
  const manager = playerManager.getTextTracksManager();
  cancelSubtitleStyleRestore();
  if (activeIds.length > 0 && subtitleStyleDirty) {
    // Apply before activation as well: receivers differ in whether the text
    // renderer reads the current style before or after setActiveByIds().
    applySubtitleStyle(false);
  }
  manager.setActiveByIds(activeIds);
  scheduleSubtitleStyleRestore(activeIds);
}

function optionItems(section = menuSection) {
  if (section === 'audio') {
    return audioTrackCatalog.map(track => ({
      id: track.trackId,
      kind: 'audio-track',
      label: track.name || track.language || String(track.trackId),
      selected: track.trackId === playerManager.getAudioTracksManager().getActiveId(),
    }));
  }
  if (section === 'subtitles') {
    const activeIds = playerManager.getTextTracksManager().getActiveIds();
    return [
      {
        id: -1,
        kind: 'subtitle-track',
        label: translate('off'),
        selected: activeIds.length === 0,
      },
      ...subtitleTrackCatalog.map(track => ({
        id: track.trackId,
        kind: 'subtitle-track',
        label: track.name || track.language || String(track.trackId),
        selected: activeIds.includes(track.trackId),
      })),
      {
        id: 'subtitle-size-heading',
        kind: 'heading',
        label: translate('subtitleSize'),
        selectable: false,
      },
      ...SUBTITLE_SIZE_OPTIONS.map(option => ({
        id: `subtitle-size-${option.value}`,
        kind: 'subtitle-size',
        value: option.value,
        label: translate(option.labelKey),
        selected: Math.abs(subtitleFontScale - option.value) < 0.01,
      })),
      {
        id: 'subtitle-color-heading',
        kind: 'heading',
        label: translate('subtitleColor'),
        selectable: false,
      },
      ...SUBTITLE_COLOR_OPTIONS.map(option => ({
        id: `subtitle-color-${option.labelKey}`,
        kind: 'subtitle-color',
        value: option.value,
        swatch: option.value,
        label: translate(option.labelKey),
        selected: normalizedRgba(subtitleForegroundColor) === normalizedRgba(option.value),
      })),
    ];
  }
  return (currentPresentation?.qualityOptions || []).map(option => ({
    id: option.maxHeight,
    kind: 'quality',
    label: option.label,
    selected: option.maxHeight === currentPresentation.maxHeight
      || (option.maxHeight < 0 && currentPresentation.maxHeight < 0),
  }));
}

function isSelectableOption(item) {
  return Boolean(item && item.selectable !== false && item.kind !== 'heading');
}

function nearestSelectableIndex(items, index, direction = 1) {
  if (items.length === 0) {
    return 0;
  }
  let next = Math.max(0, Math.min(items.length - 1, index));
  for (let attempts = 0; attempts < items.length; attempts += 1) {
    if (isSelectableOption(items[next])) {
      return next;
    }
    next = (next + direction + items.length) % items.length;
  }
  return 0;
}

function renderOptions() {
  const items = optionItems();
  menuSelection = Math.max(0, Math.min(menuSelection, Math.max(0, items.length - 1)));
  if (optionsTitleElement) {
    optionsTitleElement.textContent = translate(menuSection);
  }
  document.getElementById('receiver-options-close')
    ?.classList.toggle('focused', menuFocusArea === 'close');
  if (optionsListElement) {
    optionsListElement.textContent = '';
    items.forEach((item, index) => {
      const row = document.createElement('div');
      if (item.kind === 'heading') {
        row.className = 'receiver-option-row group';
        const heading = document.createElement('span');
        heading.className = 'receiver-option-label';
        heading.textContent = item.label;
        row.appendChild(heading);
        optionsListElement.appendChild(row);
        return;
      }
      row.className = [
        'receiver-option-row',
        menuFocusArea === 'list' && index === menuSelection ? 'focused' : '',
        item.selected ? 'active' : '',
      ].filter(Boolean).join(' ');
      if (item.swatch) {
        const swatch = document.createElement('span');
        swatch.className = 'receiver-option-swatch';
        swatch.style.background = item.swatch.slice(0, 7);
        row.appendChild(swatch);
      }
      const label = document.createElement('span');
      label.className = 'receiver-option-label';
      label.textContent = item.label;
      const check = document.createElement('span');
      check.className = 'receiver-option-check';
      row.append(label, check);
      optionsListElement.appendChild(row);
    });
    requestAnimationFrame(() => {
      optionsListElement.querySelector('.receiver-option-row.focused')
        ?.scrollIntoView({block: 'nearest'});
    });
  }
}

function showOptions(section = menuSection) {
  menuSection = section;
  menuFocusArea = 'list';
  updateControlLabels();
  if (section === 'subtitles') {
    syncSubtitleStyleState();
  }
  const items = optionItems();
  const selectedIndex = items.findIndex(item => item.selected);
  menuSelection = nearestSelectableIndex(items, selectedIndex >= 0 ? selectedIndex : 0);
  renderOptions();
  controlsTimer = clearTimer(controlsTimer);
  hideSeekPreview();
  setLayerVisible(pauseElement, false);
  optionsElement?.classList.add('visible');
  optionsElement?.setAttribute('aria-hidden', 'false');
}

function hideOptions() {
  optionsElement?.classList.remove('visible');
  optionsElement?.setAttribute('aria-hidden', 'true');
  menuFocusArea = 'list';
}

function activeTrackSelection() {
  const audioId = playerManager.getAudioTracksManager().getActiveId();
  const subtitleIds = playerManager.getTextTracksManager().getActiveIds();
  return {
    audioId: Number.isFinite(Number(audioId)) ? Number(audioId) : -1,
    subtitleId: subtitleIds.length > 0 ? Number(subtitleIds[0]) : -1,
  };
}

function notifyTrackSelection() {
  sendReceiverMessage({
    type: 'track-selection',
    ...activeTrackSelection(),
  });
}

function applySelectedOption() {
  const item = optionItems()[menuSelection];
  if (!isSelectableOption(item)) {
    return;
  }
  if (item.kind === 'audio-track') {
    playerManager.getAudioTracksManager().setActiveById(item.id);
    setTimeout(notifyTrackSelection, 0);
  } else if (item.kind === 'subtitle-track') {
    setActiveSubtitleIds(item.id < 0 ? [] : [item.id]);
    setTimeout(notifyTrackSelection, 0);
  } else if (item.kind === 'subtitle-size') {
    subtitleFontScale = item.value;
    applySubtitleStyle();
  } else if (item.kind === 'subtitle-color') {
    subtitleForegroundColor = item.value;
    applySubtitleStyle();
  } else if (item.kind === 'quality') {
    const tracks = activeTrackSelection();
    sendReceiverMessage({
      type: 'quality-request',
      maxHeight: item.id,
      positionMs: Math.round(playerManager.getCurrentTimeSec() * 1000),
      audioId: tracks.audioId,
      subtitleId: tracks.subtitleId,
    });
    currentPresentation.maxHeight = item.id;
    updateControlLabels();
  }
  menuFocusArea = 'close';
  renderOptions();
  for (const delay of [0, 100, 300]) {
    setTimeout(() => {
      if (isOptionsVisible() && menuFocusArea === 'close') {
        renderOptions();
      }
    }, delay);
  }
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
  thumbnailRenderReported = false;
  thumbnailRenderKey = '';
  thumbnailSprite = sprite?.imageUrl && sprite.interval > 0 && sprite.cols > 0 && sprite.rows > 0
    ? sprite
    : null;
  sendReceiverMessage({
    type: 'thumbnail-status',
    state: 'metadata',
    playlist: Boolean(playlistUrl),
    sprite: Boolean(thumbnailSprite),
    cueCount: 0,
  });
  if (!playlistUrl) {
    return;
  }
  try {
    const response = await fetch(playlistUrl, {credentials: 'omit'});
    if (!response.ok) {
      sendReceiverMessage({
        type: 'thumbnail-status',
        state: 'playlist-error',
        playlist: true,
        sprite: Boolean(thumbnailSprite),
        cueCount: 0,
      });
      return;
    }
    const cues = parseThumbnailVtt(await response.text(), playlistUrl);
    if (requestId === thumbnailRequestId) {
      thumbnailCues = cues;
      sendReceiverMessage({
        type: 'thumbnail-status',
        state: 'ready',
        playlist: true,
        sprite: Boolean(thumbnailSprite),
        cueCount: cues.length,
      });
    }
  } catch (_) {
    sendReceiverMessage({
      type: 'thumbnail-status',
      state: 'playlist-error',
      playlist: true,
      sprite: Boolean(thumbnailSprite),
      cueCount: 0,
    });
    // A missing thumbnail preview must not affect playback.
  }
}

function thumbnailCueAt(positionSeconds) {
  let low = 0;
  let high = thumbnailCues.length - 1;
  let cue = null;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = thumbnailCues[middle];
    if (positionSeconds < candidate.start) {
      high = middle - 1;
    } else if (positionSeconds >= candidate.end) {
      low = middle + 1;
    } else {
      cue = candidate;
      break;
    }
  }
  if (!cue && low < thumbnailCues.length && positionSeconds < thumbnailCues[low].end) {
    cue = thumbnailCues[low];
  }
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

function applyThumbnailCrop(cue) {
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
  const scale = Math.min(SEEK_PREVIEW_WIDTH / width, SEEK_PREVIEW_HEIGHT / height);
  seekFrameElement.style.width = `${Math.round(width * scale)}px`;
  seekFrameElement.style.height = `${Math.round(height * scale)}px`;
  seekImageElement.style.width = `${Math.round(seekImageElement.naturalWidth * scale)}px`;
  seekImageElement.style.height = `${Math.round(seekImageElement.naturalHeight * scale)}px`;
  seekImageElement.style.left = `${Math.round(-x * scale)}px`;
  seekImageElement.style.top = `${Math.round(-y * scale)}px`;
  seekImageElement.style.display = 'block';
  if (!thumbnailRenderReported) {
    thumbnailRenderReported = true;
    sendReceiverMessage({
      type: 'thumbnail-status',
      state: 'rendered',
      playlist: thumbnailCues.length > 0,
      sprite: Boolean(thumbnailSprite),
      cueCount: thumbnailCues.length,
    });
  }
}

function renderThumbnailCue(cue) {
  if (!seekImageElement || !seekFrameElement) {
    return;
  }
  if (!cue?.imageUrl) {
    thumbnailRenderKey = '';
    seekFrameElement.hidden = true;
    seekImageElement.style.display = 'none';
    return;
  }
  const cropKey = Array.isArray(cue.crop) ? cue.crop.join(',') : cue.spriteFrame;
  const renderKey = `${cue.imageUrl}|${cropKey ?? 'full'}`;
  if (thumbnailRenderKey === renderKey && seekImageElement.style.display !== 'none') {
    return;
  }
  thumbnailRenderKey = renderKey;
  seekFrameElement.hidden = false;
  seekImageElement.onload = () => applyThumbnailCrop(cue);
  seekImageElement.onerror = () => {
    seekImageElement.style.display = 'none';
    if (!thumbnailRenderReported) {
      thumbnailRenderReported = true;
      sendReceiverMessage({
        type: 'thumbnail-status',
        state: 'image-error',
        playlist: thumbnailCues.length > 0,
        sprite: Boolean(thumbnailSprite),
        cueCount: thumbnailCues.length,
      });
    }
  };
  if (seekImageElement.dataset.sourceUrl === cue.imageUrl
      && seekImageElement.complete && seekImageElement.naturalWidth > 0) {
    applyThumbnailCrop(cue);
    return;
  }
  seekImageElement.dataset.sourceUrl = cue.imageUrl;
  seekImageElement.src = cue.imageUrl;
}

function showSeekPreview(positionSeconds, autoHide = false, durationOverride = null) {
  const position = Math.max(0, Number(positionSeconds) || 0);
  previewSeekPosition = position;
  seekPreviewTimer = clearTimer(seekPreviewTimer);
  const duration = durationOverride !== null && Number.isFinite(Number(durationOverride))
    ? Number(durationOverride)
    : playerManager.getDurationSec();
  updatePauseProgress(position, duration);
  if (seekTimeElement) {
    seekTimeElement.textContent = formatTime(position);
  }
  renderThumbnailCue(thumbnailCueAt(position));
  if (seekPreviewElement) {
    if (Number.isFinite(duration) && duration > 0) {
      const ratio = Math.max(0, Math.min(1, position / duration));
      const timelineBounds = timelineBoundsCache;
      if (timelineBounds?.width > 0) {
        const previewHalfWidth = (SEEK_PREVIEW_WIDTH / 2) + 12;
        const timelineX = timelineBounds.left + (timelineBounds.width * ratio);
        const clampedX = Math.max(
          previewHalfWidth,
          Math.min(window.innerWidth - previewHalfWidth, timelineX));
        seekPreviewElement.style.left = `${clampedX}px`;
      } else {
        seekPreviewElement.style.left = `${Math.max(10, Math.min(90, ratio * 100))}%`;
      }
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
  if (seekPreviewFrame !== null) {
    cancelAnimationFrame(seekPreviewFrame);
    seekPreviewFrame = null;
  }
  previewSeekPosition = null;
  if (seekPreviewElement) {
    seekPreviewElement.classList.remove('visible');
  }
  if (controlsAreVisible()) {
    updatePauseProgress();
  }
}

function resetPresentationLayers() {
  pendingSeek = null;
  previewSeekPosition = null;
  if (seekPreviewFrame !== null) {
    cancelAnimationFrame(seekPreviewFrame);
    seekPreviewFrame = null;
  }
  seekCommitTimer = clearTimer(seekCommitTimer);
  seekSettleTimer = clearTimer(seekSettleTimer);
  seekResetTimer = clearTimer(seekResetTimer);
  cancelSubtitleStyleRestore();
  seekRepeatCount = 0;
  timelineBoundsCache = null;
  pauseTimelineElement?.classList.remove('scrubbing');
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
  if (!loaderElement || loaderElement.classList.contains('visible')
      || loaderDelayTimer !== null) {
    return;
  }
  loaderDelayTimer = setTimeout(() => {
    loaderDelayTimer = null;
    loaderElement.classList.add('visible');
  }, LOADER_DELAY_MS);
}

function hideLoader() {
  loaderDelayTimer = clearTimer(loaderDelayTimer);
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
    const activeTracks = activeTrackSelection();
    sendReceiverMessage({
      type: 'tracks',
      audio: audioTracks,
      subtitles: subtitleTracks,
      audioId: activeTracks.audioId,
      subtitleId: activeTracks.subtitleId,
    });
  } catch (error) {
    console.warn('[SWEET Receiver] Track catalog is not ready', error);
  }
}

function restoreRequestedTrackSelection() {
  if (!currentPresentation) {
    return;
  }
  try {
    const audioManager = playerManager.getAudioTracksManager();
    const textManager = playerManager.getTextTracksManager();
    if (currentPresentation.selectedAudioId >= 0
        && audioManager.getTrackById(currentPresentation.selectedAudioId)) {
      audioManager.setActiveById(currentPresentation.selectedAudioId);
    }
    if (currentPresentation.selectedSubtitleId >= 0
        && textManager.getTrackById(currentPresentation.selectedSubtitleId)) {
      setActiveSubtitleIds([currentPresentation.selectedSubtitleId]);
    } else {
      setActiveSubtitleIds([]);
    }
  } catch (error) {
    console.warn('[SWEET Receiver] Requested tracks are not ready', error);
  }
}

function applyTrackSelection(message) {
  const audioId = Number(message.audioId);
  const subtitleId = Number(message.subtitleId);
  const audioManager = playerManager.getAudioTracksManager();
  if (Number.isFinite(audioId) && audioId >= 0) {
    audioManager.setActiveById(audioId);
  }
  setActiveSubtitleIds(
    Number.isFinite(subtitleId) && subtitleId >= 0 ? [subtitleId] : []);
  notifyTrackSelection();
}

function isOptionsVisible() {
  return Boolean(optionsElement?.classList.contains('visible'));
}

function moveMenuSelection(direction) {
  const items = optionItems();
  if (items.length === 0) {
    return;
  }
  let next = menuSelection;
  menuFocusArea = 'list';
  for (let attempts = 0; attempts < items.length; attempts += 1) {
    next = (next + direction + items.length) % items.length;
    if (isSelectableOption(items[next])) {
      menuSelection = next;
      renderOptions();
      return;
    }
  }
}

function focusedControlName() {
  return CONTROL_ORDER[controlSelection] || 'play';
}

function showOptionsForControl(control) {
  if (control === 'audio' || control === 'subtitles' || control === 'quality') {
    showOptions(control);
    return true;
  }
  return false;
}

function activateFocusedControl() {
  const control = focusedControlName();
  if (control === 'rewind') {
    previewRemoteSeek(-1);
  } else if (control === 'play') {
    togglePlayback();
  } else if (control === 'forward') {
    previewRemoteSeek(1);
  } else {
    showOptionsForControl(control);
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
  if (!controlsAreVisible()) {
    showPause();
  }
  if (seekPreviewFrame === null) {
    seekPreviewFrame = requestAnimationFrame(() => {
      seekPreviewFrame = null;
      showSeekPreview(pendingSeek, false, duration);
    });
  }
  seekCommitTimer = clearTimer(seekCommitTimer);
  seekCommitTimer = setTimeout(() => {
    const target = pendingSeek;
    seekCommitTimer = null;
    if (Number.isFinite(target)) {
      playerManager.seek(target);
    }
    hideSeekPreview();
    showPause(true);
    seekSettleTimer = clearTimer(seekSettleTimer);
    seekSettleTimer = setTimeout(() => {
      pendingSeek = null;
      seekSettleTimer = null;
      if (controlsAreVisible()) {
        updatePauseProgress();
      }
    }, 2500);
  }, 360);
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

function isBackKeyEvent(event) {
  const key = event.key || '';
  const code = event.keyCode;
  return key === 'Escape'
    || key === 'Backspace'
    || key === 'GoBack'
    || key === 'BrowserBack'
    || code === 4
    || code === 8
    || code === 27
    || code === 461
    || code === 10009;
}

function consumeRemoteKey(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function handleReceiverKey(event) {
  const key = event.key || '';
  const code = event.keyCode;
  const left = key === 'ArrowLeft' || code === 37;
  const right = key === 'ArrowRight' || code === 39;
  const up = key === 'ArrowUp' || code === 38;
  const down = key === 'ArrowDown' || code === 40;
  const enter = key === 'Enter' || key === ' ' || code === 13 || code === 23;
  const back = isBackKeyEvent(event);
  const playPause = key === 'MediaPlayPause' || code === 179;

  if (!(left || right || up || down || enter || back || playPause)) {
    return;
  }

  if (back && !isOptionsVisible() && !controlsAreVisible()) {
    return;
  }
  consumeRemoteKey(event);

  if (isOptionsVisible()) {
    if (menuFocusArea === 'close') {
      if (enter || back || left) {
        suppressBackKeyUp = back;
        hideOptions();
        showPause(true);
      } else if (up || down) {
        menuFocusArea = 'list';
        if (up) {
          const items = optionItems();
          menuSelection = nearestSelectableIndex(items, items.length - 1, -1);
        }
        renderOptions();
      }
    } else if (up || down) {
      moveMenuSelection(up ? -1 : 1);
    } else if (right) {
      menuFocusArea = 'close';
      renderOptions();
    } else if (enter) {
      applySelectedOption();
    } else if (back || left) {
      suppressBackKeyUp = back;
      hideOptions();
      showPause(true);
    }
    return;
  }

  if (back) {
    suppressBackKeyUp = true;
    hidePause();
    return;
  }

  if (!controlsAreVisible()) {
    showPause(true);
  }

  if (playPause) {
    togglePlayback();
    return;
  }

  if (controlsFocusArea === 'timeline') {
    if (left || right) {
      previewRemoteSeek(left ? -1 : 1);
    } else if (down) {
      setControlsFocus('actions', 1);
      showPause(true);
    } else if (enter) {
      togglePlayback();
    } else if (up) {
      showPause(true);
    }
    return;
  }

  if (left || right) {
    const direction = left ? -1 : 1;
    controlSelection = (
      controlSelection + direction + CONTROL_ORDER.length
    ) % CONTROL_ORDER.length;
    setControlsFocus('actions', controlSelection);
    showPause(true);
  } else if (up) {
    setControlsFocus('timeline');
    showPause(true);
  } else if (down) {
    if (!showOptionsForControl(focusedControlName())) {
      showPause(true);
    }
  } else if (enter) {
    activateFocusedControl();
  }
}

function handleReceiverKeyUp(event) {
  if (suppressBackKeyUp && isBackKeyEvent(event)) {
    consumeRemoteKey(event);
    suppressBackKeyUp = false;
  }
}

window.addEventListener('keydown', handleReceiverKey, true);
window.addEventListener('keyup', handleReceiverKeyUp, true);
window.addEventListener('resize', () => {
  timelineBoundsCache = null;
  if (controlsAreVisible()) {
    requestAnimationFrame(cacheTimelineBounds);
  }
});

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
  restoreRequestedTrackSelection();
  if (subtitleStyleDirty) {
    applySubtitleStyle(false);
  } else {
    syncSubtitleStyleState();
  }
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
  hideLoader();
  if (isOptionsVisible()) {
    setLayerVisible(pauseElement, false);
  } else if (pauseElement?.classList.contains('visible')) {
    showPause(true);
  } else {
    hidePause();
  }
  hideEnd();
});

if (cast.framework.events.EventType.TIME_UPDATE) {
  playerManager.addEventListener(cast.framework.events.EventType.TIME_UPDATE, () => {
    if (pendingSeek !== null) {
      const actualPosition = playerManager.getCurrentTimeSec();
      if (Number.isFinite(actualPosition) && Math.abs(actualPosition - pendingSeek) < 2.5) {
        pendingSeek = null;
        seekSettleTimer = clearTimer(seekSettleTimer);
      }
    }
    if (playerManager.getPlayerState() === cast.framework.messages.PlayerState.PLAYING) {
      hideLoader();
    }
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
        scheduleControlsHide(1800);
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
