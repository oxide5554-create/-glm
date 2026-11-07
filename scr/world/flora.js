// scr/world/flora.js — Растительность v3 (шейдерная листва, ПОЛНАЯ ВЕРСИЯ)
//
// Листва = маленькие отдельные листья-карточки, форма которых (лист, ветка ели,
// веер хвои сосны, вайя папоротника) вырезается ПРОЦЕДУРНО В ШЕЙДЕРЕ (discard).
// Поэтому никаких квадратов/треугольников в силуэте нет, текстур тоже нет
// (нет чёрных полей у папоротников), а тени вырезаются по той же форме.
//
// Шейдер листвы: маска формы, жилки, затемнение к центру кроны,
// «сферические» мягкие нормали, просвет на солнце (translucency), ветер + дрожание.
import * as THREE from 'three';
import { getGroundHeight, isOnRoad } from './terrain.js';
import { createSeededRandom, WORLD_SEED } from './seededRandom.js';

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const UP = V(0, 1, 0);

// Плотность листвы (1 = норма, 0.6 = легче для слабых ПК, 1.4 = гуще)
const LEAF_DENSITY = 1.0;

// общий ветровой таймер
const windUniform = { value: 0 };
(function tickWind() { windUniform.value = performance.now() * 0.001; requestAnimationFrame(tickWind); })();

// ============================================================
//  GLSL
// ============================================================
const WIND_DECL = `
attribute float aSway;
uniform float uTime;
uniform float uAmp;
uniform float uSpeed;`;

const WIND_BODY = `
#ifdef USE_INSTANCING
vec3 wOrg = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
vec3 wOrg = modelMatrix[3].xyz;
#endif
float wph = wOrg.x * 0.37 + wOrg.z * 0.53;
float whh = 0.25 + max(position.y, 0.0) * 0.12;
float wsw = sin(uTime * uSpeed + wph + position.y * 0.35) * 0.6 + sin(uTime * uSpeed * 2.3 + wph * 1.7 + position.x * 3.1 + position.z * 2.7) * 0.4;
transformed.x += wsw * uAmp * aSway * whh;
transformed.z += wsw * uAmp * aSway * 0.6 * whh;
transformed.y += sin(uTime * uSpeed * 3.1 + position.x * 4.0 + position.z * 3.0) * uAmp * 0.12 * aSway;`;

// мелкое дрожание отдельных листьев
const FLUTTER_BODY = `
float flt = sin(uTime * uSpeed * 4.0 + dot(position, vec3(7.1, 5.3, 6.2)) + wph);
transformed += normalize(normal) * flt * uAmp * 0.35 * aSway;`;

// Маска формы. MASK_MODE: 0 = лист, 1 = ветка ели, 2 = веер хвои сосны, 3 = папоротник
// uv: x поперёк (0..1), y вдоль (0 основание -> 1 кончик)
const MASK_GLSL = `
float foliageMask(vec2 uvv, out float shadeK) {
  float px = uvv.x * 2.0 - 1.0;
  float q = abs(px);
  float v = clamp(uvv.y, 0.0, 1.0);
  float keep = 1.0;
  shadeK = 1.0;
#if MASK_MODE == 0
  float w = sin(3.14159265 * pow(v, 0.72)) * 0.98;
  keep = step(q, w);
  float rib = 1.0 - smoothstep(0.0, 0.1, q);
  float vn = abs(fract(v * 5.0 - q * 2.0) - 0.5);
  float vein = smoothstep(0.40, 0.5, vn);
  float edge = smoothstep(w, w * 0.55, q);
  shadeK = mix(0.72, 1.08, v) * (1.0 - 0.14 * vein) * (1.0 + 0.16 * rib) * mix(0.82, 1.0, edge);
#elif MASK_MODE == 1
  float taper = 1.0 - 0.5 * v;
  float s = fract(v * 18.0 - q * 3.0);
  keep = max(step(q, 0.04), step(s, 0.24) * step(q, taper));
  shadeK = mix(0.65, 1.1, q) * mix(0.8, 1.1, v);
#elif MASK_MODE == 2
  float r = length(vec2(q * 0.85, v));
  float a = atan(px, v);
  float ln = abs(fract(a * 5.0) - 0.5) * 2.0;
  keep = step(ln, 0.55 * (1.0 - r) + 0.1) * step(r, 1.0);
  shadeK = mix(0.7, 1.15, r);
#else
  float lw = 0.95 - 0.3 * v;
  float s = fract(v * 9.0 - q * 1.5);
  keep = max(step(q, 0.045), step(s, 0.7 * (1.0 - q * 0.7)) * step(q, lw));
  shadeK = mix(0.6, 1.15, v) * mix(1.0, 0.8, q);
#endif
  return keep;
}`;

// Ветер для травы-подобных материалов (цветы)
function addWind(material, amp, speed) {
    material.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = windUniform;
        sh.uniforms.uAmp = { value: amp };
        sh.uniforms.uSpeed = { value: speed };
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\n' + WIND_DECL)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_BODY);
    };
    material.customProgramCacheKey = () => 'wind-' + amp + '-' + speed;
}

// Материал листвы (НЕ клонировать: clone() сбрасывает defines)
function mkFoliageMat(mode, amp, speed, o = {}) {
    const m = new THREE.MeshStandardMaterial({
        color: 0xffffff,          // белый: цвет приходит из вершин
        vertexColors: true,
        roughness: 0.88,
        metalness: 0,
        side: THREE.DoubleSide,
    });
    m.defines.MASK_MODE = mode;
    const base = o.base || [1, 1, 1];
    const tip = o.tip || [1, 1, 1];
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = windUniform;
        sh.uniforms.uAmp = { value: amp };
        sh.uniforms.uSpeed = { value: speed };
        sh.uniforms.uTrans = { value: o.trans ?? 0.35 };
        sh.uniforms.uBaseCol = { value: new THREE.Vector3(base[0], base[1], base[2]) };
        sh.uniforms.uTipCol = { value: new THREE.Vector3(tip[0], tip[1], tip[2]) };
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\n' + WIND_DECL + '\nvarying vec2 vFUv;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_BODY + FLUTTER_BODY + '\nvFUv = uv;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
varying vec2 vFUv;
uniform float uTrans;
uniform vec3 uBaseCol;
uniform vec3 uTipCol;
${MASK_GLSL}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
  float shK;
  float kp = foliageMask(vFUv, shK);
  if (kp < 0.5) discard;
  diffuseColor.rgb *= shK;
#if MASK_MODE == 3
  diffuseColor.rgb *= mix(uBaseCol, uTipCol, vFUv.y);
#endif
}`)
            // мягкая нормаль без переворота на обратной стороне
            .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
            // просвет листвы на солнце
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#if NUM_DIR_LIGHTS > 0
{
  vec3 Lv = directionalLights[0].direction;
  vec3 Vv = normalize(vViewPosition);
  float tr = pow(clamp(dot(-Vv, Lv) * 0.5 + 0.5, 0.0, 1.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * directionalLights[0].color * tr * uTrans;
}
#endif`);
    };
    m.customProgramCacheKey = () => 'foliage-' + mode;
    return m;
}

