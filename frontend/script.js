// SPHEREx Explorer frontend.
// Real IRSA frames are loaded through the same-origin backend. Local PNGs stay local.
import { angularSeparation, healpixNest, luma, normalizeRa, robustChangeThreshold, unwrapRa } from './math.js';

const $ = (id) => document.getElementById(id);
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function frameDisplaySrc(frame) {
  if (!frame) return '';
  return frame.objectUrl || (frame.real && !frame.mosaic ? TRANSPARENT_PIXEL : frame.src || '');
}
const el = {
  target: $('target'), ra: $('ra'), dec: $('dec'), fov: $('fov'), detector: $('detector'), bandHint: $('bandHint'),
  loadReal: $('loadReal'), emptyReal: $('emptyReal'), sourceLabel: $('sourceLabel'),
  targetMeta: $('targetMeta'), fieldMeta: $('fieldMeta'), fieldConstellation: $('fieldConstellation'),
  advancedControls: $('advancedControls'), fullFitsDetails: $('fullFitsDetails'), modeHint: $('modeHint'), explorerMode: $('explorerMode'), researchMode: $('researchMode'), startHere: $('startHere'),
  verificationBadge: $('verificationBadge'), verificationLabel: $('verificationLabel'), verificationNote: $('verificationNote'),
  speed: $('frameSpeed'), speedValue: $('speedValue'),
  quickPrevious: $('quickPrevious'), quickPlay: $('quickPlay'), quickNext: $('quickNext'),
  quickTimeline: $('quickTimeline'), quickVisit: $('quickVisit'), quickBand: $('quickBand'),
  quickPalette: $('quickPalette'), quickStretch: $('quickStretch'), quickMore: $('quickMore'),
  crosshairCheck: $('showCrosshair'), crosshair: $('crosshair'), spectrumPickMarker: $('spectrumPickMarker'),
  stage: $('viewerStage'), transform: $('imageTransform'), image: $('skyImage'),
  differenceCanvas: $('differenceCanvas'), difference: $('difference'),
  empty: $('emptyState'), emptyEyebrow: $('emptyEyebrow'), emptyTitle: $('emptyTitle'), emptyMessage: $('emptyMessage'),
  stageLoading: $('stageLoading'), stageLoadingTitle: $('stageLoadingTitle'), stageLoadingNote: $('stageLoadingNote'), stageBadge: $('stageBadge'), viewerTitle: $('viewerTitle'),
  stageDate: $('stageDate'), stageMode: $('stageMode'), filmstrip: $('filmstrip'),
  zoomIn: $('zoomIn'), zoomOut: $('zoomOut'), zoomNative: $('zoomNative'), resetView: $('resetView'), zoomLevel: $('zoomLevel'), copyLink: $('copyLink'),
  hdToggle: $('hdToggle'), hdToggleLab: $('hdToggleLab'), stageResolution: $('stageResolution'), fullscreen: $('fullscreen'),
  appToggle: $('appToggle'), navMapApp: $('navMapApp'), appToolbar: $('appToolbar'), appHome: $('appHome'),
  appLive: $('appLive'), appLiveText: $('appLiveText'),
  detailRoute: $('detailRoute'), sourceStatusSummary: $('sourceStatusSummary'), sourceStatusList: $('sourceStatusList'),
  sourceCheckedAt: $('sourceCheckedAt'), sourceRefresh: $('sourceRefresh'),
  hipsContextImage: $('hipsContextImage'), hipsContextMeta: $('hipsContextMeta'),
  hipsContextLink: $('hipsContextLink'), hipsContextFallback: $('hipsContextFallback'),
  appDetails: $('appDetails'), appSequence: $('appSequence'), appTools: $('appTools'), appShare: $('appShare'), appExit: $('appExit'),
  appDetailsClose: $('appDetailsClose'), appToolsClose: $('appToolsClose'), sequenceClose: $('sequenceClose'), appScrim: $('appScrim'),
  mapSearchForm: $('mapSearchForm'), mapSearch: $('mapSearch'), navBack: $('navBack'), navForward: $('navForward'), minimapToggle: $('minimapToggle'),
  skyMinimapWrap: $('skyMinimapWrap'), skyMinimap: $('skyMinimap'), minimapField: $('minimapField'),
  minimapTitle: $('minimapTitle'), minimapHint: $('minimapHint'), minimapMode: $('minimapMode'),
  minimapZoomIn: $('minimapZoomIn'), minimapZoomOut: $('minimapZoomOut'),
  visitNotice: $('visitNotice'), visitNoticeText: $('visitNoticeText'), visitNoticeRetry: $('visitNoticeRetry'), visitNoticeAction: $('visitNoticeAction'),
  visitWindowBox: $('visitWindowBox'), visitWindowText: $('visitWindowText'), visitWindowDetail: $('visitWindowDetail'),
  toolsSkyImage: $('toolsSkyImage'), toolsSkyTitle: $('toolsSkyTitle'), toolsSkyMeta: $('toolsSkyMeta'),
  mapCursor: $('mapCursor'), mapScaleBar: $('mapScaleBar'), mapScaleText: $('mapScaleText'), mapCompass: $('mapCompass'), mapHelp: $('mapHelp'),
  paletteSelect: $('paletteSelect'), stretchSelect: $('stretchSelect'), sharpPixels: $('sharpPixels'),
  bandRail: $('bandRail'), spectralRail: $('spectralRail'), spectralRailStatus: $('spectralRailStatus'), wavelengthBandName: $('wavelengthBandName'), wavelengthRange: $('wavelengthRange'),
  wavelengthBandwidth: $('wavelengthBandwidth'), wavelengthPixelScale: $('wavelengthPixelScale'), wavelengthFrames: $('wavelengthFrames'),
  bandSummary: $('bandSummary'),
  constellationName: $('constellationName'), constellationSymbol: $('constellationSymbol'), constellationCopy: $('constellationCopy'),
  constellationRa: $('constellationRa'), constellationGalactic: $('constellationGalactic'), constellationEcliptic: $('constellationEcliptic'),
  constellationResolved: $('constellationResolved'), constellationNeighbors: $('constellationNeighbors'), constellationMethod: $('constellationMethod'),
  constellationRefresh: $('constellationRefresh'), constellationSource: $('constellationSource'),
  verificationScore: $('verificationScore'), verificationList: $('verificationList'), verificationSources: $('verificationSources'),
  verifySourceSia: $('verifySourceSia'), verifySourceFits: $('verifySourceFits'), verifySiaDetail: $('verifySiaDetail'), verifyFitsDetail: $('verifyFitsDetail'),
  verifyGaia: $('verifyGaia'), verifyGaiaDetail: $('verifyGaiaDetail'), receiptDownload: $('receiptDownload'),
  checksumValue: $('checksumValue'),
  previous: $('previous'), next: $('next'), play: $('playPause'), timeline: $('timeline'),
  frameLabel: $('frameLabel'), frameCount: $('frameCount'),
  frameA: $('frameA'), frameB: $('frameB'), blink: $('blink'), showCompare: $('showCompare'), swapCompare: $('swapCompare'),
  compareGrid: $('compareGrid'), compareImageA: $('compareImageA'), compareImageB: $('compareImageB'),
  compareLabelA: $('compareLabelA'), compareLabelB: $('compareLabelB'),
  detailSource: $('detailSource'), detailFrame: $('detailFrame'), detailObsid: $('detailObsid'),
  detailSize: $('detailSize'), detailRA: $('detailRA'), detailDec: $('detailDec'),
  detailDateBig: $('detailDateBig'),
  detailSexagesimal: $('detailSexagesimal'), detailConstellation: $('detailConstellation'),
  detailGalactic: $('detailGalactic'), detailEcliptic: $('detailEcliptic'),
  detailDate: $('detailDate'), detailWavelength: $('detailWavelength'),
  detailIntensity: $('detailIntensity'), detailRange: $('detailRange'), detailFullRange: $('detailFullRange'),
  detailMean: $('detailMean'), detailVariance: $('detailVariance'), detailZodi: $('detailZodi'),
  detailFlags: $('detailFlags'), detailWave: $('detailWave'),
  detailExposure: $('detailExposure'), detailPixelScale: $('detailPixelScale'), toast: $('toast'),
  stageProgress: $('stageProgress')
};

const BAND_INFO = {
  D1: { low: 0.7349, high: 1.1263, label: 'D1', color: '#9fc6ff' },
  D2: { low: 1.0859, high: 1.6677, label: 'D2', color: '#c5a7ff' },
  D3: { low: 1.6163, high: 2.4391, label: 'D3', color: '#ff9bcf' },
  D4: { low: 2.3980, high: 3.8629, label: 'D4', color: '#ffb27a' },
  D5: { low: 3.7984, high: 4.4426, label: 'D5', color: '#ffd37a' },
  D6: { low: 4.4018, high: 5.0246, label: 'D6', color: '#f4f0de' }
};

const targets = {
  spherex: {
    label: 'Wide field · Leo', constellation: 'Leo', ra: 150, dec: 19.5, fov: 0.3,
    meta: 'A real DR1 field with multiple IRSA visits. A good place to learn the viewer.'
  },
  barnard: {
    label: "Barnard's Star", constellation: 'Ophiuchus', ra: 269.452075, dec: 4.69339, fov: 0.3,
    meta: 'M4V red dwarf · 5.96 ly · moving 10.3″ per year. One of the fastest stars in our sky.'
  },
  epsindi: {
    label: 'Epsilon Indi B', constellation: 'Indus', ra: 331.04417, dec: -56.78283, fov: 0.3,
    meta: 'T1 + T6 brown-dwarf pair · 11.9 ly · 6.7′ from Epsilon Indi A. A 0.30° field includes both.'
  },
  wise0855: {
    label: 'WISE 0855−0714', constellation: 'Hydra', ra: 133.795129, dec: -7.245147, fov: 0.3,
    meta: 'Y2 sub-brown dwarf · 7.3 ly · the coldest known brown dwarf, with a fast proper motion.'
  },
  rwaur: {
    label: 'RW Aurigae', constellation: 'Auriga', ra: 76.95625, dec: 30.40111, fov: 0.3,
    meta: 'A young T Tauri variable · Auriga · changes in brightness trace accretion and dust.'
  },
  rdra: {
    label: 'R Draconis', constellation: 'Draco', ra: 248.1675, dec: 66.755, fov: 0.3,
    meta: 'A long-period Mira-type variable · Draco · compare visits to see its brightness change.'
  },
  custom: {
    label: 'Custom sky region', constellation: '', ra: null, dec: null, fov: 0.3,
    meta: 'Enter any J2000 right ascension and declination. Decimal degrees or sexagesimal both work.'
  }
};

let differenceMode = false;
let differenceToken = 0;

let frames = [];
let frameIndex = 0, interval = null, blinkMode = false, comparisonOpen = false;
const MAX_ZOOM = 12;
const ORIENTATION_TOLERANCE_DEG = 3;
let zoom = 1, panX = 0, panY = 0;
let detector = 'D2', palette = 'iridescent', stretch = 'asinh', hdMode = false;
// Detector of the frames that are actually on screen. A band becomes active only
// after its visits have replaced the frame in the viewer, never while loading.
let appliedDetector = null;
const activePointers = new Map();
let singleGesture = null, pinchGesture = null;
const navHistory = [];
let navIndex = -1;
let minimapPointer = null;
let minimapGlobeGesture = null;
let constellationRequest = 0, constellationData = null;
let ownedObjectUrls = [];
let toastTimeout = null, loadingReal = false, sky = null, realBadge = 'LIVE IRSA • REAL FITS';
let loadRequest = 0, activeLoadController = null;
let lastStageKey = '';
let sourceState = 'pending';
const DEFAULT_TARGET = 'barnard';
const MODE_KEY = 'drift-detail-mode-v1';

function notify(message) {
  el.toast.textContent = message;
  el.toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.toast.classList.remove('visible'), 4200);
}

