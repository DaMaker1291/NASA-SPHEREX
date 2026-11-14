// SPHEREx Explorer frontend.
// Real IRSA frames are loaded through the same-origin backend. Local PNGs stay local.
const $ = (id) => document.getElementById(id);
const el = {
  target: $('target'), ra: $('ra'), dec: $('dec'), fov: $('fov'), apply: $('applyCoordinates'),
  fileInput: $('fileInput'), loadReal: $('loadReal'), emptyReal: $('emptyReal'), clear: $('clearImages'),
  sourceLabel: $('sourceLabel'), speed: $('frameSpeed'), speedValue: $('speedValue'),
  crosshairCheck: $('showCrosshair'), crosshair: $('crosshair'),
  stage: $('viewerStage'), transform: $('imageTransform'), image: $('skyImage'),
  empty: $('emptyState'), stageBadge: $('stageBadge'), viewerTitle: $('viewerTitle'),
  zoomIn: $('zoomIn'), zoomOut: $('zoomOut'), resetView: $('resetView'), zoomLevel: $('zoomLevel'),
  previous: $('previous'), next: $('next'), play: $('playPause'), timeline: $('timeline'),
  frameLabel: $('frameLabel'), frameCount: $('frameCount'),
  frameA: $('frameA'), frameB: $('frameB'), blink: $('blink'), showCompare: $('showCompare'),
  compareGrid: $('compareGrid'), compareImageA: $('compareImageA'), compareImageB: $('compareImageB'),
  compareLabelA: $('compareLabelA'), compareLabelB: $('compareLabelB'),
  detailSource: $('detailSource'), detailFrame: $('detailFrame'), detailObsid: $('detailObsid'),
  detailSize: $('detailSize'), detailRA: $('detailRA'), detailDec: $('detailDec'),
  detailSexagesimal: $('detailSexagesimal'), detailConstellation: $('detailConstellation'),
  detailGalactic: $('detailGalactic'), detailEcliptic: $('detailEcliptic'),
  detailDate: $('detailDate'), detailWavelength: $('detailWavelength'),
  detailIntensity: $('detailIntensity'), detailRange: $('detailRange'), detailFullRange: $('detailFullRange'),
  detailMean: $('detailMean'), detailVariance: $('detailVariance'), detailZodi: $('detailZodi'),
  detailFlags: $('detailFlags'), detailWave: $('detailWave'),
  detailExposure: $('detailExposure'), detailPixelScale: $('detailPixelScale'), toast: $('toast')
};

const targets = {
  spherex: { label: 'SPHEREx DR1 field', ra: 150, dec: 19.5, fov: 0.3 }
};

let frames = [];
let frameIndex = 0, interval = null, blinkMode = false, comparisonOpen = false;
let zoom = 1, panX = 0, panY = 0, isDragging = false, dragStart = null;
let ownedObjectUrls = [];
let toastTimeout = null, loadingReal = false, sky = null, realBadge = 'LIVE IRSA • REAL FITS';

function notify(message) {
  el.toast.textContent = message;
  el.toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.toast.classList.remove('visible'), 4200);
}

function setTarget() {
  const selected = targets[el.target.value];
  if (!selected) return;
  el.ra.value = String(selected.ra);
  el.dec.value = String(selected.dec);
  el.fov.value = String(selected.fov);
}

function readField() {
  const ra = Number(el.ra.value.trim());
  const dec = Number(el.dec.value.trim());
  const fov = Number(el.fov.value);
  if (!Number.isFinite(ra) || ra < 0 || ra > 360) throw new Error('RA must be between 0 and 360 degrees.');
  if (!Number.isFinite(dec) || dec < -90 || dec > 90) throw new Error('Dec must be between -90 and +90 degrees.');
  if (!Number.isFinite(fov) || fov < 0.1 || fov > 0.9) throw new Error('Choose a field of view between 0.10° and 0.60°.');
  return { ra, dec, fov };
}

