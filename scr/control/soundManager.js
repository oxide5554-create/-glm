// scr/control/soundManager.js — Универсальный менеджер звуков
import * as THREE from 'three';

export class SoundManager {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.loader = new THREE.AudioLoader();
    this.buffers = {};
  }

  // Загрузить звук по имени
  load(name, path) {
    this.loader.load(path, (buffer) => {
      this.buffers[name] = buffer;
      console.log(`[Sound] Загружен: ${name}`);
    }, undefined, (err) => {
      console.warn(`[Sound] Ошибка загрузки ${name}:`, err);
    });
  }

  // Проиграть звук
  play(name, opts = {}) {
    const buffer = this.buffers[name];
    if (!buffer) return null;
    const sound = new THREE.Audio(this.listener);
    sound.setBuffer(buffer);
    sound.setVolume(opts.volume !== undefined ? opts.volume : 1);
    if (opts.rate) sound.setPlaybackRate(opts.rate);
    sound.play();
    return sound;
  }

  // Проиграть случайный звук из списка
  playRandom(names, opts = {}) {
    const name = names[Math.floor(Math.random() * names.length)];
    return this.play(name, opts);
  }
}
