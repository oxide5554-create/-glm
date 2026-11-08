// scr/ui/settings.js — МЕНЮ НАСТРОЕК (F2): Графика / Управление / Сеть
// Все настройки РЕАЛЬНО влияют на рендер и FPS:
//  • «Графика от видеокарты» — bloom + тени + сглаживание + объёмные облака (GPU-работа)
//  • Стиль картинки — тонмаппинг/экспозиция/цветокоррекция/bloom (обычная / кино / реальная)
//  • Качество текстур — фильтрация + анизотропия (пиксели / мыло / чётко)
//  • Зона прорисовки — дистанция culling объектов + туман
//  • Стиль неба — GPU-шейдер облаков / квадратные облака / без облаков
//  • Чувствительность мыши — PointerLockControls.pointerSpeed
//  • Клавиши — переназначение без конфликтов (перехват событий)
//  • FPS-панель — вкл/выкл + размер; автооптимизация — адаптивное качество

import * as THREE from 'three';

const STORAGE_KEY = 'rustclone_settings_v1';

// ============================================================
//  СОСТОЯНИЕ
// ============================================================
// Канонические коды, которые игра ждёт внутри себя (не меняем движок —
// перехватываем и переводим клавиши на лету, см. translateEvent)
const CANON = {
    forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD',
    jump: 'Space', sprint: 'ShiftLeft', crouch: 'KeyC',
    inventory: 'Tab', chat: 'Enter', interact: 'KeyF',
    craftmenu: 'KeyQ', buildmenu: 'KeyZ', reload: 'KeyR',
};
// Доп. коды, которые игра жёстко зашила для тех же действий (глушим при переназначении)
const CANON_EXTRA = { sprint: ['ShiftRight'] };

const DEFAULTS = {
    gpu: true,        // «Графика от видеокарты» — красивый тяжёлый рендер
    style: 'normal',  // normal | cinema | real
    tex: 80,          // качество текстур 1..100
    zone: 100,        // зона прорисовки 10..150 (%)
    sky: 'gpu',       // gpu | square | none
    sens: 55,         // чувствительность мыши 10..100
    fpsPanel: true,   // показывать панель FPS
    fpsScale: 100,    // размер панели FPS 70..200 %
    autoOpt: true,   // автооптимизация под FPS
    binds: { ...CANON },
};

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));
        const p = JSON.parse(raw);
        return { ...JSON.parse(JSON.stringify(DEFAULTS)), ...p, binds: { ...DEFAULTS.binds, ...(p.binds || {}) } };
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULTS)); }
}
function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch (e) {}
}

let S = loadState();

// производные карты клавиш
let bindsByCode = new Map();   // физический код → действие
let disabledCodes = new Set(); // старые «родные» коды, которые теперь мертвы
function rebuildBindMaps() {
    bindsByCode = new Map();
    for (const [act, code] of Object.entries(S.binds)) bindsByCode.set(code, act);
    disabledCodes = new Set();
    for (const [act, canon] of Object.entries(CANON)) {
        if (S.binds[act] !== canon) {
            disabledCodes.add(canon);
            for (const extra of (CANON_EXTRA[act] || [])) disabledCodes.add(extra);
        }
    }
}
rebuildBindMaps();

// ============================================================
//  ХУКИ В ИГРУ (заполняются из main.js через initSettings)
// ============================================================
let H = null; // { renderer, scene, sun, controls, bloomPass, fxaaPass, gradingPass, QUALITY, applyQuality, perf, fpsEl, skySystem, setDrawZone, showToast, showOverlay }

// ============================================================
//  ПРИМЕНЕНИЕ НАСТРОЕК (реальные эффекты)
// ============================================================
const STYLES = {
    //        тонмаппинг      экспозиция  контраст  насыщ.  яркость  bloom [сила, радиус, порог]
    normal: { tone: 'ACES',   exposure: 1.00, contrast: 1.05, saturation: 1.03, brightness: 1.00, bloom: [0.22, 0.40, 0.88] },
    cinema: { tone: 'ACES',   exposure: 0.92, contrast: 1.18, saturation: 1.15, brightness: 0.96, bloom: [0.50, 0.55, 0.80] },
    real:   { tone: 'Linear', exposure: 1.05, contrast: 1.00, saturation: 1.00, brightness: 1.00, bloom: [0.10, 0.30, 0.95] },
};

function applyStyle(silent) {
    if (!H) return;
    const st = STYLES[S.style] || STYLES.normal;
    const r = H.renderer;
    r.toneMapping = st.tone === 'Linear' ? THREE.LinearToneMapping : THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = st.exposure;
    const u = H.gradingPass.uniforms;
    u.uContrast.value = st.contrast;
    u.uSaturation.value = st.saturation;
    u.uBrightness.value = st.brightness;
    H.bloomPass.strength = st.bloom[0];
    H.bloomPass.radius = st.bloom[1];
    H.bloomPass.threshold = st.bloom[2];
    if (!silent) showToastSafe(`🎨 Стиль: ${S.style === 'normal' ? 'Обычная' : S.style === 'cinema' ? 'Кино' : 'Реальная'}`);
}

