import * as THREE from 'three';
import { createTruck, createWreckCar, kit } from './vehicles.js';
import { createRustBuggy } from './buggy.js'; // ✅ ДОБАВЛЕНО
import { createBarrel } from '../boch.js';

const { rbox, at, bx, cyl, mk, glassMat, mud, rng, makeRig, attachCollision, bb, BARREL_COLORS, toolbox, jerrycan, crate, H, TAU } = kit;

const cvs = (w, h, draw, rep) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
};

const signTex = (lines, bg, fg, w = 512, h = 128) => cvs(w, h, (x) => {
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) {
    x.fillStyle = `rgba(60,40,20,${Math.random() * 0.12})`;
    x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 12, 0, TAU); x.fill();
  }
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((t, i) => {
    x.font = `bold ${Math.floor(h / lines.length * 0.7)}px sans-serif`;
    x.fillText(t, w / 2, h * (i + 0.5) / lines.length);
  });
});

function grime(m, U) {
  if (!m || m.userData.grime || m.transparent || !m.isMeshStandardMaterial) return;
  m.userData.grime = 1;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBaseY = U;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGY = (modelMatrix * vec4(transformed,1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGY;\nuniform float uBaseY;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat gh = clamp((vGY-uBaseY)/1.5,0.0,1.0);\ndiffuseColor.rgb *= mix(0.55,1.0,gh);');
  };
  m.customProgramCacheKey = () => 'gs-grime';
}

function legacyResolve(rig) {
  const inv = new THREE.Matrix4(), mw = new THREE.Matrix4();
  const p = new THREE.Vector3(), out = new THREE.Vector3();
  return (pos, radius = 0.3, height = 1.7, stepUp = 0.6) => {
    rig.group.updateWorldMatrix(true, false);
    mw.copy(rig.group.matrixWorld); inv.copy(mw).invert();
    p.copy(pos).applyMatrix4(inv);
    const feet = p.y;
    let support = null;
    const inside = (x, z, hx, hz) => Math.abs(p.x - x) < hx + radius * 0.5 && Math.abs(p.z - z) < hz + radius * 0.5;

    for (let it = 0; it < 2; it++) {
      for (const t of rig.tops || []) {
        if (t.hx == null) continue;
        if (t.requireOpen && !rig.isOpen(t.requireOpen)) continue;
        if (!inside(t.x, t.z || 0, t.hx, t.hz)) continue;
        if (feet <= t.y + 0.06 && feet > t.y - 0.65) support = Math.max(support ?? -1e9, t.y);
      }
      for (const s of rig.solids || []) {
        if (s.requireClosed && rig.isOpen(s.requireClosed)) continue;
        if (!inside(s.x, s.z, s.hx, s.hz)) continue;
        if (p.y >= s.top - stepUp && p.y < s.top + 0.06) {
          support = Math.max(support ?? -1e9, s.top);
          continue;
        }
        if (p.y + height <= s.bottom || p.y >= s.top - 0.05) continue;
        const ox = s.hx + radius - Math.abs(p.x - s.x);
        const oz = s.hz + radius - Math.abs(p.z - s.z);
        if (ox > 0 && oz > 0) {
          if (ox < oz) p.x += (p.x > s.x ? ox : -ox);
          else p.z += (p.z > s.z ? oz : -oz);
        }
      }
    }
    let ground = null, grounded = false;
    if (support !== null) {
      if (p.y < support) p.y = support;
      grounded = Math.abs(p.y - support) < 0.05;
      out.set(p.x, support, p.z).applyMatrix4(mw);
      ground = out.y;
    }
    pos.copy(p.applyMatrix4(mw));
    return { ground, grounded };
  };
}

export function createCockpit(camera) {
  const root = new THREE.Group(); camera.add(root);
  const skin = mk(0xdca582, .7, 0, false), sleeve = mk(0x3a4230, .9, 0, false);
  const rubber = mk(0x1a1b1d, .8, .1, false), chrome = mk(0xb8bcc0, .3, .85, false);
  const mount = new THREE.Group(); mount.position.set(0, -.34, -.6); mount.rotation.x = -.5; root.add(mount);
  const spin = new THREE.Group(); mount.add(spin);
  const WR = .2;
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(WR, .021, 10, 40), rubber));
  at(spin, cyl(.055, .06, .05, chrome, 16), 0, 0, 0).rotation.x = H;
  at(spin, rbox(WR * 2, .034, .022, .008, rubber), 0, 0, 0);
  at(spin, rbox(.034, WR, .022, .008, rubber), 0, -WR / 2, 0);
  const wrists = [];
  for (const a of [Math.PI - .38, .38]) {
    const g = new THREE.Group(); g.position.set(Math.cos(a) * WR, Math.sin(a) * WR, 0); g.rotation.z = a; spin.add(g);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skin);
    palm.scale.set(.028, .05, .03); palm.position.set(.012, 0, .04); g.add(palm);
    for (const y of [-.025, -.008, .008, .025]) {
      const f = at(g, cyl(.009, .008, .075, skin, 8), .02, y, .012); f.rotation.x = H;
    }
    const w = new THREE.Object3D(); w.position.set(0, 0, .07); g.add(w); wrists.push(w);
    const arm = at(root, cyl(.045, .035, .55, sleeve, 10), 0, 0, 0); arm.userData.wrist = w;
    g.userData.arm = arm; wrists[wrists.length - 1].userData.arm = arm;
  }
  const dash = rbox(1.7, .22, .45, .03, mk(0x17181a, .8, .1, false));
  dash.position.set(0, -.68, -.6); dash.rotation.x = -.25; root.add(dash);
  let cur = 0, target = 0;
  const v = new THREE.Vector3();
  const api = {
    group: root, steer: 0,
    setSteer(s) { target = Math.max(-1, Math.min(1, s)); api.steer = target; },
    update(dt) {
      dt = Math.min(dt || .016, .05);
      cur += (target - cur) * Math.min(1, dt * 9);
      spin.rotation.z = -cur * 2.2;
      root.updateMatrixWorld(true);
      wrists.forEach((w, i) => {
        const arm = w.userData.arm; if (!arm) return;
        w.getWorldPosition(v); root.worldToLocal(v);
        arm.position.set(v.x * .55, -0.62 + v.y * .45, -0.25 + v.z * .3);
        arm.rotation.set(-.7, 0, (i ? -.35 : .35) - cur * .2);
      });
    },
    setVisible(b) { root.visible = b; },
    dispose() { camera.remove(root); root.traverse(o => { o.geometry && o.geometry.dispose(); }); },
  };
  api.update(.016);
  return api;
}

