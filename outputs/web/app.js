/* Nigeria Connectivity Priority Atlas
   Plain JavaScript, no libraries. The map is drawn on a canvas using Web Mercator,
   the charts are SVG. Data comes from the files the analysis notebook writes
   next to this page (see Method and data). */
(function () {
'use strict';

/* ---------- small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
const isNum = v => typeof v === 'number' && isFinite(v);
const MINUS = '−';

const fmtInt = v => isNum(v) ? Math.round(v).toLocaleString('en-US') : 'No data';
function fmtCompact(v) {
  if (!isNum(v)) return 'No data';
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
  if (a >= 1e4) return Math.round(v / 1e3) + 'K';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(Math.round(v));
}
const fmtPct = (v, d = 1) => isNum(v) ? (v * 100).toFixed(d) + '%' : 'No data';
const fmt1 = v => isNum(v) ? v.toFixed(1) : 'No data';
const fmt2 = v => isNum(v) ? (v < 0 ? MINUS : '') + Math.abs(v).toFixed(2) : 'No data';
const fmtKm = v => isNum(v) ? (v >= 100 ? Math.round(v) : v.toFixed(1)) + ' km' : 'No data';
const fmtMbps = v => isNum(v) ? v.toFixed(1) + ' Mbps' : 'No tiles';
const fmtPctile = v => isNum(v) ? Math.round(v * 100) + '' : 'No data';
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/* ---------- constants ---------- */
const FILES = {
  lgas: 'lgas.geojson', states: 'states.geojson', zones: 'zones.geojson',
  sites: 'tower_sites.geojson', facilities: 'facilities_priority.geojson', summary: 'summary.json'
};
const CLASS_NAMES = ['Q1 lowest', 'Q2', 'Q3', 'Q4', 'Q5 highest'];
const RAMPS = {
  risk: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'],
  good: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c']
};
const CLASS_COLORS = RAMPS.risk;
const COMPONENTS = [
  { key: 'service_gap', label: 'Service gap', color: '#2f6f9f', text: 'Share of settlement buildings that are unmeasured or below 10 Mbps.' },
  { key: 'exposure', label: 'Exposure', color: '#d98b2b', text: 'Estimated number of people living in underserved settlements.' },
  { key: 'infra_gap', label: 'Infrastructure gap', color: '#5b8c5a', text: 'Average distance from buildings to the nearest cell tower.' },
  { key: 'need', label: 'Need', color: '#8a5a9e', text: 'Lower Relative Wealth Index means higher need.' },
  { key: 'institution_gap', label: 'Institution gap', color: '#b5483f', text: 'Share of schools and health facilities on unmeasured or slow tiles.' }
];
const ZONE_COLORS = { 'North Central': '#4c78a8', 'North East': '#f58518', 'North West': '#54a24b', 'South East': '#b279a2', 'South South': '#e45756', 'South West': '#72b7b2' };
const CLUSTERS = [
  { key: 'High-High (priority cluster)', short: 'High-High', color: '#b2182b', text: 'High priority, with high-priority neighbours' },
  { key: 'High-Low outlier', short: 'High-Low', color: '#ef8a62', text: 'High priority among low-priority neighbours' },
  { key: 'Low-High outlier', short: 'Low-High', color: '#92c5de', text: 'Low priority among high-priority neighbours' },
  { key: 'Low-Low', short: 'Low-Low', color: '#2166ac', text: 'Low priority, with low-priority neighbours' },
  { key: 'Not significant', short: 'Not significant', color: '#c4c9cf', text: 'No significant spatial pattern' }
];
const METRICS = {
  priority: { label: 'Priority index', fmt: fmt1, ramp: 'risk', desc: 'Weighted score of five components, 0 to 100. Higher means act sooner.' },
  underserved_pop: { label: 'Underserved people', fmt: fmtCompact, ramp: 'risk', desc: 'Estimated people living in unmeasured or slow settlements.' },
  underserved_share: { label: 'Underserved share of buildings', fmt: v => fmtPct(v), ramp: 'risk', desc: 'Buildings that are unmeasured or below 10 Mbps. Close to 100% almost everywhere, so use equal intervals or other metrics to see contrast.' },
  population: { label: 'Population', fmt: fmtCompact, ramp: 'good', desc: 'WorldPop 2020 population.' },
  mean_dist_tower_km: { label: 'Distance to nearest tower', fmt: fmtKm, ramp: 'risk', desc: 'Average distance from buildings to the nearest recorded cell tower.' },
  far_share: { label: 'Buildings over 5 km from a tower', fmt: v => fmtPct(v), ramp: 'risk', desc: 'Share of buildings farther than 5 km from any recorded tower.' },
  mean_rwi: { label: 'Relative Wealth Index', fmt: fmt2, ramp: 'good', desc: 'Modelled relative wealth. Lower values (lighter) mean poorer areas.' },
  mean_speed_mbps: { label: 'Measured download speed', fmt: fmtMbps, ramp: 'good', desc: 'Average of measured Ookla tiles only. Areas with no tiles are grey.' },
  institution_share: { label: 'Institutions without measured service', fmt: v => fmtPct(v), ramp: 'risk', desc: 'Schools and health facilities on unmeasured or slow tiles.' },
  service_gap: { label: 'Component: service gap', fmt: fmtPctile, ramp: 'risk', desc: 'Percentile rank, 0 to 100.', comp: true },
  exposure: { label: 'Component: exposure', fmt: fmtPctile, ramp: 'risk', desc: 'Percentile rank, 0 to 100.', comp: true },
  infra_gap: { label: 'Component: infrastructure gap', fmt: fmtPctile, ramp: 'risk', desc: 'Percentile rank, 0 to 100.', comp: true },
  need: { label: 'Component: need', fmt: fmtPctile, ramp: 'risk', desc: 'Percentile rank, 0 to 100.', comp: true },
  institution_gap: { label: 'Component: institution gap', fmt: fmtPctile, ramp: 'risk', desc: 'Percentile rank, 0 to 100.', comp: true },
  top_decile_freq: { label: 'Robustness: top-decile frequency', fmt: v => fmtPct(v, 0), ramp: 'risk', desc: 'Share of 1,000 random weightings that put the LGA in the national top 10%. LGA level only.', lgaOnly: true }
};

/* ---------- state ---------- */
const D = {};   // loaded data and indexes
const U = {     // user interface state
  view: 'overview',
  ovZone: '',
  level: 'auto', metric: 'priority', cls: 'quantile',
  f: { zone: '', state: '', classes: new Set(), setOnly: false },
  ly: { cluster: false, set: true, sites: false, health: false, school: false, base: false },
  sel: null, hover: null,
  rk: { level: 'lga', q: '', zone: '', cls: '', cluster: '', sort: { key: 'priority_rank', dir: 1 }, page: 0 }
};

/* ---------- geometry ---------- */
const mx = lon => (lon + 180) / 360;
const my = lat => {
  const s = Math.sin(clamp(lat, -85, 85) * Math.PI / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const unmx = x => x * 360 - 180;
const unmy = y => { const n = Math.PI - 2 * Math.PI * y; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

function prepFeature(f, level, idKey) {
  const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, best = null, bestA = -1;
  const out = polys.map(poly => poly.map((ring, ri) => {
    const a = new Float64Array(ring.length * 2);
    let sx = 0, sy = 0, area = 0;
    for (let i = 0; i < ring.length; i++) {
      const x = mx(ring[i][0]), y = my(ring[i][1]);
      a[2 * i] = x; a[2 * i + 1] = y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (ri === 0) {
      for (let i = 0, n = ring.length - 1; i < n; i++) {
        const cr = a[2 * i] * a[2 * i + 3] - a[2 * i + 2] * a[2 * i + 1];
        area += cr; sx += (a[2 * i] + a[2 * i + 2]) * cr; sy += (a[2 * i + 1] + a[2 * i + 3]) * cr;
      }
      const A = Math.abs(area) / 2;
      if (A > bestA && area !== 0) { bestA = A; best = [sx / (3 * area), sy / (3 * area)]; }
    }
    return a;
  }));
  const p = f.properties;
  return { level, id: p[idKey], p, polys: out, bbox: [x0, y0, x1, y1], c: best || [(x0 + x1) / 2, (y0 + y1) / 2] };
}

function pointInRing(x, y, a) {
  let inside = false;
  for (let i = 0, j = a.length / 2 - 1, n = a.length / 2; i < n; j = i++) {
    const xi = a[2 * i], yi = a[2 * i + 1], xj = a[2 * j], yj = a[2 * j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function hitFeature(rec, x, y) {
  const b = rec.bbox;
  if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  for (const poly of rec.polys) {
    if (pointInRing(x, y, poly[0])) {
      let hole = false;
      for (let i = 1; i < poly.length; i++) if (pointInRing(x, y, poly[i])) { hole = true; break; }
      if (!hole) return true;
    }
  }
  return false;
}

/* ---------- data loading ---------- */
async function getJSON(name) {
  const r = await fetch(FILES[name]);
  if (!r.ok) throw new Error(FILES[name] + ' returned ' + r.status);
  return r.json();
}

async function loadCore() {
  const [lg, st, zn, si, sm] = await Promise.all(['lgas', 'states', 'zones', 'sites', 'summary'].map(getJSON));
  D.summary = sm;
  D.lgas = lg.features.map(f => prepFeature(f, 'lga', 'lga_id'));
  D.states = st.features.map(f => prepFeature(f, 'state', 'statecode'));
  D.zones = zn.features.map(f => prepFeature(f, 'zone', 'zone'));
  D.sites = si.features.map(f => ({
    level: 'site', id: f.properties.rank, p: f.properties,
    x: mx(f.geometry.coordinates[0]), y: my(f.geometry.coordinates[1])
  }));
  D.byLevel = { lga: D.lgas, state: D.states, zone: D.zones };
  D.lgaById = new Map(D.lgas.map(r => [r.id, r]));
  D.stateByCode = new Map(D.states.map(r => [r.id, r]));
  D.zoneByName = new Map(D.zones.map(r => [r.id, r]));
  D.stateByName = new Map(D.states.map(r => [r.p.statename, r]));
  D.zoneNames = D.zones.map(r => r.id).sort();
  D.statesInZone = z => D.states.filter(r => r.p.zone === z);
  D.W = (sm.parameters && sm.parameters.weights) || { service_gap: .3, exposure: .2, infra_gap: .15, need: .2, institution_gap: .15 };
  D.facLoaded = false;
}

async function loadFacilities() {
  if (D.facLoaded) return;
  if (D.facPromise) return D.facPromise;
  D.facPromise = getJSON('facilities').then(j => {
    D.fac = j.features.map(f => {
      const p = f.properties, l = D.lgaById.get(p.lga_id);
      return {
        p, x: mx(f.geometry.coordinates[0]), y: my(f.geometry.coordinates[1]),
        k: p.kind, zone: l ? l.p.zone : '', sc: l ? l.p.statecode : ''
      };
    });
    D.facLoaded = true;
  });
  return D.facPromise;
}

/* ---------- filters ---------- */
function passes(rec, f = U.f) {
  const p = rec.p;
  if (f.zone && p.zone !== f.zone) return false;
  if (f.state && rec.level !== 'zone' && p.statecode !== f.state) return false;
  if (f.state && rec.level === 'zone') {
    const s = D.stateByCode.get(f.state);
    if (s && s.p.zone !== p.zone) return false;
  }
  if (f.classes.size && !f.classes.has(p.priority_class)) return false;
  if (f.setOnly && rec.level === 'lga' && !p.in_priority_set) return false;
  return true;
}
const filtersActive = () => !!(U.f.zone || U.f.state || U.f.classes.size || U.f.setOnly);

/* ---------- colour scales ---------- */
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rampAt(ramp, t) {
  const stops = RAMPS[ramp], x = clamp(t, 0, 1) * (stops.length - 1), i = Math.min(Math.floor(x), stops.length - 2), k = x - i;
  const a = hex2rgb(stops[i]), b = hex2rgb(stops[i + 1]);
  return 'rgb(' + a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(',') + ')';
}
const scaleCache = new Map();
function getScale(level, key, mode) {
  const ck = level + '|' + key + '|' + mode;
  if (scaleCache.has(ck)) return scaleCache.get(ck);
  const m = METRICS[key];
  const vals = D.byLevel[level].map(r => r.p[key]).filter(isNum).sort((a, b) => a - b);
  const n = vals.length;
  let cuts = [];
  if (n) {
    if (mode === 'equal') {
      const lo = vals[0], hi = vals[n - 1];
      for (let i = 1; i < 5; i++) cuts.push(lo + (hi - lo) * i / 5);
    } else {
      for (let i = 1; i < 5; i++) cuts.push(vals[Math.min(n - 1, Math.floor(n * i / 5))]);
    }
  }
  cuts = cuts.filter((c, i) => i === 0 || c > cuts[i - 1]);
  const nc = cuts.length + 1;
  const colors = [];
  for (let i = 0; i < nc; i++) colors.push(rampAt(m.ramp, nc === 1 ? 0.5 : i / (nc - 1)));
  const counts = new Array(nc).fill(0);
  let missing = 0;
  D.byLevel[level].forEach(r => { const v = r.p[key]; if (!isNum(v)) missing++; else counts[classIdx({ cuts }, v)]++; });
  const sc = { cuts, colors, counts, missing, min: vals[0], max: vals[n - 1], level, key, mode };
  scaleCache.set(ck, sc);
  return sc;
}
function classIdx(sc, v) { let i = 0; while (i < sc.cuts.length && v >= sc.cuts[i]) i++; return i; }
function colorFor(sc, v, theme) { return isNum(v) ? sc.colors[classIdx(sc, v)] : theme.nodata; }

/* ---------- tooltip ---------- */
const tipEl = $('#tip');
function showTip(html, x, y) {
  tipEl.innerHTML = html;
  tipEl.classList.add('on');
  const r = tipEl.getBoundingClientRect();
  let px = x + 14, py = y + 14;
  if (px + r.width > innerWidth - 8) px = x - r.width - 14;
  if (py + r.height > innerHeight - 8) py = y - r.height - 14;
  tipEl.style.left = Math.max(8, px) + 'px';
  tipEl.style.top = Math.max(8, py) + 'px';
}
const hideTip = () => tipEl.classList.remove('on');
const tipRow = (a, b) => '<div class="row"><span>' + esc(a) + '</span><span class="num">' + esc(b) + '</span></div>';

/* ---------- names ---------- */
function areaName(rec) {
  const p = rec.p;
  if (rec.level === 'lga') return p.lganame;
  if (rec.level === 'state') return p.statename;
  if (rec.level === 'zone') return p.zone;
  return 'Tower site ' + p.rank;
}
function areaSub(rec) {
  const p = rec.p;
  if (rec.level === 'lga') return p.statename + ', ' + p.zone;
  if (rec.level === 'state') return p.zone;
  if (rec.level === 'zone') return p.n_lgas + ' LGAs';
  return (p.lga || '') + ', ' + p.zone;
}
const levelWord = l => ({ lga: 'LGA', state: 'State', zone: 'Zone', site: 'Upgrade site' }[l]);
function rankOf(rec) { return rec.p.priority_rank; }
function rankTotal(level) { return D.byLevel[level].length; }

/* =====================================================================
   MAP: canvas renderer, interaction, legend, detail panel
   ===================================================================== */
const stage = $('#stage'), canvas = $('#mapCanvas'), ctx = canvas.getContext('2d');
const M = { w: 0, h: 0, dpr: 1, view: { cx: 0.52, cy: 0.5, z: 5 }, fitZ: 6, raf: 0, anim: null, tiles: new Map(), level: 'state', legendKey: '', needFit: true };
let T = {};

function readTheme() {
  const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
  const dark = document.documentElement.dataset.theme === 'dark';
  T = {
    dark, bg: g('--map-bg'), edge: g('--map-edge'), strong: g('--map-edge-strong'), label: g('--map-label'), halo: g('--map-halo'),
    nodata: dark ? '#2a3036' : '#d3d8dd', faded: dark ? '#1b2025' : '#dde1e5',
    site: dark ? '#f2f4f5' : '#14181d', siteText: dark ? '#111' : '#fff', ring: dark ? '#111' : '#fff', accent: g('--accent')
  };
}

const scaleNow = () => 256 * Math.pow(2, M.view.z);
const minZ = () => M.fitZ - 1.3;
const MAXZ = 13;
function requestDraw() { if (!M.raf) M.raf = requestAnimationFrame(draw); }

function activeLevel() {
  if (U.ly.cluster) return 'lga';
  if (METRICS[U.metric].lgaOnly) return 'lga';
  if (U.level !== 'auto') return U.level;
  const d = M.view.z - M.fitZ;
  return d < -0.4 ? 'zone' : d < 0.9 ? 'state' : 'lga';
}

/* ----- sizing and view ----- */
function syncSize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (w === M.w && h === M.h && dpr === M.dpr) return true;
  const first = M.w === 0;
  M.w = w; M.h = h; M.dpr = dpr;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const home = homeView();
  M.fitZ = home.z;
  if (first || M.needFit) { Object.assign(M.view, home); M.needFit = false; }
  requestDraw();
  return true;
}
function bboxAll(list) {
  const b = [1, 1, 0, 0];
  list.forEach(r => { b[0] = Math.min(b[0], r.bbox[0]); b[1] = Math.min(b[1], r.bbox[1]); b[2] = Math.max(b[2], r.bbox[2]); b[3] = Math.max(b[3], r.bbox[3]); });
  return b;
}
function fitBBox(b, pad = 28, maxZ = 10) {
  const dx = Math.max(b[2] - b[0], 1e-6), dy = Math.max(b[3] - b[1], 1e-6);
  const z = Math.log2(Math.min((M.w - 2 * pad) / (dx * 256), (M.h - 2 * pad) / (dy * 256)));
  return { cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, z: clamp(z, 0, maxZ) };
}
const homeView = () => fitBBox(bboxAll(D.zones), 24);
function setView(v) {
  M.view.z = clamp(v.z, minZ(), MAXZ);
  M.view.cx = clamp(v.cx, 0, 1); M.view.cy = clamp(v.cy, 0, 1);
  requestDraw();
}
function flyTo(t, ms = 600) {
  if (M.anim) cancelAnimationFrame(M.anim);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setView(t); return; }
  const s = { ...M.view }, t0 = performance.now();
  const ease = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const step = now => {
    const k = clamp((now - t0) / ms, 0, 1), e = ease(k);
    setView({ cx: s.cx + (t.cx - s.cx) * e, cy: s.cy + (t.cy - s.cy) * e, z: s.z + (t.z - s.z) * e });
    M.anim = k < 1 ? requestAnimationFrame(step) : 0;
  };
  M.anim = requestAnimationFrame(step);
}
function zoomAt(px, py, dz) {
  const z0 = M.view.z, z1 = clamp(z0 + dz, minZ(), MAXZ);
  const S0 = 256 * Math.pow(2, z0), S1 = 256 * Math.pow(2, z1);
  const wx = M.view.cx + (px - M.w / 2) / S0, wy = M.view.cy + (py - M.h / 2) / S0;
  setView({ cx: wx - (px - M.w / 2) / S1, cy: wy - (py - M.h / 2) / S1, z: z1 });
}
const toWorld = (px, py) => { const S = scaleNow(); return [M.view.cx + (px - M.w / 2) / S, M.view.cy + (py - M.h / 2) / S]; };

/* ----- tiles (optional street basemap) ----- */
function drawTiles() {
  const z = M.view.z, tz = clamp(Math.round(z), 2, 15), n = Math.pow(2, tz), S0 = scaleNow(), ts = S0 / n;
  const x0 = Math.floor((M.view.cx - M.w / 2 / S0) * n), x1 = Math.floor((M.view.cx + M.w / 2 / S0) * n);
  const y0 = Math.max(0, Math.floor((M.view.cy - M.h / 2 / S0) * n)), y1 = Math.min(n - 1, Math.floor((M.view.cy + M.h / 2 / S0) * n));
  ctx.save();
  if ('filter' in ctx) ctx.filter = T.dark ? 'invert(1) hue-rotate(180deg) grayscale(0.7) brightness(0.75)' : 'grayscale(0.75) brightness(1.04)';
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const wx = ((x % n) + n) % n, key = tz + '/' + wx + '/' + y;
    let img = M.tiles.get(key);
    if (!img) {
      if (M.tiles.size > 500) M.tiles.delete(M.tiles.keys().next().value);
      img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = requestDraw; img.onerror = () => { img.failed = true; };
      img.src = 'https://tile.openstreetmap.org/' + key + '.png';
      M.tiles.set(key, img);
    }
    if (img.complete && img.naturalWidth) {
      const sx = (x / n - M.view.cx) * S0 + M.w / 2, sy = (y / n - M.view.cy) * S0 + M.h / 2;
      ctx.drawImage(img, Math.round(sx), Math.round(sy), Math.ceil(ts) + 1, Math.ceil(ts) + 1);
    }
  }
  ctx.restore();
}

/* ----- drawing ----- */
function trace(rec, S, ox, oy) {
  ctx.beginPath();
  for (const poly of rec.polys) for (const ring of poly) {
    const n = ring.length / 2;
    let lx = 0, ly = 0;
    for (let i = 0; i < n; i++) {
      const x = ring[2 * i] * S + ox, y = ring[2 * i + 1] * S + oy;
      if (i === 0) { ctx.moveTo(x, y); lx = x; ly = y; continue; }
      if (i < n - 1 && Math.abs(x - lx) < 0.5 && Math.abs(y - ly) < 0.5) continue;
      ctx.lineTo(x, y); lx = x; ly = y;
    }
    ctx.closePath();
  }
}
function visible(rec, S, ox, oy) {
  const b = rec.bbox;
  return !(b[2] * S + ox < 0 || b[0] * S + ox > M.w || b[3] * S + oy < 0 || b[1] * S + oy > M.h);
}
const clusterColor = key => (CLUSTERS.find(c => c.key === key) || CLUSTERS[4]).color;

function currentScale(level) { return getScale(level, METRICS[U.metric].lgaOnly ? 'top_decile_freq' : U.metric, U.cls); }

function draw() {
  M.raf = 0;
  if (!M.w) return;
  const dpr = M.dpr, S = scaleNow(), ox = M.w / 2 - M.view.cx * S, oy = M.h / 2 - M.view.cy * S;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, M.w, M.h);
  if (U.ly.base) drawTiles();

  const level = activeLevel();
  M.level = level;
  const list = D.byLevel[level], sc = U.ly.cluster ? null : currentScale(level);
  const anyFilter = filtersActive();
  ctx.lineJoin = 'round';

  // fills
  ctx.globalAlpha = U.ly.base ? 0.74 : 1;
  for (const r of list) {
    if (!visible(r, S, ox, oy)) continue;
    const ok = !anyFilter || passes(r);
    ctx.fillStyle = !ok ? T.faded : U.ly.cluster ? clusterColor(r.p.cluster) : colorFor(sc, r.p[sc.key], T);
    trace(r, S, ox, oy);
    ctx.fill('evenodd');
  }
  ctx.globalAlpha = 1;

  // edges
  ctx.strokeStyle = T.edge;
  ctx.lineWidth = level === 'lga' ? 0.5 : level === 'state' ? 0.9 : 1.2;
  for (const r of list) { if (!visible(r, S, ox, oy)) continue; trace(r, S, ox, oy); ctx.stroke(); }

  // parent boundaries for context
  if (level === 'lga' || level === 'state') {
    const parents = level === 'lga' ? D.states : D.zones;
    ctx.strokeStyle = T.strong; ctx.globalAlpha = level === 'lga' ? 0.5 : 0.55; ctx.lineWidth = level === 'lga' ? 1.1 : 1.5;
    for (const r of parents) { if (!visible(r, S, ox, oy)) continue; trace(r, S, ox, oy); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  // priority set outline
  if (level === 'lga' && U.ly.set) {
    ctx.strokeStyle = T.strong; ctx.lineWidth = 1.5;
    for (const r of list) {
      if (!r.p.in_priority_set || !visible(r, S, ox, oy)) continue;
      if (anyFilter && !passes(r)) continue;
      trace(r, S, ox, oy); ctx.stroke();
    }
  }

  // facilities
  if (D.facLoaded && (U.ly.health || U.ly.school)) drawFacilities(S, ox, oy);

  // hover and selection outlines
  const hv = U.hover && U.hover.kind === 'area' ? U.hover.rec : null;
  if (hv) { ctx.strokeStyle = T.strong; ctx.lineWidth = 2; trace(hv, S, ox, oy); ctx.stroke(); }
  if (U.sel && U.sel.level !== 'site') {
    ctx.strokeStyle = T.accent; ctx.lineWidth = 3.2; trace(U.sel.rec, S, ox, oy); ctx.stroke();
    ctx.strokeStyle = T.ring; ctx.lineWidth = 1; trace(U.sel.rec, S, ox, oy); ctx.stroke();
  }

  // upgrade sites
  if (U.ly.sites) drawSites(S, ox, oy);

  // labels
  drawLabels(list, level, S, ox, oy);
  updateStatus();
}

function facVisible(f) {
  if (U.f.zone && f.zone !== U.f.zone) return false;
  if (U.f.state && f.sc !== U.f.state) return false;
  return true;
}
function drawFacilities(S, ox, oy) {
  const d = M.view.z - M.fitZ, big = d > 2.2, s = d > 0.8 ? 3 : 2;
  ctx.globalAlpha = 0.85;
  [['school', '#1971c2', U.ly.school], ['health', '#d6336c', U.ly.health]].forEach(([k, col, on]) => {
    if (!on) return;
    ctx.fillStyle = col;
    for (const f of D.fac) {
      if (f.k !== k || !facVisible(f)) continue;
      const x = f.x * S + ox, y = f.y * S + oy;
      if (x < -4 || y < -4 || x > M.w + 4 || y > M.h + 4) continue;
      if (big) { ctx.beginPath(); ctx.arc(x, y, 3.6, 0, 6.2832); ctx.fill(); ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.stroke(); }
      else ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  });
  ctx.globalAlpha = 1;
}
const siteRadius = s => clamp(3.5 + Math.sqrt(s.p.people_reached || 0) / 90, 4, 10);
function siteVisible(s) {
  if (U.f.zone && s.p.zone !== U.f.zone) return false;
  if (U.f.state) { const l = D.lgaById.get(s.p.lga_id); if (!l || l.p.statecode !== U.f.state) return false; }
  return true;
}
function drawSites(S, ox, oy) {
  const labelOn = M.view.z - M.fitZ > 0.5;
  ctx.font = '700 10px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = D.sites.length - 1; i >= 0; i--) {
    const s = D.sites[i];
    if (!siteVisible(s)) continue;
    const x = s.x * S + ox, y = s.y * S + oy;
    if (x < -20 || y < -20 || x > M.w + 20 || y > M.h + 20) continue;
    const r = siteRadius(s), isSel = U.sel && U.sel.level === 'site' && U.sel.id === s.id;
    ctx.beginPath(); ctx.arc(x, y, r + (isSel ? 3 : 0), 0, 6.2832);
    ctx.fillStyle = isSel ? T.accent : T.site; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = T.ring; ctx.stroke();
    if (labelOn && r >= 6) { ctx.fillStyle = isSel ? '#fff' : T.siteText; ctx.fillText(String(s.id), x, y + 0.5); }
  }
}
function drawLabels(list, level, S, ox, oy) {
  const minW = level === 'zone' ? 0 : level === 'state' ? 46 : 78;
  ctx.font = (level === 'zone' ? '700 13px' : level === 'state' ? '600 11.5px' : '500 11px') + ' Inter, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.2; ctx.lineJoin = 'round';
  const placed = [];
  for (const r of list) {
    const w = (r.bbox[2] - r.bbox[0]) * S;
    if (w < minW || !visible(r, S, ox, oy)) continue;
    const x = r.c[0] * S + ox, y = r.c[1] * S + oy;
    if (x < 8 || y < 8 || x > M.w - 8 || y > M.h - 8) continue;
    const name = areaName(r), tw = ctx.measureText(name).width;
    const box = [x - tw / 2 - 3, y - 8, x + tw / 2 + 3, y + 8];
    if (placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
    placed.push(box);
    ctx.strokeStyle = T.halo; ctx.strokeText(name, x, y);
    ctx.fillStyle = T.label; ctx.fillText(name, x, y);
  }
}

/* ----- picking ----- */
function pick(px, py) {
  const S = scaleNow(), ox = M.w / 2 - M.view.cx * S, oy = M.h / 2 - M.view.cy * S;
  if (U.ly.sites) {
    let best = null, bd = 1e9;
    D.sites.forEach(s => {
      if (!siteVisible(s)) return;
      const d = Math.hypot(s.x * S + ox - px, s.y * S + oy - py);
      if (d <= siteRadius(s) + 3 && d < bd) { best = s; bd = d; }
    });
    if (best) return { kind: 'site', rec: best };
  }
  if (D.facLoaded && (U.ly.health || U.ly.school) && M.view.z - M.fitZ > 0.8) {
    let best = null, bd = 7;
    for (const f of D.fac) {
      if (!U.ly[f.k] || !facVisible(f)) continue;
      const dx = f.x * S + ox - px; if (dx > bd || dx < -bd) continue;
      const d = Math.hypot(dx, f.y * S + oy - py);
      if (d < bd) { best = f; bd = d; }
    }
    if (best) return { kind: 'fac', rec: best };
  }
  const [wx, wy] = toWorld(px, py);
  for (const r of D.byLevel[M.level]) if (hitFeature(r, wx, wy)) return { kind: 'area', rec: r };
  return null;
}

function hoverHTML(h) {
  if (h.kind === 'site') {
    const p = h.rec.p;
    return '<b>Upgrade site ' + p.rank + '</b>' + tipRow('Radio', p.radio) + tipRow('LGA', p.lga) + tipRow('People reached', fmtInt(p.people_reached));
  }
  if (h.kind === 'fac') {
    const p = h.rec.p;
    return '<b>' + esc(p.name || (p.kind === 'school' ? 'School' : 'Health facility')) + '</b>' +
      tipRow('Type', (p.kind === 'school' ? 'School' : 'Health facility') + (p.level ? ', ' + p.level : '')) + tipRow('Owner', p.owner || 'Unknown') +
      tipRow('Service', p.status) + tipRow('LGA', p.lga);
  }
  const r = h.rec, p = r.p, m = METRICS[U.metric];
  let html = '<b>' + esc(areaName(r)) + '</b><span style="opacity:.7">' + esc(areaSub(r)) + '</span>';
  html += tipRow('Priority', fmt1(p.priority) + ' (rank ' + p.priority_rank + ' of ' + rankTotal(r.level) + ')');
  if (U.metric !== 'priority') html += tipRow(m.label, m.fmt(p[METRICS[U.metric].lgaOnly && r.level !== 'lga' ? 'priority' : U.metric]));
  html += tipRow('Underserved people', fmtCompact(p.underserved_pop));
  if (r.level === 'lga' && U.ly.cluster) html += tipRow('Cluster', p.cluster);
  return html;
}

/* ----- pointer interaction ----- */
const ptrs = new Map();
let drag = null, pinch0 = null, moved = 0, hoverPending = null;

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (M.anim) { cancelAnimationFrame(M.anim); M.anim = 0; }
  if (ptrs.size === 1) { drag = { x: e.offsetX, y: e.offsetY }; moved = 0; canvas.classList.add('grabbing'); }
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), z: M.view.z }; drag = null; moved = 99; }
  hideTip();
});
canvas.addEventListener('pointermove', e => {
  const px = e.offsetX, py = e.offsetY;
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: px, y: py });
  if (pinch0 && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    const target = pinch0.z + Math.log2(d / pinch0.d);
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target - M.view.z);
    return;
  }
  if (drag) {
    const dx = px - drag.x, dy = py - drag.y;
    moved += Math.abs(dx) + Math.abs(dy);
    drag.x = px; drag.y = py;
    const S = scaleNow();
    setView({ cx: M.view.cx - dx / S, cy: M.view.cy - dy / S, z: M.view.z });
    return;
  }
  hoverPending = { px, py, cx: e.clientX, cy: e.clientY };
  if (!M.hoverRaf) M.hoverRaf = requestAnimationFrame(doHover);
  const [wx, wy] = toWorld(px, py);
  $('#coordRead').textContent = unmy(wy).toFixed(3) + ', ' + unmx(wx).toFixed(3);
});
function doHover() {
  M.hoverRaf = 0;
  if (!hoverPending) return;
  const { px, py, cx, cy } = hoverPending;
  const h = pick(px, py);
  const prev = U.hover;
  U.hover = h;
  canvas.classList.toggle('pointer', !!h);
  if (h) showTip(hoverHTML(h), cx, cy); else hideTip();
  if ((prev && prev.rec) !== (h && h.rec)) requestDraw();
}
function endPtr(e) {
  const wasClick = drag && moved < 4 && ptrs.size === 1;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch0 = null;
  if (ptrs.size === 0) { drag = null; canvas.classList.remove('grabbing'); }
  if (wasClick && e.type === 'pointerup') {
    const h = pick(e.offsetX, e.offsetY);
    if (!h) clearSelection();
    else if (h.kind === 'area') selectRec(h.rec, { fly: false });
    else if (h.kind === 'site') selectRec(h.rec, { fly: false });
    else showFacilityDetail(h.rec);
  }
}
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerleave', () => { hoverPending = null; if (U.hover) { U.hover = null; requestDraw(); } hideTip(); });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const dz = -e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016);
  zoomAt(e.offsetX, e.offsetY, clamp(dz, -0.6, 0.6));
}, { passive: false });
canvas.addEventListener('dblclick', e => zoomAt(e.offsetX, e.offsetY, 1));
canvas.tabIndex = 0;
canvas.addEventListener('keydown', e => {
  const S = scaleNow(), st = 80 / S;
  const k = e.key;
  if (k === 'ArrowLeft') setView({ ...M.view, cx: M.view.cx - st });
  else if (k === 'ArrowRight') setView({ ...M.view, cx: M.view.cx + st });
  else if (k === 'ArrowUp') setView({ ...M.view, cy: M.view.cy - st });
  else if (k === 'ArrowDown') setView({ ...M.view, cy: M.view.cy + st });
  else if (k === '+' || k === '=') zoomAt(M.w / 2, M.h / 2, 0.5);
  else if (k === '-' || k === '_') zoomAt(M.w / 2, M.h / 2, -0.5);
  else if (k === 'Escape') clearSelection();
  else return;
  e.preventDefault();
});
$('#zoomIn').onclick = () => flyTo({ ...M.view, z: clamp(M.view.z + 0.8, minZ(), MAXZ) }, 250);
$('#zoomOut').onclick = () => flyTo({ ...M.view, z: clamp(M.view.z - 0.8, minZ(), MAXZ) }, 250);
$('#zoomHome').onclick = () => { syncSize(); flyTo(homeView(), 500); };