function applyGpu(silent) {
    if (!H) return;
    H.perf.gpuOn = S.gpu; // ✅ автооптимизация не должна включать тени при выключенном GPU-режиме
    if (S.gpu) {
        H.fxaaPass.enabled = true;
        H.applyQuality(); // тени + bloom возвращаются по текущему уровню качества
    } else {
        H.bloomPass.enabled = false;  // свечение — GPU-работа
        H.fxaaPass.enabled = false;   // сглаживание — GPU-работа
        H.sun.castShadow = false;     // теневой проход пропускается целиком
    }
    applySky();
    if (!silent) showToastSafe(S.gpu ? '🟢 Графика от видеокарты: ВКЛ' : '⚫ Графика от видеокарты: ВЫКЛ (макс. FPS)');
}

function applySky() {
    if (!H || !H.skySystem || !H.skySystem.skyMesh || !H.skySystem.skyMaterials) return;
    const key = (S.sky === 'gpu' && !S.gpu) ? 'square' : S.sky; // без GPU объёмные облака не тянут
    const mat = H.skySystem.skyMaterials[key] || H.skySystem.skyMaterials.gpu;
    if (H.skySystem.skyMesh.material !== mat) H.skySystem.skyMesh.material = mat;
}

// Качество текстур: фильтры + анизотропия — честная GPU-текстурная работа
let _texTimer = 0;
function applyTexQuality() {
    if (!H) return;
    clearTimeout(_texTimer);
    _texTimer = setTimeout(() => {
        if (!H) return;
        const maxA = H.renderer.capabilities.getMaxAnisotropy();
        let mag, min, aniso;
        if (S.tex < 30)        { mag = THREE.NearestFilter; min = THREE.NearestFilter; aniso = 1; }                 // пиксели
        else if (S.tex < 70)   { mag = THREE.LinearFilter; min = THREE.LinearMipmapLinearFilter; aniso = 1 + ((S.tex - 30) / 40) * 2; } // мыло
        else if (S.tex <= 85)  { mag = THREE.LinearFilter; min = THREE.LinearMipmapLinearFilter; aniso = 4; }                 // обычная
        else                   { mag = THREE.LinearFilter; min = THREE.LinearMipmapLinearFilter; aniso = maxA; }              // чётко, каждый пиксель
        aniso = Math.max(1, Math.min(maxA, Math.round(aniso)));
        H.scene.traverse((o) => {
            if (!o.material) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
                if (!m) continue;
                for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
                    const t = m[k];
                    if (t && t.isTexture) {
                        let changed = false;
                        if (t.magFilter !== mag) { t.magFilter = mag; changed = true; }
                        if (t.minFilter !== min) { t.minFilter = min; changed = true; }
                        if (t.anisotropy !== aniso) { t.anisotropy = aniso; changed = true; }
                        if (changed) t.needsUpdate = true;
                    }
                }
            }
        });
    }, 140);
}

function applyZone() {
    if (!H || !H.setDrawZone) return;
    H.setDrawZone(S.zone / 100); // 10..150 → множитель 0.1..1.5
}

function applySens() {
    if (!H || !H.controls) return;
    H.controls.pointerSpeed = S.sens / 55; // 55 = как было в игре (pointerSpeed 1.0)
}

function applyFpsPanel() {
    if (!H || !H.fpsEl) return;
    H.perf.enabled = S.fpsPanel;
    H.fpsEl.style.display = S.fpsPanel ? '' : 'none';
}
function applyFpsScale() {
    if (!H || !H.fpsEl) return;
    H.fpsEl.style.transformOrigin = 'top right';
    H.fpsEl.style.transform = `scale(${(S.fpsScale / 100).toFixed(2)})`;
}
function applyAutoOpt() {
    if (!H || !H.perf) return;
    H.perf.auto = S.autoOpt;
}

function showToastSafe(msg) {
    if (H && H.showToast) H.showToast(msg);
}

// ============================================================
//  ПЕРЕХВАТ КЛАВИШ (перевод + глушение старых значений)
// ============================================================
function isTypingTarget(e) {
    const t = e.target;
    return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
}

function translateEvent(e) {
    if (bindsByCode.has(e.code)) {
        const act = bindsByCode.get(e.code);
        const canon = CANON[act];
        if (canon && canon !== e.code) {
            try { Object.defineProperty(e, 'code', { value: canon, configurable: true }); } catch (err) {}
        }
        return false; // пропускаем дальше (уже с правильным кодом)
    }
    if (disabledCodes.has(e.code)) {
        // старая «родная» клавиша действия, которое переназначили — глушим
        e.stopImmediatePropagation();
        e.preventDefault();
        return true;
    }
    return false;
}

