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
//    - 'berdana' : винтовка-берданка. Правая рука на рукояти, левая на стволе, бег/выстрел/прицел как у АК.
//                  Текстуры PBR применяются вручную (FBX не содержал ссылок).
//
//  API:
//    constructor(camera, scene, renderer)
//    .loaded, .handBone, .visible, .currentWeapon
//    .setWeapon('axe' | 'pickaxe' | 'ak47' | 'berdana' | 'none')
//    .setFirstPerson(bool), .setVisible(bool)
//    .triggerSwing(type)          — для топора/кирки ('atk1' | 'atk2')
//    .triggerShoot()              — для АК/берданки (мягкая отдача + дрожь рук)
//    .setRunning(bool)            — для АК/берданки (прижимается к груди при беге)
//    .setAiming(bool) / ПКМ       — АК и берданка: прицеливание (мушка по центру экрана); .adsAmount = 0..1
//    .update(dt, opts)            — обновление позы (без рендера)
//    .renderOverlay()             — рендер рук поверх (вызывается ИЗ main.js)
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';   // ✅ для дробовика (FBX-модель)

const PLAYER_MODEL_PATH   = './scr/3d/player_claude.glb';
const AXE_MODEL_PATH      = './scr/3d/axe_claude.glb';
const PICKAXE_MODEL_PATH  = './scr/3d/stone_pickaxe.glb';
const AK47_MODEL_PATH     = './scr/3d/ak47.glb';
const BERDANA_MODEL_PATH  = './scr/3d/berdana.glb';
// ✅ ДРОБОВИК — FBX, грузим через FBXLoader
const SHOTGUN_MODEL_PATH  = './scr/3d/shotgun.fbx';
// ✅ PBR-текстуры берданки (FBX не содержал ссылок на них, применяем вручную)
const BERDANA_TEX_BASECOLOR = './scr/3d/berdana_textures/BaseColor.png';
const BERDANA_TEX_NORMAL    = './scr/3d/berdana_textures/Normal.png';
const BERDANA_TEX_ROUGHNESS = './scr/3d/berdana_textures/Roughness.png';
const BERDANA_TEX_METALLIC  = './scr/3d/berdana_textures/Metallic.png';
// ✅ PBR-текстуры дробовика (FBX без ссылок, применяем вручную — как у берданки)
const SHOTGUN_TEX_BASECOLOR = './scr/3d/shotgun_textures/BaseColor.png';
const SHOTGUN_TEX_NORMAL    = './scr/3d/shotgun_textures/Normal.png';
const SHOTGUN_TEX_ROUGHNESS = './scr/3d/shotgun_textures/Roughness.png';
const SHOTGUN_TEX_METALLIC  = './scr/3d/shotgun_textures/Metallic.png';
const SHOTGUN_TEX_AO        = './scr/3d/shotgun_textures/Mixed_AO.png';

const D = Math.PI / 180;

// Хват топора (из preview-claude.html)
const GRIP = {
    sS: 0.52, sC: 1.0, sT: 0.8, sG: 0.14, sX: 0.72, sP: 0.032, sR: 90,
};
const ARMS_SCALE = 1.4;

// ✅ Хват КИРКИ — такой же как у топора (модель сделана по тем же пропорциям)
const GRIP_PICKAXE = Object.assign({}, GRIP);
// ✅ Длина кирки в руке (м) — как у топора (0.55). Больше = кирка крупнее.
const PICKAXE_TARGET_LEN = 0.55;   // = AXE_TARGET_LEN (размер как у топора)
const PICKAXE_PIVOT_Y = 0;          // подвинуть кирку по рукояти (в единицах модели после масштаба): + вверх, − вниз

// ✅ Хват АК-47 — настройки из студии (правая рука на пистолете)
const GRIP_AK = {
    sS: 0.840,    // размер АК
    sX: 0.890,    // вдоль пальцев правой
    sP: 0.054,    // от ладони
    sR: 0.0,      // поворот по Y в кисти (град)
};

// ✅ Хват БЕРДАНКИ — правая рука лежит на ПИСТОЛЕТНОЙ РУКОЯТИ (деталь handle_ в berdana.glb).
//    Размер как у АК. grip — центр рукояти в координатах модели berdana.glb (дуло = +Z, верх = +Y).
const GRIP_BERDANA = {
    sS: GRIP_AK.sS,                        // размер (как у АК)
    sA: 0.50,                              // где на ладони рукоять: доля длины ладони от запястья
    sP: 0.032,                             // зазор ладонь ↔ рукоять (больше = рука дальше от рукояти)
    sR: 0,                                 // поворот по Y в кисти (град)
    grip: { x: 0, y: 0.0206, z: -0.0160 }, // центр рукояти
};

// ✅ ЛЕВАЯ РУКА НА СТВОЛЕ БЕРДАНКИ (хват «C-grip» снизу: ладонь под стволом, пальцы обхватывают его справа).
//    Рука привязана к самому оружию. Координаты — в единицах модели berdana.glb.
const GRIP_BERDANA_LEFT = {
    enabled:    true,    // false → старая поза левой руки
    zPref:      0.030,   // куда кладём руку вдоль ствола (больше = ближе к дулу)
    zRear:      0.022,   // самая задняя точка (перед ствольной коробкой, ладонь не должна задеть её), если рука не достаёт
    yCenter:    0.0349,  // высота оси ствола
    fingerAng:  50,      // угол пальцев от ствола вправо: 0 = вдоль ствола, 90 = поперёк
    palmTilt:   0.30,    // наклон ладони вправо (к стволу)
    palmThick:  0.20,    // зазор ладонь↔ствол (доли длины ладони)
    palmFrac:   0.50,    // центр ладони от запястья (доля длины ладони)
    curl:       0.75,    // сжатие пальцев (ствол тонкий — обхват сильнее, чем у АК)
    thumb:      0.25,
    twistShare: 0.5,
};

// ✅ ЛЕВАЯ РУКА НА ЦЕВЬЕ АК-47 (хват «C-grip»: ладонь снизу, большой палец слева вдоль цевья,
//    четыре пальца обхватывают цевьё справа). Рука привязана к САМОМУ автомату,
//    поэтому не уезжает и не проходит сквозь него при покачивании/беге/отдаче.
//    Координаты — в единицах модели ak47.glb (ось ствола: меньше = ближе к дульному срезу;
//    низ цевья z=0, верх z=0.8).
const GRIP_AK_LEFT = {
    enabled:    true,   // false → вернуть старую позу левой руки
    yPref:     -1.85,   // где держим цевьё (ближе к дулу)
    yRear:     -1.30,   // самая задняя точка (перед магазином), если рука не достаёт
    zCenter:    0.40,   // высота оси цевья
    fingerAng:  50,     // угол пальцев от ствола вправо: 0 = вдоль ствола, 90 = поперёк
    palmTilt:   0.30,   // наклон ладони вправо (к цевью)
    palmThick:  0.20,   // зазор ладонь↔цевьё (доли длины ладони) — больше = рука дальше от цевья
    palmFrac:   0.50,   // центр ладони от запястья (доля длины ладони)
    curl:       0.55,   // сжатие пальцев (больше = сильнее обхват)
    thumb:      0.25,   // большой палец
    twistShare: 0.5,    // какая часть скручивания уходит на предплечье (убирает «выкрученное» запястье)
};