/* ----- status line ----- */
function updateStatus() {
  const lat = unmy(M.view.cy), mpp = 40075016.686 * Math.cos(lat * Math.PI / 180) / scaleNow();
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000], target = mpp * 90 / 1000;
  let km = nice[0]; for (const n of nice) if (n <= target) km = n;
  $('#scaleBar').style.width = (km * 1000 / mpp) + 'px';
  $('#scaleLabel').textContent = km + ' km';
  const lv = M.level;
  if (M.legendKey !== legendKey()) renderLegend();
  const at = $('#attrib');
  at.textContent = U.ly.base ? 'Basemap: © OpenStreetMap contributors' : 'Boundaries: GRID3. Data sources: see Method and data';
  void lv;
}
const legendKey = () => [M.level, U.metric, U.cls, U.ly.cluster, U.ly.set, U.ly.sites, U.ly.health, U.ly.school, D.facLoaded].join('|');

function renderLegend() {
  M.legendKey = legendKey();
  const lv = M.level, el = $('#legend');
  let html = '';
  if (U.ly.cluster) {
    const counts = {}; D.lgas.forEach(r => counts[r.p.cluster] = (counts[r.p.cluster] || 0) + 1);
    html += '<div class="legend-title">Spatial clusters of priority</div><div class="legend-sub">LGAs, Local Moran\'s I</div>';
    CLUSTERS.forEach(c => { html += '<div class="legend-item"><i style="background:' + c.color + '"></i><span>' + esc(c.short) + '</span><span class="c num">' + (counts[c.key] || 0) + '</span></div>'; });
  } else {
    const sc = currentScale(lv), m = METRICS[sc.key], fm = m.fmt;
    const plural = { zone: 'zones', state: 'states', lga: 'LGAs' }[lv];
    html += '<div class="legend-title">' + esc(m.label) + '</div><div class="legend-sub">' + plural + ', ' + (U.cls === 'quantile' ? 'quantile classes' : 'equal intervals') + '</div>';
    const nc = sc.colors.length;
    for (let i = 0; i < nc; i++) {
      const lo = i === 0 ? sc.min : sc.cuts[i - 1], hi = i === nc - 1 ? sc.max : sc.cuts[i];
      html += '<div class="legend-item"><i style="background:' + sc.colors[i] + '"></i><span class="num">' + esc(fm(lo)) + ' to ' + esc(fm(hi)) + '</span><span class="c num">' + sc.counts[i] + '</span></div>';
    }
    if (sc.missing) html += '<div class="legend-item"><i style="background:' + T.nodata + '"></i><span>No data</span><span class="c num">' + sc.missing + '</span></div>';
  }
  let sym = '';
  if (lv === 'lga' && U.ly.set) sym += '<span><i style="border-radius:2px;background:none;border:2px solid ' + T.strong + '"></i>Priority set</span>';
  if (U.ly.sites) sym += '<span><i style="background:' + T.site + '"></i>Upgrade site</span>';
  if (U.ly.health) sym += '<span><i style="background:#d6336c"></i>Health facility</span>';
  if (U.ly.school) sym += '<span><i style="background:#1971c2"></i>School</span>';
  if (sym) html += '<div class="legend-sym">' + sym + '</div>';
  el.innerHTML = html;
}

