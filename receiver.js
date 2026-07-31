const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();
const TRACKS_CHANNEL = 'urn:x-cast:tv.sweet.castdrm';
const SEEK_PREVIEW_WIDTH = 208;
const SEEK_PREVIEW_HEIGHT = 117;
const LOADER_DELAY_MS = 2000;
const SEEK_COMMIT_DELAY_MS = 220;
const SEEK_SETTLE_TIMEOUT_MS = 3500;
const PRESENTATION_START_TERMINAL_GUARD_MS = 4000;
const PLAYING_TERMINAL_GUARD_MS = 1000;
const SUBTITLE_STYLE_RETRY_DELAYS_MS = [0, 60, 140, 300, 600, 1000];
const TRACK_RESTORE_RETRY_DELAYS_MS = [0, 80, 180, 350, 700, 1200, 2000];
const LOCAL_SUBTITLE_SELECTION_LOCK_MS = 10000;
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
const channelInfoElement = document.getElementById('receiver-channel-info');
const channelArtworkElement = document.getElementById('receiver-channel-artwork');
const channelNameElement = document.getElementById('receiver-channel-name');
const channelEpgElement = document.getElementById('receiver-channel-epg');
const pauseProgressElement = document.getElementById('receiver-pause-progress-fill');
const pauseProgressTrackElement = document.getElementById('receiver-pause-progress');
const pauseTimelineElement = document.getElementById('receiver-pause-timeline');
const pauseLiveBadgeElement = document.getElementById('receiver-pause-live-badge');
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
const optionsFooterElement = document.getElementById('receiver-options-footer');
const optionsCloseElement = document.getElementById('receiver-options-close');
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
let playbackStopped = false;
let playbackEnded = false;
let currentPresentation = null;
let thumbnailCues = [];
let thumbnailRequestId = 0;
let thumbnailSprite = null;
let thumbnailRenderReported = false;
let thumbnailRenderKey = '';
let controlsTimer = null;
let controlsGeneration = 0;
let menuSection = 'audio';
let menuSelection = 0;
let menuFocusArea = 'list';
let menuReturnControl = 'audio';
let pendingControlAfterLoad = null;
let showControlsOnNextPlayback = false;
let presentationTerminalGuardUntil = 0;
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
let trackRestoreTimer = null;
let trackRestoreToken = 0;
let localSubtitleSelectionLock = null;
let nativeOverlayObserver = null;
let subtitleUiObservers = [];
let subtitleUiObservedRoots = new WeakSet();
let controlsFocusArea = 'timeline';
let controlSelection = 1;
let suppressBackKeyUp = false;
let suppressStopKeyUp = false;
let subtitleFontScale = 1;
let subtitleForegroundColor = '#FFFFFFFF';
let subtitleBackgroundColor = '#00000001';
let subtitleWindowColor = '#00000001';
let subtitleWindowType =
  cast.framework.messages.TextTrackWindowType.ROUNDED_CORNERS;
let subtitleEdgeType =
  cast.framework.messages.TextTrackEdgeType.DROP_SHADOW;
let subtitleEdgeColor = '#000000FF';
// Subtitle appearance belongs to the receiver. Sender devices only select a
// language track and must not replace the TV-side style.
let subtitleStyleDirty = true;
let playbackPaused = false;
let subtitlesLifted = false;

const CONTROL_ORDER = ['rewind', 'play', 'forward', 'audio', 'subtitles', 'quality'];
const SUBTITLE_SIZE_OPTIONS = [
  {value: 0.75, labelKey: 'small', sampleClass: 'small'},
  {value: 1, labelKey: 'medium', sampleClass: 'medium'},
  {value: 1.25, labelKey: 'large', sampleClass: 'large'},
];
const SUBTITLE_STYLE_PRESETS = [
  {
    id: 'drop-shadow',
    labelKey: 'dropShadow',
    sampleClass: 'drop-shadow',
    foregroundColor: '#FFFFFFFF',
    backgroundColor: '#00000001',
    windowColor: '#00000001',
    windowType: cast.framework.messages.TextTrackWindowType.ROUNDED_CORNERS,
    edgeType: cast.framework.messages.TextTrackEdgeType.DROP_SHADOW,
    edgeColor: '#000000FF',
  },
  {
    id: 'dark',
    labelKey: 'dark',
    sampleClass: 'dark',
    foregroundColor: '#FFFFFFFF',
    backgroundColor: '#000000E6',
    windowColor: '#00000001',
    windowType: cast.framework.messages.TextTrackWindowType.ROUNDED_CORNERS,
    edgeType: cast.framework.messages.TextTrackEdgeType.NONE,
    edgeColor: '#00000000',
  },
  {
    id: 'contrast',
    labelKey: 'contrast',
    sampleClass: 'contrast',
    foregroundColor: '#FFF200FF',
    backgroundColor: '#000000E6',
    windowColor: '#00000001',
    windowType: cast.framework.messages.TextTrackWindowType.ROUNDED_CORNERS,
    edgeType: cast.framework.messages.TextTrackEdgeType.NONE,
    edgeColor: '#00000000',
  },
  {
    id: 'light',
    labelKey: 'light',
    sampleClass: 'light',
    foregroundColor: '#000000FF',
    backgroundColor: '#FFFFFFFF',
    windowColor: '#00000001',
    windowType: cast.framework.messages.TextTrackWindowType.ROUNDED_CORNERS,
    edgeType: cast.framework.messages.TextTrackEdgeType.NONE,
    edgeColor: '#00000000',
  },
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

function visitOpenRoots(root, visitor) {
  if (!root) {
    return;
  }
  visitor(root);
  root.querySelectorAll?.('*').forEach(element => {
    if (element.shadowRoot) {
      visitOpenRoots(element.shadowRoot, visitor);
    }
  });
}

function subtitleTextShadow() {
  const edgeColor = subtitleCssColor(subtitleEdgeColor || '#000000FF');
  if (subtitleEdgeType === cast.framework.messages.TextTrackEdgeType.NONE) {
    return 'none';
  }
  if (subtitleEdgeType === cast.framework.messages.TextTrackEdgeType.OUTLINE) {
    return [
      `-0.055em -0.055em 0 ${edgeColor}`,
      `0.055em -0.055em 0 ${edgeColor}`,
      `-0.055em 0.055em 0 ${edgeColor}`,
      `0.055em 0.055em 0 ${edgeColor}`,
    ].join(', ');
  }
  if (subtitleEdgeType === cast.framework.messages.TextTrackEdgeType.RAISED) {
    return `-0.055em -0.055em 0 ${edgeColor}`;
  }
  if (subtitleEdgeType === cast.framework.messages.TextTrackEdgeType.DEPRESSED) {
    return `0.055em 0.055em 0 ${edgeColor}`;
  }
  return `0.075em 0.075em 0.11em ${edgeColor}`;
}

function subtitleCssColor(value) {
  const color = String(value || '').trim();
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(color);
  if (!match) {
    return color;
  }
  const rgb = match[1];
  const alpha = Number.parseInt(match[2], 16) / 255;
  return `rgba(${Number.parseInt(rgb.slice(0, 2), 16)}, `
    + `${Number.parseInt(rgb.slice(2, 4), 16)}, `
    + `${Number.parseInt(rgb.slice(4, 6), 16)}, ${alpha.toFixed(3)})`;
}

function subtitleFontSize() {
  return Math.max(3.1, Math.min(7.2, 4.4 * subtitleFontScale));
}

function ensureSubtitleOverrideStyle(root) {
  if (!(root === document || root instanceof ShadowRoot)) {
    return;
  }
  let style = root.getElementById?.('sweet-subtitle-renderer-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'sweet-subtitle-renderer-style';
    (root === document ? document.head : root).appendChild(style);
  }
  const foregroundColor = subtitleCssColor(subtitleForegroundColor);
  style.textContent = [
    '.shaka-text-container, .shaka-text-container * {',
    `  color: ${foregroundColor} !important;`,
    `  -webkit-text-fill-color: ${foregroundColor} !important;`,
    `  text-shadow: ${subtitleTextShadow()} !important;`,
    `  font-size: ${subtitleFontSize().toFixed(2)}vh !important;`,
    '  line-height: 1.22 !important;',
    '  font-family: Inter, Arial, sans-serif !important;',
    '}',
  ].join('\n');
}

function styleSubtitleTextElement(element) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  const foregroundColor = subtitleCssColor(subtitleForegroundColor);
  const backgroundColor = subtitleCssColor(subtitleBackgroundColor);
  element.style.setProperty('color', foregroundColor, 'important');
  element.style.setProperty('text-shadow', subtitleTextShadow(), 'important');
  element.style.setProperty(
    '-webkit-text-fill-color',
    foregroundColor,
    'important');
  const hasText = Array.from(element.childNodes)
    .some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  element.style.setProperty(
    'background-color',
    hasText ? backgroundColor : 'transparent',
    'important');
  if (hasText) {
    element.style.setProperty(
      'font-size',
      `${subtitleFontSize().toFixed(2)}vh`,
      'important');
    element.style.setProperty('line-height', '1.22', 'important');
    element.style.setProperty(
      'font-family',
      'Inter, Arial, sans-serif',
      'important');
  }
}