// Материал глубины для теней: тень повторяет форму листа и ветер
function mkFoliageDepth(mode, amp, speed) {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    m.defines = { MASK_MODE: mode };
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = windUniform;
        sh.uniforms.uAmp = { value: amp };
        sh.uniforms.uSpeed = { value: speed };
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\n' + WIND_DECL + '\nvarying vec2 vFUv;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_BODY + FLUTTER_BODY + '\nvFUv = uv;');
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec2 vFUv;\n' + MASK_GLSL)
            .replace('#include <alphatest_fragment>', 'float shKd;\nif (foliageMask(vFUv, shKd) < 0.5) discard;\n#include <alphatest_fragment>');
    };
    m.customProgramCacheKey = () => 'foliage-depth-' + mode;
    return m;
}

// ============================================================
//  Построитель геометрии
// ============================================================
class GB {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.s = []; this.i = []; }
    v(x, y, z, nx, ny, nz, u, v, r = 1, g = 1, b = 1, s = 0) {
        if (!isFinite(x)) x = 0;
        if (!isFinite(y)) y = 0;
        if (!isFinite(z)) z = 0;
        if (!isFinite(nx)) nx = 0;
        if (!isFinite(ny)) ny = 1;
        if (!isFinite(nz)) nz = 0;
        this.p.push(x, y, z);
        this.n.push(nx, ny, nz);
        this.uv.push(u, v);
        this.c.push(r, g, b);
        this.s.push(s);
        return this.p.length / 3 - 1;
    }
    quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
    tri(a, b, c) { this.i.push(a, b, c); }
    build() {
        const g = new THREE.BufferGeometry();
        if (this.p.length === 0) return g;
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
        const count = this.p.length / 3;
        if (this.s.length !== count) this.s = new Array(count).fill(0);
        g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.s, 1));
        g.setIndex(this.i);
        g.computeBoundingBox();
        g.computeBoundingSphere();
        if (g.boundingSphere && isFinite(g.boundingSphere.radius)) g.boundingSphere.radius *= 1.15;
        else g.boundingSphere = new THREE.Sphere(V(0, 0, 0), 10);
        return g;
    }
}

function tube(gb, pts, rad, seg, o = {}) {
    const n = pts.length, N = [], B = [], T = V();
    let prev = null;
    for (let i = 0; i < n; i++) {
        T.copy(pts[Math.min(i + 1, n - 1)]).sub(pts[Math.max(i - 1, 0)]);
        if (T.lengthSq() < 1e-8) T.set(0, 1, 0); else T.normalize();
        let nn;
        if (prev) {
            nn = prev.clone().addScaledVector(T, -prev.dot(T));
            if (nn.lengthSq() < 1e-8) nn.set(0, 1, 0); else nn.normalize();
        } else {
            nn = V().crossVectors(Math.abs(T.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0), T);
            if (nn.lengthSq() < 1e-8) nn.set(0, 1, 0); else nn.normalize();
        }
        prev = nn;
        N.push(nn.clone());
        B.push(V().crossVectors(T, nn));
    }

    const base = gb.p.length / 3;
    let len = 0; // накопленная длина для текстуры

    for (let i = 0; i < n; i++) {
        if (i) len += pts[i].distanceTo(pts[i - 1]);
        const y = pts[i].y;
        const flare = o.flare ? 1 + o.flare * Math.exp(-Math.max(y, 0) * 3.2) : 1;
        const cf = o.colFn ? o.colFn(y) : (o.col || [1, 1, 1]);
        const sw = o.sway === false ? 0 : clamp((0.2 - rad[i]) / 0.17, 0, 1) * 0.9;

        for (let j = 0; j <= seg; j++) {
            const a = j / seg * TAU, cn = Math.cos(a), sn = Math.sin(a);
            let r = rad[i] * flare;
            if (o.lobes) r *= 1 + o.lobes.amp * Math.sin(a * o.lobes.n + o.lobes.ph) * Math.exp(-Math.max(y, 0) * o.lobes.decay);
            if (!isFinite(r) || r < 0.001) r = 0.001;
            const d = N[i].clone().multiplyScalar(cn).addScaledVector(B[i], sn);

            let nx = d.x, ny = d.y, nz = d.z;
            const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (!isFinite(nLen) || nLen < 1e-6) { nx = 0; ny = 1; nz = 0; }
            else { nx /= nLen; ny /= nLen; nz /= nLen; }

            gb.v(
                pts[i].x + d.x * r,
                pts[i].y + d.y * r,
                pts[i].z + d.z * r,
                nx, ny, nz,
                j / seg * (o.uRep || 2),
                len / (o.vLen || 1.4),
                cf[0], cf[1], cf[2],
                sw
            );
        }
    }

    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < seg; j++) {
            const a = base + i * (seg + 1) + j, b = a + seg + 1;
            gb.quad(a, a + 1, b + 1, b);
        }
    }
    if (o.cap) {
        const e = pts[n - 1];
        const c = gb.v(e.x, e.y, e.z, 0, 1, 0, 0.5, 0.5, 0.75, 0.7, 0.55, 0);
        const last = base + (n - 1) * (seg + 1);
        for (let j = 0; j < seg; j++) gb.tri(c, last + j, last + j + 1);
    }
}

const ru = (rng) => {
    let z = rng() * 2 - 1;
    if (z > 0.999) z = 0.999;
    if (z < -0.999) z = -0.999;
    const a = rng() * TAU, r = Math.sqrt(1 - z * z);
    return V(r * Math.cos(a), z, r * Math.sin(a));
};

// ============================================================
//  ЛИСТВА: палитры (линейное пространство, тёмные), карточки, пучки
// ============================================================
const PAL = {
    oak:    { dark: [0.020, 0.075, 0.015], light: [0.150, 0.270, 0.035] },
    birch:  { dark: [0.050, 0.120, 0.020], light: [0.320, 0.400, 0.050] },
    bush:   { dark: [0.020, 0.080, 0.020], light: [0.120, 0.240, 0.030] },
    berry:  { dark: [0.025, 0.080, 0.020], light: [0.140, 0.220, 0.030] },
    dry:    { dark: [0.140, 0.090, 0.020], light: [0.380, 0.260, 0.050] },
    spruce: { dark: [0.008, 0.035, 0.020], light: [0.040, 0.120, 0.035], y: 0 },
    pine:   { dark: [0.020, 0.060, 0.020], light: [0.100, 0.200, 0.040], y: 0 },
};

// o: 0 центр кроны (темнее) .. 1 край (светлее); иногда пожелтевший лист
function pickColor(pal, rng, o) {
    const t = clamp(o * 0.65 + rng() * 0.45, 0, 1);
    const k = 0.85 + rng() * 0.3;
    let r = lerp(pal.dark[0], pal.light[0], t) * k;
    let g = lerp(pal.dark[1], pal.light[1], t) * k;
    let b = lerp(pal.dark[2], pal.light[2], t) * k;
    if (rng() < (pal.y ?? 0.06)) { r *= 1.8; g *= 1.25; b *= 0.5; }
    return [r, g, b];
}

