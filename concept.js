// DroneFight concept page. (c) 2026 Devashish Tiwari (iydebu). All rights reserved.
// Static teaser: no server, no design doc. The drone flies to a new spot for each section as you scroll.
// Test hook: window.CONCEPT (seek, play, go, info, setColor).
import { buildScene, SND, COLORS, REDUCED, TOUCH, span, ease, clamp, lerp } from './scene.js';

const $ = s => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const READY_AT = 3.0, INTRO_END = 4.4;
const GLYPHS = '#%&*+=<>/\\|01'.split('');
const TITLE = 'DRONEFIGHT'.split('');
const phone = () => innerWidth < 900;
const portrait = () => phone() && innerHeight > innerWidth;   // phone held upright: own drone choreography

let G = null;
try { G = buildScene($('#scene')); } catch (e) { document.documentElement.classList.add('nogl'); console.warn('WebGL off:', e.message); }

/* ---- colour ---- */
function setColor(hex, flash = true) {
  document.documentElement.style.setProperty('--c', hex);
  if (G && flash) G.setColor(hex); else if (G) { G.setColor(hex); G.S.flash = 0; }
  document.querySelectorAll('#swatches button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.c === hex)));
  try { localStorage.setItem('df-color', hex); } catch {}
}
COLORS.forEach(([name, hex]) => {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.c = hex; b.title = name; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name);
  b.style.setProperty('--k', hex); b.innerHTML = '<i></i>';
  b.addEventListener('click', () => { setColor(hex); SND.chime(); });
  $('#swatches').append(b);
});
let saved = COLORS[0][1]; try { const c = localStorage.getItem('df-color'); if (/^#[0-9a-f]{6}$/i.test(c || '')) saved = c; } catch {}
setColor(saved, false);

/* ---- where the drone sits for each section ---- */
const SPOTS = {
  hero: { x: .35, y: 1.2, z: 0, yaw: -.6, look: 0, lift: 0, back: 0 },
  r:    { x: 1.05, y: 1.35, z: .3, yaw: -1.0, look: -.42, lift: .2, back: -.4 },
  l:    { x: -1.05, y: 1.35, z: .3, yaw: .45, look: .42, lift: .2, back: -.4 },
  c:    { x: 0, y: 1.6, z: -.6, yaw: -.25, look: 0, lift: .6, back: 1.2 },
  hi:   { x: .4, y: 2.5, z: -1.2, yaw: -1.6, look: 0, lift: 1.5, back: .6 },
};
const PHONE_SPOTS = {   // text sits at the bottom on phones, so the drone flies in the upper half
  hero: { x: 0, y: 1.7, z: 0, yaw: -.6, look: 0, lift: .2, back: 1.5, dy: -.55 },
  r:    { x: .35, y: 2.1, z: 0, yaw: -1.1, look: 0, lift: .5, back: .8, dy: -.7 },
  l:    { x: -.35, y: 2.1, z: 0, yaw: .5, look: 0, lift: .5, back: .8, dy: -.7 },
  c:    { x: 0, y: 2.3, z: -.6, yaw: -.25, look: 0, lift: .8, back: 2.2, dy: -.7 },
  hi:   { x: 0, y: 2.9, z: -1.2, yaw: -1.6, look: 0, lift: 1.5, back: 1.8, dy: -.6 },
};
let spot = 'hero', spotPrev = 'hero';
function applySpot(k) {
  if (G) G.S.padK = phone() ? .3 : 1;   // landing-pad decal sits behind the title on short screens
  if (portrait()) return;   // phones are driven every frame by phoneDrive
  const P = (phone() ? PHONE_SPOTS : SPOTS)[k] || SPOTS.hero;
  if (!G) return;
  const S = G.S;
  S.home.set(P.x, P.y, P.z); S.yawHome = P.yaw; S.lookHome = P.look;
  S._lift = P.lift; S._back = P.back; S._dy = P.dy || 0;
}
function setSpot(k, side) {
  document.body.dataset.side = side || '';
  if (k === spot) return;
  spotPrev = spot; spot = k; applySpot(k);
  if (G && T >= INTRO_END) { G.kick(spotPrev === 'l' ? 1 : spotPrev === 'r' ? -1 : (Math.random() - .5)); SND.open(); }
}
applySpot('hero');
document.body.dataset.side = 'hero';

/* ---- scroll: reveal + pick the section nearest the screen centre ---- */
const secs = [...document.querySelectorAll('main > section, main > footer')];
secs.forEach(sec => sec.querySelectorAll('.reveal').forEach((el, i) => el.style.setProperty('--i', i)));
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && e.target.id !== 'top') e.target.classList.add('in'); }), { threshold: .22 });
secs.forEach(s => io.observe(s));
function onScroll() {
  const mid = innerHeight / 2; let best = secs[0], bd = 1e9;
  for (const s of secs) { const r = s.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = s; } }
  const k = best.dataset.drone || (best.id === 'top' ? 'hero' : 'c');
  const side = best.classList.contains('beat') ? best.dataset.side : best.id === 'top' ? 'hero' : best.id === 'pilot' ? 'pilot' : best.tagName === 'FOOTER' ? 'end' : 'block';
  setSpot(k, side);
}
addEventListener('scroll', onScroll, { passive: true });
let wasPortrait = portrait();
addEventListener('resize', () => { G && G.resize(); if (wasPortrait && !portrait()) resetPhone(); wasPortrait = portrait(); applySpot(spot); onScroll(); });


