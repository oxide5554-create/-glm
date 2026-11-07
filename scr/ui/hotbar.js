// scr/ui/hotbar.js
// ✅ Простые строковые пути — работают в native ES modules (без bundler).

export const ITEMS = {
  rock:             { id: 'rock',             name: 'Каменный инструмент', icon: './scr/ui/icons/rock.png',             emoji: '🪨', stackable: false },
  blueprint:        { id: 'blueprint',        name: 'Чертёж',              icon: './scr/ui/icons/BLUEPRINT.png',         emoji: '📜', stackable: false },
  concretePickaxe:  { id: 'concretePickaxe',  name: 'Самодельная кирка',   icon: './scr/ui/icons/concretepickaxe.png',   emoji: '⛏️', stackable: false },
  stonePickaxe:     { id: 'stonePickaxe',     name: 'Каменная кирка',      icon: './scr/ui/icons/stone_pickaxe.png',     emoji: '⛏️', stackable: false },
  wood:             { id: 'wood',             name: 'Дерево',              icon: './scr/ui/icons/Wood.png',              emoji: '🪵', stackable: true, stack: 1000 },
  lock:             { id: 'lock',             name: 'Замок',               icon: './scr/ui/icons/lock.png',              emoji: '🔒', stackable: true, stack: 100 },
  stone:            { id: 'stone',            name: 'Камень',              icon: './scr/ui/icons/stones.png',            emoji: '🪨', stackable: true, stack: 1000 },
  scrap:            { id: 'scrap',            name: 'Скрап',               icon: './scr/ui/icons/Scrap.png',             emoji: '⚙️', stackable: true, stack: 1000 },
  storage_chest:    { id: 'storage_chest',    name: 'Сундук',              icon: './scr/ui/icons/storage_chest.png',     emoji: '📦', stackable: true, stack: 10 },
  door:             { id: 'door',             name: 'Деревянная дверь',    icon: './scr/ui/icons/wooden_door.png',       emoji: '🚪', stackable: true, stack: 10 },
  ak47:             { id: 'ak47',             name: 'АК-47',               icon: './scr/ui/icons/rifle_ak.png',          emoji: '🔫', stackable: false },
  berdana:          { id: 'berdana',          name: 'Берданка',            icon: './scr/ui/icons/berdana.png',           emoji: '🎯', stackable: false },
  rawMeat:          { id: 'rawMeat',          name: 'Сырое мясо',          icon: './scr/ui/icons/raw_meat.png',          emoji: '🍖', stackable: true, stack: 100 },
  bone:             { id: 'bone',             name: 'Кости',               icon: './scr/ui/icons/bone.png',              emoji: '🦴', stackable: true, stack: 100 },
  cloth:            { id: 'cloth',            name: 'Ткань',               icon: './scr/ui/icons/cloth.png',             emoji: '🧵', stackable: true, stack: 100 },
  animalFat:        { id: 'animalFat',        name: 'Животный жир',        icon: './scr/ui/icons/animal_fat.png',        emoji: '🛢️', stackable: true, stack: 100 },
  // ✅ Компоненты для крафта (падают из ящиков)
  rifleBody:        { id: 'rifleBody',        name: 'Корпус винтовки',     icon: '',  emoji: '🔫', stackable: true, stack: 10 },
  berdanaBody:      { id: 'berdanaBody',      name: 'Корпус берданки',     icon: '',  emoji: '🎯', stackable: true, stack: 10 },
  spring:           { id: 'spring',           name: 'Пружина',             icon: '',  emoji: '🔩', stackable: true, stack: 20 },
  pipe:             { id: 'pipe',             name: 'Труба',               icon: '',  emoji: '🧱', stackable: true, stack: 20 },
  // ✅ Ресурсы для крафта
  metalFragment:    { id: 'metalFragment',    name: 'Металл (фрагмент)',   icon: '',  emoji: '⚙️', stackable: true, stack: 100 },
  mvc:              { id: 'mvc',              name: 'МВК',                 icon: '',  emoji: '🧱', stackable: true, stack: 100 }
};

// ✅ Рендер иконки — img с INLINE styles, заполняет слот (width:100%)
export function renderIcon(item) {
  const imgSrc = item.icon;
  if (imgSrc) {
    return `<img src="${imgSrc}" alt="${item.name || ''}" draggable="false" ` +
           `style="display:block;width:100%;height:100%;object-fit:contain;position:absolute;top:0;left:0;z-index:2;pointer-events:none" ` +
           `onerror="console.error('IMG FAIL:', this.src)">`;
  }
  const emoji = item.emoji || '📦';
  return `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:28px;position:absolute;top:0;left:0;z-index:2;pointer-events:none">${emoji}</div>`;
}

export class Hotbar {
  constructor(inventory, onSlotChange) {
    this.inventory = inventory;
    this.activeSlot = 0;
    this.onSlotChange = onSlotChange || (() => {});
    this._createElement();
    this._bindInputs();
    requestAnimationFrame(() => this.render());
  }

  _createElement() {
    this.el = document.createElement('div');
    this.el.id = 'hotbar';
    document.body.appendChild(this.el);
  }

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
        if (window.buildMenuOpen || window.chatOpen || document.pointerLockElement === null) return;
        if (e.code >= 'Digit1' && e.code <= 'Digit6') {
            this.select(parseInt(e.code.replace('Digit', '')) - 1);
        }
    });
    window.addEventListener('wheel', (e) => {
        if (window.buildMenuOpen || window.chatOpen || document.pointerLockElement === null) return;
        const dir = e.deltaY > 0 ? 1 : -1;
        this.select((this.activeSlot + dir + 6) % 6);
    }, { passive: true });
  }

  select(index) {
    if (index < 0 || index >= 6) return;
    this.activeSlot = index;
    this.render();
    const slot = this.inventory.slots[index];
    this.onSlotChange(slot ? slot.item : null, index);
  }

  getCurrentItem() {
    const slot = this.inventory.slots[this.activeSlot];
    return slot ? slot.item : null;
  }

  render() {
    if (!this.el) return;
    this.el.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const slot = this.inventory.slots[i];
      const div = document.createElement('div');
      let cls = 'slot';
      if (i === this.activeSlot) cls += ' active';
      if (!slot) cls += ' empty';
      div.className = cls;
      let inner = `<div class="slot-key">${i + 1}</div>`;
      if (slot) {
        inner += renderIcon(slot.item);
        if (slot.item.stackable && slot.count > 1) {
          inner += `<div class="slot-count">${slot.count}</div>`;
        }
        div.title = slot.item.name;
        div.draggable = true;
        div.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'hotbar', index: i }));
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
          this.inventory.swapItems({ type: source.type || 'hotbar', index: source.index }, { type: 'hotbar', index: i });
        } catch (err) {}
      });
      div.addEventListener('click', () => this.select(i));
      // ✅ ВАЖНО: устанавливаем innerHTML с иконкой и цифрой!
      div.innerHTML = inner;
      // ✅ ВАЖНО: re-attach event listeners после innerHTML (innerHTML сбрасывает их)
      if (slot) {
        div.title = slot.item.name;
        div.draggable = true;
        div.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'hotbar', index: i }));
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
          this.inventory.swapItems({ type: source.type || 'hotbar', index: source.index }, { type: 'hotbar', index: i });
        } catch (err) {}
      });
      div.addEventListener('click', () => this.select(i));
      this.el.appendChild(div);
    }
  }
}
