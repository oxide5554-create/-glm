import { ITEMS, renderIcon } from './hotbar.js';

// ✅ Простая версия: чёрная рамка, серая внутри, drag-and-drop.
export class Inventory {
  constructor() {
    this.hotbar = null;
    this.rows = 4;
    this.cols = 6;
    this.size = this.rows * this.cols;
    this.slots = new Array(this.size).fill(null);
    this.isOpen = false;
    this._createElement();
    this._bindInputs();
    // ✅ Стартовые предметы в хотбаре (6 слотов):
    // 0: камень-инструмент (топор)
    // 1: чертёж
    // 2: дерево
    // 3: камень
    // 4: скрап
    // 5: АК-47
    this.slots[0] = { item: ITEMS.rock, count: 1 };
    // ✅ НОВОЕ: слот 2 (index 1) — дробовик вместо чертежа (плана строителя).
    //    Чертёж не нужен в хотбаре теперь — он нужен только для стройки (Z),
    //    а стройку пользователь пока не использует. Дробовик — основное оружие.
    this.slots[1] = { item: ITEMS.shotgun, count: 1 };
    this.slots[2] = { item: ITEMS.wood, count: 100 };
    this.slots[3] = { item: ITEMS.stone, count: 50 };
    this.slots[4] = { item: ITEMS.scrap, count: 20 };
    this.slots[5] = { item: ITEMS.ak47, count: 1 };
    // ✅ Кирка + берданка — в основной инвентаре (slots[6+])
    this.slots[6] = { item: ITEMS.stonePickaxe, count: 1 };
    this.slots[7] = { item: ITEMS.berdana, count: 1 };
  }

  removeItem(itemId, count) {
    let remaining = count;
    for (let i = 6; i < this.size; i++) {
      if (this.slots[i] && this.slots[i].item && this.slots[i].item.id === itemId) {
        if (this.slots[i].count <= remaining) {
          remaining -= this.slots[i].count;
          this.slots[i] = null;
        } else {
          this.slots[i].count -= remaining;
          remaining = 0;
        }
        if (remaining === 0) {
          if (this.isOpen) this.render();
          if (this.hotbar) this.hotbar.render();
          return true;
        }
      }
    }
    for (let i = 0; i < 6; i++) {
      if (this.slots[i] && this.slots[i].item && this.slots[i].item.id === itemId) {
        if (this.slots[i].count <= remaining) {
          remaining -= this.slots[i].count;
          this.slots[i] = null;
        } else {
          this.slots[i].count -= remaining;
          remaining = 0;
        }
        if (remaining === 0) {
          if (this.isOpen) this.render();
          if (this.hotbar) this.hotbar.render();
          return true;
        }
      }
    }
    if (this.isOpen) this.render();
    if (this.hotbar) this.hotbar.render();
    return remaining === 0;
  }

  countItem(itemId) {
    let count = 0;
    for (const slot of this.slots) {
      if (slot && slot.item && slot.item.id === itemId) count += slot.count;
    }
    return count;
  }

