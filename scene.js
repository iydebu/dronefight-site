// DroneFight concept page - 3D hangar, drone and synth sound.
// (c) 2026 Devashish Tiwari (iydebu). All rights reserved.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
export const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeIO = t => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const COLORS = [['Volt', '#d4ff3a'], ['Signal', '#ff6a1a'], ['Ice', '#46d5ff'], ['Rose', '#ff3d6e']];

export const SND = {
  on: false, ctx: null,
  ensure() {
    if (this.ctx) return;
    const c = this.ctx = new AudioContext();
    this.out = c.createGain(); this.out.gain.value = .55; this.out.connect(c.destination);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 2;
    const g = c.createGain(); g.gain.value = 0; f.connect(g); g.connect(this.out);
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.type = o2.type = 'sawtooth'; o2.detune.value = 12;
    o1.connect(f); o2.connect(f); o1.start(); o2.start();
    this.hum = { o1, o2, f, g };
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
  },
  toggle() {
    this.on = !this.on;
    if (this.on) { this.ensure(); this.ctx.resume(); this.chime(); }
    else if (this.ctx) { this.hum.g.gain.setTargetAtTime(0, this.ctx.currentTime, .04); setTimeout(() => !this.on && this.ctx.suspend(), 250); }
    return this.on;
  },
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); },
  rpm(r) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime, h = this.hum, f = 62 + r * 92;
    h.o1.frequency.setTargetAtTime(f, t, .08); h.o2.frequency.setTargetAtTime(f * 1.5, t, .08);
    h.f.frequency.setTargetAtTime(260 + r * 820, t, .1); h.g.gain.setTargetAtTime(r * .04, t, .12);
  },
  osc(type, f0, f1, dur, peak, delay = 0) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(g); g.connect(this.out); this.env(g, t, .003, peak, dur); o.start(t); o.stop(t + dur + .05);
  },
  noiseHit(f0, f1, dur, peak, q = 1.2) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); this.env(g, t, .05, peak, dur); s.start(t); s.stop(t + dur + .1);
  },
  tick() { this.osc('square', 2200, 2200, .03, .035); },
  open() { this.noiseHit(320, 2600, .36, .32); this.osc('sine', 180, 520, .22, .08); },
  back() { this.noiseHit(2400, 300, .34, .26); },
  clunk() { this.osc('sine', 95, 36, .24, .32); this.noiseHit(1400, 600, .05, .12, .7); },
  chime() { this.osc('sine', 1320, 1320, .18, .06); this.osc('sine', 1980, 1980, .26, .05, .07); },
};

