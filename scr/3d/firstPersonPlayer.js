// ============================================================================
//  scr/3d/firstPersonPlayer.js
//  Игрок от 1-го лица — поддерживает ТОПОР, КИРКУ, АК-47 и БЕРДАНКУ.
//
//  Подход: РУКИ + ОРУЖИЕ рендерятся в ОТДЕЛЬНОЙ СЦЕНЕ поверх основной.
//  - handsScene: модель игрока + топор + кирка + АК + берданка + свет
//  - handsCamera: статичная камера рук (как в шутерах)
//
//  Оружие:
//    - 'axe'     : каменный топор. Анимации: idle, atk1, atk2. Ломает деревья.
//    - 'pickaxe' : каменная кирка. ТА ЖЕ анимация и хват что у топора. Ломает камни.
//    - 'ak47'    : автомат АК-47. Позы: idle, run, shoot (отдача).
//    - 'berdana' : винтовка-берданка. ПОЗЫ как у АК (idle/run/shoot).
//                  Текстуры PBR применяются вручную (FBX не содержал ссылок).
//
//  API:
//    constructor(camera, scene, renderer)
//    .loaded, .handBone, .visible, .currentWeapon
//    .setWeapon('axe' | 'pickaxe' | 'ak47' | 'berdana' | 'none')
//    .setFirstPerson(bool), .setVisible(bool)
//    .triggerSwing(type)          — для топора/кирки ('atk1' | 'atk2')
//    .triggerShoot()              — для АК/берданки (отдача, дёргается)
//    .setRunning(bool)            — для АК/берданки (прижимается к груди при беге)
//    .update(dt, opts)            — обновление позы (без рендера)
//    .renderOverlay()             — рендер рук поверх (вызывается ИЗ main.js)
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PLAYER_MODEL_PATH   = './scr/3d/player_claude.glb';
const AXE_MODEL_PATH      = './scr/3d/axe_claude.glb';
const PICKAXE_MODEL_PATH  = './scr/3d/stone_pickaxe.glb';
const AK47_MODEL_PATH     = './scr/3d/ak47.glb';
const BERDANA_MODEL_PATH  = './scr/3d/berdana.glb';
// ✅ PBR-текстуры берданки (FBX не содержал ссылок на них, применяем вручную)
const BERDANA_TEX_BASECOLOR = './scr/3d/berdana_textures/BaseColor.png';
const BERDANA_TEX_NORMAL    = './scr/3d/berdana_textures/Normal.png';
const BERDANA_TEX_ROUGHNESS = './scr/3d/berdana_textures/Roughness.png';
const BERDANA_TEX_METALLIC  = './scr/3d/berdana_textures/Metallic.png';

const D = Math.PI / 180;

// Хват топора (из preview-claude.html)
const GRIP = {
    sS: 0.52, sC: 1.0, sT: 0.8, sG: 0.14, sX: 0.72, sP: 0.032, sR: 90,
};
const ARMS_SCALE = 1.4;

// ✅ Хват КИРКИ — такой же как у топора (модель сделана по тем же пропорциям)
const GRIP_PICKAXE = Object.assign({}, GRIP);

// ✅ Хват АК-47 — настройки из студии (правая рука на пистолете)
const GRIP_AK = {
    sS: 0.840,    // размер АК
    sX: 0.890,    // вдоль пальцев правой
    sP: 0.054,    // от ладони
    sR: 0.0,      // поворот по Y в кисти (град)
};

// ✅ Хват БЕРДАНКИ — идентичен АК (размер как у АК, не меньше)
const GRIP_BERDANA = Object.assign({}, GRIP_AK, {
    sS: GRIP_AK.sS,    // ← такой же как у АК
    sX: GRIP_AK.sX,
    sP: GRIP_AK.sP,
    sR: GRIP_AK.sR,
});

// Клипы поз (общие)
const IDLE = {
    hy: 0, sx: 2, sy: 0, hx: 0,
    ltx: 4, ltk: 6, rtx: -3, rtk: 8,
    rx: 0.22, ry: -0.62, rz: 0.5, rphi: 28, ryaw: 6, roll: 90, curl: 0.9, thumb: 0.8,
    lx: -0.25, ly: -0.85, lz: 0.12, lcurl: 0.35,
};

// Поза idle с ТОПОРОМ
const FIDLE_AXE = Object.assign({}, IDLE, {
    sx: 0, hx: 0,
    rx: 0.12, ry: 0.08, rz: 0.8, rphi: 35, ryaw: 8, roll: 90, curl: 0.9,
    lx: -0.1, ly: -0.05, lz: 0.72, lcurl: 0.3,
});