// ✅ ПРИЦЕЛИВАНИЕ АК-47 (ПКМ). Линия прицела = целик → кончик мушки (координаты модели ak47.glb).
//    Автомат ставится так, чтобы мушка была ровно под прицелом (по центру экрана).
//    ✅ Подстройка: мушка чуть выше и лево — чтобы попасть под прицел.
const ADS_AK = {
    rear:  { y: -1.80, z: 1.10 },   // целик
    front: { y: -4.40, z: 1.12 },   // мушка (z=1.12 — чуть выше, под прицелом)
    dist:  0.85,     // камера далеко от калаша (не внутри!)
    fov:   55,       // FOV 55 — уже, автомат мельче
    worldFov: 0.82,  // множитель FOV основной камеры при прицеливании
    speed: 11,       // скорость входа/выхода из прицела
};

// ✅ ПРИЦЕЛИВАНИЕ БЕРДАНКИ (ПКМ). Координаты — в модели berdana.glb (дуло = +Z, верх = +Y):
//    целик — деталь aim_ (верх y≈0.0391 на z≈-0.0144), мушка — вершина ствола (y≈0.0390 на z≈0.050).
//    Берданка короче «в руке»: рукоять почти под целиком, поэтому глаз ближе, чем у АК (dist меньше),
//    иначе левая рука не достанет до ствола.
const ADS_BERDANA = {
    rear:  { y: 0.0399, z: -0.0144 },   // чуть выше целика (смотрим поверх него)
    front: { y: 0.0388, z: 0.0505 },    // мушка (чуть ниже вершины, как у АК — мушка над перекрестием)
    dist:  0.28,     // расстояние «глаз → целик», м (меньше = оружие ближе/крупнее; больше 0.30 — левая рука не достанет до ствола)
    fov:   60,       // FOV камеры рук при прицеливании
    worldFov: 0.82,  // множитель FOV основной камеры
    speed: 11,
};
// Камера рук (должна совпадать с renderOverlay)
const HANDS_CAM_POS    = new THREE.Vector3(0, 1.7, 0);
const HANDS_CAM_TARGET = new THREE.Vector3(0, 1.0, 5);

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

// ✅ Доп. параметры позы АК (по умолчанию 0 — ничего не меняют):
//    gw / gyaw / gpitch / groll — ЯВНАЯ ориентация автомата относительно камеры
//                                 (gw=0 → старая формула rphi/ryaw; gyaw: + вправо, gpitch: + дуло вверх, groll: + по часовой)
//    ppitch / pyaw / proll      — маленькие добавочные повороты (отдача, дрожь), градусы
//    ox / oy / oz               — маленькие смещения автомата в камере (метры): вправо / вверх / вперёд
//    ljx / ljy / ljz            — дрожь левой кисти (метры)
//    ads                        — 0..1 прицеливание (линия прицела → на ось камеры)
const AK_EXTRA = {
    gw: 0, gyaw: 0, gpitch: 0, groll: 0,
    ppitch: 0, pyaw: 0, proll: 0,
    ox: 0, oy: 0, oz: 0,
    ljx: 0, ljy: 0, ljz: 0,
    ads: 0,
};

// ✅ Поза idle с АК-47 — ПО РЕФЕРЕНСУ PUBG (аккуратно смотрел на твою фотку)
//    Правая рука — на пистолетной рукояти у приклада (низко, справа, у спуска)
//    Левая рука — на цевье (привязана к автомату, см. GRIP_AK_LEFT)
const FIDLE_AK = Object.assign({}, AK_EXTRA, {
    hy: 0, sx: 0, sy: 0, hx: 0,
    ltx: 0, ltk: 0, rtx: 0, rtk: 0,
    // Правая рука — на пистолете, низко, правее (как на референсе)
    rx: 0.230, ry: 0.290, rz: 0.500,
    rphi: 0.0, ryaw: 5, roll: 90,
    curl: 0.500, thumb: 0.280,           // правая сжимает рукоять
    // (lx/ly/lz/lpalm — старая поза левой руки, нужна только берданке)
    lx: 0.450, ly: 0.300, lz: 0.950,
    lcurl: 0.450,
    lpalm: 1,
});

// ✅ БЕГ с АК-47: автомат прижат к груди по диагонали — приклад у правого плеча,
//    дуло вверх и влево (раньше rphi=60 заваливал ствол ВНИЗ). Левая рука держит цевьё сама.
//    gpitch: подъём дула (°), gyaw: − влево (°), rx/ry/rz: где правая кисть относительно плеча.
const F_RUN_AK = Object.assign({}, FIDLE_AK, {
    rx: -0.12, ry: -0.04, rz: 0.38,
    gw: 1, gyaw: -22, gpitch: 38, groll: 0,
    curl: 0.85, thumb: 0.60,
    sx: 3, sy: -4,
});

// ✅ БЕРДАНКА: idle / бег. Ориентация ствола задана явно (gw=1), как у бега АК.
//    Выстрел = idle + мягкая отдача/дрожь (см. _gunPose / triggerShoot).
const FIDLE_BERDANA = Object.assign({}, FIDLE_AK, {
    rx: 0.10, ry: 0.16, rz: 0.42,                    // правая кисть (на рукояти) относительно плеча
    gw: 1, gyaw: -6, gpitch: 4, groll: 0,            // ствол чуть влево (к центру) и чуть вверх
    curl: 0.45, thumb: 0.30,
});
const F_RUN_BERDANA = Object.assign({}, FIDLE_BERDANA, {
    rx: -0.12, ry: -0.04, rz: 0.38,                  // прижата к груди
    gw: 1, gyaw: -22, gpitch: 38, groll: 0,          // дуло вверх и влево
    curl: 0.55, thumb: 0.40,
    sx: 3, sy: -4,
});