function parseRa(value) {
  const text = String(value).trim().replace(/[hms]/gi, ' ').replace(/[:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return Number.NaN;
  if (!/[\s]/.test(text)) return Number(text);
  const parts = text.split(' ').map(Number);
  if (![2, 3].includes(parts.length) || parts.some(part => !Number.isFinite(part))) return Number.NaN;
  const [hours, minutes, seconds = 0] = parts;
  if (hours < 0 || hours >= 24 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return Number.NaN;
  return (hours + minutes / 60 + seconds / 3600) * 15;
}

function parseDec(value) {
  const raw = String(value).trim();
  if (!raw) return Number.NaN;
  const normalized = raw.replace(/−/g, '-');
  const negative = normalized.startsWith('-');
  const text = normalized.replace(/[°d'"′″hms]/gi, ' ').replace(/[:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/[\s]/.test(text)) return Number(text);
  const parts = text.split(' ').map(Number);
  if (![2, 3].includes(parts.length) || parts.some(part => !Number.isFinite(part))) return Number.NaN;
  const [degrees, minutes, seconds = 0] = parts.map(Math.abs);
  if (degrees > 90 || minutes >= 60 || seconds >= 60) return Number.NaN;
  return (negative ? -1 : 1) * (degrees + minutes / 60 + seconds / 3600);
}

function formatRaHms(ra) {
  const hours = ((ra % 360) + 360) % 360 / 15;
  const h = Math.floor(hours);
  const minutes = Math.floor((hours - h) * 60);
  const seconds = ((hours - h) * 60 - minutes) * 60;
  return `${String(h).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${seconds.toFixed(2).padStart(5, '0')}s`;
}

function formatDecDms(dec) {
  const sign = dec < 0 ? '−' : '+';
  const absolute = Math.abs(dec);
  const degrees = Math.floor(absolute);
  const minutes = Math.floor((absolute - degrees) * 60);
  const seconds = ((absolute - degrees) * 60 - minutes) * 60;
  return `${sign}${String(degrees).padStart(2, '0')}° ${String(minutes).padStart(2, '0')}′ ${seconds.toFixed(2).padStart(5, '0')}″`;
}

function coordinateText(ra, dec) {
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return 'Coordinates unavailable';
  return `${formatRaHms(ra)} · ${formatDecDms(dec)}`;
}

function updateTargetMeta(selected) {
  if (!selected) return;
  if (selected.ra === null || selected.dec === null) {
    el.targetMeta.textContent = selected.meta;
    return;
  }
  el.targetMeta.textContent = `${coordinateText(selected.ra, selected.dec)} · ${selected.meta}`;
}

function updateUrl(field, key) {
  const url = new URL(window.location.href);
  url.searchParams.set('ra', field.ra.toFixed(5));
  url.searchParams.set('dec', field.dec.toFixed(5));
  url.searchParams.set('fov', field.fov.toFixed(2));
  url.searchParams.set('target', key);
  url.searchParams.set('band', detector);
  url.searchParams.set('palette', palette);
  url.searchParams.set('stretch', stretch);
  window.history.replaceState(null, '', url);
}

// The map app is a focus mode for the real viewer. It deliberately reuses the
// existing controls instead of building a second, divergent set of state.
const APP_SHEETS = {
  details: { className: 'sheet-details', button: 'appDetails' },
  sequence: { className: 'sheet-sequence', button: 'appSequence' },
  tools: { className: 'sheet-tools', button: 'appTools' }
};
let appReturnScroll = 0;

function appIsActive() {
  return document.body.classList.contains('map-app');
}

function setAppParam(active) {
  const url = new URL(window.location.href);
  url.searchParams.set('app', active ? '1' : '0');
  window.history.replaceState(null, '', url);
}

function closeAppSheets() {
  for (const [name, sheet] of Object.entries(APP_SHEETS)) {
    document.body.classList.remove(sheet.className);
    const button = el[sheet.button];
    if (button) button.setAttribute('aria-expanded', 'false');
  }
  if (el.appScrim) el.appScrim.hidden = true;
}

function openAppSheet(name) {
  const sheet = APP_SHEETS[name];
  if (!sheet || !appIsActive()) return;
  const wasOpen = document.body.classList.contains(sheet.className);
  closeAppSheets();
  if (wasOpen) return;
  document.body.classList.add(sheet.className);
  el[sheet.button]?.setAttribute('aria-expanded', 'true');
  if (name === 'tools') updateToolsSkyContext();
  if (el.appScrim) el.appScrim.hidden = false;
  const close = name === 'details' ? el.appDetailsClose : name === 'tools' ? el.appToolsClose : el.sequenceClose;
  close?.focus({ preventScroll: true });
}

function enterMapApp({ native = false, quiet = false } = {}) {
  if (!appIsActive()) appReturnScroll = window.scrollY;
  closeAppSheets();
  document.body.classList.add('map-app');
  setAppParam(true);
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  requestAnimationFrame(() => {
    render();
    drawMinimap();
  });
  if (native && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {
      if (!quiet) notify('Map app is active. Your browser did not enter native full screen.');
    });
  }
}

function exitMapApp({ top = false } = {}) {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  closeAppSheets();
  document.body.classList.remove('map-app');
  setAppParam(false);
  const destination = top ? 0 : (appReturnScroll || document.getElementById('explorer')?.offsetTop || 0);
  window.scrollTo({ top: destination, left: 0, behavior: 'instant' });
  requestAnimationFrame(() => window.scrollTo({ top: destination, left: 0, behavior: 'instant' }));
}

function storedMode() {
  try { return localStorage.getItem(MODE_KEY) === 'research' ? 'research' : 'explorer'; } catch { return 'explorer'; }
}

function applyMode(mode, { persist = false } = {}) {
  const research = mode === 'research';
  document.body.classList.toggle('research-mode', research);
  document.body.classList.toggle('explorer-mode', !research);
  if (el.explorerMode) {
    el.explorerMode.classList.toggle('active', !research);
    el.explorerMode.setAttribute('aria-pressed', String(!research));
  }
  if (el.researchMode) {
    el.researchMode.classList.toggle('active', research);
    el.researchMode.setAttribute('aria-pressed', String(research));
  }
  if (el.modeHint) {
    el.modeHint.textContent = research
      ? 'Research mode: exact coordinates, field width, detector and provenance controls are open. The data is identical in both modes.'
      : 'Start with a target. Open Advanced controls for coordinates, field width and detector.';
  }
  if (el.advancedControls) el.advancedControls.open = research;
  if (el.fullFitsDetails) el.fullFitsDetails.open = research;
  if (persist) {
    try { localStorage.setItem(MODE_KEY, research ? 'research' : 'explorer'); } catch { /* private modes can block storage */ }
    notify(research ? 'Research mode: full coordinates, FITS details and provenance are open.' : 'Explorer mode: the guided view is back. Advanced controls are still one click away.');
  }
}

function setSectionActive(name) {
  document.querySelectorAll('.section-link').forEach(link => {
    const key = link.dataset.section || (['wavelength', 'spectrum'].includes(link.dataset.openLab) ? 'analyse' : link.dataset.openLab);
    const active = key === name;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function openSection(name) {
  if (name === 'explore') {
    setSectionActive('explore');
    document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const tab = name === 'analyse' ? 'spectrum' : name;
  setSectionActive(name);
  setLabTab(tab);
  document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function startFirstObservation() {
  if (!loadingReal && (el.target.value !== DEFAULT_TARGET || !frames.length)) setTarget(DEFAULT_TARGET);
  document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (!tourSeen()) setTimeout(() => startTour(), 900);
}

function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('target');
  const ra = parseRa(params.get('ra') ?? '');
  const dec = parseDec(params.get('dec') ?? '');
  const fov = Number(params.get('fov'));
  const requestedBand = params.get('band')?.toUpperCase();
  if (requestedBand && BAND_INFO[requestedBand]) detector = requestedBand;
  if (['iridescent', 'gold', 'ice', 'mono'].includes(params.get('palette'))) palette = params.get('palette');
  if (['asinh', 'linear', 'log'].includes(params.get('stretch'))) stretch = params.get('stretch');
  el.detector.value = detector;
  el.paletteSelect.value = palette;
  el.stretchSelect.value = stretch;
  if (key && key !== 'custom' && targets[key]) {
    setTarget(key, false);
    return;
  }
  if (Number.isFinite(ra) && Number.isFinite(dec) && Number.isFinite(fov) && fov >= 0.1 && fov <= 0.9) {
    el.target.value = 'custom';
    el.ra.value = ra.toFixed(5);
    el.dec.value = dec.toFixed(5);
    el.fov.value = String(fov);
    updateTargetMeta(targets.custom);
    el.viewerTitle.textContent = 'Custom sky region';
    el.fieldConstellation.textContent = 'CUSTOM · SPHEREX DR1';
    el.fieldMeta.textContent = `${coordinateText(ra, dec)} · ${fov.toFixed(2)}° field`;
    return;
  }
  setTarget(DEFAULT_TARGET, false);
}

function setTarget(key, shouldLoad = true) {
  const selected = targets[key];
  if (!selected) return;
  el.target.value = key;
  if (selected.ra !== null && selected.dec !== null) {
    el.ra.value = selected.ra.toFixed(5);
    el.dec.value = selected.dec.toFixed(5);
    el.fov.value = String(selected.fov);
  }
  updateTargetMeta(selected);
  if (selected.constellation) {
    el.fieldConstellation.textContent = `${selected.constellation.toUpperCase()} · SPHEREX DR1`;
    el.viewerTitle.textContent = selected.label;
    el.fieldMeta.textContent = `${coordinateText(selected.ra, selected.dec)} · ${selected.fov.toFixed(2)}° field`;
  }
  if (shouldLoad && selected.ra !== null && selected.dec !== null) loadRealFrames();
}

function readField() {
  const ra = parseRa(el.ra.value);
  const dec = parseDec(el.dec.value);
  const fov = Number(el.fov.value);
  if (!Number.isFinite(ra) || ra < 0 || ra > 360) throw new Error('RA must be between 0 and 360 degrees, or hours/minutes/seconds.');
  if (!Number.isFinite(dec) || dec < -90 || dec > 90) throw new Error('Dec must be between −90° and +90°.');
  if (!Number.isFinite(fov) || fov < 0.1 || fov > 0.9) throw new Error('Choose a field width between 0.10° and 0.90°.');
  return { ra, dec, fov };
}

function releaseImages(keep = new Set()) {
  ownedObjectUrls = ownedObjectUrls.filter((url) => {
    if (keep.has(url)) return true;
    URL.revokeObjectURL(url);
    return false;
  });
}

function discardFrameObjects(list) {
  const current = new Set(frames.map((frame) => frame.objectUrl).filter(Boolean));
  for (const frame of list) {
    const url = frame.objectUrl;
    if (!url || current.has(url)) continue;
    URL.revokeObjectURL(url);
    ownedObjectUrls = ownedObjectUrls.filter((item) => item !== url);
    frame.objectUrl = '';
    frame.src = frame.mirrorSrc || '';
  }
}

function stopPlayback() {
  clearInterval(interval); interval = null; blinkMode = false;
  el.play.textContent = '▶ Play visits';
  el.blink.textContent = 'Blink A / B';
  el.blink.classList.remove('active');
  el.blink.setAttribute('aria-pressed', 'false');
  syncQuickTime();
  clearDifference();
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const absolute = Math.abs(value);
  if (absolute >= 1000 || absolute < 0.001) return value.toExponential(2);
  return value.toFixed(3);
}

function formatSky(source = null) {
  const constellation = source?.constellation
    ? { name: source.constellation, symbol: source.constellationSymbol || source.constellation }
    : sky?.constellation;
  const galactic = source && Number.isFinite(source.galacticL) && Number.isFinite(source.galacticB)
    ? { l: source.galacticL, b: source.galacticB }
    : sky?.galactic;
  const ecliptic = source && Number.isFinite(source.eclipticLon) && Number.isFinite(source.eclipticLat)
    ? { lon: source.eclipticLon, lat: source.eclipticLat }
    : sky?.ecliptic;
  const actualRa = Number.isFinite(source?.ra) ? source.ra : null;
  const actualDec = Number.isFinite(source?.dec) ? source.dec : null;
  if (!constellation || !galactic || !ecliptic) {
    el.detailConstellation.textContent = '—';
    el.detailGalactic.textContent = '—';
    el.detailEcliptic.textContent = '—';
    el.detailSexagesimal.textContent = '—';
    return;
  }
  el.detailConstellation.textContent = constellation.name === constellation.symbol
    ? constellation.name
    : `${constellation.name} (${constellation.symbol})`;
  el.detailGalactic.textContent = `${galactic.l.toFixed(2)}° / ${galactic.b >= 0 ? '+' : ''}${galactic.b.toFixed(2)}°`;
  el.detailEcliptic.textContent = `${ecliptic.lon.toFixed(2)}° / ${ecliptic.lat >= 0 ? '+' : ''}${ecliptic.lat.toFixed(2)}°`;
  el.detailSexagesimal.textContent = actualRa !== null && actualDec !== null
    ? `${formatRaHms(actualRa)} · ${formatDecDms(actualDec)}`
    : sky?.raHms ? `${sky.raHms} · ${sky.decDms}` : '—';
}

function updateDetails(frame) {
  if (!frame) {
    el.detailSource.textContent = '—';
    el.detailFrame.textContent = '—';
    el.detailObsid.textContent = '—';
    el.detailSize.textContent = '—';
    el.detailDateBig.textContent = 'No visit yet';
    el.detailRA.textContent = '—';
    el.detailDec.textContent = '—';
    el.detailDate.textContent = 'Not provided';
    el.detailWavelength.textContent = 'Not provided';
    el.detailIntensity.textContent = '—';
    el.detailRange.textContent = '—';
    el.detailFullRange.textContent = '—';
    el.detailMean.textContent = '—';
    el.detailVariance.textContent = '—';
    el.detailZodi.textContent = '—';
    el.detailFlags.textContent = '—';
    el.detailWave.textContent = '—';
    el.detailExposure.textContent = '—';
    el.detailPixelScale.textContent = '—';
    formatSky();
    return;
  }
  const analysis = activeFrameAnalysis();
  const measurementFailed = Boolean(frame.measurementError);
  const measurementPending = frame.real && !analysis && !measurementFailed;
  const unavailable = measurementFailed ? 'Unavailable (measurement failed)' : '—';
  el.detailSource.textContent = frame.mosaic
    ? 'NASA/JPL-Caltech all-sky mosaic'
    : frame.real ? 'IRSA SPHEREx DR1' : 'Local PNG files';
  const route = pixelRouteLabel(frame, analysis);
  el.detailRoute.textContent = route;
  if (frame.real && !frame.mosaic) {
    el.stageBadge.hidden = false;
    el.stageBadge.textContent = /^S3 DIRECT/.test(route) ? 'S3 DIRECT · REAL FITS' : realBadge;
  }
  el.detailFrame.textContent = frame.label;
  el.detailObsid.textContent = frame.obsid || analysis?.obsid || '—';
  const displayWidth = hdMode && frame.hdWidth ? frame.hdWidth : frame.width;
  const displayHeight = hdMode && frame.hdHeight ? frame.hdHeight : frame.height;
  el.detailSize.textContent = displayWidth && displayHeight ? `${displayWidth} × ${displayHeight} px${hdMode && frame.hdWidth ? ' · wide 0.90°' : ''}` : 'Loading real pixels…';
  el.detailDateBig.textContent = frame.date || frame.label;
  const frameRa = Number.isFinite(analysis?.ra) ? analysis.ra : frame.ra;
  const frameDec = Number.isFinite(analysis?.dec) ? analysis.dec : frame.dec;
  if (frame.real && Number.isFinite(frameRa) && Number.isFinite(frameDec)) {
    el.detailRA.textContent = `${frameRa.toFixed(3)}°`;
    el.detailDec.textContent = `${frameDec > 0 ? '+' : ''}${frameDec.toFixed(3)}°`;
    el.fieldMeta.textContent = frame.mosaic
      ? `${coordinateText(frameRa, frameDec)} · 30° mosaic context · selected ${Number(el.fov.value).toFixed(2)}° field`
      : `${coordinateText(frameRa, frameDec)} · ${hdMode && frame.hdObjectUrl ? 'wide 0.90° window' : `${frame.fov ?? Number(el.fov.value).toFixed(2)}° field`}`;
  } else {
    el.detailRA.textContent = '—';
    el.detailDec.textContent = '—';
  }
  el.detailDate.textContent = analysis?.dateAvg
    ? analysis.dateAvg.replace('T', ' ').slice(0, 23)
    : frame.iso ? frame.iso.replace('T', ' ').slice(0, 19) : 'Not provided';
  el.detailWavelength.textContent = frame.band ? `SPHEREx ${frame.band}` : 'Not provided';
  el.detailIntensity.textContent = analysis
    ? `${formatNumber(analysis.median)} ${analysis.bunit || 'MJy sr⁻¹'}`
    : measurementFailed ? unavailable : measurementPending ? 'Measuring FITS…' : '—';
  el.detailRange.textContent = analysis ? `${formatNumber(analysis.low)} – ${formatNumber(analysis.high)}` : unavailable;
  el.detailFullRange.textContent = analysis ? `${formatNumber(analysis.min)} – ${formatNumber(analysis.max)}` : unavailable;
  el.detailMean.textContent = analysis ? `${formatNumber(analysis.mean)} / ${formatNumber(analysis.median)}` : unavailable;
  el.detailVariance.textContent = analysis && Number.isFinite(analysis.varianceMedian)
    ? formatNumber(analysis.varianceMedian)
    : analysis ? 'Not in cutout' : unavailable;
  el.detailZodi.textContent = analysis && Number.isFinite(analysis.zodiMedian)
    ? formatNumber(analysis.zodiMedian)
    : analysis ? 'Not in cutout' : unavailable;
  el.detailFlags.textContent = analysis && Number.isFinite(analysis.flagged)
    ? frame.width && frame.height
      ? `${analysis.flagged.toLocaleString()} (${((analysis.flagged / (frame.width * frame.height)) * 100).toFixed(1)}%)`
      : analysis.flagged.toLocaleString()
    : measurementFailed || analysis ? 'Unavailable' : measurementPending ? 'Measuring FITS…' : '—';
  el.detailWave.textContent = analysis && Number.isFinite(analysis.waveMin) && Number.isFinite(analysis.waveMax)
    ? `${analysis.waveMin.toFixed(3)}–${analysis.waveMax.toFixed(3)} μm${Number.isFinite(analysis.waveBwMin) && Number.isFinite(analysis.waveBwMax) ? ` (Δλ ${analysis.waveBwMin.toFixed(3)}–${analysis.waveBwMax.toFixed(3)})` : ''}`
    : analysis ? 'Not in cutout' : unavailable;
  el.detailExposure.textContent = analysis && Number.isFinite(analysis.exposure)
    ? `${analysis.exposure.toFixed(1)} s`
    : analysis ? 'Not in cutout header' : unavailable;
  el.detailPixelScale.textContent = analysis && Number.isFinite(analysis.pixelScale)
    ? `${analysis.pixelScale.toFixed(2)}″ / px`
    : analysis ? 'Not in cutout' : unavailable;
  formatSky(analysis);
  if (analysis?.constellation) el.fieldConstellation.textContent = `${analysis.constellation.toUpperCase()} · SPHEREX DR1`;
}

function onScreenDetector() {
  const frame = frames[frameIndex];
  if (frame?.detector && BAND_INFO[frame.detector]) return frame.detector;
  if (appliedDetector && BAND_INFO[appliedDetector]) return appliedDetector;
  return detector;
}

function updateBandUI() {
  const frame = frames[frameIndex];
  const analysis = frame?.analysis || frame?.displayAnalysis;
  const shown = onScreenDetector();
  // The requested band while the frame on screen still belongs to another one.
  const awaiting = shown === detector ? '' : detector;
  const info = BAND_INFO[detector] || BAND_INFO.D2;
  el.wavelengthBandName.textContent = `${detector} · ${info.low.toFixed(3)}–${info.high.toFixed(3)} μm`;
  el.wavelengthRange.textContent = awaiting
    ? `Loading ${awaiting} · the ${shown} frame is still on screen`
    : analysis && Number.isFinite(analysis.waveMin)
      ? `${analysis.waveMin.toFixed(3)}–${analysis.waveMax.toFixed(3)} μm`
      : 'Load a real frame';
  el.wavelengthBandwidth.textContent = !awaiting && analysis && Number.isFinite(analysis.waveBwMin)
    ? `${analysis.waveBwMin.toFixed(3)}–${analysis.waveBwMax.toFixed(3)} μm`
    : '—';
  el.wavelengthPixelScale.textContent = !awaiting && analysis && Number.isFinite(analysis.pixelScale)
    ? `${analysis.pixelScale.toFixed(2)}″ / px`
    : '—';
  el.wavelengthFrames.textContent = awaiting
    ? 'Loading…'
    : frames.filter(item => item.real).length ? `${frames.length} · ${shown}` : '0';
  el.bandSummary.textContent = awaiting
    ? `Querying the archive for real ${awaiting} visits. The viewer still shows ${shown}; ${awaiting} is marked as loading, not as displayed.`
    : `The archive returned ${frames.length || 0} real ${detector} visits for this field. The measured range comes from the FITS WCS-WAVE table.`;
  for (const rail of [el.bandRail, el.spectralRail]) {
    if (!rail) continue;
    rail.dataset.pending = String(Boolean(awaiting));
    if (awaiting) rail.setAttribute('aria-busy', 'true');
    else rail.removeAttribute('aria-busy');
    for (const chip of rail.querySelectorAll('[data-band]')) {
      const band = chip.dataset.band;
      const isAwaiting = Boolean(awaiting) && band === awaiting;
      const isShown = band === shown && !isAwaiting;
      chip.classList.toggle('active', isShown);
      chip.classList.toggle('pending', isAwaiting);
      chip.setAttribute('aria-pressed', String(isShown));
      if (isAwaiting) {
        chip.setAttribute('aria-busy', 'true');
        chip.setAttribute('aria-label', `${band} — loading ${band} visits, the ${shown} frame is still displayed`);
      } else if (awaiting && isShown) {
        chip.removeAttribute('aria-busy');
        chip.setAttribute('aria-label', `${band} — on screen, ${awaiting} is loading`);
      } else {
        chip.removeAttribute('aria-busy');
        chip.removeAttribute('aria-label');
      }
    }
  }
  if (el.spectralRailStatus) {
    // Only rewrite the live region when the state really changes, so assistive
    // technology is not re-announced on every frame measurement.
    const status = awaiting ? `Loading ${awaiting} · ${shown} still shown` : 'Choose a detector';
    if (el.spectralRailStatus.textContent !== status) el.spectralRailStatus.textContent = status;
  }
  el.detector.value = detector;
  syncQuickFilters();
  updateHDControls();
}

function setBand(value, shouldReload = true) {
  if (!BAND_INFO[value]) return;
  // A load already in flight is still querying the previous detector. Restart
  // it for this band, otherwise that query would commit its own detector while
  // this one stayed marked as loading with nothing left to deliver it.
  const reload = Boolean(shouldReload) && (frames.some(frame => frame.real) || loadingReal);
  detector = value;
  // With no load in flight nothing can contradict the choice.
  if (!reload) appliedDetector = value;
  updateBandUI();
  if (reload) loadRealFrames({ preserveCurrent: true });
}

function syncQuickFilters() {
  if (el.quickBand) el.quickBand.value = detector;
  if (el.quickPalette) el.quickPalette.value = palette;
  if (el.quickStretch) el.quickStretch.value = stretch;
}

function populateQuickVisits() {
  if (!el.quickVisit) return;
  const signature = frames.map(frame => frame.label || frame.date || '').join('|');
  if (el.quickVisit.dataset.signature === signature) return;
  el.quickVisit.replaceChildren();
  if (!frames.length) {
    el.quickVisit.add(new Option('No visits loaded', ''));
  } else {
    frames.forEach((frame, index) => {
      el.quickVisit.add(new Option(`${index + 1}. ${frame.label}`, String(index)));
    });
  }
  el.quickVisit.dataset.signature = signature;
}

function syncQuickTime() {
  if (!el.quickTimeline || !el.quickVisit) return;
  const enabled = frames.length > 0;
  el.quickTimeline.max = String(Math.max(0, frames.length - 1));
  el.quickTimeline.value = String(frameIndex);
  el.quickTimeline.disabled = !enabled;
  el.quickPrevious.disabled = !enabled;
  el.quickNext.disabled = !enabled;
  el.quickPlay.disabled = frames.length < 2;
  el.quickPlay.textContent = interval && !blinkMode ? '⏸' : '▶';
  el.quickPlay.setAttribute('aria-label', interval && !blinkMode ? 'Pause visits' : 'Play visits');
  populateQuickVisits();
  el.quickVisit.value = String(frameIndex);
  el.quickVisit.disabled = !enabled;
}

function applyDisplayFilters() {
  palette = el.paletteSelect.value;
  stretch = el.stretchSelect.value;
  syncQuickFilters();
  if (frames.some(frame => frame.real)) loadRealFrames({ preserveCurrent: true });
  else notify('Load a real archive field to apply archive display filters.');
}

function openFilterWorkspace() {
  const tab = document.querySelector('[data-lab-tab="wavelength"]');
  if (tab) tab.click();
  if (appIsActive()) {
    openAppSheet('tools');
    return;
  }
  document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderConstellation(primary, neighborhood = null, error = '') {
  const constellation = primary?.constellation || null;
  if (!constellation) {
    el.constellationName.textContent = '—';
    el.constellationSymbol.textContent = 'Load a sky field to identify its constellation.';
    return;
  }
  el.constellationName.textContent = constellation.name;
  el.constellationSymbol.textContent = `${constellation.symbol || constellation.name} · IAU constellation`;
  const ra = primary.raHms || '—';
  const dec = primary.decDms || '—';
  el.constellationRa.textContent = `${ra} · ${dec}`;
  el.constellationGalactic.textContent = primary.galactic
    ? `${primary.galactic.l.toFixed(2)}° / ${primary.galactic.b >= 0 ? '+' : ''}${primary.galactic.b.toFixed(2)}°`
    : '—';
  el.constellationEcliptic.textContent = primary.ecliptic
    ? `${primary.ecliptic.lon.toFixed(2)}° / ${primary.ecliptic.lat >= 0 ? '+' : ''}${primary.ecliptic.lat.toFixed(2)}°`
    : '—';
  const frame = frames[frameIndex];
  el.constellationResolved.textContent = frame?.analysis?.constellation
    ? `FITS cutout centre: ${frame.analysis.constellation}`
    : 'Requested field centre';
  el.constellationCopy.textContent = `The cutout centre falls inside ${constellation.name} (${constellation.symbol}). Membership is computed from official IAU boundaries at the J2000 position, independently of the IRSA catalogue row.`;
  el.constellationSource.textContent = 'ASTRONOMY-ENGINE · IAU';
  el.constellationMethod.textContent = error
    ? `Neighbourhood unavailable: ${error}`
    : neighborhood?.method || 'Method: astronomy-engine IAU lookup at eight bearings.';
  el.constellationNeighbors.replaceChildren();
  const neighbors = neighborhood?.neighbors || [];
  if (!neighbors.length) {
    const placeholder = document.createElement('p');
    placeholder.className = 'small muted';
    placeholder.textContent = error ? 'The geometry service is unavailable.' : 'No neighbouring constellations were resolved at the sampled radius.';
    el.constellationNeighbors.append(placeholder);
    return;
  }
  for (const neighbor of neighbors) {
    const card = document.createElement('div');
    card.className = 'neighbor-card';
    const symbol = document.createElement('strong');
    symbol.textContent = `${neighbor.symbol || neighbor.name}`;
    const text = document.createElement('span');
    text.textContent = `${neighbor.name} · ${neighbor.direction}`;
    card.append(symbol, text);
    el.constellationNeighbors.append(card);
  }
}

async function loadConstellation(primary, ra, dec) {
  constellationData = primary || sky || null;
  renderConstellation(constellationData, null);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return;
  const request = ++constellationRequest;
  try {
    const params = new URLSearchParams({ ra: String(ra), dec: String(dec), radius: '5' });
    const response = await fetch(`/api/sky/context?${params.toString()}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    const payload = await response.json().catch(() => ({}));
    if (request !== constellationRequest) return;
    if (!response.ok) throw new Error(payload.error || `Sky context returned ${response.status}.`);
    renderConstellation(payload, payload);
  } catch (error) {
    if (request === constellationRequest) renderConstellation(constellationData, null, error.message);
  }
}

// Sky navigation: map-like zoom, pan, point-to-sky conversion and history.

function activeFrameAnalysis() {
  const frame = frames[frameIndex];
  if (!frame) return null;
  return hdMode && frame.hdObjectUrl ? frame.hdAnalysis : frame.analysis || frame.displayAnalysis;
}

function imageBaseRect() {
  const frame = frames[frameIndex];
  const stageWidth = Math.max(1, el.stage.clientWidth);
  const stageHeight = Math.max(1, el.stage.clientHeight);
  const width = hdMode && frame?.hdWidth ? frame.hdWidth : frame?.width || el.image.naturalWidth || stageWidth;
  const height = hdMode && frame?.hdHeight ? frame.hdHeight : frame?.height || el.image.naturalHeight || stageHeight;
  const aspect = width / Math.max(1, height);
  let contentWidth = stageWidth;
  let contentHeight = stageWidth / aspect;
  if (contentHeight > stageHeight) {
    contentHeight = stageHeight;
    contentWidth = stageHeight * aspect;
  }
  return {
    width: contentWidth,
    height: contentHeight,
    left: (stageWidth - contentWidth) / 2,
    top: (stageHeight - contentHeight) / 2,
    stageWidth,
    stageHeight
  };
}

function clampPan() {
  const base = imageBaseRect();
  const maxX = Math.max(0, (base.width * zoom - base.stageWidth) / 2);
  const maxY = Math.max(0, (base.height * zoom - base.stageHeight) / 2);
  panX = Math.max(-maxX, Math.min(maxX, panX));
  panY = Math.max(-maxY, Math.min(maxY, panY));
}

function bilinearSky(corners, fractionX, fractionY) {
  if (!corners) return null;
  const reference = (corners.topLeft.ra + corners.topRight.ra + corners.bottomLeft.ra + corners.bottomRight.ra) / 4;
  const interpolate = (a, b, t) => ({
    ra: unwrapRa(a.ra, reference) * (1 - t) + unwrapRa(b.ra, reference) * t,
    dec: a.dec * (1 - t) + b.dec * t
  });
  const top = interpolate(corners.topLeft, corners.topRight, fractionX);
  const bottom = interpolate(corners.bottomLeft, corners.bottomRight, fractionX);
  return {
    ra: normalizeRa(top.ra * (1 - fractionY) + bottom.ra * fractionY),
    dec: Math.max(-90, Math.min(90, top.dec * (1 - fractionY) + bottom.dec * fractionY))
  };
}

function currentSkyCenter() {
  const frame = frames[frameIndex];
  const analysis = activeFrameAnalysis();
  const ra = Number.isFinite(analysis?.ra) ? analysis.ra : Number.isFinite(frame?.ra) ? frame.ra : parseRa(el.ra.value);
  const dec = Number.isFinite(analysis?.dec) ? analysis.dec : Number.isFinite(frame?.dec) ? frame.dec : parseDec(el.dec.value);
  return {
    ra: Number.isFinite(ra) ? normalizeRa(ra) : 150,
    dec: Number.isFinite(dec) ? dec : 19.5
  };
}

function skyAtStagePoint(clientX, clientY) {
  const frame = frames[frameIndex];
  if (!frame) return null;
  const rect = el.stage.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const imageX = (x - centerX - panX) / zoom + centerX;
  const imageY = (y - centerY - panY) / zoom + centerY;
  const base = imageBaseRect();
  const fractionX = (imageX - base.left) / base.width;
  const fractionY = (imageY - base.top) / base.height;
  if (fractionX < 0 || fractionX > 1 || fractionY < 0 || fractionY > 1) return null;
  const analysis = activeFrameAnalysis();
  if (analysis?.wcsCorners) {
    const skyPoint = bilinearSky(analysis.wcsCorners, fractionX, fractionY);
    if (skyPoint) return { ...skyPoint, exact: true, fractionX, fractionY };
  }
  const center = currentSkyCenter();
  const fov = Number(frame.fov) || Number(el.fov.value) || 0.3;
  const cosDec = Math.max(0.08, Math.cos(center.dec * Math.PI / 180));
  return {
    ra: normalizeRa(center.ra - (fractionX - 0.5) * fov / cosDec),
    dec: Math.max(-90, Math.min(90, center.dec + (0.5 - fractionY) * fov)),
    exact: false,
    fractionX,
    fractionY
  };
}

function formatAngle(degrees) {
  if (!Number.isFinite(degrees)) return '—';
  if (Math.abs(degrees) < 1) return `${(degrees * 60).toFixed(1)}′`;
  return `${degrees.toFixed(2)}°`;
}

function niceScaleAngle(value) {
  const steps = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 45, 90];
  let chosen = steps[0];
  for (const step of steps) if (step <= value) chosen = step;
  return chosen;
}

function updateMapScale() {
  const frame = frames[frameIndex];
  if (!frame) {
    el.mapScaleText.textContent = 'No field';
    return;
  }
  const base = imageBaseRect();
  const fov = Number(frame.fov) || Number(el.fov.value) || 0.3;
  const degreesPerPixel = fov / Math.max(1, base.width * zoom);
  const target = 46 * degreesPerPixel;
  const chosen = niceScaleAngle(target);
  el.mapScaleBar.style.width = `${Math.max(22, Math.min(76, chosen / Math.max(1e-9, degreesPerPixel)))}px`;
  el.mapScaleText.textContent = formatAngle(chosen);
  el.mapHelp.textContent = zoom > 1.01
    ? 'Drag to pan · scroll to zoom · double-click to move'
    : 'Scroll to zoom · double-click to move · drag to explore';
}

function updateCompass() {
  const analysis = activeFrameAnalysis();
  if (!analysis?.wcsCorners) {
    el.mapCompass.style.setProperty('--compass-rotation', '0deg');
    return;
  }
  const center = bilinearSky(analysis.wcsCorners, 0.5, 0.5);
  const right = bilinearSky(analysis.wcsCorners, 0.56, 0.5);
  if (!center || !right) return;
  const east = (unwrapRa(right.ra, center.ra) - center.ra) * Math.cos(center.dec * Math.PI / 180);
  const north = right.dec - center.dec;
  const bearing = Math.atan2(east, north) * 180 / Math.PI;
  el.mapCompass.style.setProperty('--compass-rotation', `${90 - bearing}deg`);
}

function minimapCoordinates(point) {
  const width = el.skyMinimap.width || 420;
  const height = el.skyMinimap.height || 210;
  return {
    x: (1 - normalizeRa(point.ra) / 360) * width,
    y: (0.5 - point.dec / 180) * height
  };
}

// The minimap background is the official NASA/JPL-Caltech SPHEREx all-sky
// mosaic (May-December 2025), in a Galactic equirectangular projection. It is
// a real archive product, stored locally so the context map still works when
// IRSA is unreachable. The equatorial grid and target markers are projected
// onto it; no sky imagery is generated or interpolated.
const GALACTIC_AXIS = {
  x: [-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
  y: [0.4941094278755837, -0.4448296299600112, 0.7469822444972180],
  z: [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669]
};
const allSky = {
  pixels: null, width: 0, height: 0, background: null, texture: null, textureWidth: 0, textureHeight: 0,
  globeImage: null, loaded: false, failed: false, ready: null, resolveReady: null,
  view: { mode: 'globe', zoom: 1, ra: null, dec: null, roll: 0, follow: true }
};
allSky.ready = new Promise(resolve => { allSky.resolveReady = resolve; });

function equatorialToGalactic(raDegrees, decDegrees) {
  const ra = raDegrees * Math.PI / 180;
  const dec = decDegrees * Math.PI / 180;
  const cosDec = Math.cos(dec);
  const ex = cosDec * Math.cos(ra);
  const ey = cosDec * Math.sin(ra);
  const ez = Math.sin(dec);
  const dot = (axis) => ex * axis[0] + ey * axis[1] + ez * axis[2];
  const longitude = Math.atan2(dot(GALACTIC_AXIS.y), dot(GALACTIC_AXIS.x)) * 180 / Math.PI;
  const latitude = Math.asin(Math.max(-1, Math.min(1, dot(GALACTIC_AXIS.z)))) * 180 / Math.PI;
  return { l: (longitude + 360) % 360, b: latitude };
}

function buildAllSkyBackground(outWidth = el.skyMinimap.width || 420, outHeight = el.skyMinimap.height || 210) {
  if (!allSky.pixels) return null;
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const output = context.createImageData(outWidth, outHeight);
  const source = allSky.pixels.data;
  for (let y = 0; y < outHeight; y += 1) {
    const dec = 90 - ((y + 0.5) / outHeight) * 180;
    for (let x = 0; x < outWidth; x += 1) {
      const ra = normalizeRa((1 - (x + 0.5) / outWidth) * 360);
      const galactic = equatorialToGalactic(ra, dec);
      const sx = Math.min(allSky.width - 1, Math.floor((((180 - galactic.l) % 360 + 360) % 360) / 360 * allSky.width));
      const sy = Math.min(allSky.height - 1, Math.max(0, Math.floor((90 - galactic.b) / 180 * allSky.height)));
      const from = (sy * allSky.width + sx) * 4;
      const to = (y * outWidth + x) * 4;
      output.data[to] = source[from];
      output.data[to + 1] = source[from + 1];
      output.data[to + 2] = source[from + 2];
      output.data[to + 3] = 255;
    }
  }
  context.putImageData(output, 0, 0);
  return canvas;
}

function initAllSkyMap() {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas is unavailable.');
      context.drawImage(image, 0, 0);
      allSky.pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      allSky.width = canvas.width;
      allSky.height = canvas.height;
      allSky.background = buildAllSkyBackground();
      const textureCanvas = buildAllSkyBackground(720, 360);
      const textureContext = textureCanvas?.getContext('2d', { willReadFrequently: true });
      if (textureContext) {
        allSky.texture = textureContext.getImageData(0, 0, textureCanvas.width, textureCanvas.height);
        allSky.textureWidth = textureCanvas.width;
        allSky.textureHeight = textureCanvas.height;
      }
      allSky.loaded = Boolean(allSky.background);
      allSky.resolveReady?.(true);
      drawMinimap();
    } catch {
      allSky.failed = true;
      allSky.resolveReady?.(false);
      drawMinimap();
    }
  };
  image.onerror = () => { allSky.failed = true; allSky.resolveReady?.(false); drawMinimap(); };
  image.src = 'assets/spherex-allsky-2025.jpg';
  setMinimapMode(allSky.view.mode);
}

function updateToolsSkyContext() {
  if (!el.toolsSkyImage) return;
  const frame = frames[frameIndex];
  const source = frame?.objectUrl || frame?.src || '';
  el.toolsSkyImage.style.backgroundImage = source ? `url("${source.replace(/"/g, '%22')}")` : '';
  el.toolsSkyImage.classList.toggle('is-empty', !source);
  el.toolsSkyTitle.textContent = frame
    ? `${frame.date || frame.label}${frame.detector ? ` · ${frame.detector}` : ''}`
    : 'No real visit loaded';
  if (!frame) {
    el.toolsSkyMeta.textContent = 'Choose a field to see it beside the tools.';
    return;
  }
  const center = currentSkyCenter();
  el.toolsSkyMeta.textContent = center
    ? `RA ${center.ra.toFixed(3)}° · Dec ${center.dec.toFixed(3)}° · ${(Number(frame.fov) || 0.3).toFixed(2)}° field`
    : 'The current visit has no measured WCS centre.';
}

function skyUnitVector(ra, dec) {
  const raRad = ra * Math.PI / 180;
  const decRad = dec * Math.PI / 180;
  const cosDec = Math.cos(decRad);
  return [cosDec * Math.cos(raRad), cosDec * Math.sin(raRad), Math.sin(decRad)];
}

function globeBasis() {
  const center = skyUnitVector(allSky.view.ra ?? 150, allSky.view.dec ?? 19.5);
  const raRad = (allSky.view.ra ?? 150) * Math.PI / 180;
  const decRad = (allSky.view.dec ?? 19.5) * Math.PI / 180;
  const east = [-Math.sin(raRad), Math.cos(raRad), 0];
  const north = [-Math.sin(decRad) * Math.cos(raRad), -Math.sin(decRad) * Math.sin(raRad), Math.cos(decRad)];
  const roll = (allSky.view.roll || 0) * Math.PI / 180;
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  return {
    center,
    east: east.map((value, index) => value * cosRoll + north[index] * sinRoll),
    north: north.map((value, index) => value * cosRoll - east[index] * sinRoll)
  };
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function projectGlobePoint(ra, dec, basis, cx, cy, radius) {
  const vector = skyUnitVector(ra, dec);
  const facing = dot3(basis.center, vector);
  if (facing <= 0.001) return null;
  return { x: cx + dot3(basis.east, vector) * radius, y: cy - dot3(basis.north, vector) * radius, facing };
}

function globeSkyFromEvent(event) {
  const canvas = el.skyMinimap;
  const rect = canvas.getBoundingClientRect();
  const width = canvas.width;
  const height = canvas.height;
  const x = (event.clientX - rect.left) / rect.width * width;
  const y = (event.clientY - rect.top) / rect.height * height;
  const radius = Math.min(width, height) / 2 - 6;
  const cx = width / 2;
  const cy = height / 2;
  const nx = (x - cx) / (radius * allSky.view.zoom);
  const ny = (cy - y) / (radius * allSky.view.zoom);
  const rho2 = nx * nx + ny * ny;
  if (rho2 > 1) return null;
  const nz = Math.sqrt(1 - rho2);
  const basis = globeBasis();
  const vector = [0, 1, 2].map(index => basis.center[index] * nz + basis.east[index] * nx + basis.north[index] * ny);
  return {
    ra: normalizeRa(Math.atan2(vector[1], vector[0]) * 180 / Math.PI),
    dec: Math.asin(Math.max(-1, Math.min(1, vector[2]))) * 180 / Math.PI
  };
}

function strokeGlobePoints(context, points) {
  let open = false;
  context.beginPath();
  for (const point of points) {
    if (!point) {
      if (open) { context.stroke(); context.beginPath(); open = false; }
      continue;
    }
    if (open) context.lineTo(point.x, point.y);
    else { context.moveTo(point.x, point.y); open = true; }
  }
  if (open) context.stroke();
}

function drawGlobe() {
  const canvas = el.skyMinimap;
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const baseRadius = Math.min(width, height) / 2 - 6;
  const radius = baseRadius * allSky.view.zoom;
  const texture = allSky.texture;
  const tw = allSky.textureWidth;
  const th = allSky.textureHeight;
  context.clearRect(0, 0, width, height);
  const image = allSky.globeImage && allSky.globeImage.width === width && allSky.globeImage.height === height
    ? allSky.globeImage
    : (allSky.globeImage = context.createImageData(width, height));
  image.data.fill(0);
  const basis = globeBasis();
  const data = image.data;
  if (texture && tw && th) {
    const source = texture.data;
    for (let y = 0; y < height; y += 1) {
      const ny = (cy - y - 0.5) / radius;
      for (let x = 0; x < width; x += 1) {
        const nx = (x + 0.5 - cx) / radius;
        const rho2 = nx * nx + ny * ny;
        if (rho2 > 1) continue;
        const nz = Math.sqrt(1 - rho2);
        const vx = basis.center[0] * nz + basis.east[0] * nx + basis.north[0] * ny;
        const vy = basis.center[1] * nz + basis.east[1] * nx + basis.north[1] * ny;
        const vz = basis.center[2] * nz + basis.east[2] * nx + basis.north[2] * ny;
        const ra = normalizeRa(Math.atan2(vy, vx) * 180 / Math.PI);
        const dec = Math.asin(Math.max(-1, Math.min(1, vz))) * 180 / Math.PI;
        const sx = Math.min(tw - 1, Math.floor((((1 - ra / 360) % 1 + 1) % 1) * tw));
        const sy = Math.min(th - 1, Math.max(0, Math.floor((0.5 - dec / 180) * th)));
        const from = (sy * tw + sx) * 4;
        const to = (y * width + x) * 4;
        data[to] = source[from];
        data[to + 1] = source[from + 1];
        data[to + 2] = source[from + 2];
        data[to + 3] = 255;
      }
    }
  }
  context.putImageData(image, 0, 0);

  // Graticule and horizon, projected with the same camera as the texture.
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(116, 151, 182, .28)';
  for (let ra = 0; ra < 360; ra += 30) {
    const points = [];
    for (let dec = -85; dec <= 85; dec += 5) points.push(projectGlobePoint(ra, dec, basis, cx, cy, radius));
    strokeGlobePoints(context, points);
  }
  for (let dec = -60; dec <= 60; dec += 30) {
    const points = [];
    for (let ra = 0; ra <= 360; ra += 5) points.push(projectGlobePoint(ra, dec, basis, cx, cy, radius));
    strokeGlobePoints(context, points);
  }
  context.strokeStyle = 'rgba(242,187,109,.45)';
  const equator = [];
  for (let ra = 0; ra <= 360; ra += 5) equator.push(projectGlobePoint(ra, 0, basis, cx, cy, radius));
  strokeGlobePoints(context, equator);
  context.strokeStyle = 'rgba(113,212,216,.42)';
  context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.stroke();

  // Targets that are on the visible hemisphere.
  for (const [key, target] of Object.entries(targets)) {
    if (key === 'custom' || !Number.isFinite(target.ra) || !Number.isFinite(target.dec)) continue;
    const point = projectGlobePoint(target.ra, target.dec, basis, cx, cy, radius);
    if (!point) continue;
    const selected = el.target.value === key;
    context.beginPath();
    context.arc(point.x, point.y, selected ? 4 : 2.5, 0, Math.PI * 2);
    context.fillStyle = selected ? '#f2bb6d' : 'rgba(160, 199, 228, .8)';
    context.fill();
    if (selected) {
      context.fillStyle = '#f7e3c1';
      context.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.fillText(target.label.split(' · ')[0], Math.min(width - 72, point.x + 6), Math.max(13, point.y - 5));
    }
  }

  const frame = frames[frameIndex];
  if (frame) {
    const center = currentSkyCenter();
    const point = projectGlobePoint(center.ra, center.dec, basis, cx, cy, radius);
    if (point) {
      const fov = Number(frame.fov) || 0.3;
      const ringRadius = Math.max(4, radius * fov / 180);
      context.strokeStyle = '#f2bb6d';
      context.lineWidth = 1.3;
      context.beginPath(); context.arc(point.x, point.y, ringRadius, 0, Math.PI * 2); context.stroke();
      context.beginPath(); context.moveTo(point.x - 8, point.y); context.lineTo(point.x + 8, point.y); context.stroke();
      context.beginPath(); context.moveTo(point.x, point.y - 8); context.lineTo(point.x, point.y + 8); context.stroke();
    }
  }
  el.minimapField.textContent = `RA ${allSky.view.ra.toFixed(2)} · Dec ${allSky.view.dec.toFixed(2)}`;
}

function drawMinimap() {
  if (allSky.view.mode === 'globe') {
    if (allSky.view.follow || !Number.isFinite(allSky.view.ra) || !Number.isFinite(allSky.view.dec)) {
      const center = currentSkyCenter();
      allSky.view.ra = center.ra;
      allSky.view.dec = center.dec;
    }
    drawGlobe();
    return;
  }
  drawFlatMinimap();
}

function drawFlatMinimap() {
  const canvas = el.skyMinimap;
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  if (allSky.background) context.drawImage(allSky.background, 0, 0, width, height);
  else { context.fillStyle = '#050b13'; context.fillRect(0, 0, width, height); }
  // A light scrim keeps the coordinate labels readable over the real mosaic.
  context.fillStyle = 'rgba(3, 7, 12, .22)';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(105, 142, 176, .18)';
  context.fillStyle = 'rgba(137, 164, 190, .55)';
  context.font = '14px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.lineWidth = 1;
  for (let ra = 0; ra <= 360; ra += 30) {
    const x = (1 - ra / 360) * width;
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
    if (ra % 90 === 0) context.fillText(`${ra / 15}h`, Math.min(width - 18, x + 3), 11);
  }
  for (let dec = -60; dec <= 60; dec += 30) {
    const y = (0.5 - dec / 180) * height;
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    context.fillText(`${dec > 0 ? '+' : ''}${dec}°`, 3, Math.max(9, y - 3));
  }
  context.strokeStyle = 'rgba(242,187,109,.28)';
  context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();
  for (const [key, target] of Object.entries(targets)) {
    if (key === 'custom' || !Number.isFinite(target.ra) || !Number.isFinite(target.dec)) continue;
    const point = minimapCoordinates(target);
    const selected = el.target.value === key;
    context.beginPath();
    context.arc(point.x, point.y, selected ? 4 : 2.5, 0, Math.PI * 2);
    context.fillStyle = selected ? '#f2bb6d' : 'rgba(160, 199, 228, .78)';
    context.fill();
    if (selected) {
      context.fillStyle = '#f7e3c1';
      context.fillText(target.label.split(' · ')[0], Math.min(width - 70, point.x + 6), Math.max(10, point.y - 5));
    }
  }
  const frame = frames[frameIndex];
  if (frame) {
    const center = currentSkyCenter();
    const point = minimapCoordinates(center);
    const fov = Number(frame.fov) || 0.3;
    const radius = Math.max(5, (fov / 360) * width);
    context.strokeStyle = '#f2bb6d';
    context.lineWidth = 1.3;
    context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.stroke();
    context.beginPath(); context.moveTo(point.x - 8, point.y); context.lineTo(point.x + 8, point.y); context.stroke();
    context.beginPath(); context.moveTo(point.x, point.y - 8); context.lineTo(point.x, point.y + 8); context.stroke();
    el.minimapField.textContent = `RA ${center.ra.toFixed(2)} · Dec ${center.dec.toFixed(2)}`;
  } else {
    el.minimapField.textContent = 'IAU J2000';
  }
  if (minimapPointer) {
    const point = minimapCoordinates(minimapPointer);
    context.strokeStyle = '#71d4d8';
    context.lineWidth = 1.5;
    context.beginPath(); context.arc(point.x, point.y, 6, 0, Math.PI * 2); context.stroke();
  }
}

function updateMapCenter() {
  if (!frames[frameIndex]) {
    el.mapCursor.textContent = 'Load a sky field to navigate';
    return;
  }
  const center = currentSkyCenter();
  el.mapCursor.textContent = `Centre ${formatRaHms(center.ra)} · ${formatDecDms(center.dec)}`;
}

function setMinimapZoom(value) {
  const view = allSky.view;
  view.zoom = Math.max(1, Math.min(4, value));
  view.follow = false;
  if (el.minimapZoomOut) el.minimapZoomOut.disabled = view.mode !== 'globe' || view.zoom <= 1.001;
  if (el.minimapZoomIn) el.minimapZoomIn.disabled = view.mode !== 'globe' || view.zoom >= 3.999;
  drawMinimap();
}

function setMinimapMode(mode) {
  const view = allSky.view;
  view.mode = mode === 'flat' ? 'flat' : 'globe';
  view.zoom = 1;
  view.roll = 0;
  view.follow = true;
  const globe = view.mode === 'globe';
  if (el.minimapMode) {
    el.minimapMode.textContent = globe ? '3D' : '2D';
    el.minimapMode.title = globe ? 'Switch to flat all-sky map' : 'Switch to 3D sky globe';
    el.minimapMode.setAttribute('aria-pressed', String(globe));
  }
  if (el.minimapTitle) el.minimapTitle.textContent = globe ? '3D SKY GLOBE' : 'ALL-SKY MAP';
  if (el.minimapHint) {
    el.minimapHint.textContent = globe
      ? 'Drag to rotate · ⌘/Ctrl-drag to tilt · scroll to zoom · click to jump'
      : 'Click or drag to move the field';
  }
  el.skyMinimap.setAttribute('aria-label', globe
    ? '3D sky globe using the real NASA/JPL-Caltech SPHEREx 2025 mosaic. Drag to rotate, scroll to zoom, click to jump.'
    : 'All-sky map using the real NASA/JPL-Caltech SPHEREx 2025 mosaic. Click or drag to move the field.');
  if (el.minimapZoomIn) el.minimapZoomIn.disabled = !globe;
  if (el.minimapZoomOut) el.minimapZoomOut.disabled = !globe;
  drawMinimap();
}

function updateMapUI() {
  updateMapScale();
  updateCompass();
  updateMapCenter();
  allSky.view.follow = true;
  drawMinimap();
}

function sameNavigationField(a, b) {
  return Math.abs(a.ra - b.ra) < 1e-4 && Math.abs(a.dec - b.dec) < 1e-4 && Math.abs(a.fov - b.fov) < 1e-4;
}

function updateNavButtons() {
  el.navBack.disabled = navIndex <= 0;
  el.navForward.disabled = navIndex < 0 || navIndex >= navHistory.length - 1;
}

function recordNavigation(field, key) {
  const entry = { ra: field.ra, dec: field.dec, fov: field.fov, key: key || 'custom' };
  if (navIndex >= 0 && sameNavigationField(navHistory[navIndex], entry) && navHistory[navIndex].key === entry.key) return;
  navHistory.splice(navIndex + 1);
  navHistory.push(entry);
  if (navHistory.length > 40) navHistory.shift();
  navIndex = navHistory.length - 1;
  updateNavButtons();
}

function goHistory(delta) {
  if (loadingReal) { notify('Wait for the current sky field to finish loading.'); return; }
  const next = navIndex + delta;
  const entry = navHistory[next];
  if (!entry) return;
  navIndex = next;
  el.target.value = entry.key;
  el.ra.value = entry.ra.toFixed(5);
  el.dec.value = entry.dec.toFixed(5);
  el.fov.value = String(entry.fov);
  updateTargetMeta(targets[entry.key] || targets.custom);
  updateNavButtons();
  loadRealFrames({ record: false });
}

function navigateToField(field, source = 'Selected sky position') {
  if (!Number.isFinite(field.ra) || !Number.isFinite(field.dec)) return;
  const ra = normalizeRa(field.ra);
  const dec = Math.max(-90, Math.min(90, field.dec));
  el.target.value = 'custom';
  el.ra.value = ra.toFixed(5);
  el.dec.value = dec.toFixed(5);
  if (Number.isFinite(field.fov)) el.fov.value = String(field.fov);
  updateTargetMeta(targets.custom);
  el.viewerTitle.textContent = source;
  el.fieldConstellation.textContent = 'CUSTOM SKY · SPHEREX DR1';
  el.fieldMeta.textContent = `${coordinateText(ra, dec)} · ${Number(el.fov.value).toFixed(2)}° field`;
  notify(`Navigating to ${coordinateText(ra, dec)}.`);
  loadRealFrames();
}

function navigateToSky(point, source = 'Selected sky position') {
  if (!point) return;
  navigateToField(point, source);
}

function findNamedPlace(query) {
  const normalized = query.toLowerCase().replace(/[’']/g, '').replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim();
  const aliases = [
    ['barnard', 'barnard'], ['epsilon indi', 'epsindi'], ['eps indi', 'epsindi'], ['indi b', 'epsindi'],
    ['wise 0855', 'wise0855'], ['wise0855', 'wise0855'], ['0855', 'wise0855'],
    ['rw aur', 'rwaur'], ['rw aurigae', 'rwaur'], ['rwaur', 'rwaur'],
    ['r dra', 'rdra'], ['r draconis', 'rdra'], ['rdra', 'rdra'],
    ['wide field', 'spherex'], ['leo', 'spherex'], ['spherex', 'spherex']
  ];
  for (const [needle, key] of aliases) if (normalized.includes(needle)) return key;
  return null;
}

function parsePlaceQuery(query) {
  const named = findNamedPlace(query);
  if (named) return { kind: 'target', key: named };
  let raText = '';
  let decText = '';
  const comma = query.split(',').map(part => part.trim()).filter(Boolean);
  if (comma.length === 2) {
    [raText, decText] = comma;
  } else {
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 2) [raText, decText] = tokens;
    else if (tokens.length === 6) [raText, decText] = [tokens.slice(0, 3).join(' '), tokens.slice(3).join(' ')];
  }
  if (!raText || !decText) return null;
  const ra = parseRa(raText);
  const dec = parseDec(decText);
  if (!Number.isFinite(ra) || ra < 0 || ra > 360 || !Number.isFinite(dec) || dec < -90 || dec > 90) return null;
  return { kind: 'coordinates', ra, dec };
}

function submitMapSearch(event) {
  event.preventDefault();
  const query = el.mapSearch.value.trim();
  if (!query) { el.mapSearch.focus(); return; }
  const place = parsePlaceQuery(query);
  if (!place) {
    notify('Search a named target or two coordinates, e.g. “R Draconis” or “248.17, 66.75”.');
    return;
  }
  if (place.kind === 'target') {
    setTarget(place.key, true);
    notify(`Jumping to ${targets[place.key].label}.`);
  } else {
    navigateToField({ ra: place.ra, dec: place.dec, fov: Number(el.fov.value) }, 'Searched sky position');
  }
  el.mapSearch.blur();
}

function minimapSkyFromEvent(event) {
  const rect = el.skyMinimap.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
  return {
    ra: normalizeRa((1 - x / rect.width) * 360),
    dec: Math.max(-90, Math.min(90, 90 - (y / rect.height) * 180))
  };
}

function verificationRow(check) {
  const item = document.createElement('li');
  item.className = `verify-row ${check.state}`;
  const dot = document.createElement('span');
  dot.className = 'verify-dot';
  const body = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = check.title;
  const detail = document.createElement('p');
  detail.textContent = check.detail;
  body.append(title, detail);
  item.append(dot, body);
  return item;
}

const gaiaVerificationCache = new Map();

function nearestGaiaSource(sources, ra, dec) {
  let nearest = null;
  for (const source of sources || []) {
    const separation = angularSeparation(ra, dec, Number(source.ra), Number(source.dec));
    if (separation === null) continue;
    if (!nearest || separation < nearest.separation) nearest = { ...source, separation };
  }
  return nearest;
}

function setVerificationGaia(state, detail, context = null) {
  el.verifyGaia.textContent = `Gaia DR3 · ${state}`;
  el.verifyGaiaDetail.textContent = detail;
  labState.verifyGaia = context;
}

function loadVerificationGaia(frame, analysis) {
  const ra = Number(analysis?.ra ?? frame?.ra);
  const dec = Number(analysis?.dec ?? frame?.dec);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) {
    setVerificationGaia('waiting', 'Waiting for a real cutout centre.');
    return;
  }
  const key = `${frame.obsid || frame.label}|${ra.toFixed(4)}|${dec.toFixed(4)}`;
  if (labState.verifyGaiaKey === key) return;
  labState.verifyGaiaKey = key;
  setVerificationGaia('querying', 'Independent Gaia DR3 catalogue query at the field centre…');

  const settle = (payload) => {
    if (labState.verifyGaiaKey !== key) return;
    const count = Number(payload?.count) || 0;
    const nearest = nearestGaiaSource(payload?.sources, ra, dec);
    const context = { key, ra, dec, count, nearest };
    if (!count) {
      setVerificationGaia('no sources', 'No Gaia DR3 source within 1.2′. This is catalogue coverage, not evidence of a detection.', context);
      if (frames[frameIndex] === frame) updateVerification();
      return;
    }
    const nearestText = nearest
      ? ` · nearest G ${nearest.mag === null || !Number.isFinite(Number(nearest.mag)) ? '—' : Number(nearest.mag).toFixed(1)} at ${(nearest.separation * 3600).toFixed(1)}″`
      : '';
    setVerificationGaia(`${count} source${count === 1 ? '' : 's'}`, `${count} Gaia DR3 source${count === 1 ? '' : 's'} within 1.2′${nearestText}. Catalogue context, not a variability confirmation.`, context);
    if (frames[frameIndex] === frame) updateVerification();
  };

  const cached = gaiaVerificationCache.get(key);
  if (cached) { settle(cached); return; }
  const url = new URL('/api/catalog', window.location.href);
  url.searchParams.set('survey', 'gaia');
  url.searchParams.set('ra', ra.toFixed(6));
  url.searchParams.set('dec', dec.toFixed(6));
  url.searchParams.set('radius', '0.02');
  fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } }, 30_000)
    .then(async response => {
      if (!response.ok) throw new Error(`Gaia catalogue returned ${response.status}.`);
      const payload = await response.json();
      gaiaVerificationCache.set(key, payload);
      settle(payload);
    })
    .catch(error => {
      if (labState.verifyGaiaKey === key) {
        setVerificationGaia('unavailable', `ESA Gaia DR3 could not be reached (${error.message}). Gaia is independent of IRSA, so an IRSA problem is not necessarily the cause of this specific failure. Not counted as an agreement.`);
      }
    });
}

function updateVerification() {
  const frame = frames[frameIndex];
  const analysis = activeFrameAnalysis();
  el.verificationList.replaceChildren();
  if (!frame?.real) {
    el.verificationScore.textContent = 'Waiting for data';
    el.verificationList.append(verificationRow({ state: 'pending', title: 'No real frame loaded', detail: 'Load a real SPHEREx field to run the cross-source checks.' }));
    el.checksumValue.textContent = 'A SHA-256 checksum appears after the first real frame loads.';
    labState.verifyGaiaKey = '';
    setVerificationGaia('idle', 'Load a real frame to query the Gaia DR3 catalogue.');
    return;
  }
  if (frame.mosaic) {
    el.verificationScore.textContent = 'Local mosaic';
    el.verificationScore.className = 'verify-score';
    el.verificationList.replaceChildren(
      verificationRow({
        state: 'note',
        title: 'All-sky context, not a visit cutout',
        detail: 'This is the real NASA/JPL-Caltech SPHEREx All Sky Map 2025, resampled locally for the requested field. It has no per-visit FITS measurements or observation identity.'
      }),
      verificationRow({
        state: 'receipt',
        title: 'NASA/JPL-Caltech image source',
        detail: 'Local asset: spherex-allsky-2025.jpg · Galactic equirectangular mosaic, 1600 × 800.'
      })
    );
    el.checksumValue.textContent = 'Context image only; no FITS payload checksum.';
    el.verifySourceSia.textContent = 'NASA/JPL-Caltech SPHEREx All Sky Map 2025';
    el.verifySiaDetail.textContent = 'Local mosaic · 2025';
    el.verifySourceFits.textContent = 'No FITS cutout';
    el.verifyFitsDetail.textContent = 'A visit cutout requires archive discovery.';
    labState.verifyGaiaKey = '';
    setVerificationGaia('idle', 'Gaia context is available only for a real visit cutout.');
    return;
  }
  const checks = [];
  const identityFailed = /identity check failed/i.test(frame.measurementError || '');
  if (identityFailed) {
    checks.push({
      state: 'note',
      title: 'Visit identity check failed',
      detail: frame.measurementError
    });
  } else if (!frame.mirror) {
    const productMatch = frame.uri && analysis?.dataUrl ? analysis.dataUrl === frame.uri : null;
    checks.push({
      state: productMatch === null ? 'pending' : productMatch ? 'verified' : 'note',
      title: 'Rendered pixels belong to this visit product',
      detail: productMatch === null
        ? 'Waiting for the PNG product-identity header.'
        : productMatch
          ? 'The PNG X-Data-Url is exactly the FITS product URI recorded for this visit.'
          : `The PNG names ${analysis?.dataUrl || 'another product'}, not the visit URI.`
    });
  }
  const siaDate = frame.date || '';
  const fitsDate = analysis?.dateAvg ? analysis.dateAvg.slice(0, 10) : '';
  checks.push({
    state: fitsDate && siaDate === fitsDate ? 'verified' : fitsDate ? 'note' : 'pending',
    title: 'Visit date agrees',
    detail: fitsDate
      ? `Discovery ${siaDate || '—'} · FITS DATE-AVG ${fitsDate}`
      : 'FITS DATE-AVG has not arrived yet.'
  });
  const fitsDetector = analysis?.detector || analysis?.band || '';
  checks.push({
    state: fitsDetector ? normalizeDetectorName(fitsDetector) === normalizeDetectorName(frame.detector) ? 'verified' : 'note' : 'pending',
    title: 'Detector agrees',
    detail: fitsDetector ? `Discovery ${frame.detector} · FITS detector ${fitsDetector}` : 'FITS DETECTOR header not available.'
  });
  const idMatch = analysis?.obsid && frame.obsid
    ? analysis.obsid === frame.obsid || analysis.obsid.includes(frame.obsid) || frame.obsid.includes(analysis.obsid)
    : null;
  checks.push({
    state: idMatch === null ? 'pending' : idMatch ? 'verified' : 'note',
    title: 'Observation identity agrees',
    detail: analysis?.obsid ? `Discovery ${frame.obsid || '—'} · FITS ${analysis.obsid}` : 'FITS OBSID header not available.'
  });
  const orientation = frameOrientation(frame);
  const reference = frames.find(item => item !== frame && item.real && !item.mirror && frameOrientation(item) !== null);
  const orientationDelta = reference ? orientationDifference(frame, reference) : null;
  const rotated = orientationDelta !== null && orientationDelta >= ORIENTATION_TOLERANCE_DEG;
  checks.push({
    state: orientation === null ? 'pending' : rotated ? 'note' : 'verified',
    title: rotated ? 'Detector orientation differs from another visit' : 'Detector orientation recorded',
    detail: orientation === null
      ? 'Waiting for the FITS WCS orientation.'
      : `FITS x-axis position angle ${orientation.toFixed(1)}°${orientationDelta !== null ? ` · ${orientationDelta.toFixed(1)}° from another loaded visit` : ''}. A rotation is a real detector orientation, not a replaced image; raw pixels are not aligned, and Difference is blocked above ${ORIENTATION_TOLERANCE_DEG}°.`
  });
  const separation = angularSeparation(Number(frame.ra), Number(frame.dec), analysis?.ra, analysis?.dec);
  const wideActive = hdMode && Boolean(frame.hdObjectUrl);
  checks.push({
    state: separation === null ? 'pending' : separation < 0.02 ? 'verified' : 'note',
    title: wideActive && separation !== null && separation >= 0.02 ? 'Wide-window centre differs from the request' : 'WCS centre is inside the requested field',
    detail: separation === null
      ? 'Waiting for the cutout WCS centre.'
      : `${separation.toFixed(3)}° from the requested centre${wideActive && separation >= 0.02 ? ' · the 0.90° window was clipped by coverage' : ''}.`
  });
  const band = BAND_INFO[frame.detector];
  const waveInside = analysis && Number.isFinite(analysis.waveMin) && band
    ? analysis.waveMax >= band.low && analysis.waveMin <= band.high
    : null;
  checks.push({
    state: waveInside === null ? 'pending' : waveInside ? 'verified' : 'note',
    title: 'Wavelength falls inside the requested band',
    detail: analysis && Number.isFinite(analysis.waveMin)
      ? `Measured ${analysis.waveMin.toFixed(3)}–${analysis.waveMax.toFixed(3)} μm · ${frame.detector} nominal ${band.low.toFixed(2)}–${band.high.toFixed(2)} μm`
      : 'Waiting for WCS-WAVE measurements.'
  });
  const siaConstellation = sky?.constellation?.name || '';
  checks.push({
    state: analysis?.constellation && siaConstellation ? analysis.constellation === siaConstellation ? 'verified' : 'note' : 'pending',
    title: 'Constellation agrees with independent geometry',
    detail: analysis?.constellation
      ? `FITS centre resolves to ${analysis.constellation}${siaConstellation ? ` · requested centre resolves to ${siaConstellation}` : ''}`
      : 'Waiting for the cutout constellation.'
  });
  checks.push({
    state: frame.sha256 ? 'receipt' : 'pending',
    title: 'Pixel payload integrity receipt',
    detail: frame.sha256 ? `SHA-256 ${frame.sha256.slice(0, 24)}… saved for this cutout.` : 'Hashing the real PNG payload…'
  });
  const verified = checks.filter(check => check.state === 'verified').length;
  const available = checks.filter(check => check.state === 'verified' || check.state === 'note').length;
  const gaiaKey = `${frame.obsid || frame.label}|${Number(analysis?.ra ?? frame.ra).toFixed(4)}|${Number(analysis?.dec ?? frame.dec).toFixed(4)}`;
  if (labState.verifyGaia?.key === gaiaKey) {
    const context = labState.verifyGaia;
    const nearest = context.nearest;
    checks.push({
      state: 'receipt',
      title: 'Gaia DR3 catalogue context attached',
      detail: `${context.count} source${context.count === 1 ? '' : 's'} within 1.2′${nearest && Number.isFinite(Number(nearest.mag)) ? ` · nearest G ${Number(nearest.mag).toFixed(1)} at ${(nearest.separation * 3600).toFixed(1)}″` : ''}. Context, not a confirmation.`
    });
  }
  labState.lastChecks = checks.map(check => ({ state: check.state, title: check.title, detail: check.detail }));
  if (available && verified === available) {
    setVerificationBadge(sourceState, `${verified} / ${available} independent checks agree. Integrity and header agreement, not a scientific interpretation.`);
  } else if (available) {
    setVerificationBadge('partial', `${verified} / ${available} checks agree; ${available - verified} need attention. Open Data verification for the exact rows.`);
  }
  el.verificationScore.textContent = `${verified} / ${available} checks agree`;
  el.verificationScore.className = `verify-score ${verified === available && available ? 'good' : available ? 'mixed' : ''}`;
  for (const check of checks) el.verificationList.append(verificationRow(check));
  el.verifySourceSia.textContent = frame.sourceLabel || 'Archive discovery · SPHEREx DR1';
  el.verifySiaDetail.textContent = `${frame.date || '—'} · ${frame.detector} · ${frame.obsid || 'OBSID pending'}`;
  el.verifySourceFits.textContent = analysis
    ? (analysis.dataFallback === 's3-direct' || /NASA IRSA S3/i.test(analysis.dataSource || '')
      ? 'NASA IRSA S3 · direct FITS'
      : 'Archive FITS cutout')
    : 'Archive FITS cutout · pending';
  const activeWidth = hdMode && frame.hdWidth ? frame.hdWidth : frame.width;
  const activeHeight = hdMode && frame.hdHeight ? frame.hdHeight : frame.height;
  el.verifyFitsDetail.textContent = analysis
    ? `${activeWidth || '—'} × ${activeHeight || '—'} px · ${frame.uri?.split('/').pop() || 'product URI'}`
    : 'IMAGE, WCS, WCS-WAVE and detector headers.';
  el.checksumValue.textContent = frame.sha256 || 'Waiting for the real PNG payload.';
  loadVerificationGaia(frame, analysis);
}

function buildVerificationReceipt() {
  const frame = frames[frameIndex];
  if (!frame?.real) return null;
  const analysis = activeFrameAnalysis();
  const gaia = labState.verifyGaia;
  return {
    schema: 'spherex-explorer/receipt/v1',
    generatedAt: new Date().toISOString(),
    frame: {
      label: frame.label,
      date: frame.date || null,
      detector: frame.detector || null,
      band: frame.band || null,
      obsid: frame.obsid || null,
      uri: frame.uri || null,
      sha256: frame.sha256 || null,
      requested: { ra: Number(frame.ra), dec: Number(frame.dec), fov: Number(frame.fov) },
      measured: analysis ? { ra: analysis.ra, dec: analysis.dec, width: analysis.width ?? null, height: analysis.height ?? null } : null
    },
    wcs: analysis ? { corners: analysis.wcsCorners || null, pixelScale: analysis.pixelScale ?? null } : null,
    measurements: analysis ? {
      median: analysis.median ?? null,
      low: analysis.low ?? null,
      high: analysis.high ?? null,
      min: analysis.min ?? null,
      max: analysis.max ?? null,
      mean: analysis.mean ?? null,
      waveMin: analysis.waveMin ?? null,
      waveMax: analysis.waveMax ?? null,
      bandwidth: Number.isFinite(analysis.waveBwMin) && Number.isFinite(analysis.waveBwMax) ? analysis.waveBwMax - analysis.waveBwMin : null,
      exposure: analysis.exposure ?? null,
      cutoutSize: analysis.cutoutSize || null,
      palette: analysis.palette || null,
      stretch: analysis.stretch || null,
      constellation: analysis.constellation || null
    } : null,
    sources: {
      sia2: { label: frame.sourceLabel || 'Archive discovery · SPHEREx DR1', detail: `${frame.date || '—'} · ${frame.detector || '—'} · ${frame.obsid || '—'}` },
      fits: { label: analysis?.dataFallback === 's3-direct' ? 'NASA IRSA S3 · direct FITS' : 'Archive FITS cutout', detail: `${frame.uri || '—'}` },
      iau: { label: 'IAU constellation engine', detail: 'Independent J2000 geometry at the cutout centre.' },
      gaia: gaia ? { label: 'Gaia DR3 · ESA Gaia Archive TAP', query: { ra: gaia.ra, dec: gaia.dec, radiusDeg: 0.02 }, count: gaia.count, nearest: gaia.nearest ? { ra: gaia.nearest.ra, dec: gaia.nearest.dec, mag: gaia.nearest.mag, separationArcsec: gaia.nearest.separation * 3600 } : null } : null
    },
    checks: labState.lastChecks
  };
}

function downloadVerificationReceipt() {
  const receipt = buildVerificationReceipt();
  if (!receipt) { notify('Load a real frame before exporting a receipt.'); return; }
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeId = String(receipt.frame.obsid || receipt.frame.label || 'frame').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 60);
  anchor.href = url;
  anchor.download = `spherex-receipt-${safeId}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  notify('Data receipt downloaded: frame, WCS, checks, sources and SHA-256.');
}

function parseWcsCorners(value) {
  if (!value) return null;
  const points = value.split(';').map(part => part.split(',').map(Number));
  if (points.length !== 4 || points.some(point => point.length !== 2 || point.some(item => !Number.isFinite(item)))) return null;
  const [topLeft, topRight, bottomLeft, bottomRight] = points.map(([ra, dec]) => ({ ra, dec }));
  return { topLeft, topRight, bottomLeft, bottomRight };
}

function readFrameHeaders(response) {
  const number = (name) => {
    const raw = response.headers.get(name);
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const headers = {
    width: number('X-Frame-Width'),
    height: number('X-Frame-Height'),
    min: number('X-Frame-Min'),
    max: number('X-Frame-Max'),
    low: number('X-Frame-Low'),
    high: number('X-Frame-High'),
    median: number('X-Frame-Median'),
    mean: number('X-Frame-Mean'),
    varianceMedian: number('X-Frame-Variance-Median'),
    zodiMedian: number('X-Frame-Zodi-Median'),
    flagged: number('X-Frame-Flagged'),
    pixelScale: number('X-Frame-Pixel-Scale'),
    waveMin: number('X-Frame-Wave-Min'),
    waveMax: number('X-Frame-Wave-Max'),
    waveBwMin: number('X-Frame-Wave-BW-Min'),
    waveBwMax: number('X-Frame-Wave-BW-Max'),
    dateAvg: response.headers.get('X-Frame-Date-Avg') || '',
    exposure: number('X-Frame-Exposure'),
    bunit: response.headers.get('X-Frame-Bunit') || '',
    detector: response.headers.get('X-Frame-Detector') || '',
    band: response.headers.get('X-Frame-Band') || '',
    obsid: response.headers.get('X-Frame-Obsid') || '',
    ra: number('X-Frame-Ra'),
    dec: number('X-Frame-Dec'),
    constellation: response.headers.get('X-Frame-Constellation') || '',
    constellationSymbol: response.headers.get('X-Frame-Constellation-Symbol') || '',
    galacticL: number('X-Frame-Galactic-L'),
    galacticB: number('X-Frame-Galactic-B'),
    eclipticLon: number('X-Frame-Ecliptic-Lon'),
    eclipticLat: number('X-Frame-Ecliptic-Lat'),
    cutoutSize: response.headers.get('X-Cutout-Size') || '',
    dataUrl: response.headers.get('X-Data-Url') || '',
    orientationDeg: number('X-Frame-Orientation'),
    dataSource: response.headers.get('X-Data-Source') || '',
    dataFallback: response.headers.get('X-Data-Fallback') || '',
    palette: response.headers.get('X-Frame-Palette') || '',
    stretch: response.headers.get('X-Frame-Stretch') || '',
    wcsCorners: parseWcsCorners(response.headers.get('X-Frame-WCS-Corners'))
  };
  return {
    ...headers,
    measured: Number.isFinite(headers.median) && Number.isFinite(headers.mean)
  };
}

function fetchWithTimeout(url, options = {}, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let hardTimer;
  const hard = new Promise((_, reject) => {
    hardTimer = setTimeout(() => reject(new Error(`request timed out after ${Math.round(timeoutMs / 1000)} s`)), timeoutMs + 1_000);
  });
  return Promise.race([
    fetch(url, { ...options, signal: controller.signal }),
    hard,
  ]).finally(() => {
    clearTimeout(timer);
    clearTimeout(hardTimer);
  });
}

function normalizeDetectorName(value) {
  return String(value || '').trim().replace(/^D/i, '');
}

function frameOrientation(frame) {
  const analysis = frame?.analysis || frame?.mirrorAnalysis;
  return Number.isFinite(analysis?.orientationDeg) ? analysis.orientationDeg : null;
}

function orientationDifference(first, second) {
  const a = frameOrientation(first);
  const b = frameOrientation(second);
  if (a === null || b === null) return null;
  return Math.abs(((a - b + 540) % 360) - 180);
}

function frameIdentityProblem(frame, analysis) {
  if (!frame?.real || frame.mirror || !analysis) return '';
  if (!analysis.dataUrl) return 'the PNG did not return its X-Data-Url identity header';
  if (!frame.uri) return 'the visit record has no FITS product URI';
  if (analysis.dataUrl !== frame.uri) {
    return `the PNG identifies product ${analysis.dataUrl}, not ${frame.uri}`;
  }
  if (analysis.obsid && frame.obsid
    && analysis.obsid !== frame.obsid
    && !analysis.obsid.startsWith(`${frame.obsid}_`)
    && !frame.obsid.startsWith(`${analysis.obsid}_`)) {
    return `the PNG identifies observation ${analysis.obsid}, not ${frame.obsid}`;
  }
  if (analysis.detector && frame.detector
    && normalizeDetectorName(analysis.detector) !== normalizeDetectorName(frame.detector)) {
    return `the PNG identifies detector ${analysis.detector}, not ${frame.detector}`;
  }
  return '';
}

async function loadFrameData(frame, { detached = false, timeoutMs = 45_000 } = {}) {
  if (frame.loading || frame.objectUrl) return;
  frame.loading = true;
  try {
    let response;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetchWithTimeout(frame.src, { headers: { Accept: 'image/png' } }, timeoutMs);
      if (response.ok || ![429, 503, 504].includes(response.status) || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
    }
    if (!response?.ok) throw new Error(`FITS frame returned ${response?.status ?? 'no response'}.`);
    const analysis = readFrameHeaders(response);
    const identityProblem = frameIdentityProblem(frame, analysis);
    if (identityProblem) throw new Error(`Visit identity check failed: ${identityProblem}.`);
    const bytes = await response.arrayBuffer();
    if (!detached && !frames.includes(frame)) return;
    let checksum = '';
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      checksum = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      checksum = '';
    }
    if (frame.expectedSha256 && checksum !== frame.expectedSha256) {
      throw new Error('Mirror checksum mismatch; refusing to display unverified data.');
    }
    frame.sha256 = checksum;
    const blob = new Blob([bytes], { type: 'image/png' });
    const objectUrl = URL.createObjectURL(blob);
    ownedObjectUrls.push(objectUrl);
    if (Number.isFinite(analysis.width) && analysis.width > 0) frame.width = analysis.width;
    if (Number.isFinite(analysis.height) && analysis.height > 0) frame.height = analysis.height;
    frame.objectUrl = objectUrl;
    frame.src = objectUrl;
    frame.loadError = '';
    if (frame.thumbImg) frame.thumbImg.src = objectUrl;
    frame.displayAnalysis = analysis.measured ? analysis : frame.mirrorAnalysis || null;
    if (analysis.measured) {
      frame.analysis = analysis;
      frame.measurementError = '';
    } else if (frame.mirrorAnalysis) {
      // Static mirror PNGs cannot carry HTTP measurement headers. Keep the
      // real measurements captured and checked by the mirror ingestor.
      frame.analysis = frame.mirrorAnalysis;
      frame.measurementError = '';
    } else {
      frame.analysis = null;
      frame.measurementError = 'FITS measurement headers were not returned.';
    }
    if (!detached) {
      maybePrunePartialFrames();
      updateBandUI();
      updateVerification();
      if (frames[frameIndex] === frame) render();
      else updateLab();
    }
  } catch (error) {
    frame.loadError = error.message;
    frame.measurementError = error.message;
    if (!detached && frames.includes(frame)) {
      frame.analysis = null;
      if (frames[frameIndex] === frame) render();
      else updateLab();
    }
    if (!detached) notify(`Could not measure that FITS frame: ${error.message}`);
  } finally {
    frame.loading = false;
  }
}

async function loadFrameSet(list, options = {}) {
  const queue = [...list];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const frame = queue.shift();
      if (frame) await loadFrameData(frame, options);
    }
  });
  await Promise.all(workers);
}

let pruningFrames = false;

function maybePrunePartialFrames() {
  if (pruningFrames || frames.length < 3) return;
  if (frames.some(frame => !frame.width || !frame.height)) return;
  const maxWidth = Math.max(...frames.map(frame => frame.width));
  const maxHeight = Math.max(...frames.map(frame => frame.height));
  const complete = frames.filter(frame => frame.width >= maxWidth * .8 && frame.height >= maxHeight * .8);
  if (complete.length === frames.length || complete.length < 2) return;
  const current = frames[frameIndex];
  pruningFrames = true;
  frames = complete;
  frameIndex = Math.max(0, frames.indexOf(current));
  el.timeline.max = String(Math.max(0, frames.length - 1));
  populateQuickVisits();
  syncQuickTime();
  for (const selector of [el.frameA, el.frameB]) {
    selector.replaceChildren();
    frames.forEach((frame, index) => selector.add(new Option(`${index + 1}. ${frame.label}`, index)));
  }
  el.frameA.value = '0';
  el.frameB.value = String(Math.min(1, frames.length - 1));
  el.sourceLabel.textContent = el.sourceLabel.textContent.replace(/^\d+ real visits/, `${frames.length} real visits`);
  buildFilmstrip();
  updateVisitWindow();
  render();
  pruningFrames = false;
  notify(`Skipped a partial edge visit; ${frames.length} complete visits remain.`);
}

function buildFilmstrip() {
  el.filmstrip.replaceChildren();
  if (!frames.length) {
    const empty = document.createElement('p');
    empty.className = 'film-placeholder';
    empty.textContent = 'No visits loaded yet.';
    el.filmstrip.append(empty);
    return;
  }
  frames.forEach((frame, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'film-thumb';
    button.title = `View ${frame.label}`;
    const image = document.createElement('img');
    image.src = frameDisplaySrc(frame);
    image.alt = '';
    image.loading = 'lazy';
    const label = document.createElement('span');
    label.textContent = `${frame.date || 'Visit'} · ${frame.detector || ''}`;
    button.append(image, label);
    button.addEventListener('click', () => {
      stopPlayback();
      frameIndex = index;
      render();
    });
    frame.thumbImg = image;
    el.filmstrip.append(button);
  });
}

function updateFilmstripActive() {
  const buttons = el.filmstrip.querySelectorAll('.film-thumb');
  buttons.forEach((button, index) => button.classList.toggle('active', index === frameIndex));
  const active = buttons[frameIndex];
  if (active) {
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < el.filmstrip.scrollLeft) el.filmstrip.scrollTo({ left: left - 4, behavior: 'smooth' });
    else if (right > el.filmstrip.scrollLeft + el.filmstrip.clientWidth) el.filmstrip.scrollTo({ left: right - el.filmstrip.clientWidth + 4, behavior: 'smooth' });
  }
}

function setEmptyState(eyebrow, title, message) {
  el.emptyEyebrow.textContent = eyebrow;
  el.emptyTitle.textContent = title;
  el.emptyMessage.textContent = message;
}

function visitWindowSummary(list = []) {
  const dates = [...new Set(list
    .map(frame => String(frame.date || frame.iso || '').slice(0, 10))
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))]
    .sort();
  if (!dates.length) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return first;
  const days = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000);
  return `${first} → ${last}${days > 0 ? ` · ${days} days` : ''}`;
}

function updateVisitWindow() {
  if (!el.visitWindowBox) return;
  const dated = frames.filter(frame => !frame.mosaic && (frame.date || frame.iso));
  const range = visitWindowSummary(dated);
  if (!range) {
    el.visitWindowBox.hidden = true;
    return;
  }
  el.visitWindowBox.hidden = false;
  const count = dated.length;
  el.visitWindowText.textContent = `${count} loaded visit${count === 1 ? '' : 's'} · ${range}`;
  el.visitWindowDetail.textContent = frames.every(frame => frame.mirror)
    ? `The bundled mirror is a real-data sample of ${count} verified visit${count === 1 ? '' : 's'} for this field and detector, not every SPHEREx observation. The window above is exactly those visits. It stops at its last selected visit and is not automatically extended as new data arrives; run the mirror ingestor to refresh it. SPHEREx launched in March 2025, so its DR1 archive begins with the 2025 survey; there is no earlier SPHEREx data. A live archive query can return more visits. Visits can be rotated or edge-cropped; those are real observation differences.`
    : `The archive returned these ${count} visit${count === 1 ? '' : 's'} for this query (the viewer asks for up to 24). The window above is exactly those visits. SPHEREx launched in March 2025, so its DR1 archive begins with the 2025 survey; there is no earlier SPHEREx data. A different field or release can have a different window. Visits can be rotated or edge-cropped; those are real observation differences, not replacement images.`;
}

function updateVisitNotice() {
  if (!el.visitNotice) return;
  const frame = frames[frameIndex];
  const contextOnly = frames.length === 1 && Boolean(frame?.mosaic);
  const checking = /checking (?:IRSA|archive)/i.test(el.sourceLabel.textContent || '');
  el.visitNotice.hidden = !contextOnly || loadingReal || checking;
  if (!contextOnly) return;
  const noCoverage = /no (?:indexed )?coverage|not covered|outside.*coverage/i.test(el.sourceLabel.textContent || '');
  el.visitNoticeRetry.hidden = noCoverage;
  el.visitNoticeText.textContent = noCoverage
    ? 'This is the 2025 30° all-sky mosaic context, not a visit. The S3 index has no per-visit coverage for this exact patch, so there are no visits to play. Try another patch, or load the verified Leo field.'
    : 'This is the 2025 30° all-sky mosaic context, not a visit or a time series. The S3-backed archive did not answer this request, and this patch has no verified local visit frames. The verified Leo field stays available offline.';
}

function pixelRouteLabel(frame, analysis = null) {
  if (!frame) return '—';
  if (frame.mosaic) return 'Local NASA/JPL-Caltech mosaic · context only';
  if (frame.mirror) return 'Local verified mirror · real FITS';
  if (!frame.real) return 'Local PNG upload · not archive pixels';
  const source = analysis?.dataSource || '';
  if (analysis?.dataFallback === 's3-direct' || /NASA IRSA S3/i.test(source)) {
    return `S3 DIRECT · ${source.replace(/^NASA IRSA S3 (?:·|-) direct /, '') || 'real FITS byte ranges'}`;
  }
  if (/IRSA SPHEREx cutout/i.test(source)) return 'Archive cutout service · real FITS';
  if (frame.loadError) return 'Unavailable · no real pixels returned';
  if (!analysis) return 'Reading the S3 cutout…';
  return source || 'Archive · real FITS';
}

const SOURCE_NAMES = {
  sia: ['SIA2 · DR1', 'Visit discovery'],
  'sia-qr3': ['SIA2 · QR3', 'Visit discovery'],
  tap: ['IRSA TAP', 'Artifact and plane discovery'],
  s3: ['NASA IRSA S3', 'Direct FITS byte ranges'],
  hips: ['SPHEREx HiPS cube', 'All-sky context only'],
  gaia: ['ESA Gaia DR3 TAP', 'Independent catalogue overlay']
};

const HIPS_CONTEXT_FRAMES = {
  D1: { frame: 9, wavelength: '0.932 μm' },
  D2: { frame: 25, wavelength: '1.346 μm' },
  D3: { frame: 44, wavelength: '2.089 μm' },
  D4: { frame: 62, wavelength: '3.293 μm' },
  D5: { frame: 79, wavelength: '4.220 μm' },
  D6: { frame: 97, wavelength: '4.843 μm' }
};
let hipsContextToken = 0;

function updateHipsContext(field) {
  if (!el.hipsContextImage || !field || !Number.isFinite(field.ra) || !Number.isFinite(field.dec)) return;
  const pixel = healpixNest(field.ra, field.dec, 5);
  if (pixel === null) return;
  const context = HIPS_CONTEXT_FRAMES[detector] || HIPS_CONTEXT_FRAMES.D2;
  const url = `/api/hips/tile?${new URLSearchParams({
    pixel: String(pixel),
    frame: String(context.frame),
    palette: 'iridescent',
    stretch: 'asinh',
    v: '1'
  }).toString()}`;
  const token = ++hipsContextToken;
  el.hipsContextLink.href = url;
  el.hipsContextImage.hidden = true;
  if (el.hipsContextFallback) {
    el.hipsContextFallback.hidden = false;
    el.hipsContextFallback.textContent = 'Loading HiPS context tile…';
  }
  el.hipsContextMeta.textContent = `${detector} · frame ${context.frame} · ${context.wavelength} · HiPS Norder 5 / Npix ${pixel} · 1.8° context`;
  el.hipsContextImage.onload = () => {
    if (token !== hipsContextToken) return;
    el.hipsContextImage.hidden = false;
    if (el.hipsContextFallback) el.hipsContextFallback.hidden = true;
  };
  el.hipsContextImage.onerror = () => {
    if (token !== hipsContextToken) return;
    el.hipsContextImage.hidden = true;
    if (el.hipsContextFallback) {
      el.hipsContextFallback.hidden = false;
      el.hipsContextFallback.textContent = 'HiPS tile unavailable. Visit data is unaffected.';
    }
    el.hipsContextMeta.textContent = 'HiPS context unavailable for this tile; nothing was substituted.';
  };
  el.hipsContextImage.src = url;
}

let sourceHealthLoading = false;

function sourceHealthRow(source) {
  const [name, role] = SOURCE_NAMES[source.id] || [source.label || source.id, 'Upstream source'];
  const row = document.createElement('li');
  row.className = `source-row ${source.ok ? 'ok' : 'down'}`;
  const dot = document.createElement('span');
  dot.className = 'source-dot';
  const body = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = name;
  const detail = document.createElement('p');
  const status = source.ok ? 'reachable' : source.status ? `HTTP ${source.status}` : (source.detail || 'unavailable');
  const latency = Number.isFinite(source.latencyMs) ? ` · ${source.latencyMs} ms` : '';
  detail.textContent = `${role} · ${status}${latency}`;
  body.append(title, detail);
  row.append(dot, body);
  return row;
}

function renderSourceHealth(data) {
  if (!el.sourceStatusList || !el.sourceStatusSummary) return;
  el.sourceStatusList.replaceChildren();
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  for (const source of sources) el.sourceStatusList.append(sourceHealthRow(source));
  const discovery = Boolean(data?.discoveryOk);
  const pixels = Boolean(data?.pixelsOk);
  const reachable = sources.filter(source => source.ok).length;
  const allReachable = sources.length > 0 && reachable === sources.length;
  const probeWindow = Math.round((data?.probeWindowMs ?? 6_000) / 1000);
  el.sourceStatusSummary.textContent = allReachable
    ? `All ${sources.length} probes answered within ${probeWindow}s. Live discovery, real pixel stores and Gaia are online.`
    : `${reachable} of ${sources.length} probes answered within ${probeWindow}s. Discovery is ${discovery ? 'available' : 'not confirmed in this probe window'}; real pixel stores are ${pixels ? 'available' : 'not confirmed in this probe window'}. Slow catalog responses are not a total outage.`;
  el.sourceStatusSummary.className = `source-summary ${allReachable ? 'state-ok' : 'state-degraded'}`;
  const checked = data?.checkedAt ? new Date(data.checkedAt) : null;
  el.sourceCheckedAt.textContent = checked && !Number.isNaN(checked.getTime())
    ? `Probed ${checked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · the API caches results for about 15 seconds.`
    : 'Probe time unavailable.';
}

async function loadSourceHealth() {
  if (sourceHealthLoading) return;
  sourceHealthLoading = true;
  if (el.sourceRefresh) { el.sourceRefresh.disabled = true; el.sourceRefresh.textContent = 'Checking…'; }
  if (el.sourceStatusSummary) {
    el.sourceStatusSummary.className = 'source-summary';
    el.sourceStatusSummary.textContent = 'Checking IRSA, S3, HiPS and ESA Gaia…';
  }
  try {
    const response = await fetchWithTimeout('/api/health/sources', { headers: { Accept: 'application/json' }, cache: 'no-store' }, 20_000);
    if (!response.ok) throw new Error(`source health returned ${response.status}`);
    renderSourceHealth(await response.json());
  } catch (error) {
    if (el.sourceStatusList) {
      el.sourceStatusList.replaceChildren();
      const row = document.createElement('li');
      row.className = 'source-row down';
      const dot = document.createElement('span');
      dot.className = 'source-dot';
      const body = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = 'Source probe unavailable';
      const detail = document.createElement('p');
      detail.textContent = `${error.message}. The viewer still attempts real archive data.`;
      body.append(title, detail);
      row.append(dot, body);
      el.sourceStatusList.append(row);
    }
    if (el.sourceStatusSummary) {
      el.sourceStatusSummary.className = 'source-summary state-degraded';
      el.sourceStatusSummary.textContent = 'Could not read source health. Archive requests still use real data only.';
    }
    if (el.sourceCheckedAt) el.sourceCheckedAt.textContent = 'No probe result.';
  } finally {
    sourceHealthLoading = false;
    if (el.sourceRefresh) { el.sourceRefresh.disabled = false; el.sourceRefresh.textContent = 'Recheck now'; }
  }
}

function bandLoadingOverlayActive() {
  return loadingReal && el.stageLoading.classList.contains('is-band-change');
}

function setLoading(isLoading, { quietStage = false, title = '', note = '' } = {}) {
  loadingReal = isLoading;
  const current = frames[frameIndex];
  el.stageLoading.hidden = isLoading ? quietStage : !(current?.real && !current.mosaic && !current.objectUrl && !current.loadError);
  el.stageLoading.classList.toggle('is-band-change', isLoading && Boolean(title));
  if (isLoading) {
    if (el.stageLoadingTitle) el.stageLoadingTitle.textContent = title || 'Finding real visits…';
    if (el.stageLoadingNote) el.stageLoadingNote.textContent = note || 'Querying the S3 archive and preparing detector cutouts';
  }
  el.loadReal.disabled = isLoading;
  el.emptyReal.disabled = isLoading;
  el.loadReal.textContent = isLoading ? 'Finding real visits…' : 'Load real visits';
  updateVisitNotice();
}

const VERIFICATION_STATES = {
  pending: { label: 'CHECKING DATA', note: 'Integrity and header checks, not a scientific interpretation.' },
  live: { label: 'LIVE VERIFIED', note: 'Retrieved from the live archive. Headers and checksums are checked; this is not a claim of scientific correctness.' },
  s3: { label: 'LIVE VERIFIED', note: 'Live archive rows with FITS pixels read from IRSA S3. Integrity checks pass; interpretation is still yours.' },
  partial: { label: 'PARTIALLY VERIFIED', note: 'Some independent header checks disagree or are unavailable. Inspect the verification panel before interpreting this frame.' },
  cached: { label: 'CACHED VERIFIED', note: 'A previously validated real-data sample, not a live query. The timestamp and route stay labelled.' },
  mirror: { label: 'CACHED VERIFIED', note: 'A bundled real SPHEREx sample. It is not a live observation, and it is labelled as a mirror.' },
  mosaic: { label: 'PARTIALLY VERIFIED · CONTEXT', note: 'NASA all-sky context only. It is not a visit, light curve or per-visit measurement.' },
  local: { label: 'LOCAL IMAGE · UNVERIFIED', note: 'This PNG is not archive pixels and has no SPHEREx visit identity.' },
  'no-coverage': { label: 'NO VISIT COVERAGE', note: 'No real visits cover this patch in the current release. Nothing was substituted.' },
  noCoverage: { label: 'NO VISIT COVERAGE', note: 'No real visits cover this patch in the current release. Nothing was substituted.' },
  offline: { label: 'VERIFICATION FAILED', note: 'The archive request did not complete. This is a request-level failure, not proof of a mission-wide outage.' },
  failed: { label: 'VERIFICATION FAILED', note: 'A required integrity or retrieval check failed. Do not treat this frame as verified.' }
};

function setVerificationBadge(state = 'pending', note = '') {
  if (!el.verificationBadge) return;
  const config = VERIFICATION_STATES[state] || VERIFICATION_STATES.pending;
  el.verificationBadge.dataset.state = state;
  el.verificationBadge.title = note || config.note;
  if (el.verificationLabel) el.verificationLabel.textContent = config.label;
  if (el.verificationNote) el.verificationNote.textContent = note || config.note;
}

function updateAppLive(state = 'live') {
  if (!el.appLive) return;
  const labels = { live: 'LIVE IRSA', cached: 'CACHED IRSA', s3: 'S3 INDEX', offline: 'ARCHIVE QUERY FAILED', local: 'LOCAL PNG', mirror: 'LOCAL MIRROR', mosaic: 'LOCAL MOSAIC', 'no-coverage': 'NO COVERAGE' };
  if (el.appLiveText) el.appLiveText.textContent = labels[state] || labels.live;
  el.appLive.dataset.state = state;
  sourceState = state;
  setVerificationBadge(state);
}

function loadFrames(newFrames, source, badge = 'LIVE IRSA • REAL FITS') {
  stopPlayback();
  releaseImages(new Set(newFrames.map((frame) => frame.objectUrl).filter(Boolean)));
  frames = newFrames; frameIndex = 0; comparisonOpen = false; realBadge = badge;
  const shownBand = newFrames.find(frame => BAND_INFO[frame.detector])?.detector;
  if (shownBand) appliedDetector = shownBand;
  const localOnly = newFrames.length > 0 && newFrames.every(frame => !frame.real);
  const mirrorOnly = newFrames.length > 0 && newFrames.every(frame => frame.mirror);
  const mosaicOnly = newFrames.length > 0 && newFrames.every(frame => frame.mosaic);
  updateAppLive(localOnly ? 'local' : mosaicOnly ? 'mosaic' : mirrorOnly ? 'mirror' : /S3 index/i.test(badge) ? 's3' : /bundled|last known|fallback|last-good|cached/i.test(badge) ? 'cached' : 'live');
  hdMode = false; updateHDControls();
  el.compareGrid.hidden = true; el.showCompare.textContent = 'Side by side'; el.showCompare.classList.remove('active'); el.showCompare.setAttribute('aria-pressed', 'false');
  el.sourceLabel.textContent = source;
  el.timeline.max = String(Math.max(0, frames.length - 1));
  populateQuickVisits();
  syncQuickTime();
  for (const selector of [el.frameA, el.frameB]) {
    selector.replaceChildren();
    frames.forEach((frame, index) => selector.add(new Option(`${index + 1}. ${frame.label}`, index)));
  }
  el.frameA.value = '0'; el.frameB.value = String(Math.min(1, frames.length - 1));
  const enabled = frames.length > 0;
  for (const item of [el.timeline, el.previous, el.next, el.frameA, el.frameB]) {
    item.disabled = !enabled;
  }
  for (const item of [el.play, el.blink, el.showCompare, el.difference, el.speed, el.swapCompare]) {
    item.disabled = frames.length < 2;
  }
  el.empty.hidden = enabled;
  el.stageBadge.hidden = !frames.some(f => f.real);
  el.stageBadge.textContent = realBadge;
  buildFilmstrip();
  resetView(); render();
  updateVisitNotice();
  updateVisitWindow();
}

async function loadPNGFiles(files) {
  sky = null;
  const pngs = Array.from(files).filter(file => file.type === 'image/png' || file.name.toLowerCase().endsWith('.png'));
  if (!pngs.length) { notify('Please select PNG files.'); return; }
  pngs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const valid = [];
  for (const file of pngs) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url;
      await image.decode();
      valid.push({ label: file.name, src: url, width: image.naturalWidth, height: image.naturalHeight, real: false });
    } catch { URL.revokeObjectURL(url); }
  }
  if (!valid.length) { notify('None of those files could be decoded as PNG images.'); return; }
  if (valid.length < pngs.length) notify('Some files were not valid PNG images and were skipped.');
  const dims = new Set(valid.map(f => `${f.width}×${f.height}`));
  if (dims.size > 1) notify('Images have different dimensions. Align and crop them before scientific comparison.');
  const newUrls = valid.map(f => f.src);
  loadFrames(valid, `${valid.length} local PNG image${valid.length === 1 ? '' : 's'}`);
  ownedObjectUrls = newUrls;
  if (valid.length < 2) notify('Load at least 2 observations to see changes over time.');
}

function isIrsaUri(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && url.hostname === 'irsa.ipac.caltech.edu' && url.pathname.startsWith('/ibe/data/spherex/');
  } catch {
    return false;
  }
}

function mirrorAsset(value) {
  if (typeof value !== 'string' || !/^fields\/[A-Za-z0-9._/-]+$/.test(value) || value.includes('\\') || value.split('/').includes('..')) return '';
  return `/mirror/${value}`;
}

function mirrorMeasurement(value) {
  if (!value || value.measured !== true) return null;
  if (!['median', 'mean', 'waveMin', 'waveMax', 'width', 'height'].every((key) => Number.isFinite(value[key]))) return null;
  if (value.width <= 0 || value.height <= 0) return null;
  return { ...value, measured: true };
}

async function loadMirrorField(field, requestedDetector, requestedPalette, requestedStretch, { nearest = false } = {}) {
  let response;
  try {
    response = await fetch('/mirror/index.json', { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let manifest;
  try { manifest = await response.json(); } catch { return null; }
  if (manifest?.schemaVersion !== 2 || !Array.isArray(manifest.fields)) return null;
  const candidates = manifest.fields.filter(item =>
    Number.isFinite(item.ra) &&
    Number.isFinite(item.dec) &&
    Number.isFinite(item.fov) &&
    item.detector === requestedDetector &&
    item.palette === requestedPalette &&
    item.stretch === requestedStretch &&
    Array.isArray(item.frames) &&
    item.frames.length
  );
  const exact = candidates.find(item =>
    Math.abs(item.ra - field.ra) < 0.01 &&
    Math.abs(item.dec - field.dec) < 0.01 &&
    Math.abs(item.fov - field.fov) < 0.001
  );
  const entry = exact || (nearest
    ? candidates
      .map(item => ({ item, separation: angularSeparation(field.ra, field.dec, item.ra, item.dec) }))
      .filter(candidate => Number.isFinite(candidate.separation))
      .sort((a, b) => a.separation - b.separation)[0]?.item
    : null);
  if (!entry) return null;
  const mirrorFrames = [];
  for (const frame of entry.frames) {
    const measurement = mirrorMeasurement(frame.measurement);
    const png = mirrorAsset(frame.png);
    const fits = mirrorAsset(frame.fits);
    if (!frame.obsid || !isIrsaUri(frame.uri) || !png || !fits || !measurement) return null;
    if (!/^[a-f0-9]{64}$/.test(frame.pngSha256 || '') || !/^[a-f0-9]{64}$/.test(frame.fitsSha256 || '')) return null;
    if (!Number.isInteger(frame.pngBytes) || frame.pngBytes <= 0 || !Number.isInteger(frame.fitsBytes) || frame.fitsBytes <= 0) return null;
    mirrorFrames.push({
      label: `${frame.date} · ${frame.detector}`,
      src: png,
      mirrorSrc: png,
      remoteSrc: '',
      width: measurement.width,
      height: measurement.height,
      fov: entry.fov,
      date: frame.date,
      iso: frame.iso,
      band: frame.band,
      detector: frame.detector,
      uri: frame.uri,
      obsid: frame.obsid,
      ra: entry.ra,
      dec: entry.dec,
      analysis: measurement,
      mirrorAnalysis: measurement,
      measurementError: null,
      sourceLabel: 'Local mirror · verified real IRSA FITS',
      real: true,
      mirror: true,
      expectedSha256: frame.pngSha256
    });
  }
  const mirrorRange = visitWindowSummary(mirrorFrames);
  return {
    frames: mirrorFrames,
    source: `Local mirror sample · ${mirrorFrames.length} verified visits · ${entry.detector}${mirrorRange ? ` · ${mirrorRange}` : ''}`,
    field: { ra: entry.ra, dec: entry.dec, fov: entry.fov },
    sky: entry.sky || null
  };
}

function showNoCoverage(payload, field, target) {
  const coverage = payload.coverage || {};
  const message = coverage.message || 'Region not yet observed in the current SPHEREx DR1/QR3 releases.';
  loadFrames([], message, 'NO OBSERVATIONS');
  el.sourceLabel.classList.remove('error');
  el.emptyEyebrow.textContent = 'NO OBSERVATIONS YET';
  el.emptyTitle.textContent = 'This patch is outside current coverage.';
  el.emptyMessage.textContent = message;
  el.viewerTitle.textContent = target?.label || 'Custom sky region';
  el.fieldConstellation.textContent = payload.sky?.constellation?.name
    ? `${payload.sky.constellation.name.toUpperCase()} · SPHEREX COVERAGE`
    : target?.constellation ? `${target.constellation.toUpperCase()} · SPHEREX COVERAGE` : 'SPHEREX COVERAGE';
  el.fieldMeta.textContent = `${coordinateText(field.ra, field.dec)} · ${field.fov.toFixed(2)}° field`;
  updateAppLive('no-coverage');
  notify(message);
}

async function loadVerifiedMirror(field, { nearest = false } = {}) {
  let mirror = null;
  try { mirror = await loadMirrorField(field, detector, palette, stretch, { nearest }); } catch { return null; }
  if (!mirror) return null;
  try {
    await loadFrameSet(mirror.frames, { detached: true, timeoutMs: 8_000 });
    if (mirror.frames.some(frame => !frame.objectUrl || frame.loadError)) throw new Error('Local mirror failed PNG integrity verification.');
    return mirror;
  } catch {
    discardFrameObjects(mirror.frames);
    return null;
  }
}

function showMirrorField(mirror, field, { record = true, note = '' } = {}) {
  loadFrames(mirror.frames, mirror.source, 'LOCAL MIRROR · REAL FITS');
  el.sourceLabel.classList.remove('error');
  el.sourceLabel.textContent = note ? `${mirror.source} · ${note}` : mirror.source;
  const target = targets[el.target.value];
  el.viewerTitle.textContent = target?.label || 'Custom sky region';
  el.fieldConstellation.textContent = mirror.sky?.constellation?.name
    ? `${mirror.sky.constellation.name.toUpperCase()} · LOCAL MIRROR`
    : 'LOCAL MIRROR · REAL FITS';
  el.fieldMeta.textContent = `${coordinateText(field.ra, field.dec)} · ${field.fov.toFixed(2)}° field`;
  if (record) recordNavigation(field, el.target.value);
  updateUrl(field, el.target.value);
  updateBandUI();
  updateMapUI();
  loadConstellation(mirror.sky, field.ra, field.dec);
  updateVerification();
}

function sampleAllSkyMosaic(galacticL, galacticB) {
  if (!allSky.pixels) return null;
  const width = allSky.width;
  const height = allSky.height;
  const u = ((((180 - galacticL) % 360) + 360) % 360) / 360;
  const v = Math.max(0, Math.min(1, (90 - galacticB) / 180));
  const fx = u * width;
  const fy = v * height;
  const x0 = Math.floor(fx) % width;
  const y0 = Math.min(height - 1, Math.floor(fy));
  const x1 = (x0 + 1) % width;
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - Math.floor(fx);
  const ty = fy - Math.floor(fy);
  const source = allSky.pixels.data;
  const pixel = (x, y) => {
    const at = (y * width + x) * 4;
    return [source[at], source[at + 1], source[at + 2]];
  };
  const a = pixel(x0, y0);
  const b = pixel(x1, y0);
  const c = pixel(x0, y1);
  const d = pixel(x1, y1);
  return a.map((value, channel) =>
    value * (1 - tx) * (1 - ty) + b[channel] * tx * (1 - ty) + c[channel] * (1 - tx) * ty + d[channel] * tx * ty
  );
}

function buildAllSkyMosaicCutout(field, size = 512) {
  if (!allSky.pixels) return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const output = context.createImageData(size, size);
  const cosDec = Math.max(0.05, Math.cos(field.dec * Math.PI / 180));
  for (let y = 0; y < size; y += 1) {
    const north = 0.5 - (y + 0.5) / size;
    const dec = Math.max(-90, Math.min(90, field.dec + north * field.fov));
    for (let x = 0; x < size; x += 1) {
      const east = (x + 0.5) / size - 0.5;
      const ra = normalizeRa(field.ra + (east * field.fov) / cosDec);
      const galactic = equatorialToGalactic(ra, dec);
      const colour = sampleAllSkyMosaic(galactic.l, galactic.b);
      const at = (y * size + x) * 4;
      if (!colour) continue;
      output.data[at] = Math.round(colour[0]);
      output.data[at + 1] = Math.round(colour[1]);
      output.data[at + 2] = Math.round(colour[2]);
      output.data[at + 3] = 255;
    }
  }
  context.putImageData(output, 0, 0);
  return { src: canvas.toDataURL('image/png'), width: size, height: size };
}

async function showMosaicField(field, note = '') {
  if (!allSky.pixels) await allSky.ready;
  const contextFov = 30;
  const image = buildAllSkyMosaicCutout({ ...field, fov: contextFov });
  if (!image) return false;
  const frame = {
    label: 'All-sky mosaic · 2025 · 30° context',
    src: image.src,
    width: image.width,
    height: image.height,
    fov: contextFov,
    mosaicContextFov: contextFov,
    date: '2025',
    iso: '',
    band: 'All-sky',
    detector: 'Mosaic',
    uri: '',
    obsid: '',
    ra: field.ra,
    dec: field.dec,
    analysis: null,
    measurementError: 'NASA/JPL-Caltech all-sky mosaic; no per-visit FITS measurements.',
    sourceLabel: 'NASA/JPL-Caltech SPHEREx All Sky Map 2025 · local mosaic',
    real: true,
    mosaic: true
  };
  loadFrames(
    [frame],
    'NASA/JPL-Caltech SPHEREx All Sky Map 2025 · local mosaic · 30° context',
    'LOCAL MOSAIC · REAL NASA IMAGE'
  );
  el.sourceLabel.classList.remove('error');
  el.sourceLabel.textContent = `NASA/JPL-Caltech all-sky mosaic · local · 30° context${note ? ` · ${note}` : ''}`;
  el.viewerTitle.textContent = targets[el.target.value]?.label || 'Custom sky region';
  el.fieldConstellation.textContent = 'LOCAL ALL-SKY MOSAIC · REAL NASA IMAGE';
  el.fieldMeta.textContent = `${coordinateText(field.ra, field.dec)} · 30° mosaic context · selected ${field.fov.toFixed(2)}° field`;
  el.stageLoading.hidden = true;
  updateAppLive('mosaic');
  updateUrl(field, el.target.value);
  updateMapUI();
  updateVerification();
  notify(`Showing the real NASA/JPL-Caltech all-sky mosaic at ${coordinateText(field.ra, field.dec)} · 30° context.`);
  return true;
}

let emptyDefaultFallback = false;
let archiveUnavailableUntil = 0;

function showNearestMirrorFallback(mirror, note) {
  const fallbackField = mirror.field;
  const isDefault = Math.abs(fallbackField.ra - 150) < 0.01 && Math.abs(fallbackField.dec - 19.5) < 0.01 && Math.abs(fallbackField.fov - 0.3) < 0.01;
  el.target.value = isDefault ? 'spherex' : 'custom';
  el.ra.value = fallbackField.ra.toFixed(5);
  el.dec.value = fallbackField.dec.toFixed(5);
  el.fov.value = String(fallbackField.fov);
  updateTargetMeta(isDefault ? targets.spherex : targets.custom);
  emptyDefaultFallback = false;
  el.emptyReal.textContent = 'Load this field';
  showMirrorField(mirror, fallbackField, { record: true, note });
  updateAppLive('mirror');
  notify(`The S3-backed archive did not answer this request. Showing the nearest verified local field at ${coordinateText(fallbackField.ra, fallbackField.dec)}. This is real SPHEREx archive data, not the clicked patch.`);
}

async function fetchFramesWithRetry(url, signal) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    if (response.ok || attempt === 1 || ![502, 503, 504].includes(response.status)) return response;
    // Render can briefly return 502 while a deploy or cold start settles.
    await new Promise(resolve => setTimeout(resolve, 1_500));
  }
  throw new Error('The archive API did not answer.');
}

async function loadRealFrames(options = {}) {
  const record = options?.record !== false;
  const preserveCurrent = Boolean(options?.preserveCurrent) && frames.length > 0;
  let field;
  try { field = readField(); } catch (error) {
    detector = onScreenDetector();
    el.detector.value = detector;
    updateBandUI();
    notify(error.message);
    return;
  }
  updateHipsContext(field);

  const request = ++loadRequest;
  activeLoadController?.abort();
  const controller = new AbortController();
  activeLoadController = controller;
  const currentBand = onScreenDetector();
  const bandSwitch = preserveCurrent && detector !== currentBand ? detector : '';
  setLoading(true, {
    // A band change always shows the stage overlay: the frame behind it is the
    // previous detector and must not look like the new one.
    quietStage: preserveCurrent && !bandSwitch,
    title: bandSwitch ? `Loading ${bandSwitch} detector` : '',
    note: bandSwitch ? `Waiting for real ${bandSwitch} visits. The ${currentBand} frame is still on screen and has not changed.` : ''
  });
  if (!preserveCurrent) setVerificationBadge('pending');
  // Keep the current real visit set visible until a replacement is fully
  // received. A failed navigation must never erase data already on screen.
  el.empty.hidden = true;
  el.sourceLabel.classList.remove('error');
  const refreshCopy = bandSwitch ? `Querying real ${bandSwitch} visits…` : 'Refreshing visits with new filters…';
  el.sourceLabel.textContent = preserveCurrent ? refreshCopy : 'Checking verified local mirror…';
  notify(bandSwitch
    ? `Loading real ${bandSwitch} visits. The ${currentBand} frame stays on screen until they arrive.`
    : preserveCurrent ? 'Refreshing the current visits with the new display filters.' : 'Checking the verified local mirror before contacting the archive.');
  let mirror = null;
  let mosaicShown = false;
  try {
    mirror = await loadVerifiedMirror(field);
    if (request !== loadRequest) {
      if (mirror) discardFrameObjects(mirror.frames);
      return;
    }
    if (mirror) {
      if (preserveCurrent) discardFrameObjects(mirror.frames);
      else {
        showMirrorField(mirror, field, { record, note: 'refreshing archive…' });
        el.stageLoading.hidden = true;
        // The mirror is usable now; the IRSA request is the background refresh.
        setLoading(false);
        notify(`Showing ${mirror.frames.length} verified local visits while the archive refreshes.`);
      }
    } else if (archiveUnavailableUntil > Date.now()) {
      if (preserveCurrent) {
        el.sourceLabel.textContent = 'The archive is temporarily unavailable; keeping the current visits.';
        return;
      }
      // Every arbitrary sky position now has real local context from the
      // checked-in NASA/JPL-Caltech mosaic. Do not make a recent failure empty.
      mosaicShown = await showMosaicField(field, 'archive query failed');
      if (request !== loadRequest) return;
      if (mosaicShown) {
        setLoading(false);
        return;
      }
      el.sourceLabel.textContent = 'Querying the S3 archive for real visits…';
      notify('Finding real SPHEREx visits for this patch.');
    } else if (preserveCurrent) {
      el.sourceLabel.textContent = refreshCopy;
    } else {
      // Show the real local all-sky mosaic immediately, then replace it with
      // per-visit FITS frames if IRSA answers. The mosaic is context only, not
      // a substitute for a visit and never carries a visit measurement.
      mosaicShown = await showMosaicField(field, 'checking archive…');
      if (request !== loadRequest) return;
      if (mosaicShown) {
        setLoading(false);
        notify('Showing the real local all-sky mosaic while the archive is checked.');
      } else {
        el.sourceLabel.textContent = 'Querying the S3 archive for real visits…';
        notify('Finding real SPHEREx visits for this patch.');
      }
    }

    const params = new URLSearchParams({
      ra: String(field.ra), dec: String(field.dec), fov: String(field.fov), limit: '24', v: '13',
      detector, palette, stretch
    });
    const timeout = setTimeout(() => controller.abort(), 50_000);
    let response;
    try {
      response = await fetchFramesWithRetry(`/api/spherex/frames?${params.toString()}`, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
    if (request !== loadRequest) return;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Archive frame discovery returned ${response.status}.`);
    if (Array.isArray(payload.frames) && payload.frames.length === 0 && payload.coverage?.observed === false) {
      if (preserveCurrent) {
        el.sourceLabel.textContent = 'No visits match this filter; keeping the current visits.';
        notify('No visits match this filter; keeping the current visits.');
        return;
      }
      if (mosaicShown) {
        updateAppLive('mosaic');
        el.sourceLabel.classList.remove('error');
        el.sourceLabel.textContent = payload.source?.label || 'NASA/JPL-Caltech all-sky mosaic · local · no per-visit coverage';
        el.stageBadge.hidden = false;
        el.stageBadge.textContent = 'LOCAL MOSAIC · REAL NASA IMAGE';
        notify(payload.coverage?.message || 'No SPHEREx visits cover this exact patch; the local all-sky mosaic remains visible.');
        return;
      }
      showNoCoverage(payload, field, targets[el.target.value]);
      return;
    }
    if (!Array.isArray(payload.frames) || !payload.frames.length) throw new Error('The archive returned no real products for this field.');

    detector = payload.detector || detector;
    el.detector.value = detector;
    updateHipsContext(field);
    const realFrames = payload.frames.map(frame => ({
      label: `${frame.date} · ${frame.detector}`,
      src: frame.pngUrl,
      remoteSrc: frame.pngUrl,
      width: null,
      height: null,
      fov: field.fov,
      date: frame.date,
      iso: frame.iso,
      band: frame.band,
      detector: frame.detector,
      uri: frame.uri,
      obsid: frame.obsid,
      id: frame.id || frame.obsid,
      detectors: Array.isArray(frame.detectors) ? frame.detectors : [],
      ra: payload.field?.ra ?? field.ra,
      dec: payload.field?.dec ?? field.dec,
      analysis: null,
      measurementError: null,
      sourceLabel: payload.source?.label || 'Archive discovery · SPHEREx DR1',
      real: true
    }));
    sky = payload.sky || null;
    const badge = /S3 index/i.test(payload.source?.label || '')
      ? 'S3 INDEX · REAL FITS'
      : /bundled|last known|fallback|last-good|cached/i.test(payload.source?.label || '')
        ? 'CACHED IRSA · REAL FITS'
        : 'LIVE IRSA · REAL FITS';
    const range = visitWindowSummary(realFrames);
    archiveUnavailableUntil = 0;
    emptyDefaultFallback = false;
    el.emptyReal.textContent = 'Load this field';
    if (preserveCurrent) {
      await loadFrameData(realFrames[0], { detached: true, timeoutMs: 30_000 });
      if (request !== loadRequest) return;
      if (!realFrames[0].objectUrl) {
        discardFrameObjects(realFrames);
        el.sourceLabel.textContent = 'The filtered frame did not load; keeping the current visits.';
        notify('The filtered frame did not load; keeping the current visits.');
        return;
      }
    }
    loadFrames(realFrames, `${realFrames.length} real visits · ${payload.detector}${range ? ` · ${range}` : ''}`, badge);
    const target = targets[el.target.value];
    el.viewerTitle.textContent = target?.label || 'Custom sky region';
    el.fieldConstellation.textContent = payload.sky?.constellation?.name
      ? `${payload.sky.constellation.name.toUpperCase()} · SPHEREX DR1`
      : target?.constellation ? `${target.constellation.toUpperCase()} · SPHEREX DR1` : 'SPHEREX DR1 FIELD';
    el.fieldMeta.textContent = `${coordinateText(field.ra, field.dec)} · ${field.fov.toFixed(2)}° field`;
    if (record) recordNavigation(field, el.target.value);
    void loadFrameSet(realFrames);
    updateUrl(field, el.target.value);
    updateBandUI();
    updateMapUI();
    loadConstellation(payload.sky || null, field.ra, field.dec);
    updateVerification();
    notify(`Loaded ${realFrames.length} real visits in ${detector}. Press play, blink, or difference.`);
  } catch (error) {
    if (request !== loadRequest) return;
    const archiveError = error?.name === 'AbortError' ? 'The archive API did not answer within 50 seconds.' : error.message;
    el.stageLoading.hidden = true;
    el.sourceLabel.classList.add('error');
    if (preserveCurrent) {
      el.sourceLabel.textContent = `Filter refresh failed: ${archiveError} · keeping ${frames.length} current visit${frames.length === 1 ? '' : 's'}`;
      notify(`Filter refresh failed: ${archiveError}. Keeping the current visits.`);
      return;
    }
    if (mirror) {
      updateAppLive('mirror');
      el.sourceLabel.textContent = `${mirror.source} · archive refresh failed: ${archiveError}`;
      el.stageBadge.hidden = false;
      el.stageBadge.textContent = 'LOCAL MIRROR · REAL FITS';
      notify(`Archive refresh failed: ${archiveError}. Keeping the verified local mirror.`);
      return;
    }
    archiveUnavailableUntil = Date.now() + 30_000;
    if (mosaicShown) {
      updateAppLive('mosaic');
      el.sourceLabel.textContent = `NASA/JPL-Caltech all-sky mosaic · local · archive query failed: ${archiveError}`;
      el.stageBadge.hidden = false;
      el.stageBadge.textContent = 'LOCAL MOSAIC · REAL NASA IMAGE';
      notify(`The S3-backed archive did not answer this request; keeping the real local all-sky mosaic. ${archiveError}`);
      return;
    }
    const fallback = await loadVerifiedMirror(field, { nearest: true });
    if (request !== loadRequest) {
      if (fallback) discardFrameObjects(fallback.frames);
      return;
    }
    if (fallback) {
      showNearestMirrorFallback(fallback, 'archive query failed · nearest verified field');
      return;
    }
    if (frames.length) {
      el.sourceLabel.textContent = `Archive query failed: ${archiveError} · keeping ${frames.length} real visit${frames.length === 1 ? '' : 's'} already loaded`;
      el.stageBadge.hidden = false;
      el.stageBadge.textContent = realBadge;
    } else {
      updateAppLive('offline');
      el.sourceLabel.textContent = `Archive query failed: ${archiveError}`;
      el.empty.hidden = false;
      const isDefaultField = Math.abs(field.ra - 150) < 0.01 && Math.abs(field.dec - 19.5) < 0.01 && Math.abs(field.fov - 0.3) < 0.01;
      if (isDefaultField) {
        emptyDefaultFallback = false;
        el.emptyReal.textContent = 'Load this field';
        setEmptyState('ARCHIVE DID NOT RESPOND', 'The discovery request failed', `${archiveError} This is a request-level timeout, not a confirmed archive outage; try again in a moment.`);
      } else {
        emptyDefaultFallback = true;
        el.emptyReal.textContent = 'Load verified default field';
        setEmptyState('ARCHIVE DISCOVERY UNAVAILABLE', 'This field needs archive discovery', `${archiveError} This request did not reach the discovery service; it is not a confirmed archive outage. The verified default field (RA 150°, Dec +19.5°) is still available offline; the other presets need the S3 archive's discovery service.`);
      }
    }
    notify(`Archive request failed: ${archiveError}`);
  } finally {
    if (request === loadRequest) {
      // A band stays selected only once its visits actually reached the viewer;
      // a kept or failed refresh falls back to the detector that is on screen.
      if (frames.length && detector !== onScreenDetector()) {
        detector = onScreenDetector();
        el.detector.value = detector;
        syncQuickFilters();
        updateBandUI();
      }
      setLoading(false);
      if (activeLoadController === controller) activeLoadController = null;
    }
  }
}

function hdUrlFor(frame) {
  if (!frame?.remoteSrc) return '';
  const url = new URL(frame.remoteSrc, window.location.href);
  url.searchParams.delete('pixels');
  url.searchParams.set('fov', '0.9');
  return url.toString();
}

async function loadHDFrame(frame) {
  if (!frame?.real || frame.hdLoading || frame.hdObjectUrl) return;
  const url = hdUrlFor(frame);
  if (!url) return;
  frame.hdLoading = true;
  el.stageResolution.textContent = 'FETCHING 0.90° WIDE…';
  try {
    let response;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetchWithTimeout(url, { headers: { Accept: 'image/png' } }, 60_000);
      if (response.ok || ![429, 503, 504].includes(response.status) || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    }
    if (!response?.ok) throw new Error(`Wide cutout returned ${response?.status ?? 'no response'}.`);
    const bytes = await response.arrayBuffer();
    const blob = new Blob([bytes], { type: 'image/png' });
    const objectUrl = URL.createObjectURL(blob);
    ownedObjectUrls.push(objectUrl);
    const headerWidth = Number(response.headers.get('X-Frame-Width'));
    const headerHeight = Number(response.headers.get('X-Frame-Height'));
    frame.hdObjectUrl = objectUrl;
    frame.hdWidth = Number.isFinite(headerWidth) ? headerWidth : 490;
    frame.hdHeight = Number.isFinite(headerHeight) ? headerHeight : 354;
    frame.hdAnalysis = readFrameHeaders(response);
    if (frames[frameIndex] === frame && hdMode) render();
    notify(`Wide 0.90° window loaded from a ${frame.hdWidth} × ${frame.hdHeight} native-scale IRSA cutout. Coverage may be clipped by the detector footprint.`);
  } catch (error) {
    notify(`Wide cutout failed: ${error.message}`);
    hdMode = false;
    updateHDControls();
    render();
  } finally {
    frame.hdLoading = false;
    if (frames[frameIndex] === frame && !frame.hdObjectUrl) el.stageResolution.textContent = 'NATIVE CUTOUT';
  }
}

function updateHDControls() {
  const current = frames[frameIndex];
  const enabled = Boolean(current?.real && current?.remoteSrc);
  for (const button of [el.hdToggle, el.hdToggleLab]) {
    if (!button) continue;
    button.disabled = !enabled;
    button.textContent = hdMode ? 'Standard window' : 'Wide 0.90° window';
    button.classList.toggle('active', hdMode);
  }
}

function toggleHD() {
  const current = frames[frameIndex];
  if (!current?.real || !current?.remoteSrc) { notify('The wide window requires a live archive frame.'); return; }
  hdMode = !hdMode;
  updateHDControls();
  if (hdMode) loadHDFrame(current);
  render();
}

function render() {
  const f = frames[frameIndex];
  if (!f) {
    el.image.hidden = true; el.differenceCanvas.hidden = true; el.empty.hidden = false;
    lastStageKey = '';
    el.image.classList.remove('frame-enter');
    if (el.stageProgress) el.stageProgress.style.transform = 'scaleX(0)';
    drawMinimap();
    updateToolsSkyContext();
    updateMapCenter();
    el.frameLabel.textContent = 'No images loaded'; el.frameCount.textContent = '0 / 0';
    el.stageDate.textContent = 'No visit loaded';
    el.stageMode.textContent = 'LIVE FRAME';
    el.crosshair.hidden = true;
    updateDetails(null);
    updateLab();
    syncQuickTime();
    return;
  }
  el.empty.hidden = true;
  const useHd = hdMode && Boolean(f.hdObjectUrl) && !differenceMode;
  const stageSrc = useHd ? f.hdObjectUrl : frameDisplaySrc(f);
  const stageKey = `${frameIndex}|${stageSrc.length}|${useHd ? 'hd' : 'native'}|${differenceMode ? 'diff' : 'frame'}`;
  if (!differenceMode && stageKey !== lastStageKey) {
    el.image.classList.remove('frame-enter');
    void el.image.offsetWidth;
    el.image.classList.add('frame-enter');
  }
  lastStageKey = stageKey;
  if (el.stageProgress) el.stageProgress.style.transform = `scaleX(${frames.length > 1 ? frameIndex / (frames.length - 1) : frames.length ? 1 : 0})`;
  if ((!differenceMode || !el.differenceCanvas.width) && el.image.src !== new URL(stageSrc, window.location.href).href) el.image.src = stageSrc;
  if (hdMode && f.real && !f.hdObjectUrl && !f.hdLoading) loadHDFrame(f);
  if (!f.width && !bandLoadingOverlayActive()) el.stageLoading.hidden = Boolean(f.loadError);
  el.stageResolution.textContent = useHd
    ? `WIDE ${f.hdWidth || 490} PX`
    : hdMode && f.hdLoading ? 'FETCHING WIDE…'
      : f.width ? `${f.width} PX NATIVE` : 'NATIVE CUTOUT';
  el.image.classList.toggle('pixelated', Boolean(el.sharpPixels?.checked) && zoom > 1.05);
  updateHDControls();
  el.image.onload = () => {
    if (!bandLoadingOverlayActive()) el.stageLoading.hidden = true;
    if (!f.width) { f.width = el.image.naturalWidth; f.height = el.image.naturalHeight; }
    if (frames[frameIndex] === f) { updateDetails(f); updateTransform(); drawMinimap(); }
  };
  el.image.onerror = () => {
    if (!bandLoadingOverlayActive()) el.stageLoading.hidden = true;
    notify('That archive FITS cutout could not be loaded as a PNG.');
  };
  el.frameLabel.textContent = f.date ? `${f.date} · ${f.detector || 'SPHEREx'}` : f.label;
  el.frameCount.textContent = `${frameIndex + 1} / ${frames.length}`;
  el.timeline.value = String(frameIndex);
  el.stageBadge.hidden = !f.real;
  el.stageBadge.textContent = realBadge;
  el.stageDate.textContent = f.date ? `${f.date} · ${f.detector || 'SPHEREx'}` : f.label;
  el.stageMode.textContent = differenceMode ? 'DIFFERENCE A − B' : blinkMode ? 'BLINKING A / B' : 'LIVE FRAME';
  el.image.hidden = differenceMode;
  el.differenceCanvas.hidden = !differenceMode;
  el.crosshair.hidden = !el.crosshairCheck.checked || differenceMode;
  updateDetails(f);
  updateFilmstripActive();
  updateBandUI();
  updateVerification();
  updateLab();
  updateTransform();
  drawMinimap();
  updateToolsSkyContext();
  updateMapCenter();
  syncQuickTime();
}

function nextFrame() { if (!frames.length) return; if (differenceMode) clearDifference(); frameIndex = (frameIndex + 1) % frames.length; render(); }
function previousFrame() { if (!frames.length) return; if (differenceMode) clearDifference(); frameIndex = (frameIndex - 1 + frames.length) % frames.length; render(); }
function playbackDelay() { return Number(el.speed.value); }

function startPlayback() {
  if (frames.length < 2) { notify('Load at least 2 frames to animate.'); return; }
  stopPlayback(); el.play.textContent = '⏸ Pause';
  interval = setInterval(nextFrame, playbackDelay());
  syncQuickTime();
}
function togglePlay() { if (interval && !blinkMode) { stopPlayback(); return; } startPlayback(); }

function renderComparisonFrame(frame, imageEl, labelEl) {
  labelEl.textContent = frame.label;
  imageEl.src = frameDisplaySrc(frame);
}
function renderComparison() {
  if (!frames.length) return;
  renderComparisonFrame(frames[Number(el.frameA.value)], el.compareImageA, el.compareLabelA);
  renderComparisonFrame(frames[Number(el.frameB.value)], el.compareImageB, el.compareLabelB);
}
function toggleComparison() {
  if (!frames.length) return;
  comparisonOpen = !comparisonOpen; el.compareGrid.hidden = !comparisonOpen;
  el.showCompare.textContent = comparisonOpen ? 'Hide comparison' : 'Side by side';
  el.showCompare.setAttribute('aria-pressed', String(comparisonOpen));
  if (comparisonOpen) renderComparison();
  el.showCompare.classList.toggle('active', comparisonOpen);
}
function toggleBlink() {
  if (blinkMode) { stopPlayback(); return; }
  if (frames.length < 2) { notify('Load at least 2 frames to blink.'); return; }
  stopPlayback(); blinkMode = true; el.blink.textContent = 'Stop blinking'; el.blink.classList.add('active'); el.blink.setAttribute('aria-pressed', 'true'); syncQuickTime();
  let showA = true;
  function tick() { frameIndex = Number(showA ? el.frameA.value : el.frameB.value); showA = !showA; render(); }
  tick(); interval = setInterval(tick, playbackDelay());
}

function clearDifference() {
  differenceToken += 1;
  differenceMode = false;
  el.differenceCanvas.hidden = true;
  el.difference.classList.remove('active');
  el.difference.setAttribute('aria-pressed', 'false');
  el.difference.textContent = 'Difference';
  if (frames[frameIndex]) {
    el.image.hidden = false;
    el.crosshair.hidden = !el.crosshairCheck.checked;
    el.stageMode.textContent = blinkMode ? 'BLINKING A / B' : 'LIVE FRAME';
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A visit image could not be decoded for the difference view.'));
    image.src = src;
  });
}

async function showDifference() {
  if (frames.length < 2) { notify('Load at least 2 visits to subtract.'); return; }
  const a = frames[Number(el.frameA.value)] || frames[0];
  const b = frames[Number(el.frameB.value)] || frames[frames.length - 1];
  if (!a || !b || a === b) {
    notify('Choose two different visits to subtract.');
    el.difference.textContent = 'Difference';
    return;
  }
  if ((a.real && !a.objectUrl) || (b.real && !b.objectUrl)) {
    notify('Wait for both visits to finish loading before subtracting them.');
    return;
  }
  const rotation = orientationDifference(a, b);
  if (rotation !== null && rotation >= ORIENTATION_TOLERANCE_DEG) {
    el.difference.textContent = 'Difference';
    notify(`Difference refused: the selected visits are rotated ${rotation.toFixed(1)}° apart (limit ${ORIENTATION_TOLERANCE_DEG}°). Raw pixels would not correspond; choose visits with a similar detector orientation.`);
    return;
  }
  const token = ++differenceToken;
  try {
    const [imageA, imageB] = await Promise.all([
      loadImage(a.objectUrl || a.src),
      loadImage(b.objectUrl || b.src)
    ]);
    if (token !== differenceToken) return;
    const width = Math.max(imageA.naturalWidth, imageB.naturalWidth);
    const height = Math.max(imageA.naturalHeight, imageB.naturalHeight);
    if (!width || !height) throw new Error('A visit image has no pixels.');
    const canvas = el.differenceCanvas;
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(imageA, (width - imageA.naturalWidth) / 2, (height - imageA.naturalHeight) / 2);
    const pixelsA = context.getImageData(0, 0, width, height).data;
    context.clearRect(0, 0, width, height);
    context.drawImage(imageB, (width - imageB.naturalWidth) / 2, (height - imageB.naturalHeight) / 2);
    const pixelsB = context.getImageData(0, 0, width, height).data;
    const output = context.createImageData(width, height);
    for (let index = 0; index < pixelsA.length; index += 4) {
      const lumaA = (pixelsA[index] * .299 + pixelsA[index + 1] * .587 + pixelsA[index + 2] * .114);
      const lumaB = (pixelsB[index] * .299 + pixelsB[index + 1] * .587 + pixelsB[index + 2] * .114);
      const delta = Math.abs(lumaA - lumaB);
      const value = Math.min(255, delta * 4.2);
      output.data[index] = value;
      output.data[index + 1] = value * .68;
      output.data[index + 2] = value * .34;
      output.data[index + 3] = 255;
    }
    context.putImageData(output, 0, 0);
    differenceMode = true;
    el.image.hidden = true;
    canvas.hidden = false;
    el.crosshair.hidden = true;
    el.difference.classList.add('active');
    el.difference.setAttribute('aria-pressed', 'true');
    el.difference.textContent = 'Hide difference';
    el.stageMode.textContent = 'DIFFERENCE A − B';
    el.frameLabel.textContent = `${a.date || 'A'} − ${b.date || 'B'}`;
  } catch (error) {
    clearDifference();
    notify(error.message);
  }
}

function toggleDifference() {
  if (differenceMode) { clearDifference(); return; }
  if (frames.length < 2) { notify('Load at least 2 visits to subtract.'); return; }
  stopPlayback();
  el.difference.textContent = 'Preparing difference…';
  showDifference();
}

function setZoom(value, anchor = null) {
  const nextZoom = Math.max(1, Math.min(MAX_ZOOM, value));
  const oldZoom = zoom;
  if (anchor && nextZoom !== oldZoom) {
    const rect = el.stage.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const anchorX = Math.max(0, Math.min(rect.width, anchor.x)) - centerX;
    const anchorY = Math.max(0, Math.min(rect.height, anchor.y)) - centerY;
    panX = anchorX - ((anchorX - panX) / oldZoom) * nextZoom;
    panY = anchorY - ((anchorY - panY) / oldZoom) * nextZoom;
  }
  zoom = nextZoom;
  if (zoom <= 1.0001) { zoom = 1; panX = 0; panY = 0; }
  updateTransform();
}

function updateTransform() {
  clampPan();
  el.transform.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  el.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
  el.image.classList.toggle('pixelated', Boolean(el.sharpPixels?.checked) && zoom > 1.05);
  el.stage.classList.toggle('is-navigating', zoom > 1.01);
  updateMapScale();
  updateCompass();
  positionSpectrumMarker();
}

function positionSpectrumMarker() {
  const marker = el.spectrumPickMarker;
  if (!marker) return;
  const pick = labState.spectrumPick;
  const frame = frames[frameIndex];
  if (!pick || !frame || frame.mosaic || differenceMode || !Number.isFinite(pick.fractionX) || !Number.isFinite(pick.fractionY)) {
    marker.hidden = true;
    return;
  }
  const base = imageBaseRect();
  const centerX = base.stageWidth / 2;
  const centerY = base.stageHeight / 2;
  const imageX = base.left + pick.fractionX * base.width;
  const imageY = base.top + pick.fractionY * base.height;
  marker.style.left = `${centerX + (imageX - centerX) * zoom + panX}px`;
  marker.style.top = `${centerY + (imageY - centerY) * zoom + panY}px`;
  marker.hidden = false;
}

function resetView() {
  zoom = 1; panX = 0; panY = 0;
  updateTransform();
}

function zoomToNative() {
  const frame = frames[frameIndex];
  if (!frame) { resetView(); return; }
  const base = imageBaseRect();
  const pixels = hdMode && frame.hdWidth ? frame.hdWidth : frame.width;
  if (!Number.isFinite(pixels) || !base.width) { notify('Native pixel scale is not available yet.'); return; }
  setZoom(Math.max(1, Math.min(MAX_ZOOM, pixels / base.width)));
  notify(`Showing ${Math.round(zoom * 100)}% — one image pixel per screen pixel at this window size.`);
}

el.target.addEventListener('change', () => {
  const key = el.target.value;
  if (key === 'custom') {
    updateTargetMeta(targets.custom);
    el.ra.focus();
    el.ra.select();
    return;
  }
  setTarget(key, true);
});
function markCustomField() {
  if (el.target.value === 'custom') return;
  el.target.value = 'custom';
  updateTargetMeta(targets.custom);
  el.viewerTitle.textContent = 'Custom sky region';
  el.fieldConstellation.textContent = 'CUSTOM · SPHEREX DR1';
}
for (const input of [el.ra, el.dec]) input.addEventListener('input', markCustomField);
for (const preset of document.querySelectorAll('[data-target]')) {
  preset.addEventListener('click', () => {
    const key = preset.dataset.target;
    setTarget(key, true);
    enterMapApp();
  });
}
el.loadReal.addEventListener('click', loadRealFrames);
el.emptyReal.addEventListener('click', () => {
  if (emptyDefaultFallback) {
    emptyDefaultFallback = false;
    setTarget('spherex', false);
  }
  loadRealFrames();
});
el.receiptDownload?.addEventListener('click', downloadVerificationReceipt);
el.detector.addEventListener('change', () => setBand(el.detector.value, true));
for (const rail of [el.bandRail, el.spectralRail]) {
  for (const chip of rail?.querySelectorAll('[data-band]') || []) {
    chip.addEventListener('click', () => setBand(chip.dataset.band, true));
  }
}
for (const select of [el.paletteSelect, el.stretchSelect]) {
  select.addEventListener('change', applyDisplayFilters);
}
el.quickBand?.addEventListener('change', () => {
  el.detector.value = el.quickBand.value;
  setBand(el.quickBand.value, true);
});
el.quickPalette?.addEventListener('change', () => {
  el.paletteSelect.value = el.quickPalette.value;
  el.stretchSelect.value = el.quickStretch.value;
  applyDisplayFilters();
});
el.quickStretch?.addEventListener('change', () => {
  el.paletteSelect.value = el.quickPalette.value;
  el.stretchSelect.value = el.quickStretch.value;
  applyDisplayFilters();
});
el.quickPrevious?.addEventListener('click', previousFrame);
el.quickNext?.addEventListener('click', nextFrame);
el.quickPlay?.addEventListener('click', togglePlay);
el.quickTimeline?.addEventListener('input', () => {
  const index = Number(el.quickTimeline.value);
  stopPlayback();
  frameIndex = index;
  render();
});
el.quickVisit?.addEventListener('change', () => {
  const index = Number(el.quickVisit.value);
  if (!Number.isInteger(index) || !frames[index]) return;
  stopPlayback();
  frameIndex = index;
  render();
});
el.quickMore?.addEventListener('click', openFilterWorkspace);
for (const button of [el.hdToggle, el.hdToggleLab]) button?.addEventListener('click', toggleHD);
el.sharpPixels.addEventListener('change', () => render());
el.constellationRefresh.addEventListener('click', () => {
  try {
    const field = readField();
    loadConstellation(sky, field.ra, field.dec);
  } catch (error) { notify(error.message); }
});
el.play.addEventListener('click', togglePlay);
el.next.addEventListener('click', nextFrame);
el.previous.addEventListener('click', previousFrame);
el.timeline.addEventListener('input', () => { stopPlayback(); frameIndex = Number(el.timeline.value); render(); });
el.speed.addEventListener('input', () => {
  const delay = playbackDelay(); el.speedValue.textContent = `${(1000 / delay).toFixed(1)}×`;
  if (interval) { if (blinkMode) { stopPlayback(); notify('Speed changed; restart blinking.'); } else { startPlayback(); } }
});
el.frameA.addEventListener('change', () => { if (differenceMode) showDifference(); else renderComparison(); });
el.frameB.addEventListener('change', () => { if (differenceMode) showDifference(); else renderComparison(); });
el.swapCompare.addEventListener('click', () => {
  if (frames.length < 2) return;
  const wasDifference = differenceMode;
  stopPlayback();
  const previousA = el.frameA.value;
  el.frameA.value = el.frameB.value;
  el.frameB.value = previousA;
  if (wasDifference) toggleDifference();
  else renderComparison();
  notify(`A/B swapped: ${frames[Number(el.frameA.value)]?.label || 'A'} ↔ ${frames[Number(el.frameB.value)]?.label || 'B'}.`);
});
el.blink.addEventListener('click', toggleBlink);
el.difference.addEventListener('click', toggleDifference);
el.showCompare.addEventListener('click', toggleComparison);
el.crosshairCheck.addEventListener('change', () => { el.crosshair.hidden = !el.crosshairCheck.checked || differenceMode; });
el.zoomIn.addEventListener('click', () => setZoom(zoom * 1.25));
el.zoomOut.addEventListener('click', () => setZoom(zoom / 1.25));
el.zoomNative.addEventListener('click', zoomToNative);
el.resetView.addEventListener('click', resetView);
el.mapSearchForm.addEventListener('submit', submitMapSearch);
el.navBack.addEventListener('click', () => goHistory(-1));
el.navForward.addEventListener('click', () => goHistory(1));
el.minimapToggle.addEventListener('click', () => {
  const visible = el.skyMinimapWrap.classList.toggle('is-hidden');
  el.minimapToggle.setAttribute('aria-pressed', String(!visible));
  el.minimapToggle.textContent = visible ? 'Map' : 'Hide map';
  if (!visible) drawMinimap();
});
el.skyMinimap.addEventListener('pointerdown', event => {
  event.preventDefault();
  event.stopPropagation();
  if (allSky.view.mode === 'globe') {
    allSky.view.follow = false;
    minimapGlobeGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      ra: allSky.view.ra,
      dec: allSky.view.dec,
      roll: allSky.view.roll,
      moved: false
    };
    try { el.skyMinimap.setPointerCapture(event.pointerId); } catch { /* synthetic events have no capture target */ }
    return;
  }
  minimapPointer = minimapSkyFromEvent(event);
  try { el.skyMinimap.setPointerCapture(event.pointerId); } catch { /* synthetic events have no capture target */ }
  drawMinimap();
});
el.skyMinimap.addEventListener('pointermove', event => {
  if (allSky.view.mode === 'globe') {
    const gesture = minimapGlobeGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.hypot(dx, dy) > 2) gesture.moved = true;
    const view = allSky.view;
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      view.roll = gesture.roll + dx * 0.45;
    } else {
      const rect = el.skyMinimap.getBoundingClientRect();
      const degreesPerPixel = (180 / Math.PI) / Math.max(24, (rect.height / 2) * view.zoom);
      const cosDec = Math.max(0.18, Math.cos((gesture.dec || 0) * Math.PI / 180));
      view.ra = normalizeRa(gesture.ra - dx * degreesPerPixel / cosDec);
      view.dec = Math.max(-85, Math.min(85, gesture.dec + dy * degreesPerPixel));
    }
    drawMinimap();
    return;
  }
  if (!minimapPointer) return;
  event.preventDefault();
  minimapPointer = minimapSkyFromEvent(event);
  el.mapCursor.textContent = `Map ${formatRaHms(minimapPointer.ra)} · ${formatDecDms(minimapPointer.dec)}`;
  drawMinimap();
});
el.skyMinimap.addEventListener('pointerup', event => {
  if (allSky.view.mode === 'globe') {
    const gesture = minimapGlobeGesture;
    minimapGlobeGesture = null;
    try { el.skyMinimap.releasePointerCapture(event.pointerId); } catch { /* pointer was not captured */ }
    if (!gesture) return;
    if (!gesture.moved) {
      const point = globeSkyFromEvent(event);
      if (point) navigateToSky(point, '3D sky-globe navigation');
    } else {
      drawMinimap();
    }
    return;
  }
  if (!minimapPointer) return;
  const point = minimapSkyFromEvent(event);
  minimapPointer = null;
  drawMinimap();
  navigateToSky(point, 'Sky-map navigation');
});
el.skyMinimap.addEventListener('pointercancel', () => { minimapPointer = null; minimapGlobeGesture = null; drawMinimap(); });
el.skyMinimap.addEventListener('wheel', event => {
  if (allSky.view.mode !== 'globe') return;
  event.preventDefault();
  setMinimapZoom(allSky.view.zoom * Math.exp(-event.deltaY * 0.0015));
}, { passive: false });
el.minimapMode?.addEventListener('click', () => setMinimapMode(allSky.view.mode === 'globe' ? 'flat' : 'globe'));
el.minimapZoomIn?.addEventListener('click', () => setMinimapZoom(allSky.view.zoom * 1.35));
el.minimapZoomOut?.addEventListener('click', () => setMinimapZoom(allSky.view.zoom / 1.35));
el.visitNoticeRetry?.addEventListener('click', () => loadRealFrames());
el.visitNoticeAction?.addEventListener('click', () => setTarget('spherex', true));
el.sourceRefresh?.addEventListener('click', () => loadSourceHealth());
el.copyLink.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    notify('Link copied. It opens this exact sky patch.');
  } catch {
    notify('Copy the address bar to share this sky patch.');
  }
});
el.fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else enterMapApp({ native: true });
  } catch (error) {
    notify(`Full screen is unavailable: ${error.message}`);
  }
});
el.appToggle?.addEventListener('click', () => {
  if (appIsActive()) exitMapApp();
  else enterMapApp();
});
el.navMapApp?.addEventListener('click', () => enterMapApp());
el.appHome?.addEventListener('click', () => exitMapApp({ top: true }));
el.appExit?.addEventListener('click', () => exitMapApp());
el.appDetails?.addEventListener('click', () => openAppSheet('details'));
el.appSequence?.addEventListener('click', () => openAppSheet('sequence'));
el.appTools?.addEventListener('click', () => openAppSheet('tools'));
el.appShare?.addEventListener('click', () => el.copyLink?.click());
el.appDetailsClose?.addEventListener('click', closeAppSheets);
el.appToolsClose?.addEventListener('click', closeAppSheets);
el.sequenceClose?.addEventListener('click', closeAppSheets);
el.appScrim?.addEventListener('click', closeAppSheets);
// The scrim belongs inside the viewer's stacking context so it dims the map
// without covering the drawers that sit above it.
document.querySelector('.viewer-panel')?.appendChild(el.appScrim);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (labState.spectrumPickMode) {
    event.preventDefault();
    cancelSpectrumPick();
    return;
  }
  if (Object.values(APP_SHEETS).some(sheet => document.body.classList.contains(sheet.className))) {
    event.preventDefault();
    closeAppSheets();
  }
});
function stageLocalPoint(event) {
  const rect = el.stage.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top, rect };
}

