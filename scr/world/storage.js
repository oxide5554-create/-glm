import * as THREE from "three";
import { ITEMS } from "../ui/hotbar.js";

export function buildStorageChestModel() {
  const parts = [];
  const mat = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.05, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.6), mat(0x6a4a2c));
  body.position.y = 0.275; parts.push(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.64), mat(0x7a5a3c));
  lid.position.y = 0.61; parts.push(lid);
  for (const dz of [-0.2, 0, 0.2]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.06, 0.04), mat(0x4a4e52, 0.6));
    strip.position.set(0, 0.35, dz); parts.push(strip);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), mat(0x8a8e93, 0.5));
  lock.position.set(0, 0.5, 0.32); parts.push(lock);
  for (const sx of [-0.38, 0.38]) for (const sz of [-0.24, 0.24]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), mat(0x3a3a3a, 0.7));
    leg.position.set(sx, 0.04, sz); parts.push(leg);
  }
  const g = new THREE.Group();
  for (const m of parts) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

export function buildStorageGhost() {
  const model = buildStorageChestModel();
  model.traverse(c => {
    if (c.isMesh) {
      c.material = new THREE.MeshBasicMaterial({ color: 0x39d353, transparent: true, opacity: 0.5, depthWrite: false });
      c.castShadow = false;
    }
  });
  return model;
}

