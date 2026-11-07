// scr/world/crates.js
// ✅ Ящики: деревянный и военный. Размещаются в заправках и амбарах.
//    Открытие на F — показывает UI с лутом.
//    Лут: скрап, компоненты (корпус винтовки/берданки, пружина, труба), метал, МВК.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MILITARY_CRATE_PATH = './scr/3d/military_crate.glb';
const WOODEN_CRATE_PATH  = './scr/3d/wooden_crate.glb';

// ✅ Лут таблицы (что падает из ящика)
// woodenCrate: скрап 4-8, корпус берданки 1, пружина 1-3, труба 1-3, метал 4-16
// militaryCrate: скрап 4-8, корпус винтовки 1, пружина 1-3, труба 1-3, МВК 4-8, редко АК/берданка
// toolCrate: кирка + топор (уже существует в машинах)

function rollLoot(crateType) {
    const loot = [];
    const rnd = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

    if (crateType === 'wooden') {
        loot.push({ id: 'scrap', count: rnd(4, 8) });
        if (Math.random() < 0.6) loot.push({ id: 'metalFragment', count: rnd(4, 16) });
        if (Math.random() < 0.4) loot.push({ id: 'berdanaBody', count: 1 });
        if (Math.random() < 0.5) loot.push({ id: 'spring', count: rnd(1, 3) });
        if (Math.random() < 0.5) loot.push({ id: 'pipe', count: rnd(1, 3) });
    } else if (crateType === 'military') {
        loot.push({ id: 'scrap', count: rnd(4, 8) });
        loot.push({ id: 'rifleBody', count: 1 });
        loot.push({ id: 'mvc', count: rnd(4, 8) });
        if (Math.random() < 0.5) loot.push({ id: 'spring', count: rnd(1, 3) });
        if (Math.random() < 0.5) loot.push({ id: 'pipe', count: rnd(1, 3) });
        if (Math.random() < 0.5) loot.push({ id: 'metalFragment', count: rnd(4, 16) });
        // ✅ Редкий дроп: калаш или берданка (5% шанс)
        if (Math.random() < 0.05) {
            loot.push({ id: Math.random() < 0.5 ? 'ak47' : 'berdana', count: 1 });
        }
    }
    return loot;
}

export class CrateManager {
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.opts = opts;
        this.crates = [];   // { group, type, opened, loot, hitbox }
        this.loader = new GLTFLoader();
        this.gltfMilitary = null;
        this.gltfWooden = null;
        this.onOpenCrate = opts.onOpenCrate || (() => {});
    }

    async load() {
        const [mil, wood] = await Promise.all([
            new Promise((ok, no) => this.loader.load(MILITARY_CRATE_PATH, ok, undefined, no)),
            new Promise((ok, no) => this.loader.load(WOODEN_CRATE_PATH, ok, undefined, no)),
        ]);
        this.gltfMilitary = mil;
        this.gltfWooden = wood;
        console.log('[Crates] Модели загружены');
    }

    // ✅ Разместить ящик в позиции
    spawnCrate(type, x, y, z, rotY = 0) {
        const gltf = (type === 'military') ? this.gltfMilitary : this.gltfWooden;
        if (!gltf) return null;
        const proto = gltf.scene;
        const model = proto.clone(true);
        model.traverse(o => {
            if (o.isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
                if (o.material) {
                    o.material.side = THREE.DoubleSide;
                    if (o.material.map) o.material.map.anisotropy = 8;
                }
            }
        });
        // масштаб — ящики ~1м
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const len = Math.max(size.x, size.y, size.z);
        if (len > 0.001) {
            model.scale.multiplyScalar(1.0 / len);
            model.updateMatrixWorld(true);
        }
        const group = new THREE.Group();
        group.add(model);
        group.position.set(x, y, z);
        group.rotation.y = rotY;
        this.scene.add(group);

        // хитбокс для raycast
        const hitbox = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 1.2, 1.2),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        hitbox.position.set(x, y + 0.6, z);
        hitbox.userData.isCrate = true;
        hitbox.userData.crateType = type;
        hitbox.userData.crate = null;  // установим ниже
        this.scene.add(hitbox);

        const crate = {
            group, type, hitbox,
            opened: false,
            loot: rollLoot(type),
        };
        hitbox.userData.crate = crate;
        this.crates.push(crate);
        return crate;
    }

    // ✅ Разместить ящики в заправке
    spawnInGasStation(gsPos) {
        // 1 военный + 3 деревянных + 2 инструментальных (в машинах уже есть)
        const offsets = [
            { type: 'military', dx: -3, dz: -2 },
            { type: 'wooden', dx: 2, dz: -3 },
            { type: 'wooden', dx: 3, dz: 2 },
            { type: 'wooden', dx: -2, dz: 3 },
        ];
        for (const o of offsets) {
            const x = gsPos.x + o.dx;
            const z = gsPos.z + o.dz;
            const y = 0;  // ground height установится в place
            this.spawnCrate(o.type, x, y, z, Math.random() * Math.PI * 2);
        }
    }

    // ✅ Разместить ящики в амбаре
    spawnInWarehouse(whPos) {
        // 2 военных + 4 деревянных + 2 инструментальных
        const offsets = [
            { type: 'military', dx: -5, dz: -3 },
            { type: 'military', dx: 5, dz: 3 },
            { type: 'wooden', dx: -4, dz: 2 },
            { type: 'wooden', dx: 4, dz: -2 },
            { type: 'wooden', dx: -2, dz: 4 },
            { type: 'wooden', dx: 2, dz: -4 },
        ];
        for (const o of offsets) {
            const x = whPos.x + o.dx;
            const z = whPos.z + o.dz;
            const y = 0;
            this.spawnCrate(o.type, x, y, z, Math.random() * Math.PI * 2);
        }
    }

    // ✅ Найти ящик по объекту попадания
    findCrate(obj) {
        let cur = obj;
        while (cur) {
            if (cur.userData && cur.userData.isCrate && cur.userData.crate) {
                return cur.userData.crate;
            }
            cur = cur.parent;
        }
        return null;
    }

    // ✅ Открыть ящик — вернуть лут
    openCrate(crate) {
        if (!crate || crate.opened) return null;
        crate.opened = true;
        const loot = crate.loot;
        // ✅ Ящик становится "пустым" — можно сделать визуально (опустить крышку и т.д.)
        // Пока просто возвращаем лут
        return loot;
    }

    // ✅ Обновление (пока пусто — ящики статичны)
    update(dt) {
        // можно добавить анимацию покачивания или открытия
    }
}