function beginPinch() {
  const points = [...activePointers.values()];
  if (points.length < 2) return;
  const [a, b] = points;
  pinchGesture = {
    distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    zoom,
    panX,
    panY
  };
  singleGesture = null;
}

function movePinch() {
  const points = [...activePointers.values()];
  if (points.length < 2 || !pinchGesture) return;
  const [a, b] = points;
  const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const targetZoom = Math.max(1, Math.min(MAX_ZOOM, pinchGesture.zoom * distance / pinchGesture.distance));
  const centerX = el.stage.clientWidth / 2;
  const centerY = el.stage.clientHeight / 2;
  panX = midpoint.x - centerX - ((pinchGesture.midpoint.x - centerX - pinchGesture.panX) / pinchGesture.zoom) * targetZoom;
  panY = midpoint.y - centerY - ((pinchGesture.midpoint.y - centerY - pinchGesture.panY) / pinchGesture.zoom) * targetZoom;
  zoom = targetZoom;
  updateTransform();
}

function stopStageGesture() {
  singleGesture = null;
  pinchGesture = null;
  activePointers.clear();
  el.stage.classList.remove('dragging');
}

el.stage.addEventListener('wheel', e => {
  if (!frames.length || e.target.closest('.sky-minimap')) return;
  e.preventDefault();
  const local = stageLocalPoint(e);
  setZoom(zoom * (e.deltaY < 0 ? 1.14 : 1 / 1.14), local);
}, { passive: false });

