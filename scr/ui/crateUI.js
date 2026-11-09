// scr/ui/crateUI.js
// ✅ Split-panel UI для ящиков. Слева ящик, справа инвентарь.
//    Можно открывать сколько угодно раз. Пустой ящик остаётся.

import { ITEMS } from './hotbar.js';

const CSS_ID = "crate-ui-style";
const CSS = `
.crate-overlay{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);pointer-events:none;opacity:0;visibility:hidden;transition:opacity .15s}
.crate-overlay.open{opacity:1;visibility:visible;pointer-events:auto}
.crate-panel{position:relative;display:flex;gap:14px;background:#2b2b2b;border:1px solid #1a1a1a;border-radius:2px;padding:12px 14px;box-shadow:0 8px 32px rgba(0,0,0,.85);user-select:none;min-width:380px}
.crate-close-btn{position:absolute;top:6px;right:8px;width:26px;height:26px;border:0;border-radius:2px;background:#4a4a4a;color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.crate-close-btn:hover{background:#c0392b}
.crate-col{display:flex;flex-direction:column}
.crate-title{color:#d0d0d0;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #1a1a1a;white-space:nowrap}
.crate-grid{display:grid;grid-template-columns:repeat(6,50px);gap:3px;background:#1e1e1e;padding:8px;border-radius:2px;border:1px solid #111}
.crate-slot{width:50px;height:50px;background:#3a3a3a;border:1px solid #1a1a1a;border-radius:2px;position:relative;cursor:pointer;overflow:hidden}
.crate-slot:hover{background:#454545;border-color:#555}
.crate-slot.drag-from{opacity:0.4}
.crate-slot .slot-icon{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:26px;height:26px;display:flex;align-items:center;justify-content:center;pointer-events:none;user-select:none}
.crate-slot .slot-icon img{width:26px;height:26px;object-fit:contain;pointer-events:none}
.crate-slot .slot-icon .emoji{font-size:20px;line-height:1}
.crate-slot .count{position:absolute;right:3px;bottom:1px;color:#fff;text-shadow:1px 1px 0 #000;font-size:11px;font-weight:800;pointer-events:none}
.crate-close-hint{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.45);font-size:10px;letter-spacing:.1em;pointer-events:none}
.crate-ghost{position:fixed;pointer-events:none;z-index:9999;opacity:0.85;transform:translate(-50%,-50%);width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:20px}
.crate-ghost img{width:26px;height:26px;object-fit:contain}
`;

let panelEl = null, crateGridEl = null, invGridEl = null, hotbarGridEl = null;
let activeCrate = null, playerInv = null, isOpen = false;
let lastOpenTime = 0;  // ✅ timestamp последнего openCrateUI — для защиты от
                       //    немедленного закрытия на том же keydown event'е
let dragData = null, dragGhost = null;

function ensurePanel() {
  if (panelEl) return;
  if (!document.getElementById(CSS_ID)) {
    const st = document.createElement("style"); st.id = CSS_ID; st.textContent = CSS;
    document.head.appendChild(st);
  }
  panelEl = document.createElement("div");
  panelEl.className = "crate-overlay";
  panelEl.innerHTML = `<div class="crate-panel">
    <button class="crate-close-btn" id="crateCloseBtn">X</button>
    <div class="crate-col">
      <div class="crate-title" id="crateTitle">ЯЩИК</div>
      <div class="crate-grid" id="crateCrateGrid"></div>
    </div>
    <div class="crate-col">
      <div class="crate-title">ИНВЕНТАРЬ</div>
      <div class="crate-grid" id="crateInvGrid"></div>
      <div class="crate-title" style="margin-top:8px">HOTBAR</div>
      <div class="crate-grid" id="crateHotbarGrid"></div>
    </div>
  </div>
  <div class="crate-close-hint">F / ESC — закрыть</div>`;
  document.body.appendChild(panelEl);
  crateGridEl = panelEl.querySelector("#crateCrateGrid");
  invGridEl = panelEl.querySelector("#crateInvGrid");
  hotbarGridEl = panelEl.querySelector("#crateHotbarGrid");
  panelEl.querySelector("#crateCloseBtn").addEventListener("click", () => closeCrateUI());
  panelEl.addEventListener("mousedown", (e) => {
    if (e.target === panelEl) closeCrateUI();
  });
}

function lootToSlots(loot, size) {
  const slots = new Array(size).fill(null);
  if (!loot) return slots;
  for (let i = 0; i < Math.min(loot.length, size); i++) {
    if (loot[i] && loot[i].id) {
      slots[i] = { id: loot[i].id, count: loot[i].count || 1 };
    }
  }
  return slots;
}