// Карточка (полоса из rows сегментов) вдоль оси a с провисанием.
// Форму листа вырежет шейдер по uv.
function addCard(gb, pos, a, side, len, wid, rows, droop, nrm, col, sway) {
    const hw = wid * 0.5;
    const ids = [];
    for (let r = 0; r <= rows; r++) {
        const t = r / rows;
        const bx = pos.x + a.x * len * t;
        const by = pos.y + a.y * len * t - droop * len * t * t;
        const bz = pos.z + a.z * len * t;
        for (const sg of [-1, 1]) {
            ids.push(gb.v(bx + side.x * hw * sg, by + side.y * hw * sg, bz + side.z * hw * sg,
                nrm.x, nrm.y, nrm.z, sg < 0 ? 0 : 1, t, col[0], col[1], col[2], sway * (0.4 + 0.6 * t)));
        }
    }
    for (let r = 0; r < rows; r++) gb.quad(ids[r * 2], ids[r * 2 + 1], ids[r * 2 + 3], ids[r * 2 + 2]);
}

// Пучок отдельных листьев вокруг точки
function createLeafCluster(gb, center, size, rng, crownCenter, crownRadius, pal) {
    const count = Math.max(2, Math.round((4 + Math.floor(rng() * 4)) * LEAF_DENSITY));
    const out = center.clone().sub(crownCenter);
    const dist = out.length();
    if (dist < 1e-4) out.set(0, 1, 0); else out.divideScalar(dist);
    const o = clamp(dist / Math.max(crownRadius, 0.001), 0, 1);
    const rows = size > 1.0 ? 2 : 1;

    for (let i = 0; i < count; i++) {
        const pos = center.clone().add(ru(rng).multiplyScalar(size * 0.4));
        const axis = out.clone().addScaledVector(ru(rng), 1.1);
        axis.y -= 0.1;
        axis.normalize();
        const side = V().crossVectors(axis, Math.abs(axis.y) > 0.95 ? V(1, 0, 0) : UP).normalize();
        side.applyAxisAngle(axis, rng() * TAU);
        // «сферическая» нормаль: наружу и вверх -> мягкая объёмная крона
        const nrm = out.clone().multiplyScalar(0.7).addScaledVector(UP, 0.35).addScaledVector(ru(rng), 0.15).normalize();
        const len = size * (0.32 + rng() * 0.2);
        const wid = len * (0.6 + rng() * 0.2);
        addCard(gb, pos, axis, side, len, wid, rows, 0.25, nrm, pickColor(pal, rng, o), 0.9);
    }
}

function cluster(gb, c, n, size, rad, rng, crown, crownR, pal) {
    for (let k = 0; k < n; k++) {
        const pos = c.clone().add(ru(rng).multiplyScalar(rad * rng()));
        createLeafCluster(gb, pos, size * (0.8 + rng() * 0.4), rng, crown, crownR, pal);
    }
}

// Веер хвои (сосны): несколько вееров-карточек из точки
function tuft(gb, p, size, rng, crown, cr, pal, count = 7) {
    const o = clamp(p.distanceTo(crown) / Math.max(cr, 0.001), 0, 1);
    const out = p.clone().sub(crown);
    if (out.lengthSq() < 1e-6) out.set(0, 1, 0);
    out.normalize();
    const nrm = out.clone().multiplyScalar(0.5).addScaledVector(UP, 0.6).normalize();
    for (let i = 0; i < count; i++) {
        const axis = out.clone().multiplyScalar(0.5).addScaledVector(UP, 0.5).addScaledVector(ru(rng), 0.9).normalize();
        const side = V().crossVectors(axis, Math.abs(axis.y) > 0.95 ? V(1, 0, 0) : UP).normalize();
        side.applyAxisAngle(axis, rng() * TAU);
        const len = size * (0.7 + rng() * 0.4);
        addCard(gb, p, axis, side, len, len * 1.1, 2, 0.15, nrm, pickColor(pal, rng, o), 0.9);
    }
}

// Ветка ели: карточка с «иголками»
function needleSprig(gb, root, dir, side, L, wid, shade, rng, pal, droop = 0.42) {
    const col = pickColor(pal, rng, 0.3 + 0.7 * rng()).map((v) => v * shade);
    const nrm = dir.clone().multiplyScalar(0.35).addScaledVector(UP, 0.65).normalize();
    addCard(gb, root, dir, side, L, wid, 5, droop, nrm, col, 0.8);
}

// ============================================================
//  Ветви / ствол
// ============================================================
function grow(cx, p0, dir, len, r0, depth, maxD, o) {
    const rng = cx.rng;
    const n = Math.max(3, Math.round(len / 0.45) + 1);
    const pts = [p0.clone()];
    const rad = [];
    const d = dir.clone();
    for (let i = 1; i < n; i++) {
        d.x += (rng() - 0.5) * o.wob;
        d.z += (rng() - 0.5) * o.wob;
        d.y += (rng() - 0.5) * o.wob * 0.5 - o.droop / n;
        if (d.lengthSq() < 1e-8) d.set(0, 1, 0); else d.normalize();
        pts.push(pts[i - 1].clone().addScaledVector(d, len / (n - 1)));
    }
    for (let i = 0; i < n; i++) rad.push(Math.max(0.011, r0 * (1 - i / (n - 1) * 0.8)));
    tube(cx.wood, pts, rad, 6, { vLen: 1.4, colFn: cx.colFn });
    cx.mids.push(pts[Math.floor(n / 2)].clone());
    if (depth < maxD) {
        const kids = o.kids(depth, rng);
        for (let k = 0; k < kids; k++) {
            const idx = Math.min(n - 1, Math.floor(n * (0.4 + 0.55 * (k + rng() * 0.6) / kids)));
            const base = pts[idx];
            const cd = d.clone().add(V((rng() - 0.5) * o.spread, (rng() - 0.5) * o.spread * 0.6 + o.up, (rng() - 0.5) * o.spread)).normalize();
            grow(cx, base, cd, len * o.lenK * (0.8 + rng() * 0.4), rad[idx] * 0.72, depth + 1, maxD, o);
        }
    }
    cx.tips.push({ p: pts[n - 1].clone(), d: d.clone() });
}

function trunkPath(rng, h, bend, n) {
    const pts = [], ph = rng() * TAU;
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        pts.push(V(Math.sin(t * 2.2 + ph) * bend * t, t * h, Math.cos(t * 1.7 + ph) * bend * 0.5 * t));
    }
    return pts;
}

const pointAt = (pts, f) => {
    const x = f * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(x));
    return pts[i].clone().lerp(pts[i + 1], x - i);
};

// ============================================================
//  Текстуры коры (canvas). Листва и папоротники БЕЗ текстур.
// ============================================================
const mkT = (c, rep) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (rep) t.repeat.set(rep[0], rep[1]);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    return t;
};

const cv = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
};

const rr = (a, b) => a + Math.random() * (b - a);

