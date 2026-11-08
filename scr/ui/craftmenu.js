// scr/ui/craftmenu.js
// ✅ Список рецептов: крафт АК-47 и берданки (с компонентами из ящиков).
//    Компоненты: корпус винтовки/берданки, пружина, труба, МВК, металл, скрап.
//    Формат рецепта:
// { id, cat, icon, name, cost, time, count, desc }

import { ITEMS } from './hotbar.js';

// ✅ РЕЦЕПТЫ
export const RECIPES = [
  {
    id: 'ak47', cat: 'weapons',
    icon: ITEMS.ak47.icon,
    name: 'АК-47',
    desc: 'Автомат Калашникова. Надёжный, мощный, автоогонь. Нужен корпус винтовки, трубы, МВК и пружины.',
    cost: { rifleBody: 1, pipe: 3, mvc: 15, spring: 2 },
    time: 30, count: 1,
  },
  {
    id: 'berdana', cat: 'weapons',
    icon: ITEMS.berdana.icon,
    name: 'Берданка',
    desc: 'Старая охотничья винтовка. Одиночные выстрелы, но мощнее АК. Нужен корпус берданки, скрап, трубы и пружина.',
    cost: { scrap: 25, berdanaBody: 1, pipe: 2, spring: 1 },
    time: 20, count: 1,
  },
];

// Категории
const CATS = [
  { id: "all", icon: "✚", name: "Все" },
  { id: "weapons", icon: "🔫", name: "Оружие" },
  { id: "tools", icon: "⛏", name: "Инструменты" },
  { id: "construction", icon: "🔨", name: "Строительство" },
  { id: "resources", icon: "🌲", name: "Ресурсы" }
];

