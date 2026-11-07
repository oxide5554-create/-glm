// ============================================================================
//  preview.js — Превью игрока от 1-го и 3-го лица
//  Использует:
//  • firstPersonPlayer.js — загружает player.glb + clipping головы
//  • stoneAxe.js — загружает stone_axe.glb (каменный топор)
//
//  Управление:
//  • Мышь — осмотреться (PointerLockControls)
//  • WASD — двигаться (просто летать по сцене для осмотра)
//  • V — переключить 1-е/3-е лицо
//  • T — показать/скрыть топор
//  • C — показать/скрыть игрока (от 1-го лица: clipping)
//  • ЛКМ — замах топором
// ============================================================================

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FirstPersonPlayer } from './scr/3d/firstPersonPlayer.js';
import { StoneAxe } from './scr/3d/stoneAxe.js';

// ============================================================================
// Сцена + рендерер
// ============================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a9c4);
scene.fog = new THREE.Fog(0x87a9c4, 30, 200);
window._scene = scene; // ✅ для отладки через eval

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.position.set(0, 1.7, 0);
scene.add(camera);
window._camera = camera;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true; // ✅ нужно для обрезки головы 1-го лица
window.__renderer = renderer;
document.body.appendChild(renderer.domElement);

// ============================================================================
// Освещение
// ============================================================================
const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3a5a2a, 0.55);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff4d6, 1.6);
sun.position.set(8, 15, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 50;
scene.add(sun);
scene.add(sun.target);

// ============================================================================
// Земля + декор для контекста
// ============================================================================
const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.95 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Несколько камней для теста теней
const stoneGeo = new THREE.DodecahedronGeometry(0.4, 0);
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(stoneGeo, stoneMat);
    s.position.set((Math.random() - 0.5) * 20, 0.2, (Math.random() - 0.5) * 20 + 5);
    s.rotation.set(Math.random(), Math.random(), Math.random());
    s.castShadow = true; s.receiveShadow = true;
    scene.add(s);
}

// Сетка-ориентир
const grid = new THREE.GridHelper(40, 40, 0x444444, 0x222222);
grid.position.y = 0.01;
scene.add(grid);

// ============================================================================
// Управление камерой
// ============================================================================
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

const overlay = document.getElementById('loader');
const loadFill = document.getElementById('load-fill');
const loadLabel = document.getElementById('load-label');

let loaderClickHandler = () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 500);
    try { controls.lock(); } catch (e) {}
};
overlay.addEventListener('click', loaderClickHandler);

// ✅ Прогресс загрузки моделей (трекаем через события)
let totalLoaded = 0;
const totalModels = 2;
function updateLoadProgress(pct, label) {
    loadFill.style.width = pct + '%';
    if (label) loadLabel.textContent = label;
    if (pct >= 100) {
        setTimeout(() => {
            if (overlay.style.display !== 'none') loaderClickHandler();
        }, 300);
    }
}

// ============================================================================
// Загрузка игрока от 1-го лица
// ============================================================================
let firstPersonView = false; // 1-е лицо включено?
let thirdPersonHelper = null; // 3-е лицо: клон игрока для обзора

const fpPlayer = new FirstPersonPlayer(camera);

// ✅ Хак: отслеживаем загрузку модели игрока
const checkInterval = setInterval(() => {
    if (fpPlayer.loaded) {
        totalLoaded++;
        clearInterval(checkInterval);
        updateLoadProgress((totalLoaded / totalModels) * 50, 'Игрок загружен');
        console.log('[Preview] Игрок загружен');
    }
}, 200);

// ============================================================================
// Загрузка каменного топора (привязывается к правой руке игрока)
// ============================================================================
const axe = new StoneAxe();
axe.setVisible(false);  // ✅ Скрыт по умолчанию — покажется когда игрок выберет его

// ✅ Когда модель игрока загрузится — привязать топор к кости RightHand
window.__onPlayerLoaded = (player) => {
    if (player.handBone) {
        axe.attachToBone(player.handBone);
        console.log('[Preview] Топор привязан к правой руке');
    } else {
        console.warn('[Preview] Кость правой руки не найдена');
    }
    // ✅ По умолчанию 1-е лицо включено
    player.setFirstPerson(true);
    // ✅ Показать топор
    axe.setVisible(true);
    axeVisible = true;
};