function barkCanvas(kind) {
    return cv(128, 256, (x, w, h) => {
        const base = { oak: '#4a3420', birch: '#e6e2d6', pine: '#6b4a30', dead: '#6f6a62', spruce: '#4d3a2b' }[kind];
        x.fillStyle = base;
        x.fillRect(0, 0, w, h);
        if (kind === 'birch') {
            for (let i = 0; i < 140; i++) {
                x.fillStyle = `rgba(28,24,20,${0.5 + Math.random() * 0.5})`;
                const bw = rr(5, 32), bx = rr(-4, w);
                x.fillRect(bx, rr(0, h), bw, rr(1.5, 4));
                if (bx + bw > w) x.fillRect(bx - w, rr(0, h), bw, 2);
            }
            for (let i = 0; i < 40; i++) {
                x.fillStyle = `rgba(140,130,110,${0.1 + Math.random() * 0.2})`;
                x.fillRect(rr(0, w), rr(0, h), rr(1, 4), rr(10, 60));
            }
        } else if (kind === 'pine') {
            for (let y = 0; y < h; y += 18) for (let xx = 0; xx < w; xx += 24) {
                const ox = xx + rr(-4, 4) + (y / 18 % 2) * 10, oy = y + rr(-3, 3);
                x.fillStyle = `rgba(${150 + Math.random() * 50 | 0},${80 + Math.random() * 40 | 0},40,${0.35 + Math.random() * 0.3})`;
                x.fillRect(ox, oy, rr(16, 22), rr(12, 16));
                x.strokeStyle = 'rgba(30,18,10,.7)';
                x.lineWidth = 1.4;
                x.strokeRect(ox, oy, 20, 14);
            }
        } else {
            for (let i = 0; i < 80; i++) {
                x.strokeStyle = `rgba(20,14,8,${0.2 + Math.random() * 0.35})`;
                x.lineWidth = rr(0.8, 2.8);
                const px = rr(0, w);
                x.beginPath();
                x.moveTo(px, 0);
                for (let y = 20; y <= h; y += 20) x.lineTo(px + rr(-4, 4), y);
                x.stroke();
            }
            for (let i = 0; i < 36; i++) {
                x.strokeStyle = `rgba(${kind === 'dead' ? '170,165,155' : '110,85,50'},${0.15 + Math.random() * 0.2})`;
                x.lineWidth = 0.7;
                const px = rr(0, w);
                x.beginPath();
                x.moveTo(px, 0);
                for (let y = 24; y <= h; y += 24) x.lineTo(px + rr(-3, 3), y);
                x.stroke();
            }
            if (kind !== 'dead') for (let i = 0; i < 20; i++) {
                x.fillStyle = `rgba(80,105,45,${0.15 + Math.random() * 0.2})`;
                x.beginPath();
                x.arc(rr(0, w), rr(0, h), rr(4, 14), 0, TAU);
                x.fill();
            }
        }
    });
}

// ============================================================
//  Материалы
// ============================================================
let _TX = null;
function TX() {
    if (_TX) return _TX;

    const mkWood = (kind, bump = 1.4) => {
        const t = mkT(barkCanvas(kind));
        return new THREE.MeshStandardMaterial({
            map: t, bumpMap: t, bumpScale: bump, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide,
        });
    };
    // лист + материал глубины для теней
    const leafMat = (mode, amp, speed) => {
        const m = mkFoliageMat(mode, amp, speed);
        m.userData.depth = mkFoliageDepth(mode, amp, speed);
        return m;
    };

    _TX = {
        wood: {
            oak: mkWood('oak'),
            birch: mkWood('birch', 0.6),
            spruce: mkWood('spruce'),
            pine: mkWood('pine'),
            dead: mkWood('dead', 1.8),
            bush: mkWood('oak', 0.8),
        },
        leaf: {
            oak: leafMat(0, 0.055, 1.5),
            birch: leafMat(0, 0.07, 1.8),
            spruce: leafMat(1, 0.035, 1.6),
            pine: leafMat(2, 0.04, 1.7),
            bush: leafMat(0, 0.05, 1.6),
            berry: leafMat(0, 0.05, 1.6),
            dry: leafMat(0, 0.05, 1.5),
        },
        // папоротник: форма вайи вырезается в шейдере, цвет задан uniform'ами
        // (раньше чёрные поля давала прозрачная текстура при alphaTest = 0)
        fern: mkFoliageMat(3, 0.07, 1.4, { base: [0.05, 0.22, 0.03], tip: [0.18, 0.45, 0.07], trans: 0.2 }),
    };
    return _TX;
}

// ============================================================
//  Деревья
// ============================================================
function buildOak(rng) {
    const rn = (a, b) => a + rng() * (b - a);
    const cx = { rng, wood: new GB(), tips: [], mids: [] };
    const leaf = new GB();
    const th = rn(3.4, 4.4);
    const pts = trunkPath(rng, th, rn(-0.3, 0.3), 9);
    const rad = pts.map((_, i) => 0.36 * (1 - i / 8 * 0.55) + 0.05);
    tube(cx.wood, pts, rad, 12, { lobes: { n: 5, amp: 0.2, decay: 1.5, ph: rn(0, TAU) }, flare: 1.1, vLen: 1.6, sway: false });
    for (let i = 0, nr = 5; i < nr; i++) {
        const a = i / nr * TAU + rn(-0.3, 0.3);
        const rp = [V(0, 0.35, 0), V(Math.cos(a) * 0.7, 0.05, Math.sin(a) * 0.7), V(Math.cos(a) * 1.35, -0.12, Math.sin(a) * 1.35)];
        tube(cx.wood, rp, [0.2, 0.11, 0.04], 6, { sway: false });
    }
    const o = { wob: 0.55, droop: 0.5, spread: 1.0, up: 0.15, lenK: 0.68, kids: (d, r) => (d === 0 ? 3 : 2) + (r() < 0.4 ? 1 : 0) };
    const nL = 4 + Math.floor(rng() * 2);
    for (let k = 0; k < nL; k++) {
        const a = k / nL * TAU + rn(-0.4, 0.4);
        const f = rn(0.62, 0.95);
        const p = pointAt(pts, f);
        grow(cx, p, V(Math.cos(a), rn(0.5, 1.0), Math.sin(a)).normalize(), rn(2.0, 3.0), 0.15, 0, 2, o);
    }
    grow(cx, pts[8], V(0, 1, 0), 1.8, 0.16, 0, 1, o);
    const crown = cx.tips.reduce((s, t) => s.add(t.p), V()).multiplyScalar(1 / cx.tips.length);
    const cr = Math.max(...cx.tips.map((t) => t.p.distanceTo(crown))) * 0.95 + 0.3;
    for (const t of cx.tips) cluster(leaf, t.p, 8, 1.35, 0.55, rng, crown, cr, PAL.oak);
    for (const m of cx.mids) cluster(leaf, m, 3, 1.1, 0.4, rng, crown, cr, PAL.oak);
    return { wood: cx.wood.build(), leaf: leaf.build(), h: th + 3, trunkR: 0.36 };
}