  _createElement() {
    this.el = document.createElement('div');
    this.el.id = 'inventory';
    this.el.innerHTML = `
      <div class="inventory-panel">
        <div class="inventory-title">ИНВЕНТАРЬ</div>
        <div class="inventory-grid"></div>
        <div class="inventory-title" style="margin-top:14px;font-size:13px;color:#aaa">БЫСТРЫЙ ДОСТУП</div>
        <div class="hotbar-grid"></div>
        <div class="inventory-hint"><kbd>E</kbd> — закрыть · перетаскивай предметы мышкой</div>
      </div>
    `;
    document.body.appendChild(this.el);
    this.gridEl = this.el.querySelector('.inventory-grid');
    this.hotbarGridEl = this.el.querySelector('.hotbar-grid');
  }

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') { e.preventDefault(); this.toggle(); }
    });
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.el.classList.toggle('open', this.isOpen);
    if (this.isOpen) {
      this.render();
      if (document.pointerLockElement) document.exitPointerLock();
      // ✅ Скрываем хотбар пока открыт инвентарь (чтобы не путаться)
      const hb = document.getElementById('hotbar');
      if (hb) hb.style.display = 'none';
    } else {
      // ✅ Показываем хотбар обратно
      const hb = document.getElementById('hotbar');
      if (hb) hb.style.display = '';
      // ✅ ФИКС: восстанавливаем pointer lock после закрытия инвентаря.
      //    Раньше после закрытия мыш не захватывалась — игрок не мог продолжить.
      //    Helper проверяет что нет других открытых меню и вызывает controls.lock().
      //    Браузер требует user gesture — keydown/click им является, так что сработает.
      if (typeof window.__requestPointerLock === 'function') {
        // ✅ Небольшая задержка (50мс) — браузер после exitPointerLock имеет
        //    "security cooldown" ~50мс, в течение которого requestPointerLock
        //    молча игнорируется. ждём чтобы гарантированно сработало.
        setTimeout(() => {
          if (!this.isOpen) window.__requestPointerLock();
        }, 50);
      }
    }
  }

  open() { if (!this.isOpen) this.toggle(); }
  close() { if (this.isOpen) this.toggle(); }

  addItem(itemId, count = 1) {
    const item = ITEMS[itemId];
    if (!item) return false;
    if (item.stackable) {
      for (let i = 6; i < this.size; i++) {
        if (this.slots[i] && this.slots[i].item && this.slots[i].item.id === itemId) {
          this.slots[i].count += count;
          if (this.isOpen) this.render();
          if (this.hotbar) this.hotbar.render();
          return true;
        }
      }
      for (let i = 0; i < 6; i++) {
        if (this.slots[i] && this.slots[i].item && this.slots[i].item.id === itemId) {
          this.slots[i].count += count;
          if (this.isOpen) this.render();
          if (this.hotbar) this.hotbar.render();
          return true;
        }
      }
    }
    for (let i = 6; i < this.size; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { item, count };
        if (this.isOpen) this.render();
        if (this.hotbar) this.hotbar.render();
        return true;
      }
    }
    for (let i = 0; i < 6; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { item, count };
        if (this.isOpen) this.render();
        if (this.hotbar) this.hotbar.render();
        return true;
      }
    }
    return false;
  }

  swapItems(source, target) {
    if (!source || !target) return;
    const getArrIdx = (s) => {
      if (s.type === 'inv') return { arr: this.slots, idx: 6 + s.index };
      if (s.type === 'hotbar') return { arr: this.slots, idx: s.index };
      if (s.type === 'chest') return null;
      return { arr: this.slots, idx: s.index };
    };
    const src = getArrIdx(source);
    const tgt = getArrIdx(target);
    if (!src || !tgt) return;
    const sourceItem = src.arr[src.idx];
    const targetItem = tgt.arr[tgt.idx];
    if (sourceItem && targetItem && sourceItem.item.id === targetItem.item.id && targetItem.item.stackable) {
      targetItem.count += sourceItem.count;
      src.arr[src.idx] = null;
    } else {
      src.arr[src.idx] = targetItem;
      tgt.arr[tgt.idx] = sourceItem;
    }
    this.render();
    if (this.hotbar) this.hotbar.render();
  }

  // ✅ Рендер одной ячейки
  _renderSlot(slot, type, index) {
    const div = document.createElement('div');
    let cls = 'slot';
    if (!slot) cls += ' empty';
    if (type === 'hotbar' && this.hotbar && index === this.hotbar.activeSlot) cls += ' active';
    div.className = cls;

    // ✅ Сначала собираем innerHTML
    let inner = '';
    if (type === 'hotbar') {
      inner += `<div class="slot-key">${index + 1}</div>`;
    }
    if (slot && slot.item) {
      inner += renderIcon(slot.item);
      if (slot.item.stackable && slot.count > 1) {
        inner += `<div class="slot-count">${slot.count}</div>`;
      }
    }
    // ✅ ВАЖНО: устанавливаем innerHTML!
    div.innerHTML = inner;

    // ✅ Re-attach event listeners (innerHTML сбрасывает их)
    if (slot && slot.item) {
      div.title = slot.item.name;
      div.draggable = true;
      div.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type, index }));
        setTimeout(() => div.classList.add('dragging'), 0);
      });
      div.addEventListener('dragend', () => div.classList.remove('dragging'));
    }
    div.addEventListener('dragover', (e) => { e.preventDefault(); div.classList.add('drag-over'); });
    div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
    div.addEventListener('drop', (e) => {
      e.preventDefault(); div.classList.remove('drag-over');
      const data = e.dataTransfer.getData('text/plain');
      if (!data) return;
      try {
        const source = JSON.parse(data);
        this.swapItems({ type: source.type || 'inv', index: source.index }, { type, index });
      } catch (err) {}
    });
    return div;
  }

  render() {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = '';
    for (let i = 6; i < this.size; i++) {
      this.gridEl.appendChild(this._renderSlot(this.slots[i], 'inv', i - 6));
    }
    this.hotbarGridEl.innerHTML = '';
    if (this.hotbar) {
      for (let i = 0; i < 6; i++) {
        this.hotbarGridEl.appendChild(this._renderSlot(this.slots[i], 'hotbar', i));
      }
    }
  }
}