const checkAxeInterval = setInterval(() => {
    if (axe.loaded) {
        totalLoaded++;
        clearInterval(checkAxeInterval);
        updateLoadProgress((totalLoaded / totalModels) * 50, 'Топор загружен');
        console.log('[Preview] Топор загружен');
    }
}, 200);

// Если через 5 секунд что-то не загрузилось — всё равно открываем
setTimeout(() => {
    if (overlay.style.display !== 'none') {
        updateLoadProgress(100, 'Готово');
        setTimeout(loaderClickHandler, 500);
    }
}, 5000);

// ============================================================================
// Клоны игрока для 3-го лица
// ============================================================================
// Загружаем отдельный экземпляр модели для 3-го лица (полный, без clipping)
let thirdPersonModel = null;
let thirdPersonMixer = null;
{
    const l = new GLTFLoader();
    l.load('./scr/3d/player.glb', (gltf) => {
        thirdPersonModel = gltf.scene;
        // Масштабируем под 1.75м как и 1-е лицо
        const box = new THREE.Box3().setFromObject(thirdPersonModel);
        const size = box.getSize(new THREE.Vector3());
        const scale = 1.75 / size.y;
        thirdPersonModel.scale.setScalar(scale);

        const scaledBox = new THREE.Box3().setFromObject(thirdPersonModel);
        const center = scaledBox.getCenter(new THREE.Vector3());
        thirdPersonModel.position.x -= center.x;
        thirdPersonModel.position.z -= center.z;
        thirdPersonModel.position.y -= scaledBox.min.y; // ступни на y=0

        thirdPersonModel.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
            }
        });

        thirdPersonModel.visible = false; // скрыт, пока не включат 3-е лицо
        scene.add(thirdPersonModel);

        // ✅ AnimationMixer для 3-го лица — Todd стоит с idle-анимацией
        if (gltf.animations && gltf.animations.length > 0) {
            thirdPersonMixer = new THREE.AnimationMixer(thirdPersonModel);
            for (const clip of gltf.animations) {
                const action = thirdPersonMixer.clipAction(clip);
                action.play();
            }
            console.log(`[Preview] 3-е лицо: ${gltf.animations.length} анимаций запущено`);
        }

        console.log('[Preview] 3-е лицо: модель готова');
    });
}

// ============================================================================
// Управление с клавиатуры (полёт по сцене для осмотра)
// ============================================================================
const keys = { w: false, a: false, s: false, d: false, shift: false };

document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyA') keys.a = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyD') keys.d = true;
    if (e.code === 'ShiftLeft') keys.shift = true;

    if (e.code === 'KeyV') toggleView();
    if (e.code === 'KeyT') toggleAxe();
    if (e.code === 'KeyC') togglePlayer();
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') keys.w = false;
    if (e.code === 'KeyA') keys.a = false;
    if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyD') keys.d = false;
    if (e.code === 'ShiftLeft') keys.shift = false;
});

// ЛКМ — замах топора
document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && document.pointerLockElement) {
        axe.triggerSwing();
    }
});

// ============================================================================
// Кнопки управления
// ============================================================================
let viewMode = 'first'; // 'first' | 'third'
let axeVisible = true;
// ✅ По умолчанию тело игрока в 1-м лице ВИДНО (но обрезано clipping'ом — видна только рука).
//    Это и есть настоящая рука из модели игрока (player.glb), без процедурных цилиндров.
let playerVisible = true;
// ✅ Сигнал для firstPersonPlayer: показать тело (будет обрезано — видна только рука)
window.__initialPlayerVisible = true;

function toggleView() {
    viewMode = viewMode === 'first' ? 'third' : 'first';
    updateView();
}

function toggleAxe() {
    axeVisible = !axeVisible;
    axe.setVisible(axeVisible);
    document.getElementById('btn-axe').classList.toggle('active', axeVisible);
    document.getElementById('btn-axe').textContent = axeVisible ? '🪓 Топор: вкл' : '🪓 Топор: выкл';
}