/* ----- selection ----- */
function recFor(level, id) {
  if (level === 'site') return D.sites.find(s => s.id === id);
  return level === 'lga' ? D.lgaById.get(id) : level === 'state' ? D.stateByCode.get(id) : D.zoneByName.get(id);
}
function flyToRec(rec) {
  syncSize();
  if (rec.level === 'site') flyTo({ cx: rec.x, cy: rec.y, z: Math.max(M.view.z, M.fitZ + 3.4) });
  else flyTo(fitBBox(rec.bbox, 40, 9.5));
}
function selectRec(rec, opts = {}) {
  U.sel = { level: rec.level, id: rec.id, rec };
  if (rec.level === 'site') U.ly.sites = true, $('#lySites').checked = true;
  openDetail();
  if (opts.fly) flyToRec(rec);
  requestDraw();
  writeHash();
}
function clearSelection() {
  U.sel = null; closeDetail(); requestDraw(); writeHash();
}
function openDetail() {
  $('#view-map').classList.add('has-detail');
  renderDetail();
  syncSize();
}
function closeDetail() {
  $('#view-map').classList.remove('has-detail');
  syncSize();
}

/* ----- detail panel ----- */
const dl = rows => '<dl class="facts">' + rows.map(r => '<dt>' + esc(r[0]) + '</dt><dd class="num">' + r[1] + '</dd>').join('') + '</dl>';
const classPill = c => c ? '<span class="pill"><i style="background:' + CLASS_COLORS[Math.max(0, CLASS_NAMES.indexOf(c))] + '"></i>' + esc(c) + '</span>' : '';

function detailHead(kicker, title) {
  return '<div class="detail-head"><button class="icon-btn detail-close" data-act="close" aria-label="Close details"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
    '<div class="detail-kicker">' + kicker + '</div><div class="detail-title">' + esc(title) + '</div></div>';
}

