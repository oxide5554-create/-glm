// scr/world/crates.js
// ✅ Ящики: деревянный, военный, инструментальный, toolbox.
//    ✅ НОВОЕ: рандомный лут при каждом спавне/респавне (rollLoot).
//    ✅ НОВОЕ: пустой ящик исчезает и возвращается через:
//              - 5 минут  для wooden / tool / toolbox
//              - 25 минут для military
//    ✅ НОВОЕ: при респавне лут ПЕРЕ-брасывается (новый random).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MILITARY_CRATE_PATH = './scr/3d/military_crate.glb';
const WOODEN_CRATE_PATH  = './scr/3d/wooden_crate.glb';

// ✅ НОВОЕ: таймеры респавна в СЕКУНДАХ (т.к. update(dt) получает dt в секундах).
const RESPAWN_TIMES_SEC = {
    wooden:   5 * 60,     // 5 минут
    tool:     5 * 60,     // 5 минут (инструментальный ящик — обычный)
    toolbox:  5 * 60,     // 5 минут
    military: 25 * 60,    // 25 минут (военный — редкий лут, дольше)
};

// ✅ rollLoot — генерирует случайный лут в зависимости от типа ящика.
//    Вызывается ПРИ СПАВНЕ и при РЕСПАВНЕ (каждый раз новый random).
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
        if (Math.random() < 0.05) {
            loot.push({ id: Math.random() < 0.5 ? 'ak47' : 'berdana', count: 1 });
        }
    } else if (crateType === 'tool') {
        loot.push({ id: 'stonePickaxe', count: 1 });
        loot.push({ id: 'rock', count: 1 });
        if (Math.random() < 0.5) loot.push({ id: 'scrap', count: rnd(2, 5) });
    } else if (crateType === 'toolbox') {
        loot.push({ id: 'scrap', count: rnd(3, 6) });
        if (Math.random() < 0.5) loot.push({ id: 'metalFragment', count: rnd(2, 8) });
        if (Math.random() < 0.3) loot.push({ id: 'spring', count: rnd(1, 2) });
        if (Math.random() < 0.3) loot.push({ id: 'pipe', count: 1 });
    }
    return loot;
}

export class CrateManager {
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.opts = opts;
        this.crates = [];
        this.loader = new GLTFLoader();
        this.gltfMilitary = null;
        this.gltfWooden = null;
        this.onOpenCrate = opts.onOpenCrate || (() => {});
        this.getGroundHeight = opts.getGroundHeight || ((x, z) => 0);
        // ✅ НОВОЕ: ссылка на inventory — нужна чтобы корректно определить
        //    "ящик пуст" (учитывая и loot, и _slots, и что игрок мог добавить предметы).
        this.getInventory = opts.getInventory || (() => null);
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

