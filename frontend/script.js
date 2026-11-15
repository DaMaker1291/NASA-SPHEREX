// SPHEREx Explorer frontend.
// Real IRSA frames are loaded through the same-origin backend. Local PNGs stay local.
const $ = (id) => document.getElementById(id);
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const el = {
  target: $('target'), ra: $('ra'), dec: $('dec'), fov: $('fov'), detector: $('detector'), bandHint: $('bandHint'),
  loadReal: $('loadReal'), emptyReal: $('emptyReal'), sourceLabel: $('sourceLabel'),
  targetMeta: $('targetMeta'), fieldMeta: $('fieldMeta'), fieldConstellation: $('fieldConstellation'),
  speed: $('frameSpeed'), speedValue: $('speedValue'),
  crosshairCheck: $('showCrosshair'), crosshair: $('crosshair'),
  stage: $('viewerStage'), transform: $('imageTransform'), image: $('skyImage'),
  differenceCanvas: $('differenceCanvas'), difference: $('difference'),
  empty: $('emptyState'), emptyEyebrow: $('emptyEyebrow'), emptyTitle: $('emptyTitle'), emptyMessage: $('emptyMessage'),
  stageLoading: $('stageLoading'), stageBadge: $('stageBadge'), viewerTitle: $('viewerTitle'),
  stageDate: $('stageDate'), stageMode: $('stageMode'), filmstrip: $('filmstrip'),
  zoomIn: $('zoomIn'), zoomOut: $('zoomOut'), zoomNative: $('zoomNative'), resetView: $('resetView'), zoomLevel: $('zoomLevel'), copyLink: $('copyLink'),
  hdToggle: $('hdToggle'), hdToggleLab: $('hdToggleLab'), stageResolution: $('stageResolution'), fullscreen: $('fullscreen'),
  mapSearchForm: $('mapSearchForm'), mapSearch: $('mapSearch'), navBack: $('navBack'), navForward: $('navForward'), minimapToggle: $('minimapToggle'),
  skyMinimapWrap: $('skyMinimapWrap'), skyMinimap: $('skyMinimap'), minimapField: $('minimapField'),
  mapCursor: $('mapCursor'), mapScaleBar: $('mapScaleBar'), mapScaleText: $('mapScaleText'), mapCompass: $('mapCompass'), mapHelp: $('mapHelp'),
  paletteSelect: $('paletteSelect'), stretchSelect: $('stretchSelect'), sharpPixels: $('sharpPixels'),
  bandRail: $('bandRail'), wavelengthBandName: $('wavelengthBandName'), wavelengthRange: $('wavelengthRange'),
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
  frameA: $('frameA'), frameB: $('frameB'), blink: $('blink'), showCompare: $('showCompare'),
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
  detailExposure: $('detailExposure'), detailPixelScale: $('detailPixelScale'), toast: $('toast')
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
let zoom = 1, panX = 0, panY = 0;
let detector = 'D2', palette = 'iridescent', stretch = 'asinh', hdMode = false;
const activePointers = new Map();
let singleGesture = null, pinchGesture = null;
const navHistory = [];
let navIndex = -1;
let minimapPointer = null;
let constellationRequest = 0, constellationData = null;
let ownedObjectUrls = [];
let toastTimeout = null, loadingReal = false, sky = null, realBadge = 'LIVE IRSA • REAL FITS';

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
  setTarget('spherex', false);
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

function releaseImages() {
  ownedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  ownedObjectUrls = [];
}

function stopPlayback() {
  clearInterval(interval); interval = null; blinkMode = false;
  el.play.textContent = '▶ Play sequence';
  el.blink.textContent = 'Blink A / B';
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
  el.detailSource.textContent = frame.real ? 'IRSA SPHEREx DR1' : 'Local PNG files';
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
    el.fieldMeta.textContent = `${coordinateText(frameRa, frameDec)} · ${hdMode && frame.hdObjectUrl ? 'wide 0.90° window' : `${frame.fov ?? Number(el.fov.value).toFixed(2)}° field`}`;
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

function updateBandUI() {
  const frame = frames[frameIndex];
  const analysis = frame?.analysis || frame?.displayAnalysis;
  const info = BAND_INFO[detector] || BAND_INFO.D2;
  el.wavelengthBandName.textContent = `${detector} · ${info.low.toFixed(3)}–${info.high.toFixed(3)} μm`;
  el.wavelengthRange.textContent = analysis && Number.isFinite(analysis.waveMin)
    ? `${analysis.waveMin.toFixed(3)}–${analysis.waveMax.toFixed(3)} μm`
    : 'Load a real frame';
  el.wavelengthBandwidth.textContent = analysis && Number.isFinite(analysis.waveBwMin)
    ? `${analysis.waveBwMin.toFixed(3)}–${analysis.waveBwMax.toFixed(3)} μm`
    : '—';
  el.wavelengthPixelScale.textContent = analysis && Number.isFinite(analysis.pixelScale)
    ? `${analysis.pixelScale.toFixed(2)}″ / px`
    : '—';
  el.wavelengthFrames.textContent = frames.filter(item => item.real).length
    ? `${frames.length} · ${detector}`
    : '0';
  el.bandSummary.textContent = `IRSA returned ${frames.length || 0} real ${detector} visits for this field. The measured range comes from the FITS WCS-WAVE table.`;
  for (const chip of el.bandRail.querySelectorAll('[data-band]')) {
    chip.classList.toggle('active', chip.dataset.band === detector);
    chip.setAttribute('aria-pressed', String(chip.dataset.band === detector));
  }
  el.detector.value = detector;
  updateHDControls();
}

function setBand(value, shouldReload = true) {
  if (!BAND_INFO[value]) return;
  detector = value;
  updateBandUI();
  if (shouldReload && frames.some(frame => frame.real)) loadRealFrames();
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

function angularSeparation(ra1, dec1, ra2, dec2) {
  if (![ra1, dec1, ra2, dec2].every(Number.isFinite)) return null;
  const rad = Math.PI / 180;
  const a = Math.sin((dec2 - dec1) * rad / 2) ** 2 +
    Math.cos(dec1 * rad) * Math.cos(dec2 * rad) * Math.sin((ra2 - ra1) * rad / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a))) / rad;
}

// Sky navigation: map-like zoom, pan, point-to-sky conversion and history.
function normalizeRa(ra) {
  return ((ra % 360) + 360) % 360;
}

function unwrapRa(ra, reference) {
  let value = ra;
  while (value - reference > 180) value -= 360;
  while (value - reference < -180) value += 360;
  return value;
}

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
    if (skyPoint) return { ...skyPoint, exact: true };
  }
  const center = currentSkyCenter();
  const fov = Number(frame.fov) || Number(el.fov.value) || 0.3;
  const cosDec = Math.max(0.08, Math.cos(center.dec * Math.PI / 180));
  return {
    ra: normalizeRa(center.ra - (fractionX - 0.5) * fov / cosDec),
    dec: Math.max(-90, Math.min(90, center.dec + (0.5 - fractionY) * fov)),
    exact: false
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

function drawMinimap() {
  const canvas = el.skyMinimap;
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#050b13';
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

function updateMapUI() {
  updateMapScale();
  updateCompass();
  updateMapCenter();
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
        setVerificationGaia('unavailable', `Gaia DR3 could not be reached (${error.message}). Not counted as an agreement.`);
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
  const checks = [];
  const siaDate = frame.date || '';
  const fitsDate = analysis?.dateAvg ? analysis.dateAvg.slice(0, 10) : '';
  checks.push({
    state: fitsDate && siaDate === fitsDate ? 'verified' : fitsDate ? 'note' : 'pending',
    title: 'Visit date agrees',
    detail: fitsDate
      ? `SIA2 ${siaDate || '—'} · FITS DATE-AVG ${fitsDate}`
      : 'FITS DATE-AVG has not arrived yet.'
  });
  const fitsDetector = analysis?.detector || analysis?.band || '';
  const normalizeDetector = value => String(value || '').replace(/^D/i, '');
  checks.push({
    state: fitsDetector ? normalizeDetector(fitsDetector) === normalizeDetector(frame.detector) ? 'verified' : 'note' : 'pending',
    title: 'Detector agrees',
    detail: fitsDetector ? `SIA2 ${frame.detector} · FITS detector ${fitsDetector}` : 'FITS DETECTOR header not available.'
  });
  const idMatch = analysis?.obsid && frame.obsid
    ? analysis.obsid === frame.obsid || analysis.obsid.includes(frame.obsid) || frame.obsid.includes(analysis.obsid)
    : null;
  checks.push({
    state: idMatch === null ? 'pending' : idMatch ? 'verified' : 'note',
    title: 'Observation identity agrees',
    detail: analysis?.obsid ? `SIA2 ${frame.obsid || '—'} · FITS ${analysis.obsid}` : 'FITS OBSID header not available.'
  });
  const separation = angularSeparation(Number(frame.ra), Number(frame.dec), analysis?.ra, analysis?.dec);
  checks.push({
    state: separation === null ? 'pending' : separation < 0.02 ? 'verified' : 'note',
    title: 'WCS centre is inside the requested field',
    detail: separation === null ? 'Waiting for the cutout WCS centre.' : `${separation.toFixed(3)}° from the requested centre.`
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
  el.verificationScore.textContent = `${verified} / ${available} checks agree`;
  el.verificationScore.className = `verify-score ${verified === available && available ? 'good' : available ? 'mixed' : ''}`;
  for (const check of checks) el.verificationList.append(verificationRow(check));
  el.verifySourceSia.textContent = frame.sourceLabel || 'IRSA SIA2 · SPHEREx DR1';
  el.verifySiaDetail.textContent = `${frame.date || '—'} · ${frame.detector} · ${frame.obsid || 'OBSID pending'}`;
  el.verifySourceFits.textContent = analysis ? 'IRSA FITS cutout' : 'IRSA FITS cutout · pending';
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
      sia2: { label: frame.sourceLabel || 'IRSA SIA2 · SPHEREx DR1', detail: `${frame.date || '—'} · ${frame.detector || '—'} · ${frame.obsid || '—'}` },
      fits: { label: 'IRSA FITS cutout', detail: `${frame.uri || '—'}` },
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

async function loadFrameData(frame) {
  if (frame.loading || frame.objectUrl) return;
  frame.loading = true;
  try {
    let response;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetchWithTimeout(frame.src, { headers: { Accept: 'image/png' } }, 45_000);
      if (response.ok || ![429, 503, 504].includes(response.status) || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
    }
    if (!response?.ok) throw new Error(`FITS frame returned ${response?.status ?? 'no response'}.`);
    const analysis = readFrameHeaders(response);
    const bytes = await response.arrayBuffer();
    if (!frames.includes(frame)) return;
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      frame.sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      frame.sha256 = '';
    }
    const blob = new Blob([bytes], { type: 'image/png' });
    const objectUrl = URL.createObjectURL(blob);
    ownedObjectUrls.push(objectUrl);
    if (Number.isFinite(analysis.width) && analysis.width > 0) frame.width = analysis.width;
    if (Number.isFinite(analysis.height) && analysis.height > 0) frame.height = analysis.height;
    frame.objectUrl = objectUrl;
    frame.src = objectUrl;
    frame.loadError = '';
    if (frame.thumbImg) frame.thumbImg.src = objectUrl;
    frame.displayAnalysis = analysis;
    if (analysis.measured) {
      frame.analysis = analysis;
      frame.measurementError = '';
    } else {
      frame.analysis = null;
      frame.measurementError = 'FITS measurement headers were not returned.';
    }
    maybePrunePartialFrames();
    updateBandUI();
    updateVerification();
    if (frames[frameIndex] === frame) render();
    else updateLab();
  } catch (error) {
    if (frames.includes(frame)) {
      frame.analysis = null;
      frame.measurementError = error.message;
      frame.loadError = error.message;
      if (frames[frameIndex] === frame) render();
      else updateLab();
    }
    notify(`Could not measure that FITS frame: ${error.message}`);
  } finally {
    frame.loading = false;
  }
}

async function loadFrameSet(list) {
  const queue = [...list];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const frame = queue.shift();
      if (frame) await loadFrameData(frame);
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
  for (const selector of [el.frameA, el.frameB]) {
    selector.replaceChildren();
    frames.forEach((frame, index) => selector.add(new Option(`${index + 1}. ${frame.label}`, index)));
  }
  el.frameA.value = '0';
  el.frameB.value = String(Math.min(1, frames.length - 1));
  el.sourceLabel.textContent = el.sourceLabel.textContent.replace(/^\d+ real visits/, `${frames.length} real visits`);
  buildFilmstrip();
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
    image.src = frame.objectUrl || (frame.real ? TRANSPARENT_PIXEL : frame.src);
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

function setLoading(isLoading) {
  loadingReal = isLoading;
  const current = frames[frameIndex];
  el.stageLoading.hidden = isLoading ? false : !(current?.real && !current.objectUrl && !current.loadError);
  el.loadReal.disabled = isLoading;
  el.emptyReal.disabled = isLoading;
  el.loadReal.textContent = isLoading ? 'Finding real visits…' : 'Show this sky sequence';
}

function loadFrames(newFrames, source, badge = 'LIVE IRSA • REAL FITS') {
  stopPlayback(); releaseImages();
  frames = newFrames; frameIndex = 0; comparisonOpen = false; realBadge = badge;
  hdMode = false; updateHDControls();
  el.compareGrid.hidden = true; el.showCompare.textContent = 'Side by side';
  el.sourceLabel.textContent = source;
  el.timeline.max = String(Math.max(0, frames.length - 1));
  for (const selector of [el.frameA, el.frameB]) {
    selector.replaceChildren();
    frames.forEach((frame, index) => selector.add(new Option(`${index + 1}. ${frame.label}`, index)));
  }
  el.frameA.value = '0'; el.frameB.value = String(Math.min(1, frames.length - 1));
  const enabled = frames.length > 0;
  for (const item of [el.timeline, el.previous, el.next, el.play, el.frameA, el.frameB, el.blink, el.showCompare, el.difference, el.speed]) {
    item.disabled = !enabled;
  }
  el.empty.hidden = enabled;
  el.stageBadge.hidden = !frames.some(f => f.real);
  el.stageBadge.textContent = realBadge;
  buildFilmstrip();
  resetView(); render();
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

async function loadRealFrames(options = {}) {
  if (loadingReal) return;
  const record = options?.record !== false;
  let field;
  try { field = readField(); } catch (error) { notify(error.message); return; }

  setLoading(true);
  if (frames.length) loadFrames([], 'Loading this patch…');
  el.empty.hidden = true;
  el.sourceLabel.classList.remove('error');
  el.sourceLabel.textContent = 'Querying IRSA SIA2 for real visits…';
  notify('Finding real SPHEREx visits for this patch.');
  try {
    const params = new URLSearchParams({
      ra: String(field.ra), dec: String(field.dec), fov: String(field.fov), limit: '8', v: '10',
      detector, palette, stretch
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    let response;
    try {
      response = await fetch(`/api/spherex/frames?${params.toString()}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `IRSA frame discovery returned ${response.status}.`);
    if (!Array.isArray(payload.frames) || !payload.frames.length) throw new Error('IRSA returned no real products for this field.');

    detector = payload.detector || detector;
    el.detector.value = detector;
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
      ra: payload.field?.ra ?? field.ra,
      dec: payload.field?.dec ?? field.dec,
      analysis: null,
      measurementError: null,
      sourceLabel: payload.source?.label || 'IRSA SIA2 · SPHEREx DR1',
      real: true
    }));
    sky = payload.sky || null;
    const badge = /bundled|last known|fallback|last-good|cached/i.test(payload.source?.label || '')
      ? 'CACHED IRSA · REAL FITS'
      : 'LIVE IRSA · REAL FITS';
    const span = payload.summary?.spanDays;
    const spanText = Number.isFinite(span) && span > 0 ? ` across ${span.toFixed(1)} days` : '';
    loadFrames(realFrames, `${realFrames.length} real visits · ${payload.detector} detector${spanText}`, badge);
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
    el.stageLoading.hidden = true;
    el.sourceLabel.textContent = `IRSA unavailable: ${error.message}`;
    el.sourceLabel.classList.add('error');
    if (!frames.length) {
      el.empty.hidden = false;
      setEmptyState('ARCHIVE NOT AVAILABLE', 'IRSA is not answering', `${error.message} The archive can be busy; try again in a moment or choose another field.`);
    }
    notify(`IRSA request failed: ${error.message}`);
  } finally {
    setLoading(false);
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
  const enabled = Boolean(current?.real);
  for (const button of [el.hdToggle, el.hdToggleLab]) {
    if (!button) continue;
    button.disabled = !enabled;
    button.textContent = hdMode ? 'Standard window' : 'Wide 0.90° window';
    button.classList.toggle('active', hdMode);
  }
}

function toggleHD() {
  const current = frames[frameIndex];
  if (!current?.real) { notify('Load a real IRSA frame before opening the wide window.'); return; }
  hdMode = !hdMode;
  updateHDControls();
  if (hdMode) loadHDFrame(current);
  render();
}

function render() {
  const f = frames[frameIndex];
  if (!f) {
    el.image.hidden = true; el.differenceCanvas.hidden = true; el.empty.hidden = false;
    drawMinimap();
    updateMapCenter();
    el.frameLabel.textContent = 'No images loaded'; el.frameCount.textContent = '0 / 0';
    el.stageDate.textContent = 'No visit loaded';
    el.stageMode.textContent = 'LIVE FRAME';
    el.crosshair.hidden = true;
    updateDetails(null);
    updateLab();
    return;
  }
  el.empty.hidden = true;
  const useHd = hdMode && Boolean(f.hdObjectUrl) && !differenceMode;
  const stageSrc = useHd ? f.hdObjectUrl : f.objectUrl || (f.real ? TRANSPARENT_PIXEL : f.src);
  if ((!differenceMode || !el.differenceCanvas.width) && el.image.src !== new URL(stageSrc, window.location.href).href) el.image.src = stageSrc;
  if (hdMode && f.real && !f.hdObjectUrl && !f.hdLoading) loadHDFrame(f);
  if (!f.width) el.stageLoading.hidden = Boolean(f.loadError);
  el.stageResolution.textContent = useHd
    ? `WIDE ${f.hdWidth || 490} PX`
    : hdMode && f.hdLoading ? 'FETCHING WIDE…'
      : f.width ? `${f.width} PX NATIVE` : 'NATIVE CUTOUT';
  el.image.classList.toggle('pixelated', Boolean(el.sharpPixels?.checked) && zoom > 1.05);
  updateHDControls();
  el.image.onload = () => {
    el.stageLoading.hidden = true;
    if (!f.width) { f.width = el.image.naturalWidth; f.height = el.image.naturalHeight; }
    if (frames[frameIndex] === f) { updateDetails(f); updateTransform(); drawMinimap(); }
  };
  el.image.onerror = () => { el.stageLoading.hidden = true; notify('That IRSA FITS cutout could not be loaded as a PNG.'); };
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
  updateMapCenter();
}

function nextFrame() { if (!frames.length) return; if (differenceMode) clearDifference(); frameIndex = (frameIndex + 1) % frames.length; render(); }
function previousFrame() { if (!frames.length) return; if (differenceMode) clearDifference(); frameIndex = (frameIndex - 1 + frames.length) % frames.length; render(); }
function playbackDelay() { return Number(el.speed.value); }

function startPlayback() {
  if (frames.length < 2) { notify('Load at least 2 frames to animate.'); return; }
  stopPlayback(); el.play.textContent = '⏸ Pause';
  interval = setInterval(nextFrame, playbackDelay());
}
function togglePlay() { if (interval && !blinkMode) { stopPlayback(); return; } startPlayback(); }

function renderComparisonFrame(frame, imageEl, labelEl) {
  labelEl.textContent = frame.label;
  imageEl.src = frame.src;
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
  if (comparisonOpen) renderComparison();
}
function toggleBlink() {
  if (blinkMode) { stopPlayback(); return; }
  if (frames.length < 2) { notify('Load at least 2 frames to blink.'); return; }
  stopPlayback(); blinkMode = true; el.blink.textContent = 'Stop blinking';
  let showA = true;
  function tick() { frameIndex = Number(showA ? el.frameA.value : el.frameB.value); showA = !showA; render(); }
  tick(); interval = setInterval(tick, playbackDelay());
}

function clearDifference() {
  differenceToken += 1;
  differenceMode = false;
  el.differenceCanvas.hidden = true;
  el.difference.classList.remove('active');
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
  const token = ++differenceToken;
  try {
    const [imageA, imageB] = await Promise.all([loadImage(a.src), loadImage(b.src)]);
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
    document.getElementById('explorer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
el.loadReal.addEventListener('click', loadRealFrames);
el.emptyReal.addEventListener('click', loadRealFrames);
el.receiptDownload?.addEventListener('click', downloadVerificationReceipt);
el.detector.addEventListener('change', () => setBand(el.detector.value, true));
for (const chip of el.bandRail.querySelectorAll('[data-band]')) {
  chip.addEventListener('click', () => setBand(chip.dataset.band, true));
}
for (const select of [el.paletteSelect, el.stretchSelect]) {
  select.addEventListener('change', () => {
    palette = el.paletteSelect.value;
    stretch = el.stretchSelect.value;
    if (frames.some(frame => frame.real)) loadRealFrames();
    else notify('Load a real IRSA field to apply archive display filters.');
  });
}
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
  minimapPointer = minimapSkyFromEvent(event);
  try { el.skyMinimap.setPointerCapture(event.pointerId); } catch { /* synthetic events have no capture target */ }
  drawMinimap();
});
el.skyMinimap.addEventListener('pointermove', event => {
  if (!minimapPointer) return;
  event.preventDefault();
  minimapPointer = minimapSkyFromEvent(event);
  el.mapCursor.textContent = `Map ${formatRaHms(minimapPointer.ra)} · ${formatDecDms(minimapPointer.dec)}`;
  drawMinimap();
});
el.skyMinimap.addEventListener('pointerup', event => {
  if (!minimapPointer) return;
  const point = minimapSkyFromEvent(event);
  minimapPointer = null;
  drawMinimap();
  navigateToSky(point, 'Sky-map navigation');
});
el.skyMinimap.addEventListener('pointercancel', () => { minimapPointer = null; drawMinimap(); });
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
    else await el.stage.requestFullscreen();
  } catch (error) {
    notify(`Full screen is unavailable: ${error.message}`);
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

el.stage.addEventListener('pointercancel', e => { activePointers.delete(e.pointerId); stopStageGesture(); resetView(); });
el.stage.addEventListener('pointerleave', () => { if (!activePointers.size) updateMapCenter(); });
el.stage.addEventListener('dblclick', e => {
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
  if (e.target.matches('input, textarea, select, button') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zoom * 1.25); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(zoom / 1.25); }
  else if (e.key === '0') { e.preventDefault(); resetView(); }
});
updateNavButtons();

// Field lab: user-facing mail, learning prompts and real-data games.
const lab = {
  tabs: Array.from(document.querySelectorAll('[data-lab-tab]')),
  panels: {
    wavelength: $('labWavelength'), constellation: $('labConstellation'), verify: $('labVerify'),
    discover: $('labDiscover'), mail: $('labMail'), learn: $('labLearn'), games: $('labGames')
  },
  shortcut: $('mailShortcut'), mailTo: $('mailTo'), mailNote: $('mailNote'),
  mailOpen: $('mailOpen'), mailCopy: $('mailCopy'), mailStatus: $('mailStatus'), mailPreview: $('mailPreview'),
  learnConstellation: $('learnConstellation'), learnPosition: $('learnPosition'),
  learnLight: $('learnLight'), learnWave: $('learnWave'), learnFlags: $('learnFlags'), learnFrames: $('learnFrames'),
  learnQuestion: $('learnQuestion'), learnOptions: $('learnOptions'), learnFeedback: $('learnFeedback'),
  learnNext: $('learnNext'), learnScore: $('learnScore'),
  brighterChoices: $('brighterChoices'), brighterFeedback: $('brighterFeedback'), brighterNext: $('brighterNext'),
  waveChoices: $('waveChoices'), waveFeedback: $('waveFeedback'), waveNext: $('waveNext'),
  bandGamePrompt: $('bandGamePrompt'), bandChoices: $('bandChoices'), bandFeedback: $('bandFeedback'),
  bandNext: $('bandNext'), bandGameScore: $('bandGameScore'),
  runDiscovery: $('runDiscovery'), discoveryStatus: $('discoveryStatus'), discoveryPair: $('discoveryPair'),
  discoveryCanvas: $('discoveryCanvas'), discoveryEmpty: $('discoveryEmpty'), discoveryHint: $('discoveryHint'),
  scanFrameA: $('scanFrameA'), scanFrameB: $('scanFrameB'), swapScan: $('swapScan'),
  candidateList: $('candidateList'), candidateCount: $('candidateCount'),
  lightCurve: $('lightCurve'), lightCurveBand: $('lightCurveBand'), lightCurveCaption: $('lightCurveCaption')
};

const labState = {
  learnScore: 0,
  question: null,
  frameSetKey: '',
  brighter: null,
  wave: null,
  band: null,
  bandScore: 0,
  scanSignature: '',
  candidates: [],
  lightPoints: [],
  discoveryToken: 0,
  scanning: false,
  verifyGaiaKey: '',
  verifyGaia: null,
  lastChecks: []
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

function setLabTab(name) {
  for (const tab of lab.tabs) {
    const active = tab.dataset.labTab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  for (const [key, panel] of Object.entries(lab.panels)) panel.hidden = key !== name;
  if (name === 'mail') updateLab();
  if (name === 'discover') updateDiscovery();
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

  const frameSetKey = frames.map(frame => `${frame.label}:${frame.analysis?.median ?? ''}:${frame.analysis?.waveMin ?? ''}`).join('|');
  if (frameSetKey !== labState.frameSetKey) {
    labState.frameSetKey = frameSetKey;
    newBrighterRound();
    newWaveRound();
    newBandRound();
  }
  updateDiscovery();
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
      lumaA[index] = pixelsA[at] * .299 + pixelsA[at + 1] * .587 + pixelsA[at + 2] * .114;
      lumaB[index] = pixelsB[at] * .299 + pixelsB[at + 1] * .587 + pixelsB[at + 2] * .114;
    }
    const smoothA = smoothLuma(lumaA, width, height);
    const smoothB = smoothLuma(lumaB, width, height);
    const difference = new Float32Array(width * height);
    const absolute = new Float32Array(width * height);
    for (let index = 0; index < difference.length; index += 1) {
      difference[index] = smoothB[index] - smoothA[index];
      absolute[index] = Math.abs(difference[index]);
    }
    const samples = Array.from(absolute).sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] || 0;
    const madSamples = samples.map(value => Math.abs(value - median)).sort((a, b) => a - b);
    const mad = madSamples[Math.floor(madSamples.length / 2)] || 0;
    const threshold = Math.max(7, median + 6 * Math.max(mad, 0.3));
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
      explanation: `This frame is labeled ${data.band} in its SIA2 and FITS metadata.`
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
  const candidates = frames.filter(frame => Number.isFinite(frame.analysis?.median));
  lab.brighterChoices.replaceChildren();
  lab.brighterFeedback.textContent = '';
  lab.brighterNext.disabled = true;
  if (candidates.length < 2) {
    lab.brighterChoices.innerHTML = '<p class="small muted">Load at least two measured frames to play.</p>';
    labState.brighter = null;
    return;
  }
  const pair = shuffle(candidates).slice(0, 2);
  const brighter = pair[0].analysis.median >= pair[1].analysis.median ? pair[0] : pair[1];
  labState.brighter = { pair, brighter, answered: false };
  for (const frame of pair) {
    addLabChoice(lab.brighterChoices, frame.label, () => {
      if (!labState.brighter || labState.brighter.answered) return;
      labState.brighter.answered = true;
      const correct = frame === brighter;
      for (const button of lab.brighterChoices.querySelectorAll('button')) button.disabled = true;
      const labels = pair.map(item => `${item.label}: ${formatNumber(item.analysis.median)} MJy / sr`).join(' · ');
      lab.brighterFeedback.textContent = `${correct ? 'Correct.' : 'Not quite.'} ${labels}`;
      lab.brighterFeedback.className = `quiz-feedback ${correct ? 'correct-text' : 'wrong-text'}`;
      lab.brighterNext.disabled = false;
    });
  }
}

function newWaveRound() {
  const data = labData();
  lab.waveChoices.replaceChildren();
  lab.waveFeedback.textContent = '';
  lab.waveNext.disabled = true;
  if (data.waveMin === null || data.waveMax === null || data.waveMax <= data.waveMin) {
    lab.waveChoices.innerHTML = '<p class="small muted">Load a measured frame to play.</p>';
    labState.wave = null;
    return;
  }
  const middle = (data.waveMin + data.waveMax) / 2;
  const options = [...new Set([middle, data.waveMax + 0.2, Math.max(0.1, data.waveMin - 0.2)].map(value => `${value.toFixed(3)} μm`))];
  labState.wave = { answered: false, correct: `${middle.toFixed(3)} μm`, min: data.waveMin, max: data.waveMax };
  for (const option of shuffle(options)) {
    addLabChoice(lab.waveChoices, option, () => {
      if (!labState.wave || labState.wave.answered) return;
      labState.wave.answered = true;
      const correct = option === labState.wave.correct;
      for (const button of lab.waveChoices.querySelectorAll('button')) button.disabled = true;
      lab.waveFeedback.textContent = `${correct ? 'Correct.' : 'Not quite.'} This frame spans ${data.waveMin.toFixed(3)}–${data.waveMax.toFixed(3)} μm.`;
      lab.waveFeedback.className = `quiz-feedback ${correct ? 'correct-text' : 'wrong-text'}`;
      lab.waveNext.disabled = false;
    });
  }
}

function newBandRound() {
  const data = labData();
  lab.bandChoices.replaceChildren();
  lab.bandFeedback.textContent = '';
  lab.bandNext.disabled = true;
  if (!data.frame || data.waveMin === null || data.waveMax === null || !BAND_INFO[data.band]) {
    lab.bandGamePrompt.textContent = 'Load a measured frame to play.';
    lab.bandChoices.innerHTML = '<p class="small muted">The game uses the real measured WCS-WAVE range.</p>';
    labState.band = null;
    return;
  }
  const correct = data.band;
  const middle = (data.waveMin + data.waveMax) / 2;
  lab.bandGamePrompt.textContent = `A real frame measures ${middle.toFixed(3)} μm. Which detector is it?`;
  const otherBands = shuffle(Object.keys(BAND_INFO).filter(band => band !== correct)).slice(0, 2);
  labState.band = { correct, answered: false };
  for (const option of shuffle([correct, ...otherBands])) {
    addLabChoice(lab.bandChoices, `${option} · ${BAND_INFO[option].low.toFixed(2)}–${BAND_INFO[option].high.toFixed(2)} μm`, event => {
      if (!labState.band || labState.band.answered) return;
      labState.band.answered = true;
      const isCorrect = option === correct;
      for (const button of lab.bandChoices.querySelectorAll('button')) button.disabled = true;
      event.currentTarget.classList.add(isCorrect ? 'correct' : 'wrong');
      if (isCorrect) labState.bandScore += 1;
      lab.bandGameScore.textContent = `GAME 03 · ${labState.bandScore} ${labState.bandScore === 1 ? 'pt' : 'pts'}`;
      lab.bandFeedback.textContent = `${isCorrect ? 'Correct.' : 'Not quite.'} The frame is ${correct}; its measured range is ${data.waveMin.toFixed(3)}–${data.waveMax.toFixed(3)} μm.`;
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
  updateDiscovery();
}

restoreFromUrl();
initLab();
render();
loadRealFrames();
