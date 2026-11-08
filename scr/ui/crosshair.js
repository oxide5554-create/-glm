// scr/ui/crosshair.js
// ✅ Динамический прицел: точка по центру + 4 палки (квадрат), показывающие разброс.

const CSS_ID = 'dynamic-crosshair-style';
const CSS = `
#dyn-crosshair {
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  z-index: 8; pointer-events: none;
  width: 200px; height: 200px;
  display: none;
}
#dyn-crosshair.visible { display: block; }
#dyn-crosshair.aiming .ch-dot { opacity: 0; }
#dyn-crosshair.aiming .ch-stick { opacity: 0.5; }

.ch-dot {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 3px; height: 3px;
  background: #fff;
  border-radius: 50%;
  mix-blend-mode: difference;
  transition: opacity 0.15s;
  box-shadow: 0 0 2px #000;
}
.ch-stick {
  position: absolute;
  background: #fff;
  mix-blend-mode: difference;
  transition: opacity 0.15s;
  box-shadow: 0 0 1px #000;
}
.ch-stick.v { width: 2px; height: 8px; left: 50%; transform: translateX(-50%); }
.ch-stick.h { width: 8px; height: 2px; top: 50%; transform: translateY(-50%); }
.ch-stick.top    { top: 50%; }
.ch-stick.bottom { bottom: 50%; }
.ch-stick.left   { left: 50%; }
.ch-stick.right  { right: 50%; }
`;

let crosshairEl = null;
let dotEl = null;
let sticks = [];
let currentSpread = 8;
let targetSpread = 8;
let isVisible = false;

function ensureCrosshair() {
  if (crosshairEl) return;
  if (!document.getElementById(CSS_ID)) {
    const st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  crosshairEl = document.createElement('div');
  crosshairEl.id = 'dyn-crosshair';
  crosshairEl.innerHTML = `
    <div class="ch-dot"></div>
    <div class="ch-stick v top"></div>
    <div class="ch-stick v bottom"></div>
    <div class="ch-stick h left"></div>
    <div class="ch-stick h right"></div>
  `;
  document.body.appendChild(crosshairEl);
  dotEl = crosshairEl.querySelector('.ch-dot');
  sticks = Array.from(crosshairEl.querySelectorAll('.ch-stick'));
}

function applySpread(spread) {
  const s = Math.max(2, spread);
  sticks[0].style.top = `calc(50% - ${s}px)`;
  sticks[1].style.bottom = `calc(50% - ${s}px)`;
  sticks[2].style.left = `calc(50% - ${s}px)`;
  sticks[3].style.right = `calc(50% - ${s}px)`;
}

export function showCrosshair(on, aiming = false) {
  ensureCrosshair();
  isVisible = on;
  if (on) {
    crosshairEl.classList.add('visible');
    if (aiming) crosshairEl.classList.add('aiming');
    else crosshairEl.classList.remove('aiming');
  } else {
    crosshairEl.classList.remove('visible', 'aiming');
  }
}

export function setSpread(spread) {
  targetSpread = spread;
}

export function updateCrosshair(dt, state = {}) {
  ensureCrosshair();
  if (!isVisible) return;
  let base = 8;
  if (state.weapon === 'ak47') base = 10;
  else if (state.weapon === 'berdana') base = 6;
  let spread = base;
  if (state.moving) spread += 6;
  if (state.jumping) spread += 20;
  if (state.running) spread += 15;
  if (state.shooting) spread += 12;
  if (state.crouching) spread -= 4;
  if (state.aiming) spread -= 6;
  if (state.crouching && state.aiming) spread = Math.min(spread, 2);
  spread = Math.max(2, Math.min(60, spread));
  targetSpread = spread;
  const lerp = Math.min(1, dt * 12);
  currentSpread += (targetSpread - currentSpread) * lerp;
  applySpread(currentSpread);
  if (state.aiming) crosshairEl.classList.add('aiming');
  else crosshairEl.classList.remove('aiming');
}

export function recoilBoost(amount = 12) {
  targetSpread = Math.min(60, targetSpread + amount);
}

export function isCrosshairVisible() { return isVisible; }
export function getCurrentSpread() { return currentSpread; }