/* ------------------------------------------------------------------ 3D hangar + drone */
export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080a);
  scene.fog = new THREE.FogExp2(0x07080a, 0.055);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;

  const camera = new THREE.PerspectiveCamera(innerWidth < innerHeight ? 60 : 34, innerWidth / innerHeight, 0.1, 100);
  const C = new THREE.Color(COLORS[0][1]);
  const tints = [];   // { m, k } emissive materials that follow the pilot colour
  const tint = (k, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: C.clone(), emissiveIntensity: 0, roughness: .4, ...extra }); tints.push({ m, k }); return m; };

  // lights
  const hemi = new THREE.HemisphereLight(0x9aa4b8, 0x0a0b0d, 0); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0); key.position.set(-3, 5, 5); scene.add(key);
  const top = new THREE.SpotLight(0xe8eeff, 0, 16, 0.5, 0.7, 1.3); top.position.set(0, 7.5, 0.6); scene.add(top, top.target);
  const rim = new THREE.PointLight(C.clone(), 0, 9, 1.4); rim.position.set(1.4, 2.2, -2.6); scene.add(rim);

  // floor, grid
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: .68, metalness: .45 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const grid = new THREE.GridHelper(44, 44, 0x2a2e35, 0x181a1f);
  grid.position.y = .002; grid.material.transparent = true; grid.material.opacity = 0; scene.add(grid);

  // landing pad decal (canvas)
  const padCv = document.createElement('canvas'); padCv.width = padCv.height = 1024;
  const padTex = new THREE.CanvasTexture(padCv); padTex.colorSpace = THREE.SRGBColorSpace; padTex.anisotropy = 8;
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, opacity: 0, depthWrite: false });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), padMat);
  pad.rotation.x = -Math.PI / 2; pad.position.y = .004; scene.add(pad);
  function drawPad() {
    const g = padCv.getContext('2d'), c = '#' + C.getHexString();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 1024, 1024); g.translate(512, 512);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 430, 0, Math.PI * 2); g.stroke();
    g.setLineDash([16, 14]); g.beginPath(); g.arc(0, 0, 392, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,.45)';
    for (let a = 0; a < 4; a++) { g.save(); g.rotate(a * Math.PI / 2); g.fillRect(-2, -500, 4, 66); g.fillRect(-2, 120, 4, 40); g.restore(); }
    g.lineWidth = 22; g.strokeStyle = c;
    for (let a = 0; a < 4; a++) { g.beginPath(); g.arc(0, 0, 468, a * Math.PI / 2 + .3, a * Math.PI / 2 + .9); g.stroke(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.3)'; g.font = '700 132px "Barlow Condensed"'; g.fillText('DF-01', 0, 262);
    g.font = '500 28px "JetBrains Mono"'; g.fillText('HANGAR 01  ·  PAD A', 0, 340);
    padTex.needsUpdate = true;
  }

  // pad ring lights
  const ring = [];
  const segGeo = new THREE.BoxGeometry(.17, .03, .05);
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2, m = tint(0);
    const s = new THREE.Mesh(segGeo, m);
    s.position.set(Math.cos(a) * 2.55, .016, Math.sin(a) * 2.55); s.rotation.y = -a + Math.PI / 2;
    scene.add(s); ring.push(m);
  }

  // back wall with ribs, light panels, colour strip; side pillars
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: .75, metalness: .3 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(34, 12, .4), wallMat); wall.position.set(0, 6, -8.2); scene.add(wall);
  for (let i = -7; i <= 7; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(.34, 12, .7), wallMat); r.position.set(i * 2.2, 6, -7.85); scene.add(r); }
  const lamps = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xdfe6ff, emissiveIntensity: 0 });
    const p = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.7, .05), m); p.position.set((i - 2.5) * 2.2, 2.9, -7.62); scene.add(p); lamps.push(m);
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(34, .035, .05), tint(1.1)); strip.position.set(0, .1, -7.5); scene.add(strip);
  for (const [x, z] of [[-7.6, -3.5], [7.6, -3.5], [-7.6, 2], [7.6, 2]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(.7, 12, .7), wallMat); p.position.set(x, 6, z); scene.add(p);
  }

  // dust
  const N = 520, dp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { dp[i * 3] = (Math.random() - .5) * 16; dp[i * 3 + 1] = Math.random() * 6; dp[i * 3 + 2] = Math.random() * 12 - 8; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xb8c0d0, size: .022, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // contact shadow
  const shCv = document.createElement('canvas'); shCv.width = shCv.height = 128;
  { const g = shCv.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.9)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shCv), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .006; scene.add(shadow);

  /* ---- drone ---- */
  const drone = new THREE.Group(), tilt = new THREE.Group();
  drone.add(tilt); scene.add(drone);
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: .55, roughness: .34 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x5a606b, metalness: .5, roughness: .36 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x1d1f23, metalness: .3, roughness: .5 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); tilt.add(m); return m; };

  add(new RoundedBoxGeometry(.8, .2, 1.18, 3, .07), dark);
  add(new RoundedBoxGeometry(.56, .14, .76, 3, .06), mid, 0, .14, -.05);
  add(new THREE.BoxGeometry(.05, .022, .64), tint(3.2), 0, .218, -.05);
  add(new THREE.SphereGeometry(.125, 24, 16), dark, 0, -.03, .6);
  const lens = add(new THREE.CylinderGeometry(.062, .062, .04, 24), new THREE.MeshStandardMaterial({ color: 0x05060a, emissive: 0x3a4766, emissiveIntensity: 1.2, metalness: 1, roughness: .1 }), 0, -.03, .715);
  lens.rotation.x = Math.PI / 2;
  for (const x of [-.27, .27]) {
    add(new THREE.BoxGeometry(.035, .035, .92), mid, x, -.27, 0);
    add(new THREE.BoxGeometry(.03, .1, .03), mid, x, -.2, .3);
    add(new THREE.BoxGeometry(.03, .1, .03), mid, x, -.2, -.3);
  }
  add(new THREE.BoxGeometry(.18, .03, .03), tint(2.6), 0, .02, -.6);
  const ant = add(new THREE.CylinderGeometry(.008, .012, .34, 6), dark, .18, .27, -.48); ant.rotation.x = -.5;

  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x22252b, metalness: .4, roughness: .45, transparent: true });
  const whiteLed = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xdde3f0, emissiveIntensity: 0 });
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const dir = new THREE.Vector3(sx, 0, sz).normalize(), tip = dir.clone().multiplyScalar(1.02);
    const arm = add(new THREE.BoxGeometry(.1, .055, 1.0), carbon); arm.position.copy(dir.clone().multiplyScalar(.55)); arm.rotation.y = Math.atan2(sx, sz);
    add(new THREE.CylinderGeometry(.085, .1, .13, 20), mid, tip.x, .05, tip.z);
    add(new THREE.CylinderGeometry(.07, .07, .04, 20), dark, tip.x, .135, tip.z);
    const duct = add(new THREE.TorusGeometry(.5, .024, 8, 56), dark, tip.x, .13, tip.z); duct.rotation.x = Math.PI / 2;
    const led = add(new THREE.TorusGeometry(.5, .008, 6, 64), sz > 0 ? tint(3.4) : whiteLed, tip.x, .1, tip.z); led.rotation.x = Math.PI / 2;
    const rotor = new THREE.Group(); rotor.position.set(tip.x, .155, tip.z); tilt.add(rotor);
    for (let b = 0; b < 3; b++) {
      const h = new THREE.Group(); h.rotation.y = b * Math.PI * 2 / 3;
      const bl = new THREE.Mesh(new THREE.BoxGeometry(.43, .008, .075), bladeMat); bl.position.x = .23; bl.rotation.x = .2;
      h.add(bl); rotor.add(h);
    }
    const disc = add(new THREE.CircleGeometry(.46, 48), new THREE.MeshBasicMaterial({ color: 0x9aa3b5, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), tip.x, .158, tip.z);
    disc.rotation.x = -Math.PI / 2;
    rotors.push({ g: rotor, disc, spin: sx * sz > 0 ? 1 : -1 });
  }

  // post
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .6, .5, .82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---- sim: spring-driven hover, body tilts with acceleration ---- */
  const REST = new THREE.Vector3(0, .29, 0);
  const HOME = new THREE.Vector3(.35, 1.2, 0);
  const S = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), tgt: new THREE.Vector3(),
    yaw: -.6, yawV: 0, pitch: 0, roll: 0, spin: 0, spinV: 0, rpm: 0, flash: 0, lookX: 0,
    home: HOME.clone(), yawHome: -.6, lookHome: 0, camLift: 0, camBack: 0, lookDY: 0 };
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  function reset() { S.pos.copy(REST); S.vel.set(0, 0, 0); S.acc.set(0, 0, 0); S.yaw = -.6; S.yawV = 0; S.pitch = S.roll = S.spin = S.spinV = 0; S.lookX = S.lookHome; }
  const V = new THREE.Vector3();

  function step(dt, T) {
    const lifted = T > 2.15;
    S.tgt.copy(lifted ? S.home : REST);
    if (lifted && !REDUCED) { S.tgt.y += Math.sin(T * 1.7) * .06; S.tgt.x += Math.sin(T * .63) * .05; S.tgt.z += Math.cos(T * .5) * .05; }
    const k = lifted ? 9 : 60, c = lifted ? 4.2 : 16;
    S.acc.copy(S.tgt).sub(S.pos).multiplyScalar(k).addScaledVector(S.vel, -c);
    S.vel.addScaledVector(S.acc, dt); S.pos.addScaledVector(S.vel, dt);
    mouse.sx = lerp(mouse.sx, mouse.x, 1 - Math.exp(-4 * dt)); mouse.sy = lerp(mouse.sy, mouse.y, 1 - Math.exp(-4 * dt));
    S.spin += S.spinV * dt; S.spinV *= Math.exp(-2.2 * dt); if (!drag.on) S.spin *= Math.exp(-.5 * dt);
    const yawT = S.yawHome + mouse.sx * .5 + S.spin;
    S.yawV += ((yawT - S.yaw) * 30 - S.yawV * 9) * dt; S.yaw += S.yawV * dt;
    V.copy(S.vel).multiplyScalar(.32).addScaledVector(S.acc, .028);
    const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
    const lx = V.x * cy - V.z * sy, lz = V.x * sy + V.z * cy;
    const pT = clamp(lz, -.55, .55) - mouse.sy * .12, rT = clamp(-lx, -.55, .55) - S.yawV * .05;
    const a = 1 - Math.exp(-10 * dt);
    S.pitch = lerp(S.pitch, pT, a); S.roll = lerp(S.roll, rT, a);
    S.lookX = lerp(S.lookX, S.lookHome, 1 - Math.exp(-3 * dt));
    S.flash *= Math.exp(-3 * dt);
  }
  function simulateTo(T) { reset(); for (let t = 0; t < T; t += 1 / 60) step(1 / 60, t); }

  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  // bright colours (lime) bloom far harder than orange or pink, so scale emissives by luminance
  const colorK = () => clamp(.36 / (C.r * .2126 + C.g * .7152 + C.b * .0722), .5, 1);
  let lumK = colorK();
  function apply(T, dt) {
    // lights come on
    const L = ease(span(T, 1.0, 2.0));
    hemi.intensity = .55 * L; key.intensity = 1.5 * L; top.intensity = 90 * L; rim.intensity = 9 * L;
    renderer.toneMappingExposure = .55 + .5 * L;
    lamps.forEach((m, i) => {
      const on = 1.05 + i * .11;
      m.emissiveIntensity = T < on ? 0 : T < on + .2 ? (Math.sin(T * 95 + i * 7) > 0 ? 1.1 : .1) : 1.1;
    });
    grid.material.opacity = .85 * ease(span(T, 1.2, 2.4));
    padMat.opacity = .6 * ease(span(T, 1.3, 2.2));
    dustMat.opacity = .38 * ease(span(T, 1.2, 2.6));
    const ledOn = ease(span(T, 1.6, 2.2)), flash = (1 + S.flash * 2.2) * lumK;
    for (const t of tints) t.m.emissiveIntensity = t.k * (.12 + .88 * ledOn) * flash;
    whiteLed.emissiveIntensity = 1.4 * ledOn;
    const chaseOn = span(T, 3.2, 4.0);
    ring.forEach((m, j) => {
      const on = T > 1.45 + j * .018;
      const chase = Math.pow(Math.max(0, Math.cos(T * 2.1 - j / 36 * Math.PI * 2)), 14) * chaseOn;
      m.emissiveIntensity = on ? (.7 + 2.6 * chase) * flash : 0;
    });
    // rotors
    S.rpm = ease(span(T, 1.7, 2.6)) * (.86 + Math.min(.3, S.acc.length() * .02));
    for (const r of rotors) { r.g.rotation.y += r.spin * S.rpm * 55 * dt; r.disc.material.opacity = .1 * S.rpm; }
    bladeMat.opacity = 1 - S.rpm * .78;
    // drone
    drone.position.copy(S.pos); drone.rotation.y = S.yaw; tilt.rotation.set(S.pitch, 0, S.roll);
    shadow.position.set(S.pos.x, .006, S.pos.z);
    const hgt = S.pos.y - REST.y; shadow.scale.setScalar(1 + hgt * .45); shadow.material.opacity = clamp(.75 - hgt * .28, .15, .75);
    // dust drift
    const p = dustGeo.attributes.position.array;
    for (let i = 0; i < N; i++) { p[i * 3 + 1] += Math.sin(T * .3 + i) * .0009; p[i * 3] += .0006; if (p[i * 3] > 8) p[i * 3] = -8; }
    dustGeo.attributes.position.needsUpdate = true;
    // camera: dolly in during intro, then slow sway + mouse parallax
    const ci = easeIO(span(T, .8, 3.4));
    camPos.set(0, lerp(.55, 2.75, ci) + S.camLift, lerp(11.5, 7.6, ci) + S.camBack);
    const sw = (REDUCED ? 0 : Math.sin(T * .13) * .16 * ci) + mouse.sx * .07;
    camPos.set(Math.sin(sw) * camPos.z, camPos.y + mouse.sy * .12, Math.cos(sw) * camPos.z);
    camera.position.copy(camPos);
    look.set(S.lookX * 2.4, lerp(.35, .95, ci) + S.camLift * .45 + S.lookDY, 0);
    camera.lookAt(look);
    composer.render();
  }
  function setColor(hex) {
    C.set(hex); lumK = colorK();
    for (const t of tints) t.m.emissive.copy(C);
    rim.color.copy(C); drawPad(); S.flash = 1;
  }
  function resize() {
    camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 1 ? 60 : 34; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight);
  }
  const drag = { on: false, x: 0 };
  canvas.addEventListener('pointerdown', e => { drag.on = true; drag.x = e.clientX; canvas.classList.add('drag'); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!drag.on) return; const dx = e.clientX - drag.x; drag.x = e.clientX; S.spin += dx * .012; S.spinV = dx * .6; });
  const end = () => { drag.on = false; canvas.classList.remove('drag'); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; });

  drawPad();
  document.fonts.ready.then(drawPad);
  const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { step, apply, simulateTo, setColor, resize, S, kick: d => { S.vel.x += d * 3.2; S.vel.y += .6; },
    gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown' };
}