// ============================================================
//  UI — СТИЛИ (нарисованный игровой интерфейс, не «пустая страница»)
// ============================================================
const CSS = `
#rcs-root{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;
  background:rgba(5,8,12,.72);backdrop-filter:blur(6px);font-family:Consolas,monospace;}
#rcs-root.open{display:flex;animation:rcsFade .18s ease-out}
.rcs-panel{width:min(920px,94vw);max-height:88vh;display:flex;flex-direction:column;position:relative;
  background:linear-gradient(160deg,#232b35 0%,#181f27 55%,#12171e 100%);
  border:2px solid #46586c;border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.06);
  animation:rcsPop .2s ease-out;color:#cfd8e3;overflow:hidden}
.rcs-panel::before{content:'';position:absolute;inset:0;pointer-events:none;border-radius:12px;
  background:repeating-linear-gradient(90deg,rgba(255,255,255,.015) 0 2px,transparent 2px 7px);}
.rcs-head{display:flex;align-items:center;gap:14px;padding:16px 20px 12px;border-bottom:2px solid #2c3742;position:relative}
.rcs-logo{width:44px;height:44px;border-radius:10px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:24px;
  background:linear-gradient(160deg,#e0683f,#a03a1e);box-shadow:inset 0 2px 3px rgba(255,255,255,.35),0 4px 12px rgba(224,104,63,.35)}
.rcs-title{font-size:22px;font-weight:bold;letter-spacing:4px;color:#f2f5f8;text-shadow:0 2px 0 #000}
.rcs-sub{font-size:11px;color:#8494a5;letter-spacing:1px;margin-top:2px}
.rcs-close{margin-left:auto;width:38px;height:38px;border-radius:9px;border:2px solid #46586c;cursor:pointer;
  background:linear-gradient(180deg,#3a4756,#252e39);color:#cfd8e3;font-size:17px;font-weight:bold;transition:.15s}
.rcs-close:hover{background:linear-gradient(180deg,#8a3220,#5e2114);border-color:#e0683f;color:#fff}
.rcs-tabs{display:flex;gap:8px;padding:10px 20px 0}
.rcs-tab{flex:0 0 auto;padding:10px 26px 12px;border:2px solid #33414f;border-bottom:none;border-radius:10px 10px 0 0;cursor:pointer;
  background:linear-gradient(180deg,#222b35,#1a222b);color:#8fa0b3;font-size:14px;font-weight:bold;letter-spacing:1px;transition:.15s;position:relative;top:2px}
.rcs-tab:hover{color:#e8eef5;background:linear-gradient(180deg,#2a3542,#202a35)}
.rcs-tab.active{color:#ffb38f;background:linear-gradient(180deg,#313e4d,#232d39);border-color:#e0683f;
  box-shadow:0 -3px 14px rgba(224,104,63,.25);top:0;padding-bottom:14px}
.rcs-body{flex:1;overflow-y:auto;padding:16px 20px 8px;border-top:2px solid #46586c;scrollbar-width:thin;scrollbar-color:#46586c #12171e}
.rcs-body::-webkit-scrollbar{width:10px}
.rcs-body::-webkit-scrollbar-thumb{background:#3a4756;border-radius:6px;border:2px solid #12171e}
.rcs-body::-webkit-scrollbar-track{background:#12171e}
.rcs-sec{font-size:12px;font-weight:bold;letter-spacing:2.5px;color:#e0683f;margin:16px 0 10px;display:flex;align-items:center;gap:10px}
.rcs-sec::after{content:'';flex:1;height:2px;background:linear-gradient(90deg,#e0683f55,transparent)}
.rcs-row{display:flex;align-items:center;gap:16px;padding:13px 14px;margin-bottom:8px;border:2px solid #2c3742;border-radius:10px;
  background:linear-gradient(180deg,#1e2630,#192028);transition:.15s}
.rcs-row:hover{border-color:#3d4d5f;background:linear-gradient(180deg,#232c37,#1c242e)}
.rcs-row-info{flex:1;min-width:0}
.rcs-row-name{font-size:14px;font-weight:bold;color:#e8eef5;margin-bottom:3px}
.rcs-row-desc{font-size:11.5px;color:#8494a5;line-height:1.45}
.rcs-gpuname{font-size:11px;color:#6fae6f;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* переключатель с анимацией */
.rcs-switch{flex:0 0 auto;width:58px;height:30px;border-radius:16px;border:2px solid #46586c;cursor:pointer;position:relative;
  background:linear-gradient(180deg,#161c23,#10151b);transition:.25s;box-shadow:inset 0 2px 6px rgba(0,0,0,.6)}
.rcs-switch::after{content:'';position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;transition:.25s cubic-bezier(.5,1.6,.4,1);
  background:linear-gradient(180deg,#7a8a99,#4a5561);box-shadow:0 2px 5px rgba(0,0,0,.5)}
.rcs-switch.on{background:linear-gradient(180deg,#e0683f,#b04a24);border-color:#ff8a55;box-shadow:inset 0 2px 6px rgba(0,0,0,.35),0 0 14px rgba(224,104,63,.45)}
.rcs-switch.on::after{left:30px;background:linear-gradient(180deg,#fff,#ffd9c4)}
/* слайдеры */
.rcs-slider-wrap{flex:1.2;min-width:230px}
.rcs-slider{-webkit-appearance:none;appearance:none;width:100%;height:8px;border-radius:5px;outline:none;cursor:pointer;
  background:linear-gradient(90deg,#e0683f 0%,#e0683f var(--p,50%),#242e39 var(--p,50%));box-shadow:inset 0 1px 3px rgba(0,0,0,.6)}
.rcs-slider::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;cursor:grab;
  background:linear-gradient(180deg,#f5f8fb,#b9c6d2);border:3px solid #e0683f;box-shadow:0 2px 8px rgba(0,0,0,.55),0 0 10px rgba(224,104,63,.35);transition:.12s}
.rcs-slider::-webkit-slider-thumb:hover{transform:scale(1.15);box-shadow:0 2px 8px rgba(0,0,0,.55),0 0 18px rgba(224,104,63,.6)}
.rcs-slider::-moz-range-thumb{width:16px;height:16px;border-radius:50%;cursor:grab;background:#f0f3f6;border:3px solid #e0683f}
.rcs-slider-val{flex:0 0 76px;text-align:center;font-size:15px;font-weight:bold;color:#ffb38f;background:#10151b;border:2px solid #2c3742;border-radius:8px;padding:6px 0}
.rcs-slider-zones{display:flex;justify-content:space-between;font-size:9.5px;color:#5f6f80;margin-top:5px;letter-spacing:.5px}
/* карточки выбора */
.rcs-cards{display:flex;gap:12px;flex-wrap:wrap}
.rcs-card{flex:1 1 0;min-width:170px;max-width:250px;border:2px solid #33414f;border-radius:12px;cursor:pointer;overflow:hidden;
  background:#1a222b;transition:.18s;position:relative}
.rcs-card:hover{transform:translateY(-3px);border-color:#5a6d82;box-shadow:0 8px 20px rgba(0,0,0,.45)}
.rcs-card.sel{border-color:#e0683f;box-shadow:0 0 0 1px #e0683f,0 0 20px rgba(224,104,63,.35)}
.rcs-card.sel::after{content:'✔ ВЫБРАНО';position:absolute;top:8px;right:8px;background:#e0683f;color:#fff;font-size:9px;font-weight:bold;
  padding:3px 7px;border-radius:6px;letter-spacing:1px;box-shadow:0 2px 6px rgba(0,0,0,.4)}
.rcs-card-art{height:92px;position:relative;overflow:hidden;border-bottom:2px solid #10151b}
.rcs-card-name{padding:9px 10px;font-size:12.5px;font-weight:bold;color:#dbe4ee;text-align:center;letter-spacing:.5px}
.rcs-card-desc{padding:0 10px 10px;font-size:10px;color:#7e8fa1;text-align:center;line-height:1.4}
/* миниатюры стилей картинки */
.art-normal{background:linear-gradient(180deg,#6fa8dd 0%,#a9cde6 46%,#5d8f4b 54%,#3c6a30 100%)}
.art-normal::before{content:'';position:absolute;top:14px;left:16px;width:26px;height:26px;border-radius:50%;
  background:radial-gradient(circle,#fffbe8,#ffe9a8 60%,transparent 70%);filter:blur(1px)}
.art-normal::after{content:'';position:absolute;top:20px;right:12px;width:54px;height:16px;border-radius:10px;background:rgba(255,255,255,.75);filter:blur(2px)}
.art-cinema{background:linear-gradient(180deg,#1d3a55 0%,#0d141c 55%,#402413 100%)}
.art-cinema::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 70% 78%,rgba(224,120,50,.5),transparent 55%)}
.art-cinema::after{content:'';position:absolute;left:0;right:0;height:12px;background:#000;top:0;box-shadow:0 80px 0 #000}
.art-real{background:linear-gradient(180deg,#93a9bd 0%,#8fa08a 50%,#54654a 100%);filter:saturate(.85)}
.art-real::before{content:'';position:absolute;top:10px;right:18px;width:20px;height:20px;border-radius:50%;background:#f4f6f2;opacity:.9}
.art-real::after{content:'';position:absolute;bottom:0;left:0;right:0;height:34px;background:linear-gradient(180deg,transparent,#3d4a34)}
/* миниатюры неба */
.art-sky-base{background:linear-gradient(180deg,#3f7ec2 0%,#7fb2e2 55%,#b8d7ef 100%)}
.art-sky-base::after{content:'';position:absolute;bottom:0;left:0;right:0;height:22px;background:#3c6a30}
.art-square::before{content:'';position:absolute;top:18px;left:14px;width:22px;height:22px;background:#fff;box-shadow:34px 8px 0 #fff,78px -6px 0 #fff,30px 40px 0 12px #fff;opacity:.92}
.art-none::before{content:'';position:absolute;top:16px;right:20px;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle,#fffce0,#ffe9a8 65%,transparent 72%)}
.art-gpu::before{content:'';position:absolute;top:14px;left:10px;width:40px;height:22px;border-radius:12px;background:rgba(255,255,255,.95);filter:blur(4px)}
.art-gpu::after{content:'';position:absolute;top:30px;left:70px;width:56px;height:26px;border-radius:14px;background:rgba(255,255,255,.85);filter:blur(5px)}
/* клавиши */
.rcs-key{flex:0 0 auto;min-width:86px;text-align:center;padding:9px 14px;font-size:13px;font-weight:bold;color:#e8eef5;cursor:pointer;
  background:linear-gradient(180deg,#39434f,#232b35);border:2px solid #55697f;border-bottom-width:4px;border-radius:9px;transition:.12s;letter-spacing:1px}
.rcs-key:hover{border-color:#e0683f;color:#ffb38f}
.rcs-key.listening{background:linear-gradient(180deg,#e0683f,#a03a1e);border-color:#ffb38f;color:#fff;animation:rcsPulse 1s infinite}
.rcs-key.dup{background:linear-gradient(180deg,#8a2216,#5e140c);border-color:#ff5a4d;animation:rcsShake .35s}
.rcs-reset{padding:10px 18px;font-size:12px;font-weight:bold;letter-spacing:1px;color:#cfd8e3;cursor:pointer;
  background:linear-gradient(180deg,#3a4756,#252e39);border:2px solid #46586c;border-radius:9px;transition:.15s}
.rcs-reset:hover{border-color:#e0683f;color:#ffb38f}
.rcs-foot{display:flex;gap:18px;justify-content:center;padding:10px;border-top:2px solid #2c3742;font-size:11px;color:#7e8fa1;letter-spacing:1px}
.rcs-foot b{color:#ffb38f}
@keyframes rcsFade{from{opacity:0}to{opacity:1}}
@keyframes rcsPop{from{transform:scale(.94) translateY(12px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
@keyframes rcsPulse{0%,100%{box-shadow:0 0 0 0 rgba(224,104,63,.5)}50%{box-shadow:0 0 0 8px rgba(224,104,63,0)}}
@keyframes rcsShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
`;