/* ---- phone (portrait): the drone flies with your thumb, one move per section ---- */
// Each section has a pose (where the drone hovers, camera distance) and a move (what it does while you read).
// Scroll position blends the two nearest sections continuously, so the drone travels as you scroll.
const POSE = {   // y: height, z: toward camera, back: camera distance (+ = farther), dy: aim (- = drone sits higher on screen)
  close:  { x: 0,    y: 1.55, z: .7,  yaw: -.5,  lift: .1, back: -.4, dy: -.62 },
  swoop:  { x: 0,    y: 1.9,  z: .2,  yaw: -.9,  lift: .3, back: .2,  dy: -.72 },
  recoil: { x: 0,    y: 1.8,  z: .9,  yaw: 0,    lift: .2, back: -.2, dy: -.7 },
  orbit:  { x: 0,    y: 1.9,  z: 0,   yaw: 0,    lift: .4, back: .5,  dy: -.72 },
  dash:   { x: 0,    y: 1.85, z: .3,  yaw: -1.57, lift: .3, back: .4,  dy: -.72 },
  high:   { x: 0,    y: 3.1,  z: -1,  yaw: -1.2, lift: 1.4, back: 1.2, dy: -.55 },
  dive:   { x: 0,    y: 2.1,  z: -.6, yaw: 0,    lift: .5, back: .6,  dy: -.55 },
};
const MOVE = {   // offset + extra yaw at time t, scaled by w (how much this section is on screen)
  close:  (t, o) => { o.y += Math.sin(t * 1.1) * .05; },
  swoop:  (t, o) => { o.x += Math.sin(t * 1.25) * .42; o.y += Math.sin(t * 2.5) * .2; o.z += Math.cos(t * 1.25) * .35; return Math.cos(t * 1.25) * .9; },
  recoil: (t, o) => { const ph = (t % 1.7) / 1.7, k = ph < .12 ? ph / .12 : Math.exp(-(ph - .12) * 7); o.z -= k * .55; o.y += k * .12; },
  orbit:  (t, o) => { o.x += Math.cos(t * 2.2) * .45; o.z += Math.sin(t * 2.2) * .6; return Math.sin(t * 2.2) * .8; },   // yaw sways, never wraps (a wrap would spin the drone a full turn)
  dash:   (t, o) => { const d = Math.tanh(Math.sin(t * 1.15) * 5); o.x += d * .55; o.y += (1 - Math.abs(d)) * .1; return d < 0 ? Math.PI : 0; },
  high:   (t, o) => { o.x += Math.sin(t * .5) * .25; o.y += Math.sin(t * .9) * .08; },
  dive:   (t, o) => { const k = Math.pow(Math.max(0, Math.sin(t * 1.4)), 6); o.z += k * 2.3; o.y -= k * .5; },
};
const smooth = f => f * f * (3 - 2 * f);
let scrollV = 0, lastY = scrollY, lastYT = performance.now(), tiltX = 0, tiltY = 0, tilt0 = null;
const OFF = { x: 0, y: 0, z: 0 };
function phoneDrive(T, dt) {
  const S = G.S, vc = scrollY + innerHeight / 2;
  const cs = secs.map(el => { const r = el.getBoundingClientRect(); return r.top + scrollY + r.height / 2; });
  let i = 0; while (i < cs.length - 1 && cs[i + 1] <= vc) i++;
  const j = Math.min(i + 1, cs.length - 1), f = j === i ? 0 : smooth(clamp((vc - cs[i]) / (cs[j] - cs[i]), 0, 1));
  const ma = secs[i].dataset.move || 'close', mb = secs[j].dataset.move || 'close';
  const A = POSE[ma], B = POSE[mb], m = k => lerp(A[k], B[k], f);
  S.home.set(m('x'), m('y'), m('z'));
  S._lift = m('lift'); S._back = m('back'); S._dy = m('dy'); S.lookHome = 0;
  // the move: blend both sections' moves by how much each is on screen
  const t = REDUCED ? 0 : T;
  const oa = { x: 0, y: 0, z: 0 }, ob = { x: 0, y: 0, z: 0 };
  const ya = MOVE[ma](t, oa) || 0, yb = MOVE[mb](t, ob) || 0;
  OFF.x = lerp(oa.x, ob.x, f); OFF.y = lerp(oa.y, ob.y, f); OFF.z = lerp(oa.z, ob.z, f);
  // scroll speed: dive forward when you flick down, pull up when you flick back
  const sv = clamp(scrollV / 2400, -1, 1);
  OFF.y -= sv * .35; OFF.z += Math.abs(sv) * .3;
  // phone tilt: lean and drift
  OFF.x += tiltX * .45; OFF.y += tiltY * .2;
  const wk = clamp(innerWidth / 390, .8, 1.3);   // narrower phone = less side travel
  S.off.set(OFF.x * wk, OFF.y, OFF.z);
  S.yawHome = lerp(A.yaw + ya, B.yaw + yb, f) + tiltX * .4;
  S.follow = (ma === 'orbit' || ma === 'dash' ? 1 - f : 0) + (mb === 'orbit' || mb === 'dash' ? f : 0);
  S.padK = .25;   // the landing-pad decal sits right under the hero text on phones
  scrollV *= Math.exp(-5 * dt);
}
addEventListener('scroll', () => {
  const now = performance.now(), dts = Math.max(.008, (now - lastYT) / 1000);
  scrollV = lerp(scrollV, (scrollY - lastY) / dts, .5); lastY = scrollY; lastYT = now;
}, { passive: true });