function slotsToLoot(slots) {
  const loot = [];
  for (const s of slots) {
    if (s && s.id && s.count > 0) loot.push({ id: s.id, count: s.count });
  }
  return loot;
}

function crateSize(crate) {
  if (!crate) return 12;
  if (crate.type === 'military') return 18;
  if (crate.type === 'tool' || crate.type === 'toolbox') return 6;
  return 12;
}

function crateTitle(crate) {
  if (!crate) return 'ЯЩИК';
  if (crate.type === 'military') return 'ВОЕННЫЙ ЯЩИК';
  if (crate.type === 'tool' || crate.type === 'toolbox') return 'ИНСТРУМЕНТАЛЬНЫЙ ЯЩИК';
  return 'ДЕРЕВЯННЫЙ ЯЩИК';
}

function makeIconHTML(itemId) {
  const def = ITEMS[itemId];
  if (!def) return '';
  if (def.icon && typeof def.icon === 'string' && def.icon.includes('.')) {
    return `<img src="${def.icon}" alt="" draggable="false">`;
  }
  // ✅ Используем иконку (img) если есть, иначе ничего
  if (def.icon) {
    return `<img src="${def.icon}" style="width:100%;height:100%;object-fit:contain" onerror="this.style.display='none'">`;
  }
  return '';
}

function renderSlotC(container, slot, index, source) {
  const el = document.createElement("div");
  el.className = "crate-slot";
  el.dataset.index = index;
  el.dataset.source = source;
  if (slot && slot.id) {
    const iconWrap = document.createElement("div");
    iconWrap.className = "slot-icon";
    iconWrap.innerHTML = makeIconHTML(slot.id);
    el.appendChild(iconWrap);
    if (slot.count > 1) {
      const c = document.createElement("div");
      c.className = "count"; c.textContent = slot.count;
      el.appendChild(c);
    }
    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragData = { source, index };
      el.classList.add("drag-from");
      dragGhost = document.createElement("div");
      dragGhost.className = "crate-ghost";
      dragGhost.innerHTML = makeIconHTML(slot.id);
      dragGhost.style.left = e.clientX + "px";
      dragGhost.style.top = e.clientY + "px";
      document.body.appendChild(dragGhost);
    });
  }
  container.appendChild(el);
}

function renderCrateUI() {
  if (!activeCrate || !playerInv) return;
  const size = crateSize(activeCrate);
  activeCrate._slots = lootToSlots(activeCrate.loot, size);
  crateGridEl.innerHTML = "";
  invGridEl.innerHTML = "";
  if (hotbarGridEl) hotbarGridEl.innerHTML = "";
  for (let i = 0; i < size; i++) {
    renderSlotC(crateGridEl, activeCrate._slots[i], i, "crate");
  }
  for (let i = 0; i < 18; i++) {
    const invIdx = 6 + i;
    const s = playerInv.slots[invIdx];
    renderSlotC(invGridEl, s ? { id: s.item.id, count: s.count } : null, invIdx, "inv");
  }
  // ✅ НОВОЕ: HOTBAR — слоты 0..5 в отдельной секции
  if (hotbarGridEl) {
    for (let i = 0; i < 6; i++) {
      const s = playerInv.slots[i];
      renderSlotC(hotbarGridEl, s ? { id: s.item.id, count: s.count } : null, i, "hotbar");
    }
  }
}

window.addEventListener("mousemove", (e) => {
  if (dragData && dragGhost) {
    dragGhost.style.left = e.clientX + "px";
    dragGhost.style.top = e.clientY + "px";
  }
});

window.addEventListener("mouseup", (e) => {
  if (!dragData) return;
  document.querySelectorAll('.crate-slot.drag-from').forEach(el => el.classList.remove('drag-from'));
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const slotEl = target?.closest(".crate-slot");
  if (slotEl && activeCrate && playerInv) {
    const targetIndex = parseInt(slotEl.dataset.index);
    const targetSource = slotEl.dataset.source;
    if (targetSource !== dragData.source || targetIndex !== dragData.index) {
      doMove(dragData, { source: targetSource, index: targetIndex });
    }
  }
  dragData = null;
  if (dragGhost) { dragGhost.remove(); dragGhost = null; }
});

function doMove(from, to) {
  const fromArr = getArr(from.source);
  const toArr = getArr(to.source);
  if (!fromArr || !toArr) return;
  const fromItem = fromArr[from.index];
  if (!fromItem) return;
  const toItem = toArr[to.index];
  const def = ITEMS[fromItem.id];
  const stack = def?.stack || 64;
  if (toItem && toItem.id === fromItem.id) {
    const canMove = Math.min(fromItem.count, stack - toItem.count);
    if (canMove <= 0) return;
    toItem.count += canMove;
    fromItem.count -= canMove;
    if (fromItem.count <= 0) fromArr[from.index] = null;
  } else if (!toItem) {
    toArr[to.index] = { id: fromItem.id, count: fromItem.count };
    fromArr[from.index] = null;
  } else {
    toArr[to.index] = fromItem;
    fromArr[from.index] = toItem;
  }
  syncToInventory();
  activeCrate.loot = slotsToLoot(activeCrate._slots);
  renderCrateUI();
}