function applyCoordinates() {
  try { readField(); } catch (error) { notify(error.message); return; }
  const target = targets[el.target.value];
  el.viewerTitle.textContent = target ? target.label : 'Custom sky region';
  // The observation panel stays with the frame on screen until new frames load.
  notify('Region updated. Load frames to query IRSA.');
}

function releaseImages() {
  ownedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  ownedObjectUrls = [];
}

function stopPlayback() {
  clearInterval(interval); interval = null; blinkMode = false;
  el.play.textContent = '▶ Play'; el.blink.textContent = 'Blink A / B';
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const absolute = Math.abs(value);
  if (absolute >= 1000 || absolute < 0.001) return value.toExponential(2);
  return value.toFixed(3);
}

function formatRaHms(ra) {
  const hours = ra / 15;
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
  const analysis = frame.analysis;
  const measurementFailed = Boolean(frame.measurementError);
  const measurementPending = frame.real && !analysis && !measurementFailed;
  const unavailable = measurementFailed ? 'Unavailable (measurement failed)' : '—';
  el.detailSource.textContent = frame.real ? 'IRSA SPHEREx DR1' : 'Local PNG files';
  el.detailFrame.textContent = frame.label;
  el.detailObsid.textContent = frame.obsid || analysis?.obsid || '—';
  el.detailSize.textContent = frame.width && frame.height ? `${frame.width} × ${frame.height} px` : 'Loading real pixels…';
  const frameRa = Number.isFinite(analysis?.ra) ? analysis.ra : frame.ra;
  const frameDec = Number.isFinite(analysis?.dec) ? analysis.dec : frame.dec;
  if (frame.real && Number.isFinite(frameRa) && Number.isFinite(frameDec)) {
    el.detailRA.textContent = `${frameRa.toFixed(3)}°`;
    el.detailDec.textContent = `${frameDec > 0 ? '+' : ''}${frameDec.toFixed(3)}°`;
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
}

function readFrameHeaders(response) {
  const number = (name) => {
    const raw = response.headers.get(name);
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const headers = {
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
    eclipticLat: number('X-Frame-Ecliptic-Lat')
  };
  return {
    ...headers,
    measured: Number.isFinite(headers.median) && Number.isFinite(headers.mean)
  };
}

async function loadFrameData(frame) {
  try {
    const response = await fetch(frame.src, { headers: { Accept: 'image/png' } });
    if (!response.ok) throw new Error(`FITS frame returned ${response.status}.`);
    const analysis = readFrameHeaders(response);
    const blob = await response.blob();
    if (!frames.includes(frame)) return;
    const objectUrl = URL.createObjectURL(blob);
    ownedObjectUrls.push(objectUrl);
    frame.src = objectUrl;
    if (analysis.measured) {
      frame.analysis = analysis;
      frame.measurementError = '';
    } else {
      frame.analysis = null;
      frame.measurementError = 'FITS measurement headers were not returned.';
    }
    if (frames[frameIndex] === frame) render();
    else updateLab();
  } catch (error) {
    if (frames.includes(frame)) {
      frame.analysis = null;
      frame.measurementError = error.message;
      if (frames[frameIndex] === frame) render();
      else updateLab();
    }
    notify(`Could not measure that FITS frame: ${error.message}`);
  }
}

function loadFrames(newFrames, source, badge = 'LIVE IRSA • REAL FITS') {
  stopPlayback(); releaseImages();
  frames = newFrames; frameIndex = 0; comparisonOpen = false; realBadge = badge;
  el.compareGrid.hidden = true; el.showCompare.textContent = 'Side by side';
  el.sourceLabel.textContent = source;
  el.timeline.max = String(Math.max(0, frames.length - 1));
  for (const selector of [el.frameA, el.frameB]) {
    selector.replaceChildren();
    frames.forEach((frame, index) => selector.add(new Option(`${index + 1}. ${frame.label}`, index)));
  }
  el.frameA.value = '0'; el.frameB.value = String(Math.min(1, frames.length - 1));
  const enabled = frames.length > 0;
  for (const item of [el.timeline, el.previous, el.next, el.play, el.frameA, el.frameB, el.blink, el.showCompare]) {
    item.disabled = !enabled;
  }
  el.empty.hidden = enabled;
  el.stageBadge.hidden = !frames.some(f => f.real);
  el.stageBadge.textContent = realBadge;
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

async function loadRealFrames() {
  if (loadingReal) return;
  let field;
  try { field = readField(); } catch (error) { notify(error.message); return; }

  loadingReal = true;
  el.loadReal.disabled = true; el.emptyReal.disabled = true;
  el.sourceLabel.textContent = 'Querying IRSA SIA2 for real frames…';
  notify('Loading real SPHEREx detector frames from IRSA.');
  try {
    const params = new URLSearchParams({
      ra: String(field.ra), dec: String(field.dec), fov: String(field.fov), limit: '6', v: '7'
    });
    const response = await fetch(`/api/spherex/frames?${params.toString()}`, { headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `IRSA frame discovery returned ${response.status}.`);
    if (!Array.isArray(payload.frames) || !payload.frames.length) throw new Error('IRSA returned no real products for this field.');

    const realFrames = payload.frames.map(frame => ({
      label: `${frame.date} · ${frame.detector}`,
      src: frame.pngUrl,
      width: null,
      height: null,
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
      real: true
    }));
    sky = payload.sky || null;
    const badge = /bundled|last known|fallback|last-good/i.test(payload.source?.label || '')
      ? 'CACHED IRSA • REAL FITS'
      : 'LIVE IRSA • REAL FITS';
    const visitCount = payload.summary?.visits;
    const coverage = visitCount ? ` · ${visitCount} real visits in field` : '';
    loadFrames(realFrames, `${realFrames.length} real SPHEREx DR1 frames · ${payload.detector} detector${coverage}`, badge);
    el.viewerTitle.textContent = targets[el.target.value]?.label || 'Custom sky region';
    realFrames.forEach(loadFrameData);
    notify(`Loaded ${realFrames.length} real IRSA SPHEREx frames.`);
  } catch (error) {
    el.sourceLabel.textContent = `IRSA request failed: ${error.message}`;
    notify(`IRSA request failed: ${error.message}`);
  } finally {
    loadingReal = false;
    el.loadReal.disabled = false; el.emptyReal.disabled = false;
  }
}

function render() {
  const f = frames[frameIndex];
  if (!f) {
    el.image.hidden = true; el.empty.hidden = false;
    el.frameLabel.textContent = 'No images loaded'; el.frameCount.textContent = '0 / 0';
    updateDetails(null);
    updateLab();
    return;
  }
  el.empty.hidden = true;
  el.image.hidden = false;
  if (el.image.src !== new URL(f.src, window.location.href).href) el.image.src = f.src;
  el.image.onload = () => {
    if (!f.width) { f.width = el.image.naturalWidth; f.height = el.image.naturalHeight; }
    if (frames[frameIndex] === f) updateDetails(f);
  };
  el.image.onerror = () => notify('That IRSA FITS cutout could not be loaded as a PNG.');
  el.frameLabel.textContent = f.label;
  el.frameCount.textContent = `${frameIndex + 1} / ${frames.length}`;
  el.timeline.value = String(frameIndex);
  el.stageBadge.hidden = !f.real;
  el.stageBadge.textContent = realBadge;
  updateDetails(f);
  updateLab();
}

function nextFrame() { if (!frames.length) return; frameIndex = (frameIndex + 1) % frames.length; render(); }
function previousFrame() { if (!frames.length) return; frameIndex = (frameIndex - 1 + frames.length) % frames.length; render(); }
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

function setZoom(value) {
  zoom = Math.max(1, Math.min(8, value));
  if (zoom === 1) { panX = 0; panY = 0; }
  updateTransform();
}
function updateTransform() {
  el.transform.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  el.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
}
function resetView() { zoom = 1; panX = 0; panY = 0; updateTransform(); }

el.target.addEventListener('change', setTarget);
el.apply.addEventListener('click', applyCoordinates);
el.loadReal.addEventListener('click', loadRealFrames);
el.emptyReal.addEventListener('click', loadRealFrames);
el.fileInput.addEventListener('change', async e => { await loadPNGFiles(e.target.files); e.target.value = ''; });
el.clear.addEventListener('click', () => { sky = null; loadFrames([], 'No real frames loaded'); });
el.play.addEventListener('click', togglePlay);
el.next.addEventListener('click', nextFrame);
el.previous.addEventListener('click', previousFrame);
el.timeline.addEventListener('input', () => { stopPlayback(); frameIndex = Number(el.timeline.value); render(); });
el.speed.addEventListener('input', () => {
  const delay = playbackDelay(); el.speedValue.textContent = `${(1000 / delay).toFixed(1)}×`;
  if (interval) { if (blinkMode) { stopPlayback(); notify('Speed changed; restart blinking.'); } else { startPlayback(); } }
});
el.frameA.addEventListener('change', renderComparison);
el.frameB.addEventListener('change', renderComparison);
el.blink.addEventListener('click', toggleBlink);
el.showCompare.addEventListener('click', toggleComparison);
el.crosshairCheck.addEventListener('change', () => { el.crosshair.hidden = !el.crosshairCheck.checked; });
el.zoomIn.addEventListener('click', () => setZoom(zoom * 1.25));
el.zoomOut.addEventListener('click', () => setZoom(zoom / 1.25));
el.resetView.addEventListener('click', resetView);
el.stage.addEventListener('wheel', e => {
  if (!frames.length) return;
  e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
}, { passive: false });
el.stage.addEventListener('pointerdown', e => {
  if (!frames.length || zoom === 1 || e.target.closest('button')) return;
  isDragging = true; dragStart = { x: e.clientX - panX, y: e.clientY - panY };
  el.stage.setPointerCapture(e.pointerId); el.stage.classList.add('dragging');
});
el.stage.addEventListener('pointermove', e => {
  if (!isDragging) return;
  panX = e.clientX - dragStart.x; panY = e.clientY - dragStart.y; updateTransform();
});
function stopDrag() { isDragging = false; el.stage.classList.remove('dragging'); }
el.stage.addEventListener('pointerup', stopDrag);
el.stage.addEventListener('pointercancel', stopDrag);

// Field lab: user-facing mail, learning prompts and real-data games.
const lab = {
  tabs: Array.from(document.querySelectorAll('[data-lab-tab]')),
  panels: { mail: $('labMail'), learn: $('labLearn'), games: $('labGames') },
  shortcut: $('mailShortcut'), mailTo: $('mailTo'), mailNote: $('mailNote'),
  mailOpen: $('mailOpen'), mailCopy: $('mailCopy'), mailStatus: $('mailStatus'), mailPreview: $('mailPreview'),
  learnConstellation: $('learnConstellation'), learnPosition: $('learnPosition'),
  learnLight: $('learnLight'), learnWave: $('learnWave'), learnFlags: $('learnFlags'), learnFrames: $('learnFrames'),
  learnQuestion: $('learnQuestion'), learnOptions: $('learnOptions'), learnFeedback: $('learnFeedback'),
  learnNext: $('learnNext'), learnScore: $('learnScore'),
  brighterChoices: $('brighterChoices'), brighterFeedback: $('brighterFeedback'), brighterNext: $('brighterNext'),
  waveChoices: $('waveChoices'), waveFeedback: $('waveFeedback'), waveNext: $('waveNext')
};

const labState = {
  learnScore: 0,
  question: null,
  frameSetKey: '',
  brighter: null,
  wave: null
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
  }
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
  setLabTab('mail');
  newLearnQuestion();
  newBrighterRound();
  newWaveRound();
}

initLab();
render();
loadRealFrames();