export function createCraftMenu(root, inventory, callbacks = {}) {
  if (!document.getElementById("craft-style")) {
    const st = document.createElement("style"); st.id = "craft-style";
    st.textContent = `
.cm-panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(800px, 95vw); height: min(500px, 85vh); display: flex; background: rgba(20, 20, 20, 0.96); border: 2px solid #333; border-radius: 6px; pointer-events: auto; opacity: 0; visibility: hidden; transition: opacity .15s, visibility .15s; box-shadow: 0 20px 60px rgba(0,0,0,.8); overflow: hidden; color: #e0e0e0; font-family: 'Segoe UI', Arial, sans-serif; z-index: 100; }
.cm-panel.open { opacity: 1; visibility: visible; }
.cm-close { position: absolute; top: 10px; right: 10px; z-index: 5; width: 32px; height: 32px; border: 1px solid #444; background: #2a2a2a; color: #aaa; font-size: 18px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.cm-close:hover { background: #c03020; color: #fff; border-color: #c03020; }
.cm-cats { width: 60px; background: #151515; display: flex; flex-direction: column; align-items: center; padding: 12px 0; gap: 8px; border-right: 1px solid #333; }
.cm-cat { width: 40px; height: 40px; border: 1px solid transparent; border-radius: 4px; background: #222; color: #888; font-size: 18px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .1s; }
.cm-cat:hover { background: #333; color: #fff; }
.cm-cat.sel { border-color: #666; background: #3a3a3a; color: #fff; }
.cm-grid { width: 240px; padding: 12px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; align-content: start; overflow-y: auto; background: #1a1a1a; border-right: 1px solid #333; }
.cm-grid::-webkit-scrollbar { width: 6px; }
.cm-grid::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
.cm-empty { grid-column: 1/-1; color: #666; font-size: 12px; padding: 20px; text-align: center; letter-spacing: .1em; text-transform: uppercase; line-height: 1.7; }
.cm-tile { position: relative; height: 80px; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all .1s; }
.cm-tile:hover { border-color: #666; background: #333; }
.cm-tile.sel { border-color: #888; background: #3a3a3a; box-shadow: 0 0 0 1px #555 inset; }
.cm-tile .cm-icon { width: 48px; height: 48px; margin-bottom: 4px; object-fit: contain; font-size: 36px; display: flex; align-items: center; justify-content: center; }
.cm-tile .cm-icon img { width: 48px; height: 48px; object-fit: contain; }
.cm-tile .cm-tname { font-size: 10px; color: #aaa; text-align: center; padding: 0 4px; line-height: 1.2; }
.cm-right { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #1e1e1e; }
.cm-details { flex: 1; padding: 20px; overflow-y: auto; }
.cm-head { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 16px; border-bottom: 1px solid #333; padding-bottom: 16px; }
.cm-name { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 6px; }
.cm-desc { font-size: 13px; line-height: 1.5; color: #999; max-width: 400px; }
.cm-time { font-size: 12px; font-weight: 600; color: #777; margin-bottom: 16px; display: flex; align-items: center; gap: 6px; }
.cm-bigicon { width: 70px; height: 70px; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 48px; }
.cm-bigicon img { width: 60px; height: 60px; object-fit: contain; }
.cm-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
.cm-table th { background: #252525; color: #aaa; text-align: left; padding: 8px 12px; font-weight: 600; border-bottom: 1px solid #333; }
.cm-table td { background: #2a2a2a; border-bottom: 1px solid #333; padding: 8px 12px; color: #ccc; }
.cm-table td.bad { color: #e04040; font-weight: 600; }
.cm-td-item { display: flex; align-items: center; gap: 8px; }
.cm-td-item img { width: 24px; height: 24px; object-fit: contain; }
.cm-controls { display: flex; align-items: center; gap: 12px; justify-content: flex-end; margin-top: auto; }
.cm-qty { display: flex; align-items: center; border: 1px solid #444; border-radius: 4px; overflow: hidden; background: #222; }
.cm-qty button { width: 32px; height: 34px; border: 0; background: #333; color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; transition: background .1s; }
.cm-qty button:hover { background: #444; }
.cm-qtyval { min-width: 40px; text-align: center; font-weight: 700; font-size: 14px; color: #fff; }
.cm-create { padding: 10px 28px; border: 1px solid #444; background: #3a3a3a; color: #fff; font: inherit; font-size: 13px; font-weight: 700; letter-spacing: .1em; border-radius: 4px; cursor: pointer; transition: all .1s; }
.cm-create:hover:not(:disabled) { background: #4a4a4a; border-color: #666; }
.cm-create:disabled { opacity: 0.4; cursor: not-allowed; background: #2a2a2a; }
.cm-queue { height: 70px; background: #151515; border-top: 1px solid #333; position: relative; display: flex; align-items: center; padding: 0 16px; gap: 8px; }
.cm-queue-label { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); font-size: 11px; font-weight: 800; letter-spacing: .15em; color: #444; pointer-events: none; text-transform: uppercase; }
.cm-queue-items { display: flex; gap: 8px; align-items: center; height: 100%; padding: 10px 0; overflow-x: auto; flex: 1; }
.cm-qitem { position: relative; width: 50px; height: 50px; flex-shrink: 0; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 28px; }
.cm-qitem img { width: 36px; height: 36px; object-fit: contain; }
.cm-qbar { position: absolute; left: 2px; right: 2px; bottom: 2px; height: 4px; background: #111; border-radius: 2px; overflow: hidden; }
.cm-qfill { height: 100%; width: 0%; background: #6a6; transition: width 0.1s linear; }
.cm-qcount { position: absolute; top: 2px; right: 4px; font-size: 10px; font-weight: 800; color: #fff; text-shadow: 1px 1px 2px #000; }
`;
    document.head.appendChild(st);
  }

  const panel = document.createElement("div"); panel.className = "cm-panel";
  panel.innerHTML = `
    <button class="cm-close">✕</button>
    <div class="cm-cats"></div>
    <div class="cm-grid"></div>
    <div class="cm-right">
      <div class="cm-details">
        <div class="cm-head">
          <div>
            <div class="cm-name"></div>
            <div class="cm-desc"></div>
          </div>
          <div class="cm-bigicon"></div>
        </div>
        <div class="cm-time"></div>
        <table class="cm-table">
          <thead><tr><th>Требуется</th><th>Ресурс</th><th>Есть</th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="cm-controls">
          <div class="cm-qty">
            <button class="cm-minus">-</button>
            <span class="cm-qtyval">1</span>
            <button class="cm-plus">+</button>
          </div>
          <button class="cm-create">СОЗДАТЬ</button>
        </div>
      </div>
      <div class="cm-queue">
        <div class="cm-queue-label">Очередь крафта</div>
        <div class="cm-queue-items"></div>
      </div>
    </div>
  `;
  root.appendChild(panel);

  const catsEl = panel.querySelector(".cm-cats"), gridEl = panel.querySelector(".cm-grid");
  const nameEl = panel.querySelector(".cm-name"), descEl = panel.querySelector(".cm-desc");
  const timeEl = panel.querySelector(".cm-time"), bigEl = panel.querySelector(".cm-bigicon");
  const tbodyEl = panel.querySelector(".cm-table tbody"), qtyEl = panel.querySelector(".cm-qtyval");
  const createBtn = panel.querySelector(".cm-create"), qItemsEl = panel.querySelector(".cm-queue-items");

  let isOpen = false, cat = "all", selIdx = 0, qty = 1, queue = [], craftT = 0, qFillEl = null;

  function countItem(id) {
    let n = 0;
    for (const s of inventory.slots) {
      if (s && s.item && s.item.id === id) n += s.count;
    }
    return n;
  }

  function canAfford(r, n = 1) {
    for (const [res, c] of Object.entries(r.cost)) {
      if (countItem(res) < c * n) return false;
    }
    return true;
  }

  function deduct(r, n = 1) {
    for (const [res, c] of Object.entries(r.cost)) {
      inventory.removeItem(res, c * n);
    }
  }

  function renderCats() {
    catsEl.innerHTML = "";
    for (const c of CATS) {
      const b = document.createElement("button");
      b.className = "cm-cat" + (c.id === cat ? " sel" : "");
      b.title = c.name; b.textContent = c.icon;
      b.addEventListener("click", () => { cat = c.id; renderCats(); renderGrid(); renderDetails(); });
      catsEl.appendChild(b);
    }
  }

  function renderGrid() {
    gridEl.innerHTML = "";
    const list = RECIPES.map((r, i) => ({ r, i })).filter(o => cat === "all" || o.r.cat === cat);
    if (!list.length) {
      // ✅ Подсказка для будущего — что крафт пуст, потому что рецепты ещё не добавлены
      gridEl.innerHTML = '<div class="cm-empty">Список рецептов пуст.<br>Добавьте новые рецепты в <code>scr/ui/craftmenu.js</code>.<br>Оружие будет сделано с нуля.</div>';
      return;
    }
    if (!list.some(o => o.i === selIdx)) selIdx = list[0].i;
    for (const { r, i } of list) {
      const tile = document.createElement("div");
      tile.className = "cm-tile" + (i === selIdx ? " sel" : "");
      const isImg = typeof r.icon === 'string' && r.icon.includes('.');
      tile.innerHTML = `<div class="cm-icon">${isImg ? `<img src="${r.icon}" alt="">` : r.icon}</div>
      <div class="cm-tname">${r.name}</div>`;
      tile.addEventListener("click", () => { selIdx = i; qty = 1; renderGrid(); renderDetails(); });
      gridEl.appendChild(tile);
    }
  }

  function renderDetails() {
    const r = RECIPES[selIdx];
    if (!r) {
      nameEl.textContent = "—";
      descEl.textContent = "Выберите рецепт из списка слева.";
      timeEl.textContent = "";
      bigEl.innerHTML = "";
      tbodyEl.innerHTML = "";
      qtyEl.textContent = qty;
      createBtn.disabled = true;
      return;
    }
    nameEl.textContent = r.name;
    descEl.textContent = r.desc;
    timeEl.innerHTML = `⏱ ${r.time} сек. | Выдача: x${r.count}`;
    const isImg = typeof r.icon === 'string' && r.icon.includes('.');
    bigEl.innerHTML = isImg ? `<img src="${r.icon}" alt="">` : r.icon;
    tbodyEl.innerHTML = "";
    for (const [res, c] of Object.entries(r.cost)) {
      const need = c * qty, owned = countItem(res), bad = owned < need;
      const itemName = ITEMS[res]?.name || res;
      const itemIcon = ITEMS[res]?.icon || '';
      const isItemImg = typeof itemIcon === 'string' && itemIcon.includes('.');
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="${bad ? "bad" : ""}">${need}</td>
        <td><span class="cm-td-item">${isItemImg ? `<img src="${itemIcon}" alt="">` : (ITEMS[res]?.emoji || '')}${itemName}</span></td>
        <td class="${bad ? "bad" : ""}">${owned}</td>
      `;
      tbodyEl.appendChild(tr);
    }
    qtyEl.textContent = qty;
    createBtn.disabled = !canAfford(r, qty);
  }

  function renderQueue() {
    qItemsEl.innerHTML = "";
    qFillEl = null;
    if (!queue.length) return;
    let i = 0;
    while (i < queue.length) {
      const ri = queue[i];
      let n = 1;
      while (i + n < queue.length && queue[i + n] === ri) n++;
      const r = RECIPES[ri];
      const el = document.createElement("div");
      el.className = "cm-qitem";
      const isImg = typeof r.icon === 'string' && r.icon.includes('.');
      el.innerHTML = (isImg ? `<img src="${r.icon}" alt="">` : r.icon) +
        (n > 1 ? `<span class="cm-qcount">x${n}</span>` : "") +
        (i === 0 ? '<div class="cm-qbar"><div class="cm-qfill"></div></div>' : "");
      qItemsEl.appendChild(el);
      if (i === 0) qFillEl = el.querySelector(".cm-qfill");
      i += n;
    }
  }

  function update(dt) {
    if (!queue.length) { craftT = 0; return; }
    craftT += dt;
    const r = RECIPES[queue[0]];
    if (qFillEl) qFillEl.style.width = Math.min(100, (craftT / r.time) * 100) + "%";
    if (craftT >= r.time) {
      craftT = 0;
      queue.shift();
      const success = inventory.addItem(r.id, r.count);
      if (!success) {
        for (const [res, c] of Object.entries(r.cost)) inventory.addItem(res, c);
        if (callbacks.onHint) callbacks.onHint("❌ Нет места в инвентаре!");
      } else {
        if (callbacks.onCrafted) callbacks.onCrafted(r.id, r.count);
      }
      renderQueue();
      if (isOpen) { renderGrid(); renderDetails(); }
    }
  }

  panel.querySelector(".cm-minus").addEventListener("click", () => { qty = Math.max(1, qty - 1); renderDetails(); });
  panel.querySelector(".cm-plus").addEventListener("click", () => { qty = Math.min(99, qty + 1); renderDetails(); });
  panel.querySelector(".cm-close").addEventListener("click", () => close());
  createBtn.addEventListener("click", () => {
    const r = RECIPES[selIdx];
    if (!r || !canAfford(r, qty)) return;
    deduct(r, qty);
    for (let i = 0; i < qty; i++) queue.push(selIdx);
    renderQueue(); renderGrid(); renderDetails();
  });

  function open() {
    if (isOpen) return;
    isOpen = true;
    panel.classList.add("open");
    document.exitPointerLock();
    renderCats(); renderGrid(); renderDetails(); renderQueue();
    callbacks.onToggle?.(true);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove("open");
    document.body.requestPointerLock();
    callbacks.onToggle?.(false);
  }

  function toggle() { isOpen ? close() : open(); }

  return { open, close, toggle, update, isOpen: () => isOpen };
}