function renderDetail() {
  const el = $('#detail'), s = U.sel;
  if (!s) { el.innerHTML = ''; return; }
  const r = s.rec, p = r.p;
  if (r.level === 'site') { el.innerHTML = siteDetail(r); return; }
  const wsum = sum(Object.values(D.W));
  let html = detailHead(esc(levelWord(r.level)) + ' &middot; ' + esc(areaSub(r)), areaName(r));

  // score
  let rankLine = '';
  if (r.level === 'lga') rankLine = 'Rank ' + p.priority_rank + ' of 774 nationally, ' + p.state_rank + ' in ' + esc(p.statename) + ', ' + p.zone_rank + ' in ' + esc(p.zone);
  else rankLine = 'Rank ' + p.priority_rank + ' of ' + rankTotal(r.level) + (r.level === 'state' ? ' states' : ' zones');
  html += '<div class="detail-body"><div class="d-sec"><div class="scoreline"><span class="score-big num">' + fmt1(p.priority) + '</span><span class="score-meta">priority score, 0 to 100</span></div>' +
    '<div>' + classPill(p.priority_class) + (r.level === 'lga' && p.in_priority_set ? ' <span class="pill">Priority set</span>' : '') + '</div>' +
    '<div class="score-meta">' + rankLine + '</div></div>';

  // components
  html += '<div class="d-sec"><h4>What drives the score</h4><div class="stack" aria-hidden="true">';
  COMPONENTS.forEach(c => { html += '<span style="width:' + (D.W[c.key] * p[c.key] * 100 / wsum) + '%;background:' + c.color + '" title="' + esc(c.label) + '"></span>'; });
  html += '</div>';
  COMPONENTS.forEach(c => {
    const v = p[c.key], contrib = D.W[c.key] * v * 100 / wsum;
    html += '<div class="comp"><span class="nm">' + esc(c.label) + '<small>weight ' + Math.round(D.W[c.key] * 100) + '%</small></span><span class="val num">' + ordinal(Math.round(v * 100)) + ' pct</span>' +
      '<div class="bar" title="' + esc(c.text) + ' Contributes ' + contrib.toFixed(1) + ' points."><span style="width:' + (v * 100) + '%;background:' + c.color + '"></span></div></div>';
  });
  html += '<p class="note">Each component is a percentile rank among ' + (r.level === 'lga' ? 'all LGAs' : r.level === 'state' ? 'all states' : 'all zones') + '. Hover a bar for what it measures.</p></div>';

  // connectivity
  html += '<div class="d-sec"><h4>People and connectivity</h4>' + dl([
    ['Population', fmtInt(p.population)],
    ['Underserved people', fmtInt(p.underserved_pop) + ' <small>(' + fmtPct(p.population ? p.underserved_pop / p.population : null, 0) + ')</small>'],
    ['Buildings', fmtInt(p.buildings)],
    ['Underserved buildings', fmtPct(p.underserved_share)],
    ['Unmeasured buildings', fmtPct(p.unmeasured_share)],
    ['Below 10 Mbps', fmtPct(p.slow_share)],
    ['Measured download', isNum(p.mean_speed_mbps) ? fmtMbps(p.mean_speed_mbps) : 'No tiles'],
    ['Distance to nearest tower', fmtKm(p.mean_dist_tower_km)],
    ['Buildings over 5 km from a tower', fmtPct(p.far_share)],
    ['Relative Wealth Index', fmt2(p.mean_rwi)]
  ]) + '</div>';

  // institutions
  html += '<div class="d-sec"><h4>Schools and health facilities</h4>' + dl([
    ['Schools', fmtInt(p.schools) + ' <small>(' + fmtInt(p.schools_underserved) + ' underserved)</small>'],
    ['Health facilities', fmtInt(p.health) + ' <small>(' + fmtInt(p.health_underserved) + ' underserved)</small>'],
    ['Students in underserved schools', fmtInt(p.students_underserved)]
  ]) + '<p class="note">Student counts exist for only about 7% of schools, so treat them as a floor.</p></div>';

  // LGA only
  if (r.level === 'lga') {
    const cl = CLUSTERS.find(c => c.key === p.cluster) || CLUSTERS[4];
    html += '<div class="d-sec"><h4>Robustness and spatial pattern</h4>' +
      '<div class="scoreline"><span class="score-big num" style="font-size:22px">' + fmtPct(p.top_decile_freq, 0) + '</span><span class="score-meta">of 1,000 random weightings place it in the national top 10%</span></div>' +
      '<div class="meter"><span style="width:' + (p.top_decile_freq * 100) + '%"></span></div>' +
      '<div><span class="pill"><i style="background:' + cl.color + '"></i>' + esc(cl.short) + '</span></div><p class="note">' + esc(cl.text) + '.</p></div>';
  }

  // drill-down
  if (r.level === 'zone') {
    const kids = D.statesInZone(r.id).sort((a, b) => a.p.priority_rank - b.p.priority_rank);
    html += '<div class="d-sec"><h4>States in this zone</h4><div class="mini-list">' + kids.map(k =>
      '<button data-act="state:' + esc(k.id) + '"><span class="r num">' + k.p.priority_rank + '</span><span>' + esc(k.p.statename) + '</span><span class="v num">' + fmt1(k.p.priority) + '</span></button>').join('') + '</div></div>';
  }
  if (r.level === 'state') {
    const kids = D.lgas.filter(l => l.p.statecode === r.id).sort((a, b) => a.p.state_rank - b.p.state_rank);
    html += '<div class="d-sec"><h4>Highest-priority LGAs in this state</h4><div class="mini-list">' + kids.slice(0, 10).map(k =>
      '<button data-act="lga:' + k.id + '"><span class="r num">' + k.p.state_rank + '</span><span>' + esc(k.p.lganame) + '</span><span class="v num">' + fmt1(k.p.priority) + '</span></button>').join('') + '</div>' +
      (kids.length > 10 ? '<p class="note">' + (kids.length - 10) + ' more in Rankings.</p>' : '') + '</div>';
  }
  if (r.level === 'lga') {
    const sites = D.sites.filter(x => x.p.lga_id === r.id);
    html += '<div class="d-sec"><h4>Upgrade shortlist</h4>' + (sites.length
      ? '<div class="mini-list">' + sites.map(x => '<button data-act="site:' + x.id + '"><span class="r num">#' + x.id + '</span><span>' + esc(x.p.radio) + ' tower</span><span class="v num">' + fmtCompact(x.p.people_reached) + ' people</span></button>').join('') + '</div>'
      : '<p class="note">No tower in this LGA is on the 100-site shortlist.</p>') + '</div>';
  }

  html += '<div class="d-sec"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" data-act="fit">Zoom to area</button><button class="btn small" data-act="rank">Show in Rankings</button></div></div></div>';
  el.innerHTML = html;
  el.scrollTop = 0;
}

function siteDetail(r) {
  const p = r.p, lga = D.lgaById.get(p.lga_id);
  return detailHead('Upgrade site &middot; ' + esc(p.zone), 'Site ' + p.rank + ', ' + p.radio + ' tower') +
    '<div class="detail-body"><div class="d-sec"><div class="scoreline"><span class="score-big num">' + fmtCompact(p.people_reached) + '</span><span class="score-meta">people newly reached within 3 km</span></div>' +
    '<div class="score-meta">Cumulative with sites 1 to ' + p.rank + ': ' + fmtCompact(p.cumulative_people) + ' people (' + fmtPct(p.cumulative_share, 2) + ' of the population)</div></div>' +
    '<div class="d-sec"><h4>Location</h4>' + dl([['LGA', esc(p.lga)], ['State', esc(p.statename)], ['Zone', esc(p.zone)], ['Latitude, longitude', p.lat.toFixed(4) + ', ' + p.lon.toFixed(4)], ['Radio', esc(p.radio)]]) + '</div>' +
    '<div class="d-sec"><h4>How it was chosen</h4><p class="note">This is an existing OpenCelliD tower that is not yet LTE, inside a priority-set LGA. Sites are picked greedily: each step adds the tower that covers the most people not already covered. Terrain, power and backhaul are not modelled.</p></div>' +
    '<div class="d-sec"><div style="display:flex;gap:8px;flex-wrap:wrap">' + (lga ? '<button class="btn small" data-act="lga:' + lga.id + '">Open ' + esc(lga.p.lganame) + '</button>' : '') + '<button class="btn small" data-act="fit">Zoom to site</button></div></div></div>';
}
function showFacilityDetail(f) {
  const p = f.p;
  const el = $('#detail');
  U.sel = null;
  $('#view-map').classList.add('has-detail');
  el.innerHTML = detailHead((p.kind === 'school' ? 'School' : 'Health facility') + ' &middot; ' + esc(p.lga), p.name || 'Unnamed') +
    '<div class="detail-body"><div class="d-sec">' + dl([['Type', esc(p.level || 'Unknown')], ['Owner', esc(p.owner || 'Unknown')], ['Connectivity', esc(p.status)], ['Students', isNum(p.students) ? fmtInt(p.students) : 'Not recorded']]) +
    '<p class="note">Status comes from the Ookla tile the facility sits in: unmeasured or below 10 Mbps.</p></div>' +
    '<div class="d-sec"><button class="btn small" data-act="lga:' + p.lga_id + '" style="justify-self:start">Open LGA</button></div></div>';
  setTimeout(syncSize, 0);
  requestDraw();
}

/* ----- search ----- */
function buildSearch() {
  D.search = [];
  D.zones.forEach(r => D.search.push({ rec: r, name: r.p.zone, sub: 'Zone', key: r.p.zone.toLowerCase(), o: 0 }));
  D.states.forEach(r => D.search.push({ rec: r, name: r.p.statename, sub: 'State, ' + r.p.zone, key: r.p.statename.toLowerCase(), o: 1 }));
  D.lgas.forEach(r => D.search.push({ rec: r, name: r.p.lganame, sub: r.p.statename, key: (r.p.lganame + ' ' + r.p.statename).toLowerCase(), o: 2 }));
}
function runSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const hits = D.search.filter(s => s.key.includes(q));
  hits.sort((a, b) => (b.key.startsWith(q) - a.key.startsWith(q)) || (a.o - b.o) || a.name.localeCompare(b.name));
  return hits.slice(0, 8);
}

/* =====================================================================
   CHARTS (SVG strings) AND OVERVIEW
   ===================================================================== */
const charts = {}, chartW = {};
function mountChart(id, fn) { charts[id] = fn; renderChart(id, true); chartRO.observe($('#' + id)); }
function renderChart(id, force) {
  const el = $('#' + id);
  if (!el) return;
  const w = Math.floor(el.clientWidth);
  if (!w) return;
  if (!force && chartW[id] === w) return;
  chartW[id] = w;
  el.innerHTML = charts[id](w);
}
const chartRO = new ResizeObserver(es => es.forEach(e => { if (charts[e.target.id]) renderChart(e.target.id, false); }));
const rerenderCharts = () => Object.keys(charts).forEach(id => renderChart(id, true));

