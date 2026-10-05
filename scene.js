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
export const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;
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
  laser() { this.osc('square', 1800 + Math.random() * 200, 240, .11, .05); this.osc('sawtooth', 900, 120, .08, .035); },
  rocket() { this.noiseHit(500, 2200, .6, .22, .8); this.osc('sawtooth', 120, 60, .5, .06); },
  boom() { this.noiseHit(900, 80, .7, .45, .6); this.osc('sine', 80, 30, .5, .3); },
};

/* ------------------------------------------------------------------ 3D hangar + drone */
export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));   // phones too: 1.25 looked blurry on 3x screens; quality() steps down if slow
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
  const N = TOUCH ? 200 : 520, dp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { dp[i * 3] = (Math.random() - .5) * 16; dp[i * 3 + 1] = Math.random() * 6; dp[i * 3 + 2] = Math.random() * 12 - 8; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xb8c0d0, size: .022, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // contact shadow
  const shCv = document.createElement('canvas'); shCv.width = shCv.height = 128;
  { const g = shCv.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.9)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shCv), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .006; scene.add(shadow);

  /* ---- drone: the game's sci-fi gunship (armoured pod + eye, two big side fans, twin blasters, rocket pods) ---- */
  const drone = new THREE.Group(), tilt = new THREE.Group();
  drone.add(tilt); scene.add(drone);
  const dark = new THREE.MeshStandardMaterial({ color: 0x23272e, metalness: .7, roughness: .3 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x5d6470, metalness: .65, roughness: .3 });
  const light = new THREE.MeshStandardMaterial({ color: 0xa9b0bb, metalness: .5, roughness: .32 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: .35, roughness: .55 });
  const add = (geo, mat, x = 0, y = 0, z = 0, p = tilt) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };

  // centre pod: armoured hull, raised spine, side intakes
  add(new RoundedBoxGeometry(.6, .36, .86, 4, .12), dark, 0, 0, -.02);
  add(new RoundedBoxGeometry(.42, .14, .62, 3, .06), mid, 0, .19, -.08);
  add(new THREE.BoxGeometry(.04, .02, .5), tint(3.2), 0, .265, -.08);
  for (const x of [-.31, .31]) {
    add(new RoundedBoxGeometry(.06, .16, .4, 2, .025), carbon, x, .02, -.12);
    add(new THREE.BoxGeometry(.012, .03, .3), tint(2.2), x * 1.07, .02, -.12);
  }
  add(new THREE.BoxGeometry(.22, .035, .035), tint(2.6), 0, .05, -.46);   // tail light
  // the eye: a big round sensor at the front, ringed in pilot colour
  add(new THREE.SphereGeometry(.2, 32, 20), mid, 0, .02, .36);
  const eyeRing = add(new THREE.TorusGeometry(.155, .022, 12, 48), tint(3.4), 0, .02, .5); eyeRing.rotation.y = 0;
  const lens = add(new THREE.CylinderGeometry(.11, .11, .05, 40), new THREE.MeshStandardMaterial({ color: 0x05060a, emissive: 0x3a5a99, emissiveIntensity: 1.6, metalness: 1, roughness: .08 }), 0, .02, .52);
  lens.rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(.035, 16, 10), new THREE.MeshBasicMaterial({ color: 0xcfe6ff }), .03, .05, .55);   // glint
  const ant = add(new THREE.CylinderGeometry(.007, .011, .3, 6), dark, -.13, .33, -.3); ant.rotation.x = -.45;

  // landing struts + skids
  for (const x of [-.22, .22]) {
    add(new THREE.BoxGeometry(.035, .035, .78), mid, x, -.27, -.02);
    for (const z of [.22, -.26]) { const s = add(new THREE.BoxGeometry(.03, .14, .03), mid, x, -.2, z); s.rotation.z = x > 0 ? -.25 : .25; }
  }

  // side arms out to two big ducted fans (the game drone's silhouette)
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x22252b, metalness: .4, roughness: .45, transparent: true });
  const whiteLed = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xdde3f0, emissiveIntensity: 0 });
  const rotors = [];
  const FAN_X = 1.12, FAN_R = .44;
  for (const sx of [-1, 1]) {
    const arm = add(new RoundedBoxGeometry(.6, .09, .16, 2, .035), carbon, sx * .58, .06, -.04); arm.rotation.z = sx * -.08;
    add(new THREE.BoxGeometry(.5, .02, .03), tint(2.0), sx * .6, .115, .03);
    const fx = sx * FAN_X;
    // duct: thick outer lip + inner wall + under-ring
    const lip = add(new THREE.TorusGeometry(FAN_R, .055, 18, 96), dark, fx, .12, 0); lip.rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(FAN_R - .01, FAN_R - .03, .16, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: .6, roughness: .4, side: THREE.DoubleSide }), fx, .07, 0);
    const led = add(new THREE.TorusGeometry(FAN_R + .02, .012, 10, 128), tint(3.4), fx, .03, 0); led.rotation.x = Math.PI / 2;
    const ledW = add(new THREE.TorusGeometry(FAN_R - .06, .007, 8, 96), whiteLed, fx, .155, 0); ledW.rotation.x = Math.PI / 2;
    // cross struts + motor hub
    for (const a of [0, Math.PI / 2]) { const s = add(new THREE.BoxGeometry(FAN_R * 2 - .04, .025, .04), mid, fx, .04, 0); s.rotation.y = a; }
    add(new THREE.CylinderGeometry(.075, .09, .12, 32), light, fx, .07, 0);
    add(new THREE.CylinderGeometry(.04, .04, .03, 24), tint(2.4), fx, .14, 0);
    const rotor = new THREE.Group(); rotor.position.set(fx, .12, 0); tilt.add(rotor);
    for (let b = 0; b < 5; b++) {
      const h = new THREE.Group(); h.rotation.y = b * Math.PI * 2 / 5;
      const bl = new THREE.Mesh(new THREE.BoxGeometry(.36, .008, .07), bladeMat); bl.position.x = .2; bl.rotation.x = .28;
      h.add(bl); rotor.add(h);
    }
    const disc = add(new THREE.CircleGeometry(FAN_R - .04, 96), new THREE.MeshBasicMaterial({ color: 0x9aa3b5, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), fx, .125, 0);
    disc.rotation.x = -Math.PI / 2;
    rotors.push({ g: rotor, disc, spin: sx });
  }

  /* ---- weapons, as in the game: twin blaster under the nose, a rocket pod on each shoulder ---- */
  const heatMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: .8, roughness: .3, emissive: 0xff5a14, emissiveIntensity: 0 });
  const muzzles = [];
  for (const x of [-.11, .11]) {
    add(new RoundedBoxGeometry(.11, .1, .34, 2, .03), dark, x, -.17, .3);
    const b = add(new THREE.CylinderGeometry(.026, .03, .34, 16), heatMat, x, -.17, .58); b.rotation.x = Math.PI / 2;
    for (const z of [.5, .6]) { const r = add(new THREE.CylinderGeometry(.036, .036, .025, 16), mid, x, -.17, z); r.rotation.x = Math.PI / 2; }
    const tip = add(new THREE.TorusGeometry(.03, .009, 8, 24), tint(2.6), x, -.17, .755);
    muzzles.push(new THREE.Object3D()); muzzles.at(-1).position.set(x, -.17, .8); tilt.add(muzzles.at(-1));
    void tip;
  }
  const podTubes = [];   // { cone, home } rockets waiting in the tubes
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x9a1c1c, metalness: .3, roughness: .4, emissive: 0xff2a1a, emissiveIntensity: .25 });
  for (const sx of [-1, 1]) {
    const px = sx * .42;
    add(new RoundedBoxGeometry(.2, .16, .4, 2, .03), mid, px, .2, .02);
    add(new THREE.BoxGeometry(.204, .02, .3), tint(1.6), px, .285, 0);
    for (const [ox, oy] of [[-.045, .035], [.045, .035], [-.045, -.035], [.045, -.035]]) {
      const t = add(new THREE.CylinderGeometry(.034, .034, .03, 20), carbon, px + ox, .2 + oy, .225); t.rotation.x = Math.PI / 2;
      const c = add(new THREE.ConeGeometry(.026, .07, 16), coneMat, px + ox, .2 + oy, .235); c.rotation.x = Math.PI / 2;
      podTubes.push({ cone: c, back: 0 });
    }
  }

  /* ---- shots: pooled blaster bolts, rockets with smoke trail, muzzle light ---- */
  const BOLT = new THREE.Color(.25, .75, 3.2);   // the game's own-team blue, pushed over 1 so it blooms
  const boltCore = new THREE.MeshBasicMaterial({ color: BOLT, toneMapped: false });
  const boltGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(.1, .35, 1.4), transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const boltGeo = new THREE.CylinderGeometry(.018, .018, .55, 8); boltGeo.rotateX(Math.PI / 2);
  const glowGeo = new THREE.CylinderGeometry(.05, .05, .7, 10); glowGeo.rotateX(Math.PI / 2);
  const bolts = [];
  for (let i = 0; i < 24; i++) {
    const g = new THREE.Group(); g.add(new THREE.Mesh(boltGeo, boltCore), new THREE.Mesh(glowGeo, boltGlow)); g.visible = false; scene.add(g);
    bolts.push({ g, v: new THREE.Vector3(), life: 0 });
  }
  const flashLight = new THREE.PointLight(0x5aa0ff, 0, 5, 1.6); scene.add(flashLight);
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.6, 1.2, 4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flashes = muzzles.map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), flashMat); m.visible = false; scene.add(m); return m; });

  const TRAIL = 90;
  const trailPos = new Float32Array(TRAIL * 3), trailCol = new Float32Array(TRAIL * 3), trailAge = new Float32Array(TRAIL).fill(9);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ size: .16, vertexColors: true, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
  trail.frustumCulled = false; scene.add(trail);
  let trailHead = 0;
  const rocketMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: .5, roughness: .35 });
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, .4), transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const rockets = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .26, 12), rocketMat); body.rotation.x = Math.PI / 2; g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.03, .08, 12), coneMat); nose.rotation.x = Math.PI / 2; nose.position.z = .17; g.add(nose);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(.04, .22, 10), flameMat); fl.rotation.x = -Math.PI / 2; fl.position.z = -.24; g.add(fl);
    g.visible = false; scene.add(g);
    rockets.push({ g, fl, v: new THREE.Vector3(), aim: new THREE.Vector3(), life: 0, puff: 0 });
  }
  const boomMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.4, .5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(.5, 20, 14), boomMat); boom.visible = false; scene.add(boom);
  const boomLight = new THREE.PointLight(0xff8a3a, 0, 9, 1.5); scene.add(boomLight);
  const W = { heat: 0, side: 0, recoil: 0, flashT: 0, boomT: 9, onShot: null, onBoom: null };
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);

  function fireBolt() {
    if (W.heat > .95) return false;
    const i = W.side = 1 - W.side, b = bolts.find(x => x.life <= 0);
    if (!b) return false;
    tilt.updateWorldMatrix(true, true);
    muzzles[i].getWorldPosition(_p); tilt.getWorldQuaternion(_q); _f.copy(_z).applyQuaternion(_q);
    _f.x += (Math.random() - .5) * .03; _f.y += (Math.random() - .5) * .03; _f.normalize();
    b.g.position.copy(_p); b.g.quaternion.setFromUnitVectors(_z, _f); b.v.copy(_f).multiplyScalar(26); b.life = .42; b.g.visible = true;
    flashes[i].position.copy(_p); flashes[i].visible = true; flashMat.opacity = 1; flashLight.position.copy(_p); W.flashT = 1;
    W.heat = Math.min(1, W.heat + .07); W.recoil = 1;
    S.vel.addScaledVector(_f, -.35);
    W.onShot && W.onShot('bolt');
    return true;
  }
  function fireRocket() {
    const r = rockets.find(x => x.life <= 0), tube = podTubes.find(t => t.back <= 0);
    if (!r || !tube) return false;
    tilt.updateWorldMatrix(true, true);
    tube.cone.getWorldPosition(_p); tilt.getWorldQuaternion(_q); _f.copy(_z).applyQuaternion(_q);
    tube.cone.visible = false; tube.back = 2.4;
    r.g.position.copy(_p); r.v.copy(_f).multiplyScalar(2.5); r.v.y += .9;
    // homing target: a point far ahead and off to one side, so it curves like a locked rocket
    r.aim.copy(_p).addScaledVector(_f, 14); r.aim.x += (Math.random() - .5) * 6; r.aim.y = 1 + Math.random() * 2.5;
    r.life = 1.7; r.g.visible = true; r.puff = 0;
    S.vel.addScaledVector(_f, -.6); S.vel.y += .4; S.flash = .6;
    W.onShot && W.onShot('rocket');
    return true;
  }
  function stepWeapons(dt) {
    if (!(dt > 0)) return;
    W.heat = Math.max(0, W.heat - dt * (W.heat > .95 ? .45 : .35));
    W.recoil *= Math.exp(-14 * dt);
    heatMat.emissiveIntensity = Math.pow(W.heat, 1.6) * 3.2;
    W.flashT = Math.max(0, W.flashT - dt * 22);
    flashLight.intensity = W.flashT * 14; flashMat.opacity = W.flashT;
    if (W.flashT <= 0) flashes.forEach(f => (f.visible = false));
    for (const b of bolts) {
      if (b.life <= 0) continue;
      b.life -= dt; b.g.position.addScaledVector(b.v, dt);
      if (b.life <= 0) b.g.visible = false;
    }
    for (const t of podTubes) if (t.back > 0 && (t.back -= dt) <= 0) t.cone.visible = true;
    for (const r of rockets) {
      if (r.life <= 0) continue;
      r.life -= dt;
      // accelerate and steer toward the aim point (simple homing)
      _f.copy(r.aim).sub(r.g.position).normalize().multiplyScalar(16);
      r.v.lerp(_f, 1 - Math.exp(-2.4 * dt));
      r.g.position.addScaledVector(r.v, dt);
      r.g.quaternion.setFromUnitVectors(_z, _f.copy(r.v).normalize());
      r.fl.scale.setScalar(.8 + Math.random() * .5);
      r.puff += dt;
      while (r.puff > .012) {
        r.puff -= .012;
        const k = trailHead = (trailHead + 1) % TRAIL;
        trailPos[k * 3] = r.g.position.x - r.v.x * .02 + (Math.random() - .5) * .04;
        trailPos[k * 3 + 1] = r.g.position.y - r.v.y * .02 + (Math.random() - .5) * .04;
        trailPos[k * 3 + 2] = r.g.position.z - r.v.z * .02 + (Math.random() - .5) * .04;
        trailAge[k] = 0;
      }
      if (r.life <= 0 || r.g.position.distanceTo(r.aim) < .6) {
        r.life = 0; r.g.visible = false;
        boom.position.copy(r.g.position); boomLight.position.copy(r.g.position); W.boomT = 0; boom.visible = true;
        W.onBoom && W.onBoom();
      }
    }
    for (let k = 0; k < TRAIL; k++) {
      const a = trailAge[k] += dt, f = Math.max(0, 1 - a / .7);
      trailCol[k * 3] = f * (a < .08 ? 1.6 : .55); trailCol[k * 3 + 1] = f * (a < .08 ? .9 : .5); trailCol[k * 3 + 2] = f * (a < .08 ? .4 : .52);
      if (f > 0) trailPos[k * 3 + 1] += dt * .25;
    }
    trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true;
    W.boomT += dt;
    const bt = W.boomT / .45;
    boom.visible = bt < 1; boom.scale.setScalar(.3 + bt * 1.6); boomMat.opacity = Math.max(0, 1 - bt);
    boomLight.intensity = Math.max(0, 1 - bt) * 40;
  }

  // post
  // own render target with 4x MSAA: the composer's default buffer has no antialiasing (jagged rotors / LED rings)
  const rt = new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .6, .5, .82);
  composer.addPass(bloom);
  if (TOUCH) { const bs = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => bs(w / 2, h / 2); bloom.setSize(innerWidth, innerHeight); }   // half-res glow on phones
  composer.addPass(new OutputPass());

  /* ---- sim: spring-driven hover, body tilts with acceleration ---- */
  const REST = new THREE.Vector3(0, .29, 0);
  const HOME = new THREE.Vector3(.35, 1.2, 0);
  const S = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), tgt: new THREE.Vector3(),
    yaw: -.6, yawV: 0, pitch: 0, roll: 0, spin: 0, spinV: 0, rpm: 0, flash: 0, lookX: 0,
    home: HOME.clone(), yawHome: -.6, lookHome: 0, camLift: 0, camBack: 0, lookDY: 0,
    off: new THREE.Vector3(), barrel: 0, barrelV: 0, padK: 1, follow: 0, scaleK: 1 };   // off/barrel/padK/follow: phone choreography
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  function reset() { S.pos.copy(REST); S.vel.set(0, 0, 0); S.acc.set(0, 0, 0); S.yaw = -.6; S.yawV = 0; S.pitch = S.roll = S.spin = S.spinV = 0; S.lookX = S.lookHome; }
  const V = new THREE.Vector3();

  function step(dt, T) {
    const lifted = T > 2.15;
    S.tgt.copy(lifted ? S.home : REST);
    if (lifted) S.tgt.add(S.off);
    if (lifted && !REDUCED) { S.tgt.y += Math.sin(T * 1.7) * .06; S.tgt.x += Math.sin(T * .63) * .05; S.tgt.z += Math.cos(T * .5) * .05; }
    const k = lifted ? 9 + S.follow * 16 : 60, c = lifted ? 4.2 + S.follow * 4 : 16;   // follow: stiffer spring so set-piece moves stay tight
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
    if (S.barrelV) { S.barrel += S.barrelV * dt; if (S.barrel >= Math.PI * 2) { S.barrel = 0; S.barrelV = 0; } }
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
    padMat.opacity = .6 * S.padK * ease(span(T, 1.3, 2.2));
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
    drone.position.copy(S.pos); drone.rotation.y = S.yaw; drone.scale.setScalar(S.scaleK); tilt.rotation.set(S.pitch - W.recoil * .06, 0, S.roll + S.barrel);
    tilt.position.z = -W.recoil * .05;
    stepWeapons(dt);
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
    renderer.setSize(innerWidth, innerHeight, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  }
  // phones: if the first ~2 s after the intro run under 40 fps, drop to 1.5x so slow phones stay smooth
  const fps = { n: 0, t: 0, done: !TOUCH };
  function quality(dt) {
    if (fps.done || !(dt > 0)) return;
    fps.n++; fps.t += dt;
    if (fps.t < 2) return;
    fps.done = true; fps.rate = fps.n / fps.t;
    if (fps.rate < 40 && renderer.getPixelRatio() > 1.5) { renderer.setPixelRatio(1.5); resize(); fps.dropped = true; }
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
  return { step, apply, simulateTo, setColor, resize, quality, fps, dpr: () => renderer.getPixelRatio(), S, kick: d => { S.vel.x += d * 3.2; S.vel.y += .6; },
    roll: () => { if (!S.barrelV) { S.barrelV = Math.PI * 2 / .55; S.vel.y += 2.2; S.flash = 1; } },
    fireBolt, fireRocket, W, rocketsLive: () => rockets.some(r => r.life > 0),
    gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown' };
}