// ✅ ДРОБОВИК (shotgun.fbx) — ОДНА РУКА.
//    Геометрия модели (локальные координаты FBX, до Lcl-поворота): X = вдоль оружия (ДУЛО в −X ≈ −5.9, приклад в +X ≈ +7.1),
//    Z = ВВЕРХ (верх ствола ≈ +1.0, мушка ≈ 1.27, приклад загибается вниз до −2.9), Y = вбок. Длина 13.014 ед. = 0.85 м.
//    Все точки ниже (grip / ads) задаются именно в этих координатах {x, y, z}.
const SG_U = 0.85 / 13.014;        // метров на 1 ед. модели (длина 13.014 → 0.85 м)
const GRIP_SHOTGUN = {
    sS: 0.72,                      // размер в руке (меньше = дробовик целиком в кадре, больше = крупнее)
    sA: 0.50,                      // где на ладони «шейка» приклада (доля длины ладони от запястья)
    sP: 0.035,                     // зазор ладонь ↔ шейка приклада
    sR: 0,                         // поворот по Y в кисти (град)
    grip: { x: 3.2, y: 0, z: -0.85 },   // «шейка» приклада (за ствольной коробкой) — сюда ложится правая ладонь
};

// Левая рука НЕ держит цевьё (enabled:false) — дробовик в одной руке.
const GRIP_SHOTGUN_LEFT = {
    enabled:    false,
    zPref:      0, zRear: 0, yCenter: 0,
    fingerAng:  55, palmTilt: 0.25, palmThick: 0.20, palmFrac: 0.50,
    curl:       0.55, thumb: 0.22, twistShare: 0.5,
};

// Прицеливание: целик — верх ствольной коробки/гребень (x≈1.6, z≈1.33), мушка — бусинка на дуле (x≈−5.9, z≈1.25).
// dist — «глаз → целик», м. Больше = камера дальше от оружия (не заходит внутрь), но правая рука должна доставать.
const ADS_SHOTGUN = {
    rear:  { x: 1.6,  y: 0, z: 1.33 },
    front: { x: -5.9, y: 0, z: 1.25 },
    dist:  0.55,
    fov:   58,
    worldFov: 0.88,
    speed: 11,
};

// Поза idle: кисть в правом нижнем углу, дуло чуть влево (к центру) и вверх.
// Левая рука — «расслабленная» (lx/ly/lz): висит вниз, вне кадра.
const FIDLE_SHOTGUN = Object.assign({}, FIDLE_AK, {
    rx: 0.45, ry: -0.10, rz: 0.60,                   // ← положение: rx правее, ry ниже, rz дальше вперёд
    gw: 1, gyaw: -18, gpitch: 12, groll: 0,          // ← направление ствола: gyaw влево(−), gpitch вверх(+)
    curl: 0.45, thumb: 0.25,
    lx: -0.25, ly: -0.85, lz: 0.12, lcurl: 0.35, lpalm: 0,
});
// Бег с дробовиком — прижат к груди, дуло вверх-влево.
const F_RUN_SHOTGUN = Object.assign({}, FIDLE_SHOTGUN, {
    rx: -0.10, ry: -0.04, rz: 0.40,
    gw: 1, gyaw: -22, gpitch: 38, groll: 0,
    curl: 0.60, thumb: 0.45,
    sx: 3, sy: -4,
});

// ✅ Авто-подгонка кирки под топор. Модель кирки (stone_pickaxe.glb) может иметь любой pivot/ориентацию,
//    поэтому: находим длинную ось (рукоять), конец с головой (там шире), ось головы — и приводим к виду топора:
//    рукоять вдоль +Y, голова вверху, ось головы вдоль X, НИЖНИЙ КОНЕЦ РУКОЯТИ в (0,0,0) — как у axe_claude.glb
//    (там pivot = низ рукояти, рука берёт ручку на ~25% от низа). Длина = targetLen (как у топора).
function fitPickaxeLikeAxe(proto, targetLen) {
    proto.updateMatrixWorld(true);
    const inv = proto.matrixWorld.clone().invert();
    const P = [], v = new THREE.Vector3();
    proto.traverse((o) => {
        if (!(o.isMesh && o.geometry && o.geometry.attributes.position)) return;
        const a = o.geometry.attributes.position;
        const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(m); P.push(v.x, v.y, v.z); }
    });
    const n = P.length / 3;
    if (n < 4) return;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
        const c = P[i * 3 + k]; if (c < mn[k]) mn[k] = c; if (c > mx[k]) mx[k] = c;
    }
    const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    const L = size.indexOf(Math.max(size[0], size[1], size[2]));       // длинная ось = рукоять
    if (size[L] < 1e-6) return;
    const o1 = (L + 1) % 3, o2 = (L + 2) % 3;
    // боковой размах у двух концов рукояти (первые/последние 25%)
    const span = (lo, hi) => {
        const a = [Infinity, Infinity], b = [-Infinity, -Infinity];
        for (let i = 0; i < n; i++) {
            const f = (P[i * 3 + L] - mn[L]) / size[L];
            if (f < lo || f > hi) continue;
            const x1 = P[i * 3 + o1], x2 = P[i * 3 + o2];
            if (x1 < a[0]) a[0] = x1; if (x1 > b[0]) b[0] = x1;
            if (x2 < a[1]) a[1] = x2; if (x2 > b[1]) b[1] = x2;
        }
        return [b[0] - a[0], b[1] - a[1]];
    };
    const lowS = span(0, 0.25), highS = span(0.75, 1);
    const headHigh = Math.max(highS[0], highS[1]) >= Math.max(lowS[0], lowS[1]);   // голова на верхнем конце оси?
    const headS = headHigh ? highS : lowS;
    const latAxis = headS[0] >= headS[1] ? o1 : o2;                    // ось головы (самая широкая)
    const ex = new THREE.Vector3().setComponent(latAxis, 1);
    const ey = new THREE.Vector3().setComponent(L, headHigh ? 1 : -1);
    const ez = new THREE.Vector3().crossVectors(ex, ey);
    proto.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez).transpose());
    const sc = targetLen / size[L];
    proto.scale.setScalar(sc);
    // нижний конец рукояти (центр сечения) → в начало координат
    const endV = headHigh ? mn[L] : mx[L];
    const end = new THREE.Vector3(); let cnt = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) {
        const f = (P[i * 3 + L] - mn[L]) / size[L];
        if ((headHigh && f <= 0.08) || (!headHigh && f >= 0.92)) { s1 += P[i * 3 + o1]; s2 += P[i * 3 + o2]; cnt++; }
    }
    end.setComponent(L, endV); end.setComponent(o1, cnt ? s1 / cnt : 0); end.setComponent(o2, cnt ? s2 / cnt : 0);
    proto.position.copy(end.multiplyScalar(sc).applyQuaternion(proto.quaternion).negate());
    proto.updateMatrixWorld(true);
    console.log('[FP] Кирка: длинная ось=' + 'xyz'[L] + ', голова на ' + (headHigh ? '+' : '−') + ', ось головы=' + 'xyz'[latAxis] + ', размеры=' + size.map((q) => q.toFixed(3)).join('/'));
}