el.stage.addEventListener('pointerdown', e => {
  if (!frames.length || e.target.closest('.sky-minimap, button, a, input, select, textarea')) return;
  if (labState.spectrumPickMode) {
    e.preventDefault();
    return;
  }
  const local = stageLocalPoint(e);
  activePointers.set(e.pointerId, local);
  try { el.stage.setPointerCapture(e.pointerId); } catch { /* synthetic events have no capture target */ }
  el.stage.classList.add('dragging');
  if (activePointers.size === 1) {
    pinchGesture = null;
    singleGesture = {
      pointerId: e.pointerId,
      start: local,
      panX,
      panY,
      mode: zoom > 1.01 ? 'pan' : 'navigate',
      moved: false
    };
  } else if (activePointers.size === 2) {
    beginPinch();
  }
});

el.stage.addEventListener('pointermove', e => {
  const local = stageLocalPoint(e);
  const point = skyAtStagePoint(e.clientX, e.clientY);
  if (point) {
    el.mapCursor.textContent = `${point.exact ? '' : '≈ '}RA ${formatRaHms(point.ra)} · Dec ${formatDecDms(point.dec)}`;
  }
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, local);
  if (activePointers.size >= 2) {
    if (!pinchGesture) beginPinch();
    movePinch();
    return;
  }
  if (!singleGesture) return;
  const dx = local.x - singleGesture.start.x;
  const dy = local.y - singleGesture.start.y;
  if (Math.hypot(dx, dy) > 3) singleGesture.moved = true;
  if (singleGesture.mode === 'pan') {
    panX = singleGesture.panX + dx;
    panY = singleGesture.panY + dy;
    updateTransform();
  } else if (singleGesture.moved) {
    el.transform.style.transform = `translate(${dx}px, ${dy}px) scale(1)`;
    el.mapCursor.textContent = 'Release to move this sky field';
  }
});

