// ============================================================================
//  scr/world/bear.js
//  ЧЁРНЫЙ МЕДВЕДЬ (модель из Call of the Wild: скелет 109 костей,
//  15 анимаций, встроенная текстура).
//
//  Модель: ./scr/3d/black_bear.glb  (лицом в +Z, размер реальный ~2.3 м)
//  Анимации in-place — перемещение медведя выполняет код (wrapper-группа).
//
//  ИИ (стейт-машина):
//    idle     — стоит, принюхивается, иногда встаёт на задние лапы
//    wander   — бродит вокруг точки спавна (walk_fwd)
//    alerted  — заметил игрока: рычит, встаёт (bark / stand)
//    chase    — преследует (canter / run)
//    attack   — атака (attack_01), урон в середине замаха
//    dead     — смерть (dead_reaction_lft/rgt), труп лежит до полной добычи.
//               После полной добычи туша исчезает и через RESPAWN_DELAY
//               секунд на этом же месте появляется новый медведь.
//
//  ДОБЫЧА С ТУШИ:
//    - Удар инструментом по трупу → 1–3 ед. рандомного ресурса
//    - Пул ресурсов: rawMeat=10, bone=20, cloth=15, animalFat=30
//    - Когда пул исчерпан → труп удаляется и ставится таймер респавна
//
//  API:
//    const mgr = new BearManager(scene, opts)
//    await mgr.load()               — загрузить модель (один раз)
//    mgr.spawn(count, isSafePos)    — заспавнить медведей
//    mgr.update(dt, cameraPos, ctx) — обновлять ИИ каждый кадр
//    mgr.raycastHit(raycaster)      — проверка попадания (возвращает медведя)
//    mgr.meleeHit(point, maxDist)   — ближний удар
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { getGroundHeight } from './terrain.js';

const BEAR_MODEL_PATH = './scr/3d/black_bear.glb';

// ---------- настройки ----------
export const BEAR_SETTINGS = {
    count: 6,               // сколько медведей на карте
    health: 220,            // HP медведя
    walkSpeed: 1.7,         // м/с — блуждание
    canterSpeed: 4.4,       // м/с — преследование (галоп)
    runSpeed: 6.2,          // м/с — рывок, если игрок далеко
    detectRadius: 22,       // базовый радиус обнаружения игрока (м)
    aggroBoostRadius: 11,   // ближе этого — атака сразу из idle
    attackRange: 2.6,       // дистанция начала атаки
    attackHitRange: 3.3,    // дистанция, на которой удар наносит урон
    attackDamage: 27,       // урон по игроку за удар
    attackCooldown: 0.9,    // пауза между атаками (сек)
    giveUpDist: 55,         // дальше этого — медведь отстаёт
    wanderRadius: 42,       // радиус блуждания от "дома"
    corpseTime: 999999,     // труп лежит до полной добычи (число просто большое)
    updateRadius: 180,      // дальше этого медведь "заморожен" (оптимизация)
    cullDist: 190,          // для distance culling
    // --- добыча с трупа ---
    harvestPerHitMin: 1,    // минимум ресурсов за один удар по туше
    harvestPerHitMax: 3,    // максимум
    harvestDrops: {         // сколько всего можно добыть с одной туши
        rawMeat:   10,
        bone:      20,
        cloth:     15,
        animalFat: 30,
    },
    respawnDelay: 600,      // 10 минут до появления нового медведя
};