function buildBirch(rng) {
    const rn = (a, b) => a + rng() * (b - a);
    const cx = { rng, wood: new GB(), tips: [], mids: [] };
    const leaf = new GB();
    const th = rn(6.5, 8.5);
    const pts = trunkPath(rng, th, rn(-0.5, 0.5), 11);
    const rad = pts.map((_, i) => 0.13 * (1 - i / 10 * 0.75) + 0.03);
    tube(cx.wood, pts, rad, 8, { flare: 0.5, lobes: { n: 3, amp: 0.1, decay: 2, ph: rn(0, TAU) }, vLen: 1.3, sway: false });
    const o = { wob: 0.4, droop: 0.9, spread: 0.7, up: 0.1, lenK: 0.7, kids: (d) => (d === 0 ? 2 : 1) };
    const nL = 9 + Math.floor(rng() * 3);
    for (let k = 0; k < nL; k++) {
        const f = rn(0.35, 0.95);
        const a = rng() * TAU;
        grow(cx, pointAt(pts, f), V(Math.cos(a), rn(0.7, 1.5) * (1.1 - f * 0.5), Math.sin(a)).normalize(), rn(1.5, 2.4) * (1.15 - f * 0.4), 0.04, 0, 2, o);
    }
    grow(cx, pts[10], V(0, 1, 0), 1.5, 0.04, 0, 1, o);
    const crown = cx.tips.reduce((s, t) => s.add(t.p), V()).multiplyScalar(1 / cx.tips.length);
    const cr = Math.max(...cx.tips.map((t) => t.p.distanceTo(crown))) + 0.3;
    for (const t of cx.tips) cluster(leaf, t.p, 6, 0.8, 0.35, rng, crown, cr, PAL.birch);
    for (const m of cx.mids) cluster(leaf, m, 2, 0.7, 0.3, rng, crown, cr, PAL.birch);
    return { wood: cx.wood.build(), leaf: leaf.build(), h: th + 1.5, trunkR: 0.14 };
}

function buildSpruce(rng) {
    const rn = (a, b) => a + rng() * (b - a);
    const wood = new GB(), leaf = new GB();
    const Ht = rn(9, 13);
    const pts = trunkPath(rng, Ht, rn(-0.15, 0.15), 10);
    const rad = pts.map((_, i) => 0.27 * (1 - i / 9 * 0.94) + 0.012);
    tube(wood, pts, rad, 10, { flare: 0.7, lobes: { n: 5, amp: 0.15, decay: 1.2, ph: rn(0, TAU) }, vLen: 1.8, sway: false });
    const y0 = 1.4, Lmax = rn(2.1, 2.9);
    const tiers = Math.round(Ht * 1.45);
    for (let t = 0; t < tiers; t++) {
        const f = t / (tiers - 1);
        const y = lerp(y0, Ht * 0.97, f);
        const L = Lmax * Math.pow(1 - f, 0.85) + 0.22;
        const per = 6 + Math.floor(rng() * 3);
        const off = rng() * TAU;
        const tp = pointAt(pts, y / Ht);
        const shade = lerp(0.62, 1.08, f) * rn(0.92, 1.05);
        for (let b = 0; b < per; b++) {
            const th0 = off + b / per * TAU + rn(-0.25, 0.25);
            for (const twin of [0, 1]) {
                const th = th0 + (twin ? rn(0.22, 0.36) : 0);
                const LL = twin ? L * 0.82 : L;
                const out = V(Math.cos(th), 0, Math.sin(th));
                const sd = V(-Math.sin(th), 0, Math.cos(th));
                const root = tp.clone().addScaledVector(out, 0.1);
                const wid = 0.55 + 0.7 * (LL / Lmax);
                needleSprig(leaf, root, out, sd, LL, wid, shade * rn(0.95, 1.05), rng, PAL.spruce);
                if (!twin) {
                    // вторая карточка под углом даёт объём ветки
                    const sd2 = sd.clone().applyAxisAngle(out, 0.95);
                    needleSprig(leaf, root, out, sd2, LL * 0.85, wid * 0.8, shade * 0.9, rng, PAL.spruce);
                }
            }
        }
    }
    // макушка
    const top = pts[9];
    for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 4;
        needleSprig(leaf, top.clone().add(V(0, -1.1, 0)), V(0, 1, 0), V(Math.cos(a), 0, Math.sin(a)), 1.5, 0.7, 1.0, rng, PAL.spruce, 0);
    }
    return { wood: wood.build(), leaf: leaf.build(), h: Ht, trunkR: 0.27 };
}

function buildPine(rng) {
    const rn = (a, b) => a + rng() * (b - a);
    const colFn = (y) => (y < 13 * 0.5 ? [0.62, 0.58, 0.54] : [1.05, 0.78, 0.55]);
    const leaf = new GB();
    const Ht = rn(10, 13);
    const cx = { rng, wood: new GB(), tips: [], mids: [], colFn };
    const pts = trunkPath(rng, Ht, rn(-0.8, 0.8), 12);
    const rad = pts.map((_, i) => 0.25 * (1 - i / 11 * 0.8) + 0.05);
    tube(cx.wood, pts, rad, 10, { flare: 0.8, lobes: { n: 4, amp: 0.12, decay: 1.3, ph: rn(0, TAU) }, colFn, vLen: 1.7, sway: false });
    const o = { wob: 0.5, droop: 0.2, spread: 0.9, up: 0.2, lenK: 0.6, kids: (d) => (d === 0 ? 2 : 0) };
    const nb = 9 + Math.floor(rng() * 4);
    for (let k = 0; k < nb; k++) {
        const f = rn(0.55, 0.97);
        const a = rng() * TAU;
        grow(cx, pointAt(pts, f), V(Math.cos(a), rn(-0.1, 0.45), Math.sin(a)).normalize(), rn(1.6, 3.2) * (1.25 - f * 0.7), 0.07, 0, 1, o);
    }
    grow(cx, pts[11], V(0, 1, 0), 1.2, 0.06, 0, 0, o);
    const crown = cx.tips.reduce((s, t) => s.add(t.p), V()).multiplyScalar(1 / cx.tips.length);
    const cr = Math.max(...cx.tips.map((t) => t.p.distanceTo(crown))) + 0.4;
    for (const t of cx.tips) tuft(leaf, t.p, rn(1.8, 2.6), rng, crown, cr, PAL.pine, 8);
    for (const m of cx.mids) tuft(leaf, m, rn(1.2, 1.8), rng, crown, cr, PAL.pine, 4);
    return { wood: cx.wood.build(), leaf: leaf.build(), h: Ht, trunkR: 0.25 };
}

function buildDead(rng) {
    const rn = (a, b) => a + rng() * (b - a);
    const colFn = () => [0.95, 0.93, 0.9];
    const cx = { rng, wood: new GB(), tips: [], mids: [], colFn };
    const Ht = rn(5, 7);
    const pts = trunkPath(rng, Ht, rn(-0.6, 0.6), 9);
    const rad = pts.map((_, i) => 0.3 * (1 - i / 8 * 0.7) + 0.05);
    tube(cx.wood, pts, rad, 10, { flare: 1.0, lobes: { n: 5, amp: 0.2, decay: 1.4, ph: rn(0, TAU) }, colFn, cap: true, vLen: 1.5, sway: false });
    const o = { wob: 0.8, droop: 0.1, spread: 1.2, up: 0.05, lenK: 0.65, kids: (d) => (d === 0 ? 2 : 1) };
    const nb = 6 + Math.floor(rng() * 4);
    for (let k = 0; k < nb; k++) {
        const f = rn(0.3, 0.92);
        const a = rng() * TAU;
        grow(cx, pointAt(pts, f), V(Math.cos(a), rn(0.15, 0.9), Math.sin(a)).normalize(), rn(1.2, 2.4) * (1.1 - f * 0.4), 0.09, 0, 2, o);
    }
    return { wood: cx.wood.build(), leaf: null, h: Ht, trunkR: 0.3 };
}

