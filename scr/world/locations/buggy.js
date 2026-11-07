// scr/world/locations/buggy.js — ФИНАЛЬНАЯ ВЕРСИЯ: Пикап + Звуки + Фикс решётки + Исправление ландшафта и коллизий
import * as THREE from 'three';
import { kit } from './vehicles.js';
const { rbox, at, bx, cyl, mk, glassMat, makeRig, wheel, mud, strut, H, TAU, rng } = kit;

export function createRustBuggy(opts = {}) {
  const seed = opts.seed ?? (Math.random() * 1e9 | 0);
  const R = rng(seed);
  const rn = (a, b) => a + R() * (b - a);
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);
  const bodyTilt = new THREE.Group();
  chassis.add(bodyTilt);
  const rig = makeRig();

  // ---------- материалы ----------
  const rustA = mk(0x6e3a26, 0.85, 0.25);
  const rustB = mk(0x8a4a2a, 0.85, 0.25);
  const rustC = mk(0x4a2f1c, 0.9, 0.2);
  const patchWhite = mk(0xb8b2a2, 0.8, 0.15);
  const patchOlive = mk(0x5a5a46, 0.85, 0.2);
  const steelD = mk(0x2a2622, 0.75, 0.4);
  const steel = mk(0x7a7e82, 0.45, 0.65);
  const corr = mk(0x8a8d90, 0.6, 0.5);
  const wood = mk(0x7a5a38, 0.9, 0.02);
  const woodD = mk(0x5e4a36, 0.9, 0.02);
  const canvasM = mk(0x7d8262, 0.95, 0.0);
  const canvasD = mk(0x6a6f52, 0.95, 0.0);
  const ropeM = mk(0xc9b888, 0.9, 0.0);
  const dark = mk(0x17181a, 0.7, 0.45, false);
  const glass = glassMat();
  const cushion = mk(0x3a342c, 0.95, 0, false);
  const redBarrel = mk(0x8a2f1f, 0.7, 0.35);
  const lampM = new THREE.MeshStandardMaterial({ color: 0xe9e2c0, emissive: 0xffe9a8, emissiveIntensity: 0.15, roughness: 0.2 });
  const tailM = new THREE.MeshStandardMaterial({ color: 0x8a1410, emissive: 0x500806, emissiveIntensity: 0.35 });

  if (opts.pad !== false) {
    const p = mud(rn, 4.6, 0x4a3b2a, 0.55);
    p.position.y = 0.003;
    group.add(p);
  }

  // ---------- рама ----------
  for (const s of [-1, 1]) at(chassis, rbox(0.12, 0.18, 4.7, 0.02, steelD), s * 0.75, 0.55, 0.05);
  for (const z of [2.2, 1.0, -0.2, -1.4, -2.4]) at(chassis, rbox(1.6, 0.1, 0.1, 0.02, steelD), 0, 0.55, z);
  at(chassis, cyl(0.06, 0.06, 1.5, steelD, 10), 0, 0.5, 1.75).rotation.z = H;
  at(chassis, cyl(0.07, 0.07, 1.5, steelD, 10), 0, 0.5, -1.75).rotation.z = H;

  // ---------- колёса ----------
  const WR = 0.48, WW = 0.3;
  function mountWheel(x, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WR, z);
    chassis.add(pivot);
    const w = wheel(WR, WW, false);
    if (x < 0) w.rotation.y = Math.PI;
    pivot.add(w);
    return { pivot, w };
  }
  const wFL = mountWheel(-0.95, 1.75);
  const wFR = mountWheel(0.95, 1.75);
  const wRL = mountWheel(-0.95, -1.75);
  const wRR = mountWheel(0.95, -1.75);

  // ============================================================
  //  ПЕРЕД: кенгурятник, бампер, решётка, фары
  // ============================================================
  for (const s of [-1, 1]) at(bodyTilt, cyl(0.035, 0.035, 1.05, rustA, 10), s * 0.52, 0.85, 2.72);
  for (const y of [0.42, 0.72, 1.02, 1.3]) at(bodyTilt, cyl(0.028, 0.028, 1.1, rustA, 8), 0, y, 2.72).rotation.z = H;
  for (let i = -2; i <= 2; i++) at(bodyTilt, rbox(0.045, 0.85, 0.025, 0.008, rustB), i * 0.16, 0.85, 2.7);
  at(bodyTilt, rbox(2.05, 0.3, 0.12, 0.03, rustB), 0, 0.4, 2.6);
  for (const s of [-1, 1]) at(bodyTilt, new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 14), rustC), s * 0.6, 0.4, 2.68);
  
  at(bodyTilt, rbox(1.25, 0.55, 0.1, 0.02, dark), 0, 1.0, 2.42);
  for (let i = 0; i < 4; i++) at(bodyTilt, rbox(1.15, 0.05, 0.04, 0.01, steel), 0, 0.82 + i * 0.12, 2.46);
  for (const s of [-1, 1]) {
    at(bodyTilt, cyl(0.11, 0.11, 0.08, lampM, 14), s * 0.78, 1.0, 2.44).rotation.x = H;
    at(bodyTilt, new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.015, 6, 16), rustA), s * 0.78, 1.0, 2.47);
  }

  // капот + крылья
  at(bodyTilt, rbox(1.45, 0.1, 1.35, 0.03, patchWhite), 0, 1.12, 1.8);
  at(bodyTilt, rbox(0.5, 0.03, 0.45, 0.01, rustB), 0.32, 1.18, 1.55);
  at(bodyTilt, rbox(0.4, 0.03, 0.5, 0.01, rustA), -0.35, 1.18, 2.0);
  for (const s of [-1, 1]) at(bodyTilt, rbox(0.06, 0.5, 1.35, 0.02, s < 0 ? rustA : patchOlive), s * 0.72, 0.88, 1.8);
  at(bodyTilt, rbox(1.45, 0.06, 0.08, 0.02, steelD), 0, 1.14, 2.42);
  for (const s of [-1, 1]) {
    const f = at(bodyTilt, rbox(0.5, 0.05, 1.05, 0.02, rustB), s * 0.98, 1.16, 1.78);
    f.rotation.z = -s * 0.4;
    at(bodyTilt, rbox(0.05, 0.4, 0.95, 0.02, rustA), s * 1.08, 0.92, 1.78);
  }

  // лобовое стекло
  for (const s of [-1, 1]) strut(bodyTilt, [s * 0.78, 1.25, 1.12], [s * 0.72, 1.86, 0.92], 0.045, steelD);
  at(bodyTilt, rbox(1.55, 0.07, 0.07, 0.02, steelD), 0, 1.88, 0.9);
  at(bodyTilt, bx(1.42, 0.62, 0.02, glass), 0, 1.56, 1.02).rotation.x = -0.32;

  // ============================================================
  //  КАБИНА
  // ============================================================
  at(bodyTilt, rbox(1.62, 0.08, 1.45, 0.02, steelD), 0, 0.78, 0.45);
  for (const s of [-1, 1]) {
    at(bodyTilt, rbox(0.05, 0.52, 1.3, 0.02, s < 0 ? patchOlive : rustA), s * 0.85, 1.06, 0.45);
    at(bodyTilt, rbox(0.045, 0.06, 1.3, 0.02, steelD), s * 0.85, 1.62, 0.45);
    at(bodyTilt, rbox(0.04, 0.5, 0.05, 0.01, steelD), s * 0.85, 1.35, 1.06);
    at(bodyTilt, rbox(0.04, 0.5, 0.05, 0.01, steelD), s * 0.85, 1.35, -0.16);
    at(bodyTilt, rbox(0.05, 0.06, 0.2, 0.01, steel), s * 0.88, 1.2, 0.15);
    strut(bodyTilt, [s * 0.8, 0.82, 1.1], [s * 0.8, 1.92, 1.05], 0.04, steelD);
    strut(bodyTilt, [s * 0.8, 0.82, -0.15], [s * 0.8, 1.92, -0.15], 0.04, steelD);
  }
  at(bodyTilt, rbox(1.6, 0.8, 0.06, 0.02, rustB), 0, 1.2, -0.2);
  at(bodyTilt, bx(1.1, 0.32, 0.02, glass), 0, 1.5, -0.22);
  at(bodyTilt, rbox(1.72, 0.07, 1.55, 0.03, rustB), 0, 1.96, 0.45);
  at(bodyTilt, rbox(0.6, 0.02, 0.5, 0.01, patchWhite), -0.3, 2.0, 0.3);

  // приборка + руль
  at(bodyTilt, rbox(1.5, 0.28, 0.14, 0.02, dark), 0, 1.32, 1.1);
  const steerCol = new THREE.Group();
  steerCol.position.set(-0.45, 1.22, 0.95);
  steerCol.rotation.x = -0.5;
  bodyTilt.add(steerCol);
  const wheelGroup = new THREE.Group();
  steerCol.add(wheelGroup);
  wheelGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 10, 28), dark));
  at(wheelGroup, rbox(0.38, 0.03, 0.02, 0.008, dark), 0, 0, 0);
  at(wheelGroup, rbox(0.03, 0.19, 0.02, 0.008, dark), 0, -0.095, 0);
  at(wheelGroup, cyl(0.045, 0.05, 0.05, steel, 12), 0, 0, -0.02).rotation.x = H;

  // сиденья
  function bucketSeat(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0.82, z);
    bodyTilt.add(g);
    at(g, rbox(0.48, 0.14, 0.48, 0.03, cushion), 0, 0.14, 0);
    const b = at(g, rbox(0.48, 0.6, 0.12, 0.03, cushion), 0, 0.46, -0.24);
    b.rotation.x = -0.12;
    at(g, rbox(0.1, 0.5, 0.1, 0.02, steelD), 0, 0.2, -0.3);
    return g;
  }
  bucketSeat(-0.45, 0.55);
  bucketSeat(0.45, 0.55);

  // ============================================================
  //  РЕШЁТКА ЗА КАБИНОЙ (HEADACHE RACK) - ПРИКРУЧЕНА НАМЕРТВО
  // ============================================================
  const rackGroup = new THREE.Group();
  bodyTilt.add(rackGroup); // Добавляем в bodyTilt, чтобы летала вместе с кузовом
  
  for (const s of [-1, 1]) at(rackGroup, cyl(0.04, 0.04, 1.25, rustA, 10), s * 0.85, 1.55, -0.45);
  at(rackGroup, cyl(0.04, 0.04, 1.74, rustA, 10), 0, 2.15, -0.45).rotation.z = H;
  for (let i = 0; i < 4; i++) at(rackGroup, rbox(1.7, 0.1, 0.045, 0.01, woodD), 0, 1.15 + i * 0.28, -0.45);

  // ============================================================
  //  КУЗОВ
  // ============================================================
  at(bodyTilt, rbox(1.92, 0.08, 2.15, 0.02, steelD), 0, 0.95, -1.55);
  at(bodyTilt, rbox(1.9, 0.62, 0.06, 0.02, wood), 0, 1.26, -0.52);
  for (const s of [-1, 1]) {
    at(bodyTilt, rbox(0.04, 0.55, 0.85, 0.01, corr), s * 0.95, 1.26, -1.35);
    for (let i = 0; i < 5; i++) at(bodyTilt, rbox(0.02, 0.5, 0.05, 0.005, steel), s * 0.98, 1.26, -1.65 + i * 0.16);
    at(bodyTilt, rbox(0.05, 0.55, 0.65, 0.01, wood), s * 0.95, 1.26, -2.1);
    at(bodyTilt, rbox(0.05, 0.55, 0.45, 0.01, s < 0 ? woodD : patchWhite), s * 0.95, 1.26, -0.78);
    at(bodyTilt, rbox(0.09, 0.09, 2.15, 0.02, wood), s * 0.96, 1.56, -1.55);
    for (const z of [-0.6, -1.55, -2.5]) at(bodyTilt, rbox(0.07, 0.7, 0.07, 0.01, woodD), s * 0.96, 1.25, z);
    at(bodyTilt, rbox(0.42, 0.4, 0.03, 0.01, dark), s * 0.95, 0.75, -2.2);
  }
  at(bodyTilt, rbox(1.92, 0.64, 0.07, 0.02, woodD), 0, 1.26, -2.64);
  for (const x of [-0.6, 0, 0.6]) at(bodyTilt, rbox(0.08, 0.6, 0.05, 0.01, wood), x, 1.26, -2.68);
  at(bodyTilt, rbox(2.0, 0.16, 0.08, 0.02, steelD), 0, 0.62, -2.66);
  for (const s of [-1, 1]) at(bodyTilt, rbox(0.1, 0.12, 0.05, 0.01, tailM), s * 0.85, 1.3, -2.7);
  at(bodyTilt, cyl(0.045, 0.045, 0.55, steelD, 10), -0.7, 0.42, -2.5).rotation.x = H;

  // брезент + верёвки
  at(bodyTilt, rbox(1.98, 0.1, 2.2, 0.04, canvasM), 0, 1.72, -1.55);
  for (const s of [-1, 1]) at(bodyTilt, rbox(0.05, 0.32, 2.2, 0.02, canvasD), s * 0.98, 1.58, -1.55);
  at(bodyTilt, rbox(1.98, 0.3, 0.05, 0.02, canvasD), 0, 1.58, -0.5);
  at(bodyTilt, rbox(1.98, 0.3, 0.05, 0.02, canvasD), 0, 1.58, -2.6);
  for (const z of [-0.85, -1.55, -2.25]) {
    at(bodyTilt, rbox(2.02, 0.02, 0.035, 0.005, ropeM), 0, 1.78, z);
    for (const s of [-1, 1]) at(bodyTilt, rbox(0.02, 0.55, 0.035, 0.005, ropeM), s * 1.0, 1.5, z);
  }

  // бочка
  const barrelG = new THREE.Group();
  barrelG.position.set(1.14, 0.92, -1.35);
  bodyTilt.add(barrelG);
  at(barrelG, cyl(0.26, 0.26, 0.95, redBarrel, 16), 0, 0, 0).rotation.x = H;
  for (const z of [-0.25, 0.25]) at(barrelG, new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.015, 6, 18), redBarrel), 0, 0, z);
  at(barrelG, rbox(0.06, 0.62, 0.08, 0.01, steelD), 0, 0.12, -0.3);
  at(barrelG, rbox(0.06, 0.62, 0.08, 0.01, steelD), 0, 0.12, 0.3);

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // ---------- сиденья ----------
  const seatY = 0.96;
  const seatDefs = [
    { id: 'driver', pos: new THREE.Vector3(-0.45, seatY, 0.55), yaw: 0, isDriver: true },
    { id: 'passenger', pos: new THREE.Vector3(0.45, seatY, 0.55), yaw: 0, isDriver: false },
  ];
  const seats = seatDefs.map((s) => ({ ...s, occupied: null }));
  const seatHitboxes = [];
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  for (const s of seats) {
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.6), hitMat);
    hb.position.copy(s.pos);
    hb.userData.seatId = s.id;
    hb.userData.isBuggySeat = true;
    bodyTilt.add(hb);
    seatHitboxes.push(hb);
  }

  const tops = [
    { kind: 'hood', x: 0, z: 1.8, hx: 0.7, hz: 0.65, y: 1.17 },
    { kind: 'roof', x: 0, z: 0.45, hx: 0.8, hz: 0.72, y: 1.99 },
    { kind: 'bed', x: 0, z: -1.55, hx: 0.95, hz: 1.05, y: 1.77 },
  ];
  const solids = [
    { x: 0, z: 1.9, hx: 0.95, hz: 0.75, bottom: 0.25, top: 1.2 },
    { x: 0, z: 0.45, hx: 0.92, hz: 0.85, bottom: 0.25, top: 1.99 },
    { x: 0, z: -1.55, hx: 1.0, hz: 1.1, bottom: 0.5, top: 1.77 },
  ];

  function getSeat(id) { return seats.find((s) => s.id === id) || null; }
  function trySit(hitObject, riderId) {
    const id = hitObject && hitObject.userData && hitObject.userData.seatId;
    if (!id) return null;
    const seat = getSeat(id);
    if (!seat || seat.occupied) return null;
    seat.occupied = riderId;
    return seat;
  }
  function sit(id, riderId) {
    const s = getSeat(id);
    if (s && !s.occupied) s.occupied = riderId;
    return s;
  }
  function standUp(id) {
    const s = getSeat(id);
    if (s) s.occupied = null;
  }
  const _m = new THREE.Vector3(), _q = new THREE.Quaternion(), _sc = new THREE.Vector3();
  function getSeatTransform(id) {
    const s = getSeat(id);
    if (!s) return null;
    bodyTilt.updateWorldMatrix(true, false);
    const world = s.pos.clone();
    // Поднимаем до уровня глаз водителя (1.48 относительно bodyTilt, seatY = 0.96)
    world.y += 0.52;
    bodyTilt.localToWorld(world);
    bodyTilt.matrixWorld.decompose(_m, _q, _sc);
    const yaw = new THREE.Euler().setFromQuaternion(_q, 'YXZ').y + s.yaw;
    return { position: world, yaw };
  }
  return Object.assign(rig, {
    group, seed, isBuggy: true, isTruck: false,
    tops, solids,
    seats, seatHitboxes, getSeat, trySit, sit, standUp, getSeatTransform,
    bodyTilt, steerCol, wheelGroup,
    wheels: { FL: wFL, FR: wFR, RL: wRL, RR: wRR },
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      if (group.parent) group.parent.remove(group);
    },
  });
}

