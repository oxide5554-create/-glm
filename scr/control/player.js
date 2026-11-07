// scr/control/player.js — с системой присяда (клавиша C)
import * as THREE from 'three';
import { getGroundHeight } from '../world/terrain.js';

export class PlayerController {
    constructor(controls, camera, ground) {
        this.controls = controls;
        this.camera = camera;
        this.ground = ground;
        this.enabled = false;
        
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        
        this.isOnGround = true;
        this.isMoving = false;
        
        this.walkSpeed = 5;
        this.runSpeed = 9;
        this.crouchSpeed = 2.5;      // ✅ Скорость ходьбы в присяде
        this.crouchRunSpeed = 4.5;   // ✅ Скорость бега в присяде
        this.jumpVelocity = 6;
        this.gravity = 18;
        
        // Высоты камеры
        this.standHeight = 1.7;      // Высота стоя
        this.crouchHeight = 1.1;     // ✅ Высота в присяде
        this.playerHeight = this.standHeight;
        
        // ✅ Состояние присяда
        this.isCrouching = false;
        this.currentHeight = this.standHeight; // Текущая (сглаженная) высота
        this.crouchTransition = 0;   // 0 = стоит, 1 = присел (сглаженное)
        
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            sprint: false,
            crouch: false  // ✅ Новая клавиша
        };
        