function styleSubtitleContainer(container) {
  const transform = subtitlesLifted ? 'translateY(-30vh)' : 'translateY(-7vh)';
  if (container.style.getPropertyValue('transform') !== transform) {
    container.style.setProperty('transform', transform, 'important');
  }
  if (!container.style.getPropertyValue('transition')) {
    container.style.setProperty(
      'transition',
      'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      'important');
  }
  if (!container.style.getPropertyValue('will-change')) {
    container.style.setProperty('will-change', 'transform', 'important');
  }
  styleSubtitleTextElement(container);
  container.querySelectorAll('*').forEach(styleSubtitleTextElement);
}

function styleSubtitleContainersInRoot(root) {
  ensureSubtitleOverrideStyle(root);
  if (root.matches?.('.shaka-text-container')) {
    styleSubtitleContainer(root);
  }
  root.querySelectorAll?.('.shaka-text-container').forEach(styleSubtitleContainer);
}

function applySubtitleViewportPosition() {
  visitOpenRoots(document, styleSubtitleContainersInRoot);
}

function observeSubtitleUiRoot(root) {
  const observableRoot = root === document || root instanceof ShadowRoot;
  if (!observableRoot || subtitleUiObservedRoots.has(root)) {
    return;
  }
  subtitleUiObservedRoots.add(root);
  styleSubtitleContainersInRoot(root);
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      const changedElement = mutation.target?.nodeType === Node.TEXT_NODE
        ? mutation.target.parentElement
        : mutation.target;
      const changedContainer = changedElement?.closest?.('.shaka-text-container');
      if (changedContainer) {
        styleSubtitleContainer(changedContainer);
      }
      mutation.addedNodes.forEach(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
          ? node
          : node.parentElement;
        const activeContainer = element?.closest?.('.shaka-text-container');
        if (activeContainer) {
          styleSubtitleContainer(activeContainer);
        }
        if (node.nodeType !== Node.ELEMENT_NODE
            && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
          return;
        }
        visitOpenRoots(node, nestedRoot => {
          styleSubtitleContainersInRoot(nestedRoot);
          observeSubtitleUiRoot(nestedRoot);
        });
      });
    });
  });
  observer.observe(root, {childList: true, characterData: true, subtree: true});
  subtitleUiObservers.push(observer);
}

function setSubtitlesLifted(lifted) {
  subtitlesLifted = Boolean(lifted);
  document.documentElement.classList.toggle('subtitles-lifted', subtitlesLifted);
  applySubtitleViewportPosition();
}

function installSubtitleUiPositioning() {
  if (!playerElement?.shadowRoot) {
    window.setTimeout(installSubtitleUiPositioning, 100);
    return;
  }
  applySubtitleViewportPosition();
  subtitleUiObservers.forEach(observer => observer.disconnect());
  subtitleUiObservers = [];
  subtitleUiObservedRoots = new WeakSet();
  visitOpenRoots(document, observeSubtitleUiRoot);
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
    subtitleStyling: 'Subtitle styling',
    subtitleSize: 'Size', subtitleStyle: 'Style',
    small: 'Small', medium: 'Medium', large: 'Large',
    dropShadow: 'Drop shadow', dark: 'Dark', contrast: 'Contrast', light: 'Light',
    live: 'Live', recording: 'Recording', movie: 'Movie',
  },
  uk: {
    connecting: 'Підключення до телевізора', loading: 'Завантаження', buffering: 'Буферизація',
    cannotPlay: 'Не вдалося відтворити', playbackError: 'Помилка відтворення',
    waiting: 'Очікування трансляції',
    tryAgain: 'Спробуйте ще раз або виберіть інше відео.',
    paused: 'Пауза', finished: 'Відтворення завершено', code: 'Код',
    audio: 'Аудіо', subtitles: 'Субтитри', quality: 'Якість', auto: 'Авто', off: 'Вимкнено',
    subtitleStyling: 'Оформлення субтитрів',
    subtitleSize: 'Розмір', subtitleStyle: 'Стиль',
    small: 'Малий', medium: 'Середній', large: 'Великий',
    dropShadow: 'Ефект тіні', dark: 'Темний', contrast: 'Контрастний', light: 'Світлий',
    live: 'Наживо', recording: 'Запис', movie: 'Фільм',
  },
  ru: {
    connecting: 'Подключение к телевизору', loading: 'Загрузка', buffering: 'Буферизация',
    cannotPlay: 'Не удалось воспроизвести', playbackError: 'Ошибка воспроизведения',
    waiting: 'Ожидание трансляции',
    tryAgain: 'Попробуйте ещё раз или выберите другое видео.',
    paused: 'Пауза', finished: 'Просмотр завершён', code: 'Код',
    audio: 'Аудио', subtitles: 'Субтитры', quality: 'Качество', auto: 'Авто', off: 'Выключены',
    subtitleStyling: 'Оформление субтитров',
    subtitleSize: 'Размер', subtitleStyle: 'Стиль',
    small: 'Маленький', medium: 'Средний', large: 'Большой',
    dropShadow: 'Эффект тени', dark: 'Тёмный', contrast: 'Контрастный', light: 'Светлый',
    live: 'Прямой эфир', recording: 'Запись', movie: 'Фильм',
  },
  sk: {
    connecting: 'Pripájanie k televízoru', loading: 'Načítava sa', buffering: 'Ukladanie do vyrovnávacej pamäte',
    cannotPlay: 'Prehrávanie nie je možné', playbackError: 'Chyba prehrávania',
    waiting: 'Čaká sa na vysielanie',
    tryAgain: 'Skúste to znova alebo vyberte iné video.',
    paused: 'Pozastavené', finished: 'Prehrávanie sa skončilo', code: 'Kód',
    audio: 'Zvuk', subtitles: 'Titulky', quality: 'Kvalita', auto: 'Automaticky', off: 'Vypnuté',
    subtitleStyling: 'Vzhľad titulkov',
    subtitleSize: 'Veľkosť', subtitleStyle: 'Štýl',
    small: 'Malé', medium: 'Stredné', large: 'Veľké',
    dropShadow: 'Vrhaný tieň', dark: 'Tmavý', contrast: 'Kontrastný', light: 'Svetlý',
    live: 'Naživo', recording: 'Záznam', movie: 'Film',
  },
  cs: {
    connecting: 'Připojování k televizoru', loading: 'Načítání', buffering: 'Ukládání do vyrovnávací paměti',
    cannotPlay: 'Nelze přehrát', playbackError: 'Chyba přehrávání',
    waiting: 'Čekání na vysílání',
    tryAgain: 'Zkuste to znovu nebo vyberte jiné video.',
    paused: 'Pozastaveno', finished: 'Přehrávání skončilo', code: 'Kód',
    audio: 'Zvuk', subtitles: 'Titulky', quality: 'Kvalita', auto: 'Automaticky', off: 'Vypnuto',
    subtitleStyling: 'Vzhled titulků',
    subtitleSize: 'Velikost', subtitleStyle: 'Styl',
    small: 'Malé', medium: 'Střední', large: 'Velké',
    dropShadow: 'Vržený stín', dark: 'Tmavý', contrast: 'Kontrastní', light: 'Světlý',
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
    subtitleStyling: 'Wygląd napisów',
    subtitleSize: 'Rozmiar', subtitleStyle: 'Styl',
    small: 'Mały', medium: 'Średni', large: 'Duży',
    dropShadow: 'Cień', dark: 'Ciemny', contrast: 'Kontrastowy', light: 'Jasny',
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

function formatClockTime(date = new Date()) {
  return [
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ].map(value => String(value).padStart(2, '0')).join(':');
}

function formatSeekTime(totalSeconds) {
  const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return [
    hours,
    minutes,
    seconds,
  ].map(part => String(part).padStart(2, '0')).join(':');
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

function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function contentKeyFor(media, customData = {}) {
  const explicitKey = customData.contentKey
    || customData.url
    || media?.contentId
    || media?.contentUrl;
  if (explicitKey) {
    return String(explicitKey);
  }
  const metadata = media?.metadata || {};
  return [
    metadata.title || customData.title || '',
    metadata.subtitle || customData.subtitle || '',
  ].join('|');
}

function normalizedMaxHeight(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : -1;
}

function sameTrackId(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber === rightNumber;
  }
  return String(left) === String(right);
}

function normalizedQualityOptions(options) {
  const seen = new Set();
  const normalized = [];
  for (const option of Array.isArray(options) ? options : []) {
    const maxHeight = normalizedMaxHeight(option?.maxHeight);
    if (seen.has(maxHeight)) {
      continue;
    }
    seen.add(maxHeight);
    normalized.push({
      maxHeight,
      label: option?.label
        || (maxHeight > 0 ? `${maxHeight}p` : translate('auto')),
    });
  }
  return normalized;
}

function presentationFor(media, customData = {}) {
  const metadata = media?.metadata || {};
  const title = metadata.title || customData.title || '';
  const contentKey = contentKeyFor(media, customData);
  const previousPresentation = currentPresentation?.contentKey === contentKey
    ? currentPresentation
    : null;
  const activeTracks = previousPresentation
    ? activeTrackSelection()
    : {audioId: -1, subtitleId: -1};
  const previousTracks = {
    audioId: activeTracks.audioId >= 0
      ? activeTracks.audioId
      : (previousPresentation?.selectedAudioId ?? -1),
    subtitleId: activeTracks.subtitleId >= 0
      ? activeTracks.subtitleId
      : (previousPresentation?.selectedSubtitleId ?? -1),
  };
  const requestedQualityOptions = normalizedQualityOptions(customData.qualityOptions);
  const qualityOptions = requestedQualityOptions.length > 0
    ? requestedQualityOptions
    : (previousPresentation?.qualityOptions || []).map(option => ({...option}));
  const maxHeight = hasOwn(customData, 'maxHeight')
    ? normalizedMaxHeight(customData.maxHeight)
    : (previousPresentation?.maxHeight ?? -1);
  return {
    contentKey,
    title,
    subtitle: metadata.subtitle || customData.subtitle || previousPresentation?.subtitle || '',
    artworkUrl: metadataImage(metadata)
      || secureMediaUrl(customData.artworkUrl || '')
      || previousPresentation?.artworkUrl
      || '',
    isLive: hasOwn(customData, 'isLive')
      ? Boolean(customData.isLive)
      : Boolean(previousPresentation?.isLive),
    isRecording: hasOwn(customData, 'isRecording')
      ? Boolean(customData.isRecording)
      : Boolean(previousPresentation?.isRecording),
    isMovie: hasOwn(customData, 'isMovie')
      ? Boolean(customData.isMovie)
      : (previousPresentation?.isMovie ?? (!customData.isLive && !customData.isRecording)),
    isSeries: hasOwn(customData, 'isSeries')
      ? Boolean(customData.isSeries)
      : Boolean(previousPresentation?.isSeries),
    contentKind: String(
      customData.contentKind || previousPresentation?.contentKind || 'movie'),
    channelTitle: String(
      customData.channelTitle || previousPresentation?.channelTitle || ''),
    programmeTitle: String(
      customData.programmeTitle || previousPresentation?.programmeTitle || ''),
    programmeStart: Number(customData.programmeStart)
      || previousPresentation?.programmeStart
      || 0,
    programmeEnd: Number(customData.programmeEnd)
      || previousPresentation?.programmeEnd
      || 0,
    epgItems: Array.isArray(customData.epgItems)
      ? customData.epgItems.map(item => ({
        title: String(item?.title || ''),
        start: Number(item?.start) || 0,
        end: Number(item?.end) || 0,
      }))
      : (previousPresentation?.epgItems || []).map(item => ({...item})),
    activeEpgIndex: Number.isFinite(Number(customData.activeEpgIndex))
      ? Number(customData.activeEpgIndex)
      : (previousPresentation?.activeEpgIndex ?? -1),
    thumbnailsPlaylistUrl: secureMediaUrl(customData.thumbnailsPlaylistUrl || '')
      || previousPresentation?.thumbnailsPlaylistUrl
      || '',
    thumbnailImageUrl: secureMediaUrl(customData.thumbnailImageUrl || '')
      || previousPresentation?.thumbnailImageUrl
      || '',
    thumbnailInterval: Number(customData.thumbnailInterval)
      || previousPresentation?.thumbnailInterval
      || 0,
    thumbnailCols: Number(customData.thumbnailCols)
      || previousPresentation?.thumbnailCols
      || 0,
    thumbnailRows: Number(customData.thumbnailRows)
      || previousPresentation?.thumbnailRows
      || 0,
    qualityOptions,
    maxHeight,
    selectedAudioId: customData.selectedAudioId !== null
      && customData.selectedAudioId !== undefined
      && Number.isFinite(Number(customData.selectedAudioId))
      ? Number(customData.selectedAudioId)
      : previousTracks.audioId,
    selectedSubtitleId: customData.selectedSubtitleId !== null
      && customData.selectedSubtitleId !== undefined
      && Number.isFinite(Number(customData.selectedSubtitleId))
      ? Number(customData.selectedSubtitleId)
      : previousTracks.subtitleId,
  };
}

function formatProgrammeTime(epochSeconds) {
  const value = Number(epochSeconds);
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }
  const date = new Date(value * 1000);
  return [date.getHours(), date.getMinutes()]
    .map(part => String(part).padStart(2, '0'))
    .join(':');
}