const SPECIES = [['oak', 0.27, buildOak, 4], ['birch', 0.15, buildBirch, 3], ['spruce', 0.25, buildSpruce, 4], ['pine', 0.2, buildPine, 3], ['dead', 0.05, buildDead, 2]];
const _variants = {};

function getVariant(sp, i) {
    const key = sp + i;
    if (_variants[key]) return _variants[key];
    const def = SPECIES.find((s) => s[0] === sp);
    return (_variants[key] = def[2](createSeededRandom(WORLD_SEED + 7000 + i * 131 + sp.charCodeAt(0) * 17)));
}

function instantiate(sp, v) {
    const t = TX();
    const g = new THREE.Group();

    if (!v.wood || !v.wood.attributes || !v.wood.attributes.position || v.wood.attributes.position.count === 0) {
        console.warn(`[Flora] Пустая геометрия wood для ${sp}`);
        return g;
    }

    const w = new THREE.Mesh(v.wood, t.wood[sp]);
    w.castShadow = true;
    w.receiveShadow = true;
    g.add(w);

    if (v.leaf) {
        if (!v.leaf.attributes || !v.leaf.attributes.position || v.leaf.attributes.position.count === 0) {
            console.warn(`[Flora] Пустая геометрия leaf для ${sp}`);
        } else {
            const lm = t.leaf[sp];
            const l = new THREE.Mesh(v.leaf, lm);
            l.castShadow = true;
            l.receiveShadow = true;
            l.customDepthMaterial = lm.userData.depth; // тень по форме листа
            g.add(l);
        }
    }
    g.traverse((obj) => { if (obj.isMesh) obj.frustumCulled = true; });
    return g;
}

const dens = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.045 + Math.cos(z * 0.031) * 2.0) * Math.cos(z * 0.052 + Math.sin(x * 0.027) * 1.7);

export function createTrees(scene, count = 80, areaSize = 220) {
    const forest = new THREE.Group();
    forest.name = 'Forest';
    const rng = createSeededRandom(WORLD_SEED + 1000);
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 14) {
        tries++;
        const x = (rng() - 0.5) * areaSize;
        const z = (rng() - 0.5) * areaSize;
        if (Math.sqrt(x * x + z * z) < 8 || isOnRoad(x, z, 2.5)) continue;
        let r = rng(), sp = 'oak';
        for (const s of SPECIES) {
            r -= s[1] / 0.92;
            if (r <= 0) { sp = s[0]; break; }
        }
        const def = SPECIES.find((s) => s[0] === sp);
        const vi = Math.floor(rng() * def[3]);
        const v = getVariant(sp, vi);
        const tree = instantiate(sp, v);
        const sc = (sp === 'spruce' || sp === 'pine' ? 0.8 : 0.78) + rng() * 0.5;
        tree.position.set(x, getGroundHeight(x, z) - 0.05, z);
        tree.rotation.y = rng() * TAU;
        tree.scale.setScalar(sc);
        Object.assign(tree.userData, { isTree: true, species: sp, id: 'tree_' + placed, health: 5, maxHealth: 5, falling: false, fallen: false, fallT: 0, fallDir: 1, shakeT: 0, trunkRadius: v.trunkR * sc, height: v.h * sc });
        forest.add(tree);
        placed++;
    }
    scene.add(forest);
    console.log(`[Flora] Сгенерировано деревьев: ${placed}`);
    return forest;
}

// ============================================================
//  ТРАВА, ПАПОРОТНИКИ, КУСТЫ, ЦВЕТЫ
// ============================================================
function makeTuftGeometry(rng) {
    const gb = new GB();
    const blades = 11, rows = 4;
    for (let b = 0; b < blades; b++) {
        const ang = rng() * TAU;
        const dist = Math.sqrt(rng()) * 0.17;
        const bx = Math.cos(ang) * dist, bz = Math.sin(ang) * dist;
        const h = 0.55 + rng() * 0.55;
        const w = 0.03 + rng() * 0.022;
        const f = rng() * TAU;
        const lean = 0.1 + rng() * 0.35;
        const sx = Math.cos(f), sz = Math.sin(f);
        const px = -Math.sin(f), pz = Math.cos(f);
        const tint = 0.85 + rng() * 0.3;
        const hs = (rng() - 0.5) * 0.12;
        const ids = [];
        const nl = V(px * 0.5, 0.85, pz * 0.5).normalize();
        for (let r = 0; r <= rows; r++) {
            const t = r / rows;
            const y = t * h;
            const half = w * (1 - Math.pow(t, 1.6)) * 0.5;
            const off = lean * h * t * t;
            const cx = bx + px * off, cz = bz + pz * off;
            const A = [0.1, 0.22, 0.06], M = [0.26, 0.5, 0.12], Tp = [0.58, 0.74, 0.24];
            const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
            const c0 = t < 0.5 ? A : M;
            const c1 = t < 0.5 ? M : Tp;
            const cr = lerp(c0[0], c1[0], k) * tint * (1 - hs);
            const cg = lerp(c0[1], c1[1], k) * tint * (1 + hs);
            const cb = lerp(c0[2], c1[2], k) * tint;
            for (const s of [-1, 1]) ids.push(gb.v(cx + sx * half * s, y, cz + sz * half * s, nl.x, nl.y, nl.z, s < 0 ? 0 : 1, t, cr, cg, cb, t * t));
        }
        for (let r = 0; r < rows; r++) gb.quad(ids[r * 2], ids[r * 2 + 1], ids[r * 2 + 3], ids[r * 2 + 2]);
    }
    return gb.build();
}

export function updateGrass(grass, camera) {
    const u = grass && grass.userData.update;
    if (u) u(camera);
}

