// ============================================================================
//  scr/3d/firstPersonHands.js
//  РУКА ИГРОКА ОТ 1-ГО ЛИЦА (кисть + предплечье) с каменным топором.
//
//  Простой подход:
//  - Кисть (ладонь + 4 пальца + большой палец) из примитивов
//  - Предплечье (короткий цилиндр) — выходит снизу кадра, имитируя руку от плеча
//  - Каменный топор привязан к кисти (рукоять проходит через ладонь)
//  - Лезвие топора ВВЕРХ-ВПЕРЁД, под углом ~45° (как в Rust)
//  - Анимация свинга: кисть + топор двигаются вместе (замах → удар → возврат)
//
//  Без плеча/локтя/сегментов — просто готовый хват руки на рукояти.
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const AXE_MODEL_PATH = './scr/3d/stone_axe.glb';
const TARGET_AXE_LENGTH = 0.65;

const SKIN_COLOR = 0xd4a574;
const SKIN_DARK = 0xb08858;

// Тайминги анимации удара
const SWING_PHASES = { BACKSWING: 0.20, STRIKE: 0.10, RECOVER: 0.40 };
const SWING_TOTAL = SWING_PHASES.BACKSWING + SWING_PHASES.STRIKE + SWING_PHASES.RECOVER;

export class FirstPersonHands {
    constructor(camera) {
        this.camera = camera;
        this.root = new THREE.Group();
        this.root.name = 'firstPersonHands';
        this.root.visible = false;

        this._buildHand();
        this._loadAxe();

        // Свет на руку (иначе тёмная)
        this.handLight = new THREE.PointLight(0xfff4d6, 1.0, 2.5, 1.2);
        this.handLight.position.set(0.15, -0.20, 0.30);
        this.root.add(this.handLight);

        camera.add(this.root);

        this.loaded = false;
        this.visible = false;
        this.walkPhase = 0;
        this.swingTime = 0;
    }