el.stage.addEventListener('pointerup', e => {
  const gesture = singleGesture;
  const local = stageLocalPoint(e);
  activePointers.delete(e.pointerId);
  if (pinchGesture) {
    if (activePointers.size < 2) { pinchGesture = null; singleGesture = null; el.stage.classList.remove('dragging'); }
    return;
  }
  if (!gesture) { el.stage.classList.remove('dragging'); return; }
  const dx = local.x - gesture.start.x;
  const dy = local.y - gesture.start.y;
  singleGesture = null;
  el.stage.classList.remove('dragging');
  if (gesture.mode === 'navigate' && Math.hypot(dx, dy) > 24) {
    const rect = el.stage.getBoundingClientRect();
    const point = skyAtStagePoint(rect.left + rect.width / 2 + (gesture.start.x - local.x), rect.top + rect.height / 2 + (gesture.start.y - local.y));
    if (point) navigateToSky(point, 'Drag navigation');
    else resetView();
  } else if (gesture.mode === 'navigate') {
    resetView();
  } else {
    updateTransform();
  }
});

el.stage.addEventListener('click', e => {
  if (!labState.spectrumPickMode) return;
  if (e.target.closest('.sky-minimap, button, a, input, select, textarea')) return;
  e.preventDefault();
  e.stopPropagation();
  const point = skyAtStagePoint(e.clientX, e.clientY);
  if (!point) {
    notify('Click inside the displayed image to pick a spectrum position.');
    return;
  }
  pickSpectrumAt(point);
}, true);