// ============================================================
//  МИРОВЫЕ КООРДИНАТЫ (багги вложена в группу заправки!)
// ============================================================
const _wp = new THREE.Vector3();
const _lp = new THREE.Vector3();
function buggyWorldPos(buggy, out) {
    out.copy(buggy.group.position);
    if (buggy.group.parent) buggy.group.parent.localToWorld(out);
    return out;
}
function buggySetWorldPos(buggy, worldX, worldY, worldZ) {
    _lp.set(worldX, worldY, worldZ);
    if (buggy.group.parent) buggy.group.parent.worldToLocal(_lp);
    buggy.group.position.copy(_lp);
}

// ============================================================
//  СТОЛКНОВЕНИЯ
// ============================================================
const CAR_R = 1.0;            // "ширина" машины (радиус кругов-сэмплов)
const CAR_H = 2.6;            // высота машины
const STEP_H = 0.5;           // всё ниже этого можно переехать
const MIN_SIZE = 0.45;        // мелкий декор не мешает
const SAMPLES = [-2.3, -1.15, 0, 1.15, 2.3]; // круги вдоль корпуса
const _box = new THREE.Box3();

function isAlwaysPassable(ud) {
    if (!ud) return false;
    return ud.isGround || ud.isGrass || ud.isFlower || ud.isFern || ud.isScrap || ud.isDebris;
}
function isDescendantOf(obj, root) {
    let p = obj;
    while (p) { if (p === root) return true; p = p.parent; }
    return false;
}
function findTreeRoot(obj) {
    let p = obj;
    while (p) { if (p.userData && p.userData.isTree) return p; p = p.parent; }
    return null;
}

