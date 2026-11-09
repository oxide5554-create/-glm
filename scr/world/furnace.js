// scr/world/furnace.js
// ✅ Печка — размещаемый объект для плавки серной/железной руды.
//    Mirror of storage.js but with smelting instead of storage.
//    UI: bottom = wood (fuel), top = ore (input), right = output (sulfur/iron).
//    Has fire + smoke particles + burning sound (distance-based volume).

import * as THREE from "three";
import { ITEMS, renderIcon } from "../ui/hotbar.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const FURNACE_GLB_PATH = "./scr/3d/furnace.glb";
const FURNACE_SOUND_PATH = "./sounds/furnace/burning.ogg";
const SMELT_TIME = 5.0;   // секунд на 1 порцию (1 руда + 1 дерево → 1 выход)

// ---------- Кэш GLB-модели печки ----------
let _furnaceGltf = null;
const _pendingFurnaces = [];

export function preloadFurnaceModel() {
  if (_furnaceGltf) return Promise.resolve(_furnaceGltf);
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(FURNACE_GLB_PATH, (gltf) => {
      _furnaceGltf = gltf;
      gltf.scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material) {
            o.material.side = THREE.DoubleSide;
            if (o.material.map) o.material.map.anisotropy = 8;
          }
        }
      });
      // Центрируем и масштабируем под разумный размер (~1.2м высотой)
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const len = Math.max(size.x, size.y, size.z);
      const TARGET_LEN = 1.4;
      if (len > 0.001) {
        gltf.scene.scale.multiplyScalar(TARGET_LEN / len);
        gltf.scene.updateMatrixWorld(true);
      }
      const box2 = new THREE.Box3().setFromObject(gltf.scene);
      gltf.scene.position.y -= box2.min.y;
      gltf.scene.updateMatrixWorld(true);
      console.log("[Furnace] GLB-модель загружена");
      _replacePendingFurnaces();
      resolve(_furnaceGltf);
    }, undefined, (err) => {
      console.warn("[Furnace] Ошибка загрузки GLB, fallback на procedural:", err);
      reject(err);
    });
  });
}

function _replacePendingFurnaces() {
  if (!_furnaceGltf || !_furnaceGltf.scene) return;
  let replaced = 0;
  for (const group of _pendingFurnaces) {
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
    }
    const clone = _furnaceGltf.scene.clone(true);
    clone.traverse(o => { if (o.isMesh && o.material) o.material = o.material.clone(); });
    group.add(clone);
    replaced++;
  }
  _pendingFurnaces.length = 0;
  if (replaced > 0) console.log("[Furnace] Заменено procedural → GLB: " + replaced);
}

// ---------- Procedural fallback-модель печки ----------
function buildProceduralFurnace() {
  const parts = [];
  const mat = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.1, flatShading: true });
  // основание из кирпичей
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.0), mat(0x6a4a3a));
  base.position.y = 0.2; parts.push(base);
  // корпус печи
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.9, 16), mat(0x8a6a4a));
  body.position.y = 0.85; parts.push(body);
  // верхнее отверстие
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16), mat(0x1a0a05));
  top.position.y = 1.35; parts.push(top);
  // топка (отверстие спереди)
  const opening = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.05), mat(0x0a0503));
  opening.position.set(0, 0.6, 0.5); parts.push(opening);
  const g = new THREE.Group();
  for (const m of parts) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

function buildFurnaceModel() {
  const group = new THREE.Group();
  if (_furnaceGltf && _furnaceGltf.scene) {
    const clone = _furnaceGltf.scene.clone(true);
    clone.traverse(o => { if (o.isMesh && o.material) o.material = o.material.clone(); });
    group.add(clone);
  } else {
    const proc = buildProceduralFurnace();
    while (proc.children.length) group.add(proc.children[0]);
    _pendingFurnaces.push(group);
  }
  return group;
}

