// SPHEREx Explorer frontend prototype.
// PNGs are read locally in the browser. No files are uploaded to a server.
// Replace loadFrames(...) input with a backend API response during integration.
const $ = (id) => document.getElementById(id);
const el = {
  target: $('target'), ra: $('ra'), dec: $('dec'), apply: $('applyCoordinates'),
  fileInput: $('fileInput'), loadDemo: $('loadDemo'), emptyDemo: $('emptyDemo'), clear: $('clearImages'),
  sourceLabel: $('sourceLabel'), speed: $('frameSpeed'), speedValue: $('speedValue'),
  crosshairCheck: $('showCrosshair'), crosshair: $('crosshair'),
  stage: $('viewerStage'), transform: $('imageTransform'), image: $('skyImage'), canvas: $('demoCanvas'),
  empty: $('emptyState'), stageBadge: $('stageBadge'), viewerTitle: $('viewerTitle'),
  zoomIn: $('zoomIn'), zoomOut: $('zoomOut'), resetView: $('resetView'), zoomLevel: $('zoomLevel'),
  previous: $('previous'), next: $('next'), play: $('playPause'), timeline: $('timeline'),
  frameLabel: $('frameLabel'), frameCount: $('frameCount'),
  frameA: $('frameA'), frameB: $('frameB'), blink: $('blink'), showCompare: $('showCompare'),
  compareGrid: $('compareGrid'), compareImageA: $('compareImageA'), compareImageB: $('compareImageB'),
  compareCanvasA: $('compareCanvasA'), compareCanvasB: $('compareCanvasB'),
  compareLabelA: $('compareLabelA'), compareLabelB: $('compareLabelB'),
  detailSource: $('detailSource'), detailFrame: $('detailFrame'), detailSize: $('detailSize'),
  detailRA: $('detailRA'), detailDec: $('detailDec'), detailDate: $('detailDate'),
  detailWavelength: $('detailWavelength'), toast: $('toast')
};

const targets = {
  wise: {label:'WISE 0855', ra:'08h 55m 10.831s', dec:'-07° 14′ 42.53″'},
  barnard: {label:'Barnard’s Star', ra:'17h 57m 48.5s', dec:'+04° 41′ 36″'}
};
let frames = []; // Each frame: { label, src?, demoIndex?, width, height, date?, wavelength? }
let frameIndex = 0, interval = null, blinkMode = false, comparisonOpen = false;
let zoom = 1, panX = 0, panY = 0, isDragging = false, dragStart = null;
let ownedObjectUrls = [];
let toastTimeout = null;