function renderChannelInfo() {
  const isLive = Boolean(currentPresentation?.isLive);
  const isRecording = Boolean(currentPresentation?.isRecording);
  const isChannel = isLive || isRecording;
  pauseElement?.classList.toggle('channel-presentation', isChannel);
  pauseElement?.classList.toggle('live-presentation', isLive);
  pauseElement?.classList.toggle('recording-presentation', isRecording);
  if (!channelInfoElement) {
    return;
  }
  channelInfoElement.hidden = !isChannel;
  if (!isChannel) {
    return;
  }
  if (channelNameElement) {
    channelNameElement.textContent =
      currentPresentation.channelTitle || currentPresentation.title;
  }
  if (channelArtworkElement) {
    channelArtworkElement.hidden = !currentPresentation.artworkUrl;
    if (currentPresentation.artworkUrl) {
      channelArtworkElement.src = currentPresentation.artworkUrl;
    }
  }
  if (!channelEpgElement) {
    return;
  }
  channelEpgElement.replaceChildren();
  channelEpgElement.hidden = isLive;
  if (isLive) {
    return;
  }
  let items = currentPresentation.epgItems || [];
  let activeIndex = currentPresentation.activeEpgIndex;
  if (items.length === 0 && currentPresentation.programmeTitle) {
    items = [{
      title: currentPresentation.programmeTitle,
      start: currentPresentation.programmeStart,
      end: currentPresentation.programmeEnd,
    }];
    activeIndex = 0;
  }
  if (isRecording) {
    const activeItem = items[activeIndex] || items[0];
    const programmeTitle = currentPresentation.programmeTitle
      || activeItem?.title
      || '';
    if (!programmeTitle) {
      channelEpgElement.hidden = true;
      return;
    }
    const row = document.createElement('div');
    row.className = 'receiver-channel-epg-row recording-title';
    const title = document.createElement('span');
    title.className = 'receiver-channel-epg-title';
    title.textContent = programmeTitle;
    row.append(title);
    channelEpgElement.append(row);
    return;
  }
  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'receiver-channel-epg-row';
    row.classList.toggle('active', index === activeIndex);
    const time = document.createElement('span');
    time.textContent = formatProgrammeTime(item.start);
    const title = document.createElement('span');
    title.className = 'receiver-channel-epg-title';
    title.textContent = item.title;
    row.append(time, title);
    channelEpgElement.append(row);
  });
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

function presentationSecondaryText(presentation = currentPresentation) {
  if (!presentation || presentation.isMovie) {
    return '';
  }
  return presentation.subtitle || presentationBadge(presentation);
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
  setSubtitlesLifted(false);
  hideSeekPreview();
}

function ensureReceiverKeyFocus() {
  try {
    window.focus();
    if (document.body) {
      document.body.tabIndex = -1;
      document.body.focus({preventScroll: true});
    }
  } catch (_) {
    // Some embedded Cast browsers only support the legacy focus signature.
    try {
      document.body?.focus();
    } catch (_) {
      // The capture-phase window listener still remains the fallback.
    }
  }
}

function controlsAreVisible() {
  return Boolean(pauseElement?.classList.contains('visible'));
}

function renderControlsFocus() {
  pauseTimelineElement?.classList.toggle(
    'focused',
    controlsFocusArea === 'timeline' && !pauseTimelineElement.hidden);
  controlElements.forEach(element => {
    const index = CONTROL_ORDER.indexOf(element.dataset.control);
    element.classList.toggle(
      'focused',
      !element.hidden && controlsFocusArea === 'actions' && index === controlSelection);
  });
}

function controlElementFor(name) {
  return controlElements.find(element => element.dataset.control === name) || null;
}

function availableControlNames() {
  return CONTROL_ORDER.filter(name => !controlElementFor(name)?.hidden);
}

function timelineIsFocusable() {
  return Boolean(
      pauseTimelineElement
      && !pauseTimelineElement.hidden
      && !pauseTimelineElement.classList.contains('live'));
}

function setControlsFocus(area, selection = controlSelection) {
  const timelineAvailable = timelineIsFocusable();
  controlsFocusArea = area === 'actions' || !timelineAvailable ? 'actions' : 'timeline';
  if (controlsFocusArea === 'actions') {
    const requested = CONTROL_ORDER[
      Math.max(0, Math.min(CONTROL_ORDER.length - 1, selection))];
    const available = availableControlNames();
    const selectedName = available.includes(requested)
      ? requested
      : (available.includes('play') ? 'play' : available[0]);
    controlSelection = Math.max(0, CONTROL_ORDER.indexOf(selectedName));
  }
  renderControlsFocus();
}

