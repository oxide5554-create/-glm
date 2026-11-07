// ============================================================================
//  scr/3d/stoneAxe.js
//  Каменный топор с ПРИВЯЗКОЙ к кости правой руки игрока.
//
//  Что делает:
//  1. Загружает stone_axe.glb (каменный топор)
//  2. Конвертирует см → м, масштабирует под 0.65 м длины
//  3. attachToBone(bone) — привязывает топор к кости mixamorig:RightHand
//     Тогда топор двигается ВМЕСТЕ с рукой во время анимации idle!
//  4. Анимация swing (процедурная):
//     - Поворачивает ВСЮ кость правой руки (замах → удар → возврат)
//  5. Если кость не задана — работает как обычный топор (привязан к камере)
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const AXE_MODEL_PATH = './scr/3d/stone_axe.glb';
const TARGET_LENGTH = 0.65;

// Тайминги анимации удара
const SWING_PHASES = { BACKSWING: 0.20, STRIKE: 0.10, RECOVER: 0.40 };
const SWING_TOTAL = SWING_PHASES.BACKSWING + SWING_PHASES.STRIKE + SWING_PHASES.RECOVER;

export class StoneAxe {
    constructor() {
        this.root = new THREE.Group();
        this.root.name = 'stoneAxe';
        this.root.visible = false;
        this.model = null;
        this.attachedBone = null;       // кость, к которой привязан топор
        this.loaded = false;
        this.visible = false;
        this.swingTime = 0;
        this._originalBoneRotation = null;  // исходный поворот кости (для swing)
        this._swingActive = false;
        this._loadAxe();
    }