export function createBuggyController(buggy, camera, opts = {}) {
    const MAX_SPEED = 14.0;
    const MAX_REVERSE = 6.0;
    const ACCEL = 7.0;
    const ENGINE_BRAKE = 3.5;
    const BRAKE_POWER = 14.0;
    const TURN_RATE = 1.5;          // рад/сек при полной скорости
    const STEER_SMOOTH = 6.0;
    const MAX_WHEEL_ANGLE = 0.5;    // на сколько поворачиваются колёса
    const CLEARANCE = 0.0;          // колёса стоят прямо на земле
    const WR = 0.48;                // радиус колеса
    const FOLLOW_SPEED = 12;
    const HALF_TRACK = 0.95, HALF_BASE = 1.75;

    let speed = 0;
    let steer = 0;
    let driving = false;
    let rollAngle = 0;
    let netTarget = null;

    // 4 колеса: сглаженная высота земли под каждым
    const wheelDefs = ['FL', 'FR', 'RL', 'RR'].map((k) => {
        const w = buggy.wheels[k];
        return { w, x: w.pivot.position.x, z: w.pivot.position.z, h: null };
    });

    const eyeLocal = new THREE.Vector3(-0.45, 1.75, 0.1);
    const _eyeWorld = new THREE.Vector3();

    // ---------- ЗВУКИ ----------
    let audioCtx = null;
    const sounds = {};
    let soundState = 'OFF';
    let startSoundPlayed = false;

    function initAudio() {
        if (audioCtx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        const load = (name, file, loop = false) => {
            const audio = new Audio(`./sounds/buggy/${file}`);
            audio.loop = loop; audio.volume = 0;
            sounds[name] = { el: audio, gain: 0, target: 0 };
        };
        load('start', 'motorcycle-car-start-ignition-engine-cartoon-sound-behavior-sound.mp3', false);
        load('drive', 'jeep-car-is-driving-slowly-loop.mp3', true);
        load('brake', 'braking-tire-screeching.mp3', true);
        load('running', 'operation-of-a-running-working-engine.mp3', true);
    }

    function updateAudio(dt, input) {
        if (!audioCtx || !sounds.start) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const isMoving = Math.abs(speed) > 0.5;
        const isBraking = input.brake && isMoving;

        if (!driving) soundState = 'OFF';
        else {
            if (soundState === 'OFF') { soundState = 'STARTING'; startSoundPlayed = false; }
            if (soundState === 'STARTING') {
                if (!startSoundPlayed) {
                    sounds.start.el.currentTime = 0;
                    sounds.start.el.play().catch(() => {});
                    startSoundPlayed = true;
                }
                const d = sounds.start.el.duration;
                if (sounds.start.el.ended || (isFinite(d) && sounds.start.el.currentTime >= d - 0.1)) soundState = 'RUNNING';
            }
        }
        for (const k in sounds) {
            const s = sounds[k];
            s.target = 0;
            if (k === 'start' && soundState === 'STARTING') s.target = 0.9;
            if (k === 'running' && soundState === 'RUNNING') {
                s.target = 0.5 + (Math.abs(speed) / MAX_SPEED) * 0.3;
                s.el.playbackRate = 0.9 + (Math.abs(speed) / MAX_SPEED) * 0.3;
            }
            if (k === 'drive' && soundState === 'RUNNING' && isMoving) {
                s.target = 0.2 + (Math.abs(speed) / MAX_SPEED) * 0.6;
                s.el.playbackRate = 0.8 + (Math.abs(speed) / MAX_SPEED) * 0.4;
            }
            if (k === 'brake' && isBraking) s.target = 0.5;
            s.gain += (s.target - s.gain) * Math.min(1, dt * 5);
            s.el.volume = Math.max(0, Math.min(1, s.gain));
            if (s.gain > 0.01 && s.el.paused) s.el.play().catch(() => {});
            if (s.gain <= 0.01 && !s.el.paused && k !== 'start') s.el.pause();
        }
    }

    // ---------- РЕЛЬЕФ: 4 колеса независимо, крен + тангаж ----------
    function followTerrain(dt, wx, wz, yaw, snap = false) {
        const gh = opts.getGroundHeight;
        if (!gh) return null;
        const c = Math.cos(yaw), s = Math.sin(yaw);
        let sum = 0;
        for (const d of wheelDefs) {
            const px = wx + d.x * c + d.z * s;
            const pz = wz - d.x * s + d.z * c;
            const raw = gh(px, pz);
            if (snap || d.h === null) d.h = raw;
            else d.h += (raw - d.h) * Math.min(1, dt * FOLLOW_SPEED);
            sum += d.h;
        }
        const avg = sum / 4;
        let front = 0, rear = 0, plusX = 0, minusX = 0;
        for (const d of wheelDefs) {
            if (d.z > 0) front += d.h / 2; else rear += d.h / 2;
            if (d.x > 0) plusX += d.h / 2; else minusX += d.h / 2;
            d.w.pivot.position.y = WR + (d.h - avg);   // колесо "едет" по неровности
        }
        buggy.bodyTilt.rotation.x = -Math.atan2(front - rear, HALF_BASE * 2);   // нос вверх, когда впереди горка
        buggy.bodyTilt.rotation.z = Math.atan2(plusX - minusX, HALF_TRACK * 2); // крен
        return avg + CLEARANCE;
    }

    // ---------- ВИЗУАЛ КОЛЁС ----------
    function updateVisuals(dt) {
        const a = -steer * MAX_WHEEL_ANGLE;
        buggy.wheels.FL.pivot.rotation.y = a;   // поворачиваются только передние
        buggy.wheels.FR.pivot.rotation.y = a;
        rollAngle += (speed * dt) / WR;
        for (const k of ['FL', 'FR', 'RL', 'RR']) buggy.wheels[k].w.rotation.x = rollAngle;
        if (buggy.wheelGroup) buggy.wheelGroup.rotation.z = -steer * 1.6; // руль
    }

    // ---------- ПРОВЕРКА СТОЛКНОВЕНИЯ ----------
    function classify(obj) {
        const ud = obj.userData;
        if (ud._bk) return ud._bk;
        let k = 'box';
        if (isAlwaysPassable(ud) || isDescendantOf(obj, buggy.group)) k = 'skip';
        else {
            const t = findTreeRoot(obj);
            if (t) { k = 'tree'; ud._bkRoot = t; }
        }
        ud._bk = k;
        return k;
    }

    function isBlocked(wx, wz, yaw, bottomY) {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const low = bottomY + STEP_H, high = bottomY + CAR_H;
        const px = [], pz = [];
        for (let i = 0; i < SAMPLES.length; i++) { px.push(wx + s * SAMPLES[i]); pz.push(wz + c * SAMPLES[i]); }

        const colls = opts.colliders;
        if (colls) {
            for (let i = 0, l = colls.length; i < l; i++) {
                const obj = colls[i];
                if (!obj || !obj.matrixWorld) continue;
                const kind = classify(obj);
                if (kind === 'skip') continue;

                if (kind === 'tree') {
                    const t = obj.userData._bkRoot, ud = t.userData;
                    if (ud.falling || ud.fallen) continue;
                    const rr = (ud.trunkRadius || 0.3) + CAR_R;
                    const dxT = t.position.x - wx, dzT = t.position.z - wz;
                    if (dxT * dxT + dzT * dzT > (rr + 3.5) * (rr + 3.5)) continue;
                    for (let k = 0; k < px.length; k++) {
                        const dx = t.position.x - px[k], dz = t.position.z - pz[k];
                        if (dx * dx + dz * dz < rr * rr) return true;
                    }
                    continue;
                }

                const e = obj.matrixWorld.elements;
                const ox = e[12] - wx, oz = e[14] - wz;
                if (ox * ox + oz * oz > 2500) continue;
                const g = obj.geometry;
                if (!g) continue;
                if (!g.boundingBox) g.computeBoundingBox();
                if (!g.boundingBox) continue;
                _box.copy(g.boundingBox).applyMatrix4(obj.matrixWorld);
                if (_box.max.y <= low || _box.min.y >= high) continue;
                if ((_box.max.x - _box.min.x) < MIN_SIZE && (_box.max.z - _box.min.z) < MIN_SIZE) continue;
                if (_box.max.x < wx - 4 || _box.min.x > wx + 4 || _box.max.z < wz - 4 || _box.min.z > wz + 4) continue;
                for (let k = 0; k < px.length; k++) {
                    const dx = Math.max(_box.min.x - px[k], 0, px[k] - _box.max.x);
                    const dz = Math.max(_box.min.z - pz[k], 0, pz[k] - _box.max.z);
                    if (dx * dx + dz * dz < CAR_R * CAR_R) return true;
                }
            }
        }

        // постройки игроков
        const bc = opts.buildingColliders;
        if (bc) {
            for (const b of bc) {
                if (b.on === false) continue;
                if (b.maxY <= low || b.minY >= high) continue;
                for (let k = 0; k < px.length; k++) {
                    const dx = Math.max(b.minX - px[k], 0, px[k] - b.maxX);
                    const dz = Math.max(b.minZ - pz[k], 0, pz[k] - b.maxZ);
                    if (dx * dx + dz * dz < CAR_R * CAR_R) return true;
                }
            }
        }
        return false;
    }

    // ---------- ВХОД / ВЫХОД ----------
    function snapToGround() {
        const wp = buggyWorldPos(buggy, _wp);
        const y = followTerrain(0.016, wp.x, wp.z, buggy.group.rotation.y, true);
        if (y !== null) buggySetWorldPos(buggy, wp.x, y, wp.z);
    }
    function enterDriver() {
        driving = true;
        netTarget = null;
        initAudio();
        snapToGround();
    }
    function exitDriver() {
        driving = false;
        speed = 0;
        steer = 0;
        soundState = 'OFF';
        updateVisuals(0);
        snapToGround();
        for (const k in sounds) {
            sounds[k].el.pause(); sounds[k].gain = 0; sounds[k].el.volume = 0;
        }
    }
    function isDriving() { return driving; }

    // ---------- ГЛАВНЫЙ ЦИКЛ ВОДИТЕЛЯ ----------
    function update(dt, input = {}) {
        dt = Math.min(dt, 0.05);
        if (buggy.group.parent) buggy.group.parent.updateWorldMatrix(true, false);

        const active = driving && window.mySeatId === 'driver';
        const throttle = active ? ((input.forward ? 1 : 0) - (input.back ? 1 : 0)) : 0;
        const braking = active && !!input.brake;

        let a;
        if (throttle > 0) a = speed < -0.3 ? BRAKE_POWER : ACCEL * (speed < MAX_SPEED ? 1 : 0);
        else if (throttle < 0) a = speed > 0.3 ? -BRAKE_POWER : -ACCEL * 0.75 * (speed > -MAX_REVERSE ? 1 : 0);
        else a = -Math.sign(speed) * (active ? ENGINE_BRAKE : ENGINE_BRAKE * 1.4);
        if (braking) a = -Math.sign(speed) * BRAKE_POWER;

        const prev = speed;
        speed += a * dt;
        if ((throttle === 0 || braking) && prev * speed <= 0) speed = 0; // тормоз не уводит в обратную сторону
        speed = THREE.MathUtils.clamp(speed, -MAX_REVERSE, MAX_SPEED);

        // руль: колёса поворачиваются всегда, а сама машина — только когда едет
        const steerInput = active ? ((input.right ? 1 : 0) - (input.left ? 1 : 0)) : 0;
        steer += (steerInput - steer) * Math.min(1, dt * STEER_SMOOTH);
        const turnFactor = THREE.MathUtils.clamp(speed / 3.5, -1, 1); // стоит на месте = 0 поворота
        buggy.group.rotation.y -= steer * TURN_RATE * turnFactor * dt;

        const yaw = buggy.group.rotation.y;
        const curWorld = buggyWorldPos(buggy, _wp).clone();
        const bottomY = curWorld.y - CLEARANCE;

        let finalX = curWorld.x, finalZ = curWorld.z;
        if (Math.abs(speed) > 0.001) {
            const nx = curWorld.x + Math.sin(yaw) * speed * dt;
            const nz = curWorld.z + Math.cos(yaw) * speed * dt;
            // если уже "застряли" внутри чего-то — даём выехать
            if (!isBlocked(nx, nz, yaw, bottomY) || isBlocked(curWorld.x, curWorld.z, yaw, bottomY)) {
                finalX = nx; finalZ = nz;
            } else {
                speed = 0;
            }
        }

        const y = followTerrain(dt, finalX, finalZ, yaw);
        buggySetWorldPos(buggy, finalX, y !== null ? y : curWorld.y, finalZ);

        updateVisuals(dt);
        updateAudio(dt, input);

        if (driving && camera) {
            buggy.bodyTilt.updateWorldMatrix(true, false);
            _eyeWorld.copy(eyeLocal);
            buggy.bodyTilt.localToWorld(_eyeWorld);
            camera.position.copy(_eyeWorld);
        }
    }

    // ---------- КОГДА МАШИНУ ВОДИТ КТО-ТО ДРУГОЙ (или никто) ----------
    function tick(dt) {
        dt = Math.min(dt, 0.05);
        if (driving) return;
        if (netTarget) {
            const k = Math.min(1, dt * 10);
            const p = buggy.group.position;
            p.x += (netTarget.x - p.x) * k;
            p.y += (netTarget.y - p.y) * k;
            p.z += (netTarget.z - p.z) * k;
            let dr = netTarget.ry - buggy.group.rotation.y;
            dr = Math.atan2(Math.sin(dr), Math.cos(dr));
            buggy.group.rotation.y += dr * k;
            steer += (netTarget.steer - steer) * k;
            speed = netTarget.speed;
            if (buggy.group.parent) buggy.group.parent.updateWorldMatrix(true, false);
            const w = buggyWorldPos(buggy, _wp);
            followTerrain(dt, w.x, w.z, buggy.group.rotation.y);
        } else {
            speed = 0;
        }
        updateVisuals(dt);
    }

    return {
        enterDriver, exitDriver, isDriving, update, tick,
        getSpeed: () => speed,
        getNetState() {
            return {
                x: buggy.group.position.x, y: buggy.group.position.y, z: buggy.group.position.z,
                ry: buggy.group.rotation.y, speed, steer
            };
        },
        applyNetState(d) {
            if (!d) return;
            netTarget = { x: d.x, y: d.y, z: d.z, ry: d.ry || 0, speed: d.speed || 0, steer: d.steer || 0 };
        },
    };
}
