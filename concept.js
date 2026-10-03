// DroneFight concept page. (c) 2026 Devashish Tiwari (iydebu). All rights reserved.
// Static teaser: no server, no design doc. The drone flies to a new spot for each section as you scroll.
// Test hook: window.CONCEPT (seek, play, go, info, setColor).
import { buildScene, SND, COLORS, REDUCED, span, ease } from './scene.js';

const $ = s => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const READY_AT = 3.0, INTRO_END = 4.4;
const GLYPHS = '#%&*+=<>/\\|01'.split('');
const TITLE = 'DRONEFIGHT'.split('');
const phone = () => innerWidth < 900;

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
addEventListener('resize', () => { G && G.resize(); applySpot(spot); onScroll(); });

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
    if (!frozen) G.step(dt, T);
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
    drone: G && G.S.pos.toArray().map(v => +v.toFixed(2)), sections: secs.length }),
};