    // =========================================================================
    //  ПОСТРОЕНИЕ РУКИ (только кисть + часть предплечья)
    // =========================================================================
    _buildHand() {
        const skinMat = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.7, metalness: 0.0 });
        const skinDarkMat = new THREE.MeshStandardMaterial({ color: SKIN_DARK, roughness: 0.85, metalness: 0.0 });

        // Группа всей руки (поворачивается как единое целое для анимации)
        this.hand = new THREE.Group();
        this.hand.name = 'hand';

        // Предплечье (цилиндр) — выходит снизу кадра, идёт вверх к кисти
        const forearmGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.40, 12);
        forearmGeo.translate(0, -0.20, 0); // верх на y=0, низ на y=-0.40
        const forearm = new THREE.Mesh(forearmGeo, skinMat);
        this.hand.add(forearm);

        // Запястье (сфера)
        const wristGeo = new THREE.SphereGeometry(0.05, 12, 8);
        const wrist = new THREE.Mesh(wristGeo, skinDarkMat);
        wrist.position.y = 0.02;
        this.hand.add(wrist);

        // Ладонь (коробка)
        const palmGeo = new THREE.BoxGeometry(0.10, 0.12, 0.05);
        const palm = new THREE.Mesh(palmGeo, skinMat);
        palm.position.set(0, 0.10, 0);
        this.hand.add(palm);

        // 4 пальца (согнуты вокруг рукояти)
        for (let i = 0; i < 4; i++) {
            const fingerGeo = new THREE.CylinderGeometry(0.014, 0.013, 0.08, 6);
            const finger = new THREE.Mesh(fingerGeo, skinMat);
            finger.position.set(-0.035 + i * 0.022, 0.18, 0.015);
            finger.rotation.x = -0.4; // чуть согнут
            this.hand.add(finger);
        }
        // Большой палец (с другой стороны рукояти)
        const thumbGeo = new THREE.CylinderGeometry(0.016, 0.014, 0.06, 6);
        const thumb = new THREE.Mesh(thumbGeo, skinMat);
        thumb.position.set(0.045, 0.12, 0.025);
        thumb.rotation.set(0.4, 0, -0.6);
        this.hand.add(thumb);

        this.root.add(this.hand);

        // Сохраняем материалы для dispose
        this._mats = [skinMat, skinDarkMat];
        this._geos = [forearmGeo, wristGeo, palmGeo, thumbGeo];

        // Базовая позиция руки от 1-го лица:
        // Справа, внизу экрана, перед камерой. Рукоять топора идёт от кисти вверх-вперёд.
        // В world space (если камера на y=1.7): кисть на y=1.40 (30 см ниже глаз)
        this.hand.position.set(0.25, -0.30, -0.45);
        // Поворот: ладонь повёрнута к камере, пальцы обхватывают рукоять (вертикально)
        this.hand.rotation.set(-0.3, 0.2, 0.2);
    }

    // =========================================================================
    //  ЗАГРУЗКА ТОПОРА И ПРИВЯЗКА К КИСТИ
    // =========================================================================
    _loadAxe() {
        const loader = new GLTFLoader();
        loader.load(
            AXE_MODEL_PATH,
            (gltf) => {
                this.axeModel = gltf.scene;

                // 1. Конвертация см → м
                const box = new THREE.Box3().setFromObject(this.axeModel);
                const size = box.getSize(new THREE.Vector3());
                let rawSize = size.clone();
                if (Math.max(size.x, size.y, size.z) > 50) {
                    this.axeModel.scale.setScalar(0.01);
                    this.axeModel.updateMatrixWorld(true);
                    rawSize = new THREE.Box3().setFromObject(this.axeModel).getSize(new THREE.Vector3());
                }
                const length = Math.max(rawSize.x, rawSize.y, rawSize.z);
                if (length > 0.01) {
                    this.axeModel.scale.multiplyScalar(TARGET_AXE_LENGTH / length);
                }

                // 2. Центрируем: низ рукояти на y=0
                const scaledBox = new THREE.Box3().setFromObject(this.axeModel);
                const center = scaledBox.getCenter(new THREE.Vector3());
                this.axeModel.position.x -= center.x;
                this.axeModel.position.z -= center.z;
                this.axeModel.position.y -= scaledBox.min.y;

                // 3. Если модель лежит горизонтально — поворот вертикально
                if (rawSize.x > rawSize.y * 1.5) {
                    this.axeModel.rotation.z = Math.PI / 2;
                }

                // 4. Тени off (1-е лицо)
                this.axeModel.traverse((o) => {
                    if (o.isMesh) {
                        o.castShadow = false;
                        o.receiveShadow = false;
                        o.frustumCulled = false;
                    }
                });

                // ✅ Привязываем топор к кисти (как ребёнок группы hand)
                //    Рукоять проходит через ладонь (на y=0.10), лезвие вверх-вперёд.
                //    Поворот: лезвие наклонено ~30° от вертикали (как в Rust idle).
                this.axeModel.position.y = 0.10; // рукоять через ладонь
                this.axeModel.rotation.set(-0.5, 0, 0.1); // лезвие наклонено к камере (~30°)

                this.hand.add(this.axeModel);

                this.loaded = true;
                console.log('[Hands] Топор загружен и привязан к кисти');
            },
            (progress) => {
                if (progress.total) {
                    console.log(`[Hands] Загрузка топора: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
                }
            },
            (error) => console.error('[Hands] Ошибка загрузки топора:', error)
        );
    }

    // =========================================================================
    //  УПРАВЛЕНИЕ
    // =========================================================================
    setVisible(v) {
        this.visible = v;
        this.root.visible = v;
    }

    triggerSwing() {
        if (!this.loaded || !this.visible) return;
        this.swingTime = SWING_TOTAL;
    }

    // =========================================================================
    //  ОБНОВЛЕНИЕ (каждый кадр)
    // =========================================================================
    update(dt, opts = {}) {
        if (!this.loaded || !this.visible) return;
        const speed = opts.speed || 0;
        const onGround = opts.onGround !== false;
        const sprint = opts.sprint || false;

        // Базовые значения руки (idle)
        const BASE_X = 0.25, BASE_Y = -0.30, BASE_Z = -0.45;
        const BASE_RX = -0.3, BASE_RY = 0.2, BASE_RZ = 0.2;

        if (this.swingTime > 0) {
            this.swingTime -= dt;
            if (this.swingTime < 0) this.swingTime = 0;
            this._applySwingAnimation(BASE_X, BASE_Y, BASE_Z, BASE_RX, BASE_RY, BASE_RZ);
        } else {
            // Idle + покачивание при ходьбе
            if (speed > 0.05 && onGround) {
                this.walkPhase += dt * (sprint ? 14 : 9);
                const amp = sprint ? 0.03 : 0.02;
                this.hand.position.y = BASE_Y + Math.sin(this.walkPhase) * amp;
                this.hand.position.x = BASE_X + Math.cos(this.walkPhase * 0.5) * amp * 0.5;
                this.hand.rotation.x = BASE_RX + Math.sin(this.walkPhase) * 0.05;
            } else {
                // Дыхание в покое
                this.walkPhase += dt * 1.5;
                this.hand.position.y = BASE_Y + Math.sin(this.walkPhase * 0.5) * 0.005;
                this.hand.position.x = BASE_X;
                this.hand.rotation.x = BASE_RX + Math.sin(this.walkPhase * 0.5) * 0.01;
            }
            this.hand.position.z = BASE_Z;
            this.hand.rotation.y = BASE_RY;
            this.hand.rotation.z = BASE_RZ;
        }
    }

    // ✅ Анимация удара — двигаем всю руку (hand) с топором
    _applySwingAnimation(bx, by, bz, brx, bry, brz) {
        const t = this.swingTime;
        function easeInOut(x) { return x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x+2, 2)/2; }
        function easeOut(x) { return 1 - Math.pow(1-x, 3); }

        if (t > SWING_TOTAL - SWING_PHASES.BACKSWING) {
            // === ЗАМАХ — рука поднимается вправо-вверх-назад ===
            const phaseT = (SWING_TOTAL - t) / SWING_PHASES.BACKSWING;
            const e = easeInOut(phaseT);
            this.hand.position.y = by + 0.20 * e;       // вверх
            this.hand.position.x = bx + 0.08 * e;        // вправо
            this.hand.position.z = bz + 0.05 * e;        // ближе к игроку
            this.hand.rotation.x = brx - 0.7 * e;        // наклон назад
            this.hand.rotation.z = brz + 0.3 * e;        // поворот к плечу
        } else if (t > SWING_TOTAL - SWING_PHASES.BACKSWING - SWING_PHASES.STRIKE) {
            // === УДАР — резко вперёд-вниз ===
            const phaseT = (SWING_TOTAL - SWING_PHASES.BACKSWING - t) / SWING_PHASES.STRIKE;
            const e = easeOut(phaseT);
            // Из конца замаха (y=by+0.20, x=bx+0.08) в нижнюю точку (y=by-0.15, x=bx-0.15)
            this.hand.position.y = by + 0.20 - 0.35 * e;
            this.hand.position.x = bx + 0.08 - 0.23 * e;
            this.hand.position.z = bz + 0.05 - 0.10 * e;
            // Поворот: резко вперёд
            this.hand.rotation.x = brx - 0.7 + 1.4 * e;
            this.hand.rotation.z = brz + 0.3 - 0.5 * e;
        } else {
            // === ВОЗВРАТ — плавно в idle ===
            const phaseT = (SWING_TOTAL - SWING_PHASES.BACKSWING - SWING_PHASES.STRIKE - t) / SWING_PHASES.RECOVER;
            const e = easeInOut(phaseT);
            // Из конца удара в idle
            this.hand.position.y = (by - 0.15) + (0.15 + 0.15) * e;
            this.hand.position.x = (bx - 0.15) + (0.15 + 0.08) * e;
            this.hand.position.z = (bz - 0.05) + (0.05 + 0.05) * e;
            this.hand.rotation.x = (brx + 0.7) + (-0.7 - 0.7) * e;
            this.hand.rotation.z = (brz - 0.2) + (0.2 + 0.3) * e;
        }
    }

    dispose() {
        if (this.root.parent) this.root.parent.remove(this.root);
        this.root.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => m.dispose());
            }
        });
    }
}