function buildFurnaceGhost() {
  const model = buildFurnaceModel();
  model.traverse(c => {
    if (c.isMesh) {
      c.material = new THREE.MeshBasicMaterial({ color: 0x39d353, transparent: true, opacity: 0.5, depthWrite: false });
      c.castShadow = false;
    }
  });
  return model;
}

// ---------- Частицы огня и дыма (оптимизированные) ----------
function createFireParticles() {
  // ✅ Оптимизированный огонь — небольшие конусы с emissive + анимация.
  //    4 пламени вокруг центра топки.
  const group = new THREE.Group();
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const fireMat2 = new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const fires = [];
  for (let i = 0; i < 4; i++) {
    const h = 0.25 + Math.random() * 0.15;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, h, 6), i % 2 ? fireMat : fireMat2);
    const a = (i / 4) * Math.PI * 2;
    cone.position.set(Math.cos(a) * 0.12, 0.65 + h * 0.5, Math.sin(a) * 0.12);
    cone.userData.baseH = h;
    cone.userData.phase = Math.random() * Math.PI * 2;
    group.add(cone);
    fires.push(cone);
  }
  group.userData.fires = fires;
  group.visible = false;
  return group;
}

function createSmokeParticles() {
  // ✅ Оптимизированный дым — 6 полупрозрачных спрайтов, поднимаются вверх.
  const group = new THREE.Group();
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x4a4a4a, transparent: true, opacity: 0.4, depthWrite: false });
  const smokes = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), smokeMat.clone());
    s.userData.phase = i * 0.6;
    s.userData.baseX = (Math.random() - 0.5) * 0.15;
    s.userData.baseZ = (Math.random() - 0.5) * 0.15;
    s.position.set(s.userData.baseX, 1.5, s.userData.baseZ);
    s.visible = false;
    group.add(s);
    smokes.push(s);
  }
  group.userData.smokes = smokes;
  group.visible = false;
  return group;
}

function updateParticles(furnace, dt, active) {
  if (!furnace.userData.fireGroup) return;
  const fireGroup = furnace.userData.fireGroup;
  const smokeGroup = furnace.userData.smokeGroup;
  fireGroup.visible = active;
  smokeGroup.visible = active;
  if (!active) return;

  // Анимация огня — мерцание высоты
  const t = performance.now() * 0.003;
  for (const cone of fireGroup.userData.fires) {
    const scale = 0.8 + Math.sin(t * 3 + cone.userData.phase) * 0.3;
    cone.scale.y = scale;
    cone.scale.x = cone.scale.z = 0.9 + Math.sin(t * 4 + cone.userData.phase) * 0.2;
  }

  // Анимация дыма — поднимается вверх, потом исчезает и снова появляется
  for (const s of smokeGroup.userData.smokes) {
    s.userData.phase += dt * 0.5;
    const cycle = (s.userData.phase % 2.5) / 2.5;   // 0..1 за 2.5 сек
    s.position.y = 1.4 + cycle * 1.5;
    s.position.x = s.userData.baseX + Math.sin(s.userData.phase * 2) * 0.08;
    s.position.z = s.userData.baseZ + Math.cos(s.userData.phase * 1.5) * 0.08;
    s.scale.setScalar(0.5 + cycle * 1.2);
    s.material.opacity = 0.4 * (1 - cycle);
    s.visible = cycle < 0.95;
  }
}

// ---------- Звук печки (с затуханием по дистанции) ----------
let _furnaceSound = null;
let _furnaceSoundLoaded = false;

export function preloadFurnaceSound(soundManager) {
  if (_furnaceSoundLoaded) return;
  _furnaceSoundLoaded = true;
  try {
    soundManager.load('furnaceBurning', FURNACE_SOUND_PATH, { volume: 0, loop: true });
    console.log("[Furnace] Звук плавки загружен");
  } catch (e) {
    console.warn("[Furnace] Не удалось загрузить звук:", e);
  }
}

