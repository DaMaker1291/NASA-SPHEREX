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
  } catch (error) {
    if (frames.includes(frame)) {
      frame.analysis = null;
      frame.measurementError = error.message;
      if (frames[frameIndex] === frame) render();
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
render();
loadRealFrames();