el.stage.addEventListener('pointercancel', e => { activePointers.delete(e.pointerId); stopStageGesture(); resetView(); });
el.stage.addEventListener('pointerleave', () => { if (!activePointers.size) updateMapCenter(); });
el.stage.addEventListener('dblclick', e => {
  if (labState.spectrumPickMode) return;
  if (!frames.length || e.target.closest('.sky-minimap, button, a, input, select, textarea')) return;
  const point = skyAtStagePoint(e.clientX, e.clientY);
  if (!point) { notify('Double-click inside the image to move the field.'); return; }
  const center = currentSkyCenter();
  const separation = angularSeparation(center.ra, center.dec, point.ra, point.dec);
  if (separation !== null && separation < 0.0008) { notify('The field is already centred here.'); return; }
  navigateToSky(point, 'Double-click navigation');
});

window.addEventListener('resize', () => { clampPan(); updateTransform(); drawMinimap(); });
document.addEventListener('keydown', e => {
  if (document.body.classList.contains('tour-open')) return;
  if ((e.target instanceof Element && e.target.matches('input, textarea, select, button')) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zoom * 1.25); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(zoom / 1.25); }
  else if (e.key === '0') { e.preventDefault(); resetView(); }
});
updateNavButtons();

// Field lab: user-facing mail, learning prompts and real-data games.
const lab = {
  tabs: Array.from(document.querySelectorAll('[data-lab-tab]')),
  panels: {
    wavelength: $('labWavelength'), spectrum: $('labSpectrum'), constellation: $('labConstellation'), verify: $('labVerify'),
    discover: $('labDiscover'), mail: $('labMail'), learn: $('labLearn'), games: $('labGames')
  },
  shortcut: $('mailShortcut'), mailTo: $('mailTo'), mailNote: $('mailNote'),
  mailOpen: $('mailOpen'), mailCopy: $('mailCopy'), mailStatus: $('mailStatus'), mailPreview: $('mailPreview'),
  learnConstellation: $('learnConstellation'), learnPosition: $('learnPosition'),
  learnLight: $('learnLight'), learnWave: $('learnWave'), learnFlags: $('learnFlags'), learnFrames: $('learnFrames'),
  learnQuestion: $('learnQuestion'), learnOptions: $('learnOptions'), learnFeedback: $('learnFeedback'),
  learnNext: $('learnNext'), learnScore: $('learnScore'),
  brighterChoices: $('brighterChoices'), brighterFeedback: $('brighterFeedback'), brighterNext: $('brighterNext'),
  wavePrompt: $('wavePrompt'), waveChoices: $('waveChoices'), waveFeedback: $('waveFeedback'), waveNext: $('waveNext'),
  bandGamePrompt: $('bandGamePrompt'), bandChoices: $('bandChoices'), bandFeedback: $('bandFeedback'),
  bandNext: $('bandNext'), bandGameScore: $('bandGameScore'),
  gamesSource: $('gamesSource'),
  runDiscovery: $('runDiscovery'), discoveryStatus: $('discoveryStatus'), discoveryPair: $('discoveryPair'),
  discoveryCanvas: $('discoveryCanvas'), discoveryEmpty: $('discoveryEmpty'), discoveryHint: $('discoveryHint'),
  scanFrameA: $('scanFrameA'), scanFrameB: $('scanFrameB'), swapScan: $('swapScan'),
  candidateList: $('candidateList'), candidateCount: $('candidateCount'),
  lightCurve: $('lightCurve'), lightCurveBand: $('lightCurveBand'), lightCurveCaption: $('lightCurveCaption'),
  pickSpectrum: $('pickSpectrum'), extractSpectrum: $('extractSpectrum'), spectrumCanvas: $('spectrumCanvas'), spectrumEmpty: $('spectrumEmpty'),
  spectrumSamples: $('spectrumSamples'), spectrumStatus: $('spectrumStatus'), spectrumCaption: $('spectrumCaption'),
  spectrumObsid: $('spectrumObsid'), spectrumDetectors: $('spectrumDetectors'), spectrumAperture: $('spectrumAperture'),
  spectrumAlgorithm: $('spectrumAlgorithm'), spectrumUnit: $('spectrumUnit'), spectrumFlags: $('spectrumFlags'),
  spectrumProvenance: $('spectrumProvenance')
};

const labState = {
  learnScore: 0,
  question: null,
  frameSetKey: '',
  framesRef: null,
  currentFrameKey: '',
  brighter: null,
  wave: null,
  band: null,
  gameArchive: null,
  gameArchivePromise: null,
  gameArchiveError: '',
  bandScore: 0,
  scanSignature: '',
  candidates: [],
  lightPoints: [],
  discoveryToken: 0,
  scanning: false,
  verifyGaiaKey: '',
  verifyGaia: null,
  lastChecks: [],
  spectrum: null,
  spectrumKey: '',
  spectrumLoading: false,
  spectrumError: '',
  spectrumPick: null,
  spectrumPickMode: false,
  spectrumPickFieldKey: '',
  spectrumToken: 0
};

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function labData() {
  const frame = frames[frameIndex] || null;
  const analysis = frame?.analysis || null;
  return {
    frame,
    analysis,
    constellation: analysis?.constellation || sky?.constellation?.name || '',
    ra: Number.isFinite(analysis?.ra) ? analysis.ra : Number.isFinite(frame?.ra) ? frame.ra : null,
    dec: Number.isFinite(analysis?.dec) ? analysis.dec : Number.isFinite(frame?.dec) ? frame.dec : null,
    band: frame?.band || analysis?.band || '',
    median: Number.isFinite(analysis?.median) ? analysis.median : null,
    waveMin: Number.isFinite(analysis?.waveMin) ? analysis.waveMin : null,
    waveMax: Number.isFinite(analysis?.waveMax) ? analysis.waveMax : null,
    flagged: Number.isFinite(analysis?.flagged) ? analysis.flagged : null,
    bunit: analysis?.bunit || 'MJy / sr'
  };
}

function measuredVisits() {
  return frames.filter(frame =>
    Number.isFinite(frame.analysis?.median) &&
    Number.isFinite(frame.analysis?.waveMin) &&
    Number.isFinite(frame.analysis?.waveMax) &&
    frame.analysis.waveMax > frame.analysis.waveMin
  );
}

function gameVisitLabel(frame) {
  if (!frame) return 'this visit';
  const stamp = frame.iso ? new Date(frame.iso).toISOString().slice(11, 16) : '';
  return `${frame.date || frame.label}${frame.detector ? ` · ${frame.detector}` : ''}${stamp ? ` · ${stamp}Z` : ''}`;
}

function gameFrameKey(frame) {
  return frame?.obsid || frame?.uri || frame?.label || '';
}

function brighterGamePool() {
  const measured = measuredVisits();
  if (measured.length >= 2) return { frames: measured, source: 'displayed' };
  const archive = labState.gameArchive;
  if (archive?.all?.length >= 2) {
    const group = archive.groups?.[detector];
    return { frames: group?.length >= 2 ? group : archive.all, source: 'archive' };
  }
  return { frames: measured, source: labState.gameArchivePromise ? 'loading' : 'unavailable' };
}

function measurementGamePool() {
  const measured = measuredVisits();
  if (measured.length >= 2) return { frames: measured, source: 'displayed' };
  const archive = labState.gameArchive;
  if (archive?.all?.length >= 2) return { frames: archive.all, source: 'archive' };
  return { frames: measured, source: labState.gameArchivePromise ? 'loading' : 'unavailable' };
}

function setGameSource(pool) {
  let text = '';
  if (pool.source === 'archive') {
    text = `The archive did not answer this request; games use real local-mirror visits from ${labState.gameArchive?.fieldLabel || 'the bundled field'}.`;
  } else if (pool.source === 'displayed') {
    text = 'Rounds use the measured visits loaded from this field.';
  } else if (pool.source === 'loading') {
    text = 'Loading measured visits for the games…';
  } else {
    text = 'No measured visits are available. Reconnect the archive or load measured FITS frames to play.';
  }
  lab.gamesSource.textContent = text;
}

function gameEmptyMessage(pool, kind) {
  if (pool.source === 'loading') return 'Loading measured visits…';
  if (pool.source === 'unavailable') return 'No measured visits are available yet.';
  return kind === 'brighter'
    ? 'Load at least two measured frames to play.'
    : 'Load a measured frame to play.';
}

async function loadGameArchive() {
  if (labState.gameArchive) return labState.gameArchive;
  if (labState.gameArchivePromise) return labState.gameArchivePromise;
  labState.gameArchivePromise = (async () => {
    try {
      const response = await fetch('/mirror/index.json', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000)
      });
      if (!response.ok) throw new Error(`Local mirror returned ${response.status}.`);
      const manifest = await response.json();
      if (manifest?.schemaVersion !== 2 || !Array.isArray(manifest.fields)) throw new Error('Local mirror manifest is invalid.');
      const groups = {};
      const all = [];
      let fieldLabel = '';
      for (const entry of manifest.fields) {
        if (!BAND_INFO[entry.detector] || !Array.isArray(entry.frames) || entry.frames.length < 2) continue;
        const group = [];
        for (const source of entry.frames) {
          const analysis = mirrorMeasurement(source.measurement);
          const src = mirrorAsset(source.png);
          if (!analysis || !src) continue;
          const frame = {
            label: `${source.date} · ${source.detector}`,
            src,
            mirrorSrc: src,
            remoteSrc: '',
            width: analysis.width,
            height: analysis.height,
            fov: entry.fov,
            date: source.date,
            iso: source.iso,
            band: source.band,
            detector: source.detector,
            uri: source.uri,
            obsid: source.obsid,
            ra: entry.ra,
            dec: entry.dec,
            analysis,
            mirrorAnalysis: analysis,
            sourceLabel: 'Local mirror · real IRSA FITS',
            real: true,
            mirror: true
          };
          group.push(frame);
          all.push(frame);
        }
        if (group.length >= 2) groups[entry.detector] = group;
        if (!fieldLabel && group.length) {
          fieldLabel = `RA ${entry.ra.toFixed(1)}° · Dec ${entry.dec >= 0 ? '+' : ''}${entry.dec.toFixed(1)}°`;
        }
      }
      if (all.length < 2) throw new Error('Local mirror has no measured visits.');
      return { groups, all, fieldLabel };
    } catch (error) {
      labState.gameArchiveError = error.message;
      return null;
    }
  })();
  const archive = await labState.gameArchivePromise;
  labState.gameArchivePromise = null;
  if (archive) labState.gameArchive = archive;
  if (!measuredVisits().length) {
    newBrighterRound();
    newWaveRound();
    newBandRound();
  }
  return archive;
}

