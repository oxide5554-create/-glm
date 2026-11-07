// scr/ui/buildmenu.js
export function createBuildMenu(root, buildingSystem) {
    if (!document.getElementById("buildmenu-style")) {
        const st = document.createElement("style");
        st.id = "buildmenu-style";
        st.textContent = `
            .bm-panel {
                position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%);
                display: flex; gap: 8px; background: rgba(20, 20, 20, 0.95);
                border: 1px solid rgba(80, 80, 80, 0.6); border-radius: 6px;
                padding: 8px; z-index: 50; pointer-events: auto;
                opacity: 0; visibility: hidden; transition: opacity 0.15s, transform 0.15s;
            }
            .bm-panel.open { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(-10px); }
            .bm-btn {
                width: 70px; height: 70px; background: rgba(40, 40, 40, 0.9);
                border: 1px solid rgba(100, 100, 100, 0.5); border-radius: 4px;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                cursor: pointer; transition: all 0.1s; color: #ccc;
            }
            .bm-btn:hover { background: rgba(60, 60, 60, 0.95); border-color: rgba(180, 180, 180, 0.8); color: #fff; }
            .bm-btn .bm-icon { font-size: 28px; margin-bottom: 4px; }
            .bm-btn .bm-name { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
        `;
        document.head.appendChild(st);
    }

    const panel = document.createElement("div");
    panel.className = "bm-panel";
    
    const parts = [
        { id: 'foundation', icon: '🟫', name: 'Фундамент' },
        { id: 'wall', icon: '🧱', name: 'Стена' },
        { id: 'window', icon: '🪟', name: 'Окно' },
        { id: 'doorway', icon: '🚪', name: 'Проем' },
        { id: 'ceiling', icon: '⬜', name: 'Потолок' }
    ];

    parts.forEach(p => {
        const btn = document.createElement("div");
        btn.className = "bm-btn";
        btn.innerHTML = `<div class="bm-icon">${p.icon}</div><div class="bm-name">${p.name}</div>`;
        btn.addEventListener("click", () => {
            buildingSystem.setPart(p.id);
            window.buildMode = true;
            close();
        });
        panel.appendChild(btn);
    });

    root.appendChild(panel);

    let isOpen = false;

    function open() {
        if (isOpen) return;
        isOpen = true;
        window.buildMenuOpen = true; // ✅ Флаг для hotbar.js, чтобы блокировать цифры
        panel.classList.add("open");
        document.exitPointerLock(); // ✅ Разблокируем мышь для клика
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        window.buildMenuOpen = false;
        panel.classList.remove("open");
        document.body.requestPointerLock(); // ✅ Блокируем мышь обратно
    }

    function toggle() {
        isOpen ? close() : open();
    }

    return { open, close, toggle, get isOpen() { return isOpen; } };
}