// tap empty space: barrel roll (+ short buzz on Android)
let tap = null;
addEventListener('pointerdown', e => { tap = e.target.closest('a, button') ? null : { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });
addEventListener('pointerup', e => {
  if (!tap || !G || T < INTRO_END) return;
  if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 12 && performance.now() - tap.t < 350) {
    G.roll(); SND.open(); if (TOUCH && navigator.vibrate) navigator.vibrate(25);
  }
  tap = null;
}, { passive: true });

// tilt: Android sends it straight away; iPhone needs permission, asked once on the first tap
function onTilt(e) {
  if (e.gamma == null) return;
  if (!tilt0) tilt0 = { g: e.gamma, b: e.beta };
  tiltX = lerp(tiltX, clamp((e.gamma - tilt0.g) / 30, -1, 1), .2);
  tiltY = lerp(tiltY, clamp((e.beta - tilt0.b) / 30, -1, 1), .2);
}
if (TOUCH && 'DeviceOrientationEvent' in window) {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    addEventListener('click', () => DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') addEventListener('deviceorientation', onTilt); }).catch(() => {}), { once: true });
  } else addEventListener('deviceorientation', onTilt);
}
function resetPhone() { if (!G) return; G.S.off.set(0, 0, 0); G.S.follow = 0; G.S.padK = 1; applySpot(spot); }

