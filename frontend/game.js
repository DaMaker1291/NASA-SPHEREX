const MAX_DIFFERENCES = 5;
const CANVAS_SIZE = 480;
const HIT_RADIUS = 0.066;
const MIN_HIT_PX = 44;
const HINT_MS = 3200;
const CLICK_MS = 850;
const BLINK_MS = 850;

const el = {
  board: document.getElementById('gameBoard'),
  canvasA: document.getElementById('frameA'),
  canvasB: document.getElementById('frameB'),
  loadingA: document.getElementById('frameLoadingA'),
  loadingB: document.getElementById('frameLoadingB'),
  dateA: document.getElementById('frameDateA'),
  dateB: document.getElementById('frameDateB'),
  labelA: document.getElementById('frameLabelA'),
  labelB: document.getElementById('frameLabelB'),
  viewHint: document.getElementById('gameViewHint'),
  viewBadge: document.getElementById('gameViewBadge'),
  viewButtons: [...document.querySelectorAll('[data-view]')],
  score: document.getElementById('gameScore'),
  misses: document.getElementById('gameMisses'),
  hints: document.getElementById('gameHints'),
  progress: document.getElementById('gameProgress'),
  status: document.getElementById('gameStatus'),
  source: document.getElementById('gameSource'),
  roundMeta: document.getElementById('roundMeta'),
  roundTitle: document.getElementById('roundTitle'),
  hint: document.getElementById('gameHint'),
  reveal: document.getElementById('gameReveal'),
  next: document.getElementById('gameNew'),
};

const state = {
  groups: [],
  pair: null,
  imageA: null,
  imageB: null,
  candidates: [],
  found: new Set(),
  misses: 0,
  hints: 0,
  hintIndex: -1,
  hintTimer: 0,
  clickMark: null,
  clickTimer: 0,
  revealed: false,
  viewMode: 'side',
  blinkShowB: false,
  trailImage: null,
  busy: true,
  lastPairKey: '',
  lastPairFrames: new Set(),
};

const imageCache = new Map();
const pointerStarts = new Map();
let lastPointerGuess = 0;
let blinkTimer = 0;

const VIEW_COPY = {
  side: 'Compare the two visits side by side.',
  blink: 'The same view flips between visit A and visit B.',
  trail: 'Amber is visit A, cyan is visit B. A star that moved leaves a split-colour trail.',
};

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function setStatus(text, tone = '') {
  el.status.textContent = text;
  el.status.className = `game-status${tone ? ` ${tone}` : ''}`;
}

function updateControls() {
  const hasRound = state.candidates.length > 0;
  const complete = hasRound && state.found.size === state.candidates.length;
  el.next.disabled = state.busy;
  el.hint.disabled = state.busy || !hasRound || complete || state.revealed;
  el.reveal.disabled = state.busy || !hasRound || complete || state.revealed;
  for (const button of el.viewButtons) {
    button.disabled = state.busy || !state.imageA || !state.imageB;
  }
}

function updateScore() {
  el.score.textContent = `${state.found.size} / ${state.candidates.length}`;
  el.misses.textContent = String(state.misses);
  el.hints.textContent = String(state.hints);
  el.progress.replaceChildren();
  for (let index = 0; index < state.candidates.length; index += 1) {
    const tick = document.createElement('span');
    if (state.found.has(index)) tick.className = 'found';
    el.progress.append(tick);
  }
  el.board.dataset.candidates = String(state.candidates.length);
  el.board.dataset.found = String(state.found.size);
  el.board.dataset.revealed = String(state.revealed);
  updateControls();
}

function setLoading(loading, label = 'Loading real visit…') {
  for (const node of [el.loadingA, el.loadingB]) {
    node.hidden = !loading;
    node.textContent = label;
  }
  el.canvasA.style.opacity = loading ? '0.35' : '1';
  el.canvasB.style.opacity = loading ? '0.35' : '1';
}