    spawnCrate(type, x, z, rotY = 0) {
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
        if (type === 'tool' || type === 'toolbox') {
            model.traverse(o => {
                if (o.isMesh && o.material && o.material.color) {
                    o.material = o.material.clone();
                    o.material.color.multiplyScalar(0.6);
                }
            });
        }
        let box = new THREE.Box3().setFromObject(model);
        let size = box.getSize(new THREE.Vector3());
        let len = Math.max(size.x, size.y, size.z);
        if (len > 0.001) {
            model.scale.multiplyScalar(1.0 / len);
            model.updateMatrixWorld(true);
        }
        box = new THREE.Box3().setFromObject(model);
        const minY = box.min.y;
        model.position.y -= minY;
        model.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(model);
        size = box.getSize(new THREE.Vector3());
        const y = this.getGroundHeight(x, z);
        const group = new THREE.Group();
        group.add(model);
        group.position.set(x, y, z);
        group.rotation.y = rotY;
        this.scene.add(group);

        const hbW = Math.max(0.8, size.x * 1.1);
        const hbH = Math.max(0.8, size.y);
        const hbD = Math.max(0.8, size.z * 1.1);
        const hitbox = new THREE.Mesh(
            new THREE.BoxGeometry(hbW, hbH, hbD),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        hitbox.position.set(x, y + hbH / 2, z);
        hitbox.userData.isCrate = true;
        hitbox.userData.crateType = type;
        hitbox.userData.crate = null;
        this.scene.add(hitbox);

        const crate = {
            group, type, hitbox,
            loot: rollLoot(type),       // ✅ рандомный лут при спавне
            _slots: null,
            // ✅ НОВОЕ: поля для респавна
            isEmpty: false,             // ящик пуст (скрыт, ждёт респавна)?
            respawnTimer: 0,            // сколько секунд осталось до респавна
            // Сохраняем позицию/поворот чтобы respawn() мог пересоздать визуал
            _spawnPos: { x, y, z, rotY },
        };
        hitbox.userData.crate = crate;
        model.traverse(o => {
            if (o.isMesh) {
                o.userData.isCrate = true;
                o.userData.crateType = type;
                o.userData.crate = crate;
            }
        });
        this.crates.push(crate);
        return crate;
    }

    spawnInGasStation(gsPos) {
        const offsets = [
            { type: 'military', dx: -3, dz: -2 },
            { type: 'wooden', dx: 2, dz: -3 },
            { type: 'wooden', dx: 3, dz: 2 },
            { type: 'wooden', dx: -2, dz: 3 },
            { type: 'tool', dx: -4, dz: 1 },
            { type: 'tool', dx: 4, dz: -1 },
        ];
        for (const o of offsets) {
            this.spawnCrate(o.type, gsPos.x + o.dx, gsPos.z + o.dz, Math.random() * Math.PI * 2);
        }
    }

    spawnInWarehouse(whPos) {
        const offsets = [
            { type: 'military', dx: -5, dz: -3 },
            { type: 'military', dx: 5, dz: 3 },
            { type: 'wooden', dx: -4, dz: 2 },
            { type: 'wooden', dx: 4, dz: -2 },
            { type: 'wooden', dx: -2, dz: 4 },
            { type: 'wooden', dx: 2, dz: -4 },
            { type: 'tool', dx: 0, dz: -3 },
            { type: 'tool', dx: 0, dz: 3 },
        ];
        for (const o of offsets) {
            this.spawnCrate(o.type, whPos.x + o.dx, whPos.z + o.dz, Math.random() * Math.PI * 2);
        }
    }

    spawnAtCheckBlock(pos) {
        const isMilitary = Math.random() < 0.05;
        const type = isMilitary ? 'military' : 'wooden';
        const angle = Math.random() * Math.PI * 2;
        const dist = 1.5 + Math.random() * 0.8;
        const x = pos.x + Math.cos(angle) * dist;
        const z = pos.z + Math.sin(angle) * dist;
        return this.spawnCrate(type, x, z, Math.random() * Math.PI * 2);
    }

    spawnToolboxInTruck(truckPos, offset = { dx: 0, dz: 0 }) {
        const x = truckPos.x + (offset.dx || 0);
        const z = truckPos.z + (offset.dz || 0);
        return this.spawnCrate('toolbox', x, z, Math.random() * Math.PI * 2);
    }

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

    openCrate(crate) {
        if (!crate) return null;
        return crate.loot;
    }

    // ✅ НОВОЕ: проверка — ящик полностью пуст?
    //    Учитываем и crate.loot (после syncToInventory в crateUI.js),
    //    и crate._slots (если UI ещё открыт и sync не отработал).
    isCrateEmpty(crate) {
        if (!crate) return false;
        // Если _slots есть — это более свежее состояние (UI ещё открыт или только закрылся)
        if (crate._slots) {
            // _slots — массив слотов; пустой если каждый слот null/empty
            for (const s of crate._slots) {
                if (s && s.id && s.count > 0) return false;
            }
            return true;
        }
        // Иначе смотрим crate.loot
        return !crate.loot || crate.loot.length === 0;
    }

    // ✅ НОВОЕ: скрыть ящик (визуально + из raycast) и запустить таймер респавна.
    //    Вызывается из update() когда isCrateEmpty()==true и ящик ещё не скрыт.
    _hideAndScheduleRespawn(crate) {
        if (crate.isEmpty) return;  // уже скрыт
        crate.isEmpty = true;
        crate.respawnTimer = RESPAWN_TIMES_SEC[crate.type] ?? (5 * 60);
        crate._slots = null;       // сбрасываем слоты UI
        crate.loot = [];           // явно пустой
        // Скрываем визуал. visible=false также убирает из raycast
        // (Three.js Raycaster пропускает невидимые объекты).
        crate.group.visible = false;
        crate.hitbox.visible = false;
        // Сообщение в консоль для отладки
        const mins = (crate.respawnTimer / 60).toFixed(0);
        console.log(`[Crates] ${crate.type} ящик пуст — скрыт. Респавн через ${mins} мин.`);
    }

    // ✅ НОВОЕ: респавн ящика — новый рандомный лут, показываем обратно.
    _respawn(crate) {
        crate.isEmpty = false;
        crate.respawnTimer = 0;
        crate.loot = rollLoot(crate.type);   // ✅ НОВЫЙ random лут
        crate._slots = null;
        crate.group.visible = true;
        crate.hitbox.visible = true;
        console.log(`[Crates] ${crate.type} ящик респавнулся — новый лут (${crate.loot.length} stacks).`);
    }

    // ✅ НОВОЕ: главный update — вызывается каждый кадр из main.js animate loop.
    //    1. Проверяет пустые ящики → скрывает их + запускает таймер.
    //    2. Тикает таймеры → респавнит ящики с новым лутом.
    update(dt) {
        for (const crate of this.crates) {
            if (crate.isEmpty) {
                // Ящик скрыт — тикаем таймер
                if (crate.respawnTimer > 0) {
                    crate.respawnTimer -= dt;
                    if (crate.respawnTimer <= 0) {
                        this._respawn(crate);
                    }
                }
            } else {
                // Ящик видимый — проверяем не пустой ли он стал
                // (игрок мог забрать последний предмет через UI)
                if (this.isCrateEmpty(crate)) {
                    this._hideAndScheduleRespawn(crate);
                }
            }
        }
    }
}