function setLabTab(name) {
  for (const tab of lab.tabs) {
    const active = tab.dataset.labTab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  for (const [key, panel] of Object.entries(lab.panels)) panel.hidden = key !== name;
  if (name === 'mail') updateLab();
  if (name === 'discover') updateDiscovery();
  if (name === 'spectrum') updateSpectrumPanel();
}

function labFactPosition(data) {
  if (data.ra === null || data.dec === null) return '—';
  return `${formatRaHms(data.ra)} · ${formatDecDms(data.dec)}`;
}

function buildMailContent(data = labData()) {
  if (!data.frame) {
    return {
      subject: 'SPHEREx Explorer observation',
      text: 'Load real frames in SPHEREx Explorer to share an observation.'
    };
  }
  const lines = [
    'SPHEREx Explorer observation',
    '',
    `Frame: ${data.frame.label}`,
    `Dataset: ${data.frame.real ? 'IRSA SPHEREx DR1' : 'Local PNG image'}`,
    `Constellation: ${data.constellation || 'Not available'}`,
    `Position: ${labFactPosition(data)}`,
    `Observation ID: ${data.frame.obsid || 'Not available'}`,
    `Observation date: ${data.analysis?.dateAvg || data.frame.iso || 'Not available'}`,
    `Median light intensity: ${data.median === null ? 'Not available' : `${formatNumber(data.median)} ${data.bunit}`}`,
    `Wavelength: ${data.waveMin === null || data.waveMax === null ? 'Not available' : `${data.waveMin.toFixed(3)}–${data.waveMax.toFixed(3)} μm`}`,
    `Flagged pixels: ${data.flagged === null ? 'Not available' : data.flagged.toLocaleString()}`,
    '',
    'Created with SPHEREx Explorer · real IRSA data'
  ];
  return {
    subject: `SPHEREx Explorer — ${data.constellation || 'sky field'}${data.frame.date ? ` · ${data.frame.date}` : ''}`,
    text: lines.join('\n')
  };
}

function updateLab() {
  const data = labData();
  const frameLabel = data.frame ? `${frameIndex + 1} / ${frames.length}` : '0';
  lab.learnConstellation.textContent = data.constellation || 'Load frames to resolve';
  lab.learnPosition.textContent = labFactPosition(data);
  lab.learnLight.textContent = data.median === null ? 'Not measured yet' : `${formatNumber(data.median)} ${data.bunit}`;
  lab.learnWave.textContent = data.waveMin === null || data.waveMax === null ? 'Not measured yet' : `${data.waveMin.toFixed(3)}–${data.waveMax.toFixed(3)} μm`;
  lab.learnFlags.textContent = data.flagged === null
    ? 'Not measured yet'
    : data.frame?.width && data.frame?.height
      ? `${data.flagged.toLocaleString()} (${((data.flagged / (data.frame.width * data.frame.height)) * 100).toFixed(1)}%)`
      : data.flagged.toLocaleString();
  lab.learnFrames.textContent = frameLabel;
  lab.mailPreview.textContent = buildMailContent(data).text;
  if (!data.frame) lab.mailStatus.textContent = 'Load real frames to build an observation email.';
  else if (lab.mailStatus.textContent.startsWith('Load real frames')) lab.mailStatus.textContent = 'Ready to mail this observation.';

  if (!labState.question || (labState.question.needsData && data.frame)) newLearnQuestion();

  // A new frame set gets three fresh rounds. Measurement headers arrive
  // asynchronously; they must not wipe a round the visitor is already playing.
  if (labState.framesRef !== frames) {
    labState.framesRef = frames;
    labState.currentFrameKey = '';
    newBrighterRound();
  }

  const currentFrameKey = [
    frameIndex, data.frame?.label, data.frame?.detector, data.band,
    data.median ?? '', data.waveMin ?? '', data.waveMax ?? ''
  ].join('|');
  if (currentFrameKey !== labState.currentFrameKey) {
    labState.currentFrameKey = currentFrameKey;
    newWaveRound();
    newBandRound();
  }

  if (!labState.brighter) newBrighterRound();
  updateDiscovery();
  if (!lab.panels.spectrum.hidden) updateSpectrumPanel();
}

// Discovery engine: real pixel residuals, real sky coordinates, Gaia context and light curve.
function scanFrameLabel(frame, index) {
  return `${index + 1}. ${frame.date || frame.label}${frame.detector ? ` · ${frame.detector}` : ''}`;
}

function syncScanSelectors() {
  const signature = frames.map(frame => `${frame.obsid || frame.label}`).join('|');
  if (signature !== labState.scanSignature) {
    labState.scanSignature = signature;
    labState.candidates = [];
    labState.discoveryToken += 1;
    lab.discoveryEmpty.hidden = false;
    lab.discoveryEmpty.textContent = 'Choose two visits and run the scan.';
    renderDiscoveryCandidates();
    for (const selector of [lab.scanFrameA, lab.scanFrameB]) selector.replaceChildren();
    frames.forEach((frame, index) => {
      const label = scanFrameLabel(frame, index);
      lab.scanFrameA.add(new Option(label, index));
      lab.scanFrameB.add(new Option(label, index));
    });
    if (frames.length) {
      const measured = frames
        .map((frame, index) => ({ index, value: Number(frame.analysis?.median) }))
        .filter(item => Number.isFinite(item.value));
      if (measured.length >= 2) {
        measured.sort((a, b) => a.value - b.value);
        lab.scanFrameA.value = String(measured[0].index);
        lab.scanFrameB.value = String(measured[measured.length - 1].index);
      } else {
        lab.scanFrameA.value = '0';
        lab.scanFrameB.value = String(frames.length - 1);
      }
    }
  }
  const usable = frames.length >= 2;
  lab.scanFrameA.disabled = !usable || labState.scanning;
  lab.scanFrameB.disabled = !usable || labState.scanning;
  lab.swapScan.disabled = !usable || labState.scanning;
  lab.runDiscovery.disabled = !usable || labState.scanning;
  if (!usable) {
    lab.discoveryStatus.textContent = 'Load at least two real visits to scan.';
  } else if (!labState.scanning && !labState.candidates.length) {
    lab.discoveryStatus.textContent = 'Ready: two real visits can be compared.';
  }
}

function selectedScanPair() {
  if (frames.length < 2) return null;
  let aIndex = Number(lab.scanFrameA.value);
  let bIndex = Number(lab.scanFrameB.value);
  if (!Number.isInteger(aIndex) || !frames[aIndex]) aIndex = 0;
  if (!Number.isInteger(bIndex) || !frames[bIndex]) bIndex = frames.length - 1;
  if (aIndex === bIndex) bIndex = (aIndex + 1) % frames.length;
  return { a: frames[aIndex], b: frames[bIndex], aIndex, bIndex };
}

function smoothLuma(values, width, height) {
  const output = new Float32Array(values.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += values[yy * width + xx];
          count += 1;
        }
      }
      output[y * width + x] = sum / count;
    }
  }
  return output;
}

function skyAtCanvasPixel(frame, x, y, canvasWidth, canvasHeight, offsetX, offsetY) {
  const analysis = frame.analysis || frame.displayAnalysis;
  const width = frame.width || canvasWidth;
  const height = frame.height || canvasHeight;
  const fractionX = Math.max(0, Math.min(1, (x - offsetX) / Math.max(1, width)));
  const fractionY = Math.max(0, Math.min(1, (y - offsetY) / Math.max(1, height)));
  if (analysis?.wcsCorners) return bilinearSky(analysis.wcsCorners, fractionX, fractionY);
  if (Number.isFinite(analysis?.ra) && Number.isFinite(analysis?.dec)) {
    const fov = Number(frame.fov) || Number(el.fov.value) || 0.3;
    const cosDec = Math.max(0.08, Math.cos(analysis.dec * Math.PI / 180));
    return {
      ra: normalizeRa(analysis.ra - (fractionX - 0.5) * fov / cosDec),
      dec: Math.max(-90, Math.min(90, analysis.dec + (0.5 - fractionY) * fov))
    };
  }
  return null;
}

function renderDiscoveryCandidates() {
  lab.candidateList.replaceChildren();
  const count = labState.candidates.length;
  lab.candidateCount.textContent = `${count} CANDIDATE${count === 1 ? '' : 'S'}`;
  if (!count) {
    const empty = document.createElement('p');
    empty.className = 'small muted';
    empty.textContent = 'No ranked residuals yet. Run a scan on two real visits.';
    lab.candidateList.append(empty);
    return;
  }
  for (const [index, candidate] of labState.candidates.entries()) {
    const card = document.createElement('article');
    card.className = 'candidate-card';
    const rank = document.createElement('span');
    rank.className = 'candidate-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    const body = document.createElement('div');
    body.className = 'candidate-body';
    const title = document.createElement('strong');
    title.textContent = `${candidate.delta >= 0 ? '+' : '−'}${Math.abs(candidate.delta).toFixed(1)} luma ${candidate.delta >= 0 ? 'brighter' : 'fainter'} in B`;
    const position = document.createElement('span');
    position.textContent = `${formatRaHms(candidate.ra)} · ${formatDecDms(candidate.dec)}`;
    const gaia = document.createElement('small');
    if (candidate.edge) {
      const edge = document.createElement('small');
      edge.className = 'gaia-empty';
      edge.textContent = 'Edge of visit coverage — possible pointing artifact';
      body.append(edge);
    }
    if (candidate.gaiaState === 'pending') gaia.textContent = 'Gaia DR3 cross-match…';
    else if (candidate.gaiaState === 'hit') {
      gaia.textContent = `Gaia DR3: ${candidate.gaia.count} source${candidate.gaia.count === 1 ? '' : 's'} within 1.2′${candidate.gaia.mag !== null ? ` · G ${candidate.gaia.mag.toFixed(1)}` : ''}`;
      gaia.className = 'gaia-hit';
    } else if (candidate.gaiaState === 'empty') {
      gaia.textContent = 'No Gaia DR3 source within 1.2′ · worth a second look';
      gaia.className = 'gaia-empty';
    } else if (candidate.gaiaState === 'error') gaia.textContent = 'Gaia lookup unavailable';
    else gaia.textContent = 'Gaia cross-match not requested';
    body.append(title, position, gaia);
    const centre = document.createElement('button');
    centre.type = 'button';
    centre.className = 'candidate-centre';
    centre.textContent = 'Centre';
    centre.addEventListener('click', () => navigateToField({ ra: candidate.ra, dec: candidate.dec, fov: Number(el.fov.value) }, `Candidate ${index + 1}`));
    card.append(rank, body, centre);
    lab.candidateList.append(card);
  }
}

function drawDiscoveryPreview(canvas, difference, lumaA, lumaB, width, height, candidates) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const image = context.createImageData(width, height);
  for (let index = 0; index < difference.length; index += 1) {
    const delta = difference[index];
    const amplitude = Math.min(255, Math.abs(delta) * 3.4);
    const at = index * 4;
    if (delta >= 0) {
      image.data[at] = amplitude;
      image.data[at + 1] = amplitude * .66;
      image.data[at + 2] = amplitude * .2;
    } else {
      image.data[at] = amplitude * .3;
      image.data[at + 1] = amplitude * .72;
      image.data[at + 2] = amplitude;
    }
    image.data[at + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  context.strokeStyle = '#f2bb6d';
  context.fillStyle = '#fff3d5';
  context.font = 'bold 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.lineWidth = 1.2;
  for (const [index, candidate] of candidates.entries()) {
    context.beginPath();
    context.arc(candidate.x, candidate.y, 8, 0, Math.PI * 2);
    context.stroke();
    context.fillText(String(index + 1), candidate.x + 10, candidate.y - 7);
  }
}

async function crossmatchCandidates(candidates, token) {
  const queue = [...candidates];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const candidate = queue.shift();
      if (!candidate) continue;
      try {
        const params = new URLSearchParams({ survey: 'gaia', ra: String(candidate.ra), dec: String(candidate.dec), radius: '0.02' });
        const response = await fetch(`/api/catalog?${params.toString()}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
        if (token !== labState.discoveryToken) return;
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Gaia returned ${response.status}.`);
        const sources = Array.isArray(payload.sources) ? payload.sources : [];
        const count = Number.isFinite(payload.count) ? payload.count : sources.length;
        const nearest = sources.reduce((best, source) => {
          const separation = angularSeparation(candidate.ra, candidate.dec, Number(source.ra), Number(source.dec));
          return separation !== null && (!best || separation < best.separation) ? { source, separation } : best;
        }, null);
        if (count > 0) {
          candidate.gaiaState = 'hit';
          candidate.gaia = { count, mag: Number.isFinite(Number(nearest?.source?.mag)) ? Number(nearest.source.mag) : null };
        } else {
          candidate.gaiaState = 'empty';
          candidate.gaia = { count: 0, mag: null };
        }
      } catch {
        if (token !== labState.discoveryToken) return;
        candidate.gaiaState = 'error';
      }
      renderDiscoveryCandidates();
    }
  });
  await Promise.all(workers);
  if (token === labState.discoveryToken) {
    const matched = candidates.filter(candidate => candidate.gaiaState === 'hit').length;
    lab.discoveryStatus.textContent = `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} ranked · Gaia DR3 context attached to ${matched} of ${candidates.length}. Candidates are leads, not confirmations.`;
  }
}

async function runDiscoveryScan() {
  if (labState.scanning) return;
  const pair = selectedScanPair();
  if (!pair) { notify('Load at least two real visits before scanning.'); return; }
  if (!pair.a.src || !pair.b.src) { notify('Wait for both visits to finish loading.'); return; }
  labState.scanning = true;
  const token = ++labState.discoveryToken;
  labState.candidates = [];
  renderDiscoveryCandidates();
  syncScanSelectors();
  lab.discoveryStatus.textContent = 'Comparing real pixels and ranking residuals…';
  lab.discoveryEmpty.hidden = true;
  try {
    const [imageA, imageB] = await Promise.all([loadImage(pair.a.src), loadImage(pair.b.src)]);
    if (token !== labState.discoveryToken) return;
    const width = Math.max(imageA.naturalWidth, imageB.naturalWidth);
    const height = Math.max(imageA.naturalHeight, imageB.naturalHeight);
    if (!width || !height) throw new Error('A visit has no pixels to compare.');
    const canvas = lab.discoveryCanvas;
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const offsetA = { x: (width - imageA.naturalWidth) / 2, y: (height - imageA.naturalHeight) / 2 };
    const offsetB = { x: (width - imageB.naturalWidth) / 2, y: (height - imageB.naturalHeight) / 2 };
    context.clearRect(0, 0, width, height);
    context.drawImage(imageA, offsetA.x, offsetA.y);
    const pixelsA = context.getImageData(0, 0, width, height).data;
    context.clearRect(0, 0, width, height);
    context.drawImage(imageB, offsetB.x, offsetB.y);
    const pixelsB = context.getImageData(0, 0, width, height).data;
    const lumaA = new Float32Array(width * height);
    const lumaB = new Float32Array(width * height);
    for (let index = 0; index < lumaA.length; index += 1) {
      const at = index * 4;
      lumaA[index] = luma(pixelsA[at], pixelsA[at + 1], pixelsA[at + 2]);
      lumaB[index] = luma(pixelsB[at], pixelsB[at + 1], pixelsB[at + 2]);
    }
    const smoothA = smoothLuma(lumaA, width, height);
    const smoothB = smoothLuma(lumaB, width, height);
    const difference = new Float32Array(width * height);
    const absolute = new Float32Array(width * height);
    for (let index = 0; index < difference.length; index += 1) {
      difference[index] = smoothB[index] - smoothA[index];
      absolute[index] = Math.abs(difference[index]);
    }
    const { threshold } = robustChangeThreshold(absolute);
    const points = [];
    for (let y = 5; y < height - 5; y += 1) {
      for (let x = 5; x < width - 5; x += 1) {
        const index = y * width + x;
        if (absolute[index] >= threshold) points.push({ x, y, score: absolute[index], delta: difference[index] });
      }
    }
    points.sort((a, b) => b.score - a.score);
    const candidates = [];
    for (const point of points) {
      if (candidates.some(other => Math.hypot(other.x - point.x, other.y - point.y) < 9)) continue;
      const sky = skyAtCanvasPixel(pair.b, point.x, point.y, width, height, offsetB.x, offsetB.y);
      if (!sky) continue;
      const edge = point.x < width * .14 || point.x > width * .86 || point.y < height * .14 || point.y > height * .86;
      candidates.push({ ...point, ...sky, edge, gaiaState: 'pending', gaia: null });
      if (candidates.length >= 8) break;
    }
    if (token !== labState.discoveryToken) return;
    labState.candidates = candidates;
    drawDiscoveryPreview(canvas, difference, smoothA, smoothB, width, height, candidates);
    lab.discoveryPair.textContent = `${pair.a.date || 'A'} → ${pair.b.date || 'B'} · ${width} × ${height} px`;
    lab.discoveryStatus.textContent = candidates.length
      ? `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} ranked from real pixels. Gaia cross-match follows.`
      : 'No residual crossed the robust threshold. The visits may be nearly identical, or the change is below the archive noise.';
    if (!candidates.length) {
      lab.discoveryEmpty.hidden = false;
      lab.discoveryEmpty.textContent = 'No candidate crossed the robust residual threshold for this pair.';
    }
    renderDiscoveryCandidates();
    if (candidates.length) void crossmatchCandidates(candidates, token);
  } catch (error) {
    lab.discoveryStatus.textContent = `Scan failed: ${error.message}`;
    notify(`Change scan failed: ${error.message}`);
  } finally {
    labState.scanning = false;
    syncScanSelectors();
  }
}

function drawLightCurve() {
  const canvas = lab.lightCurve;
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.width = Math.max(320, Math.floor(canvas.clientWidth || canvas.width || 840));
  canvas.height = 190;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#070f19';
  context.fillRect(0, 0, width, height);
  const measured = frames
    .map((frame, index) => ({ frame, index, value: Number(frame.analysis?.median), iso: frame.iso || frame.date }))
    .filter(item => Number.isFinite(item.value));
  labState.lightPoints = [];
  lab.lightCurveBand.textContent = `${detector} · ${measured.length} MEASURED VISIT${measured.length === 1 ? '' : 'S'}`;
  if (!measured.length) {
    context.fillStyle = '#71859a';
    context.font = '14px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText('Load measured FITS visits to plot real medians.', 20, height / 2);
    lab.lightCurveCaption.textContent = 'No measured frames yet.';
    return;
  }
  const values = measured.map(item => item.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, Math.abs(high) * .002 || 1e-6);
  const left = 64, right = 22, top = 22, bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const dates = measured.map(item => Date.parse(item.iso) || item.index);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const xFor = (date) => left + (maxDate === minDate ? plotWidth / 2 : ((date - minDate) / (maxDate - minDate)) * plotWidth);
  const yFor = (value) => top + (1 - (value - (low - span * .08)) / (span * 1.16)) * plotHeight;
  context.strokeStyle = 'rgba(120,151,180,.17)';
  context.fillStyle = '#71859a';
  context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.lineWidth = 1;
  for (let tick = 0; tick <= 3; tick += 1) {
    const value = low - span * .08 + (span * 1.16) * tick / 3;
    const y = yFor(value);
    context.beginPath(); context.moveTo(left, y); context.lineTo(width - right, y); context.stroke();
    context.fillText(formatNumber(value), 5, y + 4);
  }
  context.strokeStyle = '#f2bb6d';
  context.lineWidth = 1.4;
  context.beginPath();
  measured.forEach((item, index) => {
    const x = xFor(dates[index]);
    const y = yFor(item.value);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
  measured.forEach((item, index) => {
    const x = xFor(dates[index]);
    const y = yFor(item.value);
    const active = item.index === frameIndex;
    context.beginPath();
    context.arc(x, y, active ? 4.5 : 2.8, 0, Math.PI * 2);
    context.fillStyle = active ? '#fff0cf' : '#f2bb6d';
    context.fill();
    if (active) {
      context.strokeStyle = 'rgba(242,187,109,.5)';
      context.beginPath(); context.arc(x, y, 8, 0, Math.PI * 2); context.stroke();
    }
    labState.lightPoints.push({ x, y, index: item.index });
    if (index === 0 || index === measured.length - 1 || active) {
      context.fillStyle = active ? '#fff0cf' : '#71859a';
      context.fillText(item.iso ? item.iso.slice(0, 10) : `V${item.index + 1}`, x - 28, height - 10);
    }
  });
  const unit = frames[frameIndex]?.analysis?.bunit || 'MJy sr⁻¹';
  lab.lightCurveCaption.textContent = `${measured.length} real visits · median range ${formatNumber(low)}–${formatNumber(high)} ${unit}. These are FITS cutout medians, not calibrated photometry.`;
}

const SPECTRUM_TINTS = ['#cdbaff', '#74e3ff', '#ff8ad8', '#b9a2ff', '#ffffff', '#ffcf8a'];

function spectrumFieldKey(frame) {
  if (!frame) return '';
  const analysis = frame.analysis || frame.displayAnalysis;
  const ra = Number(frame.ra ?? analysis?.ra);
  const dec = Number(frame.dec ?? analysis?.dec);
  const fov = Number(frame.fov ?? el.fov.value);
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(fov)) return '';
  return [ra.toFixed(6), dec.toFixed(6), fov.toFixed(3)].join('|');
}

function spectrumFrameKey(frame, point = labState.spectrumPick) {
  if (!frame?.real || frame.mosaic) return '';
  const analysis = frame.analysis || frame.displayAnalysis;
  const ra = Number(point?.ra ?? frame.ra ?? analysis?.ra);
  const dec = Number(point?.dec ?? frame.dec ?? analysis?.dec);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return '';
  return [frame.id || frame.obsid || frame.uri, ra.toFixed(6), dec.toFixed(6)].join('|');
}

function spectrumUrisFor(frame) {
  const available = Array.isArray(frame?.detectors) ? frame.detectors : [];
  const fallback = frame?.uri ? [{ detector: frame.detector, band: frame.band, uri: frame.uri }] : [];
  const byDetector = new Map();
  for (const item of [...available, ...fallback]) {
    if (!item?.uri || !isIrsaUri(item.uri)) continue;
    const detectorName = String(item.detector || 'D?').toUpperCase();
    if (!byDetector.has(detectorName)) {
      byDetector.set(detectorName, { detector: detectorName, band: item.band || '', uri: item.uri });
    }
  }
  return [...byDetector.values()].sort((a, b) => a.detector.localeCompare(b.detector));
}

function updateSpectrumControls() {
  const frame = frames[frameIndex];
  const unavailable = !frame?.real || Boolean(frame.mosaic) || labState.spectrumLoading;
  if (lab.extractSpectrum) {
    lab.extractSpectrum.disabled = unavailable;
    lab.extractSpectrum.textContent = labState.spectrumLoading ? 'Extracting…' : 'Extract at centre';
  }
  if (lab.pickSpectrum) {
    lab.pickSpectrum.disabled = unavailable;
    lab.pickSpectrum.textContent = labState.spectrumPickMode ? 'Cancel pick' : 'Pick point on image';
  }
}

function clearSpectrumDisplay({ message = 'No current measurement.', status = message, error = false } = {}) {
  const canvas = lab.spectrumCanvas;
  if (canvas) {
    const context = canvas.getContext('2d');
    canvas.width = 840;
    canvas.height = 320;
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#070f19';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  labState.spectrum = null;
  labState.spectrumError = error ? message : '';
  lab.spectrumEmpty.hidden = false;
  lab.spectrumEmpty.textContent = message;
  lab.spectrumSamples.textContent = 'NO DATA';
  lab.spectrumStatus.textContent = status;
  lab.spectrumCaption.textContent = 'Pink points carry at least one real FLAGS bit. The curve is an aperture mean, not calibrated photometry.';
  lab.spectrumObsid.textContent = '—';
  lab.spectrumDetectors.textContent = '—';
  lab.spectrumAperture.textContent = '—';
  lab.spectrumAlgorithm.textContent = '—';
  lab.spectrumUnit.textContent = '—';
  lab.spectrumFlags.textContent = '—';
  lab.spectrumProvenance.textContent = 'No measurement is current. Extract a real visit to create a new provenance record.';
  updateSpectrumControls();
}

function clearSpectrumPick() {
  labState.spectrumPick = null;
  labState.spectrumPickMode = false;
  labState.spectrumPickFieldKey = '';
  document.body.classList.remove('spectrum-pick-mode');
  if (el.spectrumPickMarker) el.spectrumPickMarker.hidden = true;
  updateSpectrumControls();
  updateMapScale();
}

function cancelSpectrumPick() {
  const wasPicking = labState.spectrumPickMode;
  clearSpectrumPick();
  if (labState.spectrum) renderSpectrum();
  else if (labState.spectrumError) lab.spectrumStatus.textContent = labState.spectrumError;
  else lab.spectrumStatus.textContent = 'Load a real visit to extract its spectrum.';
  if (wasPicking) notify('Spectrum point picking cancelled.');
}

function toggleSpectrumPick() {
  if (labState.spectrumPickMode) { cancelSpectrumPick(); return; }
  const frame = frames[frameIndex];
  if (!frame?.real || frame.mosaic) { notify('Load a real visit before picking a spectrum point.'); return; }
  labState.spectrumPickMode = true;
  labState.spectrumPickFieldKey = spectrumFieldKey(frame);
  document.body.classList.add('spectrum-pick-mode');
  updateSpectrumControls();
  lab.spectrumStatus.textContent = 'Pick mode active: click the image to choose a spectrum position.';
  el.mapHelp.textContent = 'Click a point in the image to extract its spectrum';
  notify('Pick mode: click any point in the displayed image. Escape cancels.');
  el.stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function pickSpectrumAt(point) {
  const frame = frames[frameIndex];
  if (!frame?.real || frame.mosaic) { cancelSpectrumPick(); notify('Load a real visit before picking a spectrum point.'); return; }
  labState.spectrumPickMode = false;
  document.body.classList.remove('spectrum-pick-mode');
  labState.spectrumPick = {
    ra: normalizeRa(point.ra),
    dec: Math.max(-90, Math.min(90, point.dec)),
    exact: Boolean(point.exact),
    fractionX: point.fractionX,
    fractionY: point.fractionY,
    fieldKey: spectrumFieldKey(frame)
  };
  updateSpectrumControls();
  positionSpectrumMarker();
  updateMapScale();
  const message = `Extracting at RA ${formatRaHms(labState.spectrumPick.ra)} · Dec ${formatDecDms(labState.spectrumPick.dec)}…`;
  notify(`${message} The provenance will record this clicked position.`);
  void extractSpectrum({ ra: labState.spectrumPick.ra, dec: labState.spectrumPick.dec, pick: labState.spectrumPick });
  document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function spectrumPercentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))];
}