function imageSource(frame) {
  return /^https?:\/\//i.test(frame.png || '') ? frame.png : `./mirror/${frame.png}`;
}

function loadImage(frame) {
  const src = imageSource(frame);
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${frame.file || frame.png || 'visit image'}.`));
    image.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

async function loadIndex() {
  const response = await fetch('./mirror/index.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`The real-visit index returned HTTP ${response.status}.`);
  return response.json();
}

function isPlayableFrame(frame) {
  const width = Number(frame?.measurement?.width);
  const height = Number(frame?.measurement?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return true;
  if (Math.min(width, height) < 120) return false;
  return Math.abs(width - height) <= 2;
}

function frameOrientation(frame) {
  const value = Number(frame?.measurement?.orientationDeg);
  return Number.isFinite(value) ? value : null;
}

function rotateImage180(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.translate(width, height);
  context.rotate(Math.PI);
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function lumaPlane(image, width, height) {
  const data = imageData(image, width, height);
  const values = new Float32Array(width * height);
  for (let index = 0; index < values.length; index += 1) {
    const offset = index * 4;
    values[index] = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
  }
  return values;
}

function estimateShift(a, b, width, height) {
  const margin = Math.max(8, Math.round(Math.min(width, height) * 0.06));
  let best = { dx: 0, dy: 0, error: Infinity };
  let zeroError = Infinity;
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      let sum = 0;
      let count = 0;
      for (let y = margin; y < height - margin; y += 2) {
        for (let x = margin; x < width - margin; x += 2) {
          const bx = x + dx;
          const by = y + dy;
          if (bx < margin || bx >= width - margin || by < margin || by >= height - margin) continue;
          sum += Math.abs(a[y * width + x] - b[by * width + bx]);
          count += 1;
        }
      }
      if (!count) continue;
      const error = sum / count;
      if (dx === 0 && dy === 0) zeroError = error;
      if (error < best.error) best = { dx, dy, error };
    }
  }
  return { ...best, zeroError };
}

function shiftImage(image, dx, dy) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#050a11';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, dx, dy);
  return canvas;
}

function alignPairImages(imageA, imageB, first, second) {
  const orientationA = frameOrientation(first);
  const orientationB = frameOrientation(second);
  let aligned = imageB;
  let rotated = false;
  if (orientationA !== null && orientationB !== null) {
    const delta = Math.abs((((orientationA - orientationB + 540) % 360) - 180));
    if (delta > 135) {
      aligned = rotateImage180(imageB);
      rotated = true;
    }
  }

  const width = imageA.naturalWidth || imageA.width;
  const height = imageA.naturalHeight || imageA.height;
  if (!width || !height) return { imageB: aligned, rotated, shifted: false };
  const a = lumaPlane(imageA, width, height);
  const b = lumaPlane(aligned, width, height);
  const shift = estimateShift(a, b, width, height);
  const useful = shift.zeroError - shift.error;
  const shifted = (shift.dx !== 0 || shift.dy !== 0)
    && Math.abs(shift.dx) <= 3
    && Math.abs(shift.dy) <= 3
    && useful > shift.zeroError * 0.005;
  if (shifted) aligned = shiftImage(aligned, shift.dx, shift.dy);
  return { imageB: aligned, rotated, shifted };
}

function buildGroups(index) {
  const groups = [];
  for (const field of index.fields || []) {
    const byDetector = new Map();
    for (const frame of field.frames || []) {
      if (!frame.png || !isPlayableFrame(frame)) continue;
      const detector = frame.detector || frame.band || 'SPHEREx';
      const rows = byDetector.get(detector) || [];
      rows.push(frame);
      byDetector.set(detector, rows);
    }
    for (const [detector, frames] of byDetector) {
      if (frames.length >= 2) groups.push({ field, detector, frames });
    }
  }
  return groups;
}

function pickPair(group) {
  const frames = [...group.frames].sort((a, b) => Date.parse(a.iso || a.date) - Date.parse(b.iso || b.date));
  if (frames.length < 2) return null;
  const first = randomInt(frames.length);
  let second = randomInt(frames.length - 1);
  if (second >= first) second += 1;
  let gap = Math.abs(first - second);
  if (gap < Math.max(2, Math.floor(frames.length / 3))) {
    second = (first + Math.floor(frames.length / 2)) % frames.length;
  }
  if (second === first) second = (first + 1) % frames.length;
  return first < second ? [frames[first], frames[second]] : [frames[second], frames[first]];
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function imageData(image, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function analyzePair(imageA, imageB) {
  const width = imageA.naturalWidth || imageA.width;
  const height = imageA.naturalHeight || imageA.height;
  if (!width || !height) return { candidates: [] };
  const pixelsA = imageData(imageA, width, height);
  const pixelsB = imageData(imageB, width, height);
  const count = width * height;
  const lumaA = new Float32Array(count);
  const lumaB = new Float32Array(count);
  const differences = new Float32Array(count);
  const border = Math.max(4, Math.round(Math.min(width, height) * 0.045));
  const samples = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const valueA = 0.2126 * pixelsA[offset] + 0.7152 * pixelsA[offset + 1] + 0.0722 * pixelsA[offset + 2];
      const valueB = 0.2126 * pixelsB[offset] + 0.7152 * pixelsB[offset + 1] + 0.0722 * pixelsB[offset + 2];
      const difference = Math.abs(valueA - valueB);
      lumaA[index] = valueA;
      lumaB[index] = valueB;
      differences[index] = difference;
      if (x >= border && x < width - border && y >= border && y < height - border) samples.push(difference);
    }
  }

  const medianDifference = median(samples);
  const deviations = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) deviations[index] = Math.abs(samples[index] - medianDifference);
  const mad = median(deviations);
  const threshold = Math.max(22, medianDifference + 5.5 * Math.max(mad, 2.5));
  const suppression = Math.max(12, Math.round(Math.min(width, height) * 0.085));
  const peaks = [];

  // A candidate must change the light inside a small aperture, not merely
  // move a star by a pixel. The annulus gives a local sky background, and the
  // shift test rejects the dipole pattern left by pointing jitter.
  function measureChange(centerX, centerY) {
    const cx = Math.round(centerX);
    const cy = Math.round(centerY);
    const aperture = 3;
    const annulusInner = 5;
    const annulusOuter = 7;
    let sumA = 0;
    let sumB = 0;
    let pixels = 0;
    const skyA = [];
    const skyB = [];
    for (let dy = -annulusOuter; dy <= annulusOuter; dy += 1) {
      const y = cy + dy;
      if (y < 0 || y >= height) continue;
      for (let dx = -annulusOuter; dx <= annulusOuter; dx += 1) {
        const x = cx + dx;
        if (x < 0 || x >= width) continue;
        const distance = Math.hypot(dx, dy);
        const index = y * width + x;
        if (distance <= aperture) {
          sumA += lumaA[index];
          sumB += lumaB[index];
          pixels += 1;
        } else if (distance >= annulusInner && distance <= annulusOuter) {
          skyA.push(lumaA[index]);
          skyB.push(lumaB[index]);
        }
      }
    }
    if (!pixels || !skyA.length) return null;
    const backgroundA = median(skyA);
    const backgroundB = median(skyB);
    const fluxA = Math.max(0, sumA - pixels * backgroundA);
    const fluxB = Math.max(0, sumB - pixels * backgroundB);
    const delta = fluxB - fluxA;
    const contrast = Math.abs(delta) / Math.max(1, Math.max(fluxA, fluxB));
    const noise = Math.max(mad, 2.5) * Math.sqrt(pixels);
    const snr = Math.abs(delta) / noise;
    if (Math.abs(delta) < 60 || snr < 6 || contrast < 0.4) return null;

    const core = 3;
    let zeroError = 0;
    let bestError = Infinity;
    let bestDx = 0;
    let bestDy = 0;
    for (let shiftY = -2; shiftY <= 2; shiftY += 1) {
      for (let shiftX = -2; shiftX <= 2; shiftX += 1) {
        let error = 0;
        for (let dy = -core; dy <= core; dy += 1) {
          for (let dx = -core; dx <= core; dx += 1) {
            const x = cx + dx;
            const y = cy + dy;
            const shiftedX = x + shiftX;
            const shiftedY = y + shiftY;
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (shiftedX < 0 || shiftedX >= width || shiftedY < 0 || shiftedY >= height) continue;
            error += Math.abs(lumaA[y * width + x] - lumaB[shiftedY * width + shiftedX]);
          }
        }
        if (shiftX === 0 && shiftY === 0) zeroError = error;
        if (error < bestError) {
          bestError = error;
          bestDx = shiftX;
          bestDy = shiftY;
        }
      }
    }
    const shiftedMatch = (bestDx !== 0 || bestDy !== 0) && zeroError > 0 && bestError < zeroError * 0.55;
    if (shiftedMatch) return null;
    return { x: centerX, y: centerY, score: Math.abs(delta), contrast, snr, fluxA, fluxB };
  }

  for (let y = border; y < height - border; y += 1) {
    for (let x = border; x < width - border; x += 1) {
      const index = y * width + x;
      const value = differences[index];
      if (value < threshold) continue;
      let localMax = true;
      for (let dy = -1; dy <= 1 && localMax; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          if (differences[(y + dy) * width + x + dx] > value + 0.01) {
            localMax = false;
            break;
          }
        }
      }
      if (!localMax) continue;

      let support = 0;
      for (let dy = -4; dy <= 4; dy += 1) {
        for (let dx = -4; dx <= 4; dx += 1) {
          if (differences[(y + dy) * width + x + dx] >= threshold) support += 1;
        }
      }
      if (support < 6) continue;

      // Rank visible blobs rather than single noisy pixels, and center the
      // target on the weighted middle of the change so a click on the star or
      // smudge the player can actually see lands on the candidate.
      let blobScore = 0;
      let weightedX = 0;
      let weightedY = 0;
      let weight = 0;
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const sample = differences[(y + dy) * width + x + dx];
          if (sample < threshold * 0.7) continue;
          blobScore += sample;
          const sampleWeight = Math.max(1, sample - threshold * 0.5);
          weightedX += (x + dx) * sampleWeight;
          weightedY += (y + dy) * sampleWeight;
          weight += sampleWeight;
        }
      }
      const centerX = weight ? weightedX / weight : x;
      const centerY = weight ? weightedY / weight : y;
      peaks.push({ x: centerX, y: centerY, score: blobScore, peak: value });
    }
  }

  const measured = [];
  for (const peak of peaks) {
    const change = measureChange(peak.x, peak.y);
    if (!change) continue;
    measured.push({
      pixelX: change.x,
      pixelY: change.y,
      x: change.x / width,
      y: change.y / height,
      score: change.score,
      contrast: change.contrast,
      snr: change.snr,
      fluxA: change.fluxA,
      fluxB: change.fluxB,
    });
  }

  measured.sort((a, b) => b.score - a.score);
  const candidates = [];
  for (const candidate of measured) {
    if (candidates.some((existing) => Math.hypot(existing.pixelX - candidate.pixelX, existing.pixelY - candidate.pixelY) < suppression)) continue;
    candidates.push(candidate);
    if (candidates.length >= MAX_DIFFERENCES) break;
  }

  return { candidates, threshold, medianDifference, mad };
}

function drawMarkers(context, side) {
  const radius = 19;
  state.candidates.forEach((candidate, index) => {
    const x = candidate.x * CANVAS_SIZE;
    const y = candidate.y * CANVAS_SIZE;
    const found = state.found.has(index);
    if (!found && !state.revealed) return;

    context.save();
    context.lineWidth = found ? 2.6 : 2;
    context.strokeStyle = found ? '#f2bb6d' : '#8bd1f5';
    context.fillStyle = found ? 'rgba(242, 187, 109, .13)' : 'rgba(139, 209, 245, .08)';
    context.setLineDash(found ? [] : [5, 5]);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.setLineDash([]);
    if (found) {
      context.fillStyle = '#f2bb6d';
      context.beginPath();
      context.arc(x + 15, y - 15, 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#07101a';
      context.font = '800 10px "Avenir Next", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(index + 1), x + 15, y - 14.5);
    }
    context.restore();
  });

  if (state.hintIndex >= 0 && !state.found.has(state.hintIndex) && !state.revealed) {
    const candidate = state.candidates[state.hintIndex];
    if (candidate) {
      context.save();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.setLineDash([4, 4]);
      context.beginPath();
      context.arc(candidate.x * CANVAS_SIZE, candidate.y * CANVAS_SIZE, radius + 7, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  if (state.clickMark && state.clickMark.side === side) {
    const { x, y, hit } = state.clickMark;
    const px = x * CANVAS_SIZE;
    const py = y * CANVAS_SIZE;
    context.save();
    context.strokeStyle = hit ? '#8df0c9' : '#ff9eaa';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(px, py, hit ? 14 : 10, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    if (hit) {
      context.fillStyle = '#8df0c9';
      context.arc(px, py, 3, 0, Math.PI * 2);
      context.fill();
    } else {
      context.moveTo(px - 7, py - 7);
      context.lineTo(px + 7, py + 7);
      context.moveTo(px + 7, py - 7);
      context.lineTo(px - 7, py + 7);
      context.stroke();
    }
    context.restore();
  }
}

function drawPanel(canvas, image, side) {
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  context.fillStyle = '#050a11';
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  if (image) {
    context.drawImage(image, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }
  drawMarkers(context, side);
}

function buildTrailImage(imageA, imageB) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  if (!imageA || !imageB) return canvas;
  const context = canvas.getContext('2d');
  const pixelsA = imageData(imageA, CANVAS_SIZE, CANVAS_SIZE);
  const pixelsB = imageData(imageB, CANVAS_SIZE, CANVAS_SIZE);
  const output = context.createImageData(CANVAS_SIZE, CANVAS_SIZE);
  for (let index = 0; index < CANVAS_SIZE * CANVAS_SIZE; index += 1) {
    const offset = index * 4;
    const lumaA = 0.2126 * pixelsA[offset] + 0.7152 * pixelsA[offset + 1] + 0.0722 * pixelsA[offset + 2];
    const lumaB = 0.2126 * pixelsB[offset] + 0.7152 * pixelsB[offset + 1] + 0.0722 * pixelsB[offset + 2];
    const a = Math.min(255, Math.pow(lumaA / 255, 0.82) * 255);
    const b = Math.min(255, Math.pow(lumaB / 255, 0.82) * 255);
    output.data[offset] = a;
    output.data[offset + 1] = Math.min(a, b) + Math.abs(a - b) * 0.45;
    output.data[offset + 2] = b;
    output.data[offset + 3] = 255;
  }
  context.putImageData(output, 0, 0);
  return canvas;
}

function stopBlink() {
  if (blinkTimer) clearInterval(blinkTimer);
  blinkTimer = 0;
  state.blinkShowB = false;
}

function startBlink() {
  stopBlink();
  if (!state.imageA || !state.imageB) return;
  blinkTimer = setInterval(() => {
    state.blinkShowB = !state.blinkShowB;
    draw();
  }, BLINK_MS);
}

function updateViewChrome() {
  const mode = state.viewMode;
  el.board.classList.remove('mode-side', 'mode-blink', 'mode-trail');
  el.board.classList.add(`mode-${mode}`);
  for (const button of el.viewButtons) {
    const active = button.dataset.view === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  el.viewHint.textContent = VIEW_COPY[mode];
  el.viewBadge.hidden = !state.imageA || mode === 'side';
  el.labelA.textContent = mode === 'blink' ? 'A ↔ B' : mode === 'trail' ? 'VISIT A + B' : 'VISIT A';
  el.labelB.textContent = 'VISIT B';
  if (!state.pair) return;
  el.dateA.textContent = mode === 'blink'
    ? `${stampDay(state.pair.first)} ↔ ${stampDay(state.pair.second)}`
    : stamp(state.pair.first);
  el.dateB.textContent = stamp(state.pair.second);
}

function draw() {
  const mode = state.viewMode;
  if (mode === 'blink') {
    drawPanel(el.canvasA, state.blinkShowB ? state.imageB : state.imageA, 'A');
    if (state.imageA) {
      el.viewBadge.textContent = state.blinkShowB
        ? `BLINK · B ${state.pair ? stampDay(state.pair.second) : ''}`
        : `BLINK · A ${state.pair ? stampDay(state.pair.first) : ''}`;
    }
  } else if (mode === 'trail') {
    drawPanel(el.canvasA, state.trailImage || state.imageA, 'A');
    if (state.imageA) el.viewBadge.textContent = 'A AMBER · B CYAN';
  } else {
    drawPanel(el.canvasA, state.imageA, 'A');
    drawPanel(el.canvasB, state.imageB, 'B');
  }
}

function setViewMode(mode) {
  if (!VIEW_COPY[mode] || state.viewMode === mode) return;
  stopBlink();
  state.viewMode = mode;
  updateViewChrome();
  if (mode === 'blink' && state.imageA && state.imageB && !state.busy) startBlink();
  draw();
}

function stamp(frame) {
  if (!frame) return 'Time unavailable';
  const date = new Date(frame.iso || frame.date);
  if (Number.isNaN(date.getTime())) return frame.date || 'Time unavailable';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function stampDay(frame) {
  if (!frame) return '';
  const date = new Date(frame.iso || frame.date);
  if (Number.isNaN(date.getTime())) return frame.date || '';
  return date.toISOString().slice(0, 10);
}

function fieldName(field) {
  return field?.sky?.constellation?.name || String(field?.id || 'SPHEREx field').replace('default-', '').toUpperCase();
}

function wavelengthLabel(frame) {
  const measurement = frame?.measurement;
  if (!measurement) return '';
  const low = Number(measurement.waveMin);
  const high = Number(measurement.waveMax);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return '';
  return `${((low + high) / 2).toFixed(2)} μm`;
}

function updateRoundCopy(group, first, second, rotated = false) {
  const wave = wavelengthLabel(first);
  el.roundMeta.textContent = `REAL VISIT PAIR · RA ${group.field.ra.toFixed(3)}° · DEC ${group.field.dec >= 0 ? '+' : ''}${group.field.dec.toFixed(3)}°`;
  el.roundTitle.textContent = `${fieldName(group.field)} · ${group.detector}${wave ? ` · ${wave}` : ''}`;
  el.dateA.textContent = stamp(first);
  el.dateB.textContent = stamp(second);
  el.canvasA.setAttribute('aria-label', `Visit A from ${stamp(first)}. Click a difference in either visit.`);
  el.canvasB.setAttribute('aria-label', `Visit B from ${stamp(second)}. Click a difference in either visit.`);
  el.source.textContent = `Real SPHEREx DR1 mirror · ${group.frames.length} visits available in this field · differences computed locally.${rotated ? ' Visit B aligned to visit A before comparison.' : ''}`;
}

function clearTimers() {
  clearTimeout(state.hintTimer);
  clearTimeout(state.clickTimer);
  state.hintIndex = -1;
  state.clickMark = null;
}

function flashClick(x, y, side, hit) {
  state.clickMark = { x, y, side, hit };
  clearTimeout(state.clickTimer);
  const mark = state.clickMark;
  state.clickTimer = setTimeout(() => {
    if (state.clickMark === mark) {
      state.clickMark = null;
      draw();
    }
  }, CLICK_MS);
  draw();
}

async function newRound() {
  if (state.busy) return;
  state.busy = true;
  stopBlink();
  clearTimers();
  state.found.clear();
  state.misses = 0;
  state.hints = 0;
  state.revealed = false;
  state.candidates = [];
  state.imageA = null;
  state.imageB = null;
  state.trailImage = null;
  state.pair = null;
  setLoading(true);
  setStatus('Finding a pair of real visits with measurable changes…');
  updateScore();
  updateViewChrome();
  draw();
  el.roundMeta.textContent = 'LOADING REAL VISITS';
  el.roundTitle.textContent = 'Preparing a sky pair…';

  try {
    // D2 is the clean, contiguous star-field sequence in the bundled mirror.
    // Other detector groups can include detector-artifact frames that are not
    // a fair spot-the-difference puzzle, so only fall back if D2 is absent.
    const preferred = state.groups.filter((group) => group.detector === 'D2');
    const pool = preferred.length ? preferred : state.groups;
    let selected = null;
    for (let attempt = 0; attempt < 10 && !selected; attempt += 1) {
      const group = pool[randomInt(pool.length)];
      const freshFrames = group.frames.filter((frame) => !state.lastPairFrames.has(frame.png));
      const pair = pickPair(freshFrames.length >= 2 ? { ...group, frames: freshFrames } : group);
      if (!pair) continue;
      const [first, second] = pair;
      const key = `${first.png}|${second.png}`;
      if (key === state.lastPairKey && state.groups.length > 1) continue;
      setLoading(true, `Loading ${group.detector} visits…`);
      const [imageA, loadedB] = await Promise.all([loadImage(first), loadImage(second)]);
      const aligned = alignPairImages(imageA, loadedB, first, second);
      const imageB = aligned.imageB;
      const analysis = analyzePair(imageA, imageB);
      if (analysis.candidates.length < 2) continue;
      selected = { group, first, second, imageA, imageB, analysis, rotated: aligned.rotated, shifted: aligned.shifted, key };
    }

    if (!selected) throw new Error('No real visit pair with measurable differences was found. Try again.');
    state.pair = selected;
    state.lastPairKey = selected.key;
    state.lastPairFrames = new Set([selected.first.png, selected.second.png]);
    state.imageA = selected.imageA;
    state.imageB = selected.imageB;
    state.trailImage = buildTrailImage(selected.imageA, selected.imageB);
    state.candidates = selected.analysis.candidates;
    updateRoundCopy(selected.group, selected.first, selected.second, selected.rotated || selected.shifted);
    updateViewChrome();
    draw();
    updateScore();
    if (state.viewMode === 'blink') startBlink();
    setStatus(`Find ${state.candidates.length} real change${state.candidates.length === 1 ? '' : 's'} between the two visits. Click a star or smudge in either image.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'The real-visit game could not load.', 'warn');
    el.roundTitle.textContent = 'Could not load a pair';
    el.source.textContent = 'The bundled real SPHEREx mirror could not be read. Return to the explorer or try again.';
  } finally {
    state.busy = false;
    setLoading(false);
    updateControls();
  }
}

function handlePointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  pointerStarts.set(event.currentTarget, {
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
  });
}

function handlePointerCancel(event) {
  pointerStarts.delete(event.currentTarget);
}

function handlePointerUp(event) {
  const start = pointerStarts.get(event.currentTarget);
  pointerStarts.delete(event.currentTarget);
  if (!start || start.pointerId !== event.pointerId) return;
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18) return;
  lastPointerGuess = performance.now();
  handleGuess(event);
}

function handleClick(event) {
  if (performance.now() - lastPointerGuess < 800) return;
  handleGuess(event);
}

function handleGuess(event) {
  if (state.busy || !state.candidates.length || state.revealed) return;
  const canvas = event.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  const side = canvas === el.canvasA ? 'A' : 'B';
  const radius = Math.max(HIT_RADIUS, MIN_HIT_PX / Math.max(1, Math.min(rect.width, rect.height)));

  let hit = -1;
  let hitDistance = Infinity;
  let alreadyFound = -1;
  let foundDistance = Infinity;
  state.candidates.forEach((candidate, index) => {
    const distance = Math.hypot(x - candidate.x, y - candidate.y);
    if (state.found.has(index)) {
      if (distance <= radius && distance < foundDistance) {
        alreadyFound = index;
        foundDistance = distance;
      }
    } else if (distance <= radius && distance < hitDistance) {
      hit = index;
      hitDistance = distance;
    }
  });

  if (hit >= 0) {
    state.found.add(hit);
    clearTimeout(state.hintTimer);
    state.hintIndex = -1;
    updateScore();
    flashClick(x, y, side, true);
    if (state.found.size === state.candidates.length) {
      setStatus(`All ${state.candidates.length} real differences found. Load a new pair to keep going.`, 'success');
    } else {
      const left = state.candidates.length - state.found.size;
      setStatus(`Found ${state.found.size} of ${state.candidates.length}. ${left} more change${left === 1 ? '' : 's'} to spot.`, 'success');
    }
    return;
  }

  if (alreadyFound >= 0) {
    flashClick(x, y, side, true);
    setStatus(`Difference ${alreadyFound + 1} is already found. Look for another one.`, 'success');
    return;
  }

  state.misses += 1;
  state.hintIndex = -1;
  updateScore();
  flashClick(x, y, side, false);
  setStatus(`Not that one. ${state.misses} miss${state.misses === 1 ? '' : 'es'} — look for a star or smudge that changes between A and B.`, 'warn');
}