export function createGrass(scene, count = 6500, areaSize = 220, opts = {}) {
    const seedR = createSeededRandom(WORLD_SEED + 2000);
    const tuftGeo = makeTuftGeometry(seedR);
    const fadeS = opts.fadeStart ?? 38;
    const fadeE = opts.fadeEnd ?? 64;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = windUniform;
        sh.uniforms.uFadeS = { value: fadeS };
        sh.uniforms.uFadeE = { value: fadeE };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uFadeS;
uniform float uFadeE;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 iw = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
vec3 iw = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#endif
float gPh = iw.x * 0.45 + iw.z * 0.55;
float gH = clamp(position.y / 0.9, 0.0, 1.0);
float gW = sin(uTime * 1.7 + gPh) * 0.5 + sin(uTime * 3.1 + gPh * 1.9 + position.x * 8.0) * 0.18;
float gust = sin(uTime * 0.55 + iw.x * 0.05 + iw.z * 0.03) * 0.5 + 0.5;
float gB = (gW * 0.16 + gust * 0.12) * gH * gH;
transformed.x += gB; transformed.z += gB * 0.6;
float gF = 1.0 - smoothstep(uFadeS, uFadeE, distance(iw, cameraPosition));
transformed.y *= gF; transformed.xz *= mix(0.2, 1.0, gF);`);
    };
    mat.customProgramCacheKey = () => 'grass-v2';
    const group = new THREE.Group();
    group.name = 'Grass';
    group.userData.chunks = [];
    const CH = 22;
    const nC = Math.ceil(areaSize / CH);
    const per = Math.max(1, Math.round(count / (nC * nC)));
    const rng = createSeededRandom(WORLD_SEED + 2100);
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    for (let ci = 0; ci < nC; ci++) for (let cj = 0; cj < nC; cj++) {
        const x0 = -areaSize / 2 + ci * CH;
        const z0 = -areaSize / 2 + cj * CH;
        const items = [];
        for (let tries = 0; items.length < per && tries < per * 3; tries++) {
            const x = x0 + rng() * CH;
            const z = z0 + rng() * CH;
            if (isOnRoad(x, z, 2.2)) continue;
            items.push([x, z]);
        }
        if (!items.length) continue;
        const geo = new THREE.BufferGeometry();
        for (const key of Object.keys(tuftGeo.attributes)) geo.setAttribute(key, tuftGeo.attributes[key]);
        geo.setIndex(tuftGeo.index);
        const cxm = x0 + CH / 2;
        const czm = z0 + CH / 2;
        const cy = getGroundHeight(cxm, czm);
        geo.boundingSphere = new THREE.Sphere(V(cxm, cy + 0.5, czm), CH * 0.75 + 1.5);
        const mesh = new THREE.InstancedMesh(geo, mat, items.length);
        items.forEach(([x, z], i) => {
            const s = 0.85 + rng() * 0.7;
            d.position.set(x, getGroundHeight(x, z), z);
            d.rotation.set(0, rng() * TAU, 0);
            d.scale.set(s, s * (0.85 + rng() * 0.45), s);
            d.updateMatrix();
            mesh.setMatrixAt(i, d.matrix);
            const dry = clamp(dens(x * 1.7 + 40, z * 1.3) * 1.4 - 0.45, 0, 1);
            mesh.setColorAt(i, col.setRGB(lerp(0.95, 1.25, dry) * (0.9 + rng() * 0.2), lerp(1.0, 1.04, dry) * (0.9 + rng() * 0.2), lerp(0.92, 0.55, dry)));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.receiveShadow = true;
        mesh.userData.center = V(cxm, cy, czm);
        group.add(mesh);
        group.userData.chunks.push(mesh);
    }
    group.userData.update = (camera) => {
        const p = camera.position;
        const lim = fadeE + CH;
        for (const m of group.userData.chunks) m.visible = m.userData.center.distanceTo(p) < lim;
    };
    if (opts.camera) (function loop() { group.userData.update(opts.camera); requestAnimationFrame(loop); })();
    scene.add(group);
    return group;
}

// Папоротник: полосы-вайи; форму листочков вырезает шейдер (MASK_MODE 3)
function makeFernGeometry(rng) {
    const gb = new GB();
    const fronds = 11, rows = 7;
    for (let i = 0; i < fronds; i++) {
        const th = i / fronds * TAU + rng() * 0.4;
        const L = 0.75 + rng() * 0.55;
        const pf = 0.55 + rng() * 0.6;
        const ids = [];
        const c = Math.cos(th), s = Math.sin(th);
        for (let r = 0; r <= rows; r++) {
            const t = r / rows;
            const x = t * L;
            const y = 0.06 + (0.95 * t - 0.62 * t * t) * L * pf;
            const dy = (0.95 - 1.24 * t) * pf;
            const hw = 0.24 * (1 - 0.25 * t) * (0.6 + 0.4 * Math.min(1, t * 2.2));
            const nm = V(-dy, 1, 0).normalize();
            const sh = lerp(0.65, 1.1, t) * (0.92 + rng() * 0.1);
            for (const sg of [-1, 1]) {
                const lz = hw * sg;
                ids.push(gb.v(x * c + lz * s, y, -x * s + lz * c, nm.x * c, nm.y, -nm.x * s, sg < 0 ? 0 : 1, t, sh, sh, sh, t));
            }
        }
        for (let r = 0; r < rows; r++) gb.quad(ids[r * 2], ids[r * 2 + 1], ids[r * 2 + 3], ids[r * 2 + 2]);
    }
    return gb.build();
}

export function createFerns(scene, count = 450, areaSize = 220, forest = null) {
    const rng = createSeededRandom(WORLD_SEED + 8000);
    const geo = makeFernGeometry(rng);
    const mat = TX().fern; // НЕ клонируем: clone() сбрасывает defines
    const ferns = new THREE.InstancedMesh(geo, mat, count);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    const trees = forest ? forest.children : [];
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 6) {
        tries++;
        let x, z;
        if (trees.length && rng() < 0.8) {
            const t = trees[Math.floor(rng() * trees.length)];
            const a = rng() * TAU;
            const r = 1.6 + rng() * 5.5;
            x = t.position.x + Math.cos(a) * r;
            z = t.position.z + Math.sin(a) * r;
        } else {
            x = (rng() - 0.5) * areaSize;
            z = (rng() - 0.5) * areaSize;
        }
        if (isOnRoad(x, z, 3.2)) continue;
        const s = 0.8 + rng() * 0.8;
        d.position.set(x, getGroundHeight(x, z), z);
        d.rotation.set(0, rng() * TAU, 0);
        d.scale.set(s, s * (0.8 + rng() * 0.4), s);
        d.updateMatrix();
        ferns.setMatrixAt(placed, d.matrix);
        ferns.setColorAt(placed, c.setRGB(0.85 + rng() * 0.25, 0.9 + rng() * 0.2, 0.8 + rng() * 0.2));
        placed++;
    }
    ferns.count = placed;
    ferns.instanceMatrix.needsUpdate = true;
    if (ferns.instanceColor) ferns.instanceColor.needsUpdate = true;
    ferns.frustumCulled = false; // единая сфера у геометрии одного экземпляра — не подходит для instancing
    ferns.receiveShadow = true;
    ferns.name = 'Ferns';
    scene.add(ferns);
    return ferns;
}

function buildBush(rng, kind) {
    const rn = (a, b) => a + rng() * (b - a);
    const cx = { rng, wood: new GB(), tips: [], mids: [], colFn: () => [0.8, 0.7, 0.6] };
    const leaf = new GB();
    const nb = 15 + Math.floor(rng() * 5);
    const o = { wob: 0.5, droop: 0.3, spread: 0.9, up: 0.25, lenK: 0.65, kids: (d) => (d === 0 ? 2 : 0) };
    const pal = PAL[kind] || PAL.bush;
    const crown = V(0, 0.8, 0);
    const cr = 1.5;

    for (let k = 0; k < nb; k++) {
        const a = k / nb * TAU + rn(-0.3, 0.3);
        grow(cx, V(rn(-0.1, 0.1), 0.05, rn(-0.1, 0.1)), V(Math.cos(a), rn(0.6, 1.5), Math.sin(a)).normalize(), rn(0.9, 1.6), 0.032, 0, 1, o);
    }
    // мелкие отдельные листья вдоль веток, а не крупные «квадраты»
    for (const t of cx.tips) cluster(leaf, t.p, 3, 0.62, 0.3, rng, crown, cr, pal);
    for (const m of cx.mids) cluster(leaf, m, 2, 0.55, 0.25, rng, crown, cr, pal);
    for (let k = 0; k < 8; k++) {
        const a = rng() * TAU;
        const r = rn(0.3, 0.9);
        createLeafCluster(leaf, V(Math.cos(a) * r, rn(0.1, 0.35), Math.sin(a) * r), 0.6, rng, crown, cr, pal);
    }
    return { wood: cx.wood.build(), leaf: leaf.build() };
}

export function createBushes(scene, count = 70, areaSize = 220) {
    const bushes = new THREE.Group();
    bushes.name = 'Bushes';
    const T = TX();
    const rng = createSeededRandom(WORLD_SEED + 4000);
    const kinds = ['bush', 'bush', 'berry', 'dry'];
    const vars = {};
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 10) {
        tries++;
        const x = (rng() - 0.5) * areaSize;
        const z = (rng() - 0.5) * areaSize;
        if (Math.sqrt(x * x + z * z) < 8 || isOnRoad(x, z, 6)) continue;
        const kind = kinds[Math.floor(rng() * kinds.length)];
        const vi = Math.floor(rng() * 2);
        const key = kind + vi;
        const v = vars[key] || (vars[key] = buildBush(createSeededRandom(WORLD_SEED + 9000 + vi * 7 + kind.charCodeAt(0)), kind));
        const g = new THREE.Group();
        const w = new THREE.Mesh(v.wood, T.wood.bush);
        const l = new THREE.Mesh(v.leaf, T.leaf[kind]);
        w.castShadow = true;
        l.castShadow = true;
        l.receiveShadow = true;
        l.customDepthMaterial = T.leaf[kind].userData.depth;
        g.add(w, l);
        const sc = 1.0 + rng() * 0.55;
        g.position.set(x, getGroundHeight(x, z), z);
        g.rotation.y = rng() * TAU;
        g.scale.setScalar(sc);
        Object.assign(g.userData, { isBush: true, kind, hideRadius: 0.85 * sc, cover: 0.9 });
        g.traverse((obj) => { if (obj.isMesh) obj.frustumCulled = true; });
        bushes.add(g);
        placed++;
    }
    scene.add(bushes);
    return bushes;
}

export function getBushCover(bushes, x, z) {
    let best = 0;
    for (const b of bushes.children) {
        const d = Math.hypot(b.position.x - x, b.position.z - z);
        const r = b.userData.hideRadius;
        if (d < r) best = Math.max(best, b.userData.cover * (1 - 0.5 * d / r));
    }
    return best;
}

function makeFlowerGeos() {
    const stem = new GB(), head = new GB();
    const h = 0.4;
    for (const yaw of [0, Math.PI / 2]) {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const ids = [];
        for (const [y, w] of [[0, 0.012], [h * 0.5, 0.008], [h, 0.004]]) for (const sg of [-1, 1]) ids.push(stem.v(c * w * sg, y, s * w * sg, -s, 0, c, sg < 0 ? 0 : 1, y / h, 0.2, 0.42, 0.12, y / h));
        for (let r = 0; r < 2; r++) stem.quad(ids[r * 2], ids[r * 2 + 1], ids[r * 2 + 3], ids[r * 2 + 2]);
    }
    for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU;
        const c = Math.cos(a), s = Math.sin(a);
        const L = 0.06, W = 0.026;
        const tip = [c * L, h - 0.012, s * L];
        const mid = [c * L * 0.55, h + 0.004, s * L * 0.55];
        const ids = [
            head.v(0, h + 0.006, 0, 0, 1, 0, 0.5, 0, 1, 1, 1, 1),
            head.v(mid[0] - s * W, mid[1], mid[2] + c * W, 0, 1, 0, 0, 0.5, 1, 1, 1, 1),
            head.v(tip[0], tip[1], tip[2], 0, 1, 0, 0.5, 1, 1, 1, 1, 1),
            head.v(mid[0] + s * W, mid[1], mid[2] - c * W, 0, 1, 0, 1, 0.5, 1, 1, 1, 1),
        ];
        head.quad(ids[0], ids[1], ids[2], ids[3]);
    }
    const ctr = [];
    for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU;
        ctr.push(head.v(Math.cos(a) * 0.014, h + 0.012, Math.sin(a) * 0.014, 0, 1, 0, 0, 0, 0.9, 0.7, 0.15, 1));
    }
    const c0 = head.v(0, h + 0.016, 0, 0, 1, 0, 0, 0, 0.9, 0.7, 0.15, 1);
    for (let k = 0; k < 6; k++) head.tri(c0, ctr[k], ctr[(k + 1) % 6]);
    return [stem.build(), head.build()];
}

export function createFlowers(scene, count = 900, areaSize = 200) {
    const [sg, hg] = makeFlowerGeos();
    const sm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const hm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
    addWind(sm, 0.06, 1.8);
    addWind(hm, 0.06, 1.8);
    const stems = new THREE.InstancedMesh(sg, sm, count);
    const heads = new THREE.InstancedMesh(hg, hm, count);
    const palette = [0xe04040, 0xe8d040, 0xf0f0f0, 0xb060d0, 0xe08030, 0x5080e0];
    const rng = createSeededRandom(WORLD_SEED + 3000);
    const d = new THREE.Object3D();
    const color = new THREE.Color();
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 4) {
        tries++;
        const x = (rng() - 0.5) * areaSize;
        const z = (rng() - 0.5) * areaSize;
        if (isOnRoad(x, z, 3)) continue;
        d.position.set(x, getGroundHeight(x, z), z);
        d.rotation.set((rng() - 0.5) * 0.15, rng() * TAU, (rng() - 0.5) * 0.15);
        d.scale.setScalar(0.8 + rng() * 0.7);
        d.updateMatrix();
        stems.setMatrixAt(placed, d.matrix);
        heads.setMatrixAt(placed, d.matrix);
        heads.setColorAt(placed, color.setHex(palette[Math.floor(rng() * palette.length)]));
        placed++;
    }
    for (const m of [stems, heads]) {
        m.count = placed;
        m.instanceMatrix.needsUpdate = true;
        m.frustumCulled = false;
    }
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    const g = new THREE.Group();
    g.name = 'Flowers';
    g.add(stems, heads);
    scene.add(g);
    return g;
}

export function generateFlora(scene, opts = {}) {
    const area = opts.area || 220;
    const trees = createTrees(scene, opts.trees || 80, area);
    const grass = createGrass(scene, opts.grass || 6500, area, { camera: opts.camera });
    const bushes = createBushes(scene, opts.bushes || 70, area);
    const ferns = createFerns(scene, opts.ferns || 450, area, trees);
    const flowers = createFlowers(scene, opts.flowers || 900, opts.area || 200);
    console.log('[Flora] Деревья (дуб/берёза/ель/сосна/сухое), трава-чанки, папоротники, кусты со вниманием к укрытию, цветы готовы');
    return { trees, grass, bushes, ferns, flowers };
}
