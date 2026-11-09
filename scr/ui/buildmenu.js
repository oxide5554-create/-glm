// scr/ui/buildmenu.js
// ✅ Панель стройки — ВВЕРХУ экрана, без открытия как "меню".
//    Не разблокирует мышь (pointer lock остаётся) — игрок может смотреть вокруг.
//    Выбор частей: клик мышью по кнопке ИЛИ цифры 1-5 на клавиатуре.
//    Без эмодзи — цветные квадраты как иконки.
export function createBuildMenu(root, buildingSystem) {
    if (!document.getElementById("buildmenu-style")) {
        const st = document.createElement("style");
        st.id = "buildmenu-style";
        st.textContent = `
            .bm-bar {
                position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
                display: flex; gap: 3px; background: rgba(15, 15, 15, 0.92);
                border: 1px solid #2a2a2a; border-radius: 0;
                padding: 6px; z-index: 50; pointer-events: auto;
                opacity: 0; visibility: hidden; transition: opacity 0.12s;
            }
            .bm-bar.open { opacity: 1; visibility: visible; }
            .bm-btn {
                width: 52px; height: 52px; background: #1a1a1a;
                border: 1px solid #2a2a2a; border-radius: 0;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                cursor: pointer; transition: border-color 0.08s; color: #777;
                gap: 3px; position: relative;
            }
            .bm-btn:hover { border-color: #555; color: #aaa; }
            .bm-btn.sel { border-color: #ddd; color: #fff; }
            .bm-icon-sq { width: 18px; height: 18px; border: 1px solid #333; }
            .bm-name {
                font-size: 8px; font-weight: 600; text-transform: uppercase;
                letter-spacing: 0.03em; font-family: Arial, sans-serif;
                text-align: center; line-height: 1.1;
            }
            .bm-key {
                position: absolute; top: 1px; left: 2px;
                font-size: 8px; color: #555; font-family: monospace;
            }
        `;
        document.head.appendChild(st);
    }

    const bar = document.createElement("div");
    bar.className = "bm-bar";

    const parts = [
        { id: 'foundation', color: '#6a4a2a', name: 'Фунд', key: '1' },
        { id: 'wall',       color: '#888888', name: 'Стена', key: '2' },
        { id: 'window',     color: '#4a6a8a', name: 'Окно', key: '3' },
        { id: 'doorway',    color: '#3a3a3a', name: 'Проем', key: '4' },
        { id: 'ceiling',    color: '#aaaaaa', name: 'Потол', key: '5' }
    ];

    const btns = {};
    parts.forEach(p => {
        const btn = document.createElement("div");
        btn.className = "bm-btn";
        btn.innerHTML = `<div class="bm-key">${p.key}</div><div class="bm-icon-sq" style="background:${p.color}"></div><div class="bm-name">${p.name}</div>`;
        btn.addEventListener("click", () => selectPart(p.id));
        bar.appendChild(btn);
        btns[p.id] = btn;
    });

    root.appendChild(bar);

    let isOpen = false;
    let selectedPart = null;

    function selectPart(id) {
        // Снимаем выделение
        Object.values(btns).forEach(b => b.classList.remove("sel"));
        btns[id].classList.add("sel");
        selectedPart = id;
        buildingSystem.setPart(id);
        window.buildMode = true;
    }

    // ✅ НОВОЕ: цифры 1-5 для выбора части (без открытия меню)
    window.addEventListener('keydown', (e) => {
        if (!isOpen) return;
        const keyMap = { 'Digit1': 'foundation', 'Digit2': 'wall', 'Digit3': 'window', 'Digit4': 'doorway', 'Digit5': 'ceiling' };
        if (keyMap[e.code]) {
            e.preventDefault();
            selectPart(keyMap[e.code]);
        }
    });

    function open() {
        if (isOpen) return;
        isOpen = true;
        window.buildMenuOpen = true;
        bar.classList.add("open");
        // ✅ НЕ вызываем document.exitPointerLock() — мышь остаётся захваченной.
        //    Игрок может смотреть вокруг и выбирать части цифрами 1-5
        //    или кликом мышью по кнопкам (pointer-events: auto на кнопках).
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        window.buildMenuOpen = false;
        bar.classList.remove("open");
        // ✅ НЕ вызываем document.body.requestPointerLock() — мышь уже захвачена.
    }

    function toggle() {
        isOpen ? close() : open();
    }

    return { open, close, toggle, get isOpen() { return isOpen; } };
}