        this._bindInputs();
    }

    _bindInputs() {
        const keyMap = {
            'KeyW': 'forward', 'ArrowUp': 'forward',
            'KeyS': 'backward', 'ArrowDown': 'backward',
            'KeyA': 'left', 'ArrowLeft': 'left',
            'KeyD': 'right', 'ArrowRight': 'right',
            'Space': 'jump',
            'ShiftLeft': 'sprint', 'ShiftRight': 'sprint',
            'KeyC': 'crouch'  // ✅ Клавиша присяда
        };
        window.addEventListener('keydown', (e) => {
            if (window.chatOpen) return;
            if (keyMap[e.code]) {
                // ✅ Присяд работает как toggle (переключатель) — нажал=присел, ещё раз=встал
                if (e.code === 'KeyC') {
                    if (!e.repeat) {
                        this.isCrouching = !this.isCrouching;
                        // При присяде нельзя бежать
                        if (this.isCrouching) this.keys.sprint = false;
                    }
                }
                this.keys[keyMap[e.code]] = true;
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            if (keyMap[e.code]) {
                this.keys[keyMap[e.code]] = false;
            }
        });
    }

    // ✅ Проверка коллизии позиции игрока с препятствиями (деревья, камни, бочки)
    // Использует world position коллайдера — работает даже для вложенных mesh
    _collidesAt(pos) {
        if (!this.colliders || this.colliders.length === 0) return false;
        const playerRadius = 0.35;  // радиус игрока
        const _v = new THREE.Vector3();
        for (const c of this.colliders) {
            if (!c || !c.userData) continue;
            // Только препятствия
            const isObstacle = c.userData.isTree || c.userData.isStone ||
                               c.userData.isBreakableBarrel;
            if (!isObstacle) continue;
            // World position коллайдера
            c.getWorldPosition(_v);
            const dx = pos.x - _v.x;
            const dz = pos.z - _v.z;
            const dist = Math.hypot(dx, dz);
            // Радиус коллизии
            let radius = 0.8;
            if (c.userData.isTree) radius = 0.5;
            else if (c.userData.isStone) radius = 0.8;
            else if (c.userData.isBreakableBarrel) radius = 0.4;
            if (dist < radius + playerRadius) {
                return true;
            }
        }
        return false;
    }

    update(delta) {
        if (!this.enabled) {
            this.velocity.set(0, 0, 0);
            this.isMoving = false;
            return;
        }

        // ✅ Сглаживание перехода присяд/стояние
        const targetTransition = this.isCrouching ? 1 : 0;
        this.crouchTransition += (targetTransition - this.crouchTransition) * Math.min(1, delta * 10);
        this.currentHeight = this.standHeight + (this.crouchHeight - this.standHeight) * this.crouchTransition;
        this.playerHeight = this.currentHeight;

        // ✅ Определение скорости
        let speed;
        if (this.isCrouching) {
            // В присяде: бег если зажат Shift, иначе ходьба
            speed = this.keys.sprint ? this.crouchRunSpeed : this.crouchSpeed;
        } else {
            speed = this.keys.sprint ? this.runSpeed : this.walkSpeed;
        }

        // ✅ Нельзя бежать в присяде если нет crouchRunSpeed (можно убрать если не нужно)
        // Если присел — Sprint даёт быструю ходьбу, не полный бег

        // ========== 1. ГОРИЗОНТАЛЬНОЕ ДВИЖЕНИЕ ==========
        this.direction.set(0, 0, 0);
        if (this.keys.forward)  this.direction.z -= 1;
        if (this.keys.backward) this.direction.z += 1;
        if (this.keys.left)     this.direction.x -= 1;
        if (this.keys.right)    this.direction.x += 1;
        this.isMoving = this.direction.lengthSq() > 0;

        if (this.isMoving) {
            this.direction.normalize();
            const camForward = new THREE.Vector3();
            this.camera.getWorldDirection(camForward);
            camForward.y = 0;
            camForward.normalize();
            const camRight = new THREE.Vector3();
            camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();
            
            const move = new THREE.Vector3();
            move.addScaledVector(camForward, -this.direction.z);
            move.addScaledVector(camRight, this.direction.x);
            move.normalize().multiplyScalar(speed);
            
            // Плавный разгон и торможение
            this.velocity.x += (move.x - this.velocity.x) * Math.min(delta * 12, 1);
            this.velocity.z += (move.z - this.velocity.z) * Math.min(delta * 12, 1);
        } else {
            // Трение при остановке
            this.velocity.x *= Math.max(1 - delta * 10, 0);
            this.velocity.z *= Math.max(1 - delta * 10, 0);
        }

        const pos = this.camera.position;
        const oldX = pos.x;
        const oldZ = pos.z;

        // ✅ Collision: двигаем по ОДНОЙ оси за раз — позволяет идти вдоль стен
        // X ось
        pos.x = oldX + this.velocity.x * delta;
        if (this._collidesAt(pos)) {
            pos.x = oldX;
            this.velocity.x = 0;
        }
        // Z ось
        pos.z = oldZ + this.velocity.z * delta;
        if (this._collidesAt(pos)) {
            pos.z = oldZ;
            this.velocity.z = 0;
        }

        // ========== 2. ВЕРТИКАЛЬНОЕ ДВИЖЕНИЕ И РЕЛЬЕФ ==========
        const groundY = getGroundHeight(pos.x, pos.z);
        const targetY = groundY + this.playerHeight;

        // ✅ Прыжок: нельзя прыгать в присяде (или можно — раскомментируй)
        if (this.keys.jump && this.isOnGround && !this.isCrouching) {
            this.velocity.y = this.jumpVelocity;
            this.isOnGround = false;
        }

        if (!this.isOnGround) {
            // --- СОСТОЯНИЕ: В ВОЗДУХЕ (Падение или прыжок) ---
            this.velocity.y -= this.gravity * delta;
            pos.y += this.velocity.y * delta;

            // Проверка приземления на землю
            if (pos.y <= targetY && this.velocity.y < 0) {
                pos.y = targetY;
                this.velocity.y = 0;
                this.isOnGround = true;
            }
        } else {
            // --- СОСТОЯНИЕ: НА ЗЕМЛЕ (Следование рельефу) ---
            const diff = targetY - pos.y;
            
            // ✅ При присяде/вставании нужно плавно менять высоту
            // Порог срыва: если земля уходит вниз больше чем на 0.5м, игрок начинает падать
            const maxSmoothDrop = 0.5; 
            
            if (diff < -maxSmoothDrop) {
                // Игрок зашел за край обрыва
                this.isOnGround = false;
            } else {
                // Плавное прилипание к рельефу + переход присяд/стоя
                const lerpFactor = this.isCrouching ? 15 : 25;
                pos.y += diff * Math.min(1, delta * lerpFactor);
                this.velocity.y = 0;
            }
        }
    }

    // ✅ Внешний API для определения состояния анимации
    getState() {
        if (!this.isOnGround) return 'jump';
        if (this.isCrouching) {
            if (this.isMoving) {
                return this.keys.sprint ? 'crouchRun' : 'crouchWalk';
            }
            return 'crouchIdle';
        }
        if (this.isMoving) {
            return this.keys.sprint ? 'run' : 'walk';
        }
        return 'idle';
    }
}