export function createGasStation(opts = {}) {
  const seed = opts.seed ?? 7, R = rng(seed), rn = (a, b) => a + R() * (b - a);
  const LS = opts.lightScale ?? 1;
  const group = new THREE.Group(), rig = makeRig();
  const boxes = [], lights = [], extras = [], U = { value: 0 };
  // ✅ Серо-белая заправка (убраны все тёплые/розовые цвета):
  //    бетон — серый, стены — бело-серые, тёмные акценты — тёмно-серые.
  const conc = mk(0xa8a8a8, .95, 0);    // бетон — серый
  const wallM = mk(0xe8e8e8, .9, 0);     // стены — бело-серые
  const wallD = mk(0x909090, .9, 0);     // тёмные стены — серые
  const roofM = mk(0x4a4a4a, .9, .1);    // крыша — тёмно-серая
  const steel = mk(0x8a8a8a, .5, .6);    // сталь — серый металлик
  const dark = mk(0x2a2a2a, .7, .5), trim = mk(0x2a2a2a, .8, .2, false), glass = glassMat();

  const solid = (x0,y0,z0,x1,y1,z1,m,collide=true) => {
    const o = at(group, rbox(x1-x0,y1-y0,z1-z0,.02,m), (x0+x1)/2,(y0+y1)/2,(z0+z1)/2);
    if (collide) boxes.push(bb(x0,y0,z0,x1,y1,z1));
    return o;
  };
  const lamp = (x,y,z,col,I,dist) => {
    const l = new THREE.PointLight(col, I * LS, dist, 1);
    l.position.set(x,y,z); group.add(l); lights.push({ l, base: I * LS }); return l;
  };
  const emis = (c,k=1.6) => new THREE.MeshStandardMaterial({ color:c, emissive:c, emissiveIntensity:k, roughness:.4 });

  solid(-11,-.2,-8.4, 11,0,14.5, conc);
  at(group, rbox(6.8,.02,7.7,.005, mk(0xb9b2a2,.8,0)), 4.6,.012,-4.15);

  solid(-1.2,0,-8.3, 1.2,3.8,0, wallD);
  solid(-8.3,0,-8.3, -8,3.8,0, wallM); solid(8,0,-8.3, 8.3,3.8,0, wallM);
  solid(-8,0,-8.3, -1.2,3.8,-8, wallM); solid(1.2,0,-8.3, 8,3.8,-8, wallM);
  solid(-8,0,-.3, -6.65,3.8,0, wallM); solid(-2.45,0,-.3, -1.2,3.8,0, wallM);
  solid(-6.65,3,-.3, -2.45,3.8,0, wallM);
  solid(1.2,0,-.3, 4.2,.9,0, wallM); solid(5.4,0,-.3, 8,.9,0, wallM);
  solid(1.2,2.5,-.3, 8,3.8,0, wallM);
  solid(4.2,0,-.3, 4.2,.9,0, wallM);
  solid(-8.5,3.8,-8.5, 8.5,4.05,.6, roofM,false);
  boxes.push(bb(-8.5,3.8,-8.5,8.5,4.05,.6));

  for (const [x0,x1] of [[1.2,4.2],[5.4,8]]) {
    at(group, bx(x1-x0,1.6,.03,glass), (x0+x1)/2,1.7,-.15);
    boxes.push(bb(x0,.9,-.3,x1,2.5,0));
  }
  at(group, new THREE.Mesh(new THREE.PlaneGeometry(3.6,.6), new THREE.MeshStandardMaterial({ map: signTex(['ГАРАЖ'],'#7a2a1c','#e8d9a8') })), -4.55,3.4,.012);
  at(group, new THREE.Mesh(new THREE.PlaneGeometry(4.4,.8), new THREE.MeshStandardMaterial({ map: signTex(['МАГАЗИН'],'#1f4a2a','#f0ecd0') })), 4.7,3.15,.012);

  {
    const d = rig.hinge('shopDoor', group, [4.2,0,-.15], 'y', -1.5);
    const pm = mk(0x4f5a50,.6,.4);
    at(d, rbox(1.2,.8,.06,.015,pm), .6,.4,0);
    at(d, rbox(1.2,.1,.06,.015,pm), .6,2.35,0);
    for (const x of [.05,1.15]) at(d, rbox(.1,1.6,.06,.015,pm), x,1.6,0);
    at(d, bx(1,1.45,.02,glass), .6,1.6,0);
    at(d, cyl(.015,.015,.5,steel,8), 1.08,1.2,.06);
  }

  const GD = { x:-4.55, N:6, h:.5, zr:-.42, R:.35, L1:3.1, D:3.6, p:0, target:0, dur:4.2 };
  const gdRoot = new THREE.Group(); gdRoot.userData.part = 'garage'; group.add(gdRoot);
  const slatM = mk(0x7c8078,.6,.45), slats = [];
  const pathAt = (s) => {
    if (s <= GD.L1) return [s, GD.zr, 0];
    const arc = GD.R * H;
    if (s <= GD.L1 + arc) {
      const a = (s - GD.L1) / GD.R;
      return [GD.L1 + GD.R*Math.sin(a), GD.zr - GD.R + GD.R*Math.cos(a), -a];
    }
    return [GD.L1 + GD.R, GD.zr - GD.R - (s - GD.L1 - arc), -H];
  };
  for (let i = 0; i < GD.N; i++) {
    const g = new THREE.Group(); gdRoot.add(g); slats.push(g);
    at(g, rbox(4.4,.47,.05,.01,slatM), 0,0,0);
    for (const y of [-.14,.14]) at(g, bx(4.3,.02,.012,dark), 0,y,.03);
    if (i === GD.N-1) for (let k=0;k<4;k++) {
      at(g, rbox(.9,.26,.03,.01,dark), -1.5+k,0,.02);
      at(g, bx(.8,.2,.03,glass), -1.5+k,0,.03);
    }
  }
  const placeSlats = (p) => {
    const e = p*p*(3-2*p);
    slats.forEach((g,i) => {
      const [y,z,th] = pathAt((i+.5)*GD.h + e*GD.D);
      g.position.set(GD.x,y,z); g.rotation.x = th;
    });
  };
  placeSlats(0);
  at(group, rbox(.5,.25,.45,.04,steel), GD.x,3.55,GD.zr-3);

  const goods = [];
  // ✅ Убран красный/розовый — только нейтральные цвета товаров
  const PAL = [0x4a5560,0x6a7480,0x3a4450,0x5a6470,0xe8e0c8,0x8a8e92];
  const shelf = (x,z,rotY,len,depth) => {
    const g = new THREE.Group(); g.position.set(x,0,z); g.rotation.y = rotY;
    group.add(g); g.updateMatrix();
    const bm = mk(0x6a6a6a,.7,.4), ys=[.28,.82,1.36,1.9];
    for (const y of ys) at(g, rbox(len,.035,depth,.008,bm), 0,y-.0175,0);
    for (let i=0;i<=Math.round(len/1.1);i++) for (const s of [-1,1])
      at(g, rbox(.05,2.1,.05,.01,dark), -len/2+i*len/Math.round(len/1.1),1.05,s*(depth/2-.03));
    for (const y of ys) for (let k=0;k<Math.floor(len/.22);k++) {
      const lx = -len/2 + .12 + k*.22;
      if (lx > len/2-.12) break;
      const s = rn(.08,.18), h = rn(.14,.3);
      const v = new THREE.Vector3(lx,y+h/2,0).applyMatrix4(g.matrix);
      goods.push({ v, s:[s,h,.18], c:PAL[R()*PAL.length|0], yaw:g.rotation.y });
    }
    boxes.push(Math.abs(Math.sin(rotY))>.5 ? bb(x-depth/2,0,z-len/2,x+depth/2,2.15,z+len/2) : bb(x-len/2,0,z-depth/2,x+len/2,2.15,z+depth/2));
    return g;
  };
  const tbOn = (g,name,lx,y,lz,yaw=0) => {
    const v = new THREE.Vector3(lx,y,lz).applyMatrix4(g.matrix);
    return toolbox(rig,name,group,v.x,v.y,v.z,yaw+g.rotation.y);
  };

  // ✅ УБРАНО: инструментальные ящики (toolbox) на полках заправки —
  //    пользователь счёл их декорацией. Полки остаются пустыми.
  //    Сами shelf() оставлены — они дают визуальный объект полки + collision box.
  // const gl = shelf(-7.72,-4.3,H,5.2,.5); tbOn(gl,'toolbox_g0',0,.82,0);
  // const gr = shelf(-1.47,-4.3,-H,5.2,.5); tbOn(gr,'toolbox_g1',.5,1.36,0);
  shelf(-7.72,-4.3,H,5.2,.5);
  shelf(-1.47,-4.3,-H,5.2,.5);
  solid(-7.4,.0,-8.0, -5.0,1.1,-7.25, mk(0x6a6e72,.85,.05));
  at(group, rbox(2.4,.08,.7,.015,mk(0x6a6e72,.85,.05)), -6.2,.95,-7.6);
  // ✅ УБРАНО: standalone toolbox_g2 на полу
  // toolbox(rig,'toolbox_g2',group,-5.7,.99,-7.6,rn(-.2,.2));
  
  // const wl = shelf(1.47,-5.35,H,4.7,.5); tbOn(wl,'toolbox_s0',-1.7,.82,0); tbOn(wl,'toolbox_s1',.9,1.36,0);
  // const wb = shelf(4.1,-7.72,0,4.4,.5); tbOn(wb,'toolbox_s2',0,1.9,0);
  // const i2 = shelf(5.2,-4.9,H,3.6,.9); tbOn(i2,'toolbox_s3',0,1.36,.22);
  shelf(1.47,-5.35,H,4.7,.5);
  shelf(4.1,-7.72,0,4.4,.5);
  shelf(5.2,-4.9,H,3.6,.9);
  solid(6.2,0,-2.8, 7,1,-.4, mk(0x6a6e72,.8,.1));
  solid(6.9,0,-7.9, 7.9,2,-4.7, mk(0xc8c8c8,.5,.3));
  for (const x of [3.2,6]) at(group,bx(1.6,.04,.5,emis(0xf2f6ff,1.1)),x,3.74,-4);
  lamp(4.6,3.3,-4,0xe8f2ff,2.6,11);
  lamp(-4.55,2.9,-5.8,0xe8f2ff,3,11);

  at(group, rbox(19,.35,9,.05,mk(0xb0b0b0,.7,.2)), 0,4.85,8.8);
  at(group, rbox(19.2,.75,.25,.04,mk(0x4a5560,.5,.3)), 0,4.75,13.4);
  at(group,new THREE.Mesh(new THREE.PlaneGeometry(6,.55), new THREE.MeshStandardMaterial({map:signTex(['ЗАПРАВКА 24 ЧАСА'],'#4a4a4a','#f0f0f0',768,96)})),0,4.75,13.53);
  boxes.push(bb(-9.5,4.55,4.3,9.5,5.05,13.3));
  for (const x of [-9,9]) for (const z of [6,12]) {
    at(group,cyl(.22,.25,4.7,mk(0x7a7a7a,.6,.4),14),x,2.35,z);
    boxes.push(bb(x-.25,0,z-.25,x+.25,4.7,z+.25));
  }
  lamp(0,4.3,9,0xe8f2ff,3.2,16);
  for (const ix of [-3.5,3.5]) {
    solid(ix-.7,0,5.6, ix+.7,.18,9.4, conc);
    for (const pz of [6.7,8.3]) {
      const g = new THREE.Group(); g.position.set(ix,.18,pz); group.add(g);
      at(g,rbox(.5,.2,.7,.04,dark),0,.1,0);
      at(g,rbox(.44,1,.62,.06,mk(0x4a5560,.5,.3)),0,.7,0);
      at(g,rbox(.48,.45,.66,.06,mk(0xc8c8c8,.55,.2)),0,1.42,0);
      at(g,rbox(.54,.12,.72,.05,dark),0,1.72,0);
      boxes.push(bb(ix-.3,.18,pz-.38,ix+.3,1.95,pz+.38));
    }
  }

  const bc = BARREL_COLORS.slice(); let bi=0;
  for (const [x,z] of [[-9.5,-1],[-9.5,-1.9],[9.5,5.4],[-6.7,-2.3]]) {
    const b = createBarrel(bc[bi++ % bc.length], false);
    b.position.set(x, 0, z);
    b.rotation.y = rn(0, Math.PI * 2);
    group.add(b);
    boxes.push(bb(x-.29,0,z-.29,x+.29,.88,z+.29));
  }
  for (let i=0;i<6;i++) {
    const o = mud(rn,rn(.4,1),0x15110c,.7);
    o.position.set(rn(-9,9),.005+i*.0006,rn(4.8,12.5)); group.add(o);
  }

  const anchor = (x,z,yaw=0) => {
    const a = new THREE.Group(); a.position.set(x,0,z); a.rotation.y=yaw; group.add(a); return a;
  };
  const slots = { truck:anchor(7,9.4), wreck:anchor(-7,8.2,.25), extra:anchor(0,10) };

  group.traverse(o => {
    if (o.isMesh) {
      [].concat(o.material).forEach(m=>grime(m,U));
      o.castShadow = true; o.receiveShadow = true;
    }
  });
  if (goods.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({roughness:.6}), goods.length);
    const d = new THREE.Object3D(), c = new THREE.Color();
    goods.forEach((it,i)=>{
      d.position.copy(it.v); d.rotation.set(0,it.yaw,0); d.scale.set(...it.s); d.updateMatrix();
      im.setMatrixAt(i,d.matrix); im.setColorAt(i,c.setHex(it.c));
    });
    im.castShadow=true; im.frustumCulled=false; group.add(im);
  }

  // ========== МАШИНА В ГАРАЖЕ (ТЕПЕРЬ ЭТО БАГГИ) ==========
  const gcar = createRustBuggy({ seed: seed + 11, pad: false, color: 0x5a4a2e });
  gcar.group.position.set(-4.55, 0, -4.4);
  group.add(gcar.group);
  gcar.resolve = legacyResolve(gcar);
  extras.push(gcar);

  gcar.cockpit = null;
  gcar.enter = (camera) => {
      if (!gcar.cockpit) gcar.cockpit = createCockpit(camera);
      gcar.cockpit.setVisible(true);
      return gcar.cockpit;
  };
  gcar.exit = () => { if (gcar.cockpit) { gcar.cockpit.dispose(); gcar.cockpit = null; } };
  gcar.setSteer = (s) => { if (gcar.cockpit) gcar.cockpit.setSteer(s); };
  gcar.eyeWorld = (v = new THREE.Vector3()) => gcar.group.localToWorld(v.set(-0.55, 1.5, 1.0));

  attachCollision(rig, group, boxes, () => {
    const out = [];
    // ✅ Коллайдер ворот гаража убирается когда дверь открыта хотя бы наполовину (GD.p >= 0.5)
    if (GD.p < 0.5) out.push(bb(-6.65,0,-.45,-2.45,3,-.3));
    const d = rig.parts.shopDoor;
    if (d && d.cur < .1) out.push(bb(4.2,0,-.3,5.4,2.5,0));
    return out;
  });

  const station = {
    group, rig, slots, garageCar:gcar, vehicles:{},
    names:['garage', ...rig.names],
    open(n){ n==='garage' ? GD.target=1 : rig.open(n); },
    close(n){ n==='garage' ? GD.target=0 : rig.close(n); },
    toggle(n){ n==='garage' ? GD.target=GD.target?0:1 : rig.toggle(n); },
    isOpen(n){ return n==='garage' ? GD.target===1 : rig.isOpen(n); },
    garageProgress:()=>GD.p,
    partOf:(o)=>rig.partOf(o),
    resolve:rig.resolve,
    getBoxes:rig.getBoxes,
    showColliders:(on=true)=>rig.showColliders(on),
    resolveAll(pos,r=.35,h=1.8,step=.6){
      let res = rig.resolve(pos,r,h,step);
      for (const e of extras) {
        if (!e.resolve) continue;
        const q = e.resolve(pos,r,h,step);
        if (q.grounded) res.grounded = true;
        if (q.ground !== null && (res.ground === null || q.ground > res.ground)) {
          res.ground = q.ground; res.grounded = true;
        }
      }
      return res;
    },
    spawnVehicles(which={truck:true,wreck:true}){
      if (which.truck && !station.vehicles.truck) {
        const t=createTruck({seed:seed+3,pad:false});
        t.resolve=legacyResolve(t); slots.truck.add(t.group); extras.push(t); station.vehicles.truck=t;
        // ✅ Помечаем все mesh машины isVehicle — для коллизий игрока
        t.group.traverse(o => { if (o.isMesh) o.userData.isVehicle = true; });
      }
      if (which.wreck && !station.vehicles.wreck) {
        const w=createWreckCar({seed:seed+5,pad:false});
        w.resolve=legacyResolve(w); slots.wreck.add(w.group); extras.push(w); station.vehicles.wreck=w;
        // ✅ Помечаем все mesh машины isVehicle — для коллизий игрока
        w.group.traverse(o => { if (o.isMesh) o.userData.isVehicle = true; });
      }
      return station.vehicles;
    },
    update(dt){
      dt=Math.min(dt,.05);
      const d=GD.target-GD.p;
      GD.p += Math.sign(d)*Math.min(Math.abs(d),dt/GD.dur);
      placeSlats(GD.p);
      group.getWorldPosition(new THREE.Vector3()); U.value=group.position.y;
      rig.update(dt);
      for (const e of extras) e.update && e.update(dt);
      if (gcar.cockpit) gcar.cockpit.update(dt);
      if (lights[0]) lights[0].l.intensity=lights[0].base*(.96+Math.sin(performance.now()*.009)*.04);
    },
    setLights(on){ lights.forEach(o=>o.l.visible=on); },
    dispose(){
      extras.forEach(e=>e.dispose&&e.dispose());
      group.traverse(o=>{ o.geometry&&o.geometry.dispose(); });
      group.parent&&group.parent.remove(group);
    },
  };
  if (opts.vehicles) station.spawnVehicles();
  return station;
}