// ============================================================
//  UI — ПОСТРОЕНИЕ
// ============================================================
let root = null, bodyEl = null, tabBtns = null, panes = null;
let activeTab = 'gfx';
let listeningAction = null; // действие, для которого ждём клавишу

const ACTIONS = [
    { id: 'forward',    name: 'Вперёд',        desc: 'Движение вперёд (W / ↑)' },
    { id: 'backward',   name: 'Назад',         desc: 'Движение назад (S / ↓)' },
    { id: 'left',       name: 'Влево',         desc: 'Движение влево (A / ←)' },
    { id: 'right',      name: 'Вправо',        desc: 'Движение вправо (D / →)' },
    { id: 'jump',       name: 'Прыжок',        desc: 'Прыжок' },
    { id: 'sprint',     name: 'Бег',           desc: 'Ускорение (Shift по умолчанию)' },
    { id: 'crouch',     name: 'Присяд',        desc: 'Присесть / встать' },
    { id: 'inventory',  name: 'Инвентарь',     desc: 'Открыть инвентарь' },
    { id: 'chat',       name: 'Чат',           desc: 'Написать в чат' },
    { id: 'interact',   name: 'Взаимодействие', desc: 'Двери, сундуки, багги, заправка' },
    { id: 'craftmenu',  name: 'Крафт',         desc: 'Меню крафта' },
    { id: 'buildmenu',  name: 'Строительство', desc: 'Меню постройки (чертёж в руках)' },
    { id: 'reload',     name: 'Перезарядка',   desc: 'Перезарядка оружия' },
];