const tipAttr = html => ' data-tip="' + esc(html) + '"';
const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
function niceMax(v) {
  const e = Math.pow(10, Math.floor(Math.log10(v || 1))), f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

/* horizontal bars: items = [{label, value, text, color, act, tip, dim}] */
function barsH(items, w, opts = {}) {
  const lw = opts.labelW || 112, vw = opts.valueW || 58, rh = opts.rowH || 28, bh = opts.barH || 14;
  const max = opts.max || Math.max(...items.map(i => i.value), 1e-9), pw = Math.max(40, w - lw - vw - 8);
  const h = items.length * rh + 4;
  let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" height="' + h + '" role="img" aria-label="' + esc(opts.aria || 'Bar chart') + '">';
  items.forEach((it, i) => {
    const y = i * rh + 2, bw = Math.max(1, pw * it.value / max);
    s += '<g class="' + (it.act ? 'hit' : '') + (it.dim ? ' dim' : '') + '"' + (it.act ? ' data-act="' + esc(it.act) + '"' : '') + (it.tip ? tipAttr(it.tip) : '') + '>' +
      '<rect x="0" y="' + y + '" width="' + w + '" height="' + rh + '" fill="transparent"/>' +
      '<text x="' + (lw - 8) + '" y="' + (y + rh / 2 + 4) + '" text-anchor="end">' + esc(trunc(it.label, Math.floor(lw / 6.4))) + '</text>' +
      '<rect x="' + lw + '" y="' + (y + (rh - bh) / 2) + '" width="' + bw + '" height="' + bh + '" rx="3" style="fill:' + (it.color || 'var(--bar)') + '"/>' +
      '<text class="strong num" x="' + (lw + bw + 6) + '" y="' + (y + rh / 2 + 4) + '">' + esc(it.text) + '</text></g>';
  });
  return s + '</svg>';
}

/* stacked horizontal bars on a fixed axis: rows = [{label, segs:[{v,color,tip}], total, act, tip}] */
function stackedH(rows, w, opts = {}) {
  const lw = opts.labelW || 100, vw = opts.valueW || 44, rh = opts.rowH || 26, bh = opts.barH || 14, axis = opts.axisMax || 100;
  const pw = Math.max(40, w - lw - vw - 6), h = rows.length * rh + 22;
  let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" height="' + h + '" role="img" aria-label="' + esc(opts.aria || 'Stacked bar chart') + '">';
  for (let t = 0; t <= 4; t++) {
    const x = lw + pw * t / 4;
    s += '<line class="grid-line" x1="' + x + '" x2="' + x + '" y1="0" y2="' + (rows.length * rh) + '"/><text x="' + x + '" y="' + (rows.length * rh + 14) + '" text-anchor="middle">' + Math.round(axis * t / 4) + '</text>';
  }
  rows.forEach((r, i) => {
    const y = i * rh;
    s += '<g class="' + (r.act ? 'hit' : '') + '"' + (r.act ? ' data-act="' + esc(r.act) + '"' : '') + '><rect x="0" y="' + y + '" width="' + w + '" height="' + rh + '" fill="transparent"/>' +
      '<text x="' + (lw - 8) + '" y="' + (y + rh / 2 + 4) + '" text-anchor="end">' + esc(trunc(r.label, Math.floor(lw / 6.2))) + '</text>';
    let x = lw;
    r.segs.forEach(sg => {
      const sw = pw * sg.v / axis;
      s += '<rect x="' + x + '" y="' + (y + (rh - bh) / 2) + '" width="' + Math.max(0, sw) + '" height="' + bh + '" style="fill:' + sg.color + '"' + tipAttr(sg.tip) + '/>';
      x += sw;
    });
    s += '<text class="strong num" x="' + (x + 6) + '" y="' + (y + rh / 2 + 4) + '">' + esc(r.total) + '</text></g>';
  });
  return s + '</svg>';
}

/* ---------- overview data ---------- */
const OV = { L: [] };
const zoneMetrics = ['priority', 'underserved_pop', 'underserved_share', 'population', 'mean_dist_tower_km', 'institution_share'];
let zoneMetric = 'priority';

function ovLGAs() { return D.lgas.filter(r => !U.ovZone || r.p.zone === U.ovZone); }
const wmean = (arr, key, wkey) => { let a = 0, b = 0; arr.forEach(r => { const v = r.p[key], w = r.p[wkey]; if (isNum(v) && isNum(w)) { a += v * w; b += w; } }); return b ? a / b : null; };

function renderKPIs() {
  const L = OV.L, p = r => r.p;
  const pop = sum(L, r => p(r).population), und = sum(L, r => p(r).underserved_pop);
  const hs = sum(L, r => p(r).health), hu = sum(L, r => p(r).health_underserved);
  const ss = sum(L, r => p(r).schools), su = sum(L, r => p(r).schools_underserved);
  const nset = L.filter(r => p(r).in_priority_set).length;
  const dist = wmean(L, 'mean_dist_tower_km', 'population');
  const k = [
    ['Population', fmtCompact(pop), 'in ' + L.length + ' LGAs'],
    ['Underserved people', fmtCompact(und), fmtPct(pop ? und / pop : 0, 0) + ' of population'],
    ['Priority LGAs', String(nset), 'top 20% by score, of ' + L.length],
    ['Health facilities', fmtCompact(hu), fmtPct(hs ? hu / hs : 0, 0) + ' of ' + fmtCompact(hs) + ' lack measured service'],
    ['Schools', fmtCompact(su), fmtPct(ss ? su / ss : 0, 0) + ' of ' + fmtCompact(ss) + ' lack measured service'],
    ['Distance to nearest tower', dist == null ? 'No data' : (dist >= 10 ? Math.round(dist) : dist.toFixed(1)) + '<small>km</small>', 'population-weighted average']
  ];
  $('#kpis').innerHTML = k.map(x => '<div class="kpi"><div class="kpi-label">' + esc(x[0]) + '</div><div class="kpi-value num">' + x[1] + '</div><div class="kpi-note">' + esc(x[2]) + '</div></div>').join('');
}

function renderNotice() {
  const all = D.lgas, b = sum(all, r => r.p.buildings), um = sum(all, r => r.p.buildings * (r.p.unmeasured_share || 0)) / b;
  const slow = D.summary.parameters.slow_speed_mbps;
  $('#ovNoticeText').innerHTML = '<b>How to read &ldquo;underserved&rdquo;.</b> ' + fmtPct(um, 0) + ' of settlement buildings sit outside any Ookla speed-test tile. We count them as <i>unmeasured</i>, never fill them with estimated speeds, and call a building underserved when it is unmeasured or below ' + slow + ' Mbps. Unmeasured signals weak or absent use, not proof of no signal.';
}

function renderInsights() {
  const L = OV.L, items = [], N = D.summary.national;
  const zoneSel = U.ovZone;
  if (!zoneSel) {
    const z = D.zones.slice().sort((a, b) => a.p.priority_rank - b.p.priority_rank)[0].p;
    items.push('<b>' + esc(z.zone) + '</b> ranks first of six zones, with a priority score of ' + fmt1(z.priority) + ' and ' + fmtCompact(z.underserved_pop) + ' underserved people (' + fmtPct(z.underserved_pop / z.population, 0) + ' of its population).');
  } else {
    const st = D.statesInZone(zoneSel).sort((a, b) => a.p.priority_rank - b.p.priority_rank)[0].p;
    items.push('In <b>' + esc(zoneSel) + '</b>, <b>' + esc(st.statename) + '</b> ranks highest, with a score of ' + fmt1(st.priority) + ' (rank ' + st.priority_rank + ' of 37 states).');
  }
  const und = sum(L, r => r.p.underserved_pop), setU = sum(L.filter(r => r.p.in_priority_set), r => r.p.underserved_pop), nset = L.filter(r => r.p.in_priority_set).length;
  if (nset) items.push('The <b>' + nset + ' priority LGAs</b> hold ' + fmtPct(setU / und, 0) + ' of the underserved people in view, from ' + fmtPct(nset / L.length, 0) + ' of the LGAs.');
  const byState = {};
  L.forEach(r => { const k = r.p.statename; (byState[k] = byState[k] || { n: 0, set: 0 }); byState[k].n++; if (r.p.in_priority_set) byState[k].set++; });
  const top = Object.entries(byState).sort((a, b) => b[1].set - a[1].set)[0];
  if (top && top[1].set) items.push('<b>' + esc(top[0]) + '</b> has the most priority LGAs: ' + top[1].set + ' of its ' + top[1].n + '.');
  items.push('Poorer LGAs are less connected. The rank correlation between wealth and the underserved share is <b>' + fmt2(N.wealth_service_spearman) + '</b>.');
  const st = D.summary.settlement_types, h = st.find(s => s.ext === 'Hamlet'), b = st.find(s => s.ext === 'Built-up Area');
  if (h && b) items.push('Only ' + fmtPct(h.served_share, 2) + ' of hamlet buildings sit on a tile that meets ' + D.summary.parameters.slow_speed_mbps + ' Mbps, against ' + fmtPct(b.served_share, 1) + ' in built-up areas.');
  items.push('The 100 shortlisted tower upgrades would reach <b>' + fmtPct(N.share_reached_by_shortlist, 1) + '</b> of people. About ' + fmtPct(N.share_needing_new_sites, 0) + ' of people are beyond the reach of existing towers, so most of the gap needs new sites.');
  const rb = D.summary.robustness.slice().sort((a, c) => a['Overlap in top 50'] - c['Overlap in top 50'])[0];
  items.push('The ranking is most sensitive to <b>' + esc(rb.Version.toLowerCase()) + '</b>: only ' + rb['Overlap in top 50'] + ' of the top 50 LGAs stay in the top 50. Other variants keep at least 34.');
  const hh = {};
  D.lgas.filter(r => r.p.cluster === CLUSTERS[0].key).forEach(r => hh[r.p.zone] = (hh[r.p.zone] || 0) + 1);
  const hz = Object.entries(hh).sort((a, c) => c[1] - a[1])[0];
  if (hz) items.push('Priority is spatially clustered (Moran’s I ' + N.morans_i.toFixed(2) + '). ' + hz[1] + ' of the ' + sum(Object.values(hh)) + ' High-High LGAs are in <b>' + esc(hz[0]) + '</b>.');
  $('#insights').innerHTML = items.map((t, i) => '<li><span class="n">' + (i + 1) + '</span><span>' + t + '</span></li>').join('');
}

/* ---------- chart definitions ---------- */
function initCharts() {
  mountChart('chZones', w => {
    const m = METRICS[zoneMetric];
    const rows = D.zones.slice().sort((a, b) => b.p[zoneMetric] - a.p[zoneMetric]);
    const max = Math.max(...rows.map(r => r.p[zoneMetric]));
    return barsH(rows.map(r => ({
      label: r.p.zone, value: r.p[zoneMetric], text: m.fmt(r.p[zoneMetric]), act: 'ovzone:' + r.p.zone, dim: !!U.ovZone && U.ovZone !== r.p.zone,
      color: zoneMetric === 'priority' ? CLASS_COLORS[Math.min(4, Math.floor(r.p[zoneMetric] / 20))] : null,
      tip: '<b>' + esc(r.p.zone) + '</b>' + tipRow(m.label, m.fmt(r.p[zoneMetric])) + tipRow('Priority rank', r.p.priority_rank + ' of 6') + tipRow('Underserved people', fmtCompact(r.p.underserved_pop)) + tipRow('Population', fmtCompact(r.p.population))
    })), w, { labelW: 98, rowH: 36, barH: 18, max, aria: 'Zones by ' + m.label });
  });

  mountChart('chStates', w => {
    const n = +$('#stateCount').value;
    const rows = D.states.filter(r => !U.ovZone || r.p.zone === U.ovZone).sort((a, b) => b.p.priority - a.p.priority).slice(0, n);
    const ws = sum(Object.values(D.W));
    return stackedH(rows.map(r => ({
      label: r.p.statename, total: fmt1(r.p.priority), act: 'state:' + r.id,
      segs: COMPONENTS.map(c => {
        const v = D.W[c.key] * r.p[c.key] * 100 / ws;
        return { v, color: c.color, tip: '<b>' + esc(r.p.statename) + '</b>' + tipRow(c.label, ordinal(Math.round(r.p[c.key] * 100)) + ' percentile') + tipRow('Adds', v.toFixed(1) + ' points') + tipRow('Total score', fmt1(r.p.priority)) };
      })
    })), w, { labelW: 98, rowH: n > 20 ? 20 : 26, barH: n > 20 ? 11 : 14, axisMax: 100, aria: 'State priority scores split by component' });
  });
  $('#lgStates').innerHTML = COMPONENTS.map(c => '<span><i style="background:' + c.color + '"></i>' + esc(c.label) + ' (' + Math.round(D.W[c.key] * 100) + '%)</span>').join('');

  mountChart('chSettle', w => {
    const names = { 'Hamlet': 'Hamlet', 'Small Settlement Area': 'Small settlement', 'Built-up Area': 'Built-up area' };
    const rows = D.summary.settlement_types;
    const rh = 62, h = rows.length * rh;
    let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" height="' + h + '" role="img" aria-label="Connection status by settlement type">';
    rows.forEach((r, i) => {
      const y = i * rh, un = r.unmeasured_share, fast = r.served_share, slow = r.slow_share;
      s += '<text class="strong" x="0" y="' + (y + 12) + '">' + esc(names[r.ext] || r.ext) + '</text><text x="' + w + '" y="' + (y + 12) + '" text-anchor="end">' + fmtCompact(r.buildings) + ' buildings</text>';
      let x = 0;
      [[fast, '#3a7d5c', 'Meets 10 Mbps'], [slow, '#e0a030', 'Measured, slow'], [un, '#b9c0c8', 'Unmeasured']].forEach(([v, c, nm]) => {
        s += '<rect x="' + x + '" y="' + (y + 20) + '" width="' + Math.max(0, w * v) + '" height="16" style="fill:' + c + '"' + tipAttr('<b>' + esc(names[r.ext] || r.ext) + '</b>' + tipRow(nm, fmtPct(v, 2))) + '/>';
        x += w * v;
      });
      s += '<text x="0" y="' + (y + 52) + '">' + fmtPct(un, 1) + ' unmeasured, ' + fmtPct(fast, 1) + ' meet 10 Mbps. Tower ' + fmtKm(r.mean_dist_tower_km) + ' away</text>';
    });
    return s + '</svg>';
  });
  $('#lgSettle').innerHTML = [['#3a7d5c', 'Meets 10 Mbps'], ['#e0a030', 'Measured, slow'], ['#b9c0c8', 'Unmeasured']].map(x => '<span><i style="background:' + x[0] + '"></i>' + x[1] + '</span>').join('');

  mountChart('chDist', w => {
    const bins = [[0, 1], [1, 2], [2, 5], [5, 10], [10, 20], [20, 50], [50, 1e9]];
    const vals = bins.map(b => ({ b, pop: sum(OV.L.filter(r => r.p.mean_dist_tower_km >= b[0] && r.p.mean_dist_tower_km < b[1]), r => r.p.population), n: OV.L.filter(r => r.p.mean_dist_tower_km >= b[0] && r.p.mean_dist_tower_km < b[1]).length }));
    const h = 190, pb = 28, pt = 16, bw = (w - 8) / bins.length, max = Math.max(...vals.map(v => v.pop), 1);
    let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" height="' + h + '" role="img" aria-label="Population by average distance to the nearest tower">';
    vals.forEach((v, i) => {
      const bh = (h - pb - pt) * v.pop / max, x = 4 + i * bw, lab = v.b[1] > 1e8 ? '50+' : v.b[0] + '–' + v.b[1];
      s += '<g' + tipAttr('<b>' + lab + ' km</b>' + tipRow('LGAs', String(v.n)) + tipRow('People', fmtCompact(v.pop))) + '><rect x="' + x + '" y="0" width="' + bw + '" height="' + h + '" fill="transparent"/>' +
        '<rect x="' + (x + 4) + '" y="' + (h - pb - bh) + '" width="' + (bw - 8) + '" height="' + Math.max(1, bh) + '" rx="3" style="fill:' + rampAt('risk', 0.15 + 0.85 * i / (bins.length - 1)) + '"/>' +
        '<text class="strong num" x="' + (x + bw / 2) + '" y="' + (h - pb - bh - 5) + '" text-anchor="middle">' + fmtCompact(v.pop) + '</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (h - 10) + '" text-anchor="middle">' + lab + '</text></g>';
    });
    return s + '<text x="' + (w / 2) + '" y="' + (h + 4) + '" text-anchor="middle" style="font-size:10.5px">km to nearest tower (LGA average)</text></svg>';
  });

  mountChart('chScatter', w => {
    const L = OV.L, h = Math.round(clamp(w * 0.62, 260, 400)), m = { l: 44, r: 10, t: 8, b: 40 };
    const xs = L.map(r => r.p.mean_rwi), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const ly0 = Math.log10(0.1), ly1 = Math.log10(300);
    const X = v => m.l + (v - x0) / (x1 - x0) * (w - m.l - m.r), Y = v => m.t + (1 - (Math.log10(Math.max(v, 0.1)) - ly0) / (ly1 - ly0)) * (h - m.t - m.b);
    let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" height="' + h + '" role="img" aria-label="Scatter of wealth against distance to towers">';
    [0.1, 1, 10, 100].forEach(t => { s += '<line class="grid-line" x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text x="' + (m.l - 6) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + t + '</text>'; });
    const ticks = []; for (let t = Math.ceil(x0 * 2) / 2; t <= x1; t += 0.5) ticks.push(t);
    ticks.forEach(t => { s += '<text x="' + X(t) + '" y="' + (h - m.b + 16) + '" text-anchor="middle">' + fmt2(t) + '</text>'; });
    if (x0 < 0 && x1 > 0) s += '<line x1="' + X(0) + '" x2="' + X(0) + '" y1="' + m.t + '" y2="' + (h - m.b) + '" style="stroke:var(--line-strong)"/>';
    const rmax = Math.max(...L.map(r => r.p.population));
    L.slice().sort((a, b) => b.p.population - a.p.population).forEach(r => {
      const p = r.p, rad = 2.2 + 7 * Math.sqrt(p.population / rmax);
      s += '<circle class="hit" cx="' + X(p.mean_rwi).toFixed(1) + '" cy="' + Y(p.mean_dist_tower_km).toFixed(1) + '" r="' + rad.toFixed(1) + '" data-act="lga:' + r.id + '" style="fill:' + CLASS_COLORS[Math.max(0, CLASS_NAMES.indexOf(p.priority_class))] + ';fill-opacity:.78;stroke:var(--surface);stroke-width:.8"' +
        tipAttr('<b>' + esc(p.label) + '</b>' + tipRow('Priority', fmt1(p.priority)) + tipRow('Wealth index', fmt2(p.mean_rwi)) + tipRow('Tower distance', fmtKm(p.mean_dist_tower_km)) + tipRow('Population', fmtCompact(p.population))) + '/>';
    });
    s += '<text x="' + ((m.l + w - m.r) / 2) + '" y="' + (h - 6) + '" text-anchor="middle">Relative Wealth Index (lower is poorer)</text>';
    s += '<text transform="translate(11 ' + ((m.t + h - m.b) / 2) + ') rotate(-90)" text-anchor="middle">Distance to nearest tower, km (log)</text>';
    return s + '</svg>';
  });
  $('#lgScatter').innerHTML = CLASS_NAMES.map((c, i) => '<span><i style="background:' + CLASS_COLORS[i] + '"></i>' + c + '</span>').join('');

  mountChart('chInst', w => {
    const ents = U.ovZone ? D.statesInZone(U.ovZone).sort((a, b) => b.p.priority - a.p.priority) : D.zones.slice().sort((a, b) => b.p.priority - a.p.priority);
    const lw = 98, pw = w - lw - 50, grp = 40, h = ents.length * grp + 22;
    let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" height="' + h + '" role="img" aria-label="Share of institutions without measured service">';
    for (let t = 0; t <= 4; t++) { const x = lw + pw * t / 4; s += '<line class="grid-line" x1="' + x + '" x2="' + x + '" y1="0" y2="' + (ents.length * grp) + '"/><text x="' + x + '" y="' + (ents.length * grp + 14) + '" text-anchor="middle">' + (t * 25) + '%</text>'; }
    ents.forEach((r, i) => {
      const y = i * grp, nm = r.level === 'state' ? r.p.statename : r.p.zone;
      s += '<text x="' + (lw - 8) + '" y="' + (y + grp / 2 + 4) + '" text-anchor="end">' + esc(trunc(nm, 15)) + '</text>';
      [['health', '#d6336c', 'Health facilities'], ['schools', '#1971c2', 'Schools']].forEach(([k, col, lab], j) => {
        const tot = r.p[k], un = r.p[k + '_underserved'], v = tot ? un / tot : 0, by = y + 6 + j * 14;
        s += '<g' + tipAttr('<b>' + esc(nm) + '</b>' + tipRow(lab, fmtInt(un) + ' of ' + fmtInt(tot)) + tipRow('Share', fmtPct(v, 1))) + '><rect x="' + lw + '" y="' + by + '" width="' + pw + '" height="11" rx="3" style="fill:var(--surface-3)"/>' +
          '<rect x="' + lw + '" y="' + by + '" width="' + (pw * v) + '" height="11" rx="3" style="fill:' + col + '"/><text class="num" x="' + (lw + pw + 6) + '" y="' + (by + 9) + '" style="font-size:10.5px">' + fmtPct(v, 0) + '</text></g>';
      });
    });
    return s + '</svg>';
  });
  $('#lgInst').innerHTML = '<span><i style="background:#d6336c"></i>Health facilities</span><span><i style="background:#1971c2"></i>Schools</span>';

  mountChart('chCurve', w => {
    const pts = [{ k: 0, y: 0, p: 0 }].concat(D.summary.siting_curve.map(r => ({ k: r.rank, y: r.cumulative_share * 100, p: r.cumulative_people })));
    const h = 220, m = { l: 40, r: 14, t: 14, b: 34 }, kmax = pts[pts.length - 1].k, ymax = niceMax(pts[pts.length - 1].y * 1.15);
    const X = k => m.l + k / kmax * (w - m.l - m.r), Y = v => m.t + (1 - v / ymax) * (h - m.t - m.b);
    let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" height="' + h + '" role="img" aria-label="Cumulative share of people reached by the first N upgraded towers">';
    for (let t = 0; t <= 4; t++) { const v = ymax * t / 4; s += '<line class="grid-line" x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (m.l - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + (+v.toFixed(1)) + '%</text>'; }
    [0, 25, 50, 75, 100].forEach(k => { if (k <= kmax) s += '<text x="' + X(k) + '" y="' + (h - 16) + '" text-anchor="middle">' + k + '</text>'; });
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p.k).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
    s += '<path d="' + d + ' L' + X(kmax) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + ' Z" style="fill:var(--accent);fill-opacity:.12"/><path d="' + d + '" fill="none" style="stroke:var(--accent)" stroke-width="2"/>';
    const last = pts[pts.length - 1];
    s += '<circle cx="' + X(last.k) + '" cy="' + Y(last.y) + '" r="4" style="fill:var(--accent)"/><text class="strong num" x="' + (X(last.k) - 8) + '" y="' + (Y(last.y) - 9) + '" text-anchor="end">' + last.y.toFixed(1) + '% at ' + last.k + ' sites</text>';
    s += '<text x="' + ((m.l + w - m.r) / 2) + '" y="' + (h - 2) + '" text-anchor="middle">Towers upgraded, in shortlist order</text>';
    s += '<line id="curveMark" x1="0" x2="0" y1="' + m.t + '" y2="' + (h - m.b) + '" style="stroke:var(--text-3)" opacity="0"/><rect data-hover="curve" data-m="' + m.l + ',' + m.r + ',' + kmax + '" x="' + m.l + '" y="' + m.t + '" width="' + (w - m.l - m.r) + '" height="' + (h - m.t - m.b) + '" fill="transparent"/>';
    return s + '</svg>';
  });
  const N = D.summary.national;
  $('#curveFoot').textContent = 'The shortlist reaches ' + fmtPct(N.share_reached_by_shortlist, 1) + ' of people. ' + fmtPct(N.share_needing_new_sites, 1) + ' are beyond the reach of any existing tower and would need new sites.';

  mountChart('chRobust', w => {
    const rows = D.summary.robustness, lw = 210, pw = Math.max(40, w - lw - 112), rh = 28, h = rows.length * rh + 4;
    const minV = Math.min(...rows.map(r => r['Overlap in top 50']));
    let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" height="' + h + '" role="img" aria-label="Robustness scenarios">';
    rows.forEach((r, i) => {
      const y = i * rh + 2, v = r['Overlap in top 50'], hot = v === minV;
      s += '<g' + tipAttr('<b>' + esc(r.Version) + '</b>' + tipRow('Top-50 overlap', v + ' of 50') + tipRow('Rank correlation', r['Spearman vs baseline'].toFixed(3))) + '><rect x="0" y="' + y + '" width="' + w + '" height="' + rh + '" fill="transparent"/>' +
        '<text x="' + (lw - 8) + '" y="' + (y + rh / 2 + 4) + '" text-anchor="end">' + esc(trunc(r.Version, 34)) + '</text>' +
        '<rect x="' + lw + '" y="' + (y + 7) + '" width="' + pw + '" height="14" rx="3" style="fill:var(--surface-3)"/>' +
        '<rect x="' + lw + '" y="' + (y + 7) + '" width="' + (pw * v / 50) + '" height="14" rx="3" style="fill:' + (hot ? '#d9822b' : 'var(--bar)') + '"/>' +
        '<text class="strong num" x="' + (lw + pw + 8) + '" y="' + (y + rh / 2 + 4) + '">' + v + ' of 50</text>' +
        '<text class="num" x="' + w + '" y="' + (y + rh / 2 + 4) + '" text-anchor="end">ρ ' + r['Spearman vs baseline'].toFixed(3) + '</text></g>';
    });
    return s + '</svg>';
  });

  mountChart('chCluster', w => {
    const zones = D.zoneNames, rows = CLUSTERS.map(c => {
      const list = OV.L.filter(r => r.p.cluster === c.key);
      return { c, list, people: sum(list, r => r.p.population), und: sum(list, r => r.p.underserved_pop), n: list.length };
    });
    const max = Math.max(...rows.map(r => r.n), 1), lw = 120, rw = 190, pw = Math.max(60, w - lw - rw - 50), rh = 34, h = rows.length * rh + 4;
    let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" height="' + h + '" role="img" aria-label="LGAs by spatial cluster and zone">';
    rows.forEach((r, i) => {
      const y = i * rh + 2;
      s += '<text x="' + (lw - 8) + '" y="' + (y + rh / 2 + 4) + '" text-anchor="end"' + tipAttr('<b>' + esc(r.c.short) + '</b>' + esc(r.c.text)) + '>' + esc(r.c.short) + '</text>';
      let x = lw;
      zones.forEach(z => {
        const k = r.list.filter(q => q.p.zone === z).length, sw = pw * k / max;
        if (k) s += '<rect x="' + x + '" y="' + (y + 7) + '" width="' + sw + '" height="20" style="fill:' + ZONE_COLORS[z] + '"' + tipAttr('<b>' + esc(r.c.short) + ', ' + esc(z) + '</b>' + tipRow('LGAs', String(k))) + '/>';
        x += sw;
      });
      s += '<text class="strong num" x="' + (x + 8) + '" y="' + (y + rh / 2 + 4) + '">' + r.n + '</text><text class="num" x="' + w + '" y="' + (y + rh / 2 + 4) + '" text-anchor="end">' + fmtCompact(r.people) + ' people, ' + fmtCompact(r.und) + ' underserved</text>';
    });
    s += '</svg><div class="legend-row">' + zones.map(z => '<span><i style="background:' + ZONE_COLORS[z] + '"></i>' + esc(z) + '</span>').join('') + '</div>';
    return s;
  });
}

function renderTopLgas() {
  const rows = OV.L.slice().sort((a, b) => b.p.priority - a.p.priority).slice(0, 10), max = 100;
  $('#topLgas').innerHTML = rows.map((r, i) => '<li data-act="lga:' + r.id + '"><span class="r num">' + (i + 1) + '</span><span class="nm">' + esc(r.p.lganame) + '<small>' + esc(r.p.statename) + '</small></span>' +
    '<div class="bar"><span style="width:' + (r.p.priority / max * 100) + '%;background:' + CLASS_COLORS[Math.min(4, Math.floor(r.p.priority / 20))] + '"></span></div><span class="v num">' + fmt1(r.p.priority) + '</span></li>').join('');
}

function renderOverview() {
  OV.L = ovLGAs();
  renderKPIs(); renderInsights(); renderTopLgas();
  Object.keys(charts).forEach(id => renderChart(id, true));
}

/* =====================================================================
   RANKINGS
   ===================================================================== */
const getp = k => r => r.p[k];
const RK = {
  zone: [
    { k: 'priority_rank', h: 'Rank', get: getp('priority_rank'), fmt: v => v, num: true },
    { k: 'name', h: 'Zone', get: r => r.p.zone, fmt: v => esc(v) },
    { k: 'priority', h: 'Priority', get: getp('priority'), bar: true, num: true },
    { k: 'priority_class', h: 'Class', get: getp('priority_class'), cls: true },
    { k: 'n_lgas', h: 'LGAs', get: getp('n_lgas'), fmt: fmtInt, num: true },
    { k: 'population', h: 'Population', get: getp('population'), fmt: fmtInt, num: true },
    { k: 'underserved_pop', h: 'Underserved people', get: getp('underserved_pop'), fmt: fmtInt, num: true },
    { k: 'mean_dist_tower_km', h: 'Tower distance', get: getp('mean_dist_tower_km'), fmt: fmtKm, num: true },
    { k: 'mean_rwi', h: 'Wealth index', get: getp('mean_rwi'), fmt: fmt2, num: true }
  ],
  state: [
    { k: 'priority_rank', h: 'Rank', get: getp('priority_rank'), fmt: v => v, num: true },
    { k: 'name', h: 'State', get: r => r.p.statename, fmt: v => esc(v) },
    { k: 'zone', h: 'Zone', get: getp('zone'), fmt: v => esc(v) },
    { k: 'priority', h: 'Priority', get: getp('priority'), bar: true, num: true },
    { k: 'priority_class', h: 'Class', get: getp('priority_class'), cls: true },
    { k: 'set_n', h: 'Priority LGAs', get: r => r.setN, fmt: v => v + '', num: true },
    { k: 'population', h: 'Population', get: getp('population'), fmt: fmtInt, num: true },
    { k: 'underserved_pop', h: 'Underserved people', get: getp('underserved_pop'), fmt: fmtInt, num: true },
    { k: 'mean_dist_tower_km', h: 'Tower distance', get: getp('mean_dist_tower_km'), fmt: fmtKm, num: true },
    { k: 'mean_rwi', h: 'Wealth index', get: getp('mean_rwi'), fmt: fmt2, num: true }
  ],
  lga: [
    { k: 'priority_rank', h: 'Rank', get: getp('priority_rank'), fmt: v => v, num: true },
    { k: 'name', h: 'LGA', get: r => r.p.lganame, fmt: v => esc(v) },
    { k: 'statename', h: 'State', get: getp('statename'), fmt: v => esc(v) },
    { k: 'zone', h: 'Zone', get: getp('zone'), fmt: v => esc(v) },
    { k: 'priority', h: 'Priority', get: getp('priority'), bar: true, num: true },
    { k: 'priority_class', h: 'Class', get: getp('priority_class'), cls: true },
    { k: 'population', h: 'Population', get: getp('population'), fmt: fmtInt, num: true },
    { k: 'underserved_pop', h: 'Underserved people', get: getp('underserved_pop'), fmt: fmtInt, num: true },
    { k: 'mean_dist_tower_km', h: 'Tower distance', get: getp('mean_dist_tower_km'), fmt: fmtKm, num: true },
    { k: 'mean_rwi', h: 'Wealth index', get: getp('mean_rwi'), fmt: fmt2, num: true },
    { k: 'cluster', h: 'Cluster', get: r => (CLUSTERS.find(c => c.key === r.p.cluster) || CLUSTERS[4]).short, fmt: v => esc(v) },
    { k: 'top_decile_freq', h: 'Robustness', get: getp('top_decile_freq'), fmt: v => fmtPct(v, 0), num: true }
  ],
  site: [
    { k: 'rank', h: 'Order', get: getp('rank'), fmt: v => v, num: true },
    { k: 'lga', h: 'LGA', get: getp('lga'), fmt: v => esc(v) },
    { k: 'statename', h: 'State', get: getp('statename'), fmt: v => esc(v) },
    { k: 'zone', h: 'Zone', get: getp('zone'), fmt: v => esc(v) },
    { k: 'radio', h: 'Radio', get: getp('radio'), fmt: v => esc(v) },
    { k: 'people_reached', h: 'People newly reached', get: getp('people_reached'), fmt: fmtInt, num: true },
    { k: 'cumulative_people', h: 'Cumulative people', get: getp('cumulative_people'), fmt: fmtInt, num: true },
    { k: 'cumulative_share', h: 'Cumulative share', get: getp('cumulative_share'), fmt: v => fmtPct(v, 2), num: true }
  ]
};
const PAGE = 25;

function rkRows() {
  const st = U.rk, lv = st.level;
  let rows = lv === 'site' ? D.sites : D.byLevel[lv];
  const q = st.q.trim().toLowerCase();
  rows = rows.filter(r => {
    const p = r.p;
    if (q && !((p.lganame || p.statename || p.zone || p.lga || '') + ' ' + (p.statename || '')).toLowerCase().includes(q)) return false;
    if (st.zone && p.zone !== st.zone) return false;
    if (st.cls && lv !== 'site' && p.priority_class !== st.cls) return false;
    if (st.cluster && lv === 'lga' && p.cluster !== st.cluster) return false;
    return true;
  });
  const col = RK[lv].find(c => c.k === st.sort.key) || RK[lv][0], dir = st.sort.dir;
  rows = rows.slice().sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
  });
  return rows;
}