function togglePlayer() {
    playerVisible = !playerVisible;
    document.getElementById('btn-player').classList.toggle('active', playerVisible);
    document.getElementById('btn-player').textContent = playerVisible ? '🧍 Игрок: вкл' : '🧍 Игрок: выкл';
    updateView();
}

function updateView() {
    if (viewMode === 'first') {
        // 1-е лицо: камера внутри головы, clipping + скрыть голову, топор в руках
        if (fpPlayer.model) fpPlayer.model.visible = playerVisible;
        if (thirdPersonModel) thirdPersonModel.visible = false;
        // ✅ Включить 1-е лицо (clipping + скрыть head meshes)
        if (fpPlayer.setFirstPerson) fpPlayer.setFirstPerson(true);
        // Камера на уровне глаз
        camera.position.set(0, 1.7, 0);
        controls.getObject().position.set(0, 1.7, 0);
        document.getElementById('btn-1st').classList.add('active');
        document.getElementById('btn-3rd').classList.remove('active');
    } else {
        // 3-е лицо: камера позади игрока, без clipping, все меши видны
        if (fpPlayer.model) fpPlayer.model.visible = false;
        if (thirdPersonModel) thirdPersonModel.visible = playerVisible;
        // ✅ Выключить clipping (показать всё тело)
        if (fpPlayer.setFirstPerson) fpPlayer.setFirstPerson(false);
        // Камера позади игрока
        camera.position.set(0, 2.0, 4.5);
        controls.getObject().position.set(0, 2.0, 4.5);
        document.getElementById('btn-1st').classList.remove('active');
        document.getElementById('btn-3rd').classList.add('active');
    }
}

document.getElementById('btn-1st').addEventListener('click', () => {
    viewMode = 'first'; updateView();
});
document.getElementById('btn-3rd').addEventListener('click', () => {
    viewMode = 'third'; updateView();
});
document.getElementById('btn-axe').addEventListener('click', toggleAxe);
document.getElementById('btn-player').addEventListener('click', togglePlayer);
document.getElementById('btn-swing').addEventListener('click', () => axe.triggerSwing());

// ✅ Инициализация кнопок под playerVisible = true (тело игрока видно, но обрезано — видна только рука)
document.getElementById('btn-player').classList.add('active');
document.getElementById('btn-player').textContent = '🧍 Игрок: вкл';
// Вызов updateView чтобы синхронизировать видимость модели с playerVisible
setTimeout(() => updateView(), 100);

// ============================================================================
// Главный цикл
// ============================================================================
const clock = new THREE.Clock();
let walkPhase = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    // Движение для осмотра (летаем над землёй)
    if (document.pointerLockElement) {
        const speed = (keys.shift ? 8 : 4) * dt;
        if (keys.w) controls.moveForward(speed);
        if (keys.s) controls.moveForward(-speed);
        if (keys.a) controls.moveRight(-speed);
        if (keys.d) controls.moveRight(speed);

        // В 3-м лице синхронизируем позицию игрока с камерой
        if (viewMode === 'third' && thirdPersonModel) {
            // Игрок стоит в центре, камера смотрит на него
            thirdPersonModel.position.x = 0;
            thirdPersonModel.position.z = 0;
            // Поворот игрока к камере (лицом к ней)
            const camPos = controls.getObject().position;
            const angle = Math.atan2(camPos.x, camPos.z);
            thirdPersonModel.rotation.y = angle;
        }
    }

    // Обновление игрока (пока без анимаций)
    fpPlayer.update(dt);

    // ✅ Обновление 3-го лица (анимация idle Todd'а)
    if (thirdPersonMixer) thirdPersonMixer.update(dt);

    // Обновление топора (анимация покачивания + замах)
    const moving = keys.w || keys.a || keys.s || keys.d;
    axe.update(dt, {
        speed: moving ? (keys.shift ? 1.2 : 0.6) : 0,
        sprint: keys.shift,
        onGround: true,
    });

    // Солнце следует за камерой
    const camPos = controls.getObject().position;
    sun.position.set(camPos.x + 8, camPos.y + 15, camPos.z + 6);
    sun.target.position.copy(camPos);

    renderer.render(scene, camera);
}

// ============================================================================
// Resize
// ============================================================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
console.log('[Preview] Готово');