function renderSpectrum() {
  const canvas = lab.spectrumCanvas;
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const spectrum = labState.spectrum;
  const segments = Array.isArray(spectrum?.segments) ? spectrum.segments : [];
  const points = segments.flatMap(segment =>
    (Array.isArray(segment.points) ? segment.points : []).filter(point => Number.isFinite(point.lambda) && Number.isFinite(point.flux))
  );
  const width = 840;
  const height = 320;
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#070f19';
  context.fillRect(0, 0, width, height);

  if (!points.length) {
    lab.spectrumEmpty.hidden = false;
    if (labState.spectrumError) {
      lab.spectrumEmpty.textContent = labState.spectrumError;
      lab.spectrumStatus.textContent = labState.spectrumError;
    } else if (!labState.spectrumLoading && !labState.spectrum) {
      lab.spectrumEmpty.textContent = 'Load a real visit, then extract its aperture spectrum.';
    }
    lab.spectrumSamples.textContent = 'NO DATA';
    updateSpectrumControls();
    return;
  }

  lab.spectrumEmpty.hidden = true;
  const lambdas = points.map(point => point.lambda);
  const fluxes = points.map(point => point.flux);
  const lowLambda = Math.max(1e-6, Math.min(...lambdas));
  const highLambda = Math.max(lowLambda * 1.000001, Math.max(...lambdas));
  const lowFlux = spectrumPercentile(fluxes, .02);
  const highFlux = spectrumPercentile(fluxes, .98);
  const spanFlux = Math.max(highFlux - lowFlux, Math.abs(highFlux) * .002 || 1e-6);
  const pad = { left: 62, right: 20, top: 28, bottom: 42 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const logLow = Math.log(lowLambda);
  const logSpan = Math.log(highLambda) - logLow || 1;
  const xFor = lambda => pad.left + ((Math.log(Math.max(lowLambda, lambda)) - logLow) / logSpan) * plotWidth;
  const yLow = lowFlux - spanFlux * .08;
  const ySpan = spanFlux * 1.16;
  const yFor = flux => pad.top + (1 - (flux - yLow) / ySpan) * plotHeight;

  context.strokeStyle = 'rgba(120,151,180,.17)';
  context.fillStyle = '#71859a';
  context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.lineWidth = 1;
  for (let tick = 0; tick <= 4; tick += 1) {
    const y = pad.top + (plotHeight * tick) / 4;
    context.beginPath();
    context.moveTo(pad.left, y);
    context.lineTo(width - pad.right, y);
    context.stroke();
    const value = yLow + ySpan * (1 - tick / 4);
    context.fillText(formatNumber(value), 5, y + 4);
  }

  for (let tick = 0; tick <= 4; tick += 1) {
    const lambda = lowLambda * Math.pow(highLambda / lowLambda, tick / 4);
    const x = xFor(lambda);
    context.beginPath();
    context.moveTo(x, height - pad.bottom);
    context.lineTo(x, height - pad.bottom + 4);
    context.stroke();
    context.fillText(lambda < 1 ? lambda.toFixed(2) : lambda.toFixed(1), x - 12, height - 16);
  }

  context.strokeStyle = 'rgba(255,255,255,.2)';
  context.beginPath();
  context.moveTo(pad.left, height - pad.bottom);
  context.lineTo(width - pad.right, height - pad.bottom);
  context.stroke();
  context.fillStyle = 'rgba(255,255,255,.45)';
  context.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.fillText('mean aperture flux', pad.left, 17);
  context.fillText('observed wavelength · µm', width - pad.right - 142, height - 16);

  const firstProvenance = segments.find(segment => segment.provenance)?.provenance || null;
  const fluxUnit = firstProvenance?.units?.flux || 'native image units';
  context.fillText(fluxUnit, 5, 17);

  segments.forEach((segment, index) => {
    const color = SPECTRUM_TINTS[index % SPECTRUM_TINTS.length];
    const ordered = (Array.isArray(segment.points) ? segment.points : [])
      .filter(point => Number.isFinite(point.lambda) && Number.isFinite(point.flux))
      .sort((a, b) => a.lambda - b.lambda);
    if (!ordered.length) return;

    context.strokeStyle = color;
    context.lineWidth = 1.8;
    context.beginPath();
    ordered.forEach((point, pointIndex) => {
      const x = xFor(point.lambda);
      const y = yFor(point.flux);
      if (pointIndex === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    context.strokeStyle = `${color}66`;
    context.lineWidth = 1;
    const stride = Math.max(1, Math.ceil(ordered.length / 70));
    ordered.forEach((point, pointIndex) => {
      if (pointIndex % stride !== 0 || !Number.isFinite(point.variance) || point.variance <= 0) return;
      const sigma = Math.sqrt(point.variance);
      const x = xFor(point.lambda);
      context.beginPath();
      context.moveTo(x, yFor(point.flux - sigma));
      context.lineTo(x, yFor(point.flux + sigma));
      context.stroke();
    });

    context.fillStyle = '#ff8ad8';
    for (const point of ordered) {
      if (point.flag === 0) continue;
      context.beginPath();
      context.arc(xFor(point.lambda), yFor(point.flux), 1.8, 0, Math.PI * 2);
      context.fill();
    }
  });

  const flagged = segments.reduce((sum, segment) => sum + (Number.isFinite(segment.flagged) ? segment.flagged : 0), 0);
  lab.spectrumSamples.textContent = `${points.length.toLocaleString()} SAMPLES · ${segments.length} SEGMENT${segments.length === 1 ? '' : 'S'}`;
  lab.spectrumCaption.textContent = `${segments.map(segment => segment.detector || 'detector').join(' · ')} · ${flagged} flagged sample${flagged === 1 ? '' : 's'} · each segment is drawn separately; gaps are not interpolated.`;
  if (!labState.spectrumError) {
    const cacheLabel = spectrum?.cache === 'HIT' ? 'cached archive response' : 'live archive response';
    lab.spectrumStatus.textContent = `${segments.length} detector segment${segments.length === 1 ? '' : 's'} · ${points.length.toLocaleString()} real samples · ${cacheLabel}.`;
  }

  if (firstProvenance) {
    lab.spectrumObsid.textContent = firstProvenance.observationId || frames[frameIndex]?.obsid || 'not in header';
    lab.spectrumDetectors.textContent = segments.map(segment => `${segment.detector || '—'} (${segment.points?.length || 0})`).join(' · ');
    lab.spectrumAperture.textContent = `${firstProvenance.aperture?.width || 5}-pixel row · ${firstProvenance.aperture?.samples || points.length} rows`;
    lab.spectrumAlgorithm.textContent = `${firstProvenance.method} · ${firstProvenance.algorithmVersion}`;
    lab.spectrumUnit.textContent = firstProvenance.units?.flux || fluxUnit;
    lab.spectrumFlags.textContent = `${flagged} / ${points.length}`;
    const measurementIds = segments.map(segment => segment.provenance?.measurementId).filter(Boolean);
    const skyLabel = labState.spectrumPick ? 'clicked WCS position' : firstProvenance.skySource === 'wcs' ? 'WCS aperture centre' : 'requested aperture centre';
    lab.spectrumProvenance.textContent = `${segments.length} segment measurement${segments.length === 1 ? '' : 's'} · ${measurementIds.length} versioned ID${measurementIds.length === 1 ? '' : 's'} · first ${firstProvenance.measurementId} · ${firstProvenance.uri} · ${skyLabel} ${Number(firstProvenance.sky?.ra).toFixed(5)}°, ${Number(firstProvenance.sky?.dec).toFixed(5)}° · cutout pixel ${firstProvenance.pixel?.x ?? '—'}, ${firstProvenance.pixel?.y ?? '—'} · ${firstProvenance.quality?.flags || 'FITS FLAGS bitmask'}.`;
  } else {
    lab.spectrumObsid.textContent = frames[frameIndex]?.obsid || '—';
    lab.spectrumDetectors.textContent = segments.map(segment => segment.detector || '—').join(' · ');
    lab.spectrumAperture.textContent = '5-pixel row';
    lab.spectrumAlgorithm.textContent = 'aperture extraction';
    lab.spectrumUnit.textContent = fluxUnit;
    lab.spectrumFlags.textContent = `${flagged} / ${points.length}`;
    lab.spectrumProvenance.textContent = 'This response did not include the versioned provenance object; the values above are still from the real archive cutout.';
  }
  updateSpectrumControls();
}

async function extractSpectrum(options = {}) {
  if (labState.spectrumLoading) {
    labState.spectrumToken += 1;
    labState.spectrumLoading = false;
  }
  const token = ++labState.spectrumToken;
  const frame = frames[frameIndex];
  if (!frame?.real || frame.mosaic) {
    clearSpectrumDisplay({ message: 'Load a real visit before extracting a spectrum.', status: 'Load a real visit before extracting a spectrum.' });
    return;
  }
  const uris = spectrumUrisFor(frame);
  if (!uris.length) {
    const message = 'This visit has no allowlisted IRSA product URI to extract.';
    clearSpectrumDisplay({ message, status: message, error: true });
    return;
  }
  const analysis = frame.analysis || frame.displayAnalysis;
  const pick = options.pick ?? labState.spectrumPick;
  const ra = Number(options.ra ?? pick?.ra ?? frame.ra ?? analysis?.ra);
  const dec = Number(options.dec ?? pick?.dec ?? frame.dec ?? analysis?.dec);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) {
    const message = 'The visit sky centre is not available yet.';
    clearSpectrumDisplay({ message, status: message, error: true });
    return;
  }

  const key = spectrumFrameKey(frame, pick);
  labState.spectrumLoading = true;
  labState.spectrumError = '';
  labState.spectrumKey = key;
  const where = pick
    ? `RA ${formatRaHms(ra)} · Dec ${formatDecDms(dec)}`
    : 'the field centre';
  const loading = `Extracting ${uris.length} real detector segment${uris.length === 1 ? '' : 's'} at ${where}…`;
  clearSpectrumDisplay({ message: loading, status: loading });
  updateSpectrumControls();
  try {
    const params = new URLSearchParams({ ra: String(ra), dec: String(dec), v: '2' });
    for (const item of uris) params.append('uri', item.uri);
    const response = await fetch(`/api/spherex/spectrum?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(90_000)
    });
    const payload = await response.json().catch(() => ({}));
    if (token !== labState.spectrumToken) return;
    if (!response.ok) throw new Error(payload.error || `Spectrum extraction returned ${response.status}.`);
    if (!Array.isArray(payload.segments) || !payload.segments.length) throw new Error('No real spectral segments were returned.');
    labState.spectrum = { ...payload, cache: response.headers.get('X-Cache') || '' };
    labState.spectrumKey = key;
    renderSpectrum();
    notify(`Extracted ${payload.segments.length} real detector segment${payload.segments.length === 1 ? '' : 's'} at ${where}.`);
  } catch (error) {
    if (token !== labState.spectrumToken) return;
    const failure = `Spectrum extraction failed: ${error.message}`;
    clearSpectrumDisplay({ message: failure, status: failure, error: true });
    notify(failure);
  } finally {
    if (token === labState.spectrumToken) {
      labState.spectrumLoading = false;
      updateSpectrumControls();
    }
  }
}

function updateSpectrumPanel() {
  const frame = frames[frameIndex];
  updateSpectrumControls();
  if (!frame?.real || frame.mosaic) {
    labState.spectrumToken += 1;
    labState.spectrumKey = '';
    clearSpectrumPick();
    clearSpectrumDisplay({ message: 'Load a real visit, then extract its aperture spectrum.', status: 'Load a real visit to extract its spectrum.' });
    return;
  }
  const fieldKey = spectrumFieldKey(frame);
  if (labState.spectrumPickMode && labState.spectrumPickFieldKey !== fieldKey) clearSpectrumPick();
  if (labState.spectrumPick && labState.spectrumPick.fieldKey !== fieldKey) clearSpectrumPick();
  const key = spectrumFrameKey(frame, labState.spectrumPick);
  if (labState.spectrumKey && labState.spectrumKey !== key) {
    labState.spectrumToken += 1;
    labState.spectrumKey = '';
    labState.spectrumLoading = false;
    clearSpectrumDisplay({ message: 'The visit changed; waiting for a new measurement.', status: 'The visit changed; waiting for a new measurement.' });
  }
  if (!labState.spectrum && !labState.spectrumLoading && !labState.spectrumError) void extractSpectrum();
  else renderSpectrum();
}

function updateDiscovery() {
  syncScanSelectors();
  drawLightCurve();
}

function addLabChoice(container, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'option-button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  container.append(button);
  return button;
}

function addLabFrameChoice(container, frame, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'option-button frame-option';
  button.dataset.frameKey = gameFrameKey(frame);
  const image = document.createElement('img');
  image.src = frame.objectUrl || frame.src;
  image.alt = `Real SPHEREx frame from ${frame.label}`;
  image.loading = 'lazy';
  image.addEventListener('error', () => image.remove());
  const label = document.createElement('span');
  label.textContent = gameVisitLabel(frame);
  button.append(image, label);
  button.addEventListener('click', onClick);
  container.append(button);
  return button;
}

function newLearnQuestion() {
  const data = labData();
  const questions = [];

  if (data.constellation) {
    const pool = ['Orion', 'Leo', 'Cygnus', 'Lyra', 'Taurus', 'Andromeda', 'Gemini', 'Virgo', 'Pegasus', 'Aquila', 'Bootes', 'Canis Major']
      .filter(name => name !== data.constellation);
    const options = shuffle([data.constellation, ...shuffle(pool).slice(0, 2)]);
    questions.push({
      question: 'Which constellation contains this cutout center?',
      options,
      correct: data.constellation,
      explanation: `The backend maps the WCS center to the IAU constellation ${data.constellation}.`
    });
  }

  if (data.band) {
    const detectors = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'].filter(name => name !== data.band);
    const options = shuffle([data.band, ...shuffle(detectors).slice(0, 2)]);
    questions.push({
      question: 'Which detector produced this frame?',
      options,
      correct: data.band,
      explanation: `This frame is labeled ${data.band} in its discovery and FITS metadata.`
    });
  }

  if (data.waveMin !== null && data.waveMax !== null && data.waveMax > data.waveMin) {
    const middle = (data.waveMin + data.waveMax) / 2;
    const options = [middle, data.waveMax + 0.2, Math.max(0.1, data.waveMin - 0.2)].map(value => `${value.toFixed(3)} μm`);
    questions.push({
      question: 'Which wavelength is inside this frame?',
      options: shuffle([...new Set(options)]),
      correct: `${middle.toFixed(3)} μm`,
      explanation: `The measured WCS-WAVE range is ${data.waveMin.toFixed(3)}–${data.waveMax.toFixed(3)} μm.`
    });
  }

  if (data.band) {
    const ordered = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
    const farther = ordered.filter(name => name !== data.band);
    questions.push({
      question: 'Which detector sees the longest infrared wavelengths?',
      options: shuffle(['D1', 'D4', 'D6']),
      correct: 'D6',
      explanation: 'D6 covers roughly 4.40–5.02 μm, the reddest end of the six SPHEREx bands.'
    });
    questions.push({
      question: 'Which detector is the closest match for this frame?',
      options: shuffle([data.band, ...shuffle(farther).slice(0, 2)]),
      correct: data.band,
      explanation: `The displayed visit is a real ${data.band} product; the FITS header confirms its measured wavelength range.`
    });
  }

  if (!questions.length) {
    labState.question = { needsData: true };
    lab.learnQuestion.textContent = 'Load real frames to start a lesson.';
    lab.learnOptions.replaceChildren();
    lab.learnFeedback.textContent = '';
    lab.learnNext.disabled = true;
    return;
  }

  const question = questions[Math.floor(Math.random() * questions.length)];
  labState.question = { ...question, needsData: false, answered: false };
  lab.learnQuestion.textContent = question.question;
  lab.learnOptions.replaceChildren();
  for (const option of question.options) {
    addLabChoice(lab.learnOptions, option, event => {
      if (!labState.question || labState.question.answered) return;
      labState.question.answered = true;
      const correct = option === question.correct;
      const buttons = [...lab.learnOptions.querySelectorAll('button')];
      for (const button of buttons) {
        button.disabled = true;
        if (button.textContent === question.correct) button.classList.add('correct');
      }
      event.currentTarget.classList.add(correct ? 'correct' : 'wrong');
      if (correct) {
        labState.learnScore += 1;
        lab.learnScore.textContent = `${labState.learnScore} correct`;
        lab.learnFeedback.textContent = `Correct. ${question.explanation}`;
        lab.learnFeedback.className = 'quiz-feedback correct-text';
      } else {
        lab.learnFeedback.textContent = `Not quite. ${question.explanation}`;
        lab.learnFeedback.className = 'quiz-feedback wrong-text';
      }
      lab.learnNext.disabled = false;
    });
  }
  lab.learnFeedback.textContent = '';
  lab.learnFeedback.className = 'quiz-feedback';
  lab.learnNext.disabled = true;
}

function newBrighterRound() {
  const pool = brighterGamePool();
  setGameSource(pool);
  const candidates = pool.frames.filter(frame => Number.isFinite(frame.analysis?.median));
  lab.brighterChoices.replaceChildren();
  lab.brighterFeedback.textContent = '';
  lab.brighterNext.disabled = true;
  if (candidates.length < 2) {
    lab.brighterChoices.innerHTML = `<p class="small muted">${gameEmptyMessage(pool, 'brighter')}</p>`;
    labState.brighter = null;
    return;
  }
  const sorted = [...candidates].sort((a, b) => a.analysis.median - b.analysis.median);
  const pairs = [];
  for (let index = 1; index < sorted.length; index += 1) {
    if (Math.abs(sorted[index].analysis.median - sorted[index - 1].analysis.median) > 1e-6) {
      pairs.push([sorted[index - 1], sorted[index]]);
    }
  }
  if (!pairs.length) {
    lab.brighterChoices.innerHTML = '<p class="small muted">These visits have the same median light. Load another visit to play.</p>';
    labState.brighter = null;
    return;
  }
  const pair = shuffle(pairs[Math.floor(Math.random() * pairs.length)]);
  const brighter = pair[0].analysis.median >= pair[1].analysis.median ? pair[0] : pair[1];
  labState.brighter = { pair, brighter, answered: false };
  for (const frame of pair) {
    addLabFrameChoice(lab.brighterChoices, frame, event => {
      if (!labState.brighter || labState.brighter.answered) return;
      labState.brighter.answered = true;
      const correct = frame === brighter;
      for (const button of lab.brighterChoices.querySelectorAll('button')) button.disabled = true;
      event.currentTarget.classList.add(correct ? 'correct' : 'wrong');
      const brighterButton = [...lab.brighterChoices.querySelectorAll('button')]
        .find(button => button.dataset.frameKey === gameFrameKey(brighter));
      brighterButton?.classList.add('correct');
      const labels = pair.map(item => `${gameVisitLabel(item)}: ${formatNumber(item.analysis.median)} MJy / sr`).join(' · ');
      lab.brighterFeedback.textContent = `${correct ? 'Correct.' : 'Not quite.'} ${labels}`;
      lab.brighterFeedback.className = `quiz-feedback ${correct ? 'correct-text' : 'wrong-text'}`;
      lab.brighterNext.disabled = false;
    });
  }
}

function newWaveRound() {
  const pool = measurementGamePool();
  setGameSource(pool);
  const candidates = pool.frames.filter(frame =>
    Number.isFinite(frame.analysis?.waveMin) &&
    Number.isFinite(frame.analysis?.waveMax) &&
    frame.analysis.waveMax > frame.analysis.waveMin
  );
  lab.waveChoices.replaceChildren();
  lab.waveFeedback.textContent = '';
  lab.waveNext.disabled = true;
  if (!candidates.length) {
    lab.wavePrompt.textContent = gameEmptyMessage(pool, 'wave');
    lab.waveChoices.innerHTML = '<p class="small muted">The game uses the real measured WCS-WAVE range.</p>';
    labState.wave = null;
    return;
  }
  const frame = candidates[Math.floor(Math.random() * candidates.length)];
  const data = frame.analysis;
  const middle = (data.waveMin + data.waveMax) / 2;
  const options = [...new Set([middle, data.waveMax + 0.2, Math.max(0.1, data.waveMin - 0.2)].map(value => `${value.toFixed(3)} μm`))];
  lab.wavePrompt.textContent = `Which wavelength falls inside the ${frame.detector || 'measured'} visit from ${frame.date || 'this field'}?`;
  labState.wave = { answered: false, correct: `${middle.toFixed(3)} μm`, min: data.waveMin, max: data.waveMax, frameKey: gameFrameKey(frame) };
  for (const option of shuffle(options)) {
    addLabChoice(lab.waveChoices, option, event => {
      if (!labState.wave || labState.wave.answered) return;
      labState.wave.answered = true;
      const correct = option === labState.wave.correct;
      const buttons = [...lab.waveChoices.querySelectorAll('button')];
      for (const button of buttons) button.disabled = true;
      event.currentTarget.classList.add(correct ? 'correct' : 'wrong');
      buttons.find(button => button.textContent === labState.wave.correct)?.classList.add('correct');
      lab.waveFeedback.textContent = `${correct ? 'Correct.' : 'Not quite.'} That ${frame.detector || 'visit'} visit spans ${data.waveMin.toFixed(3)}–${data.waveMax.toFixed(3)} μm.`;
      lab.waveFeedback.className = `quiz-feedback ${correct ? 'correct-text' : 'wrong-text'}`;
      lab.waveNext.disabled = false;
    });
  }
}

function newBandRound() {
  const pool = measurementGamePool();
  setGameSource(pool);
  const candidates = pool.frames.filter(frame => {
    const band = frame.band || frame.detector;
    return BAND_INFO[band] &&
      Number.isFinite(frame.analysis?.waveMin) &&
      Number.isFinite(frame.analysis?.waveMax) &&
      frame.analysis.waveMax > frame.analysis.waveMin;
  });
  lab.bandChoices.replaceChildren();
  lab.bandFeedback.textContent = '';
  lab.bandNext.disabled = true;
  if (!candidates.length) {
    lab.bandGamePrompt.textContent = gameEmptyMessage(pool, 'band');
    lab.bandChoices.innerHTML = '<p class="small muted">The game uses the real measured WCS-WAVE range.</p>';
    labState.band = null;
    return;
  }
  const frame = candidates[Math.floor(Math.random() * candidates.length)];
  const data = frame.analysis;
  const correct = frame.band || frame.detector;
  const middle = (data.waveMin + data.waveMax) / 2;
  lab.bandGamePrompt.textContent = `A real frame measures ${middle.toFixed(3)} μm. Which detector is it?`;
  const otherBands = shuffle(Object.keys(BAND_INFO).filter(band => band !== correct)).slice(0, 2);
  labState.band = { correct, answered: false, frameKey: gameFrameKey(frame) };
  for (const option of shuffle([correct, ...otherBands])) {
    addLabChoice(lab.bandChoices, `${option} · ${BAND_INFO[option].low.toFixed(2)}–${BAND_INFO[option].high.toFixed(2)} μm`, event => {
      if (!labState.band || labState.band.answered) return;
      labState.band.answered = true;
      const isCorrect = option === correct;
      for (const button of lab.bandChoices.querySelectorAll('button')) button.disabled = true;
      event.currentTarget.classList.add(isCorrect ? 'correct' : 'wrong');
      if (isCorrect) labState.bandScore += 1;
      lab.bandGameScore.textContent = `GAME 03 · ${labState.bandScore} ${labState.bandScore === 1 ? 'pt' : 'pts'}`;
      lab.bandFeedback.textContent = `${isCorrect ? 'Correct.' : 'Not quite.'} The visit is ${correct}; its measured range is ${data.waveMin.toFixed(3)}–${data.waveMax.toFixed(3)} μm.`;
      lab.bandFeedback.className = `quiz-feedback ${isCorrect ? 'correct-text' : 'wrong-text'}`;
      lab.bandNext.disabled = false;
    });
  }
}

async function copyMail() {
  if (!frames[frameIndex]) {
    lab.mailStatus.textContent = 'Load real frames before copying an observation.';
    return;
  }
  const content = buildMailContent();
  const note = lab.mailNote.value.trim();
  const text = note ? `${note}\n\n${content.text}` : content.text;
  try {
    await navigator.clipboard.writeText(text);
    lab.mailStatus.textContent = 'Observation email copied to the clipboard.';
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    lab.mailStatus.textContent = 'Observation email copied to the clipboard.';
  }
}

function openMail() {
  const data = labData();
  if (!data.frame) {
    lab.mailStatus.textContent = 'Load real frames before mailing an observation.';
    return;
  }
  const content = buildMailContent(data);
  const note = lab.mailNote.value.trim();
  const body = note ? `${note}\n\n${content.text}` : content.text;
  const recipient = lab.mailTo.value.trim();
  window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(content.subject)}&body=${encodeURIComponent(body)}`;
  lab.mailStatus.textContent = 'Opening your mail app with this observation. Review it there before sending.';
}

function initLab() {
  for (const tab of lab.tabs) tab.addEventListener('click', () => setLabTab(tab.dataset.labTab));
  lab.shortcut.addEventListener('click', () => {
    setLabTab('mail');
    $('lab').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  lab.mailOpen.addEventListener('click', openMail);
  lab.mailCopy.addEventListener('click', copyMail);
  lab.learnNext.addEventListener('click', newLearnQuestion);
  lab.brighterNext.addEventListener('click', newBrighterRound);
  lab.waveNext.addEventListener('click', newWaveRound);
  lab.bandNext.addEventListener('click', newBandRound);
  lab.pickSpectrum.addEventListener('click', toggleSpectrumPick);
  lab.extractSpectrum.addEventListener('click', () => {
    clearSpectrumPick();
    labState.spectrum = null;
    labState.spectrumKey = '';
    labState.spectrumError = '';
    void extractSpectrum();
  });
  lab.runDiscovery.addEventListener('click', runDiscoveryScan);
  lab.swapScan.addEventListener('click', () => {
    const first = lab.scanFrameA.value;
    lab.scanFrameA.value = lab.scanFrameB.value;
    lab.scanFrameB.value = first;
    lab.discoveryStatus.textContent = 'Visits swapped; run the scan to compare the new order.';
  });
  for (const selector of [lab.scanFrameA, lab.scanFrameB]) {
    selector.addEventListener('change', () => {
      lab.discoveryStatus.textContent = 'Ready: run the scan to compare this pair.';
    });
  }
  lab.discoveryCanvas.addEventListener('click', event => {
    if (!labState.candidates.length) return;
    const rect = lab.discoveryCanvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * lab.discoveryCanvas.width / rect.width;
    const y = (event.clientY - rect.top) * lab.discoveryCanvas.height / rect.height;
    const nearest = labState.candidates
      .map((candidate, index) => ({ candidate, index, distance: Math.hypot(candidate.x - x, candidate.y - y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance < 16) navigateToField({ ra: nearest.candidate.ra, dec: nearest.candidate.dec, fov: Number(el.fov.value) }, `Candidate ${nearest.index + 1}`);
  });
  lab.lightCurve.addEventListener('click', event => {
    if (!labState.lightPoints.length) return;
    const rect = lab.lightCurve.getBoundingClientRect();
    const x = (event.clientX - rect.left) * lab.lightCurve.width / rect.width;
    const y = (event.clientY - rect.top) * lab.lightCurve.height / rect.height;
    const nearest = labState.lightPoints
      .map(point => ({ point, distance: Math.hypot(point.x - x, point.y - y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance < 34) {
      stopPlayback();
      frameIndex = nearest.point.index;
      render();
    }
  });
  setLabTab('wavelength');
  newLearnQuestion();
  newBrighterRound();
  newWaveRound();
  newBandRound();
  loadGameArchive();
  updateDiscovery();
}

const bootParams = new URLSearchParams(window.location.search);
// Only an explicit app=1 opens the focus-mode shell. Target and coordinate
// links stay on the main page so the automatic first observation, section
// navigation and guided controls remain visible on refresh.
const shouldOpenMapApp = bootParams.get('app') === '1';
if (shouldOpenMapApp) document.body.classList.add('map-app');
applyMode(storedMode());
for (const button of document.querySelectorAll('[data-open-lab]')) {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    openSection(['wavelength', 'spectrum'].includes(button.dataset.openLab) ? 'analyse' : button.dataset.openLab);
  });
}
document.querySelector('[data-section="explore"]')?.addEventListener('click', (event) => {
  event.preventDefault();
  openSection('explore');
});
el.explorerMode?.addEventListener('click', () => applyMode('explorer', { persist: true }));
el.researchMode?.addEventListener('click', () => applyMode('research', { persist: true }));
el.startHere?.addEventListener('click', startFirstObservation);
restoreFromUrl();
syncQuickFilters();
syncQuickTime();
initLab();
initAllSkyMap();
render();
loadRealFrames();
loadSourceHealth();
if (shouldOpenMapApp) enterMapApp({ quiet: true });

// A short, dismissible walkthrough for the controls that matter. It is
// deliberately independent of the viewer state so it can teach the app
// without changing what the archive returns.
const TOUR_KEY = 'drift-quick-tour-v1';
const tour = {
  root: $('tourRoot'), card: $('tourCard'), scrim: $('tourScrim'), spotlight: $('tourSpotlight'),
  stepLabel: $('tourStepLabel'), title: $('tourTitle'), copy: $('tourCopy'), dots: $('tourDots'),
  back: $('tourBack'), next: $('tourNext'), close: $('tourClose')
};
let tourOpen = false;
let tourIndex = 0;
let tourReturnFocus = null;
let tourPositioned = false;

function tourSeen() {
  try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return false; }
}
function markTourSeen() {
  try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* storage can be unavailable in private modes */ }
}
function tourSteps() {
  return [
    {
      target: '.viewer-title-block',
      title: 'A real sky, not a mock-up',
      copy: 'Every frame is a live cutout from IRSA’s SPHEREx archive. Drag to pan, scroll to zoom, and double-click to recenter. The date and detector under the title belong to the visit on screen.'
    },
    {
      target: '#quickTimeline',
      title: 'Scrub through the visits',
      copy: 'This patch holds several real observation dates. Drag the timeline, use the arrows, or open Visit to jump straight to one. Your zoom and position stay put while the sky changes.'
    },
    {
      target: '#quickPlay',
      title: 'Let the sequence move',
      copy: 'Press play to run the visits like a short film. Space does the same thing. If 1× feels too quick, open Compare and slow it down.'
    },
    {
      target: appIsActive() ? '#appSequence' : '#blink',
      title: 'Now compare what changed',
      copy: appIsActive()
        ? 'Open Compare. Choose A and B, then use Blink to flip between them or Difference to subtract them. Side by side puts both visits next to each other.'
        : 'Choose two visits, then use Blink to flip between them or Difference to subtract them. Side by side puts both visits next to each other.'
    },
    {
      target: '.section-links [data-open-lab="discover"]',
      title: 'Go from watching to discovering',
      copy: 'Discover compares two real visits, ranks the strongest pixel residuals and plots the light curve. Switch between Explorer and Research at the top whenever you want more instrumentation.'
    }
  ];
}

function positionTour() {
  if (!tourOpen || !tour.root) return;
  const step = tourSteps()[tourIndex];
  const target = step?.target ? document.querySelector(step.target) : null;
  const rect = target && target.getClientRects().length ? target.getBoundingClientRect() : null;
  const hasTarget = Boolean(rect && rect.width > 1 && rect.height > 1);
  const card = tour.card;
  const mobile = window.innerWidth <= 720;
  tour.root.classList.toggle('has-spotlight', hasTarget);
  tour.spotlight.hidden = !hasTarget;

  if (!tourPositioned) tour.spotlight.style.transition = 'none';
  if (hasTarget) {
    const pad = 7;
    tour.spotlight.style.left = `${Math.max(4, rect.left - pad)}px`;
    tour.spotlight.style.top = `${Math.max(4, rect.top - pad)}px`;
    tour.spotlight.style.width = `${Math.min(window.innerWidth - 8, rect.width + pad * 2)}px`;
    tour.spotlight.style.height = `${Math.min(window.innerHeight - 8, rect.height + pad * 2)}px`;
  }
  if (!tourPositioned) requestAnimationFrame(() => {
    tourPositioned = true;
    if (tourOpen) tour.spotlight.style.transition = '';
  });

  const cardWidth = card.offsetWidth || 360;
  const cardHeight = card.offsetHeight || 260;
  card.style.right = 'auto';
  card.style.bottom = 'auto';
  card.style.top = 'auto';
  card.style.left = 'auto';

  if (mobile) {
    card.style.left = '12px';
    card.style.right = '12px';
    if (hasTarget && rect.top + rect.height / 2 > window.innerHeight / 2) card.style.top = '12px';
    else card.style.bottom = '12px';
    return;
  }

  if (!hasTarget) {
    card.style.left = `${Math.max(12, (window.innerWidth - cardWidth) / 2)}px`;
    card.style.top = `${Math.max(12, (window.innerHeight - cardHeight) / 2)}px`;
    return;
  }

  const gap = 18;
  const rightSpace = window.innerWidth - rect.right;
  const leftSpace = rect.left;
  let left;
  let top;
  if (rightSpace >= cardWidth + gap) {
    left = rect.right + gap;
    top = rect.top + (rect.height - cardHeight) / 2;
  } else if (leftSpace >= cardWidth + gap) {
    left = rect.left - cardWidth - gap;
    top = rect.top + (rect.height - cardHeight) / 2;
  } else {
    left = rect.left + (rect.width - cardWidth) / 2;
    const below = window.innerHeight - rect.bottom;
    top = below >= cardHeight + gap
      ? rect.bottom + gap
      : rect.top - cardHeight - gap;
  }
  card.style.left = `${Math.max(12, Math.min(window.innerWidth - cardWidth - 12, left))}px`;
  card.style.top = `${Math.max(12, Math.min(window.innerHeight - cardHeight - 12, top))}px`;
}

function showTourStep(index) {
  const steps = tourSteps();
  tourIndex = Math.max(0, Math.min(steps.length - 1, index));
  const step = steps[tourIndex];
  tour.stepLabel.textContent = `${String(tourIndex + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`;
  tour.title.textContent = step.title;
  tour.copy.textContent = step.copy;
  tour.back.disabled = tourIndex === 0;
  tour.next.textContent = tourIndex === steps.length - 1 ? 'Start exploring' : 'Next →';
  tour.dots.replaceChildren();
  steps.forEach((_, dotIndex) => {
    const dot = document.createElement('span');
    dot.className = dotIndex === tourIndex ? 'active' : '';
    tour.dots.append(dot);
  });
  tour.card.classList.remove('tour-card-enter');
  void tour.card.offsetWidth;
  tour.card.classList.add('tour-card-enter');
  positionTour();
  requestAnimationFrame(positionTour);
}

function startTour({ force = false } = {}) {
  if (tourOpen) return;
  if (!force && tourSeen()) return;
  tourPositioned = false;
  if (appIsActive()) closeAppSheets();
  else document.getElementById('explorer')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  tourOpen = true;
  tourReturnFocus = document.activeElement;
  document.body.classList.add('tour-open');
  tour.root.hidden = false;
  showTourStep(0);
  window.addEventListener('resize', positionTour);
  tour.next.focus({ preventScroll: true });
}

function endTour() {
  if (!tourOpen) return;
  tourOpen = false;
  tourPositioned = false;
  markTourSeen();
  tour.root.hidden = true;
  document.body.classList.remove('tour-open');
  window.removeEventListener('resize', positionTour);
  if (tourReturnFocus && typeof tourReturnFocus.focus === 'function') tourReturnFocus.focus({ preventScroll: true });
}

for (const button of [$('tourButton'), $('appTour')]) {
  button?.addEventListener('click', () => startTour({ force: true }));
}
tour.close?.addEventListener('click', endTour);
tour.back?.addEventListener('click', () => showTourStep(tourIndex - 1));
tour.next?.addEventListener('click', () => {
  if (tourIndex >= tourSteps().length - 1) endTour();
  else showTourStep(tourIndex + 1);
});

function isTypingTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

document.addEventListener('keydown', event => {
  if (tourOpen) {
    if (event.key === 'Escape') { event.preventDefault(); endTour(); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); if (tourIndex < tourSteps().length - 1) showTourStep(tourIndex + 1); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); if (tourIndex > 0) showTourStep(tourIndex - 1); return; }
    if (event.key === 'Tab') {
      const buttons = [...tour.card.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
  const key = event.key.toLowerCase();
  if (key === '?') { event.preventDefault(); startTour({ force: true }); return; }
  if (event.repeat) return;
  if (key === ' ') {
    if (event.target.closest?.('button, a, summary')) return;
    event.preventDefault();
    togglePlay();
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    nextFrame();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    previousFrame();
  } else if (key === 'b') {
    event.preventDefault();
    toggleBlink();
  } else if (key === 'd') {
    event.preventDefault();
    toggleDifference();
  }
});

const tourParam = bootParams.get('tour');
if (tourParam === '1') setTimeout(() => startTour({ force: true }), 450);
if (!location.hash && !appIsActive()) {
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
}