// ---------- имена анимаций ----------
const A = {
    idle:      'bear_idle_static_pose_01',
    smell1:    'bear_idle_smell_01',
    smell2:    'bear_idle_smell_02',
    eat:       'bear_idle_eat_01',
    bark:      'bear_idle_bark_01',
    stand:     'bear_idle_stand_oneoff_01',
    alertBark: 'bear_idle_alerted_bark_01',
    hit:       'bear_hit_chest_front_01',
    hitAlert:  'bear_hit_alerted_chest_front_01',
    walk:      'black_bear_walk_fwd',
    canter:    'bear_canter_fwd_01',
    run:       'bear_run_fwd_01',
    attack:    'bear_attack_01',
    deadL:     'bear_dead_reaction_lft_01',
    deadR:     'bear_dead_reaction_rgt_01',
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// ============================================================================
//  МЕДВЕДЬ
// ============================================================================
class Bear {
    constructor(manager, gltf, index) {
        this.manager = manager;
        this.index = index;
        this.dead = false;

        // wrapper — двигаем/поворачиваем его; внутри — модель сkeleton clone
        this.group = new THREE.Group();
        this.group.name = 'bear_' + index;
        this.model = skeletonClone(gltf.scene);
        // модель смотрит в +Z — wrapper.rotation.y = atan2(dir.x, dir.z)
        this.model.traverse(o => {
            if (o.isMesh || o.isSkinnedMesh) {
                o.castShadow = true;
                o.receiveShadow = false;
                o.frustumCulled = false;      // скелетка сама не куллится корректно
                if (o.material) {
                    o.material.roughness = 0.92;
                    o.material.metalness = 0.0;
                }
            }
        });
        // лёгкий вариативный размер
        this.sizeScale = 0.92 + Math.random() * 0.2;
        this.model.scale.setScalar(this.sizeScale);
        this.group.add(this.model);

        // анимации
        this.mixer = new THREE.AnimationMixer(this.model);
        this.actions = {};
        for (const clip of gltf.animations) {
            const action = this.mixer.clipAction(clip);
            action.enabled = true;
            this.actions[clip.name] = action;
        }

        // хитбокс (невидимый, но ловит рейкасты)
        const hitGeo = new THREE.BoxGeometry(1.0, 1.35, 2.5);
        this.hitbox = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
        this.hitbox.position.set(0, 0.65, 0.25);
        this.hitbox.userData.isBear = true;
        this.hitbox.userData.bear = this;
        this.group.add(this.hitbox);

        // стейт
        this.state = 'idle';
        this.health = BEAR_SETTINGS.health;
        this.maxHealth = BEAR_SETTINGS.health;
        this.stateT = 0;          // время в состоянии (растёт)
        this.stateDur = 2;        // сколько длится фаза
        this.aggression = 0.65 + Math.random() * 0.35;   // индивидуальная агрессия
        this.home = new THREE.Vector3();
        this.target = new THREE.Vector3();               // куда идём при wander
        this.attackHitDone = false;                       // урон в этом замахе нанесён?
        this.avoidT = 0;                                  // таймер обхода препятствия
        this.avoidDir = 1;
        this.yaw = Math.random() * Math.PI * 2;
        this.corpseT = 0;
        this.sinking = false;
        this._obstacleT = 0;

        // сразу играем idle
        this.play(A.idle, { loop: true });
    }

    // ------------------------------------------------------------------
    place(x, z) {
        this.home.set(x, getGroundHeight(x, z), z);
        this.group.position.copy(this.home);
        this.group.rotation.y = this.yaw;
        this.state = 'idle';
        this.stateT = 0;
        this.stateDur = 1 + Math.random() * 4;
        this.play(A.idle, { loop: true });
    }

    play(name, opts = {}) {
        const next = this.actions[name];
        if (!next) return null;
        const cur = this.currentAction;
        if (cur && cur !== next) {
            next.reset();
            next.setEffectiveWeight(1);
            next.crossFadeFrom(cur, opts.fade !== undefined ? opts.fade : 0.22, false);
        } else {
            next.reset();
        }
        next.setLoop(opts.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        next.clampWhenFinished = !opts.loop;
        next.play();
        this.currentAction = next;
        this.currentAnimName = name;
        this.currentAnimDur = next.getClip().duration;
        return next;
    }

    faceTowards(dx, dz, dt, turnSpeed = 5) {
        // ✅ Во время активного обхода препятствия — не перенаправляем к цели,
        //    чтобы не мешать avoidObstacles крутить медведя в сторону обхода.
        if (this.avoidT > 0) return 0;
        const targetYaw = Math.atan2(dx, dz);
        let d = targetYaw - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * Math.min(1, dt * turnSpeed);
        this.group.rotation.y = this.yaw;
        return Math.abs(d);
    }

    moveForward(dist) {
        if (dist <= 0) return;
        // ✅ Collision-проверка убрана из moveForward — она вызывалась каждый кадр
        //    для каждого медведя и убивала fps (6 медведей × 60 fps × raycast по
        //    ~1000 препятствий = зависание). Стены проверяет avoidObstacles — он
        //    ограничен _obstacleT (раз в 0.3 сек) и использует raycaster с кэшем.
        //    Когда медведь упирается в стену — avoidObstacles активирует обход
        //    (avoidT > 0), и faceTowards не перенаправляет к цели в это время.
        const nx = this.group.position.x + Math.sin(this.yaw) * dist;
        const nz = this.group.position.z + Math.cos(this.yaw) * dist;
        // держим в пределах карты
        const lim = 300;
        if (Math.abs(nx) < lim && Math.abs(nz) < lim) {
            this.group.position.x = nx;
            this.group.position.z = nz;
        }
        this.group.position.y = getGroundHeight(this.group.position.x, this.group.position.z);
    }

    distToPlayer(playerPos) {
        return this.group.position.distanceTo(playerPos);
    }

    // ------------------------------------------------------------------
    //  УРОН ПО МЕДВЕДЮ (без анимации hit-реакции — сразу в погоню)
    // ------------------------------------------------------------------
    damage(amount, ctx) {
        if (this.dead) return;
        this.health -= amount;
        const m = this.manager;
        // ✅ Звук попадания по медведю убран по запросу пользователя
        m.onBearHurt(this, Math.max(0, this.health), this.maxHealth);

        if (this.health <= 0) {
            this.die(ctx);
            return;
        }
        // ✅ Анимация получения урона убрана — медведь сразу бросается в погоню
        if (this.state !== 'attack' && this.state !== 'chase') {
            this.state = 'chase';
            this.stateT = 0;
            this.play(A.canter, { loop: true, fade: 0.12 });
        }
    }

    // ------------------------------------------------------------------
    //  ДОБЫЧА РЕСУРСОВ С ТРУПА
    //  Возвращает объект { itemId: count } того, что игрок получил за этот удар,
    //  либо null, если добывать нечего.
    // ------------------------------------------------------------------
    harvest(ctx) {
        if (!this.dead) return null;
        if (!this.harvestPool) return null;

        // суммарно осталось в пуле
        let remaining = 0;
        for (const k in this.harvestPool) remaining += this.harvestPool[k];
        if (remaining <= 0) return null;

        const min = BEAR_SETTINGS.harvestPerHitMin;
        const max = BEAR_SETTINGS.harvestPerHitMax;
        const hits = min + Math.floor(Math.random() * (max - min + 1));   // 1..3

        // доступные ключи (где ещё есть ресурс)
        let keys = Object.keys(this.harvestPool).filter(k => this.harvestPool[k] > 0);
        const drops = {};
        for (let i = 0; i < hits && keys.length > 0; i++) {
            const k = keys[Math.floor(Math.random() * keys.length)];
            this.harvestPool[k] -= 1;
            drops[k] = (drops[k] || 0) + 1;
            if (this.harvestPool[k] <= 0) {
                keys = keys.filter(key => key !== k);
            }
        }

        // проверяем, не исчерпан ли пул полностью
        let stillLeft = 0;
        for (const k in this.harvestPool) stillLeft += this.harvestPool[k];
        if (stillLeft <= 0) {
            // тушка сейчас исчезнет
            this._fullyHarvested = true;
        }
        return drops;
    }

    die(ctx) {
        this.dead = true;
        this.state = 'dead';
        this.corpseT = 0;
        this.sinking = false;
        this._fullyHarvested = false;
        // ✅ Хитбокс ОСТАЁТСЯ в коллайдерах — по туше можно бить и добывать.
        //    isBear тоже остаётся true, чтобы findBear() находил труп.
        // ✅ Пул ресурсов для добычи
        this.harvestPool = Object.assign({}, BEAR_SETTINGS.harvestDrops);
        this.play(Math.random() < 0.5 ? A.deadL : A.deadR, { loop: false, fade: 0.12 });
        this.manager.playSound('death', this.group.position, 1.0);
        this.manager.onBearKilled(this);
    }

    // ------------------------------------------------------------------
    //  АПДЕЙТ ИИ
    // ------------------------------------------------------------------
    update(dt, playerPos, ctx) {
        this.stateT += dt;
        // ✅ Кэшируем список препятствий для moveForward (collision-проверка)
        this._lastObstacles = (ctx && ctx.getObstacles) ? ctx.getObstacles() : null;

        if (this.dead) {
            this.mixer.update(dt);
            // ✅ Труп лежит до полной добычи. После полной добычи — быстро
            //    «тонет» в землю (анимация исчезновения) и удаляется.
            this.corpseT += dt;
            if (this._fullyHarvested && !this.sinking) {
                this.sinking = true;
                // сохраняем стартовую высоту, чтобы тонуть относительно неё
                this._sinkStartY = this.group.position.y;
            }
            if (this.sinking) {
                this.group.position.y -= dt * 0.6;
                if (this.group.position.y < (this._sinkStartY != null ? this._sinkStartY : this.home.y) - 4) {
                    this.manager.removeBear(this, { harvested: true });
                }
            }
            return;
        }

        const dist = this.distToPlayer(playerPos);
        const dx = playerPos.x - this.group.position.x;
        const dz = playerPos.z - this.group.position.z;

        // ---- эффективный радиус обнаружения (присед тише, бег шумнее) ----
        let detect = BEAR_SETTINGS.detectRadius * this.aggression;
        if (ctx.playerCrouching) detect *= 0.45;
        else if (ctx.playerSprinting && ctx.playerMoving) detect *= 1.55;
        else if (ctx.playerMoving) detect *= 1.15;
        // если уже агр — "слышит" дальше
        if (this.state === 'chase' || this.state === 'attack' || this.state === 'hit') detect = Math.max(detect, BEAR_SETTINGS.giveUpDist * 0.8);

        switch (this.state) {
            // ------------------------------------------------------------
            case 'idle': {
                if (dist < detect || dist < BEAR_SETTINGS.aggroBoostRadius) {
                    this.state = 'alerted';
                    this.stateT = 0;
                    this.stateDur = 2.3;                 // длительность фазы «рычания»
                    this._stoodOnce = false;
                    // ✅ Звук «медведь заметил игрока»
                    this.manager.playSound('notice', this.group.position, 1.0);
                    this.play(A.alertBark, { loop: false, fade: 0.1 });
                    break;
                }
                if (this.stateT >= this.stateDur) {
                    // разнообразие: пойти погулять или ещё постоять
                    if (Math.random() < 0.55) {
                        this.pickWanderTarget();
                        this.state = 'wander';
                        this.stateT = 0;
                        this.play(A.walk, { loop: true });
                    } else {
                        this.playIdleFlavor();
                    }
                }
                break;
            }
            // ------------------------------------------------------------
            case 'wander': {
                if (dist < detect || dist < BEAR_SETTINGS.aggroBoostRadius) {
                    this.state = 'alerted';
                    this.stateT = 0;
                    this.stateDur = 2.3;
                    this._stoodOnce = false;
                    // ✅ Звук «медведь заметил игрока»
                    this.manager.playSound('notice', this.group.position, 1.0);
                    this.play(A.alertBark, { loop: false, fade: 0.1 });
                    break;
                }
                const tdx = this.target.x - this.group.position.x;
                const tdz = this.target.z - this.group.position.z;
                const tdist = Math.hypot(tdx, tdz);
                if (tdist < 1.2 || this.stateT >= this.stateDur) {
                    this.state = 'idle';
                    this.stateT = 0;
                    this.stateDur = 2 + Math.random() * 6;
                    this.play(A.idle, { loop: true });
                    break;
                }
                this.faceTowards(tdx, tdz, dt, 3.5);
                this.avoidObstacles(dt, ctx);
                this.moveForward(BEAR_SETTINGS.walkSpeed * dt);
                break;
            }
            // ------------------------------------------------------------
            case 'alerted': {
                this.faceTowards(dx, dz, dt, 6);
                const isAggro = dist < BEAR_SETTINGS.aggroBoostRadius * 1.35 || this.health < this.maxHealth;
                if (dist > BEAR_SETTINGS.giveUpDist) {
                    this.state = 'idle';
                    this.stateT = 0;
                    this.stateDur = 2;
                    this.play(A.idle, { loop: true });
                } else if (this.stateT > 1.1 && !this._stoodOnce) {
                    // после первого «заметил» — встаёт на задние лапы (угроза)
                    this._stoodOnce = true;
                    this.play(A.stand, { loop: false, fade: 0.15 });
                } else if (this.stateT >= this.stateDur) {
                    if (isAggro || dist < BEAR_SETTINGS.detectRadius * 1.6) {
                        this.state = 'chase';
                        this.stateT = 0;
                    } else {
                        this.state = 'idle';
                        this.stateT = 0;
                        this.stateDur = 3;
                        this.play(A.idle, { loop: true });
                    }
                }
                break;
            }
            // ------------------------------------------------------------
            case 'chase': {
                if (dist > BEAR_SETTINGS.giveUpDist) {
                    this.state = 'wander';
                    this.pickWanderTarget();
                    this.play(A.walk, { loop: true });
                    this.manager.onBearGiveUp(this);
                    break;
                }
                // ✅ Игрок высоко (на крыше/дереве/скале) — не могу достичь.
                //    Переходим в состояние wait: стоим под игроком и ждём.
                const dy = playerPos.y - this.group.position.y;
                if (dy > 2.5 && dist < 9) {
                    this.state = 'wait';
                    this.stateT = 0;
                    this.stateDur = 12;   // ждать 12 сек
                    this.play(A.alertBark, { loop: false, fade: 0.2 });
                    this.manager.playSound('notice', this.group.position, 0.6);
                    break;
                }
                const turn = this.faceTowards(dx, dz, dt, 6);
                this.avoidObstacles(dt, ctx);
                // скорость: далеко — бег, ближе — галоп; на крутом повороте притормаживаем
                const speed = (dist > 18 ? BEAR_SETTINGS.runSpeed : BEAR_SETTINGS.canterSpeed) * (turn > 1.2 ? 0.45 : 1);
                this.moveForward(speed * dt);
                // смена анимации бег/галоп на ходу
                const want = dist > 18 ? A.run : A.canter;
                if (this.currentAnimName !== want) this.play(want, { loop: true, fade: 0.25 });
                if (dist < BEAR_SETTINGS.attackRange) {
                    this.state = 'attack';
                    this.stateT = 0;
                    this.stateDur = this.currentAnimDur + BEAR_SETTINGS.attackCooldown * 0.5;
                    this.attackHitDone = false;
                    // ✅ Звук нападения медведя на игрока
                    this.manager.playSound('attack', this.group.position, 0.9);
                    this.play(A.attack, { loop: false, fade: 0.08 });
                }
                break;
            }
            // ------------------------------------------------------------
            case 'attack': {
                this.faceTowards(dx, dz, dt, 3);
                const elapsed = this.stateT;   // время с начала замаха
                // урон в середине замаха (~45% длительности анимации)
                if (!this.attackHitDone && elapsed > this.currentAnimDur * 0.45) {
                    this.attackHitDone = true;
                    if (dist < BEAR_SETTINGS.attackHitRange && !ctx.playerInBuggy) {
                        this.manager.onPlayerDamaged(BEAR_SETTINGS.attackDamage, this);
                    }
                }
                if (elapsed >= this.stateDur) {
                    if (dist < BEAR_SETTINGS.attackRange) {
                        // сразу новый замах
                        this.state = 'attack';
                        this.stateT = 0;
                        this.stateDur = this.currentAnimDur + BEAR_SETTINGS.attackCooldown * 0.5;
                        this.attackHitDone = false;
                        this.play(A.attack, { loop: false, fade: 0.08 });
                    } else {
                        this.state = 'chase';
                        this.stateT = 0;
                    }
                }
                break;
            }
            // ------------------------------------------------------------
            // case 'hit' оставлен для совместимости, но в damage() мы в него
            // больше не переходим — медведь сразу бросается в погоню.
            case 'hit': {
                if (this.stateT >= 0.1) {
                    this.state = 'chase';
                    this.stateT = 0;
                    this.play(A.canter, { loop: true, fade: 0.15 });
                }
                break;
            }
            // ------------------------------------------------------------
            // ✅ WAIT — игрок залез высоко (крыша/дерево/скала), медведь стоит
            //    под ним и ждёт. Если игрок спустится — снова в погоню. Если
            //    время ожидания вышло — уходит в wander.
            // ------------------------------------------------------------
            case 'wait': {
                this.faceTowards(dx, dz, dt, 4);
                // игрок убежал далеко — выходим из ожидания
                if (dist > BEAR_SETTINGS.giveUpDist) {
                    this.state = 'wander';
                    this.pickWanderTarget();
                    this.play(A.walk, { loop: true });
                    this.manager.onBearGiveUp(this);
                    break;
                }
                // игрок спустился ниже 1.5 м — снова в погоню
                const dy = playerPos.y - this.group.position.y;
                if (dy < 1.5 && dist < BEAR_SETTINGS.attackRange * 1.5) {
                    this.state = 'chase';
                    this.stateT = 0;
                    this.play(A.canter, { loop: true, fade: 0.2 });
                    break;
                }
                // время ожидания вышло — медведь уходит
                if (this.stateT >= this.stateDur) {
                    this.state = 'wander';
                    this.pickWanderTarget();
                    this.play(A.walk, { loop: true });
                    this.manager.onBearGiveUp(this);
                }
                break;
            }
        }

        this.mixer.update(dt);
    }

    pickWanderTarget() {
        const a = Math.random() * Math.PI * 2;
        const r = 8 + Math.random() * BEAR_SETTINGS.wanderRadius;
        this.target.set(
            this.home.x + Math.cos(a) * r, 0,
            this.home.z + Math.sin(a) * r
        );
        this.stateT = 0;
        this.stateDur = 6 + Math.random() * 8;   // максимум на путь
    }

    playIdleFlavor() {
        const roll = Math.random();
        let anim = A.smell1;
        if (roll < 0.30) anim = A.smell1;
        else if (roll < 0.55) anim = A.smell2;
        else if (roll < 0.75) anim = A.eat;
        else if (roll < 0.92) anim = A.bark;
        else anim = A.stand;
        this.play(anim, { loop: false, fade: 0.3 });
        this.stateT = 0;
        this.stateDur = 2.5 + Math.random() * 5;
    }

    // ---- обход препятствий (деревья, камни, машины, СКЛАДЫ, ЗАПРАВКИ) ----
    // ✅ Упрощённая версия: один raycaster раз в 0.3 сек, проверка только вперёд.
    //    Обёрнуто в try/catch — любая ошибка не роняет игру.
    //    Если препятствие найдено — медведь поворачивает в случайную сторону на 1.5-2.5 сек.
    avoidObstacles(dt, ctx) {
        this._obstacleT -= dt;
        this.avoidT -= dt;

        // продолжаем активный обход
        if (this.avoidT > 0) {
            this.yaw += this.avoidDir * dt * 3.0;
            this.group.rotation.y = this.yaw;
            return;
        }
        if (this._obstacleT > 0) return;
        if (!ctx || !ctx.getObstacles) return;
        this._obstacleT = 0.3;   // проверяем препятствия каждые 300мс

        try {
            const obstacles = ctx.getObstacles();
            if (!obstacles || obstacles.length === 0) return;
            const ray = this.manager && this.manager._avoidRay;
            if (!ray) return;

            ray.origin.set(this.group.position.x, this.group.position.y + 0.7, this.group.position.z);
            ray.direction.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
            ray.far = 5.0;
            const hits = ray.intersectObjects(obstacles, false);
            if (hits.length > 0 && hits[0].distance < 5.0) {
                // впереди препятствие — обходим в случайную сторону
                this.avoidDir = Math.random() < 0.5 ? 1 : -1;
                this.avoidT = 1.5 + Math.random() * 1.0;
            }
        } catch (e) {
            // любая ошибка raycast — игнорируем, медведь идёт дальше
        }
    }

    dispose() {
        this.mixer.stopAllAction();
        this.hitbox.geometry.dispose();
        this.hitbox.material.dispose();
    }
}

// ============================================================================
//  МЕНЕДЖЕР МЕДВЕДЕЙ
// ============================================================================
export class BearManager {
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.opts = Object.assign({}, opts);
        this.bears = [];
        this.gltf = null;
        this.loader = new GLTFLoader();
        this._avoidRay = new THREE.Raycaster();
        this._moveRay = new THREE.Raycaster();   // ✅ для collision-проверки в moveForward
        this.pendingRespawns = [];   // [{x,z,t,yaw}] — ждут респавна
        this._soundPlayer = opts.playSound || (() => null);
        this._listenerPos = opts.getListenerPos || (() => null);
        this.onBearHurt = opts.onBearHurt || (() => {});
        this.onBearKilled = opts.onBearKilled || (() => {});
        this.onPlayerDamaged = opts.onPlayerDamaged || (() => {});
        this.onBearGiveUp = opts.onBearGiveUp || (() => {});
        this.removeHitboxFromColliders = opts.removeHitboxFromColliders || null;
        this.addHitboxToColliders = opts.addHitboxToColliders || null;
        this.collidersRef = opts.collidersRef || null;
    }

    async load() {
        return new Promise((resolve, reject) => {
            this.loader.load(BEAR_MODEL_PATH, (gltf) => {
                this.gltf = gltf;
                console.log(`[Bear] Модель загружена: ${gltf.animations.length} анимаций`);
                resolve(gltf);
            }, undefined, (err) => {
                console.error('[Bear] Ошибка загрузки модели:', err);
                reject(err);
            });
        });
    }

    // спавн: isSafePos(x, z) → bool (место без построек/дороги)
    spawn(count, isSafePos) {
        if (!this.gltf) { console.warn('[Bear] Модель не загружена — spawn отменён'); return; }
        let placed = 0, attempts = 0;
        while (placed < count && attempts < 500) {
            attempts++;
            const x = (Math.random() - 0.5) * 480;
            const z = (Math.random() - 0.5) * 480;
            if (isSafePos && !isSafePos(x, z)) continue;
            // не слишком близко к другим медведям
            let ok = true;
            for (const b of this.bears) {
                if (Math.hypot(b.home.x - x, b.home.z - z) < 30) { ok = false; break; }
            }
            if (!ok) continue;
            this.spawnBearAt(x, z);
            placed++;
        }
        console.log(`[Bear] Заспавнено медведей: ${placed}/${count}`);
    }

    spawnBearAt(x, z) {
        const bear = new Bear(this, this.gltf, this.bears.length);
        bear.place(x, z);
        this.scene.add(bear.group);
        if (this.addHitboxToColliders) this.addHitboxToColliders(bear.hitbox);
        this.bears.push(bear);
        if (this.opts.registerCull) this.opts.registerCull(bear.group, BEAR_SETTINGS.cullDist, 'bear');
        return bear;
    }

    removeBear(bear, opts = {}) {
        const i = this.bears.indexOf(bear);
        if (i > -1) this.bears.splice(i, 1);
        this.scene.remove(bear.group);
        if (this.removeHitboxFromColliders) this.removeHitboxFromColliders(bear.hitbox);
        bear.dispose();
        // ✅ Если туше полностью добыли — ставим на паузу респавн этого медведя
        //    (через respawnDelay секунд на этом же месте появится новый).
        if (opts.harvested) {
            this.pendingRespawns.push({
                x: bear.home.x,
                z: bear.home.z,
                t: 0,                                // счётчик секунд
                yaw: bear.yaw,
            });
        }
    }

    // главный апдейт (вызывать из animate())
    update(dt, cameraPos, ctx) {
        for (let i = this.bears.length - 1; i >= 0; i--) {
            const bear = this.bears[i];
            const d = bear.group.position.distanceTo(cameraPos);
            if (d > BEAR_SETTINGS.updateRadius) continue;   // заморожен (оптимизация)
            bear.update(dt, cameraPos, ctx);
        }
        // ✅ Обработка очереди респавнов: туши, добытые более respawnDelay сек
        //    назад, заспавнить заново на их «домашней» позиции.
        if (this.pendingRespawns.length > 0) {
            for (let i = this.pendingRespawns.length - 1; i >= 0; i--) {
                const r = this.pendingRespawns[i];
                r.t += dt;
                if (r.t >= BEAR_SETTINGS.respawnDelay) {
                    const bear = this.spawnBearAt(r.x, r.z);
                    if (bear) bear.yaw = r.yaw;
                    this.pendingRespawns.splice(i, 1);
                }
            }
        }
    }

    // попадание рейкастом (АК-47): ближайший ЖИВОЙ хитбокс (по трупам не стреляем)
    raycastHit(raycaster) {
        const boxes = [];
        for (const b of this.bears) if (!b.dead) boxes.push(b.hitbox);
        if (!boxes.length) return null;
        const hits = raycaster.intersectObjects(boxes, false);
        if (hits.length > 0) return { bear: hits[0].object.userData.bear, point: hits[0].point, distance: hits[0].distance };
        return null;
    }

    // ближний удар: медведь в радиусе maxDist перед игроком
    meleeHit(playerPos, dir, maxDist) {
        let best = null, bestD = Infinity;
        for (const b of this.bears) {
            if (b.dead) continue;
            _v1.subVectors(b.group.position, playerPos);
            const d = _v1.length();
            if (d > maxDist + 1.5) continue;
            _v1.normalize();
            if (_v1.dot(dir) < 0.35) continue;    // медведь сбоку/сзади — не бьём
            if (d < bestD) { bestD = d; best = b; }
        }
        return best;
    }

    playSound(name, pos, baseVol = 1) {
        if (!this._soundPlayer) return;
        let vol = baseVol;
        const lp = this._listenerPos ? this._listenerPos() : null;
        if (lp) {
            const d = lp.distanceTo(pos);
            vol = baseVol * Math.max(0, Math.min(1, 1 - d / 45));
            if (vol < 0.04) return;
        }
        this._soundPlayer('bear_' + name, { volume: vol });
    }

    get aliveCount() { return this.bears.filter(b => !b.dead).length; }

    // сколько туш ещё ждут респавна (для дебага/UI)
    get pendingRespawnCount() { return this.pendingRespawns.length; }
}