function updateControlAvailability() {
  const duration = playerManager.getDurationSec();
  const isLive = Boolean(currentPresentation?.isLive);
  const seekable = !isLive
    && Number.isFinite(duration)
    && duration > 0;
  const qualityCount = (currentPresentation?.qualityOptions || []).length;
  const availability = {
    rewind: seekable,
    play: true,
    forward: seekable,
    audio: audioTrackCatalog.length > 1,
    subtitles: subtitleTrackCatalog.length > 0,
    quality: qualityCount > 1 || (isLive && qualityCount > 0),
  };
  CONTROL_ORDER.forEach(name => {
    const element = controlElementFor(name);
    if (element) {
      element.hidden = !availability[name];
    }
  });
  if (pauseTimelineElement) {
    pauseTimelineElement.hidden = !seekable && !isLive;
    pauseTimelineElement.classList.toggle('live', isLive);
    pauseTimelineElement.classList.toggle(
      'recording', Boolean(currentPresentation?.isRecording));
  }
  if (pauseLiveBadgeElement) {
    pauseLiveBadgeElement.textContent = isLive
      ? translate('live')
      : (currentPresentation?.isRecording ? translate('recording') : '');
  }
  const settingControls = document.getElementById('receiver-setting-controls');
  if (settingControls) {
    settingControls.hidden = !availability.audio
      && !availability.subtitles
      && !availability.quality;
  }
  pauseElement?.classList.toggle('live-controls', isLive);
  pauseElement?.classList.toggle('transport-only', Boolean(settingControls?.hidden));
  if (controlsFocusArea === 'timeline' && !timelineIsFocusable()) {
    setControlsFocus('actions', CONTROL_ORDER.indexOf('play'));
  } else if (controlsFocusArea === 'actions') {
    const selectedControl = controlElementFor(CONTROL_ORDER[controlSelection]);
    if (selectedControl?.hidden) {
      setControlsFocus('actions', CONTROL_ORDER.indexOf('play'));
      return;
    }
    renderControlsFocus();
  } else {
    renderControlsFocus();
  }
}

function cacheTimelineBounds() {
  const bounds = pauseProgressTrackElement?.getBoundingClientRect();
  timelineBoundsCache = bounds?.width > 0
    ? {left: bounds.left, width: bounds.width}
    : null;
}

