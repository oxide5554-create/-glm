// scr/ui/map.js
// ✅ Карта мира — открывается клавишей M.
//    ПОЛНОЭКРАННАЯ карта с реальным террейном:
//      - Зелёные области = трава (низины/склоны с растительностью)
//      - Коричневые области = голая земля/скалы (высокие/крутые места)
//      - Дорога = тёмно-коричневая линия
//      - Hill shading (освещение с северо-запада) → ощущается объём
//    Без рамки, без заголовка — на весь экран.
//    Хотбар скрывается когда карта открыта.
//    Маркер игрока — маленький, вращается за направлением взгляда (нос снизу).
//
//    API:
//      createMap(root, opts) → { toggle, update, isOpen }
//        opts.getCamera()          — THREE.Camera
//        opts.getRoadPoints()      — массив THREE.Vector3
//        opts.getGasStations()     — массив {x, z}
//        opts.getWarehouses()      — массив {x, z, yaw}
//        opts.getGroundHeight(x,z) — функция высоты террейна

import * as THREE from 'three';

export function createMap(root, opts = {}) {
    // === CSS (минимальный — без рамки, без заголовка) ===
    if (!document.getElementById('map-style')) {
        const st = document.createElement('style');
        st.id = 'map-style';
        st.textContent = `
.map-panel {
    position: fixed; inset: 0;
    background: #000;
    z-index: 200;
    opacity: 0; visibility: hidden;
    transition: opacity .15s, visibility .15s;
}
.map-panel.open { opacity: 1; visibility: visible; }
.map-canvas {
    display: block;
    width: 100vw; height: 100vh;
}
.map-overlay {
    position: absolute; inset: 0;
    pointer-events: none;
}
.map-icon {
    position: absolute;
    transform: translate(-50%, -50%);
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 1));
}
.map-icon img { display: block; object-fit: contain; }
.map-marker {
    position: absolute;
    transform: translate(-50%, -50%);
    z-index: 10;
    filter: drop-shadow(0 0 8px rgba(255, 200, 50, 0.9));
}
.map-marker img {
    display: block;
    width: 20px; height: 35px;
    object-fit: contain;
}
.map-close-hint {
    position: absolute; bottom: 16px; left: 50%;
    transform: translateX(-50%);
    color: rgba(255, 230, 180, 0.7);
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
    letter-spacing: 0.15em;
    text-shadow: 0 2px 6px rgba(0,0,0,1);
    pointer-events: none;
}
`;
        document.head.appendChild(st);
    }

    // === DOM ===
    const panel = document.createElement('div');
    panel.className = 'map-panel';
    panel.innerHTML = `
        <canvas class="map-canvas"></canvas>
        <div class="map-overlay" id="map-icons-layer"></div>
        <div class="map-overlay" id="map-marker-layer"></div>
        <div class="map-close-hint">M — закрыть карту</div>
    `;
    root.appendChild(panel);

    const canvas = panel.querySelector('.map-canvas');
    const ctx = canvas.getContext('2d');
    const iconsLayer = panel.querySelector('#map-icons-layer');
    const markerLayer = panel.querySelector('#map-marker-layer');

    // === Параметры карты ===
    // Мир: ±350 по X и Z (700×700 единиц)
    const WORLD_MIN = -350, WORLD_MAX = 350;
    const WORLD_SIZE = WORLD_MAX - WORLD_MIN;   // 700
    // Canvas resolution (нативное) — 700×700 для качества, масштабируется CSS на весь экран
    const MAP_RES = 700;
    canvas.width = MAP_RES;
    canvas.height = MAP_RES;
    const SCALE = MAP_RES / WORLD_SIZE;   // px per world unit

    // World (x, z) → Map (mx, my)
    // Север мира (-Z) = верх карты (my=0)
    // Восток мира (+X) = право карты (mx=MAP_RES)
    function worldToMap(x, z) {
        const mx = (x - WORLD_MIN) * SCALE;
        const my = (z - WORLD_MIN) * SCALE;
        return { mx, my };
    }

    // === Состояние ===
    let isOpen = false;
    let terrainGenerated = false;
    let markerEl = null;

    // === Генерация террейна (один раз) ===
    // Сэмплируем getGroundHeight на сетке, красим по высоте + hill shading.
    function generateTerrain() {
        if (terrainGenerated) return;
        terrainGenerated = true;
        const getGH = opts.getGroundHeight || (() => 0);
        const N = 250;   // 250×250 = 62500 сэмплов (приемлемо по времени)
        const step = WORLD_SIZE / N;
        const halfStep = step / 2;
        // 1) Сэмплируем высоты
        const heights = new Float32Array(N * N);
        let hMin = Infinity, hMax = -Infinity;
        for (let j = 0; j < N; j++) {
            const z = WORLD_MIN + j * step + halfStep;
            for (let i = 0; i < N; i++) {
                const x = WORLD_MIN + i * step + halfStep;
                const h = getGH(x, z);
                heights[j * N + i] = h;
                if (h < hMin) hMin = h;
                if (h > hMax) hMax = h;
            }
        }
        const hRange = Math.max(0.1, hMax - hMin);
        // 2) Рисуем попиксельно на canvas (Image data)
        const cellPx = MAP_RES / N;
        const imgData = ctx.createImageData(MAP_RES, MAP_RES);
        const data = imgData.data;
        // Light direction (северо-запад = верх-лево): normalize(-1, -1, 0.7)
        const lx = -0.5, ly = -0.5, lz = 0.707;
        for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
                const h = heights[j * N + i];
                const hn = (h - hMin) / hRange;   // 0..1
                // Соседи для hill shading
                const hL = heights[j * N + (i > 0 ? i - 1 : i)];
                const hR = heights[j * N + (i < N - 1 ? i + 1 : i)];
                const hU = heights[(j > 0 ? j - 1 : j) * N + i];
                const hD = heights[(j < N - 1 ? j + 1 : j) * N + i];
                // Нормаль поверхности (через градиент)
                const dx = (hR - hL) / (2 * step);
                const dz = (hD - hU) / (2 * step);
                // Нормаль = (-dx, 1, -dz) нормализованная
                const nLen = Math.sqrt(dx * dx + dz * dz + 1);
                const nx = -dx / nLen, ny = 1 / nLen, nz = -dz / nLen;
                // Скалярное произведение с направлением света
                let shade = nx * lx + ny * ly + nz * lz;
                shade = Math.max(0.3, Math.min(1.3, shade));   // clamp 0.3..1.3
                // Цвет по высоте:
                //  0.0-0.35  → тёмно-зелёная трава (низины)
                //  0.35-0.55 → зелёная трава (склоны)
                //  0.55-0.75 → коричневая земля (высокие)
                //  0.75-1.0  → тёмно-коричневая скала (вершины)
                let r, g, b;
                if (hn < 0.35) {
                    // тёмно-зелёная трава
                    r = 50; g = 80; b = 35;
                } else if (hn < 0.55) {
                    // зелёная трава
                    r = 70; g = 100; b = 45;
                } else if (hn < 0.75) {
                    // коричневая земля
                    r = 95; g = 70; b = 45;
                } else {
                    // тёмно-коричневая скала
                    r = 75; g = 55; b = 40;
                }
                // Применяем hill shading
                r = Math.max(0, Math.min(255, r * shade));
                g = Math.max(0, Math.min(255, g * shade));
                b = Math.max(0, Math.min(255, b * shade));
                // Заполняем квадрат cellPx × cellPx
                const x0 = Math.floor(i * cellPx);
                const y0 = Math.floor(j * cellPx);
                const x1 = Math.floor((i + 1) * cellPx);
                const y1 = Math.floor((j + 1) * cellPx);
                for (let py = y0; py < y1; py++) {
                    for (let px = x0; px < x1; px++) {
                        const idx = (py * MAP_RES + px) * 4;
                        data[idx] = r;
                        data[idx + 1] = g;
                        data[idx + 2] = b;
                        data[idx + 3] = 255;
                    }
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
        // 3) Дорога поверх террейна
        drawRoad();
    }

    // === Дорога ===
    function drawRoad() {
        const points = opts.getRoadPoints ? opts.getRoadPoints() : [];
        if (!points.length) return;
        ctx.save();
        // Внешняя обочина (тёмная)
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const { mx, my } = worldToMap(points[i].x, points[i].z);
            if (i === 0) ctx.moveTo(mx, my);
            else ctx.lineTo(mx, my);
        }
        ctx.strokeStyle = 'rgba(40, 30, 18, 0.9)';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        // Основное полотно дороги (коричневое)
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const { mx, my } = worldToMap(points[i].x, points[i].z);
            if (i === 0) ctx.moveTo(mx, my);
            else ctx.lineTo(mx, my);
        }
        ctx.strokeStyle = '#6a5030';
        ctx.lineWidth = 6;
        ctx.stroke();
        // Пунктир по центру (разметка)
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const { mx, my } = worldToMap(points[i].x, points[i].z);
            if (i === 0) ctx.moveTo(mx, my);
            else ctx.lineTo(mx, my);
        }
        ctx.strokeStyle = 'rgba(200, 180, 130, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    // === Иконки (строятся один раз) ===
    function buildIcons() {
        // Заправки
        const gasStations = opts.getGasStations ? opts.getGasStations() : [];
        for (const gs of gasStations) {
            const { mx, my } = worldToMap(gs.x, gs.z);
            const el = document.createElement('div');
            el.className = 'map-icon';
            // Позиция в % от размера overlay (100vw × 100vh)
            const px = (mx / MAP_RES) * 100;
            const py = (my / MAP_RES) * 100;
            el.style.left = px + 'vw';
            el.style.top = py + 'vh';
            el.innerHTML = `<img src="./scr/ui/icons/ico_Gas.png" width="40" height="40" alt="Заправка">`;
            iconsLayer.appendChild(el);
        }
        // Амбары
        const warehouses = opts.getWarehouses ? opts.getWarehouses() : [];
        for (const wh of warehouses) {
            const { mx, my } = worldToMap(wh.x, wh.z);
            const el = document.createElement('div');
            el.className = 'map-icon';
            const px = (mx / MAP_RES) * 100;
            const py = (my / MAP_RES) * 100;
            el.style.left = px + 'vw';
            el.style.top = py + 'vh';
            el.innerHTML = `<img src="./scr/ui/icons/ico_warehouse_big.png" width="36" height="36" alt="Амбар">`;
            iconsLayer.appendChild(el);
        }
    }

    // === Маркер игрока ===
    function buildMarker() {
        if (markerEl) return;
        markerEl = document.createElement('div');
        markerEl.className = 'map-marker';
        markerEl.innerHTML = `<img src="./scr/ui/icons/marker.webp" alt="Игрок">`;
        markerLayer.appendChild(markerEl);
    }

    // === Обновление маркера (каждый кадр) ===
    function updateMarker() {
        if (!isOpen || !markerEl) return;
        const camera = opts.getCamera ? opts.getCamera() : null;
        if (!camera) return;
        // Позиция в мире → % на экране
        const { mx, my } = worldToMap(camera.position.x, camera.position.z);
        const px = (mx / MAP_RES) * 100;
        const py = (my / MAP_RES) * 100;
        markerEl.style.left = px + 'vw';
        markerEl.style.top = py + 'vh';
        // Направление взгляда в XZ
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        const worldAngle = Math.atan2(fwd.x, -fwd.z);   // 0 = север (-Z)
        // ✅ Нос маркера СНИЗУ → +180° чтобы нос указывал в направлении взгляда
        const rotDeg = (worldAngle * 180 / Math.PI) + 180;
        markerEl.style.transform = `translate(-50%, -50%) rotate(${rotDeg}deg)`;
    }

    // === Открыть/закрыть ===
    let hotbarWasDisplay = null;
    function open() {
        if (isOpen) return;
        isOpen = true;
        panel.classList.add('open');
        // Генерим террейн (один раз)
        generateTerrain();
        buildIcons();
        buildMarker();
        updateMarker();
        // ✅ Скрываем хотбар
        const hb = document.getElementById('hotbar');
        if (hb) {
            hotbarWasDisplay = hb.style.display;
            hb.style.display = 'none';
        }
        // ✅ Скрываем crosshair (прицел)
        const ch = document.getElementById('crosshair');
        if (ch) ch.style.display = 'none';
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        panel.classList.remove('open');
        // ✅ Возвращаем хотбар
        const hb = document.getElementById('hotbar');
        if (hb) hb.style.display = hotbarWasDisplay || '';
        // ✅ Возвращаем crosshair
        const ch = document.getElementById('crosshair');
        if (ch) ch.style.display = '';
    }

    function toggle() {
        if (isOpen) close(); else open();
    }

    // Клик по фону = закрыть
    panel.addEventListener('click', (e) => {
        if (e.target === panel || e.target === canvas) close();
    });

    function update() {
        if (isOpen) updateMarker();
    }

    return { toggle, open, close, update, get isOpen() { return isOpen; } };
}