function updateFurnaceSound(camera, furnaces) {
  if (!_furnaceSoundLoaded || !soundManagerPlay) return;
  // Находим ближайшую АКТИВНУЮ печку
  let closestDist = Infinity;
  let anyActive = false;
  for (const f of furnaces) {
    if (!f.userData || !f.userData.isFurnace) continue;
    const state = f.userData.state;
    if (!state || !state.burning) continue;
    anyActive = true;
    const wpos = new THREE.Vector3();
    f.getWorldPosition(wpos);
    const d = Math.hypot(wpos.x - camera.position.x, wpos.y - camera.position.y, wpos.z - camera.position.z);
    if (d < closestDist) closestDist = d;
  }
  if (!anyActive) {
    soundManagerPlay('furnaceBurning', { volume: 0 });
    return;
  }
  // Затухание: 0 на дистанции >25м, 0.4 на дистанции 0м (макс).
  const vol = Math.max(0, 0.4 * (1 - closestDist / 25));
  soundManagerPlay('furnaceBurning', { volume: vol });
}

let soundManagerPlay = null;
export function setSoundManagerPlay(fn) { soundManagerPlay = fn; }

// ---------- Создание мира печек ----------
export function createFurnaceWorld(scene, getHeight, buildingSystem, soundMgr) {
  const group = new THREE.Group();
  group.name = "furnaces";
  scene.add(group);
  const furnaces = [];
  let ghost = null, ghostActive = false, pendingPos = null, valid = false;

  // Звук
  if (soundMgr) {
    preloadFurnaceSound(soundMgr);
  }

  function showGhost() {
    if (!ghost) { ghost = buildFurnaceGhost(); ghost.visible = false; scene.add(ghost); }
    ghostActive = true; ghost.visible = true;
  }
  function hideGhost() {
    ghostActive = false;
    if (ghost) ghost.visible = false;
    pendingPos = null; valid = false;
  }
  function isGhostActive() { return ghostActive; }

  function updateGhost(ray, targets) {
    if (!ghostActive) return;
    const hits = ray.intersectObjects(targets, true);
    if (hits.length && hits[0].distance < 8) {
      const p = hits[0].point;
      let surfaceY = getHeight(p.x, p.z);
      // Проверяем фундаменты/потолки (как storage)
      if (buildingSystem) {
        for (const piece of buildingSystem.pieces.values()) {
          if (piece.part === 'foundation') {
            const fx = (piece.i + 0.5) * 3.0;
            const fz = (piece.k + 0.5) * 3.0;
            if (Math.abs(p.x - fx) < 1.5 && Math.abs(p.z - fz) < 1.5) { surfaceY = piece.y; break; }
          }
        }
      }
      ghost.visible = true;
      ghost.position.set(p.x, surfaceY, p.z);
      pendingPos = new THREE.Vector3(p.x, surfaceY, p.z);
      valid = true;
      ghost.traverse(c => { if (c.isMesh) c.material.color.setHex(0x39d353); });
    } else {
      ghost.visible = false; pendingPos = null; valid = false;
    }
  }

  function tryPlace() {
    if (!valid || !pendingPos) return null;
    // ✅ НОВОЕ: проверка перекрытия со стенами — по позиции ПРИЗРАКА.
    if (buildingSystem && buildingSystem.colliders) {
      const r = 0.6;   // радиус печки
      for (const c of buildingSystem.colliders) {
        if (c.on === false) continue;
        if (c.step) continue;
        if (pendingPos.x + r > c.minX && pendingPos.x - r < c.maxX &&
            pendingPos.z + r > c.minZ && pendingPos.z - r < c.maxZ) {
          return null;
        }
      }
    }
    const id = `furnace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const model = buildFurnaceModel();
    model.position.copy(pendingPos);
    // Частицы
    const fireGroup = createFireParticles();
    const smokeGroup = createSmokeParticles();
    model.add(fireGroup);
    model.add(smokeGroup);
    group.add(model);
    const furnace = {
      id, mesh: model, position: pendingPos.clone(),
      // Состояние печки:
      state: {
        oreInput: null,      // { id, count } — серная или железная руда
        fuel: 0,             // количество дерева (топливо)
        output: null,        // { id, count } — сера или железо
        smeltProgress: 0,    // 0..SMELT_TIME
        burning: false,      // идёт ли плавка сейчас
      },
      fireGroup, smokeGroup,
    };
    model.userData.isFurnace = true;
    model.userData.state = furnace.state;
    model.userData.furnaceId = id;
    model.userData.fireGroup = fireGroup;
    model.userData.smokeGroup = smokeGroup;
    furnaces.push(furnace);
    hideGhost();
    return furnace;
  }

  function tryInteract(ray, maxDist = 3.5) {
    for (const f of furnaces) {
      const hits = ray.intersectObject(f.mesh, true);
      if (hits.length && hits[0].distance <= maxDist) return f;
    }
    return null;
  }

  function update(dt) {
    // Логика плавки для каждой печки
    for (const f of furnaces) {
      const st = f.state;
      let active = false;
      if (st.burning) {
        if (st.fuel > 0 && st.oreInput && st.oreInput.count > 0) {
          // Плавим
          st.smeltProgress += dt;
          active = true;
          if (st.smeltProgress >= SMELT_TIME) {
            st.smeltProgress = 0;
            // 1 руда + 1 дерево → 1 выход
            st.oreInput.count--;
            if (st.oreInput.count <= 0) st.oreInput = null;
            st.fuel--;
            const outId = (st.oreInput && st.oreInput.id === 'iron_ore') ? 'iron' :
                          (st.oreInput && st.oreInput.id === 'sulfur_ore') ? 'sulfur' :
                          st.lastOreId === 'iron_ore' ? 'iron' : 'sulfur';
            // Запоминаем что плавили (если руда кончилась)
            if (st.oreInput) st.lastOreId = st.oreInput.id;
            else if (st.lastOreId === 'iron_ore') { /* уже iron */ }
            // Добавляем в выход
            if (!st.output) st.output = { id: outId, count: 0 };
            st.output.id = outId;
            st.output.count++;
          }
        } else {
          // Нет топлива или руды — останавливаемся
          st.burning = false;
          st.smeltProgress = 0;
        }
      }
      updateParticles(f.mesh, dt, active);
    }
  }

  return {
    showGhost, hideGhost, isGhostActive, updateGhost, tryPlace,
    tryInteract, update,
    set soundPlayFn(fn) { soundManagerPlay = fn; },
    get furnaces() { return furnaces; }
  };
}

// ============================================================
//  UI ПЕЧКИ — чистый стиль Rust (как референс).
//  Две панели бок о бок: печка (слева) + инвентарь (справа).
//  Без эмодзи, без градиентов, без скруглений.
// ============================================================
let furnacePanelEl = null;
let activeFurnace = null;
let isFurnaceOpen = false;
let inventoryRef = null;

export function initFurnaceUI(inventory) {
  inventoryRef = inventory;
  if (furnacePanelEl) return;
  if (!document.getElementById("furnace-style")) {
    const st = document.createElement("style"); st.id = "furnace-style";
    st.textContent = `
/* ✅ Чистый стиль Rust — тёмный фон, простые квадратные слоты, без эмодзи */
.furnace-overlay { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 110; pointer-events: auto; }
.furnace-overlay.open { display: flex; }
.furnace-container { display: flex; gap: 8px; background: rgba(15, 15, 15, 0.95); border: 1px solid #2a2a2a; padding: 16px; }
.furnace-side { display: flex; flex-direction: column; }
.furnace-title { font-size: 13px; color: #b0b0b0; font-weight: 600; text-align: center; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #2a2a2a; font-family: Arial, sans-serif; }
/* ✅ Панель печки — узкая, слева */
.furnace-panel-side { width: 200px; }
.furnace-slots { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.furnace-row { display: flex; align-items: center; gap: 8px; justify-content: center; }
.furnace-slot { width: 56px; height: 56px; background: #1a1a1a; border: 1px solid #2a2a2a; position: relative; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.furnace-slot:hover { border-color: #555; }
.furnace-slot.drop-target { border-color: #888; background: #222; }
.furnace-slot img { width: 48px; height: 48px; object-fit: contain; }
.furnace-slot-empty { color: #333; font-size: 20px; font-family: Arial, sans-serif; }
.furnace-count { position: absolute; bottom: 1px; right: 3px; font-size: 11px; color: #fff; font-family: monospace; font-weight: bold; text-shadow: 1px 1px 0 #000; }
.furnace-arrow { color: #888; font-size: 18px; font-family: Arial, sans-serif; }
.furnace-label { font-size: 9px; color: #666; text-align: center; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; font-family: Arial, sans-serif; }
.furnace-progress-text { font-size: 11px; color: #999; text-align: center; margin: 6px 0; font-family: monospace; }
.furnace-btn { width: 100%; padding: 8px; background: #2a2a2a; color: #ccc; border: 1px solid #333; cursor: pointer; font-family: Arial, sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 4px; }
.furnace-btn:hover { background: #333; color: #fff; }
.furnace-btn.off { background: #3a1a1a; border-color: #5a2a2a; color: #c06060; }
.furnace-btn.off:hover { background: #4a2a2a; color: #e08080; }
.furnace-close { position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; background: transparent; border: 1px solid #333; color: #888; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
.furnace-close:hover { border-color: #666; color: #fff; }
/* ✅ Панель инвентаря — справа, сетка слотов */
.furnace-inv-side { width: auto; }
.furnace-inv-grid { display: grid; grid-template-columns: repeat(6, 56px); gap: 3px; }
.furnace-inv-slot { width: 56px; height: 56px; background: #1a1a1a; border: 1px solid #2a2a2a; position: relative; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.furnace-inv-slot:hover { border-color: #444; }
.furnace-inv-slot.drag-over { border-color: #888; }
.furnace-inv-slot.dragging { opacity: 0.4; }
.furnace-inv-slot img { width: 48px; height: 48px; object-fit: contain; }
.furnace-inv-count { position: absolute; bottom: 1px; right: 3px; font-size: 11px; color: #fff; font-family: monospace; font-weight: bold; text-shadow: 1px 1px 0 #000; }
`;
    document.head.appendChild(st);
  }
}

// ✅ Рендер одного слота инвентаря (для панели справа)
function renderInvSlot(inventory, slotData, index) {
  const div = document.createElement("div");
  div.className = "furnace-inv-slot";
  if (!slotData) {
    div.innerHTML = "";
    // Drop target для swap
    div.addEventListener("dragover", (e) => { e.preventDefault(); div.classList.add("drag-over"); });
    div.addEventListener("dragleave", () => div.classList.remove("drag-over"));
    div.addEventListener("drop", (e) => {
      e.preventDefault(); div.classList.remove("drag-over");
      const data = e.dataTransfer.getData("text/plain");
      if (!data) return;
      try {
        const src = JSON.parse(data);
        if (src.type === "inv") {
          inventory.swapItems({ type: "inv", index: src.index }, { type: "inv", index });
        } else if (src.type === "furnace-ore") {
          // Забрать руду из печки в инвентарь
          if (activeFurnace && activeFurnace.state.oreInput) {
            const inp = activeFurnace.state.oreInput;
            const added = inventory.addItem(inp.id, inp.count);
            if (added) {
              inp.count -= added;
              if (inp.count <= 0) activeFurnace.state.oreInput = null;
              renderFurnaceUI();
            }
          }
        } else if (src.type === "furnace-fuel") {
          if (activeFurnace && activeFurnace.state.fuel > 0) {
            const added = inventory.addItem("wood", activeFurnace.state.fuel);
            if (added) {
              activeFurnace.state.fuel -= added;
              renderFurnaceUI();
            }
          }
        } else if (src.type === "furnace-output") {
          if (activeFurnace && activeFurnace.state.output) {
            const out = activeFurnace.state.output;
            const added = inventory.addItem(out.id, out.count);
            if (added) {
              out.count -= added;
              if (out.count <= 0) activeFurnace.state.output = null;
              renderFurnaceUI();
            }
          }
        }
      } catch (err) {}
    });
    return div;
  }
  // Заполненный слот
  div.innerHTML = renderIcon(slotData.item);
  if (slotData.item.stackable && slotData.count > 1) {
    div.innerHTML += `<div class="furnace-inv-count">${slotData.count}</div>`;
  }
  div.title = slotData.item.name;
  div.draggable = true;
  div.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ type: "inv", index }));
    setTimeout(() => div.classList.add("dragging"), 0);
  });
  div.addEventListener("dragend", () => div.classList.remove("dragging"));
  div.addEventListener("dragover", (e) => { e.preventDefault(); div.classList.add("drag-over"); });
  div.addEventListener("dragleave", () => div.classList.remove("drag-over"));
  div.addEventListener("drop", (e) => {
    e.preventDefault(); div.classList.remove("drag-over");
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;
    try {
      const src = JSON.parse(data);
      if (src.type === "inv") {
        inventory.swapItems({ type: "inv", index: src.index }, { type: "inv", index });
      } else if (src.type === "furnace-ore" || src.type === "furnace-fuel" || src.type === "furnace-output") {
        // Забрать из печки в этот слот — swapItems не подходит, используем addItem
        if (src.type === "furnace-ore" && activeFurnace && activeFurnace.state.oreInput) {
          const inp = activeFurnace.state.oreInput;
          const added = inventory.addItem(inp.id, inp.count);
          if (added) { inp.count -= added; if (inp.count <= 0) activeFurnace.state.oreInput = null; }
        } else if (src.type === "furnace-fuel" && activeFurnace && activeFurnace.state.fuel > 0) {
          const added = inventory.addItem("wood", activeFurnace.state.fuel);
          if (added) activeFurnace.state.fuel -= added;
        } else if (src.type === "furnace-output" && activeFurnace && activeFurnace.state.output) {
          const out = activeFurnace.state.output;
          const added = inventory.addItem(out.id, out.count);
          if (added) { out.count -= added; if (out.count <= 0) activeFurnace.state.output = null; }
        }
        renderFurnaceUI();
      }
    } catch (err) {}
  });
  return div;
}

// ✅ Рендер слота печки (руды/топлива/выхода)
function renderFurnaceSlotEl(slotEl, item, count, slotType) {
  slotEl.innerHTML = "";
  slotEl.setAttribute("data-slot-type", slotType);
  if (item && count > 0) {
    const img = document.createElement("img");
    img.src = item.icon;
    img.onerror = () => { img.style.display = "none"; };
    slotEl.appendChild(img);
    const cnt = document.createElement("div");
    cnt.className = "furnace-count";
    cnt.textContent = count;
    slotEl.appendChild(cnt);
  } else {
    const empty = document.createElement("div");
    empty.className = "furnace-slot-empty";
    empty.textContent = "+";
    slotEl.appendChild(empty);
  }
}

export function openFurnaceUI(furnace, inventory) {
  inventoryRef = inventory;
  if (!furnacePanelEl) {
    furnacePanelEl = document.createElement("div");
    furnacePanelEl.className = "furnace-overlay";
    furnacePanelEl.innerHTML = `
      <div class="furnace-container" style="position:relative">
        <button class="furnace-close">X</button>
        <!-- ✅ Левая панель: ПЕЧКА -->
        <div class="furnace-side furnace-panel-side">
          <div class="furnace-title">Печка</div>
          <div class="furnace-slots">
            <div class="furnace-row">
              <div>
                <div class="furnace-slot" id="furnaceOreSlot"></div>
                <div class="furnace-label">Руда</div>
              </div>
              <div class="furnace-arrow">></div>
              <div>
                <div class="furnace-slot" id="furnaceOutputSlot"></div>
                <div class="furnace-label">Выход</div>
              </div>
            </div>
            <div>
              <div class="furnace-slot" id="furnaceFuelSlot"></div>
              <div class="furnace-label">Топливо</div>
            </div>
            <div class="furnace-progress-text" id="furnaceProgress">-</div>
            <button class="furnace-btn" id="furnaceStartBtn">Плавить</button>
            <button class="furnace-btn off" id="furnaceOffBtn">Выключить</button>
          </div>
        </div>
        <!-- ✅ Правая панель: ИНВЕНТАРЬ + HOTBAR -->
        <div class="furnace-side furnace-inv-side">
          <div class="furnace-title">Инвентарь</div>
          <div class="furnace-inv-grid" id="furnaceInvGrid"></div>
          <div class="furnace-title" style="margin-top:10px">Hotbar</div>
          <div class="furnace-inv-grid" id="furnaceHotbarGrid"></div>
        </div>
      </div>
    `;
    document.body.appendChild(furnacePanelEl);
    furnacePanelEl.querySelector(".furnace-close").addEventListener("click", () => closeFurnaceUI());
    furnacePanelEl.querySelector("#furnaceOffBtn").addEventListener("click", () => {
      if (activeFurnace) {
        activeFurnace.state.burning = false;
        activeFurnace.state.smeltProgress = 0;
        renderFurnaceUI();
      }
    });
    furnacePanelEl.querySelector("#furnaceStartBtn").addEventListener("click", () => {
      if (activeFurnace) {
        const st = activeFurnace.state;
        if (st.fuel > 0 && st.oreInput && st.oreInput.count > 0) {
          st.burning = true;
          renderFurnaceUI();
        }
      }
    });

    // ✅ Drag-and-drop из инвентаря в слоты печки
    const oreSlot = furnacePanelEl.querySelector("#furnaceOreSlot");
    const fuelSlot = furnacePanelEl.querySelector("#furnaceFuelSlot");

    function setupDrop(slotEl, acceptIds, slotType) {
      slotEl.addEventListener("dragover", (e) => { e.preventDefault(); slotEl.classList.add("drop-target"); });
      slotEl.addEventListener("dragleave", () => slotEl.classList.remove("drop-target"));
      slotEl.addEventListener("drop", (e) => {
        e.preventDefault(); slotEl.classList.remove("drop-target");
        const data = e.dataTransfer.getData("text/plain");
        if (!data) return;
        try {
          const src = JSON.parse(data);
          if (src.type !== "inv") return;
          const slot = inventory.slots[6 + src.index];
          if (!slot || !slot.item) return;
          if (!acceptIds.includes(slot.item.id)) return;
          if (slotType === "ore") {
            if (!activeFurnace.state.oreInput) activeFurnace.state.oreInput = { id: slot.item.id, count: 0 };
            if (activeFurnace.state.oreInput.id !== slot.item.id) activeFurnace.state.oreInput = { id: slot.item.id, count: 0 };
            const take = Math.min(slot.count, 50);
            activeFurnace.state.oreInput.count += take;
            inventory.removeItem(slot.item.id, take);
          } else if (slotType === "fuel") {
            const take = Math.min(slot.count, 100);
            activeFurnace.state.fuel += take;
            inventory.removeItem(slot.item.id, take);
          }
          renderFurnaceUI();
        } catch (err) {}
      });
      // ✅ Клик по слоту — забрать обратно в инвентарь
      //    (без draggable=true — клик работает надёжно)
      slotEl.addEventListener("click", () => {
        if (!activeFurnace) return;
        if (slotType === "ore") {
          const inp = activeFurnace.state.oreInput;
          if (inp && inp.count > 0) {
            const added = inventory.addItem(inp.id, inp.count);
            if (added) { inp.count -= added; if (inp.count <= 0) activeFurnace.state.oreInput = null; renderFurnaceUI(); }
          }
        } else if (slotType === "fuel") {
          if (activeFurnace.state.fuel > 0) {
            const added = inventory.addItem("wood", activeFurnace.state.fuel);
            if (added) { activeFurnace.state.fuel -= added; renderFurnaceUI(); }
          }
        }
      });
    }
    setupDrop(oreSlot, ["sulfur_ore", "iron_ore"], "ore");
    setupDrop(fuelSlot, ["wood"], "fuel");

    // ✅ Клик по выходу — забрать в инвентарь (без draggable — клик работает)
    const outputSlot = furnacePanelEl.querySelector("#furnaceOutputSlot");
    outputSlot.addEventListener("click", () => {
      if (!activeFurnace) return;
      const out = activeFurnace.state.output;
      if (out && out.count > 0) {
        const added = inventory.addItem(out.id, out.count);
        if (added) {
          out.count -= added;
          if (out.count <= 0) activeFurnace.state.output = null;
          renderFurnaceUI();
        }
      }
    });
  }
  activeFurnace = furnace;
  isFurnaceOpen = true;
  furnacePanelEl.classList.add("open");
  // ✅ Скрываем хотбар пока открыта печка
  const hb = document.getElementById("hotbar");
  if (hb) hb.style.display = "none";
  document.exitPointerLock();
  renderFurnaceUI();
}

function renderFurnaceUI() {
  if (!activeFurnace || !furnacePanelEl || !inventoryRef) return;
  const st = activeFurnace.state;
  const oreSlot = furnacePanelEl.querySelector("#furnaceOreSlot");
  const fuelSlot = furnacePanelEl.querySelector("#furnaceFuelSlot");
  const outputSlot = furnacePanelEl.querySelector("#furnaceOutputSlot");
  const progressEl = furnacePanelEl.querySelector("#furnaceProgress");
  const invGrid = furnacePanelEl.querySelector("#furnaceInvGrid");

  const oreItem = st.oreInput ? ITEMS[st.oreInput.id] : null;
  renderFurnaceSlotEl(oreSlot, oreItem, st.oreInput ? st.oreInput.count : 0, "ore");
  renderFurnaceSlotEl(fuelSlot, ITEMS.wood, st.fuel, "fuel");
  const outItem = st.output ? ITEMS[st.output.id] : null;
  renderFurnaceSlotEl(outputSlot, outItem, st.output ? st.output.count : 0, "output");

  // ✅ Текст прогресса (без полосок-градиентов — просто текст)
  const pct = st.burning ? (st.smeltProgress / SMELT_TIME) * 100 : 0;
  if (st.burning) {
    progressEl.textContent = `${Math.round(pct)}%`;
  } else if (st.fuel > 0 && st.oreInput && st.oreInput.count > 0) {
    progressEl.textContent = "Готово";
  } else {
    progressEl.textContent = "-";
  }

  // ✅ Рендер инвентаря (slots[6..]) + хотбара (slots[0..5])
  if (invGrid) {
    invGrid.innerHTML = "";
    for (let i = 6; i < inventoryRef.size; i++) {
      invGrid.appendChild(renderInvSlot(inventoryRef, inventoryRef.slots[i], i - 6));
    }
  }
  const hotbarGrid = furnacePanelEl.querySelector("#furnaceHotbarGrid");
  if (hotbarGrid) {
    hotbarGrid.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      // ✅ Hotbar slots use type "hotbar" for swapItems
      const slotDiv = renderInvSlot(inventoryRef, inventoryRef.slots[i], i);
      // Override drag data type to "hotbar" for correct swap
      slotDiv.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({ type: "hotbar", index: i }));
      });
      hotbarGrid.appendChild(slotDiv);
    }
  }
}

export function closeFurnaceUI() {
  isFurnaceOpen = false;
  activeFurnace = null;
  if (furnacePanelEl) furnacePanelEl.classList.remove("open");
  // ✅ Показываем хотбар обратно
  const hb = document.getElementById("hotbar");
  if (hb) hb.style.display = '';
  document.body.requestPointerLock();
}

export function isFurnaceMenuOpen() { return isFurnaceOpen; }

// ✅ Обновление UI каждый кадр (если открыто) — для прогресса
export function tickFurnaceUI() {
  if (isFurnaceOpen && activeFurnace) renderFurnaceUI();
}