function getArr(source) {
  if (source === "crate") return activeCrate._slots;
  if (!playerInv._crateBuf) playerInv._crateBuf = new Array(playerInv.slots.length).fill(null);
  return playerInv._crateBuf;
}

function syncToInventory() {
  if (!playerInv._crateBuf) return;
  for (let i = 0; i < playerInv.slots.length; i++) {
    const buf = playerInv._crateBuf[i];
    if (buf === null) {
      if (i >= 6) playerInv.slots[i] = null;
    } else if (buf) {
      const def = ITEMS[buf.id];
      if (def) {
        if (i >= 6) playerInv.slots[i] = { item: def, count: buf.count };
      }
    }
  }
  if (playerInv.hotbar) playerInv.hotbar.render();
}

function fillInvBuf() {
  playerInv._crateBuf = new Array(playerInv.slots.length).fill(null);
  // ✅ ИЗМЕНЕНО: заполняем ВСЕ слоты (0-5 хотбар + 6+ инвентарь)
  //    Раньше только 6+ — хотбар не работал в drag-and-drop.
  for (let i = 0; i < playerInv.slots.length; i++) {
    const s = playerInv.slots[i];
    if (s && s.item) {
      playerInv._crateBuf[i] = { id: s.item.id, count: s.count };
    }
  }
}

export function openCrateUI(crate, inventory, callbacks = {}) {
  ensurePanel();
  activeCrate = crate;
  playerInv = inventory;
  fillInvBuf();
  panelEl.querySelector("#crateTitle").textContent = crateTitle(crate);
  // ✅ Сбрасываем _slots — перечитываем loot (можно открывать много раз!)
  crate._slots = null;
  isOpen = true;
  window.__isCrateOpen = true;
  lastOpenTime = performance.now();  // ✅ запоминаем когда открыли
  renderCrateUI();
  panelEl.classList.add("open");
  if (document.pointerLockElement) document.exitPointerLock();
  // ✅ Скрываем хотбар и overlay
  const hb = document.getElementById('hotbar');
  if (hb) hb.style.display = 'none';
  const ov = document.getElementById('overlay');
  if (ov) ov.style.display = 'none';
  if (!window.__crateKeyHandler) {
    window.__crateKeyHandler = (e) => {
      if (!isOpen) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        closeCrateUI();
      } else if (e.code === 'KeyF') {
        // ✅ Защита от закрытия на том же keypress, которым ящик открыли.
        //    main.js вызывает openCrateUI на F → isOpen становится true →
        //    тот же keydown проходит к этому handler'у и сразу бы закрыл ящик.
        //    main.js останавливает диспетчеризацию через stopImmediatePropagation,
        //    но это запасная защита (defence in depth) — если по какой-то
        //    причине stopImmediatePropagation не сработал (старый браузер,
        //    capture-фаза и т.п.), игнорируем F в первые 300мс после открытия.
        if (performance.now() - lastOpenTime < 300) return;
        e.preventDefault();
        closeCrateUI();
      }
    };
    window.addEventListener('keydown', window.__crateKeyHandler);
  }
}

export function closeCrateUI() {
  if (!isOpen) return;
  syncToInventory();
  if (activeCrate && activeCrate._slots) {
    activeCrate.loot = slotsToLoot(activeCrate._slots);
    // ✅ Ящик НЕ помечаем как opened — можно открыть снова
  }
  isOpen = false;
  window.__isCrateOpen = false;
  activeCrate = null;
  if (panelEl) panelEl.classList.remove("open");
  dragData = null;
  if (dragGhost) { dragGhost.remove(); dragGhost = null; }
  const hb = document.getElementById('hotbar');
  if (hb) hb.style.display = '';
  // ✅ Восстанавливаем pointer lock после закрытия меню ящика.
  //    Раньше тут был комментарий "не вызываем requestPointerLock" —
  //    но это и был баг: после закрытия ящика курсор оставался свободным,
  //    overlay НЕ показывался (т.к. в 'unlock' handler мы подавляем его
  //    когда меню открыто), и игрок не мог вернуться в игру без лишнего клика.
  //    Helper проверит, что других меню нет, и безопасно вызовет controls.lock().
  if (typeof window.__requestPointerLock === 'function') {
    window.__requestPointerLock();
  }
}

export function isCrateUIOpen() { return isOpen; }
export function getActiveCrate() { return activeCrate; }