    _loadAxe() {
        const loader = new GLTFLoader();
        loader.load(
            AXE_MODEL_PATH,
            (gltf) => {
                this.model = gltf.scene;

                // 1. Конвертация см → м за один шаг:
                //    Размер raw: 39.79 x 222.04 x 120.02 (сантиметры)
                //    Сначала ×0.01 → 0.40 x 2.22 x 1.20 метров
                //    Потом нормализуем под TARGET_LENGTH (0.65 м):
                //      - найти макс размер в метрах = 2.22
                //      - scale = TARGET_LENGTH / 2.22 = 0.293
                //      - финальный scale = 0.01 × 0.293 = 0.00293
                //    ⚠️ Дважды setScalar/multiplyScalar — не нужно!
                const box = new THREE.Box3().setFromObject(this.model);
                const size = box.getSize(new THREE.Vector3());
                let rawSize = size.clone();
                // Конвертация см → м (если модель в см)
                if (Math.max(size.x, size.y, size.z) > 50) {
                    // ⚠️ ОДИН раз: умножаем на 0.01 (для конвертации)
                    //    Потом нормализуем под TARGET_LENGTH в один проход
                    this.model.scale.setScalar(0.01);
                    this.model.updateMatrixWorld(true);
                    rawSize = new THREE.Box3().setFromObject(this.model).getSize(new THREE.Vector3());
                }
                const length = Math.max(rawSize.x, rawSize.y, rawSize.z);
                if (length > 0.01) {
                    // ✅ Используем multiplyScalar (умножение, не setScalar)
                    //    Это корректно: было 0.01, станет 0.01 × 0.293 = 0.00293
                    //    Размер модели: 2.22 м × 0.293 = 0.65 м ✓
                    this.model.scale.multiplyScalar(TARGET_LENGTH / length);
                    console.log(`[StoneAxe] Финальный scale: ${this.model.scale.x.toFixed(4)}`);
                }

                // 2. Центрируем: низ рукояти на y=0
                const scaledBox = new THREE.Box3().setFromObject(this.model);
                const center = scaledBox.getCenter(new THREE.Vector3());
                this.model.position.x -= center.x;
                this.model.position.z -= center.z;
                this.model.position.y -= scaledBox.min.y;

                // 3. Если горизонтально — поворот вертикально
                if (rawSize.x > rawSize.y * 1.5) {
                    this.model.rotation.z = Math.PI / 2;
                }

                // 4. Тени
                this.model.traverse((o) => {
                    if (o.isMesh) {
                        o.castShadow = true;
                        o.receiveShadow = true;
                        o.frustumCulled = false;
                    }
                });

                this.root.add(this.model);
                this.loaded = true;
                console.log('[StoneAxe] Загружен, готов к привязке');

                // ✅ Если привязка была запрошена до загрузки — выполнить сейчас
                if (this._pendingBone) {
                    this.attachToBone(this._pendingBone, this._pendingOffset);
                    this._pendingBone = null;
                    this._pendingOffset = null;
                }
            },
            (progress) => {
                if (progress.total) {
                    console.log(`[StoneAxe] Загрузка: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
                }
            },
            (error) => console.error('[StoneAxe] Ошибка загрузки:', error)
        );
    }

    // ✅ Привязать топор к кости (mixamorigRightHand)
    attachToBone(bone, offset = null) {
        if (!this.loaded) {
            console.warn('[StoneAxe] Модель ещё не загружена — отложенная привязка');
            this._pendingBone = bone;
            this._pendingOffset = offset;
            return;
        }
        this.attachedBone = bone;
        if (this.root.parent) this.root.parent.remove(this.root);
        bone.add(this.root);

        // ✅ Установить scale напрямую (без компенсации родителей).
        //    Mesh size в метрах (после ×0.01): 2.22 м.
        //    Хотим итоговый размер 0.65 м (с учётом масштаба модели игрока ~1.15).
        //    Если axe.model.scale = 0.29, итоговый размер = 2.22 × 0.29 × 1.15 ≈ 0.74 м (немного больше — OK)
        //    Если parent scale меньше 1 (есть 0.01 в иерархии), итог будет 2.22 × 0.29 × 1.12 = 0.72 м
        this.model.scale.setScalar(0.29);
        console.log(`[StoneAxe] Scale = 0.29 (итоговый размер ~0.65-0.74 м)`);

        // ✅ Позиция: топор ВНУТРИ кисти (центр рукояти в ладони правой руки)
        this.root.position.copy(offset || new THREE.Vector3(0.0, 0.0, 0.0));
        // ✅ Поворот топора (как в Rust 1-м лице):
        //    После поднятия руки (RightArm.rotation.x = 1.0), кисть направлена ВПЕРЁД.
        //    Хотим: лезвие слева (по центру), рукоять вверх-вправо (диагональ 45°).
        //    rotation.x = -0.5 → наклон лезвия вверх-вперёд
        //    rotation.y = -0.4 → лезвие влево
        //    rotation.z = 0.4 → рукоять вверх-вправо
        this.root.rotation.set(-0.5, -0.4, 0.4);
        console.log('[StoneAxe] ✅ Привязан к кости', bone.name);
    }

    setVisible(v) {
        this.visible = v;
        this.root.visible = v;
    }

    triggerSwing() {
        if (!this.loaded || !this.visible) return;
        if (!this.attachedBone) return; // не привязан — свинг невозможен
        this.swingTime = SWING_TOTAL;
        // Сохраняем исходный поворот кости (для возврата)
        if (!this._originalBoneRotation) {
            this._originalBoneRotation = this.attachedBone.rotation.clone();
        }
        this._swingActive = true;
    }

    // Обновление каждый кадр (вызывается из main.js / preview.js)
    update(dt, opts = {}) {
        if (!this.loaded || !this.visible) return;
        if (this.swingTime > 0) {
            this.swingTime -= dt;
            if (this.swingTime < 0) this.swingTime = 0;
            this._applySwing();
        } else if (this._swingActive) {
            // Возврат к исходному повороту кости
            this.attachedBone.rotation.copy(this._originalBoneRotation);
            this._swingActive = false;
        }
    }

    // ✅ Анимация удара — поворачиваем кость rightArm (а не топор)
    //    Тогда ВСЯ рука двигается (как настоящая анимация удара)!
    _applySwing() {
        if (!this.attachedBone || !this._originalBoneRotation) return;
        const t = this.swingTime;
        function easeInOut(x) { return x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x+2, 2)/2; }
        function easeOut(x) { return 1 - Math.pow(1-x, 3); }

        // Находим parent кость (RightForeArm) — поворачиваем её для замаха
        const armBone = this.attachedBone.parent; // RightHand → RightForeArm
        if (!armBone) return;
        if (!this._originalArmRotation) {
            this._originalArmRotation = armBone.rotation.clone();
        }

        if (t > SWING_TOTAL - SWING_PHASES.BACKSWING) {
            // === ЗАМАХ — рука поднимается вправо-вверх-назад ===
            const phaseT = (SWING_TOTAL - t) / SWING_PHASES.BACKSWING;
            const e = easeInOut(phaseT);
            // Поднять руку назад-вверх (rotation.x < 0 = назад)
            armBone.rotation.x = this._originalArmRotation.x - 1.0 * e;
            armBone.rotation.z = this._originalArmRotation.z + 0.4 * e;
        } else if (t > SWING_TOTAL - SWING_PHASES.BACKSWING - SWING_PHASES.STRIKE) {
            // === УДАР — резко вперёд-вниз ===
            const phaseT = (SWING_TOTAL - SWING_PHASES.BACKSWING - t) / SWING_PHASES.STRIKE;
            const e = easeOut(phaseT);
            // Из верхнего положения (rx -1.0) в нижнее (rx +0.8)
            armBone.rotation.x = this._originalArmRotation.x - 1.0 + 1.8 * e;
            armBone.rotation.z = this._originalArmRotation.z + 0.4 - 0.6 * e;
        } else {
            // === ВОЗВРАТ — плавно в idle ===
            const phaseT = (SWING_TOTAL - SWING_PHASES.BACKSWING - SWING_PHASES.STRIKE - t) / SWING_PHASES.RECOVER;
            const e = easeInOut(phaseT);
            // Из конца удара (rx +0.8) в idle (rx 0)
            armBone.rotation.x = this._originalArmRotation.x + 0.8 - 0.8 * e;
            armBone.rotation.z = this._originalArmRotation.z - 0.2 + 0.2 * e;
        }
    }

    dispose() {
        if (this.root.parent) this.root.parent.remove(this.root);
        this.root.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                for (const m of mats) m.dispose();
            }
        });
    }
}