function showHint() {
  if (state.busy || state.revealed) return;
  const remaining = state.candidates.map((_, index) => index).filter((index) => !state.found.has(index));
  if (!remaining.length) {
    setStatus('Every difference is already found. Load a new pair.', 'success');
    return;
  }
  state.hints += 1;
  state.hintIndex = remaining[0];
  setStatus('The dashed ring marks one real difference. Click it in either visit.', 'warn');
  updateScore();
  draw();
  clearTimeout(state.hintTimer);
  const shown = state.hintIndex;
  state.hintTimer = setTimeout(() => {
    if (state.hintIndex === shown) {
      state.hintIndex = -1;
      draw();
      const left = state.candidates.length - state.found.size;
      setStatus(`Find ${left} more real change${left === 1 ? '' : 's'} between the two visits.`);
    }
  }, HINT_MS);
}

function reveal() {
  if (state.busy || state.revealed) return;
  const remaining = state.candidates.length - state.found.size;
  if (!remaining) return;
  state.revealed = true;
  state.hintIndex = -1;
  clearTimeout(state.hintTimer);
  setStatus(`${remaining} difference${remaining === 1 ? '' : 's'} revealed in blue. Start a new pair when you are ready.`, 'warn');
  updateScore();
  draw();
}

function boot() {
  for (const canvas of [el.canvasA, el.canvasB]) {
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('click', handleClick);
  }
  el.hint.addEventListener('click', showHint);
  el.reveal.addEventListener('click', reveal);
  el.next.addEventListener('click', newRound);
  for (const button of el.viewButtons) {
    button.addEventListener('click', () => setViewMode(button.dataset.view));
  }

  setLoading(true);
  setStatus('Loading the real SPHEREx visit index…');
  loadIndex()
    .then((index) => {
      state.groups = buildGroups(index);
      if (!state.groups.length) throw new Error('The real-visit index has no paired visits.');
      state.busy = false;
      return newRound();
    })
    .catch((error) => {
      state.busy = false;
      setLoading(false);
      updateControls();
      setStatus(error instanceof Error ? error.message : 'The real-visit game could not load.', 'warn');
      el.roundTitle.textContent = 'Game unavailable';
      el.source.textContent = 'The bundled real SPHEREx mirror could not be read. Use “Back to explorer” to return.';
    });
}

boot();