function lerpP(a, b, t) {
    const o = {};
    for (const k in a) o[k] = (typeof a[k] === 'number' && typeof b[k] === 'number') ? a[k] + (b[k] - a[k]) * t : a[k];
    return o;
}

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

        // ✅ АК: плавные состояния, отдача-пружина, дрожь, прицеливание
        this._aimHeld = false;      // ПКМ зажата
        this._ads = 0;              // 0..1 — насколько прицелились
        this._runW = 0;             // 0..1 — насколько в беговой позе
        this._rec = 0; this._recV = 0;   // пружина отдачи
        this._shake = 0;            // энергия дрожи рук/автомата
        this._recSide = 0;
        this._baseFov = null;
        this._initAimInput();

        this._load();
    }

    _load() {
        const loader = new GLTFLoader();
        const fbxLoader = new FBXLoader();   // ✅ для дробовика (FBX)
        const texLoader = new THREE.TextureLoader();
        Promise.all([
            new Promise((ok, no) => loader.load(PLAYER_MODEL_PATH,   ok, undefined, no)),
            new Promise((ok, no) => loader.load(AXE_MODEL_PATH,      ok, undefined, no)),
            new Promise((ok, no) => loader.load(PICKAXE_MODEL_PATH,  ok, undefined, no)),
            new Promise((ok, no) => loader.load(AK47_MODEL_PATH,     ok, undefined, no)),
            new Promise((ok, no) => loader.load(BERDANA_MODEL_PATH,  ok, undefined, no)),
            new Promise((ok, no) => fbxLoader.load(SHOTGUN_MODEL_PATH, ok, undefined, no)),
        ]).then(([pg, ag, pkg, kg, bg, sg]) => {
            const btex = {
                map: texLoader.load(BERDANA_TEX_BASECOLOR),
                normalMap: texLoader.load(BERDANA_TEX_NORMAL),
                roughnessMap: texLoader.load(BERDANA_TEX_ROUGHNESS),
                metalnessMap: texLoader.load(BERDANA_TEX_METALLIC),
            };
            for (const k in btex) { btex[k].anisotropy = 8; btex[k].colorSpace = THREE.SRGBColorSpace; }
            this._berdanaTex = btex;
            const sgtex = {
                map: texLoader.load(SHOTGUN_TEX_BASECOLOR),
                normalMap: texLoader.load(SHOTGUN_TEX_NORMAL),
                roughnessMap: texLoader.load(SHOTGUN_TEX_ROUGHNESS),
                metalnessMap: texLoader.load(SHOTGUN_TEX_METALLIC),
                aoMap: texLoader.load(SHOTGUN_TEX_AO),
            };
            for (const k in sgtex) { sgtex[k].anisotropy = 8; sgtex[k].colorSpace = THREE.SRGBColorSpace; }
            this._shotgunTex = sgtex;
            this._init(pg, ag, pkg, kg, bg, sg);
        }).catch(e => console.error('[FirstPersonPlayer] Ошибка загрузки:', e));
    }

    _init(pg, ag, pkg, kg, bg, sg) {
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
        // ✅ Уменьшаем топор — был слишком большой. Целевая длина 0.55м.
        const axeBox = new THREE.Box3().setFromObject(axeProto);
        const axeSize = axeBox.getSize(new THREE.Vector3());
        const axeLen = Math.max(axeSize.x, axeSize.y, axeSize.z);
        const AXE_TARGET_LEN = 0.55;
        if (axeLen > 0.001) {
            axeProto.scale.multiplyScalar(AXE_TARGET_LEN / axeLen);
            axeProto.updateMatrixWorld(true);
        }
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

        /* ✅ КИРКА — как топор: авто-подгонка (pivot модели не важен), см. fitPickaxeLikeAxe() */
        const pkProto = pkg.scene;
        fitPickaxeLikeAxe(pkProto, PICKAXE_TARGET_LEN);
        pkProto.position.y += PICKAXE_PIVOT_Y;
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
        // ✅ Берданка опущена ниже к руке (была высоко).
        //    Опускаем ещё ниже (с -0.1 до -0.3) + чуть вперёд, чтобы приклад был у плеча.
        this.berdanaHolder.position.set(0, -0.3, 0.05);
        this.berdanaHolder.rotation.set(0, 0, 0);

        /* ✅ ДРОБОВИК (FBX): масштаб так, чтобы длина = 0.85 м, БЕЗ центрирования (точки хвата заданы в координатах модели).
              Модель кладём в обёртку this.shotgun, повёрнутую так, что локальные оси обёртки = как у АК/берданки:
              дуло = +Z, верх = +Y (у модели дуло в −X, поворот Y=+90°). */
        const sgProto = sg;   // FBXLoader возвращает Group напрямую
        const sgBox = new THREE.Box3().setFromObject(sgProto);
        const sgSize = sgBox.getSize(new THREE.Vector3());
        const sgLen = Math.max(sgSize.x, sgSize.y, sgSize.z);
        if (sgLen > 0.001) {
            sgProto.scale.multiplyScalar(0.85 / sgLen);
            sgProto.updateMatrixWorld(true);
        }
        const shotgunMat = new THREE.MeshStandardMaterial({
            map: this._shotgunTex.map,
            normalMap: this._shotgunTex.normalMap,
            roughnessMap: this._shotgunTex.roughnessMap,
            metalnessMap: this._shotgunTex.metalnessMap,
            aoMap: this._shotgunTex.aoMap,
            roughness: 1.0, metalness: 1.0, side: THREE.DoubleSide,
        });
        const walkSG = (o) => {
            if (!o) return;
            if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = shotgunMat; }
            if (o.children) for (const c of o.children) walkSG(c);
        };
        walkSG(sgProto);
        const sgModel = sgProto.clone(true);
        sgModel.rotation.y = Math.PI / 2;               // дуло (−X модели) → +Z обёртки
        this.shotgunHolder = new THREE.Group();
        this.shotgun = new THREE.Group();               // обёртка: её локальные оси = дуло +Z, верх +Y
        this.shotgun.add(sgModel);
        this.shotgunHolder.add(this.shotgun);
        B.RightHand.add(this.shotgunHolder);
        this.shotgunHolder.visible = false;

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
            shotgun: !!this.shotgunHolder,
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

        // ✅ placeBerdana — рукоять (handle_) берданки кладём в центр правой ладони.
        //    Точка модели → вектор в базисе кисти: после поворота Ry(90°) локальные (x,y,z) → (z, y, -x) вдоль (f, a, c).
        this.placeBerdana = () => {
            const H = this.HF.Right, G = GRIP_BERDANA;
            const k = this.berdana.scale.x * G.sS;       // метров (в покое) на 1 ед. модели
            const gv = H.f.clone().multiplyScalar(G.grip.z * k)
                .addScaledVector(H.a, G.grip.y * k)
                .addScaledVector(H.c, -G.grip.x * k);
            const target = H.h0.clone()
                .addScaledVector(H.f, H.palmLen * G.sA)
                .addScaledVector(H.n, G.sP);
            this.berdanaHolder.position.copy(target.sub(gv).applyMatrix4(H.inv));
            const fl = H.f.clone().applyQuaternion(H.wq.clone().invert());
            const al = H.a.clone().applyQuaternion(H.wq.clone().invert());
            const cl = new THREE.Vector3().crossVectors(fl, al);
            const qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fl, al, cl));
            this.berdanaHolder.quaternion.copy(qb).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.sR * D));
            this.berdanaHolder.scale.setScalar(G.sS / H.ws);
            this.berdana.position.set(0, 0, 0);
            this.berdana.rotation.set(0, Math.PI / 2, 0);
        };

        // Точка модели дробовика {x,y,z} (координаты FBX) → локальные координаты обёртки this.shotgun (дуло +Z, верх +Y):
        // (x, y, z) → (−y, z, −x) · SG_U   (Lcl-поворот −90° по X и разворот Y +90°)
        this.sgLocal = (p) => new THREE.Vector3(-(p.y || 0), (p.z || 0), -(p.x || 0)).multiplyScalar(SG_U);

        // ✅ placeShotgun — «шейку» приклада кладём в центр правой ладони (как рукоять берданки)
        this.placeShotgun = () => {
            const H = this.HF.Right, G = GRIP_SHOTGUN;
            const g = this.sgLocal(G.grip);
            const gv = H.f.clone().multiplyScalar(g.z * G.sS)
                .addScaledVector(H.a, g.y * G.sS)
                .addScaledVector(H.c, -g.x * G.sS);
            const target = H.h0.clone()
                .addScaledVector(H.f, H.palmLen * G.sA)
                .addScaledVector(H.n, G.sP);
            this.shotgunHolder.position.copy(target.sub(gv).applyMatrix4(H.inv));
            const fl = H.f.clone().applyQuaternion(H.wq.clone().invert());
            const al = H.a.clone().applyQuaternion(H.wq.clone().invert());
            const cl = new THREE.Vector3().crossVectors(fl, al);
            const qb = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fl, al, cl));
            this.shotgunHolder.quaternion.copy(qb).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.sR * D));
            this.shotgunHolder.scale.setScalar(G.sS / H.ws);
            this.shotgun.position.set(0, 0, 0);
            this.shotgun.rotation.set(0, Math.PI / 2, 0);   // как АК/берданка: дуло +Z → вперёд по пальцам
        };

        // ✅ Рамка камеры рук (в мировых координатах handsScene): вперёд / вверх / вправо на экране
        {
            const cf = HANDS_CAM_TARGET.clone().sub(HANDS_CAM_POS).normalize();
            const cr = new THREE.Vector3().crossVectors(cf, new THREE.Vector3(0, 1, 0)).normalize();
            const cu = new THREE.Vector3().crossVectors(cr, cf).normalize();
            this.camFrame = { pos: HANDS_CAM_POS.clone(), f: cf, u: cu, r: cr };
        }
        // Явная ориентация ствола в камере: yaw (+вправо), pitch (+дуло вверх), roll (+по часовой), градусы
        this.gunFrame = (yaw, pitch, roll) => {
            const c = this.camFrame;
            const q = new THREE.Quaternion().setFromAxisAngle(c.u, -yaw * D)
                .multiply(new THREE.Quaternion().setFromAxisAngle(c.r, pitch * D));
            const f = c.f.clone().applyQuaternion(q), u = c.u.clone().applyQuaternion(q);
            u.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(f, roll * D));
            return { f, a: u };
        };
        // Маленький добавочный поворот вокруг осей камеры (отдача, дрожь)
        this.gunDelta = (yaw, pitch, roll) => {
            const c = this.camFrame;
            return new THREE.Quaternion().setFromAxisAngle(c.u, -yaw * D)
                .multiply(new THREE.Quaternion().setFromAxisAngle(c.r, pitch * D))
                .multiply(new THREE.Quaternion().setFromAxisAngle(c.f, roll * D));
        };

        // ✅ Профили оружия с «ручным» хватом (АК-47 и БЕРДАНКА) — всё, чем они отличаются.
        //    У обоих локальные оси объекта: дуло = +Z, верх = +Y (ptLocal переводит точку модели → локальные).
        this.profiles = {
            ak47: {
                name: 'АК-47',
                obj: () => this.ak,
                place: () => this.placeAK(),
                ptLocal: (p) => new THREE.Vector3(p.x || 0, p.z, -p.y),   // АК: Sketchfab-поворот в glb
                ads: ADS_AK,
                left: GRIP_AK_LEFT,
                leftRange: () => [GRIP_AK_LEFT.yPref, GRIP_AK_LEFT.yRear],
                leftGuard: (t) => new THREE.Vector3(0, GRIP_AK_LEFT.zCenter, -t),
                halfH: 0.40, halfW: 0.19,                                  // полувысота/полуширина цевья (ед. модели)
                poses: () => ({ idle: FIDLE_AK, run: F_RUN_AK }),
                assist: 0,
            },
            berdana: {
                name: 'Берданка',
                obj: () => this.berdana,
                place: () => this.placeBerdana(),
                ptLocal: (p) => new THREE.Vector3(p.x || 0, p.y, p.z),
                ads: ADS_BERDANA,
                left: GRIP_BERDANA_LEFT,
                leftRange: () => [GRIP_BERDANA_LEFT.zPref, GRIP_BERDANA_LEFT.zRear],
                leftGuard: (t) => new THREE.Vector3(0, GRIP_BERDANA_LEFT.yCenter, t),
                halfH: 0.0022, halfW: 0.0025,                              // ствол ⌀≈0.0043
                poses: () => ({ idle: FIDLE_BERDANA, run: F_RUN_BERDANA }),
                assist: 0.12,   // м: на сколько можно подтянуть оружие к телу, если левая рука не достаёт
            },
            // ✅ Дробовик: одна рука (left.enabled=false → левая опущена), прицел и отдача как у остальных
            shotgun: {
                name: 'Дробовик',
                obj: () => this.shotgun,
                place: () => this.placeShotgun(),
                ptLocal: (p) => this.sgLocal(p),
                ads: ADS_SHOTGUN,
                left: GRIP_SHOTGUN_LEFT,
                leftRange: () => [GRIP_SHOTGUN_LEFT.zPref, GRIP_SHOTGUN_LEFT.zRear],
                leftGuard: (t) => new THREE.Vector3(0, GRIP_SHOTGUN_LEFT.yCenter, t),
                halfH: 0.015, halfW: 0.018,
                poses: () => ({ idle: FIDLE_SHOTGUN, run: F_RUN_SHOTGUN }),
                assist: 0,
            },
        };

        // Цель для левой руки: куда поставить запястье и как повернуть кисть, чтобы обхватить цевьё/ствол снизу.
        // Считается от РЕАЛЬНОГО положения оружия в мире. shortfall > 0 — на сколько метров рука не достаёт.
        this.leftGunTarget = (prof, LL, SL) => {
            const B = this.bones, G = prof.left;
            const obj = prof.obj(), objW = obj.matrixWorld;
            const fwd   = new THREE.Vector3(0, 0, 1).transformDirection(objW);    // куда смотрит дуло
            const up    = new THREE.Vector3(0, 1, 0).transformDirection(objW);    // верх оружия
            const right = new THREE.Vector3().crossVectors(fwd, up).normalize();  // правый бок оружия
            const unit  = new THREE.Vector3().setFromMatrixScale(objW).x;         // метров на 1 ед. модели
            const palmLenW = wp(B.LeftHand).distanceTo(wp(B.LeftHandMiddle1));

            // Ладонь смотрит ВВЕРХ и чуть вправо (к оружию), пальцы — вперёд-вправо вокруг ствола
            const pd = up.clone().addScaledVector(right, G.palmTilt).normalize();
            const fa = G.fingerAng * D;
            const f2 = fwd.clone().multiplyScalar(Math.cos(fa)).addScaledVector(right, Math.sin(fa));
            f2.addScaledVector(pd, -f2.dot(pd)).normalize();
            // c2 — «нормаль» кисти в базисе orientHand; знак учитывает, в какую сторону у модели гнутся пальцы
            const c2 = pd.clone().multiplyScalar(-this.SG.Left.curl);
            const a2 = new THREE.Vector3().crossVectors(c2, f2).normalize();

            // Расстояние от центра ладони до оси цевья/ствола
            const halfExt = (Math.abs(pd.dot(up)) * prof.halfH + Math.abs(pd.dot(right)) * prof.halfW) * unit;
            const dist = halfExt + G.palmThick * palmLenW;

            // Ищем самую передовую точку, до которой рука достаёт
            const reachMax = LL * 0.985;
            const [t0, t1] = prof.leftRange();
            let W = null, bestW = null, bestD = Infinity;
            const N = 12;
            for (let i = 0; i < N; i++) {
                const t = t0 + (t1 - t0) * (i / (N - 1));
                const gc = obj.localToWorld(prof.leftGuard(t));
                const w = gc.addScaledVector(pd, -dist).addScaledVector(f2, -G.palmFrac * palmLenW);
                const d = w.distanceTo(SL);
                if (d < bestD) { bestD = d; bestW = w; }
                if (d <= reachMax) { W = w; break; }
            }
            return { W: W || bestW, f2, a2, shortfall: W ? 0 : (bestD - reachMax) };
        };

        // Левая рука на оружии (АК-47 / берданка)
        this.poseLeftHandGun = (prof, LL, SL, pole, jit) => {
            const B = this.bones, G = prof.left, H = this.HF.Left;
            const T = this.leftGunTarget(prof, LL, SL);
            const W = T.W, f2 = T.f2, a2 = T.a2;
            if (T.shortfall > 0 && !prof._warned) {
                prof._warned = true;
                console.warn('[FP] ' + prof.name + ': левая рука не достаёт до ствола на ' + (T.shortfall * 100).toFixed(1) +
                    ' см (ближайшая точка). Подвинь оружие ближе к телу (rx/rz в позе) или уменьши zRear/yRear хвата.');
            }
            if (jit) W.add(jit);   // дрожь левой кисти при стрельбе
            this.ik(B.LeftArm, B.LeftForeArm, B.LeftHand, W, pole);

            // Часть разворота ладони отдаём предплечью, чтобы запястье не «закручивалось»
            const e = wp(B.LeftHand).sub(wp(B.LeftForeArm)).normalize();
            const R = B.LeftHand.getWorldQuaternion(new THREE.Quaternion()).multiply(H.wq.clone().invert());
            const aCur = H.a.clone().applyQuaternion(R);
            aCur.addScaledVector(e, -aCur.dot(e));
            const aTgt = a2.clone().addScaledVector(e, -a2.dot(e));
            if (aCur.lengthSq() > 1e-6 && aTgt.lengthSq() > 1e-6) {
                aCur.normalize(); aTgt.normalize();
                const ang = Math.atan2(e.dot(new THREE.Vector3().crossVectors(aCur, aTgt)), aCur.dot(aTgt));
                this.rotW(B.LeftForeArm, e, ang * G.twistShare);
            }
            this.orientHand('Left', f2, a2);
            this.fingers('Left', G.curl, G.thumb);
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
            const LL = this.reach('Left'),  SL = wp(B.LeftArm);
            const rightPole = Ut.clone().multiplyScalar(-1).addScaledVector(Rt, 0.5).addScaledVector(Ft, -0.3);
            const leftPole  = Ut.clone().multiplyScalar(-1).addScaledVector(Rt, -0.5).addScaledVector(Ft, -0.3);
            const cam = this.camFrame;
            // маленькие смещения оружия (отдача/дрожь) в осях камеры, метры
            const off = new THREE.Vector3()
                .addScaledVector(cam.r, p.ox || 0).addScaledVector(cam.u, p.oy || 0).addScaledVector(cam.f, p.oz || 0);

            // ✅ Оружие с «ручным» хватом (АК-47 / берданка): профиль + прицеливание
            const prof = this.profiles[this.currentWeapon] || null;
            const adsK = prof ? (p.ads || 0) : 0;

            // Правая рука + оружие. extra — доп. смещение кисти (подтягивание оружия к телу, если левая не достаёт)
            const solveRight = (extra) => {
                const offT = off.clone().add(extra);
                this.ik(B.RightArm, B.RightForeArm, B.RightHand,
                    tgt(SR, LR, p.rx, p.ry, p.rz).add(offT),
                    rightPole);
                const ph = p.rphi * D;
                let a2 = Ut.clone().multiplyScalar(Math.cos(ph)).addScaledVector(Ft, Math.sin(ph)).applyAxisAngle(Ut, p.ryaw * D).normalize();
                const fd = wp(B.RightHand).clone().sub(wp(B.RightForeArm)).normalize();
                const pr = fd.clone().addScaledVector(a2, -fd.dot(a2));
                const ln = pr.length(); pr.normalize();
                const gg = new THREE.Vector3().crossVectors(a2, Rt).normalize();
                if (gg.dot(pr) < 0) gg.negate();
                const w = Math.min(1, Math.max(0, (ln - 0.35) / 0.35));
                const f2 = pr.multiplyScalar(w).addScaledVector(gg, 1 - w).normalize();

                // Ориентация оружия: обычная формула → явная рамка (gw) → (ПКМ) линия прицела на ось камеры → дрожь
                let fF = f2.clone(), aF = a2.clone();
                if ((p.gw || 0) > 0.001) {
                    const ge = this.gunFrame(p.gyaw, p.gpitch, p.groll);
                    fF.lerp(ge.f, p.gw).normalize();
                    aF.lerp(ge.a, p.gw); aF.addScaledVector(fF, -aF.dot(fF)).normalize();
                }
                const ADS = prof ? prof.ads : null;
                const anchor = () => prof.obj().localToWorld(prof.ptLocal(ADS.rear));   // целик в мире
                let Pn = null;
                if (adsK > 0.001) {
                    // где целик был бы БЕЗ прицеливания (чтобы плавно перейти)
                    this.orientHand('Right', fF, aF);
                    this.model.updateMatrixWorld(true);
                    prof.place();
                    this.model.updateMatrixWorld(true);
                    Pn = anchor();
                    // ориентация, при которой линия целик→мушка параллельна оси камеры
                    const rearL = prof.ptLocal(ADS.rear), frontL = prof.ptLocal(ADS.front);
                    const gam = Math.atan2(frontL.y - rearL.y, frontL.z - rearL.z);
                    const fA = cam.f.clone().multiplyScalar(Math.cos(gam)).addScaledVector(cam.u, -Math.sin(gam)).normalize();
                    const aA = cam.u.clone().multiplyScalar(Math.cos(gam)).addScaledVector(cam.f, Math.sin(gam)).normalize();
                    fF.lerp(fA, adsK).normalize();
                    aF.lerp(aA, adsK); aF.addScaledVector(fF, -aF.dot(fF)).normalize();
                }
                if (p.ppitch || p.pyaw || p.proll) {
                    const qd = this.gunDelta(p.pyaw || 0, p.ppitch || 0, p.proll || 0);
                    fF.applyQuaternion(qd); aF.applyQuaternion(qd);
                }
                this.orientHand('Right', fF, aF);
                if (adsK > 0.001) {
                    // двигаем кисть так, чтобы целик лёг на ось камеры (в пределах досягаемости руки)
                    this.model.updateMatrixWorld(true);
                    prof.place();
                    this.model.updateMatrixWorld(true);
                    const Pa = cam.pos.clone().addScaledVector(cam.f, ADS.dist).add(off);
                    const Pt = Pn.clone().lerp(Pa, adsK);
                    const Wr = wp(B.RightHand).add(Pt.sub(anchor()));
                    this.ik(B.RightArm, B.RightForeArm, B.RightHand, Wr, rightPole);
                    this.orientHand('Right', fF, aF);
                }
                this.fingers('Right', p.curl, p.thumb);
            };
            solveRight(new THREE.Vector3());

            // ✅ АК-47 / берданка: сначала ставим оружие (оно на правой руке), потом ведём левую руку к цевью/стволу
            if (prof && prof.left.enabled) {
                this.model.updateMatrixWorld(true);
                prof.place();
                this.model.updateMatrixWorld(true);
                // Если левая рука не достаёт — чуть подтягиваем оружие к левому плечу (в прицеле не трогаем)
                if (prof.assist && adsK < 0.5) {
                    const T0 = this.leftGunTarget(prof, LL, SL);
                    if (T0.shortfall > 0.004) {
                        const kk = Math.min(T0.shortfall * 1.05, prof.assist) * (1 - adsK * 2);
                        solveRight(SL.clone().sub(T0.W).normalize().multiplyScalar(kk));
                        this.model.updateMatrixWorld(true);
                        prof.place();
                        this.model.updateMatrixWorld(true);
                    }
                }
                const jit = new THREE.Vector3()
                    .addScaledVector(Rt, p.ljx || 0).addScaledVector(Ut, p.ljy || 0).addScaledVector(Ft, p.ljz || 0);
                this.poseLeftHandGun(prof, LL, SL, leftPole, jit);
                this.model.updateMatrixWorld(true);
                return;
            }

            this.ik(B.LeftArm, B.LeftForeArm, B.LeftHand,
                tgt(SL, LL, p.lx, p.ly, p.lz),
                leftPole);
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
            } else if (this.currentWeapon === 'shotgun') {
                this.placeShotgun();
            }
        };
    }

    setWeapon(type) {
        this.currentWeapon = type;
        const showArms = (type === 'axe' || type === 'pickaxe' || type === 'ak47' || type === 'berdana' || type === 'shotgun');
        this._applyVisibility(showArms);
        if (this.axeHolder)      this.axeHolder.visible      = showArms && (type === 'axe');
        if (this.pickaxeHolder)  this.pickaxeHolder.visible  = showArms && (type === 'pickaxe');
        if (this.akHolder)       this.akHolder.visible       = showArms && (type === 'ak47');
        if (this.berdanaHolder)  this.berdanaHolder.visible  = showArms && (type === 'berdana');
        if (this.shotgunHolder)  this.shotgunHolder.visible  = showArms && (type === 'shotgun');
        this._pendingWeapon = type;
        this._swingType = null;
        this._shootKick = 0;
        this._resetAim();
    }

    // ===== ✅ ПРИЦЕЛИВАНИЕ (ПКМ) — АК-47 и берданка =====
    //    БАГ FIX: раньше onCanvas проверял e.target.tagName === 'CANVAS',
    //    но при Pointer Lock события идут на document.body, не на canvas.
    //    Теперь проверяем pointer lock (или что игра активна).
    _initAimInput() {
        this._onMouseDown = (e) => {
            if (e.button === 2 && this._prof()) {
                this._aimHeld = true;
            }
        };
        this._onMouseUp = (e) => {
            if (e.button === 2) this._aimHeld = false;
        };
        // ✅ Всегда блокируем контекстное меню (чтобы ПКМ не открывал меню браузера)
        this._onCtx = (e) => { e.preventDefault(); };
        this._onBlur = () => { this._aimHeld = false; };
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
        window.addEventListener('contextmenu', this._onCtx);
        window.addEventListener('blur', this._onBlur);
    }

    /** Профиль текущего оружия с «ручным» хватом (АК-47 / берданка) или null */
    _prof() { return (this.profiles && this.profiles[this.currentWeapon]) || null; }

    _resetAim() {
        this._aimHeld = false;
        this._ads = 0;
        this._applyWorldFov(0);
    }

    /** Программное прицеливание (если хочешь управлять не из этого файла) */
    setAiming(on) { this._aimHeld = !!on; }
    /** 0..1 — насколько игрок прицелился (для HUD: спрятать точку-прицел, приглушить покачивание камеры и т.п.) */
    get adsAmount() { return this._ads; }

    _applyWorldFov(k) {
        if (!this.camera) return;
        const prof = this._prof();
        const wf = prof ? prof.ads.worldFov : 1;
        if (k > 0.001 && wf !== 1) {
            if (this._baseFov == null) this._baseFov = this.camera.fov;
            this.camera.fov = this._baseFov * (1 + (wf - 1) * k);
            this.camera.updateProjectionMatrix();
        } else if (k <= 0.001 && this._baseFov != null) {
            this.camera.fov = this._baseFov;
            this._baseFov = null;
            this.camera.updateProjectionMatrix();
        }
    }

    // ===== ✅ ПОЗА ОРУЖИЯ (АК-47 / берданка): idle ↔ бег ↔ прицел + мягкая отдача и дрожь =====
    _gunPose(dt, prof) {
        const A = prof.ads, t = this._clock;
        const sm1 = (cur, tgt, rate) => {
            const n = cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
            return Math.abs(n - tgt) < 0.002 ? tgt : n;
        };
        const wantAds = this._aimHeld && !this.isRunning;
        this._ads  = sm1(this._ads,  wantAds ? 1 : 0, A.speed);
        this._runW = sm1(this._runW, this.isRunning ? 1 : 0, 9);

        // Пружина отдачи (лёгкий «пинок» назад и мягкий возврат с чуть заметным отскоком)
        const h = Math.min(dt, 1 / 30) / 2;
        for (let i = 0; i < 2; i++) {
            this._recV += (-420 * this._rec - 26 * this._recV) * h;
            this._rec  += this._recV * h;
        }
        this._rec = Math.max(-0.4, Math.min(1.8, this._rec));
        this._shake *= Math.exp(-dt * 7);

        const poses = prof.poses();
        const idle = Object.assign({}, poses.idle);
        idle.sx += Math.sin(t * 1.8) * 0.8;
        idle.sy += Math.sin(t * 1.5) * 0.5;
        const run = Object.assign({}, poses.run);
        run.sx += Math.sin(t * 8) * 1.2;
        run.gpitch += Math.sin(t * 8) * 1.2;          // лёгкое покачивание при беге
        run.gyaw   += Math.cos(t * 4) * 1.0;
        const p = lerpP(idle, run, this._runW);

        const ads = this._ads;
        p.ads = ads;
        p.sx *= (1 - 0.8 * ads); p.sy *= (1 - 0.8 * ads);

        // Дрожь: сумма двух синусов на разных частотах
        const tr = (f1, f2, ph) => Math.sin(t * f1 + ph) + 0.6 * Math.sin(t * f2 + ph * 1.7);
        const rec = this._rec, sh = this._shake, damp = 1 - 0.5 * ads;
        // ✅ Вертикальная отдача по паттерну (recVert: 0.5-1.0)
        const recVert = this._recVert || 1.0;
        p.oz = (-0.018 * rec + 0.0025 * sh * tr(23, 37, 2.1)) * damp;
        p.oy = ( 0.004 * rec + 0.0022 * sh * tr(29, 41, 0.8)) * damp + Math.sin(t * 1.6) * 0.0012 * ads;
        p.ox = ( 0.0022 * sh * tr(31, 43, 1.7)) * damp;
        // ✅ ЗИГЗАГ: вертикаль × recVert, боковой × recSide (по паттерну)
        p.ppitch = (0.55 * recVert * rec + 0.35 * sh * tr(27, 39, 0.3)) * damp;        // + = дуло вверх
        p.pyaw   = (0.45 * Math.abs(this._recSide || 0) * rec * Math.sign(this._recSide || 1)
                    + 0.30 * sh * tr(25, 35, 1.1)) * damp;                             // боковой увод
        p.proll  = (0.40 * sh * tr(21, 33, 2.6) + 0.15 * (this._recSide || 0) * rec) * damp;
        p.ljx = 0.0035 * sh * tr(33, 47, 0.9);
        p.ljy = 0.0030 * sh * tr(26, 45, 2.2);
        p.ljz = 0.0020 * sh * tr(30, 40, 1.4);
        return p;
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
        const showArms = v && (this.currentWeapon === 'axe' || this.currentWeapon === 'pickaxe' || this.currentWeapon === 'ak47' || this.currentWeapon === 'berdana' || this.currentWeapon === 'shotgun');
        this._applyVisibility(showArms);
        if (this.axeHolder)      this.axeHolder.visible      = showArms && (this.currentWeapon === 'axe');
        if (this.pickaxeHolder)  this.pickaxeHolder.visible  = showArms && (this.currentWeapon === 'pickaxe');
        if (this.akHolder)       this.akHolder.visible       = showArms && (this.currentWeapon === 'ak47');
        if (this.berdanaHolder)  this.berdanaHolder.visible  = showArms && (this.currentWeapon === 'berdana');
        if (this.shotgunHolder)  this.shotgunHolder.visible  = showArms && (this.currentWeapon === 'shotgun');
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
        if (this.currentWeapon !== 'ak47' && this.currentWeapon !== 'berdana' && this.currentWeapon !== 'shotgun') return;
        this._shootKick = this._shootKickDur;
        if (this.currentWeapon === 'ak47') {
            // ЗИГЗАГ-отдача по паттерну (вверх-вправо-вверх-влево...)
            this._shotCount = (this._shotCount || 0) + 1;
            const pattern = [
                { x:  0.0, y: 1.0 }, { x:  0.8, y: 0.7 }, { x:  0.3, y: 1.0 }, { x: -0.9, y: 0.6 },
                { x: -0.4, y: 1.0 }, { x:  1.0, y: 0.5 }, { x:  0.5, y: 0.9 }, { x: -0.7, y: 0.8 },
            ];
            const p = pattern[(this._shotCount - 1) % pattern.length];
            this._recV += 22;                                   // мягкий «пинок»
            this._shake = Math.min(this._shake + 0.18, 1.0);    // лёгкая дрожь
            this._recSide = p.x;
            this._recVert = p.y;
        } else if (this.currentWeapon === 'shotgun') {
            // ДРОБОВИК: мощный пинок и тряска, сильный случайный увод вбок
            this._recV += 95;
            this._shake = Math.min(this._shake + 1.4, 1.8);
            this._recSide = (Math.random() - 0.5) * 1.6;
            this._recVert = 1.5;
        } else {
            // БЕРДАНКА: слабая отдача (слабее АК)
            this._recV += 15;
            this._shake = Math.min(this._shake + 0.12, 1.0);
            this._recSide = (Math.random() - 0.5) * 0.3;
            this._recVert = 0.6;
        }
    }
    setRunning(running) {
        this.isRunning = !!running;
    }

    update(dt, opts = {}) {
        if (!this.loaded) return;
        this._clock += dt;

        let p;
        const prof = this._prof();
        if (prof) {
            // ✅ АК-47 и берданка: idle / бег / прицел + отдача и дрожь
            p = this._gunPose(dt, prof);
            this._applyWorldFov(this._ads);
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
        const _pr = this._prof();
        this.handsCamera.fov = 74 + ((_pr ? _pr.ads.fov : 74) - 74) * this._ads;
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
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
        window.removeEventListener('contextmenu', this._onCtx);
        window.removeEventListener('blur', this._onBlur);
        this._applyWorldFov(0);
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