const KEY_LABELS = {
    Space: 'Пробел', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
    AltLeft: 'L Alt', AltRight: 'R Alt', Tab: 'Tab', Enter: 'Enter', Escape: 'Esc', Backspace: 'Backspace',
    CapsLock: 'CapsLock', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Delete: 'Del',
    Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`', Comma: ',', Period: '.',
    Slash: '/', Backslash: '\\', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *',
    NumpadDivide: 'Num /', NumpadEnter: 'Num Enter', NumpadDecimal: 'Num .',
};
function keyLabel(code) {
    if (KEY_LABELS[code]) return KEY_LABELS[code];
    if (/^Key/.test(code)) return code.slice(3);
    if (/^Digit/.test(code)) return code.slice(5);
    if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
    if (/^F\d+$/.test(code)) return code;
    return code;
}

function el(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
}

function buildDOM() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    root = el('div', null); root.id = 'rcs-root';
    const panel = el('div', 'rcs-panel');
    // ✅ SVG иконки (заменяют эмодзи в шапке и вкладках)
    const SVG = {
      gear: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
      gfx: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><circle cx="8" cy="9" r="1.5" fill="currentColor"/><circle cx="15" cy="11" r="1.5" fill="currentColor"/></svg>`,
      ctl: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="6"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="18" cy="13" r="1" fill="currentColor"/></svg>`,
      net: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 L2 7 L12 12 L22 7 Z"/><path d="M2 17 L12 22 L22 17"/><path d="M2 12 L12 17 L22 12"/></svg>`,
      close: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`,
    };
    panel.innerHTML = `
      <div class="rcs-head">
        <div class="rcs-logo">${SVG.gear}</div>
        <div>
          <div class="rcs-title">НАСТРОЙКИ</div>
          <div class="rcs-sub">RustClone MP • всё применяется сразу и сохраняется</div>
        </div>
        <button class="rcs-close" title="Закрыть (F2)">${SVG.close}</button>
      </div>
      <div class="rcs-tabs">
        <button class="rcs-tab active" data-tab="gfx">${SVG.gfx} ГРАФИКА</button>
        <button class="rcs-tab" data-tab="ctl">${SVG.ctl} УПРАВЛЕНИЕ</button>
        <button class="rcs-tab" data-tab="net">${SVG.net} СЕТЬ</button>
      </div>`;
    bodyEl = el('div', 'rcs-body');
    panel.appendChild(bodyEl);
    const foot = el('div', 'rcs-foot',
        `<span><b>F2</b> — закрыть</span><span><b>Esc</b> — закрыть</span><span>настройки сохраняются автоматически</span>`);
    panel.appendChild(foot);
    root.appendChild(panel);
    document.body.appendChild(root);

    tabBtns = [...panel.querySelectorAll('.rcs-tab')];
    tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    panel.querySelector('.rcs-close').addEventListener('click', () => closeSettings());
    root.addEventListener('mousedown', (e) => { if (e.target === root) closeSettings(); });

    panes = { gfx: el('div'), ctl: el('div'), net: el('div') };
    buildGfxPane(panes.gfx);
    buildCtlPane(panes.ctl);
    buildNetPane(panes.net);
    bodyEl.appendChild(panes.gfx); bodyEl.appendChild(panes.ctl); bodyEl.appendChild(panes.net);
    switchTab('gfx');
}

function switchTab(t) {
    activeTab = t;
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    for (const k of Object.keys(panes)) panes[k].style.display = (k === t) ? '' : 'none';
}

// --- элементы управления ---
function rowToggle(parent, name, desc, get, set) {
    const row = el('div', 'rcs-row');
    const info = el('div', 'rcs-row-info', `<div class="rcs-row-name">${name}</div><div class="rcs-row-desc">${desc}</div>`);
    const sw = el('div', 'rcs-switch' + (get() ? ' on' : ''));
    sw.addEventListener('click', () => {
        set(!get());
        sw.classList.toggle('on', get());
    });
    row.appendChild(info); row.appendChild(sw);
    parent.appendChild(row);
    return { row, sw };
}

function rowSlider(parent, name, desc, min, max, step, get, set, zoneTexts) {
    const row = el('div', 'rcs-row');
    const info = el('div', 'rcs-row-info', `<div class="rcs-row-name">${name}</div><div class="rcs-row-desc">${desc}</div>`);
    const wrap = el('div', 'rcs-slider-wrap');
    const inp = document.createElement('input');
    inp.type = 'range'; inp.className = 'rcs-slider'; inp.min = min; inp.max = max; inp.step = step; inp.value = get();
    const paint = () => inp.style.setProperty('--p', (((inp.value - min) / (max - min)) * 100).toFixed(1) + '%');
    paint();
    const val = el('div', 'rcs-slider-val', String(get()));
    let deb = 0;
    inp.addEventListener('input', () => {
        val.textContent = inp.value;
        paint();
        set(Number(inp.value), false);
        clearTimeout(deb);
        deb = setTimeout(() => set(Number(inp.value), true), 150); // финальное применение
    });
    wrap.appendChild(inp);
    if (zoneTexts) wrap.appendChild(el('div', 'rcs-slider-zones', zoneTexts.map(z => `<span>${z}</span>`).join('')));
    row.appendChild(info); row.appendChild(wrap); row.appendChild(val);
    parent.appendChild(row);
    return { row, inp, val, paint };
}

function cardsRow(parent, cards, get, set) {
    const wrap = el('div', 'rcs-cards');
    const els = [];
    for (const c of cards) {
        const card = el('div', 'rcs-card');
        card.innerHTML = `<div class="rcs-card-art ${c.art}"></div><div class="rcs-card-name">${c.name}</div><div class="rcs-card-desc">${c.desc}</div>`;
        card.addEventListener('click', () => { set(c.id); syncCards(); });
        wrap.appendChild(card); els.push({ c, card });
    }
    function syncCards() {
        for (const { c, card } of els) card.classList.toggle('sel', get() === c.id);
    }
    syncCards();
    const holder = el('div');
    holder.appendChild(wrap);
    parent.appendChild(holder);
    return { syncCards };
}

// --- ВКЛАДКА: ГРАФИКА ---
let gpuNameStr = 'неизвестно';
function detectGPU() {
    try {
        const gl = H.renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        gpuNameStr = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
            .replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 70);
    } catch (e) {}
}

let cardsStyleSync = null, cardsSkySync = null;
function buildGfxPane(p) {
    // 1. Графика от видеокарты
    const t = rowToggle(p, '⚡ Графика от видеокарты',
        'Красивая картинка за счёт GPU: свечение (bloom), мягкие тени, сглаживание, объёмные облака. Включай, если видеокарта и видеопамять позволяют. Выключено — максимальный FPS на слабых машинах.',
        () => S.gpu, (v) => { S.gpu = v; saveState(); applyGpu(false); });
    const row = t.row;
    const gn = el('div', 'rcs-gpuname', `Видеокарта: ${gpuNameStr} • анизотропия до ${H.renderer.capabilities.getMaxAnisotropy()}x`);
    row.querySelector('.rcs-row-info').appendChild(gn);

    // 2. Стиль картинки
    const sec1 = el('div', 'rcs-sec', 'СТИЛЬ КАРТИНКИ'); p.appendChild(sec1);
    cardsStyleSync = cardsRow(p, [
        { id: 'normal', name: 'ОБЫЧНАЯ', desc: 'Стандартная картинка игры', art: 'art-normal' },
        { id: 'cinema', name: 'КИНО', desc: 'Контраст, глубина, свечение', art: 'art-cinema' },
        { id: 'real',   name: 'РЕАЛЬНАЯ', desc: 'Естественные цвета, как в жизни', art: 'art-real' },
    ], () => S.style, (v) => { S.style = v; saveState(); applyStyle(false); }).syncCards;

    // 3. Качество текстур
    const sec2 = el('div', 'rcs-sec', 'ТЕКСТУРЫ'); p.appendChild(sec2);
    rowSlider(p, '🧱 Качество текстур',
        '1–29 пиксельная ретро-текстура • 30–69 мыльная • 70–85 обычная • 90–100 чёткая детализация каждого пикселя',
        1, 100, 1, () => S.tex,
        (v, final) => { S.tex = v; if (final) { saveState(); applyTexQuality(); } },
        ['пиксели', 'мыло', 'обычная', 'чётко']);

    // 4. Зона прорисовки
    const sec3 = el('div', 'rcs-sec', 'ПРОРИСОВКА'); p.appendChild(sec3);
    rowSlider(p, '🗺 Зона прорисовки объектов',
        'Как далеко видно объекты (деревья, машины, постройки). Меньше зона — выше FPS, дальше — красивее обзор. 100 = стандарт игры',
        25, 150, 1, () => S.zone,
        (v, final) => { S.zone = v; if (final) { saveState(); applyZone(); } else applyZone(); },
        ['25', '50', '100', '150']);

    // 5. Стиль неба
    const sec4 = el('div', 'rcs-sec', 'СТИЛЬ НЕБА'); p.appendChild(sec4);
    cardsSkySync = cardsRow(p, [
        { id: 'square', name: 'КВАДРАТНЫЕ ОБЛАКА', desc: 'Лёгкие блочные облака, минимум нагрузки', art: 'art-sky-base art-square' },
        { id: 'none',   name: 'БЕЗ ОБЛАКОВ', desc: 'Чистое небо, максимальный FPS', art: 'art-sky-base art-none' },
        { id: 'gpu',    name: 'ОБЛАКА ОТ ВИДЕОКАРТЫ', desc: 'Объёмные облака на GPU — смотря какая видеокарта', art: 'art-sky-base art-gpu' },
    ], () => S.sky, (v) => { S.sky = v; saveState(); applySky(); showToastSafe('Небо: ' + (v === 'gpu' ? 'объёмные облака' : v === 'square' ? 'квадратные облака' : 'без облаков')); }).syncCards;
}

// ✅ SVG иконки для вкладки управления (заменяют эмодзи)
const CTL_SVG = {
  mouse: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><rect x="6" y="3" width="12" height="18" rx="6"/><line x1="12" y1="7" x2="12" y2="11"/></svg>`,
  kb: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/></svg>`,
};
// --- ВКЛАДКА: УПРАВЛЕНИЕ ---
let bindKeyEls = {};
function buildCtlPane(p) {
    const sec0 = el('div', 'rcs-sec', 'МЫШЬ'); p.appendChild(sec0);
    rowSlider(p, CTL_SVG.mouse + 'Чувствительность мыши',
        'Насколько резко камера реагирует на движение мыши. 55 — стандарт игры',
        10, 100, 1, () => S.sens,
        (v, final) => { S.sens = v; applySens(); if (final) saveState(); },
        ['10', '55', '100']);

    const sec1 = el('div', 'rcs-sec', 'КЛАВИШИ — нажми на кнопку и нажми новую клавишу'); p.appendChild(sec1);
    bindKeyEls = {};
    for (const a of ACTIONS) {
        const row = el('div', 'rcs-row');
        const info = el('div', 'rcs-row-info', `<div class="rcs-row-name">${a.name}</div><div class="rcs-row-desc">${a.desc}</div>`);
        const key = el('div', 'rcs-key', keyLabel(S.binds[a.id]));
        key.addEventListener('click', () => startListening(a.id, key));
        bindKeyEls[a.id] = key;
        row.appendChild(info); row.appendChild(key);
        p.appendChild(row);
    }
    const resetWrap = el('div');
    resetWrap.style.cssText = 'display:flex;justify-content:flex-end;margin-top:10px';
    const rb = el('button', 'rcs-reset', '↺ Сбросить клавиши');
    rb.addEventListener('click', () => {
        S.binds = { ...CANON };
        rebuildBindMaps(); saveState(); refreshBindKeys();
        showToastSafe('↺ Управление сброшено');
    });
    resetWrap.appendChild(rb);
    p.appendChild(resetWrap);
}

function startListening(actionId, keyEl) {
    if (listeningAction) bindKeyEls[listeningAction].classList.remove('listening');
    listeningAction = actionId;
    keyEl.classList.add('listening');
    keyEl.textContent = 'Нажми клавишу…';
}
function cancelListening() {
    if (!listeningAction) return;
    const k = bindKeyEls[listeningAction];
    if (k) { k.classList.remove('listening'); k.textContent = keyLabel(S.binds[listeningAction]); }
    listeningAction = null;
}
function refreshBindKeys() {
    for (const a of ACTIONS) {
        const k = bindKeyEls[a.id];
        if (k) k.textContent = keyLabel(S.binds[a.id]);
    }
}
function tryBind(actionId, code) {
    // нельзя две функции на одну кнопку
    for (const [act, c] of Object.entries(S.binds)) {
        if (act !== actionId && c === code) {
            const k = bindKeyEls[actionId];
            k.classList.remove('dup'); void k.offsetWidth; k.classList.add('dup');
            showToastSafe(`⛔ Клавиша ${keyLabel(code)} уже занята: ${ACTIONS.find(a => a.id === act).name}`);
            setTimeout(() => k.classList.remove('dup'), 400);
            return false;
        }
    }
    if (code === 'F2' || code === 'Escape' || code === 'F3') {
        showToastSafe(`⛔ ${keyLabel(code)} зарезервирована`);
        return false;
    }
    S.binds[actionId] = code;
    rebuildBindMaps(); saveState(); refreshBindKeys();
    showToastSafe(`${CTL_SVG.kb}${ACTIONS.find(a => a.id === actionId).name} → ${keyLabel(code)}`);
    return true;
}

// --- ВКЛАДКА: СЕТЬ ---
function buildNetPane(p) {
    rowToggle(p, '📊 Показывать панель FPS',
        'Счётчик кадров в правом верхнем углу: реальный FPS, нагрузка на видеокарту (вызовы/треугольники), уровень качества. Скрывать/показывать можно и клавишей F3',
        () => S.fpsPanel, (v) => { S.fpsPanel = v; saveState(); applyFpsPanel(); });

    rowSlider(p, '🔎 Размер панели FPS',
        'Масштаб панели от маленькой до крупной — чтобы было видно на любом экране',
        70, 200, 5, () => S.fpsScale,
        (v, final) => { S.fpsScale = v; applyFpsScale(); if (final) saveState(); },
        ['70%', '135%', '200%']);

    rowToggle(p, '🤖 Автооптимизация',
        'Игра сама подстраивает качество под устройство: при низком FPS снижает разрешение, тени и эффекты, при стабильном высоком FPS — возвращает красоту. Выключи, если хочешь держать качество вручную',
        () => S.autoOpt, (v) => { S.autoOpt = v; saveState(); applyAutoOpt(); showToastSafe(v ? '🤖 Автооптимизация включена' : '✋ Автооптимизация выключена'); });
}

// ============================================================
//  ОТКРЫТИЕ / ЗАКРЫТИЕ + ОБРАБОТКА КЛАВИШ В МЕНЮ
// ============================================================
let isOpenFlag = false;
let wasLocked = false;

function handleOpenKey(e) {
    // захват новой клавиши
    if (listeningAction) {
        e.stopImmediatePropagation(); e.preventDefault();
        if (e.code === 'Escape') { cancelListening(); return; }
        if (tryBind(listeningAction, e.code)) cancelListening();
        else cancelListening();
        return;
    }
    // закрытие
    if (e.code === 'F2' || e.code === 'Escape') {
        e.stopImmediatePropagation(); e.preventDefault();
        closeSettings();
        return;
    }
    // всё остальное глушим, чтобы игра не реагировала
    e.stopImmediatePropagation(); e.preventDefault();
}

function onCaptureKeydown(e) {
    if (e.code === 'F2' && !listeningAction) {
        e.stopImmediatePropagation(); e.preventDefault();
        if (isOpenFlag) closeSettings(); else openSettings();
        return;
    }
    if (isOpenFlag) { handleOpenKey(e); return; }
    if (isTypingTarget(e)) return;
    translateEvent(e);
}
function onCaptureKeyup(e) {
    if (isOpenFlag) { e.stopImmediatePropagation(); return; }
    if (isTypingTarget(e)) return;
    translateEvent(e);
}

function openSettings() {
    if (!root) buildDOM();
    detectGPU();
    const gn = root.querySelector('.rcs-gpuname');
    if (gn) gn.textContent = `Видеокарта: ${gpuNameStr} • анизотропия до ${H.renderer.capabilities.getMaxAnisotropy()}x`;
    wasLocked = !!document.pointerLockElement;
    isOpenFlag = true;
    root.classList.add('open');
    cancelListening();
    try { if (document.activeElement) document.activeElement.blur(); } catch (e) {}
    if (document.pointerLockElement && H.controls) { try { H.controls.unlock(); } catch (e) {} }
}
function closeSettings() {
    isOpenFlag = false;
    cancelListening();
    if (root) root.classList.remove('open');
    // возвращаем управление игроку
    if (wasLocked && H.controls) {
        try { H.controls.lock(); } catch (e) { if (H.showOverlay) H.showOverlay(); }
    }
}

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================
export function initSettings(hooks) {
    H = hooks;
    buildDOM();
    // применяем сохранённые настройки без тостов
    applyStyle(true);
    applyGpu(true);
    applyTexQuality();
    applyZone();
    applySens();
    applyFpsPanel();
    applyFpsScale();
    applyAutoOpt();

    window.addEventListener('keydown', onCaptureKeydown, true);
    window.addEventListener('keyup', onCaptureKeyup, true);

    return {
        isOpen: () => isOpenFlag,
        open: openSettings,
        close: closeSettings,
        state: S,
    };
}