export function createStorageWorld(scene, getHeight, buildingSystem) {
  const group = new THREE.Group();
  group.name = "storageChests";
  scene.add(group);
  const chests = [];
  let ghost = null, ghostActive = false, pendingPos = null, valid = false;

  function showGhost() {
    if (!ghost) { ghost = buildStorageGhost(); ghost.visible = false; scene.add(ghost); }
    ghostActive = true; ghost.visible = true;
  }
  function hideGhost() {
    ghostActive = false;
    if (ghost) ghost.visible = false;
    pendingPos = null; valid = false;
  }
  function isGhostActive() { return ghostActive; }

  // ✅ ИСПРАВЛЕНО: правильный расчёт высоты для установки на фундамент/потолок
  function updateGhost(ray, targets) {
    if (!ghostActive) return;
    const hits = ray.intersectObjects(targets, true);
    if (hits.length && hits[0].distance < 8) {
      const p = hits[0].point;
      let surfaceY = getHeight(p.x, p.z);
      
      // Проверяем, попали ли мы на фундамент или потолок
      if (buildingSystem) {
        for (const piece of buildingSystem.pieces.values()) {
          if (piece.part === 'foundation') {
            const fx = (piece.i + 0.5) * 3.0;
            const fz = (piece.k + 0.5) * 3.0;
            const dx = p.x - fx;
            const dz = p.z - fz;
            if (Math.abs(dx) < 1.5 && Math.abs(dz) < 1.5) {
              // Верх фундамента
              surfaceY = piece.y;
              break;
            }
          } else if (piece.part === 'ceiling') {
            const cx = (piece.i + 0.5) * 3.0;
            const cz = (piece.k + 0.5) * 3.0;
            const dx = p.x - cx;
            const dz = p.z - cz;
            if (Math.abs(dx) < 1.5 && Math.abs(dz) < 1.5) {
              // Низ потолка
              const baseY = piece.baseY || 0;
              surfaceY = baseY + 2.8 - 0.15;
              break;
            }
          }
        }
      }
      
      // Позиция сундука: его центр на 0.275 выше поверхности (половина высоты корпуса)
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
    // ✅ НОВОЕ: проверка перекрытия со стенами — по позиции ПРИЗРАКА (не камеры).
    //    Раньше проверялось по camera.position — призрак мог быть у стены,
    //    и половина сундука проходила сквозь стену.
    if (buildingSystem && buildingSystem.colliders) {
      const r = 0.55;   // радиус сундука
      for (const c of buildingSystem.colliders) {
        if (c.on === false) continue;
        if (c.step) continue;   // фундаменты — можно ставить НА них
        if (pendingPos.x + r > c.minX && pendingPos.x - r < c.maxX &&
            pendingPos.z + r > c.minZ && pendingPos.z - r < c.maxZ) {
          return null;   // перекрывает стену — нельзя ставить
        }
      }
    }
    const id = `chest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const model = buildStorageChestModel();
    model.position.copy(pendingPos);
    group.add(model);
    const chest = { 
      id, mesh: model, position: pendingPos.clone(), 
      slots: new Array(18).fill(null), owner: null,   // ✅ 18 слотов (3 ряда) — как инвентарь
      hp: 100, maxHp: 100 
    };
    chests.push(chest);
    hideGhost();
    return chest;
  }

  function addRemoteChest(data) {
    if (!data || !data.id) return;
    const existing = chests.find(c => c.id === data.id);
    if (existing) { 
      existing.slots = data.slots || existing.slots; 
      if (data.hp != null) existing.hp = data.hp;
      if (data.maxHp != null) existing.maxHp = data.maxHp;
      return; 
    }
    const model = buildStorageChestModel();
    model.position.set(data.x, data.y, data.z);
    group.add(model);
    chests.push({ 
      id: data.id, mesh: model, 
      position: new THREE.Vector3(data.x, data.y, data.z), 
      slots: data.slots || new Array(24).fill(null), 
      owner: data.owner, 
      hp: data.hp || 100, maxHp: data.maxHp || 100 
    });
  }

  function removeChest(id) {
    const idx = chests.findIndex(c => c.id === id);
    if (idx >= 0) { group.remove(chests[idx].mesh); chests.splice(idx, 1); }
  }

  function updateChestSlots(id, slots) {
    const c = chests.find(ch => ch.id === id);
    if (c) c.slots = slots;
    if (isStorageOpen && activeChestData && activeChestData.id === id) {
      activeChestData.slots = slots;
      renderStorageUI();
    }
  }

  function updateHp(id, hp, maxHp) {
    const c = chests.find(ch => ch.id === id);
    if (c) {
      c.hp = hp;
      if (maxHp != null) c.maxHp = maxHp;
      if (c.mesh) {
        const ratio = hp / (c.maxHp || 100);
        c.mesh.traverse(o => {
          if (o.isMesh && o.material && o.material.color) {
            if (!o.userData.origColor) o.userData.origColor = o.material.color.clone();
            o.material.color.copy(o.userData.origColor).lerp(new THREE.Color(0x3a1a0a), (1 - ratio) * 0.6);
          }
        });
      }
    }
  }

  function tryInteract(ray, maxDist = 3.5) {
    for (const c of chests) {
      const hits = ray.intersectObject(c.mesh, true);
      if (hits.length && hits[0].distance <= maxDist) {
        // ✅ НОВОЕ: проверка — не открывать сквозь стены.
        //    Если стена ближе чем сундук — блокируем взаимодействие.
        if (buildingSystem && buildingSystem.group) {
          const wallHits = ray.intersectObjects(buildingSystem.group.children, true);
          if (wallHits.length && wallHits[0].distance < hits[0].distance - 0.1) {
            return null;   // стена между игроком и сундуком
          }
        }
        return c;
      }
    }
    return null;
  }

  function update(dt) { }

  return {
    showGhost, hideGhost, isGhostActive, updateGhost, tryPlace,
    addRemoteChest, removeChest, updateChestSlots, updateHp, tryInteract, update,
    get chests() { return chests; }
  };
}

/* ── UI ─ */
const CSS_ID = "storage-menu-style";
const CSS = `
.storage-overlay{position:fixed;inset:0;z-index:65;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);pointer-events:none;opacity:0;visibility:hidden;transition:opacity .15s}
.storage-overlay.open{opacity:1;visibility:visible;pointer-events:auto}
.storage-panel{position:relative;display:flex;gap:16px;background:#2b2b2b;border:1px solid #1a1a1a;border-radius:2px;padding:12px;box-shadow:0 8px 32px rgba(0,0,0,.85);user-select:none;min-width:380px}
.storage-close-btn{position:absolute;top:6px;right:8px;width:28px;height:28px;border:0;border-radius:2px;background:#4a4a4a;color:#fff;font-size:16px;cursor:pointer}
.storage-close-btn:hover{background:#c0392b}
.storage-col{display:flex;flex-direction:column}
.storage-title{color:#d0d0d0;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #1a1a1a}
.storage-grid{display:grid;grid-template-columns:repeat(6,52px);gap:3px;background:#1e1e1e;padding:8px;border-radius:2px;border:1px solid #111}
.storage-slot{width:52px;height:52px;background:#3a3a3a;border:1px solid #1a1a1a;border-radius:2px;position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer}
.storage-slot:hover{background:#454545;border-color:#555}
.storage-slot img{width:40px;height:40px;object-fit:contain;pointer-events:none;user-select:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
.storage-slot .count{position:absolute;right:3px;bottom:1px;color:#fff;text-shadow:1px 1px 0 #000;font-size:11px;font-weight:800;pointer-events:none;z-index:5}
.storage-close-hint{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.4);font-size:10px;letter-spacing:.1em;pointer-events:none}
`;

let storagePanelEl = null, storageGridEl = null, invGridEl2 = null, hotbarGridEl2 = null;
let activeChestData = null, playerInv = null, isStorageOpen = false;
let lastOpenTime = 0;  // ✅ timestamp последнего openStorageMenu — для защиты от
                       //    немедленного закрытия на том же keydown event'е
let dragData2 = null, dragGhost2 = null;

function ensurePanel() {
  if (storagePanelEl) return;
  if (!document.getElementById(CSS_ID)) {
    const st = document.createElement("style"); st.id = CSS_ID; st.textContent = CSS;
    document.head.appendChild(st);
  }
  storagePanelEl = document.createElement("div");
  storagePanelEl.className = "storage-overlay";
  storagePanelEl.innerHTML = `<div class="storage-panel">
    <button class="storage-close-btn" id="storageCloseBtn">X</button>
    <div class="storage-col">
      <div class="storage-title">СУНДУК</div>
      <div class="storage-grid" id="storageChestGrid"></div>
    </div>
    <div class="storage-col">
      <div class="storage-title">ИНВЕНТАРЬ</div>
      <div class="storage-grid" id="storageInvGrid"></div>
      <div class="storage-title" style="margin-top:8px">HOTBAR</div>
      <div class="storage-grid" id="storageHotbarGrid"></div>
    </div>
  </div>
  <div class="storage-close-hint">F / ESC — закрыть</div>`;
  document.body.appendChild(storagePanelEl);
  storageGridEl = storagePanelEl.querySelector("#storageChestGrid");
  invGridEl2 = storagePanelEl.querySelector("#storageInvGrid");
  hotbarGridEl2 = storagePanelEl.querySelector("#storageHotbarGrid");
  storagePanelEl.querySelector("#storageCloseBtn").addEventListener("click", () => closeStorageMenu());
}

function renderSlotS(container, item, index, source) {
  const el = document.createElement("div");
  el.className = "storage-slot";
  el.dataset.index = index;
  el.dataset.source = source;
  if (item) {
    // ✅ ИСПРАВЛЕНО: поддерживаем ОБЕ структуры слотов:
    //    chest:  { id: 'wood', count: 50 }
    //    inv:    { item: ITEMS.wood, count: 50 }
    const itemId = item.id || (item.item && item.item.id);
    const count = item.count || 0;
    const def = itemId ? ITEMS[itemId] : null;
    if (def && def.icon) {
      const img = document.createElement("img");
      img.src = def.icon; img.draggable = false;
      el.appendChild(img);
    }
    if (count > 1) {
      const c = document.createElement("div");
      c.className = "count"; c.textContent = count;
      el.appendChild(c);
    }
    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragData2 = { source, index };
      dragGhost2 = el.cloneNode(true);
      dragGhost2.style.cssText = "position:fixed;pointer-events:none;z-index:9999;opacity:0.9;transform:translate(-50%,-50%);width:52px;height:52px;";
      dragGhost2.style.left = e.clientX + "px";
      dragGhost2.style.top = e.clientY + "px";
      document.body.appendChild(dragGhost2);
    });
  }
  container.appendChild(el);
}

function renderStorageUI() {
  if (!activeChestData || !playerInv) return;
  storageGridEl.innerHTML = "";
  invGridEl2.innerHTML = "";
  if (hotbarGridEl2) hotbarGridEl2.innerHTML = "";
  // ✅ Сундук: 18 слотов (3 ряда) — как инвентарь
  for (let i = 0; i < 18; i++) renderSlotS(storageGridEl, activeChestData.slots[i], i, "chest");
  // ✅ Инвентарь: слоты 6..23 (18 слотов, 3 ряда)
  for (let i = 0; i < 18; i++) {
    const invSlotIndex = 6 + i;
    renderSlotS(invGridEl2, playerInv.slots[invSlotIndex], invSlotIndex, "inv");
  }
  // ✅ HOTBAR: слоты 0..5 (6 слотов, 1 ряд) — в отдельной секции
  if (hotbarGridEl2) {
    for (let i = 0; i < 6; i++) {
      renderSlotS(hotbarGridEl2, playerInv.slots[i], i, "hotbar");
    }
  }
}

window.addEventListener("mousemove", (e) => {
  if (dragData2 && dragGhost2) {
    dragGhost2.style.left = e.clientX + "px";
    dragGhost2.style.top = e.clientY + "px";
  }
});

window.addEventListener("mouseup", (e) => {
  if (!dragData2) return;
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const slotEl = target?.closest(".storage-slot");
  if (slotEl && activeChestData && playerInv) {
    const targetIndex = parseInt(slotEl.dataset.index);
    const targetSource = slotEl.dataset.source;
    if (targetSource !== dragData2.source) {
      // Определяем массивы
const getArr = (src, idx) => {
    if (src === "chest") return { arr: activeChestData.slots, idx };
    // ✅ ИСПРАВЛЕНО: idx УЖЕ является правильным глобальным индексом (0-5 для хотбара, 6-23 для инвентаря)
    return { arr: playerInv.slots, idx }; 

      };
      const from = getArr(dragData2.source, dragData2.index);
      const to = getArr(targetSource, targetIndex);
      
      const item = from.arr[from.idx];
      if (item) {
        // ✅ ИСПРАВЛЕНО: извлекаем id из ОБЕИХ структур слотов
        //    chest: { id, count }   inv: { item: ITEMS.xxx, count }
        const itemId = item.id || (item.item && item.item.id);
        if (!itemId) { dragData2 = null; if (dragGhost2) { dragGhost2.remove(); dragGhost2 = null; } return; }
        const stack = (ITEMS[itemId]?.stack) || 64;
        const existing = to.arr[to.idx];
        const existingId = existing ? (existing.id || (existing.item && existing.item.id)) : null;
        if (!existing || (existingId === itemId && (existing.count || 0) < stack)) {
          const canMove = Math.min(item.count, stack - (existing?.count || 0));
          if (canMove > 0) {
            if (existing) {
              existing.count += canMove;
            } else {
              // ✅ При создании нового слота в сундуке — используем { id, count }
              //    При создании в инвентаре — используем { item, count }
              if (targetSource === "chest") {
                to.arr[to.idx] = { id: itemId, count: canMove };
              } else {
                to.arr[to.idx] = { item: ITEMS[itemId], count: canMove };
              }
            }
            item.count -= canMove;
            if (item.count <= 0) from.arr[from.idx] = null;
            
            if (window.__net?.connected) {
              window.__net.send({ t: 'sync', type: "storage_update", data: { chestId: activeChestData.id, slots: activeChestData.slots } });
              if (window.__inventoryRef) {
                window.__net.send({ t: 'sync', type: "inventory_update", data: { inventory: window.__inventoryRef.slots } });
              }
            }
            renderStorageUI();
            // ✅ НОВОЕ: обновляем инвентарь и хотбар после перемещения
            if (playerInv && playerInv.isOpen) playerInv.render();
            if (playerInv && playerInv.hotbar) playerInv.hotbar.render();
            if (window.hudRef) window.hudRef.updateInventoryUI(playerInv);
          }
        }
      }
    }
  }
  dragData2 = null;
  if (dragGhost2) { dragGhost2.remove(); dragGhost2 = null; }
});

// ✅ ИСПРАВЛЕНО: принимаем inventory напрямую
export function openStorageMenu(chestData, inventory) {
  ensurePanel();
  activeChestData = chestData;
  playerInv = inventory; // ✅ inventory — это объект Inventory из inventory.js
  isStorageOpen = true;
  window.__isStorageOpen = true;
  lastOpenTime = performance.now();  // ✅ запоминаем когда открыли
  renderStorageUI();
  storagePanelEl.classList.add("open");
  if (document.pointerLockElement) document.exitPointerLock();
  // ✅ Скрываем хотбар пока открыт сундук
  const hb = document.getElementById('hotbar');
  if (hb) hb.style.display = 'none';
  // ✅ Регистрируем key handler для закрытия по Esc/F (как в crateUI.js).
  //    Раньше подсказка "F / ESC — закрыть" показывалась, но Esc/F НЕ работали —
  //    можно было закрыть только кнопкой ✕. Теперь ключи работают.
  if (!window.__storageKeyHandler) {
    window.__storageKeyHandler = (e) => {
      if (!isStorageOpen) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        closeStorageMenu();
      } else if (e.code === 'KeyF') {
        // ✅ Защита от закрытия на том же keypress, которым сундук открыли.
        //    main.js вызывает openStorageMenu на F → isStorageOpen=true →
        //    тот же keydown проходит к этому handler'у и сразу бы закрыл сундук.
        //    main.js останавливает диспетчеризацию через stopImmediatePropagation,
        //    но это запасная защита — если по какой-то причине stopImmediatePropagation
        //    не сработал, игнорируем F в первые 300мс после открытия.
        if (performance.now() - lastOpenTime < 300) return;
        e.preventDefault();
        closeStorageMenu();
      }
    };
    window.addEventListener('keydown', window.__storageKeyHandler);
  }
}

export function closeStorageMenu() {
  if (!isStorageOpen) return;
  isStorageOpen = false;
  window.__isStorageOpen = false;
  activeChestData = null;
  if (storagePanelEl) storagePanelEl.classList.remove("open");
  dragData2 = null;
  if (dragGhost2) { dragGhost2.remove(); dragGhost2 = null; }
  // ✅ Показываем хотбар обратно
  const hb = document.getElementById('hotbar');
  if (hb) hb.style.display = '';
  // ✅ Восстанавливаем pointer lock — иначе после закрытия сундука курсор
  //    остаётся свободным и игрок не может продолжить игру без лишнего клика.
  //    Helper проверит, что других меню нет, и безопасно вызовет controls.lock().
  if (typeof window.__requestPointerLock === 'function') {
    // ✅ Задержка 100мс — браузер требует паузу после exitPointerLock
    setTimeout(() => {
      if (!isStorageOpen) window.__requestPointerLock();
    }, 100);
  }
}

export function isStorageMenuOpen() { return isStorageOpen; }
export function getActiveChestData() { return activeChestData; }