function renderRankings() {
  const st = U.rk, lv = st.level, cols = RK[lv], rows = rkRows();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  st.page = clamp(st.page, 0, pages - 1);
  const slice = rows.slice(st.page * PAGE, (st.page + 1) * PAGE);
  let html = '<thead><tr>' + cols.map(c => '<th class="' + (c.num ? 'r' : '') + '" data-sort="' + c.k + '" aria-sort="' + (st.sort.key === c.k ? (st.sort.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' + esc(c.h) + '<span class="arrow">' + (st.sort.key === c.k ? (st.sort.dir > 0 ? '▲' : '▼') : '') + '</span></th>').join('') + '</tr></thead><tbody>';
  slice.forEach(r => {
    html += '<tr data-act="' + (lv === 'site' ? 'site:' + r.id : lv + ':' + r.id) + '">' + cols.map(c => {
      const v = c.get(r);
      if (c.bar) return '<td class="r"><div class="cellbar"><span class="num">' + fmt1(v) + '</span><div class="bar"><span style="width:' + v + '%;background:' + CLASS_COLORS[Math.min(4, Math.floor(v / 20))] + '"></span></div></div></td>';
      if (c.cls) return '<td>' + classPill(v) + '</td>';
      return '<td class="' + (c.num ? 'r num' : '') + '">' + (c.fmt ? c.fmt(v) : esc(v)) + '</td>';
    }).join('') + '</tr>';
  });
  if (!slice.length) html += '<tr><td colspan="' + cols.length + '" class="muted" style="padding:24px;text-align:center">No rows match the filters.</td></tr>';
  $('#rkTable').innerHTML = html + '</tbody>';
  $('#rkInfo').textContent = rows.length ? 'Showing ' + (st.page * PAGE + 1) + ' to ' + (st.page * PAGE + slice.length) + ' of ' + rows.length : 'No rows';
  $('#rkPage').textContent = 'Page ' + (st.page + 1) + ' of ' + pages;
  $('#rkPrev').disabled = st.page === 0; $('#rkNext').disabled = st.page >= pages - 1;
  $('#rkClass').disabled = lv === 'site'; $('#rkCluster').disabled = lv !== 'lga';
  $$('#rkLevel button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rk === lv)));
}

function downloadCSV() {
  const lv = U.rk.level, rows = rkRows();
  if (!rows.length) return;
  const keys = Object.keys(rows[0].p);
  const cell = v => v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const csv = [keys.join(',')].concat(rows.map(r => keys.map(k => cell(r.p[k])).join(','))).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'nigeria_connectivity_' + lv + '_view.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* =====================================================================
   METHOD PAGE
   ===================================================================== */
function renderMethod() {
  const P = D.summary.parameters, N = D.summary.national, W = D.W, ws = sum(Object.values(W));
  const weights = COMPONENTS.map(c => '<div class="wrow"><span>' + esc(c.label) + '</span><div class="bar"><span style="width:' + (W[c.key] / ws * 100) + '%;background:' + c.color + '"></span></div><span class="num">' + Math.round(W[c.key] / ws * 100) + '%</span></div>').join('');
  const compRows = COMPONENTS.map(c => '<tr><td>' + esc(c.label) + '</td><td>' + esc(c.text) + '</td></tr>').join('');
  const robRows = D.summary.robustness.map(r => '<tr><td>' + esc(r.Version) + '</td><td class="r num">' + r['Spearman vs baseline'].toFixed(3) + '</td><td class="r num">' + r['Overlap in top 50'] + ' of 50</td></tr>').join('');
  const src = [
    ['Ookla speed tiles, Nigeria', 'Ookla Speedtest open data, provided with the challenge', 'Measured speed, latency and tests', '', 'CC BY-NC-SA 4.0'],
    ['LGA boundaries', 'GRID3 Nigeria', 'Unit of analysis, 774 LGAs', 'https://data.grid3.org/datasets/2bb616a49ee84f409427cc2143787113_0', 'See dataset page'],
    ['State boundaries', 'GRID3 Nigeria', 'State and zone roll-up', 'https://data.grid3.org/datasets/c41532b720504f4799fe20438b7e3b7f_0', 'See dataset page'],
    ['Settlement extents', 'GRID3 Nigeria', 'Where buildings are, settlement type', 'https://data.grid3.org/datasets/f705d65c012c46748e6e5f44a33728b1_0', 'See dataset page'],
    ['Population 2020, 100 m, constrained (R2024B)', 'WorldPop, University of Southampton', 'People per LGA', 'https://data.worldpop.org/GIS/Population/Global_2015_2030/R2024B/2020/NGA/v1/100m/constrained', 'CC BY 4.0'],
    ['Health facilities v2.0', 'GRID3 Nigeria', 'Anchor institutions', 'https://data.grid3.org/datasets/a0ed9627a8b240ff8b315a84575754a4_0', 'See dataset page'],
    ['Schools', 'GRID3 Nigeria', 'Anchor institutions', 'https://data.grid3.org/datasets/8aef208577664f859c44a18f61238a90_0', 'See dataset page'],
    ['Relative Wealth Index', 'Meta Data for Good, via HDX', 'Socioeconomic need', 'https://data.humdata.org/dataset/relative-wealth-index/resource/b112d3f9-7a9d-4798-b27d-a505219186aa', 'See dataset page'],
    ['Cell tower locations', 'OpenCelliD', 'Network infrastructure', 'https://www.opencellid.org/downloads.php', 'CC BY-SA 4.0']
  ].map(s => '<tr><td>' + (s[3] ? '<a href="' + s[3] + '" target="_blank" rel="noopener">' + esc(s[0]) + '</a>' : esc(s[0])) + '</td><td>' + esc(s[1]) + '</td><td>' + esc(s[2]) + '</td><td>' + esc(s[4]) + '</td></tr>').join('');
  const files = [
    ['lgas.geojson', 'LGA polygons with every indicator'], ['states.geojson', 'State polygons and indicators'], ['zones.geojson', 'Zone polygons and indicators'],
    ['tower_sites.geojson', 'Shortlisted tower upgrade sites'], ['facilities_priority.geojson', 'Schools and health facilities in priority LGAs'], ['summary.json', 'National figures, curves and robustness'],
    ['lgas.csv', 'LGA table'], ['states.csv', 'State table'], ['zones.csv', 'Zone table'], ['tower_sites.csv', 'Site table'], ['DATA_CONTRACT.md', 'Field list for each file']
  ].map(f => '<a class="dl" href="' + f[0] + '" download><b>' + f[0] + '</b><span>' + f[1] + '</span></a>').join('');

  $('#methodBody').innerHTML =
    '<h2 id="m-question">Question</h2><p>Which communities in Nigeria have poor internet connectivity relative to their population, settlements and socioeconomic needs, and where should improvements be prioritised first?</p>' +
    '<h2 id="m-approach">Approach</h2><p>Speed-test tiles exist only where someone ran a test, so a map of speeds alone shows who already has service. We start from where people live and ask what connectivity they have.</p><ol>' +
    '<li><b>Settlements and population.</b> GRID3 settlement blocks (building counts, settlement type) and WorldPop population show where people live.</li>' +
    '<li><b>Service.</b> Each settlement block is matched to the Ookla tile it falls in. A block with no tile is <i>unmeasured</i>. We never fill it with estimated speeds.</li>' +
    '<li><b>Infrastructure and need.</b> Cell tower locations, the Relative Wealth Index, schools and health facilities add distance to the network, need and anchor institutions.</li>' +
    '<li><b>Priority index.</b> Five components are combined into a 0 to 100 score for every LGA, and the same score is computed for states and zones.</li>' +
    '<li><b>Spatial clusters.</b> Local Moran’s I finds groups of high-priority LGAs (Moran’s I ' + N.morans_i.toFixed(2) + ').</li>' +
    '<li><b>Action.</b> A greedy maximum-coverage step shortlists ' + N.sites_shortlisted + ' existing towers (not yet LTE) in priority LGAs, each assumed to serve people within ' + P.tower_radius_km + ' km.</li></ol>' +
    '<h2 id="m-index">Priority index</h2><p>Each component is a percentile rank. The score is their weighted average, times 100. Weights are a judgement, so the next section tests them.</p><div class="weights">' + weights + '</div>' +
    '<table class="simple-table"><tbody>' + compRows + '</tbody></table>' +
    '<p>Classes Q1 to Q5 are equal-sized groups by rank. The <i>priority set</i> is the top ' + Math.round(P.priority_set_share * 100) + '% of LGAs by score (' + N.priority_lgas + ' LGAs). Underserved people are the LGA population shared in proportion to its underserved buildings.</p>' +
    '<h2 id="m-robust">Robustness</h2><p>We re-ran the ranking under eight alternative rules, and also under 1,000 random weightings (the LGA robustness figure shown on the map). Spearman is rank correlation with the baseline.</p>' +
    '<table class="simple-table"><thead><tr><th>Alternative</th><th class="r">Spearman</th><th class="r">Top-50 overlap</th></tr></thead><tbody>' + robRows + '</tbody></table>' +
    '<h2 id="m-read">How to read the maps</h2><ul>' +
    '<li><b>Quantile classes</b> put about a fifth of areas in each colour, so colours show relative position. <b>Equal intervals</b> split the value range evenly and show how large the gaps are.</li>' +
    '<li>The <b>underserved share</b> is close to 100% in most LGAs because most buildings are unmeasured. The service-gap component therefore separates areas weakly, and the other components carry more of the ranking.</li>' +
    '<li>Zones, states and LGAs switch automatically as you zoom when the level is set to Auto.</li>' +
    '<li>The bold outline marks the priority set. Cluster mode replaces the colours with the Local Moran’s I classes.</li>' +
    '<li>Facility points are those inside priority-set LGAs. Upgrade sites are sized by the people they would newly reach.</li></ul>' +
    '<h2 id="m-limits">Limitations</h2><ul>' +
    '<li>Ookla tiles exist only where tests were run. Unmeasured means weak or absent use, not proof of no signal.</li>' +
    '<li>Underserved people are an estimate, shared from LGA totals in proportion to buildings.</li>' +
    '<li>OpenCelliD is crowd-sourced and likely under-records 3G and 4G towers. Tower distance is proximity to infrastructure, not coverage.</li>' +
    '<li>The Relative Wealth Index is modelled and relative. Student counts exist for about 7% of schools.</li>' +
    '<li>Layers come from different years. The ' + P.tower_radius_km + ' km reach is an assumption, and siting ignores terrain, power and backhaul.</li>' +
    '<li>Even the full shortlist reaches ' + fmtPct(N.share_reached_by_shortlist, 1) + ' of people. It is a first tranche, not a plan to close the gap.</li></ul>' +
    '<h2 id="m-sources">Data sources</h2><table class="simple-table"><thead><tr><th>Dataset</th><th>Provider</th><th>Used for</th><th>Licence</th></tr></thead><tbody>' + src + '</tbody></table>' +
    '<p><b>Attribution.</b> Cell tower data from OpenCellID, licensed under CC BY-SA 4.0 (<a href="https://opencellid.org" target="_blank" rel="noopener">opencellid.org</a>); outputs derived from it, including the tower site files, are shared under the same licence. Network performance data is based on Speedtest by Ookla. Settlement, boundary, health and school data are from GRID3 Nigeria. Population is from WorldPop. The Relative Wealth Index is from Meta Data for Good (Chi, Fang, Chatterjee and Blumenstock, 2022, <i>PNAS</i> 119(3)). Check each dataset page for current terms.</p>' +
    '<h2 id="m-files">Downloads</h2><p>The files this page reads. Coordinates are WGS 84 and missing values are null.</p><div class="dl-grid">' + files + '</div>' +
    '<p class="note">DSN AI Bootcamp 2026, Geospatial Track. Built from the analysis notebook in this repository.</p>';
}

/* =====================================================================
   WIRING
   ===================================================================== */
const VIEWS = ['overview', 'map', 'rankings', 'method'];
function switchView(v, noHash) {
  U.view = v;
  VIEWS.forEach(n => $('#view-' + n).classList.toggle('active', n === v));
  $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === v)));
  hideTip();
  if (v === 'map') { syncSize(); readTheme(); requestDraw(); }
  if (v === 'overview') requestAnimationFrame(() => Object.keys(charts).forEach(id => renderChart(id, false)));
  if (!noHash) writeHash();
}
function writeHash() {
  let h = '#' + U.view;
  if (U.view === 'map' && U.sel) h += '/' + U.sel.level + '/' + encodeURIComponent(U.sel.id);
  try { history.replaceState(null, '', h); } catch (e) { /* file or sandboxed frame */ }
}
function readHash() {
  const [v, lv, id] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (!VIEWS.includes(v)) return;
  switchView(v, true);
  if (v === 'map' && lv && id) {
    const rec = recFor(lv, lv === 'lga' || lv === 'site' ? +id : id);
    if (rec) { syncSize(); selectRec(rec, { fly: true }); }
  }
}
function goMap(rec) { switchView('map'); syncSize(); selectRec(rec, { fly: true }); }

function fillSelect(sel, opts, val) {
  sel.innerHTML = opts.map(o => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('');
  sel.value = val;
}

function applyFilters(fly) {
  const f = U.f;
  const states = D.states.filter(s => !f.zone || s.p.zone === f.zone).sort((a, b) => a.p.statename.localeCompare(b.p.statename));
  fillSelect($('#fState'), [['', 'All states']].concat(states.map(s => [s.id, s.p.statename])), states.some(s => s.id === f.state) ? f.state : '');
  f.state = $('#fState').value;
  $('#fSet').checked = f.setOnly;
  $$('#fClass .chip').forEach(c => c.setAttribute('aria-pressed', String(f.classes.has(c.dataset.c))));
  if (fly) { const rec = f.state ? D.stateByCode.get(f.state) : f.zone ? D.zoneByName.get(f.zone) : null; syncSize(); flyTo(rec ? fitBBox(rec.bbox, 40, 9) : homeView()); }
  requestDraw();
}

function updateMetricHint() {
  const m = METRICS[U.metric];
  $('#metricHint').textContent = m.desc;
  $('#levelHint').textContent = U.ly.cluster || m.lgaOnly ? 'This view is shown at LGA level.' : U.level === 'auto' ? 'Auto switches between zones, states and LGAs as you zoom.' : '';
}

function wireMap() {
  fillSelect($('#metricSel'), Object.keys(METRICS).map(k => [k, METRICS[k].label]), U.metric);
  $('#metricSel').onchange = e => { U.metric = e.target.value; updateMetricHint(); requestDraw(); };
  updateMetricHint();
  $$('#levelSeg button').forEach(b => b.onclick = () => { U.level = b.dataset.level; $$('#levelSeg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); updateMetricHint(); requestDraw(); });
  $$('#classSeg button').forEach(b => b.onclick = () => { U.cls = b.dataset.cls; $$('#classSeg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); requestDraw(); });
  fillSelect($('#fZone'), [['', 'All zones']].concat(D.zoneNames.map(z => [z, z])), '');
  $('#fClass').innerHTML = CLASS_NAMES.map((c, i) => '<button class="chip" data-c="' + c + '" aria-pressed="false"><i style="background:' + CLASS_COLORS[i] + '"></i>' + c.replace(' lowest', '').replace(' highest', '') + '</button>').join('');
  $('#fZone').onchange = e => { U.f.zone = e.target.value; U.f.state = ''; applyFilters(true); };
  $('#fState').onchange = e => { U.f.state = e.target.value; applyFilters(true); };
  $$('#fClass .chip').forEach(c => c.onclick = () => { const k = c.dataset.c; U.f.classes.has(k) ? U.f.classes.delete(k) : U.f.classes.add(k); applyFilters(false); });
  $('#fSet').onchange = e => { U.f.setOnly = e.target.checked; applyFilters(false); };
  $('#fReset').onclick = () => { U.f = { zone: '', state: '', classes: new Set(), setOnly: false }; $('#fZone').value = ''; applyFilters(true); };
  applyFilters(false);

  const ly = (id, key) => $('#' + id).addEventListener('change', async e => {
    U.ly[key] = e.target.checked;
    if ((key === 'health' || key === 'school') && e.target.checked && !D.facLoaded) {
      $('#mapLoading').hidden = false;
      try { await loadFacilities(); } catch (err) { $('#mapLoading').textContent = 'Could not load facilities: ' + err.message; return; }
      $('#mapLoading').hidden = true;
      $('#cHealth').textContent = fmtInt(D.fac.filter(f => f.k === 'health').length);
      $('#cSchool').textContent = fmtInt(D.fac.filter(f => f.k === 'school').length);
    }
    if (key === 'cluster') updateMetricHint();
    requestDraw();
  });
  ly('lyCluster', 'cluster'); ly('lySet', 'set'); ly('lySites', 'sites'); ly('lyHealth', 'health'); ly('lySchool', 'school'); ly('lyBase', 'base');
  $('#cSites').textContent = D.sites.length;

  // search
  const box = $('#searchBox'), res = $('#searchResults');
  let hits = [], cur = -1;
  const show = () => {
    res.hidden = !hits.length;
    res.innerHTML = hits.map((h, i) => '<button data-i="' + i + '" class="' + (i === cur ? 'sel' : '') + '"><span>' + esc(h.name) + '</span><small>' + esc(h.sub) + '</small></button>').join('');
  };
  const choose = h => { res.hidden = true; box.value = h.name; box.blur(); selectRec(h.rec, { fly: true }); };
  box.addEventListener('input', () => { hits = runSearch(box.value); cur = hits.length ? 0 : -1; show(); });
  box.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { cur = Math.min(hits.length - 1, cur + 1); show(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cur = Math.max(0, cur - 1); show(); e.preventDefault(); }
    else if (e.key === 'Enter' && hits[cur]) choose(hits[cur]);
    else if (e.key === 'Escape') { res.hidden = true; }
  });
  res.addEventListener('mousedown', e => { const b = e.target.closest('button'); if (b) { e.preventDefault(); choose(hits[+b.dataset.i]); } });
  box.addEventListener('blur', () => setTimeout(() => { res.hidden = true; }, 120));

  $('#toggleLeft').onclick = () => { $('#view-map').classList.toggle('no-left'); setTimeout(syncSize, 0); };
  if (innerWidth < 900) $('#view-map').classList.add('no-left');
}

function wireOverview() {
  fillSelect($('#ovZone'), [['', 'All zones']].concat(D.zoneNames.map(z => [z, z])), '');
  $('#ovZone').onchange = e => { U.ovZone = e.target.value; renderOverview(); };
  fillSelect($('#zoneMetric'), zoneMetrics.map(k => [k, METRICS[k].label]), zoneMetric);
  $('#zoneMetric').onchange = e => { zoneMetric = e.target.value; renderChart('chZones', true); };
  $('#stateCount').onchange = () => renderChart('chStates', true);
  $('#ovOpenMap').onclick = () => {
    U.f.zone = U.ovZone; U.f.state = ''; $('#fZone').value = U.ovZone; applyFilters(false);
    switchView('map'); syncSize();
    const rec = U.ovZone ? D.zoneByName.get(U.ovZone) : null;
    flyTo(rec ? fitBBox(rec.bbox, 40, 9) : homeView(), 400);
  };
}

function wireRankings() {
  const st = U.rk;
  fillSelect($('#rkZone'), [['', 'All zones']].concat(D.zoneNames.map(z => [z, z])), '');
  fillSelect($('#rkClass'), [['', 'All classes']].concat(CLASS_NAMES.map(c => [c, c])), '');
  fillSelect($('#rkCluster'), [['', 'All clusters']].concat(CLUSTERS.map(c => [c.key, c.short])), '');
  const upd = () => { st.page = 0; renderRankings(); };
  $('#rkSearch').oninput = e => { st.q = e.target.value; upd(); };
  $('#rkZone').onchange = e => { st.zone = e.target.value; upd(); };
  $('#rkClass').onchange = e => { st.cls = e.target.value; upd(); };
  $('#rkCluster').onchange = e => { st.cluster = e.target.value; upd(); };
  $$('#rkLevel button').forEach(b => b.onclick = () => { st.level = b.dataset.rk; st.sort = { key: st.level === 'site' ? 'rank' : 'priority_rank', dir: 1 }; st.page = 0; renderRankings(); });
  $('#rkTable').addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const k = th.dataset.sort;
    st.sort = st.sort.key === k ? { key: k, dir: -st.sort.dir } : { key: k, dir: (RK[st.level].find(c => c.k === k) || {}).num ? (k === 'priority_rank' || k === 'rank' ? 1 : -1) : 1 };
    renderRankings();
  });
  $('#rkPrev').onclick = () => { st.page--; renderRankings(); };
  $('#rkNext').onclick = () => { st.page++; renderRankings(); };
  $('#rkCsv').onclick = downloadCSV;
}

function wireGlobal() {
  $$('.tab').forEach(t => t.onclick = () => switchView(t.dataset.view));
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const [kind, ...rest] = a.dataset.act.split(':'), id = rest.join(':');
    if (kind === 'close') clearSelection();
    else if (kind === 'fit') { if (U.sel) flyToRec(U.sel.rec); }
    else if (kind === 'rank') {
      if (!U.sel) return;
      const lv = U.sel.level; U.rk.level = lv; U.rk.q = areaName(U.sel.rec); U.rk.zone = ''; U.rk.cls = ''; U.rk.cluster = '';
      U.rk.sort = { key: lv === 'site' ? 'rank' : 'priority_rank', dir: 1 }; U.rk.page = 0;
      $('#rkSearch').value = U.rk.q; $('#rkZone').value = ''; $('#rkClass').value = ''; $('#rkCluster').value = '';
      switchView('rankings'); renderRankings();
    }
    else if (kind === 'ovzone') { U.ovZone = U.ovZone === id ? '' : id; $('#ovZone').value = U.ovZone; renderOverview(); }
    else { const rec = recFor(kind, kind === 'lga' || kind === 'site' ? +id : id); if (rec) goMap(rec); }
  });
  // chart tooltips
  document.addEventListener('mousemove', e => {
    const hv = e.target.closest && e.target.closest('[data-hover="curve"]');
    if (hv) {
      const [l, r, kmax] = hv.dataset.m.split(',').map(Number), box = hv.getBoundingClientRect();
      const k = clamp(Math.round((e.clientX - box.left) / box.width * kmax), 0, kmax);
      const pt = k === 0 ? { cumulative_people: 0, cumulative_share: 0 } : D.summary.siting_curve[k - 1];
      const mark = $('#curveMark'), x = l + k / kmax * (box.width);
      mark.setAttribute('x1', x); mark.setAttribute('x2', x); mark.setAttribute('opacity', '1');
      showTip('<b>' + k + ' towers upgraded</b>' + tipRow('People reached', fmtCompact(pt.cumulative_people)) + tipRow('Share of population', fmtPct(pt.cumulative_share, 2)), e.clientX, e.clientY);
      void r; return;
    }
    const m = $('#curveMark'); if (m) m.setAttribute('opacity', '0');
    const t = e.target.closest && e.target.closest('.chart [data-tip]');
    if (t) showTip(t.getAttribute('data-tip'), e.clientX, e.clientY);
    else if (!e.target.closest('#mapCanvas')) hideTip();
  });
  $('#themeBtn').onclick = () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('atlas-theme', dark ? 'dark' : 'light'); } catch (e) { /* storage blocked */ }
    readTheme(); M.legendKey = ''; requestDraw(); rerenderCharts();
  };
  window.addEventListener('hashchange', readHash);
  new ResizeObserver(() => { syncSize(); }).observe(stage);
}

/* =====================================================================
   START
   ===================================================================== */
async function start() {
  let theme = null;
  try { theme = localStorage.getItem('atlas-theme'); } catch (e) { /* ignore */ }
  if (!theme) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  readTheme();
  try {
    await loadCore();
  } catch (err) {
    $('#splash').innerHTML = '<div class="fatal"><h2>The data files could not be loaded</h2><p>' + esc(err.message) + '</p>' +
      (location.protocol === 'file:' ? '<p style="margin-top:8px">Browsers block data loading when a page is opened as a file. Serve this folder instead:</p><code>python -m http.server 8000</code><p style="margin-top:8px">then open <code>http://localhost:8000</code>.</p>'
        : '<p style="margin-top:8px">Check that the GeoJSON and summary files from the notebook are in the same folder as index.html.</p>') + '</div>';
    return;
  }
  D.states.forEach(s => { s.setN = D.lgas.filter(l => l.p.statecode === s.id && l.p.in_priority_set).length; });
  buildSearch();
  OV.L = ovLGAs();
  wireOverview(); renderNotice(); renderKPIs(); renderInsights(); renderTopLgas(); initCharts();
  wireMap(); wireRankings(); renderRankings(); renderMethod(); wireGlobal();
  $('#splash').hidden = true;
  readHash();
  window.__atlas = { D, U, M, select: (l, i) => selectRec(recFor(l, i), { fly: true }), switchView };
}
start();
})();