// ✅ Поза idle с АК-47 — ПО РЕФЕРЕНСУ PUBG (аккуратно смотрел на твою фотку)
//    Правая рука — на пистолетной рукояти у приклада (низко, справа, у спуска)
//    Левая рука — вытянута ВПЕРЁД, на цевье ПОД стволом, ВЫШЕ магазина
//    Ствол — горизонтально вперёд, чуть вверх (~10°)
//    Левая кисть — ЛАДОНЬЮ ВВЕРХ (обхватывает цевьё снизу, пальцы смотрят вверх)
const FIDLE_AK = {
    hy: 0, sx: 0, sy: 0, hx: 0,
    ltx: 0, ltk: 0, rtx: 0, rtk: 0,
    // Правая рука — на пистолете, низко, правее (как на референсе)
    rx: 0.230, ry: 0.290, rz: 0.500,
    rphi: 0.0, ryaw: 5, roll: 90,
    curl: 0.500, thumb: 0.280,           // правая сжимает рукоять
    // Левая рука — вытянута ВПЕРЁД к цевью, ВЫШЕ магазина, ЛАДОНЬЮ ВВЕРХ
    lx: 0.450, ly: 0.300, lz: 0.950,
    lcurl: 0.450,                        // пальцы обхватывают цевьё
    lpalm: 1,                            // ← ЛАДОНЬ ВВЕРХ (пальцы вверх, обхватывает цевьё снизу)
};

// Поза БЕГ с АК-47 (прижат к груди)
const F_RUN_AK = Object.assign({}, IDLE, {
    sx: 0, hx: 0,
    rx: 0.10, ry: 0.05, rz: 0.85, rphi: 60, ryaw: 0, roll: 90, curl: 1.0, thumb: 0.9,
    lx: 0.05, ly: -0.10, lz: 0.55, lcurl: 0.9,
    ltx: 25, ltk: 35, rtx: -25, rtk: -35,
    sy: -8, sx: 4,
});

// Поза ВЫСТРЕЛ (отдача)
const F_SHOOT_AK = Object.assign({}, IDLE, {
    sx: 0, hx: 0,
    rx: 0.35, ry: 0.10, rz: 0.55, rphi: 95, ryaw: 0, roll: 90, curl: 1.0, thumb: 0.9,
    lx: 0.45, ly: 0.30, lz: 0.90, lcurl: 0.5,
    lpalm: 1,    // ← ладонь вверх (как в idle)
});

const mk = (base) => (t, p, e) => ({ t, p: Object.assign({}, base, p), e });
const k1Axe = mk(FIDLE_AXE);

const CL = {
    atk1: {
        dur: 1.2,
        keys: [
            k1Axe(0,    {}),
            k1Axe(0.10, { rx: 0.30, rphi: 10, curl: 1 }),
            k1Axe(0.35, { rx: 0.55, rphi: -10, curl: 1 }),
            k1Axe(0.38, { rx: 0.55, rphi: -10, curl: 1 }),
            k1Axe(0.55, { rx: -0.30, rphi: 80, curl: 1 }, 'in'),
            k1Axe(0.62, { rx: -0.25, rphi: 75, curl: 1 }),
            k1Axe(1.20, {}),
        ],
    },
    atk2: {
        dur: 1.2,
        keys: [
            k1Axe(0,    {}),
            k1Axe(0.08, { rx: 0.10, ry: 0.15, rphi: 15, curl: 1 }),
            k1Axe(0.20, { rx: 0.35, ry: 0.40, rphi: -5, curl: 1 }),
            k1Axe(0.35, { rx: 0.50, ry: 0.55, rphi: -20, curl: 1 }),
            k1Axe(0.38, { rx: 0.50, ry: 0.55, rphi: -20, curl: 1 }),
            k1Axe(0.50, { rx: -0.10, ry: 0.10, lz: 0.85, rphi: 60, curl: 1 }, 'in'),
            k1Axe(0.56, { rx: -0.35, ry: -0.35, lz: 1.00, rphi: 85, curl: 1 }, 'in'),
            k1Axe(0.62, { rx: -0.30, ry: -0.30, lz: 0.95, rphi: 80, curl: 1 }),
            k1Axe(0.75, { rx: -0.15, ry: -0.15, lz: 0.85, rphi: 70, curl: 1 }),
            k1Axe(1.20, {}),
        ],
    },
};

function sm(u) { return u * u * (3 - 2 * u); }

function sample(keys, tn) {
    let i = 0;
    while (i < keys.length - 2 && tn >= keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1];
    let u = Math.min(1, Math.max(0, (tn - a.t) / (b.t - a.t)));
    u = b.e === 'in' ? u * u * u : sm(u);
    const o = {};
    for (const k in a.p) o[k] = a.p[k] + (b.p[k] - a.p[k]) * u;
    return o;
}