/* ---- intro ---- */
let T = 0, prevT = 0, frozen = false, lastTitle = '';
const seen = (() => { try { return !!sessionStorage.getItem('df-concept'); } catch { return false; } })();
if (REDUCED || (seen && !Q.has('intro'))) T = prevT = INTRO_END;
if (G) G.simulateTo(T);
const skip = () => { if (T < INTRO_END && !frozen) { T = prevT = INTRO_END; if (G) G.simulateTo(T); } };
addEventListener('keydown', e => { if (e.key === 'm' || e.key === 'M') $('#snd').click(); else skip(); });
addEventListener('pointerdown', skip, true);
addEventListener('wheel', skip, { passive: true });
addEventListener('touchstart', skip, { passive: true });

$('#snd').addEventListener('click', () => {
  const on = SND.toggle(); $('#snd').classList.toggle('on', on); $('#snd').setAttribute('aria-pressed', String(on)); $('#snd b').textContent = on ? 'on' : 'off';
});

function ui(T) {
  $('#boot').style.setProperty('--p', span(T, 0, .9).toFixed(3));
  $('#bootTxt').textContent = T < .45 ? 'SYSTEMS CHECK' : T < .9 ? 'ROTORS ARMED' : 'LAUNCH';
  $('#boot').classList.toggle('gone', T > 1.05);
  const ready = T >= READY_AT;
  document.body.classList.toggle('ready', ready);
  $('#top').classList.toggle('in', ready);
  let t = '';
  TITLE.forEach((ch, i) => {
    const at = READY_AT + .1 + i * .05, cls = i >= TITLE.length - 5 ? 'ch s' : 'ch';
    if (T >= at) t += `<span class="${cls}">${ch}</span>`;
    else if (T >= READY_AT + i * .02) t += `<span class="ch">${GLYPHS[(Math.floor(T * 24) + i * 7) % GLYPHS.length]}</span>`;
    else t += `<span class="ch" style="opacity:0">${ch}</span>`;
  });
  if (t !== lastTitle) { $('#title').innerHTML = t; lastTitle = t; }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (!frozen) T += dt;
  if (G) {
    const S = G.S, a = 1 - Math.exp(-2.2 * dt), w = frozen ? 1 : a;
    S.camLift += ((S._lift || 0) - S.camLift) * w; S.camBack += ((S._back || 0) - S.camBack) * w; S.lookDY += ((S._dy || 0) - S.lookDY) * w;
    if (portrait() && T >= INTRO_END - 1.2) phoneDrive(T, frozen ? 0 : dt);
    if (!frozen) G.step(dt, T);
    if (!frozen && T > INTRO_END) G.quality(dt);
    G.apply(T, frozen ? 0 : dt);
    if (SND.on) SND.rpm(S.rpm);
    if (!frozen) for (let i = 0; i < 6; i++) { const on = 1.05 + i * .11; if (prevT < on && T >= on) SND.clunk(); }
  }
  ui(T);
  if (T >= INTRO_END && prevT < INTRO_END) { try { sessionStorage.setItem('df-concept', '1'); } catch {} onScroll(); }
  prevT = T;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.CONCEPT = {
  seek(t) { frozen = true; T = prevT = t; if (G) { G.simulateTo(t); } ui(t); frame(performance.now()); },
  play() { frozen = false; last = performance.now(); },
  go(sel) { const el = typeof sel === 'number' ? secs[sel] : $(sel); el.scrollIntoView({ behavior: 'instant', block: 'center' }); onScroll(); },
  setColor,
  info: () => ({ T, spot, side: document.body.dataset.side, ready: document.body.classList.contains('ready'), gl: !!G, gpu: G && G.gpu,
    drone: G && G.S.pos.toArray().map(v => +v.toFixed(2)), yaw: G && +G.S.yaw.toFixed(2), portrait: portrait(), sections: secs.length, dpr: G && G.dpr(), fps: G && G.fps }),
  roll: () => G && G.roll(),
  // test: run the phone flight sim (no rendering) for `sec` seconds at the current scroll; returns how far it moved
  probe(sec = 3) {
    const S = G.S, lo = [1e9, 1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9, -1e9];
    for (let k = 0; k < sec * 60; k++) {
      T += 1 / 60; phoneDrive(T, 1 / 60); G.step(1 / 60, T);
      [S.pos.x, S.pos.y, S.pos.z, S.yaw].forEach((v, a) => { lo[a] = Math.min(lo[a], v); hi[a] = Math.max(hi[a], v); });
    }
    return hi.map((v, a) => +(v - lo[a]).toFixed(2));
  },
};