function notify(message) {
  el.toast.textContent = message;
  el.toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.toast.classList.remove('visible'), 3600);
}
function setTarget() {
  const selected = targets[el.target.value];
  if (selected) { el.ra.value = selected.ra; el.dec.value = selected.dec; }
}
function applyCoordinates() {
  const ra = el.ra.value.trim(), dec = el.dec.value.trim();
  if (!ra || !dec) {notify('Enter both RA and Dec, or select an example target.');return;}
  const target = targets[el.target.value];
  el.viewerTitle.textContent = target && target.ra === ra && target.dec === dec ? target.label : 'Custom sky region';
  el.detailRA.textContent = ra;
  el.detailDec.textContent = dec;
  notify('Region label updated. Image data is not yet linked to coordinates.');
}
function releaseImages() {
  ownedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  ownedObjectUrls = [];
}
function stopPlayback() {
  clearInterval(interval); interval = null; blinkMode = false;
  el.play.textContent = '▶ Play'; el.blink.textContent = 'Blink A / B';
}
function loadFrames(newFrames, source) {
  stopPlayback(); releaseImages();
  frames = newFrames; frameIndex = 0; comparisonOpen = false;
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
  el.stageBadge.hidden = !frames.some(f => Number.isInteger(f.demoIndex));
  resetView(); render();
}
async function loadPNGFiles(files) {
  const pngs = Array.from(files).filter(file => file.type === 'image/png' || file.name.toLowerCase().endsWith('.png'));
  if (!pngs.length) {notify('Please select PNG files.');return;}
  pngs.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  // Read dimensions up front. Invalid image files are skipped.
  const valid = [];
  for (const file of pngs) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url;
      await image.decode();
      valid.push({label:file.name, src:url, width:image.naturalWidth, height:image.naturalHeight});
    } catch { URL.revokeObjectURL(url); }
  }
  if (!valid.length) {notify('None of those files could be decoded as PNG images.');return;}
  if (valid.length < pngs.length) notify('Some files were not valid PNG images and were skipped.');
  const dims = new Set(valid.map(f => `${f.width}×${f.height}`));
  if (dims.size > 1) notify('Images have different dimensions. Align and crop them before scientific comparison.');
  // loadFrames releases OLD URLs. Keep new ones after that operation.
  const newUrls = valid.map(f => f.src);
  loadFrames(valid, `${valid.length} local PNG image${valid.length === 1?'':'s'}`);
  ownedObjectUrls = newUrls;
  if (valid.length < 2) notify('Load at least 2 observations to see changes over time.');
}
function buildDemoFrames() {
  // These artificial frames are intentionally not presented as mission observations.
  loadFrames(Array.from({length:6}, (_,i) => ({
    label:`Simulated observation ${i + 1}`,
    demoIndex:i, width:900, height:580,
    date:null, wavelength:null
  })), '6 simulated demo frames');
  notify('Demo loaded: these are NOT real SPHEREx observations.');
}
function renderDemo(canvas, index) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#020611'; ctx.fillRect(0,0,w,h);
  let state = 721;
  const rand = () => {state = (state * 16807) % 2147483647;return (state-1)/2147483646;};
  for (let i=0;i<330;i++) {
    const x=rand()*w,y=rand()*h,r=0.3+rand()*1.65;
    const intensity=Math.floor(140+rand()*110);
    ctx.fillStyle=`rgb(${Math.max(0,intensity-25)},${intensity},${Math.min(255,intensity+10)})`;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  // One moving source. The background stays stationary across frames.
  const x=280+index*48,y=260+index*14;
  const halo=ctx.createRadialGradient(x,y,1,x,y,27);
  halo.addColorStop(0,'#fff4c7');halo.addColorStop(.18,'#ffce86');halo.addColorStop(1,'#ffce8600');
  ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,27,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#66ccff';ctx.lineWidth=1.5;ctx.setLineDash([5,5]);
  ctx.beginPath();ctx.arc(x,y,32,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
}
function render() {
  const f=frames[frameIndex];
  if (!f) {
    el.image.hidden = true; el.canvas.hidden = true; el.empty.hidden = false;
    el.frameLabel.textContent='No images loaded'; el.frameCount.textContent='0 / 0';
    el.detailSource.textContent=el.detailFrame.textContent=el.detailSize.textContent='—';
    el.detailDate.textContent=el.detailWavelength.textContent='Not provided';
    return;
  }
  el.empty.hidden=true;
  if (Number.isInteger(f.demoIndex)) {
    el.image.hidden=true; el.canvas.hidden=false; renderDemo(el.canvas,f.demoIndex);
  } else {
    el.canvas.hidden=true;el.image.hidden=false;el.image.src=f.src;
  }
  el.frameLabel.textContent=f.label;
  el.frameCount.textContent=`${frameIndex+1} / ${frames.length}`;
  el.timeline.value=String(frameIndex);
  el.detailSource.textContent=Number.isInteger(f.demoIndex)?'Simulated demonstration':'Local PNG files';
  el.detailFrame.textContent=f.label;
  el.detailSize.textContent=`${f.width} × ${f.height} px`;
  el.detailDate.textContent=f.date || 'Not provided';
  el.detailWavelength.textContent=f.wavelength || 'Not provided';
  el.stageBadge.hidden=!Number.isInteger(f.demoIndex);
}
function nextFrame() {if(!frames.length)return; frameIndex=(frameIndex+1)%frames.length;render();}
function previousFrame() {if(!frames.length)return;frameIndex=(frameIndex-1+frames.length)%frames.length;render();}
function playbackDelay() {return Number(el.speed.value);}
function startPlayback() {
  if (frames.length<2) {notify('Load at least 2 images to animate.');return;}
  stopPlayback(); el.play.textContent='⏸ Pause';
  interval=setInterval(nextFrame,playbackDelay());
}
function togglePlay() {if(interval && !blinkMode){stopPlayback();return;}startPlayback();}
function renderComparisonFrame(frame, imageEl, canvasEl, labelEl) {
  labelEl.textContent=frame.label;
  if (Number.isInteger(frame.demoIndex)) {
    imageEl.hidden=true;canvasEl.hidden=false;renderDemo(canvasEl,frame.demoIndex);
  } else {
    canvasEl.hidden=true;imageEl.hidden=false;imageEl.src=frame.src;
  }
}
function renderComparison() {
  if (!frames.length) return;
  renderComparisonFrame(frames[Number(el.frameA.value)],el.compareImageA,el.compareCanvasA,el.compareLabelA);
  renderComparisonFrame(frames[Number(el.frameB.value)],el.compareImageB,el.compareCanvasB,el.compareLabelB);
}
function toggleComparison() {
  if (!frames.length) return;
  comparisonOpen=!comparisonOpen;el.compareGrid.hidden=!comparisonOpen;
  el.showCompare.textContent=comparisonOpen?'Hide comparison':'Side by side';
  if(comparisonOpen) renderComparison();
}
function toggleBlink() {
  if (blinkMode) {stopPlayback();return;}
  if (frames.length<2) {notify('Load at least 2 images to blink.');return;}
  stopPlayback(); blinkMode=true;el.blink.textContent='Stop blinking';
  let showA=true;
  function tick() {frameIndex=Number(showA?el.frameA.value:el.frameB.value);showA=!showA;render();}
  tick(); interval=setInterval(tick,playbackDelay());
}
function setZoom(value) {
  zoom=Math.max(1,Math.min(8,value));
  if (zoom===1){panX=0;panY=0;}
  updateTransform();
}
function updateTransform() {
  el.transform.style.transform=`translate(${panX}px, ${panY}px) scale(${zoom})`;
  el.zoomLevel.textContent=`${Math.round(zoom*100)}%`;
}
function resetView(){zoom=1;panX=0;panY=0;updateTransform();}

el.target.addEventListener('change',setTarget);
el.apply.addEventListener('click',applyCoordinates);
el.fileInput.addEventListener('change',async e=>{await loadPNGFiles(e.target.files);e.target.value='';});
el.loadDemo.addEventListener('click',buildDemoFrames);
el.emptyDemo.addEventListener('click',buildDemoFrames);
el.clear.addEventListener('click',()=>loadFrames([],'No images loaded'));
el.play.addEventListener('click',togglePlay);
el.next.addEventListener('click',nextFrame);
el.previous.addEventListener('click',previousFrame);
el.timeline.addEventListener('input',()=>{stopPlayback();frameIndex=Number(el.timeline.value);render();});
el.speed.addEventListener('input',()=>{
  const delay=playbackDelay();el.speedValue.textContent=`${(1000/delay).toFixed(1)}×`;
  if(interval){if(blinkMode){stopPlayback();notify('Speed changed; restart blinking.');}else{startPlayback();}}
});
el.frameA.addEventListener('change',renderComparison);
el.frameB.addEventListener('change',renderComparison);
el.blink.addEventListener('click',toggleBlink);
el.showCompare.addEventListener('click',toggleComparison);
el.crosshairCheck.addEventListener('change',()=>{el.crosshair.hidden=!el.crosshairCheck.checked;});
el.zoomIn.addEventListener('click',()=>setZoom(zoom*1.25));
el.zoomOut.addEventListener('click',()=>setZoom(zoom/1.25));
el.resetView.addEventListener('click',resetView);
el.stage.addEventListener('wheel',e=>{
  if(!frames.length)return;
  e.preventDefault();setZoom(zoom*(e.deltaY<0?1.12:1/1.12));
},{passive:false});
el.stage.addEventListener('pointerdown',e=>{
  if(!frames.length||zoom===1||e.target.closest('button'))return;
  isDragging=true;dragStart={x:e.clientX-panX,y:e.clientY-panY};
  el.stage.setPointerCapture(e.pointerId);el.stage.classList.add('dragging');
});
el.stage.addEventListener('pointermove',e=>{
  if(!isDragging)return;
  panX=e.clientX-dragStart.x;panY=e.clientY-dragStart.y;updateTransform();
});
function stopDrag(){isDragging=false;el.stage.classList.remove('dragging');}
el.stage.addEventListener('pointerup',stopDrag);
el.stage.addEventListener('pointercancel',stopDrag);
render();