export class FirstPersonPlayer {
    constructor(camera, scene, renderer) {
        this.camera = camera;
        this.scene = scene;
        this.renderer = renderer || window.__renderer;

        this.handsScene = new THREE.Scene();

        this.handsScene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3a2e24, 0.8));
        const sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
        sun.position.set(3, 5, 3.5);
        this.handsScene.add(sun);
        const rim = new THREE.DirectionalLight(0x7fa8ff, 1.1);
        rim.position.set(-3, 2.5, -3);
        this.handsScene.add(rim);
        const fill = new THREE.DirectionalLight(0xffc9a0, 0.5);
        fill.position.set(-3, 1, 3);
        this.handsScene.add(fill);

        this.handsCamera = new THREE.PerspectiveCamera(74, 1, 0.02, 200);

        this.model = null;
        this.loaded = false;
        this.handBone = null;
        this.visible = false;
        this._firstPerson = true;
        this._swingType = null;
        this._animTime = 0;
        this._clock = 0;

        this.currentWeapon = 'none';
        this.isRunning = false;
        this._shootKick = 0;
        this._shootKickDur = 0.2;   // ✅ было 0.12 — слишком резко, теперь плавнее

        this._load();
    }

    _load() {
        const loader = new GLTFLoader();
        const texLoader = new THREE.TextureLoader();
        Promise.all([
            new Promise((ok, no) => loader.load(PLAYER_MODEL_PATH,   ok, undefined, no)),
            new Promise((ok, no) => loader.load(AXE_MODEL_PATH,      ok, undefined, no)),
            new Promise((ok, no) => loader.load(PICKAXE_MODEL_PATH,  ok, undefined, no)),
            new Promise((ok, no) => loader.load(AK47_MODEL_PATH,     ok, undefined, no)),
            new Promise((ok, no) => loader.load(BERDANA_MODEL_PATH,  ok, undefined, no)),
        ]).then(([pg, ag, pkg, kg, bg]) => {
            // ✅ Параллельно догружаем PBR-текстуры берданки
            const btex = {
                map: texLoader.load(BERDANA_TEX_BASECOLOR),
                normalMap: texLoader.load(BERDANA_TEX_NORMAL),
                roughnessMap: texLoader.load(BERDANA_TEX_ROUGHNESS),
                metalnessMap: texLoader.load(BERDANA_TEX_METALLIC),
            };
            for (const k in btex) { btex[k].anisotropy = 8; btex[k].colorSpace = THREE.SRGBColorSpace; }
            this._berdanaTex = btex;
            this._init(pg, ag, pkg, kg, bg);
        }).catch(e => console.error('[FirstPersonPlayer] Ошибка загрузки:', e));
    }

    _init(pg, ag, pkg, kg, bg) {
        const model = pg.scene;
        this.model = model;
        this.handsScene.add(model);

        model.updateMatrixWorld(true);
        let hipsY = null;
        const findHips = (o) => {
            if (!o || hipsY !== null) return;
            if (o.isBone && /Hips/i.test(o.name || '')) {
                const p = new THREE.Vector3();
                o.getWorldPosition(p);
                hipsY = p.y; return;
            }
            if (o.children) for (const c of o.children) findHips(c);
        };
        findHips(model);
        if (hipsY !== null && hipsY > 50) {
            model.scale.multiplyScalar(0.01);
            model.updateMatrixWorld(true);
            console.log(`[FP] Масштаб модели: ×0.01`);
        }

        const meshes = [];
        const walkShadows = (o) => {
            if (!o) return;
            if (o.isMesh) {
                o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
                meshes.push(o);
            }
            if (o.children) for (const c of o.children) walkShadows(c);
        };
        walkShadows(model);
        model.updateMatrixWorld(true);

        const B = {}, rest = {};
        const walkBones = (o) => {
            if (!o) return;
            if (o.isBone) {
                const k = (o.name || '').replace(/^mixamorig:?/, '').replace(/_\d+$/, '');
                B[k] = o;
            }
            if (o.children) for (const c of o.children) walkBones(c);
        };
        walkBones(model);
        this.bones = B;
        for (const k in B) {
            const b = B[k];
            rest[k] = { q: b.quaternion.clone(), s: b.scale.clone(), wq: b.getWorldQuaternion(new THREE.Quaternion()) };
        }
        this.rest = rest;

        const wp = (b) => b.getWorldPosition(new THREE.Vector3());
        const UP = new THREE.Vector3(0, 1, 0);
        const RT = wp(B.RightShoulder).clone().sub(wp(B.LeftShoulder)).setY(0).normalize();
        const FW = new THREE.Vector3().crossVectors(UP, RT);
        const LF = RT.clone().negate();
        this.UP = UP; this.RT = RT; this.FW = FW; this.LF = LF;
        this.REST_ANKLE = wp(B.LeftFoot).y;
        this.eyeRest = wp(B.Head).add(new THREE.Vector3(0, 0.14, 0)).addScaledVector(FW, 0.03);

        const HF = {}, AXC = {}, AXF = {}, AXN = {}, SG = {};
        const loc = (k, v) => v.clone().applyQuaternion(rest[k].wq.clone().invert());
        ['Left', 'Right'].forEach((s) => {
            const h = wp(B[s + 'Hand']), m = wp(B[s + 'HandMiddle1']), i = wp(B[s + 'HandIndex1']), p = wp(B[s + 'HandPinky1']);
            const f = m.clone().sub(h); const palmLen = f.length(); f.normalize();
            const a = i.clone().sub(p); a.addScaledVector(f, -a.dot(f)).normalize();
            const c = new THREE.Vector3().crossVectors(f, a);
            const n = c.clone(); if (n.dot(new THREE.Vector3(-h.x, 0, 0)) < 0) n.negate();
            HF[s] = { f, a, c, n, palmLen, h0: h.clone(),
                wq: rest[s + 'Hand'].wq.clone(),
                inv: B[s + 'Hand'].matrixWorld.clone().invert(),
                ws: new THREE.Vector3().setFromMatrixScale(B[s + 'Hand'].matrixWorld).x,
            };
            SG[s] = {
                curl: Math.sign(new THREE.Vector3().crossVectors(a, f).dot(n)) || 1,
                tf:   Math.sign(c.dot(n)) || 1,
                tn:   Math.sign(new THREE.Vector3().crossVectors(n, a).dot(f)) || 1,
            };
            ['Index', 'Middle', 'Ring', 'Pinky'].forEach((F) => [1, 2, 3].forEach((k) => {
                const key = s + 'Hand' + F + k; AXC[key] = loc(key, a);
            }));
            [1, 2, 3].forEach((k) => {
                const key = s + 'HandThumb' + k; AXF[key] = loc(key, f); AXN[key] = loc(key, n);
            });
        });
        this.HF = HF; this.AXC = AXC; this.AXF = AXF; this.AXN = AXN; this.SG = SG;
        this.meshes = meshes;

        /* ТОПОР */
        const axeProto = ag.scene;
        const walkAxe = (o) => {
            if (!o) return;
            if (o.isMesh) {
                o.castShadow = true; o.receiveShadow = true;
                const m = o.material;
                if (m) { m.side = THREE.DoubleSide; if (m.map) m.map.anisotropy = 8; m.metalness = 0; m.roughness = Math.max(m.roughness ?? 1, 0.75); }
            }
            if (o.children) for (const c of o.children) walkAxe(c);
        };
        walkAxe(axeProto);
        this.axeHolder = new THREE.Group();
        this.axe = axeProto.clone(true);
        this.axeHolder.add(this.axe);
        B.RightHand.add(this.axeHolder);
        this.handBone = B.RightHand;
        this.axeHolder.visible = false;

        /* АК-47 */
        const akProto = kg.scene;
        const akBox = new THREE.Box3().setFromObject(akProto);
        const akSize = akBox.getSize(new THREE.Vector3());
        const akLen = Math.max(akSize.x, akSize.y, akSize.z);
        const AK_TARGET_LEN = 0.85;
        if (akLen > 1) {
            akProto.scale.multiplyScalar(AK_TARGET_LEN / akLen);
            akProto.updateMatrixWorld(true);
        }
        const akCenteredBox = new THREE.Box3().setFromObject(akProto);
        const akCenter = akCenteredBox.getCenter(new THREE.Vector3());
        akProto.position.x -= akCenter.x;
        akProto.position.z -= akCenter.z;
        akProto.position.y -= akCenteredBox.min.y;
        const walkAK = (o) => {
            if (!o) return;
            if (o.isMesh) {
                o.castShadow = true; o.receiveShadow = true;
                const m = o.material;
                if (m) { m.side = THREE.DoubleSide; if (m.map) m.map.anisotropy = 8; }
            }
            if (o.children) for (const c of o.children) walkAK(c);
        };
        walkAK(akProto);

        this.akHolder = new THREE.Group();
        this.ak = akProto.clone(true);
        this.akHolder.add(this.ak);
        B.RightHand.add(this.akHolder);
        this.akHolder.visible = false;
        this.akHolder.position.set(0, 0.05, 0);
        this.akHolder.rotation.set(0, 0, 0);

        /* ✅ КИРКА — ИДЕНТИЧНО топору: берём как есть из glb, без масштабирования */
        const pkProto = pkg.scene;
        const walkPK = (o) => {
            if (!o) return;
            if (o.isMesh) {
                o.castShadow = true; o.receiveShadow = true;
                const m = o.material;
                if (m) { m.side = THREE.DoubleSide; if (m.map) m.map.anisotropy = 8; m.metalness = 0; m.roughness = Math.max(m.roughness ?? 1, 0.75); }
            }
            if (o.children) for (const c of o.children) walkPK(c);
        };
        walkPK(pkProto);
        this.pickaxeHolder = new THREE.Group();
        this.pickaxe = pkProto.clone(true);
        this.pickaxeHolder.add(this.pickaxe);
        B.RightHand.add(this.pickaxeHolder);
        this.pickaxeHolder.visible = false;

        /* ✅ БЕРДАНКА — ТА ЖЕ логика что у АК (PBR-текстуры + масштаб под АК, без центрирования) */
        const bProto = bg.scene;
        const bBox = new THREE.Box3().setFromObject(bProto);
        const bSize = bBox.getSize(new THREE.Vector3());
        const bLen = Math.max(bSize.x, bSize.y, bSize.z);
        const B_TARGET_LEN = 0.85;   // как АК
        if (bLen > 0.001) {
            bProto.scale.multiplyScalar(B_TARGET_LEN / bLen);
            bProto.updateMatrixWorld(true);
        }
        // ✅ Без центрирования — pivot из glb используется напрямую (как АК)
        const bCenteredBox = new THREE.Box3().setFromObject(bProto);
        const bCenter = bCenteredBox.getCenter(new THREE.Vector3());
        // ✅ Центрируем как АК (та же логика)
        bProto.position.x -= bCenter.x;
        bProto.position.z -= bCenter.z;
        bProto.position.y -= bCenteredBox.min.y;
        const berdanaMat = new THREE.MeshStandardMaterial({
            map: this._berdanaTex.map,
            normalMap: this._berdanaTex.normalMap,
            roughnessMap: this._berdanaTex.roughnessMap,
            metalnessMap: this._berdanaTex.metalnessMap,
            roughness: 1.0,
            metalness: 1.0,
            side: THREE.DoubleSide,
        });
        const walkB = (o) => {
            if (!o) return;
            if (o.isMesh) {
                o.castShadow = true; o.receiveShadow = true;
                o.material = berdanaMat;
            }
            if (o.children) for (const c of o.children) walkB(c);
        };
        walkB(bProto);
        this.berdanaHolder = new THREE.Group();
        this.berdana = bProto.clone(true);
        this.berdanaHolder.add(this.berdana);
        B.RightHand.add(this.berdanaHolder);
        this.berdanaHolder.visible = false;
        // ✅ Берданка опущена ниже к руке (была высоко)
        this.berdanaHolder.position.set(0, -0.1, 0);
        this.berdanaHolder.rotation.set(0, 0, 0);

        this._poseHelpers();

        this.loaded = true;
        this.setFirstPerson(true);
        this.setVisible(this.visible);

        if (this._pendingWeapon && this._pendingWeapon !== 'none') {
            console.log('[FP] Применяю отложенный setWeapon: ' + this._pendingWeapon);
            this.setWeapon(this._pendingWeapon);
        }

        if (window.__onPlayerLoaded) window.__onPlayerLoaded(this);
        // ✅ Подробный лог: что реально создано
        console.log('[FirstPersonPlayer] Готов. Holders:', {
            axe: !!this.axeHolder,
            pickaxe: !!this.pickaxeHolder,
            ak47: !!this.akHolder,
            berdana: !!this.berdanaHolder,
        });
    }

    _poseHelpers() {
        const B = this.bones, rest = this.rest;
        const wp = (b) => b.getWorldPosition(new THREE.Vector3());

        this.setWQ = (b, q) => {
            const pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
            b.quaternion.copy(pq.invert().multiply(q));
            b.updateMatrixWorld(true);
        };
        this.rotW = (b, ax, ang) => this.setWQ(b, new THREE.Quaternion().setFromAxisAngle(ax, ang).multiply(b.getWorldQuaternion(new THREE.Quaternion())));
        this.aimW = (b, from, to) => this.setWQ(b, new THREE.Quaternion().setFromUnitVectors(from, to).multiply(b.getWorldQuaternion(new THREE.Quaternion())));

        this.ik = (arm, fore, hand, target, pole) => {
            const S = wp(arm), E = wp(fore), W = wp(hand);
            const l1 = E.distanceTo(S), l2 = W.distanceTo(E);
            const d = target.clone().sub(S);
            let dist = Math.min(d.length(), l1 + l2 - 1e-4);
            dist = Math.max(dist, Math.abs(l1 - l2) + 1e-3);
            d.normalize();
            const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
            const h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
            const p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
            const En = S.clone().addScaledVector(d, x).addScaledVector(p, h);
            this.aimW(arm, E.clone().sub(S).normalize(), En.sub(S).normalize());
            const E2 = wp(fore), W2 = wp(hand), T2 = S.clone().addScaledVector(d, dist);
            this.aimW(fore, W2.sub(E2).normalize(), T2.sub(E2).normalize());
        };

        this.orientHand = (side, f2, a2) => {
            const H = this.HF[side];
            const m0 = new THREE.Matrix4().makeBasis(H.f, H.a, H.c);
            const m1 = new THREE.Matrix4().makeBasis(f2, a2, new THREE.Vector3().crossVectors(f2, a2));
            const qm = new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.clone().transpose()));
            this.setWQ(this.bones[side + 'Hand'], qm.multiply(H.wq));
        };

        const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
        this.fingers = (side, curl, thumb) => {
            const g = this.SG[side];
            ['Index', 'Middle', 'Ring', 'Pinky'].forEach((F, fi) => [70, 80, 55].forEach((deg, n) => {
                const k = side + 'Hand' + F + (n + 1);
                this.bones[k].quaternion.copy(rest[k].q)
                    .multiply(q1.setFromAxisAngle(this.AXC[k], g.curl * deg * D * curl * [1, 1.05, 1.1, 1.15][fi]));
            }));
            [[35, 22], [30, 8], [30, 4]].forEach(([af, an], n) => {
                const k = side + 'HandThumb' + (n + 1);
                this.bones[k].quaternion.copy(rest[k].q)
                    .multiply(q1.setFromAxisAngle(this.AXF[k], g.tf * af * D * thumb))
                    .multiply(q2.setFromAxisAngle(this.AXN[k], g.tn * an * D * thumb));
            });
        };

        this.reach = (s) => {
            const a = wp(this.bones[s + 'Arm']), e = wp(this.bones[s + 'ForeArm']);
            return a.distanceTo(e) + e.distanceTo(wp(this.bones[s + 'Hand']));
        };

        this.placeAxe = (roll) => {
            const H = this.HF.Right;
            const gx = GRIP.sX, gp = GRIP.sP, G = GRIP.sG, S = GRIP.sS;
            const pos = H.h0.clone().addScaledVector(H.f, H.palmLen * gx).addScaledVector(H.n, gp).applyMatrix4(H.inv);
            this.axeHolder.position.copy(pos);
            const fl = H.f.clone().applyQuaternion(H.wq.clone().invert());
            const al = H.a.clone().applyQuaternion(H.wq.clone().invert());
            const cl = new THREE.Vector3().crossVectors(fl, al);
            const qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fl, al, cl));
            this.axeHolder.quaternion.copy(qb).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (roll + GRIP.sR) * D));
            this.axeHolder.scale.setScalar(S / H.ws);
            this.axe.position.set(0, -G, 0);
        };

        this.placeAK = () => {
            const H = this.HF.Right;
            const pos = H.h0.clone()
                .addScaledVector(H.f, H.palmLen * GRIP_AK.sX)
                .addScaledVector(H.n, GRIP_AK.sP)
                .applyMatrix4(H.inv);
            this.akHolder.position.copy(pos);
            const fl = H.f.clone().applyQuaternion(H.wq.clone().invert());
            const al = H.a.clone().applyQuaternion(H.wq.clone().invert());
            const cl = new THREE.Vector3().crossVectors(fl, al);
            const qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fl, al, cl));
            this.akHolder.quaternion.copy(qb).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), GRIP_AK.sR * D));
            this.akHolder.scale.setScalar(GRIP_AK.sS / H.ws);
            // ✅ АК внутри holder'а: поворот на +90° по Y (ствол из Y → Z, горизонтально вперёд)
            this.ak.position.set(0, 0, 0);
            this.ak.rotation.set(0, Math.PI / 2, 0);
        };

        // ✅ placePickaxe — идентично placeAxe (кирка сделана по тем же пропорциям)
        this.placePickaxe = (roll) => {
            const H = this.HF.Right;
            const gx = GRIP_PICKAXE.sX, gp = GRIP_PICKAXE.sP, G = GRIP_PICKAXE.sG, S = GRIP_PICKAXE.sS;
            const pos = H.h0.clone().addScaledVector(H.f, H.palmLen * gx).addScaledVector(H.n, gp).applyMatrix4(H.inv);
            this.pickaxeHolder.position.copy(pos);
            const fl = H.f.clone().applyQuaternion(H.wq.clone().invert());
            const al = H.a.clone().applyQuaternion(H.wq.clone().invert());
            const cl = new THREE.Vector3().crossVectors(fl, al);
            const qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fl, al, cl));
            this.pickaxeHolder.quaternion.copy(qb).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (roll + GRIP_PICKAXE.sR) * D));
            this.pickaxeHolder.scale.setScalar(S / H.ws);
            this.pickaxe.position.set(0, -G, 0);
        };

        // ✅ placeBerdana — как placeAK, но опускаем на 0.15м ниже к руке
        this.placeBerdana = () => {
            const H = this.HF.Right;
            const pos = H.h0.clone()
                .addScaledVector(H.f, H.palmLen * GRIP_BERDANA.sX)
                .addScaledVector(H.n, GRIP_BERDANA.sP)
                .applyMatrix4(H.inv);
            pos.y -= 0.25;   // ✅ опускаем берданку ниже к руке (было 0.15)
            this.berdanaHolder.position.copy(pos);
            const fl = H.f.clone().applyQuaternion(H.wq.clone().invert());
            const al = H.a.clone().applyQuaternion(H.wq.clone().invert());
            const cl = new THREE.Vector3().crossVectors(fl, al);
            const qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fl, al, cl));
            this.berdanaHolder.quaternion.copy(qb).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), GRIP_BERDANA.sR * D));
            this.berdanaHolder.scale.setScalar(GRIP_BERDANA.sS / H.ws);
            this.berdana.position.set(0, 0, 0);
            this.berdana.rotation.set(0, Math.PI / 2, 0);
        };

        this.pose = (p, fp) => {
            const B = this.bones, rest = this.rest;
            const UP = this.UP, RT = this.RT, FW = this.FW, LF = this.LF;
            const wp = (b) => b.getWorldPosition(new THREE.Vector3());
            for (const k in B) { B[k].quaternion.copy(rest[k].q); B[k].scale.copy(rest[k].s); }
            if (fp) { B.LeftArm.scale.multiplyScalar(ARMS_SCALE); B.RightArm.scale.multiplyScalar(ARMS_SCALE); }
            this.model.position.y = 0;
            this.model.updateMatrixWorld(true);

            this.rotW(B.Hips, UP, p.hy * D);
            ['Spine', 'Spine1', 'Spine2'].forEach((k) => {
                this.rotW(B[k], UP, p.sy * D / 3);
                this.rotW(B[k], LF, p.sx * D / 3);
            });
            this.rotW(B.Head, LF, p.hx * D);
            [['Left', p.ltx, p.ltk], ['Right', p.rtx, p.rtk]].forEach(([s, tx, tk]) => {
                this.rotW(B[s + 'UpLeg'], LF, -tx * D);
                this.rotW(B[s + 'Leg'], LF, tk * D);
                this.rotW(B[s + 'Foot'], LF, (tx - tk) * D);
            });
            this.model.updateMatrixWorld(true);
            this.model.position.y = this.REST_ANKLE - Math.min(wp(B.LeftFoot).y, wp(B.RightFoot).y);
            this.model.updateMatrixWorld(true);

            const qT = B.Spine2.getWorldQuaternion(new THREE.Quaternion()).multiply(rest.Spine2.wq.clone().invert());
            const Ut = UP.clone().applyQuaternion(qT);
            const Ft = FW.clone().applyQuaternion(qT);
            const Rt = RT.clone().applyQuaternion(qT);
            const tgt = (S, L, x, y, z) => S.clone().addScaledVector(Rt, x * L).addScaledVector(Ut, y * L).addScaledVector(Ft, z * L);

            const LR = this.reach('Right'), SR = wp(B.RightArm);
            this.ik(B.RightArm, B.RightForeArm, B.RightHand,
                tgt(SR, LR, p.rx, p.ry, p.rz),
                Ut.clone().multiplyScalar(-1).addScaledVector(Rt, 0.5).addScaledVector(Ft, -0.3));
            const ph = p.rphi * D;
            let a2 = Ut.clone().multiplyScalar(Math.cos(ph)).addScaledVector(Ft, Math.sin(ph)).applyAxisAngle(Ut, p.ryaw * D).normalize();
            const fd = wp(B.RightHand).clone().sub(wp(B.RightForeArm)).normalize();
            const pr = fd.clone().addScaledVector(a2, -fd.dot(a2));
            const ln = pr.length(); pr.normalize();
            const gg = new THREE.Vector3().crossVectors(a2, Rt).normalize();
            if (gg.dot(pr) < 0) gg.negate();
            const w = Math.min(1, Math.max(0, (ln - 0.35) / 0.35));
            const f2 = pr.multiplyScalar(w).addScaledVector(gg, 1 - w).normalize();
            this.orientHand('Right', f2, a2);
            this.fingers('Right', p.curl, p.thumb);

            const LL = this.reach('Left'), SL = wp(B.LeftArm);
            this.ik(B.LeftArm, B.LeftForeArm, B.LeftHand,
                tgt(SL, LL, p.lx, p.ly, p.lz),
                Ut.clone().multiplyScalar(-1).addScaledVector(Rt, -0.5).addScaledVector(Ft, -0.3));
            const fl = wp(B.LeftHand).clone().sub(wp(B.LeftForeArm)).normalize();
            // ✅ Ориентация левой кисти:
            //    lpalm = 0 (по умолчанию) → ладонь вниз (как для топора)
            //    lpalm = 1 → ладонь ВВЕРХ (для АК — обхватывает цевьё снизу, пальцы вверх)
            //    Метод: поворот вектора "вверх кисти" (al) на 180° вокруг оси f (вперёд)
            //    Это переворачивает ладонь БЕЗ скручивания руки.
            const lpalm = p.lpalm || 0;
            let al = Ut.clone().multiplyScalar(0.8).addScaledVector(Rt, 0.5);
            al.addScaledVector(fl, -al.dot(fl)).normalize();
            if (lpalm > 0.5) {
                // ✅ Перевернуть ладонь: al → -al (поворот на 180° вокруг f)
                al.negate();
            }
            this.orientHand('Left', fl, al);
            this.fingers('Left', p.lcurl, 0.3);

            this.model.updateMatrixWorld(true);

            if (this.currentWeapon === 'axe') {
                this.placeAxe(p.roll, fp);
            } else if (this.currentWeapon === 'pickaxe') {
                this.placePickaxe(p.roll);
            } else if (this.currentWeapon === 'ak47') {
                this.placeAK();
            } else if (this.currentWeapon === 'berdana') {
                this.placeBerdana();
            }
        };
    }

    setWeapon(type) {
        this.currentWeapon = type;
        const showArms = (type === 'axe' || type === 'pickaxe' || type === 'ak47' || type === 'berdana');
        this._applyVisibility(showArms);
        if (this.axeHolder)      this.axeHolder.visible      = showArms && (type === 'axe');
        if (this.pickaxeHolder)  this.pickaxeHolder.visible  = showArms && (type === 'pickaxe');
        if (this.akHolder)       this.akHolder.visible       = showArms && (type === 'ak47');
        if (this.berdanaHolder)  this.berdanaHolder.visible  = showArms && (type === 'berdana');
        this._pendingWeapon = type;
        this._swingType = null;
        this._shootKick = 0;
    }

    _applyVisibility(showArms) {
        if (!this.model || !this.meshes) return;
        this.visible = showArms;
        for (const m of this.meshes) {
            const mn = (m.material && m.material.name) || '';
            const isArm = /arms/i.test(mn);
            if (this._firstPerson) {
                m.visible = showArms && isArm;
            } else {
                m.visible = showArms;
            }
        }
    }

    setFirstPerson(enable) {
        this._firstPerson = enable;
        if (!this.model) return;
        if (enable) {
            for (const m of this.meshes) {
                const mn = (m.material && m.material.name) || '';
                m.visible = /arms/i.test(mn);
            }
        } else {
            for (const m of this.meshes) m.visible = true;
        }
    }

    setVisible(v) {
        const showArms = v && (this.currentWeapon === 'axe' || this.currentWeapon === 'pickaxe' || this.currentWeapon === 'ak47' || this.currentWeapon === 'berdana');
        this._applyVisibility(showArms);
        if (this.axeHolder)      this.axeHolder.visible      = showArms && (this.currentWeapon === 'axe');
        if (this.pickaxeHolder)  this.pickaxeHolder.visible  = showArms && (this.currentWeapon === 'pickaxe');
        if (this.akHolder)       this.akHolder.visible       = showArms && (this.currentWeapon === 'ak47');
        if (this.berdanaHolder)  this.berdanaHolder.visible  = showArms && (this.currentWeapon === 'berdana');
    }

    triggerSwing(type = 'atk1') {
        if (!this.loaded || !this.visible) return;
        // ✅ Свинг работает и для топора, и для кирки (те же анимации atk1/atk2)
        if (this.currentWeapon !== 'axe' && this.currentWeapon !== 'pickaxe') return;
        if (!CL[type]) return;
        this._swingType = type;
        this._animTime = 0;
    }

    triggerShoot() {
        if (!this.loaded || !this.visible) return;
        // ✅ Отдача работает и для АК, и для берданки
        if (this.currentWeapon !== 'ak47' && this.currentWeapon !== 'berdana') return;
        this._shootKick = this._shootKickDur;
    }
    setRunning(running) {
        this.isRunning = !!running;
    }

    update(dt, opts = {}) {
        if (!this.loaded) return;
        this._clock += dt;

        let p;
        if (this.currentWeapon === 'ak47' || this.currentWeapon === 'berdana') {
            // ✅ Берданка использует те же позы что АК (idle/run/shoot)
            if (this._shootKick > 0) {
                const t = 1 - (this._shootKick / this._shootKickDur);
                const kick = Math.sin(t * Math.PI);
                p = Object.assign({}, F_SHOOT_AK);
                // ✅ СОВСЕМ лёгкое дёргание — чуть назад и сразу обратно
                p.rx += 0.012 * kick;    // минимальный наклон
                p.rphi += 0.5 * kick;     // минимальный плеч
                p.lz -= 0.005 * kick;     // минимальный откат левой
                this._shootKick -= dt;
                if (this._shootKick < 0) this._shootKick = 0;
            } else if (this.isRunning) {
                p = Object.assign({}, F_RUN_AK);
                p.sx += Math.sin(this._clock * 8) * 1.5;
                p.ltx = 25 + Math.sin(this._clock * 8) * 5;
                p.ltk = 35 + Math.cos(this._clock * 8) * 5;
                p.rtx = -25 - Math.sin(this._clock * 8) * 5;
                p.rtk = -35 - Math.cos(this._clock * 8) * 5;
            } else {
                p = Object.assign({}, FIDLE_AK);
                p.sx += Math.sin(this._clock * 1.8) * 0.8;
                p.sy += Math.sin(this._clock * 1.5) * 0.5;
            }
        } else if (this.currentWeapon === 'axe' || this.currentWeapon === 'pickaxe') {
            // ✅ Кирка использует те же анимации что топор
            if (this._swingType) {
                const c = CL[this._swingType];
                this._animTime += dt;
                if (this._animTime >= c.dur) {
                    this._swingType = null;
                    p = FIDLE_AXE;
                } else {
                    p = sample(c.keys, Math.max(0, this._animTime) / c.dur);
                }
            } else {
                p = Object.assign({}, FIDLE_AXE);
                p.sx += Math.sin(this._clock * 1.8) * 0.8;
            }
        } else {
            p = Object.assign({}, IDLE);
            p.sx += Math.sin(this._clock * 1.8) * 0.8;
        }

        this.pose(p, true);
    }

    renderOverlay() {
        if (!this.loaded || !this.visible) return;
        if (!this.renderer) return;

        this.handsCamera.position.set(0, 1.7, 0);
        this.handsCamera.up.set(0, 1, 0);
        this.handsCamera.lookAt(0, 1.0, 5);
        this.handsCamera.fov = 74;
        this.handsCamera.aspect = this.camera.aspect;
        this.handsCamera.near = 0.02;
        this.handsCamera.far = 200;
        this.handsCamera.updateProjectionMatrix();

        const prevAutoClear = this.renderer.autoClear;
        this.renderer.autoClear = false;
        this.renderer.setRenderTarget(null);
        this.renderer.clearDepth();
        this.renderer.render(this.handsScene, this.handsCamera);
        this.renderer.autoClear = prevAutoClear;
    }

    dispose() {
        if (this.model) {
            if (this.model.parent) this.model.parent.remove(this.model);
            this.model.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    const mats = Array.isArray(o.material) ? o.material : [o.material];
                    for (const m of mats) m.dispose();
                }
            });
            this.model = null;
        }
        this.loaded = false;
    }
}