function scheduleControlsHide(delay = 2800) {
  controlsTimer = clearTimer(controlsTimer);
  const generation = controlsGeneration;
  controlsTimer = setTimeout(() => {
    controlsTimer = null;
    if (generation !== controlsGeneration) {
      return;
    }
    if (isOptionsVisible()) {
      return;
    }
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
  const isLive = Boolean(currentPresentation?.isLive);
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
  const boundedDuration = !isLive && Number.isFinite(duration) && duration > 0
    ? duration
    : 0;
  const liveStart = Number(currentPresentation?.programmeStart) || 0;
  const liveEnd = Number(currentPresentation?.programmeEnd) || 0;
  const liveNow = Date.now() / 1000;
  const percentage = isLive && liveEnd > liveStart
    ? Math.max(0, Math.min(100, ((liveNow - liveStart) / (liveEnd - liveStart)) * 100))
    : (boundedDuration > 0
      ? Math.max(0, Math.min(100, (position / boundedDuration) * 100))
      : 0);
  if (pauseProgressElement) {
    pauseProgressElement.style.width = `${percentage}%`;
  }
  if (pauseProgressTrackElement) {
    pauseProgressTrackElement.style.setProperty('--progress', `${percentage}%`);
  }
  pauseTimelineElement?.classList.toggle('scrubbing', !isLive && isScrubbing);
  if (pauseTimeElement) {
    pauseTimeElement.textContent = isLive
      ? formatClockTime()
      : (boundedDuration > 0 ? formatSeekTime(position) : presentationBadge());
  }
  if (pauseDurationElement) {
    pauseDurationElement.hidden = isLive;
    pauseDurationElement.textContent = isLive
      ? ''
      : (boundedDuration > 0 ? formatSeekTime(boundedDuration) : '');
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
  if (!currentPresentation || playbackHasError) {
    return;
  }
  ensureReceiverKeyFocus();
  if (isOptionsVisible()) {
    setLayerVisible(pauseElement, false);
    setSubtitlesLifted(false);
    return;
  }
  const wasVisible = controlsAreVisible();
  hideTransition();
  if (pauseLabelElement) {
    pauseLabelElement.textContent = presentationSecondaryText();
  }
  if (pauseTitleElement) {
    pauseTitleElement.textContent = currentPresentation.title;
  }
  if (pauseMetaElement) {
    pauseMetaElement.textContent = presentationSecondaryText();
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
  renderChannelInfo();
  updateControlAvailability();
  updatePauseProgress();
  updateControlLabels();
  if (playStateIconElement) {
    playStateIconElement.src = isPlaybackPaused()
      ? 'assets/player/play.svg'
      : 'assets/player/pause.svg';
  }
  setLayerVisible(pauseElement, true);
  setSubtitlesLifted(true);
  if (!timelineBoundsCache) {
    requestAnimationFrame(cacheTimelineBounds);
  }
  if (!wasVisible) {
    setControlsFocus(
      timelineIsFocusable() ? 'timeline' : 'actions',
      CONTROL_ORDER.indexOf('play'));
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

function captureSubtitleStyle(style, markDirty = true) {
  if (!style) {
    return;
  }
  if (Number.isFinite(Number(style.fontScale))) {
    subtitleFontScale = Number(style.fontScale);
  }
  if (style.foregroundColor) {
    subtitleForegroundColor = normalizedRgba(style.foregroundColor);
  }
  if (style.backgroundColor) {
    subtitleBackgroundColor = normalizedRgba(style.backgroundColor);
  }
  if (style.windowColor) {
    subtitleWindowColor = normalizedRgba(style.windowColor);
  }
  if (style.windowType !== undefined && style.windowType !== null) {
    subtitleWindowType = style.windowType;
  }
  if (style.edgeType !== undefined && style.edgeType !== null) {
    subtitleEdgeType = style.edgeType;
  }
  if (style.edgeColor) {
    subtitleEdgeColor = normalizedRgba(style.edgeColor);
  }
  if (markDirty) {
    subtitleStyleDirty = true;
  }
}

function syncSubtitleStyleState() {
  if (subtitleStyleDirty) {
    return;
  }
  try {
    captureSubtitleStyle(
      playerManager.getTextTracksManager().getTextTracksStyle(),
      false);
  } catch (error) {
    console.warn('[SWEET Receiver] Subtitle style is not ready', error);
  }
}

function notifySubtitleStyleApplied() {
  sendReceiverMessage({
    type: 'subtitle-style-applied',
    contentKey: currentPresentation?.contentKey || '',
    fontScale: subtitleFontScale,
    foregroundColor: subtitleForegroundColor,
    backgroundColor: subtitleBackgroundColor,
    windowColor: subtitleWindowColor,
    windowType: subtitleWindowType,
    edgeType: subtitleEdgeType,
    edgeColor: subtitleEdgeColor,
  });
}

function buildReceiverSubtitleStyle() {
  const style = new cast.framework.messages.TextTrackStyle();
  style.fontScale = subtitleFontScale;
  style.foregroundColor = subtitleForegroundColor;
  style.backgroundColor = subtitleBackgroundColor;
  style.windowColor = subtitleWindowColor;
  style.windowType = subtitleWindowType;
  style.windowRoundedCornerRadius = 8;
  style.edgeType = subtitleEdgeType;
  style.edgeColor = subtitleEdgeColor;
  return style;
}

function applySubtitleStyle(markDirty = true, notifySender = markDirty) {
  if (markDirty) {
    // Keep the choice even when no text track is active yet. Some CAF
    // receivers reject styling until a subtitle track has been enabled.
    subtitleStyleDirty = true;
  }
  try {
    const manager = playerManager.getTextTracksManager();
    manager.setTextTrackStyle(buildReceiverSubtitleStyle());
    applySubtitleViewportPosition();
    if (notifySender) {
      notifySubtitleStyleApplied();
    }
  } catch (error) {
    console.warn('[SWEET Receiver] Cannot apply subtitle style', error);
  }
}

function applyReceiverOwnedSubtitleStyle() {
  let activeIds = [];
  try {
    activeIds = playerManager.getTextTracksManager().getActiveIds();
  } catch (error) {
    console.warn('[SWEET Receiver] Subtitle tracks are not ready', error);
  }
  applySubtitleStyle(false, false);
  if (activeIds.length > 0) {
    try {
      playerManager.getTextTracksManager().setActiveByIds(activeIds);
    } catch (error) {
      console.warn('[SWEET Receiver] Cannot preserve subtitle track', error);
    }
  }
  scheduleSubtitleStyleRestore(activeIds);
  notifySubtitleStyleApplied();
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
      // CAF implementations may clear the active text track while applying a
      // style. Apply the style first and always make track restoration the
      // final operation. Later retries only verify the track so an async CAF
      // style update cannot leave subtitles disabled.
      if (attempt < 2) {
        applySubtitleStyle(false, false);
      }
      const enabledIds = manager.getActiveIds();
      const allExpectedTracksActive = activeIds.every(
        id => enabledIds.some(enabledId => sameTrackId(id, enabledId)));
      if (!allExpectedTracksActive) {
        manager.setActiveByIds(activeIds);
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
  if (currentPresentation) {
    currentPresentation.selectedSubtitleId = activeIds.length > 0
      ? Number(activeIds[0])
      : -1;
  }
  cancelSubtitleStyleRestore();
  if (activeIds.length > 0 && subtitleStyleDirty) {
    // Apply before activation as well: receivers differ in whether the text
    // renderer reads the current style before or after setActiveByIds().
    applySubtitleStyle(false);
  }
  manager.setActiveByIds(activeIds);
  scheduleSubtitleStyleRestore(activeIds);
}

function subtitlePresetIsSelected(preset) {
  return normalizedRgba(subtitleForegroundColor)
      === normalizedRgba(preset.foregroundColor)
    && normalizedRgba(subtitleBackgroundColor)
      === normalizedRgba(preset.backgroundColor)
    && normalizedRgba(subtitleWindowColor)
      === normalizedRgba(preset.windowColor)
    && subtitleWindowType === preset.windowType
    && subtitleEdgeType === preset.edgeType
    && normalizedRgba(subtitleEdgeColor)
      === normalizedRgba(preset.edgeColor);
}

function applySubtitlePreset(preset) {
  subtitleForegroundColor = preset.foregroundColor;
  subtitleBackgroundColor = preset.backgroundColor;
  subtitleWindowColor = preset.windowColor;
  subtitleWindowType = preset.windowType;
  subtitleEdgeType = preset.edgeType;
  subtitleEdgeColor = preset.edgeColor;
  subtitleStyleDirty = true;
  applyReceiverOwnedSubtitleStyle();
}

function lockLocalSubtitleSelection(subtitleId) {
  localSubtitleSelectionLock = {
    subtitleId,
    contentKey: currentPresentation?.contentKey || '',
    expiresAt: Date.now() + LOCAL_SUBTITLE_SELECTION_LOCK_MS,
  };
}

function shouldIgnoreSenderSubtitleSelection(subtitleId) {
  if (!localSubtitleSelectionLock
      || Date.now() > localSubtitleSelectionLock.expiresAt
      || localSubtitleSelectionLock.contentKey
        !== (currentPresentation?.contentKey || '')) {
    localSubtitleSelectionLock = null;
    return false;
  }
  if (sameTrackId(localSubtitleSelectionLock.subtitleId, subtitleId)) {
    localSubtitleSelectionLock = null;
    return false;
  }
  return true;
}

function optionItems(section = menuSection) {
  if (section === 'audio') {
    const activeId = playerManager.getAudioTracksManager().getActiveId();
    return audioTrackCatalog.map(track => ({
      id: track.trackId,
      kind: 'audio-track',
      label: track.name || track.language || String(track.trackId),
      selected: sameTrackId(track.trackId, activeId),
    }));
  }
  if (section === 'subtitles') {
    const activeIds = playerManager.getTextTracksManager().getActiveIds();
    const requestedSubtitleId = Number(currentPresentation?.selectedSubtitleId);
    const selectedSubtitleIds = activeIds.length > 0
      ? activeIds
      : (Number.isFinite(requestedSubtitleId) && requestedSubtitleId >= 0
        ? [requestedSubtitleId]
        : []);
    return [
      {
        id: -1,
        kind: 'subtitle-track',
        label: translate('off'),
        selected: selectedSubtitleIds.length === 0,
      },
      ...subtitleTrackCatalog.map(track => ({
        id: track.trackId,
        kind: 'subtitle-track',
        label: track.name || track.language || String(track.trackId),
        selected: selectedSubtitleIds
          .some(activeId => sameTrackId(activeId, track.trackId)),
      })),
      {
        id: 'subtitle-styling',
        kind: 'subtitle-styling',
        label: translate('subtitleStyling'),
        icon: 'assets/player/settings_icon.svg',
      },
    ];
  }
  if (section === 'subtitle-style') {
    return [
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
        sampleClass: `size-${option.sampleClass}`,
        label: translate(option.labelKey),
        selected: Math.abs(subtitleFontScale - option.value) < 0.01,
      })),
      {
        id: 'subtitle-style-heading',
        kind: 'heading',
        label: translate('subtitleStyle'),
        selectable: false,
      },
      ...SUBTITLE_STYLE_PRESETS.map(option => ({
        id: `subtitle-preset-${option.id}`,
        kind: 'subtitle-preset',
        preset: option,
        sampleClass: option.sampleClass,
        label: translate(option.labelKey),
        selected: subtitlePresetIsSelected(option),
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
    optionsTitleElement.textContent = translate(
      menuSection === 'subtitle-style' ? 'subtitleStyling' : menuSection);
  }
  optionsCloseElement?.classList.toggle('focused', menuFocusArea === 'close');
  if (optionsListElement) {
    optionsListElement.textContent = '';
    if (optionsFooterElement) {
      optionsFooterElement.textContent = '';
      optionsFooterElement.classList.remove('visible');
    }
    optionsElement?.classList.remove('has-footer');
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
        item.kind === 'subtitle-styling' ? 'action' : '',
        menuFocusArea === 'list' && index === menuSelection ? 'focused' : '',
        item.selected ? 'active' : '',
      ].filter(Boolean).join(' ');
      if (item.icon) {
        const icon = document.createElement('img');
        icon.className = 'receiver-option-icon';
        icon.src = item.icon;
        icon.alt = '';
        row.appendChild(icon);
      }
      if (item.swatch) {
        const swatch = document.createElement('span');
        swatch.className = 'receiver-option-swatch';
        swatch.style.background = item.swatch.slice(0, 7);
        row.appendChild(swatch);
      }
      if (item.sampleClass) {
        const sample = document.createElement('span');
        sample.className = `receiver-option-sample ${item.sampleClass}`;
        sample.textContent = 'Aa';
        row.appendChild(sample);
      }
      const label = document.createElement('span');
      label.className = 'receiver-option-label';
      label.textContent = item.label;
      row.append(label);
      if (item.kind === 'subtitle-styling' && optionsFooterElement) {
        optionsFooterElement.appendChild(row);
        optionsFooterElement.classList.add('visible');
        optionsElement?.classList.add('has-footer');
      } else {
        optionsListElement.appendChild(row);
      }
    });
    requestAnimationFrame(() => {
      optionsElement?.querySelector('.receiver-option-row.focused')
        ?.scrollIntoView({block: 'nearest'});
    });
  }
}

function showOptions(section = menuSection) {
  if (!hasOptionsForSection(section)) {
    return false;
  }
  menuSection = section;
  menuReturnControl = section === 'subtitle-style' ? 'subtitles' : section;
  menuFocusArea = 'list';
  updateControlLabels();
  if (section === 'subtitles' || section === 'subtitle-style') {
    syncSubtitleStyleState();
  }
  const items = optionItems();
  const selectedIndex = items.findIndex(item => item.selected);
  menuSelection = nearestSelectableIndex(items, selectedIndex >= 0 ? selectedIndex : 0);
  renderOptions();
  controlsTimer = clearTimer(controlsTimer);
  hideSeekPreview();
  setLayerVisible(pauseElement, false);
  setSubtitlesLifted(false);
  optionsElement?.classList.add('visible');
  optionsElement?.setAttribute('aria-hidden', 'false');
  return true;
}

function hideOptions() {
  optionsElement?.classList.remove('visible');
  optionsElement?.setAttribute('aria-hidden', 'true');
  menuFocusArea = 'list';
}

function hasOptionsForSection(section) {
  if (section === 'audio') {
    return audioTrackCatalog.length > 1;
  }
  if (section === 'subtitles' || section === 'subtitle-style') {
    return subtitleTrackCatalog.length > 0;
  }
  if (section === 'quality') {
    const qualityCount = (currentPresentation?.qualityOptions || []).length;
    return qualityCount > 1 || (currentPresentation?.isLive && qualityCount > 0);
  }
  return false;
}

function showSubtitleStyleOptions() {
  menuSection = 'subtitle-style';
  menuReturnControl = 'subtitles';
  menuFocusArea = 'list';
  syncSubtitleStyleState();
  const items = optionItems();
  const selectedIndex = items.findIndex(item => item.selected);
  menuSelection = nearestSelectableIndex(items, selectedIndex >= 0 ? selectedIndex : 0);
  renderOptions();
}

function returnToSubtitleTrackOptions() {
  menuSection = 'subtitles';
  menuReturnControl = 'subtitles';
  menuFocusArea = 'list';
  const items = optionItems();
  const stylingIndex = items.findIndex(item => item.kind === 'subtitle-styling');
  menuSelection = nearestSelectableIndex(items, stylingIndex >= 0 ? stylingIndex : 0);
  renderOptions();
}

function closeOptionsAndRestoreFocus(control = menuReturnControl, autoHide = true) {
  hideOptions();
  showPause(autoHide);
  setControlsFocus('actions', CONTROL_ORDER.indexOf(control));
}

function restorePendingControlAfterLoad(force = false) {
  if (!pendingControlAfterLoad || !currentPresentation) {
    return false;
  }
  if (pendingControlAfterLoad.contentKey !== currentPresentation.contentKey
      || Date.now() > pendingControlAfterLoad.expiresAt) {
    pendingControlAfterLoad = null;
    return false;
  }
  if (!pendingControlAfterLoad.loadObserved) {
    return false;
  }
  const state = playerManager.getPlayerState();
  const ready = state === cast.framework.messages.PlayerState.PLAYING
    || state === cast.framework.messages.PlayerState.PAUSED;
  if (!force && !ready) {
    return false;
  }
  const pending = pendingControlAfterLoad;
  pendingControlAfterLoad = null;
  showControlsOnNextPlayback = false;
  if (pending.control === 'quality' && currentPresentation) {
    currentPresentation.maxHeight = normalizedMaxHeight(pending.maxHeight);
  }
  showPause(true);
  const control = controlElementFor(pending.control);
  setControlsFocus(
    'actions',
    CONTROL_ORDER.indexOf(control && !control.hidden ? pending.control : 'play'));
  return true;
}

function showInitialControlsIfReady(force = false) {
  if (!showControlsOnNextPlayback
      || pendingControlAfterLoad
      || !currentPresentation
      || playbackHasError) {
    return false;
  }
  const state = playerManager.getPlayerState();
  const ready = state === cast.framework.messages.PlayerState.PLAYING
    || state === cast.framework.messages.PlayerState.PAUSED;
  if (!force && !ready) {
    return false;
  }
  showPause(true);
  if (!controlsAreVisible()) {
    return false;
  }
  showControlsOnNextPlayback = false;
  hideEnd();
  return true;
}

function isReplacementLoadActive() {
  return Boolean(
    pendingControlAfterLoad
    && pendingControlAfterLoad.loadObserved
    && currentPresentation
    && pendingControlAfterLoad.contentKey === currentPresentation.contentKey
    && Date.now() <= pendingControlAfterLoad.expiresAt);
}

function isPresentationStartTerminalEvent() {
  return Boolean(
    currentPresentation
    && presentationTerminalGuardUntil > 0
    && Date.now() <= presentationTerminalGuardUntil);
}

function activeTrackSelection() {
  try {
    const audioId = playerManager.getAudioTracksManager().getActiveId();
    const subtitleIds = playerManager.getTextTracksManager().getActiveIds();
    return {
      audioId: Number.isFinite(Number(audioId)) ? Number(audioId) : -1,
      subtitleId: Array.isArray(subtitleIds) && subtitleIds.length > 0
        ? Number(subtitleIds[0])
        : -1,
    };
  } catch (_) {
    return {audioId: -1, subtitleId: -1};
  }
}

function notifyTrackSelection(requestedSelection = null) {
  const selection = requestedSelection || activeTrackSelection();
  if (currentPresentation) {
    currentPresentation.selectedAudioId = selection.audioId;
    currentPresentation.selectedSubtitleId = selection.subtitleId;
  }
  sendReceiverMessage({
    type: 'track-selection',
    contentKey: currentPresentation?.contentKey || '',
    ...selection,
  });
}

function applySelectedOption() {
  const item = optionItems()[menuSelection];
  if (!isSelectableOption(item)) {
    return;
  }
  let returnControl = '';
  if (item.kind === 'audio-track') {
    playerManager.getAudioTracksManager().setActiveById(item.id);
    if (currentPresentation) {
      currentPresentation.selectedAudioId = Number(item.id);
    }
    setTimeout(() => notifyTrackSelection({
      audioId: Number(item.id),
      subtitleId: currentPresentation?.selectedSubtitleId ?? -1,
    }), 0);
    returnControl = 'audio';
  } else if (item.kind === 'subtitle-track') {
    const subtitleId = item.id < 0 ? -1 : Number(item.id);
    if (currentPresentation) {
      currentPresentation.selectedSubtitleId = subtitleId;
    }
    lockLocalSubtitleSelection(subtitleId);
    setActiveSubtitleIds(subtitleId < 0 ? [] : [subtitleId]);
    scheduleTrackSelectionRestore();
    setTimeout(() => notifyTrackSelection({
      audioId: currentPresentation?.selectedAudioId ?? -1,
      subtitleId,
    }), 0);
    returnControl = 'subtitles';
  } else if (item.kind === 'subtitle-size') {
    subtitleFontScale = item.value;
    subtitleStyleDirty = true;
    applyReceiverOwnedSubtitleStyle();
  } else if (item.kind === 'subtitle-preset') {
    applySubtitlePreset(item.preset);
  } else if (item.kind === 'subtitle-styling') {
    showSubtitleStyleOptions();
    return;
  } else if (item.kind === 'quality') {
    const tracks = activeTrackSelection();
    const request = {
      type: 'quality-request',
      contentKey: currentPresentation?.contentKey || '',
      maxHeight: item.id,
      positionMs: Math.round(playerManager.getCurrentTimeSec() * 1000),
      audioId: tracks.audioId,
      subtitleId: tracks.subtitleId,
    };
    currentPresentation.maxHeight = item.id;
    currentPresentation.selectedAudioId = tracks.audioId;
    currentPresentation.selectedSubtitleId = tracks.subtitleId;
    updateControlLabels();
    pendingControlAfterLoad = {
      control: 'quality',
      contentKey: currentPresentation.contentKey,
      maxHeight: item.id,
      loadObserved: false,
      expiresAt: Date.now() + 60000,
    };
    closeOptionsAndRestoreFocus('quality');
    sendReceiverMessage(request);
    return;
  }
  if (returnControl) {
    closeOptionsAndRestoreFocus(returnControl);
    return;
  }
  renderOptions();
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
  hideIdle();
  hideError();
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
    return Number.NaN;
  }
  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }
  if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }
  return parts.length === 1 ? parts[0] : Number.NaN;
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
    const start = parseVttTime(startText);
    const end = parseVttTime(endText);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    const target = lines[timeLineIndex + 1];
    const cropMatch = target.match(/#xywh=(\d+),(\d+),(\d+),(\d+)/i);
    let imageUrl = target.split('#')[0];
    try {
      imageUrl = new URL(imageUrl, playlistUrl).href;
    } catch (_) {
      continue;
    }
    cues.push({
      start,
      end,
      imageUrl: secureMediaUrl(imageUrl),
      crop: cropMatch ? cropMatch.slice(1).map(Number) : null,
    });
  }
  return cues.sort((left, right) => left.start - right.start);
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
      if (requestId !== thumbnailRequestId) {
        return;
      }
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
    if (requestId !== thumbnailRequestId) {
      return;
    }
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
    seekTimeElement.textContent = formatSeekTime(position);
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
  cancelTrackSelectionRestore();
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

function enterStoppedState() {
  playbackStopped = true;
  playbackEnded = false;
  presentationTerminalGuardUntil = 0;
  pendingControlAfterLoad = null;
  currentPresentation = null;
  hideLoader();
  resetPresentationLayers();
  showIdle();
  sendReceiverMessage({
    type: 'controls-status',
    state: 'hidden',
    reason: 'stop',
  });
}

function stopPlaybackFromRemote() {
  enterStoppedState();
  try {
    playerManager.stop();
  } catch (error) {
    console.warn('[SWEET Receiver] Cannot stop playback', error);
  }
  setTimeout(() => {
    try {
      context.stop();
    } catch (error) {
      console.warn('[SWEET Receiver] Cannot close receiver', error);
    }
  }, 120);
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
    const requestedAudioId = Number(currentPresentation?.selectedAudioId);
    const requestedSubtitleId = Number(currentPresentation?.selectedSubtitleId);
    const reportedAudioId = activeTracks.audioId >= 0
      ? activeTracks.audioId
      : (Number.isFinite(requestedAudioId)
          && audioTrackCatalog.some(
            track => sameTrackId(track.trackId, requestedAudioId))
        ? requestedAudioId
        : -1);
    const reportedSubtitleId = activeTracks.subtitleId >= 0
      ? activeTracks.subtitleId
      : (Number.isFinite(requestedSubtitleId) && requestedSubtitleId >= 0
          && subtitleTrackCatalog.some(
            track => sameTrackId(track.trackId, requestedSubtitleId))
        ? requestedSubtitleId
        : -1);
    updateControlAvailability();
    updateControlLabels();
    if (isOptionsVisible()
        && (menuSection === 'audio'
          || menuSection === 'subtitles'
          || menuSection === 'subtitle-style')) {
      renderOptions();
    }
    sendReceiverMessage({
      type: 'tracks',
      contentKey: currentPresentation?.contentKey || '',
      audio: audioTracks,
      subtitles: subtitleTracks,
      audioId: reportedAudioId,
      subtitleId: reportedSubtitleId,
    });
  } catch (error) {
    console.warn('[SWEET Receiver] Track catalog is not ready', error);
  }
}

function cancelTrackSelectionRestore() {
  trackRestoreTimer = clearTimer(trackRestoreTimer);
  trackRestoreToken += 1;
}

function restoreRequestedTrackSelection() {
  if (!currentPresentation) {
    return true;
  }
  // Catch-up HLS is normalized by the sender to one muxed A/V rendition.
  // Restoring IDs from the origin manifest makes older receivers rebuild the
  // decoder during startup and fail with CAF 100/3016.
  if (currentPresentation.isRecording) {
    return true;
  }
  try {
    const audioManager = playerManager.getAudioTracksManager();
    const textManager = playerManager.getTextTracksManager();
    let ready = true;
    const requestedAudioId = Number(currentPresentation.selectedAudioId);
    const requestedSubtitleId = Number(currentPresentation.selectedSubtitleId);

    if (Number.isFinite(requestedAudioId) && requestedAudioId >= 0) {
      if (audioManager.getTrackById(requestedAudioId)) {
        if (!sameTrackId(audioManager.getActiveId(), requestedAudioId)) {
          audioManager.setActiveById(requestedAudioId);
        }
      } else {
        ready = false;
      }
    }

    const activeSubtitleIds = textManager.getActiveIds();
    if (Number.isFinite(requestedSubtitleId) && requestedSubtitleId >= 0) {
      if (textManager.getTrackById(requestedSubtitleId)) {
        if (!activeSubtitleIds.some(id => sameTrackId(id, requestedSubtitleId))) {
          setActiveSubtitleIds([requestedSubtitleId]);
        } else {
          scheduleSubtitleStyleRestore([requestedSubtitleId]);
        }
      } else {
        // Do not disable the currently active subtitle while CAF is still
        // rebuilding its track managers after seek or replacement LOAD.
        ready = false;
      }
    } else if (activeSubtitleIds.length > 0) {
      setActiveSubtitleIds([]);
    }
    return ready;
  } catch (error) {
    console.warn('[SWEET Receiver] Requested tracks are not ready', error);
    return false;
  }
}

function scheduleTrackSelectionRestore() {
  cancelTrackSelectionRestore();
  if (!currentPresentation) {
    return;
  }
  const token = trackRestoreToken;
  let attempt = 0;
  const restore = () => {
    trackRestoreTimer = null;
    if (token !== trackRestoreToken || !currentPresentation) {
      return;
    }
    const ready = restoreRequestedTrackSelection();
    if (ready) {
      sendTrackCatalog();
      return;
    }
    attempt += 1;
    if (attempt < TRACK_RESTORE_RETRY_DELAYS_MS.length) {
      trackRestoreTimer = setTimeout(
        restore,
        TRACK_RESTORE_RETRY_DELAYS_MS[attempt]);
    }
  };
  trackRestoreTimer = setTimeout(
    restore,
    TRACK_RESTORE_RETRY_DELAYS_MS[attempt]);
}

function applyTrackSelection(message) {
  if (currentPresentation?.isRecording) {
    return;
  }
  if (hasOwn(message, 'audioId')) {
    const audioId = Number(message.audioId);
    if (Number.isFinite(audioId) && audioId >= 0) {
      playerManager.getAudioTracksManager().setActiveById(audioId);
      if (currentPresentation) {
        currentPresentation.selectedAudioId = audioId;
      }
    }
  }
  if (hasOwn(message, 'subtitleId')) {
    const subtitleId = Number(message.subtitleId);
    const normalizedSubtitleId =
      Number.isFinite(subtitleId) && subtitleId >= 0 ? subtitleId : -1;
    if (shouldIgnoreSenderSubtitleSelection(normalizedSubtitleId)) {
      console.info(
        '[SWEET Receiver] Ignoring stale sender subtitle selection',
        normalizedSubtitleId);
    } else {
      if (currentPresentation) {
        currentPresentation.selectedSubtitleId = normalizedSubtitleId;
      }
      setActiveSubtitleIds(normalizedSubtitleId >= 0 ? [normalizedSubtitleId] : []);
    }
  }
  updateControlAvailability();
  updateControlLabels();
  if (isOptionsVisible()) {
    renderOptions();
  }
  notifyTrackSelection({
    audioId: currentPresentation?.selectedAudioId ?? -1,
    subtitleId: currentPresentation?.selectedSubtitleId ?? -1,
  });
}

function applyQualityCatalog(message) {
  if (!currentPresentation) {
    return;
  }
  const contentKey = String(message?.contentKey || '');
  if (contentKey && contentKey !== currentPresentation.contentKey) {
    return;
  }
  const qualityOptions = normalizedQualityOptions(message?.options);
  if (qualityOptions.length === 0) {
    return;
  }
  currentPresentation.qualityOptions = qualityOptions;
  if (hasOwn(message, 'maxHeight')) {
    currentPresentation.maxHeight = normalizedMaxHeight(message.maxHeight);
  }
  updateControlAvailability();
  updateControlLabels();
  if (isOptionsVisible() && menuSection === 'quality') {
    renderOptions();
  }
}

function messageMatchesCurrentContent(message) {
  const contentKey = String(message?.contentKey || '');
  return !contentKey || contentKey === currentPresentation?.contentKey;
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
  const selected = CONTROL_ORDER[controlSelection] || 'play';
  return controlElementFor(selected)?.hidden ? 'play' : selected;
}

function showOptionsForControl(control) {
  if (control === 'audio' || control === 'subtitles' || control === 'quality') {
    return showOptions(control);
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
    scheduleControlsHide();
    seekSettleTimer = clearTimer(seekSettleTimer);
    seekSettleTimer = setTimeout(() => {
      pendingSeek = null;
      seekSettleTimer = null;
      hideSeekPreview();
      scheduleTrackSelectionRestore();
      if (controlsAreVisible()) {
        updatePauseProgress();
      }
    }, SEEK_SETTLE_TIMEOUT_MS);
  }, SEEK_COMMIT_DELAY_MS);
}

function togglePlayback() {
  if (isPlaybackPaused()) {
    playbackPaused = false;
    playerManager.play();
  } else {
    playbackPaused = true;
    playerManager.pause();
  }
  showPause(true);
}

function isPlaybackPaused() {
  const state = playerManager.getPlayerState();
  if (state === cast.framework.messages.PlayerState.PAUSED) {
    return true;
  }
  if (state === cast.framework.messages.PlayerState.PLAYING
      || state === cast.framework.messages.PlayerState.BUFFERING) {
    return false;
  }
  return playbackPaused;
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
  const eventCode = event.code || event.keyIdentifier || '';
  const code = Number(event.keyCode || event.which || 0);
  // Chromecast built-in devices may expose either browser key codes or the
  // original Android TV DPAD codes.
  const left = key === 'ArrowLeft'
    || key === 'Left'
    || eventCode === 'ArrowLeft'
    || code === 21
    || code === 37;
  const right = key === 'ArrowRight'
    || key === 'Right'
    || eventCode === 'ArrowRight'
    || code === 22
    || code === 39;
  const up = key === 'ArrowUp'
    || key === 'Up'
    || eventCode === 'ArrowUp'
    || code === 19
    || code === 38;
  const down = key === 'ArrowDown'
    || key === 'Down'
    || eventCode === 'ArrowDown'
    || code === 20
    || code === 40;
  const enter = key === 'Enter'
    || key === ' '
    || key === 'Spacebar'
    || key === 'Accept'
    || key === 'Select'
    || key === 'OK'
    || eventCode === 'Enter'
    || eventCode === 'NumpadEnter'
    || code === 13
    || code === 23
    || code === 66
    || code === 160;
  const back = isBackKeyEvent(event);
  const playPause = key === 'MediaPlayPause' || code === 179;
  const stop = key === 'MediaStop' || code === 86 || code === 178 || code === 413;

  if (!(left || right || up || down || enter || back || playPause || stop)) {
    return;
  }

  if (back && !isOptionsVisible() && !controlsAreVisible()) {
    return;
  }
  consumeRemoteKey(event);

  if (stop) {
    suppressStopKeyUp = true;
    stopPlaybackFromRemote();
    return;
  }

  if (isOptionsVisible()) {
    if (menuFocusArea === 'close') {
      if (enter) {
        closeOptionsAndRestoreFocus();
      } else if (back) {
        suppressBackKeyUp = back;
        if (menuSection === 'subtitle-style') {
          returnToSubtitleTrackOptions();
        } else {
          closeOptionsAndRestoreFocus();
        }
      } else if (right || up || down) {
        menuFocusArea = 'list';
        if (up) {
          const items = optionItems();
          menuSelection = nearestSelectableIndex(items, items.length - 1, -1);
        }
        renderOptions();
      }
    } else if (up || down) {
      moveMenuSelection(up ? -1 : 1);
    } else if (left) {
      menuFocusArea = 'close';
      renderOptions();
    } else if (enter) {
      applySelectedOption();
    } else if (back) {
      suppressBackKeyUp = back;
      if (menuSection === 'subtitle-style') {
        returnToSubtitleTrackOptions();
      } else {
        closeOptionsAndRestoreFocus();
      }
    }
    return;
  }

  if (back) {
    suppressBackKeyUp = true;
    hidePause();
    return;
  }

  if (!controlsAreVisible()) {
    if (enter) {
      showPause(true);
      setControlsFocus('actions', CONTROL_ORDER.indexOf('play'));
      return;
    }
    if (left || right) {
      showPause(false);
      if (timelineIsFocusable()) {
        setControlsFocus('timeline');
        previewRemoteSeek(left ? -1 : 1);
      } else {
        setControlsFocus('actions', CONTROL_ORDER.indexOf('play'));
        showPause(true);
      }
      return;
    }
    showPause(true);
    if (up || down) {
      setControlsFocus('actions', CONTROL_ORDER.indexOf('play'));
      return;
    }
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
    const available = availableControlNames();
    const currentName = focusedControlName();
    const currentIndex = Math.max(0, available.indexOf(currentName));
    const nextName = available[
      (currentIndex + direction + available.length) % available.length];
    setControlsFocus('actions', CONTROL_ORDER.indexOf(nextName));
    showPause(true);
  } else if (up) {
    if (timelineIsFocusable()) {
      setControlsFocus('timeline');
    }
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
  const key = event.key || '';
  const code = event.keyCode;
  const stop = key === 'MediaStop' || code === 86 || code === 178 || code === 413;
  if (suppressStopKeyUp && stop) {
    consumeRemoteKey(event);
    suppressStopKeyUp = false;
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
  controlsGeneration += 1;
  ensureReceiverKeyFocus();
  playbackStopped = false;
  playbackEnded = false;
  playbackPaused = loadRequest.autoplay === false;
  showControlsOnNextPlayback = true;
  currentPresentation = presentationFor(media, customData);
  presentationTerminalGuardUntil =
    Date.now() + PRESENTATION_START_TERMINAL_GUARD_MS;
  controlsFocusArea = 'actions';
  controlSelection = CONTROL_ORDER.indexOf('play');
  menuSection = 'audio';
  menuSelection = 0;
  menuFocusArea = 'list';
  menuReturnControl = 'audio';
  if (pendingControlAfterLoad
      && pendingControlAfterLoad.contentKey !== currentPresentation.contentKey) {
    pendingControlAfterLoad = null;
  } else if (pendingControlAfterLoad) {
    pendingControlAfterLoad.loadObserved = true;
  }
  audioTrackCatalog = [];
  subtitleTrackCatalog = [];
  resetPresentationLayers();
  updateControlAvailability();
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

playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.EDIT_TRACKS_INFO,
  request => {
    if (request?.textTrackStyle) {
      request.textTrackStyle = buildReceiverSubtitleStyle();
      setTimeout(() => {
        applySubtitleStyle(false, false);
        scheduleSubtitleStyleRestore(
          playerManager.getTextTracksManager().getActiveIds());
        notifySubtitleStyleApplied();
      }, 0);
    }
    return request;
  });

playerManager.setMediaPlaybackInfoHandler((loadRequest, playbackConfig) => {
  playbackHasError = false;
  playbackStopped = false;
  playbackEnded = false;
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
  playbackConfig.enableUITextDisplayer = true;

  if (drm.licenseUrl) {
    playbackConfig.licenseUrl = drm.licenseUrl;
    playbackConfig.protectionSystem = cast.framework.ContentProtection.WIDEVINE;
    // CAF maps licenseUrl for VOD. Live/catch-up Widevine HLS needs the
    // explicit Shaka key-system mapping; applying it to VOD can make CAF send
    // a second, incompatible license request on some receiver versions.
    if (drm.isLive || drm.isRecording) {
      playbackConfig.shakaConfig = {
        drm: {
          servers: {
            'com.widevine.alpha': drm.licenseUrl,
          },
        },
      };
    }
  }

  if (drm.licenseHeaders) {
    playbackConfig.licenseRequestHandler = requestInfo => {
      Object.assign(requestInfo.headers, drm.licenseHeaders);
    };
  }

  const maxHeight = normalizedMaxHeight(drm.maxHeight);
  if (maxHeight > 0) {
    playbackConfig.shakaConfig = {
      ...(playbackConfig.shakaConfig || {}),
      restrictions: {
        ...((playbackConfig.shakaConfig || {}).restrictions || {}),
        maxHeight,
      },
    };
  }

  // Older Cast implementations on Philips TVs can fail with Shaka 3016 when
  // ABR changes HLS variants and the hardware decoder is reinitialized. The
  // dedicated Cast URL already contains TV-compatible renditions, so keep one
  // rendition for the lifetime of this load. Manual quality changes still
  // work because the sender performs a new LOAD with a maxHeight restriction.
  if (!drm.licenseUrl
      && drm.isLive
      && drm.castUrlSource === 'chrome_cast_url') {
    playbackConfig.shakaConfig = {
      ...(playbackConfig.shakaConfig || {}),
      abr: {
        ...((playbackConfig.shakaConfig || {}).abr || {}),
        enabled: false,
        useNetworkInformation: false,
        defaultBandwidthEstimate: 4000000,
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
  playbackEnded = false;
  pendingControlAfterLoad = null;
  hideIdle();
  showError(code);
  sendReceiverMessage({
    type: 'receiver-error',
    contentKey: currentPresentation?.contentKey || '',
    code: String(code),
    details,
  });
});

playerManager.addEventListener(cast.framework.events.EventType.PLAYER_LOAD_COMPLETE, () => {
  playbackHasError = false;
  ensureReceiverKeyFocus();
  scheduleTrackSelectionRestore();
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
  showInitialControlsIfReady();
});

function handleMediaFinished(event) {
  if (isReplacementLoadActive() || isPresentationStartTerminalEvent()) {
    return;
  }
  const endedReason = event.endedReason;
  const endedNaturally = endedReason === cast.framework.events.EndedReason.END_OF_STREAM;
  if (endedNaturally && currentPresentation?.isMovie && !playbackHasError) {
    playbackEnded = true;
    showEnd();
    return;
  }
  enterStoppedState();
}

playerManager.addEventListener(cast.framework.events.EventType.REQUEST_STOP, () => {
  if (isReplacementLoadActive() || isPresentationStartTerminalEvent()) {
    return;
  }
  enterStoppedState();
});

playerManager.addEventListener(cast.framework.events.EventType.BUFFERING, event => {
  if (event.isBuffering) {
    showLoader();
  } else {
    hideLoader();
  }
});

function handlePlaybackPause() {
  playbackPaused = true;
  hideLoader();
  if (playbackEnded) {
    hidePause();
    return;
  }
  if (playbackStopped
      || playerManager.getPlayerState() === cast.framework.messages.PlayerState.IDLE) {
    hidePause();
    showIdle();
    return;
  }
  showPause();
}

function handlePlaybackPlaying() {
  ensureReceiverKeyFocus();
  playbackPaused = false;
  playbackStopped = false;
  playbackEnded = false;
  if (presentationTerminalGuardUntil > 0) {
    presentationTerminalGuardUntil = Math.min(
        presentationTerminalGuardUntil,
        Date.now() + PLAYING_TERMINAL_GUARD_MS);
  }
  scheduleTrackSelectionRestore();
  hideLoader();
  if (restorePendingControlAfterLoad(true)) {
    hideEnd();
    return;
  }
  if (showInitialControlsIfReady(true)) {
    return;
  }
  if (isOptionsVisible()) {
    setLayerVisible(pauseElement, false);
    setSubtitlesLifted(false);
  } else if (pauseElement?.classList.contains('visible')) {
    showPause(true);
  } else {
    hidePause();
  }
  hideEnd();
}

playerManager.addEventListener(
    cast.framework.events.EventType.MEDIA_FINISHED, handleMediaFinished);
playerManager.addEventListener(
    cast.framework.events.EventType.PAUSE, handlePlaybackPause);
playerManager.addEventListener(
    cast.framework.events.EventType.PLAYING, handlePlaybackPlaying);

if (cast.framework.events.EventType.TIME_UPDATE) {
  playerManager.addEventListener(cast.framework.events.EventType.TIME_UPDATE, () => {
    if (pendingSeek !== null) {
      const actualPosition = playerManager.getCurrentTimeSec();
      if (Number.isFinite(actualPosition) && Math.abs(actualPosition - pendingSeek) < 2.5) {
        pendingSeek = null;
        seekSettleTimer = clearTimer(seekSettleTimer);
        hideSeekPreview();
        scheduleTrackSelectionRestore();
      }
    }
    if (playerManager.getPlayerState() === cast.framework.messages.PlayerState.PLAYING) {
      hideLoader();
      if (!restorePendingControlAfterLoad()) {
        showInitialControlsIfReady();
      }
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
    } else if (!messageMatchesCurrentContent(message)) {
      return;
    } else if (message?.type === 'select-tracks') {
      applyTrackSelection(message);
    } else if (message?.type === 'subtitle-style') {
      applyReceiverOwnedSubtitleStyle();
    } else if (message?.type === 'quality-catalog') {
      applyQualityCatalog(message);
    } else if (message?.type === 'quality-applied' && pendingControlAfterLoad) {
      pendingControlAfterLoad.loadObserved = true;
      restorePendingControlAfterLoad(true);
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
installSubtitleUiPositioning();
hideLoader();
showIdle();
