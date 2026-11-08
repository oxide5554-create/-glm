// scr/world/crates.js
// ✅ Ящики: деревянный, военный, инструментальный, toolbox.
//    Можно открывать сколько угодно раз. Пустой ящик остаётся.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MILITARY_CRATE_PATH = './scr/3d/military_crate.glb';
const WOODEN_CRATE_PATH  = './scr/3d/wooden_crate.glb';

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
            loot: rollLoot(type),
            _slots: null,
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

    update(dt) {}
}
