/* CutList Pro
   Everything runs in the browser. Photos never leave the device.
   No inline handlers: all interaction goes through delegated listeners so a strict CSP can apply. */
'use strict';

// ───────────────────────── Utilities ─────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : def; };
const mm2in = v => +(v / 25.4).toFixed(2);
const fmt = v => S.unit === 'in' ? mm2in(v) + '"' : Math.round(v) + 'mm';
const fmtLen = v => S.unit === 'in' ? mm2in(v) + '"' : (v >= 1000 ? (v / 1000).toFixed(2) + 'm' : Math.round(v) + 'mm');
const gbp = v => '£' + (Math.round(v * 100) / 100).toFixed(2);
const gbp0 = v => '£' + Math.round(v).toLocaleString('en-GB');
const deg = r => r * 180 / Math.PI;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } }
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// Spreadsheet formula injection guard: prefix risky leading characters
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
const safeName = s => (String(s || '').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'cutlist');

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// ───────────────────────── Catalogue ─────────────────────────
const TEMPLATES = [
  { id: 'eaves', name: 'Under-eaves cupboard', icon: 'house-line', kind: 'cabinet' },
  { id: 'understairs', name: 'Under-stairs cupboard', icon: 'stairs', kind: 'cabinet' },
  { id: 'wardrobe', name: 'Wardrobe', icon: 'dresser', kind: 'cabinet' },
  { id: 'shelving', name: 'Open shelving', icon: 'books', kind: 'cabinet' },
  { id: 'kitchenbase', name: 'Kitchen base unit', icon: 'cooking-pot', kind: 'cabinet' },
  { id: 'kitchenwall', name: 'Wall cupboard', icon: 'square-half', kind: 'cabinet' },
  { id: 'studwall', name: 'Stud wall', icon: 'wall', kind: 'frame' },
  { id: 'partition', name: 'Partition wall', icon: 'columns', kind: 'frame' },
  { id: 'floorjoists', name: 'Floor joists', icon: 'rows', kind: 'frame' },
  { id: 'flatroof', name: 'Flat roof', icon: 'stack', kind: 'frame' },
  { id: 'pitchedroof', name: 'Pitched roof', icon: 'house-line', kind: 'frame' }
];
const tplOf = id => TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
// Name for the current design, e.g. under-eaves without doors reads as shelving
function designName() {
  if (S.template === 'eaves' && doorCount() === 0) return 'Under-eaves shelving';
  if (S.template === 'understairs' && doorCount() === 0) return 'Under-stairs shelving';
  if (S.template === 'wardrobe' && doorCount() === 0) return 'Open wardrobe';
  if (S.template === 'shelving' && doorCount() > 0) return 'Shelving unit with doors';
  return tplOf(S.template).name;
}
const isCabinet = id => tplOf(id).kind === 'cabinet';
const STRUCTURAL = new Set(['floorjoists', 'flatroof', 'pitchedroof']);

const DEFAULTS = {
  understairs: { w: 2400, h: 2000, d: 800, low: 600, shelves: 2, bays: 4, spacing: 400, pitch: 0 },
  eaves: { w: 1800, h: 1200, d: 600, low: 700, shelves: 1, bays: 3, spacing: 400, pitch: 0 },
  shelving: { w: 800, h: 1200, d: 300, low: 0, shelves: 4, bays: 2, spacing: 400, pitch: 0 },
  wardrobe: { w: 1000, h: 2100, d: 600, low: 0, shelves: 2, bays: 2, spacing: 400, pitch: 0 },
  kitchenbase: { w: 600, h: 720, d: 560, low: 0, shelves: 1, spacing: 400, pitch: 0 },
  kitchenwall: { w: 600, h: 720, d: 330, low: 0, shelves: 2, spacing: 400, pitch: 0 },
  studwall: { w: 2400, h: 2400, d: 100, low: 0, shelves: 0, spacing: 400, pitch: 0 },
  partition: { w: 2400, h: 2400, d: 100, low: 0, shelves: 0, spacing: 600, pitch: 0 },
  flatroof: { w: 3600, h: 200, d: 2400, low: 0, shelves: 0, spacing: 400, pitch: 0 },
  floorjoists: { w: 3600, h: 200, d: 2400, low: 0, shelves: 0, spacing: 400, pitch: 0 },
  pitchedroof: { w: 4000, h: 150, d: 3000, low: 0, shelves: 0, spacing: 400, pitch: 35 }
};

// Measurement fields per template: [key, label, help]
const FIELDS = {
  eaves: [['w', 'Width', 'Wall to wall along the knee wall'], ['h', 'Front height', 'Floor to sloping ceiling, where the doors go'], ['low', 'Back height', 'Height of the knee wall at the back'], ['d', 'Depth', 'Knee wall to where the doors go']],
  understairs: [['w', 'Length', 'Along the stairs, end to end'], ['h', 'Tall end height', 'Floor to the underside of the stairs at the high end'], ['low', 'Short end height', 'Floor to the stairs at the low end'], ['d', 'Depth', 'Back wall to the front edge']],
  cabinet: [['w', 'Width', 'Wall to wall'], ['h', 'Height', 'Floor to top of the unit'], ['d', 'Depth', 'Back wall to the front edge']],
  studwall: [['w', 'Wall length', 'End to end'], ['h', 'Ceiling height', 'Floor to ceiling'], ['spacing', 'Stud centres', 'Usually 400 or 600']],
  partition: [['w', 'Wall length', 'End to end'], ['h', 'Ceiling height', 'Floor to ceiling'], ['spacing', 'Stud centres', 'Usually 400 or 600']],
  flatroof: [['w', 'Joist span', 'Wall to wall the joists cross'], ['d', 'Roof width', 'Along the walls'], ['h', 'Joist depth', 'e.g. 150, 175, 200'], ['spacing', 'Joist centres', 'Usually 400']],
  floorjoists: [['w', 'Joist span', 'Wall to wall the joists cross'], ['d', 'Floor width', 'Along the walls'], ['h', 'Joist depth', 'e.g. 150, 175, 200'], ['spacing', 'Joist centres', 'Usually 400']],
  pitchedroof: [['w', 'Building length', 'Along the ridge'], ['d', 'Span', 'Wall plate to wall plate'], ['h', 'Rafter depth', 'e.g. 100, 125, 150'], ['pitch', 'Roof pitch', 'Degrees'], ['spacing', 'Rafter centres', 'Usually 400']]
};
const fieldsFor = id => FIELDS[id] || (isCabinet(id) ? FIELDS.cabinet : FIELDS.studwall);
const LIMITS = { w: [100, 15000], h: [50, 6000], d: [50, 8000], low: [50, 6000], shelves: [0, 20], compartments: [1, 8], spacing: [200, 1200], pitch: [5, 70], thickness: [3, 100], kerf: [0, 10], sheetW: [300, 3700], sheetH: [300, 2200] };

const MATERIALS = {
  plywood: { name: 'Plywood', thick: 18, price: 45, note: 'Strong, takes screws well' },
  mdf: { name: 'MDF', thick: 18, price: 28, note: 'Smooth, best for painting' },
  melamine: { name: 'Melamine-faced chipboard', thick: 18, price: 38, note: 'Pre-finished, no painting' },
  osb: { name: 'OSB', thick: 11, price: 18, note: 'Budget, rough finish' },
  c16: { name: 'C16 timber', thick: 47, price: 0, note: 'Structural softwood' }
};
const THIN = { ply3: { name: '3mm hardboard / ply', price: 18 }, ply6: { name: '6mm plywood', price: 24 } };
const WHOLE = {
  deck: { name: '18mm plywood deck board', price: 45 },
  chip: { name: '22mm T&G chipboard flooring', price: 26 },
  plaster: { name: '12.5mm plasterboard', price: 9.5 }
};
const TIMBER_BASE = 12; // est. £ per 4.8m length of 47x100 C16, scaled by section area
const RAIL_PRICE = 6; // 2.4m chrome hanging rail
const FELT_ROLL = 28; // 10m x 1m roll
const DELIVERY = [
  { id: 'standard', t: 'Standard delivery', s: 'Usually 5 to 7 working days', p: 25 },
  { id: 'express', t: 'Express delivery', s: 'Usually 2 to 3 working days', p: 45 },
  { id: 'collect', t: 'Collect from supplier', s: 'Pick up when it is ready', p: 0 }
];
// UK cutting services, from their own websites (checked October 2026). 'yes' = they say they do it,
// 'ask' = not stated, 'no' = they say they do not. area: 'uk', or postcode areas they serve.
const LONDON = ['E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC', 'BR', 'CR', 'DA', 'EN', 'HA', 'IG', 'KT', 'RM', 'SM', 'TW', 'UB', 'WD', 'AL', 'SG', 'CM', 'ME', 'TN'];
const SUPPLIERS = [
  { name: 'Cutwrights', url: 'https://www.cutwrights.com', area: 'uk', howTo: 'Online quote in under a minute', lead: 'Ask', angles: 'ask', drilling: 'yes', edging: 'yes', note: 'Cutting, edging and drilling service. Check delivery to your postcode.' },
  { name: 'CNC Creations', url: 'https://cnccreations.co.uk', area: 'uk', howTo: 'Send your files, they can adjust them', lead: '1 to 7 working days (cut to size)', angles: 'yes', drilling: 'yes', edging: 'ask', note: 'Takes one-off orders from private customers. Cuts to shape.' },
  { name: 'Chop Shop CNC', url: 'https://chopshopcnc.com', area: 'uk', howTo: 'Upload the DXF, most jobs priced instantly', lead: 'Made within 5 working days', angles: 'yes', drilling: 'ask', edging: 'ask', note: 'Delivers anywhere in the UK.' },
  { name: 'CutMy', url: 'https://www.cutmy.co.uk', area: 'uk', howTo: 'Order online, custom shapes from a sketch', lead: 'Ask', angles: 'yes', drilling: 'ask', edging: 'ask', note: 'CNC cut to plus or minus 1mm.' },
  { name: 'MDF Direct', url: 'https://mdfdirect.co.uk', area: 'uk', howTo: 'Upload your cut list, quote in minutes', lead: 'Ask', angles: 'ask', drilling: 'ask', edging: 'ask', note: 'MDF specialist.' },
  { name: 'JustMDF', url: 'https://justmdf.co.uk', email: 'sale@justmdf.co.uk', area: 'uk', howTo: 'Email your cut list', lead: 'Ask', angles: 'ask', drilling: 'ask', edging: 'ask', note: 'Delivers nationwide, by pallet for big orders.' },
  { name: 'C Workshop', url: 'https://cworkshop.co.uk/services/cnc-cutting/', area: LONDON, howTo: 'Cutting list or CAD file', lead: '24 to 48 hours on the fast service', angles: 'yes', drilling: 'yes', edging: 'ask', note: 'Hinge and shelf-pin drilling. Branches in Welham Green and Swanley.' },
  { name: 'Panelven Boardcut', url: 'https://boardcut.co.uk', area: ['SO', 'PO', 'GU', 'RG', 'BH', 'SP'], howTo: 'Fill in their spreadsheet, quote in 24 hours', lead: 'Ask', angles: 'ask', drilling: 'ask', edging: 'ask', note: 'Hampshire.' },
  { name: 'B&Q in-store cutting', url: 'https://www.diy.com/services/timber-cutting', area: 'store', howTo: 'Take the cut list to the store', lead: 'While you wait', angles: 'no', drilling: 'no', edging: 'no', note: 'Straight cuts only on boards bought there. First 5 cuts free, then 50p.' }
];
const JOINERY = {
  screws: { name: 'Glue and screws', short: 'Screws', note: 'Easiest. Screw heads show on the outside faces.' },
  pocket: { name: 'Pocket screws', short: 'Pocket', note: 'Hidden screws from the inside. Needs a pocket-hole jig.' },
  cam: { name: 'Cam and dowel', short: 'Flat-pack', note: 'Knock-down fittings. Ask the cutter to CNC-drill them.' }
};
const STEP_NAMES = ['Space', 'Design', 'Cut list', 'Build', 'Order'];

// ───────────────────────── State ─────────────────────────
function freshState(template = 'eaves') {
  const d = DEFAULTS[template];
  const cab = isCabinet(template);
  return {
    v: 2,
    name: template === 'eaves' ? 'Attic eaves cupboards' : tplOf(template).name,
    template,
    material: cab ? 'plywood' : 'c16',
    thickness: cab ? 18 : 47,
    sheetW: 2440, sheetH: 1220, kerf: 3,
    w: d.w, h: d.h, d: d.d, low: d.low, shelves: d.shelves, spacing: d.spacing, pitch: d.pitch,
    compartments: d.bays || 1, boxes: 'auto', site: defaultSite(template), hand: 'right', doors: 'auto', joinery: 'screws', scribe: true, load: defaultLoad(template),
    overrides: {}, priceSheet: null, delivery: 'standard', postcode: '',
    unit: 'mm', done: []
  };
}

const S = Object.assign(freshState(), {
  view: 'home', step: 0, stage: 'drawing', buildIdx: 0, buildMode: 'manual', editParts: false,
  photo: null, // { url, img, w, h } kept in memory only, never persisted
  fracPerMM: null, ov: null, cmp: 0, measured: false, drag3d: { rx: -18, ry: 32 }
});
let R = { parts: [], sheets: {}, linear: [], whole: [], rolls: [], fittings: [], hinges: [], totals: {} };

const PERSIST = ['v', 'name', 'template', 'material', 'thickness', 'sheetW', 'sheetH', 'kerf', 'w', 'h', 'd', 'low', 'shelves', 'compartments', 'boxes', 'site', 'hand', 'spacing', 'pitch', 'doors', 'joinery', 'scribe', 'load', 'overrides', 'priceSheet', 'delivery', 'postcode', 'unit', 'done'];
function snapshot() { const o = {}; PERSIST.forEach(k => { o[k] = S[k]; }); o.savedAt = Date.now(); return o; }

// Validate anything read from storage before it touches state
function sanitizeProject(p) {
  if (!p || typeof p !== 'object') return null;
  // v1 (old app) keys: dimW, dimH, dimD, dimShelves, dimSpacing, dimPitch
  const tpl = TEMPLATES.some(t => t.id === p.template) ? p.template : 'shelving';
  const base = freshState(tpl);
  const pick = (a, b) => (p[a] !== undefined ? p[a] : p[b]);
  const out = Object.assign(base, {
    name: String(p.name || base.name).slice(0, 60),
    material: MATERIALS[p.material] ? p.material : base.material,
    thickness: num(p.thickness, ...LIMITS.thickness, base.thickness),
    sheetW: num(p.sheetW, ...LIMITS.sheetW, 2440), sheetH: num(p.sheetH, ...LIMITS.sheetH, 1220), kerf: num(p.kerf, ...LIMITS.kerf, 3),
    w: num(pick('w', 'dimW'), ...LIMITS.w, base.w), h: num(pick('h', 'dimH'), ...LIMITS.h, base.h), d: num(pick('d', 'dimD'), ...LIMITS.d, base.d),
    low: num(p.low, ...LIMITS.low, base.low), shelves: Math.round(num(pick('shelves', 'dimShelves'), ...LIMITS.shelves, base.shelves)),
    spacing: num(pick('spacing', 'dimSpacing'), ...LIMITS.spacing, base.spacing), pitch: num(pick('pitch', 'dimPitch'), 0, 70, base.pitch),
    compartments: Math.round(num(p.compartments, 1, 8, 1)),
    site: SITES[p.site] ? p.site : base.site, hand: p.hand === 'left' ? 'left' : 'right',
    boxes: p.boxes === undefined || p.boxes === 'auto' ? 'auto' : Math.round(num(p.boxes, 1, 8, 1)),
    doors: p.doors === 'auto' || p.doors === undefined ? 'auto' : Math.round(num(p.doors, 0, 8, 0)),
    joinery: JOINERY[p.joinery] ? p.joinery : 'screws', scribe: p.scribe !== false, load: LOADS[p.load] ? p.load : base.load,
    priceSheet: p.priceSheet == null ? null : num(p.priceSheet, 0, 1000, null),
    delivery: DELIVERY.some(d => d.id === p.delivery) ? p.delivery : 'standard',
    postcode: String(p.postcode || '').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 8),
    unit: p.unit === 'in' ? 'in' : 'mm',
    done: Array.isArray(p.done) ? p.done.filter(n => Number.isInteger(n) && n >= 0 && n < 40) : []
  });
  out.overrides = {};
  if (p.overrides && typeof p.overrides === 'object') {
    Object.keys(p.overrides).slice(0, 60).forEach(k => {
      const o = p.overrides[k];
      if (!o || typeof o !== 'object') return;
      out.overrides[String(k).slice(0, 40)] = { w: num(o.w, 1, 15000, undefined), h: num(o.h, 1, 15000, undefined), qty: o.qty === undefined ? undefined : Math.round(num(o.qty, 0, 500, 1)) };
    });
  }
  if (!isCabinet(tpl)) out.material = 'c16';
  if (tpl === 'eaves' && !(out.low > 0 && out.low < out.h)) out.low = Math.round(out.h * 0.55);
  return out;
}

function applyProject(p) {
  const clean = sanitizeProject(p);
  if (!clean) return false;
  PERSIST.forEach(k => { if (k in clean) S[k] = clean[k]; });
  S.buildIdx = 0; S.editParts = false;
  return true;
}

let draftTimer;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => store.set('cutlist_draft', snapshot()), 400);
}

// ───────────────────────── Generation ─────────────────────────
// Upright dividers split a unit into bays. Kitchen base units keep one bay (drawer above).
const BAY_TEMPLATES = new Set(['eaves', 'understairs', 'shelving', 'wardrobe', 'kitchenwall']);
// Long units are built as separate boxes, like kitchen units: each box is a complete carcass with its
// own sides, top, bottom and back, small enough to cut from one sheet and carry up the stairs.
// How long a panel can be carried to where the unit is built. Lofts have tight stairs and hatches.
const SITES = {
  ground: { name: 'Ground floor', carry: 2400, note: 'Straight in through a door' },
  upstairs: { name: 'Upstairs', carry: 1800, note: 'Up a staircase and round a landing' },
  loft: { name: 'Loft or attic', carry: 1200, note: 'Narrow stairs, ladder or hatch' }
};
function defaultSite(t) { return t === 'eaves' ? 'loft' : t === 'understairs' ? 'ground' : 'upstairs'; }
// Longest panel that can be carried in, and so the widest box
function maxBox() { return Math.min((SITES[S.site] || SITES.upstairs).carry, Math.max(S.sheetW, S.sheetH) - 40); }
function layout() {
  const th = S.thickness, W = S.w, bayTpl = BAY_TEMPLATES.has(S.template);
  let C = bayTpl ? clamp(Math.round(S.compartments || 1), 1, 8) : 1;
  const widthOf = (k, bay) => 2 * th + k * bay + (k - 1) * th;
  const plan = (n, c) => {
    const base = Math.floor(c / n), extra = c % n;
    return { ks: Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0)), bay: (W - 2 * th * n - (c - n) * th) / c };
  };
  let n = 1;
  if (bayTpl) {
    const want = S.boxes === 'auto' || S.boxes == null ? 0 : clamp(Math.round(S.boxes), 1, 8);
    if (want) n = want;
    else {
      // A box fits when its longest panel can be carried in and cut from a sheet, and its back fits a 2440 x 1220 board
      const rise = S.template === 'understairs' ? Math.max(0, S.h - S.low) : 0;
      const ok = bw => {
        const top = rise ? Math.hypot(bw, rise * bw / W) : bw - 2 * th;
        const backH = S.template === 'eaves' ? S.low : S.h, backW = bw - 4;
        return top <= maxBox() && Math.max(backW, backH) <= 2440 && Math.min(backW, backH) <= 1220;
      };
      const fits = m => { const q = plan(m, Math.max(C, m)); return q.ks.every(k => ok(widthOf(k, q.bay))); };
      while (n < 8 && !fits(n)) n++;
    }
    C = Math.max(C, n);
  }
  const { ks, bay } = plan(n, C);
  const boxes = [], bays = [], verticals = [];
  let x = 0;
  ks.forEach((k, i) => {
    const w = i === n - 1 ? W - x : Math.round(widthOf(k, bay));
    boxes.push({ i, x0: x, w, k });
    verticals.push({ x, box: i, kind: i === 0 ? 'left' : 'boxside' });
    for (let j = 0; j < k; j++) {
      const bx = x + th + j * (bay + th);
      bays.push({ x: bx, w: bay, box: i });
      if (j > 0) verticals.push({ x: bx - th, box: i, kind: 'divider' });
    }
    verticals.push({ x: x + w - th, box: i, kind: i === n - 1 ? 'right' : 'boxside' });
    x += w;
  });
  // Name every upright. Under the stairs each one is a different height, so they are numbered.
  const us = S.template === 'understairs', count = { boxside: 0, divider: 0 };
  verticals.forEach(v => {
    if (v.kind === 'left') v.name = 'Left Side';
    else if (v.kind === 'right') v.name = 'Right Side';
    else { count[v.kind]++; v.name = (v.kind === 'boxside' ? 'Box Side' : 'Divider') + (us ? ' ' + count[v.kind] : ''); }
  });
  // Boxes with the same number of compartments are identical; give each kind a letter
  const kinds = [...new Set(ks)].sort((a, b) => b - a);
  boxes.forEach(b => { b.type = kinds.length > 1 ? String.fromCharCode(65 + kinds.indexOf(b.k)) : ''; });
  return { n, C, bay, bayW: Math.floor(bay), boxes, bays, verticals, raised: bayTpl && C > clamp(Math.round(S.compartments || 1), 1, 8) };
}
// Under-stairs doors: one per compartment, overlaying the front, each with a sloping top edge
function stairDoors() {
  const L = layout(), sg = stairGeom(), out = [];
  L.boxes.forEach(b => {
    const dw = Math.floor((b.w - 4 - 3 * (b.k - 1)) / b.k);
    for (let j = 0; j < b.k; j++) {
      const x = b.x0 + 2 + j * (dw + 3);
      const hl = Math.round(sg.topAt(x) - 3), hr = Math.round(sg.topAt(x + dw) - 3);
      out.push({ x, w: dw, hl, hr, hingeLeft: hl >= hr });
    }
  });
  return out;
}
// Part name for a box-level panel: "Bottom", or "Bottom A" when boxes come in two sizes
const boxPart = (name, b) => (S.template === 'understairs' && name === 'Back Panel' && layout().n > 1) ? name + ' ' + (b.i + 1) : b.type ? name + ' ' + b.type : name;
function bayInfo() {
  const L = layout();
  return { bays: L.C, bayW: L.bayW, inner: S.w - 2 * S.thickness, boxes: L.n };
}
const bayX = b => layout().bays[b].x;

function doorCount() {
  if (S.doors !== 'auto') return S.doors;
  const W = S.w, { bays } = bayInfo();
  if (bays > 1 && S.template !== 'shelving') return bays;
  switch (S.template) {
    case 'shelving': return 0;
    case 'wardrobe': return W > 1300 ? 3 : 2;
    case 'kitchenbase': case 'kitchenwall': return W > 650 ? 2 : 1;
    case 'eaves': return W <= 700 ? 1 : Math.max(2, Math.ceil(W / 700));
    case 'understairs': return Math.max(1, Math.ceil(W / 700));
    default: return 0;
  }
}

// Standard 35mm concealed hinge positions (Blum / Hettich pattern)
function calcHingePositions(doorH) {
  const n = doorH > 1900 ? 4 : doorH > 1200 ? 3 : 2;
  const names = n === 2 ? ['Top hinge', 'Bottom hinge'] : n === 3 ? ['Top hinge', 'Middle hinge', 'Bottom hinge'] : ['Top hinge', 'Upper hinge', 'Lower hinge', 'Bottom hinge'];
  return names.map((label, i) => ({ label, y: Math.round(90 + (doorH - 180) * i / (n - 1)), bore: 35, depth: 13, inset: 22.5 }));
}

// Under the stairs the height changes along the length: tall at one end, short at the other.
// topAt(x) is the underside of the stairs at x (mm from the left end).
function stairGeom() {
  const W = S.w, rise = Math.max(0, S.h - S.low), ang = Math.atan2(rise, W), c = Math.cos(ang) || 1;
  const topAt = x => S.hand === 'left' ? S.low + rise * (W - x) / W : S.low + rise * x / W;
  return { rise, ang, angDeg: Math.round(deg(ang) * 10) / 10, c, tv: S.thickness / c, topAt };
}

function eavesGeom() {
  const s = S.scribe ? 2 : 0;
  const run = S.d - s, rise = Math.max(0, S.h - S.low);
  const ang = rise > 0 ? Math.atan(rise / S.d) : 0;
  return { s, run, rise, ang, angDeg: Math.round(deg(ang) * 10) / 10 };
}

function generateParts() {
  const t = S.template, w = S.w, h = S.h, d = S.d, n = S.shelves, th = S.thickness, sp = S.spacing;
  const s = S.scribe ? 2 : 0, sc = !!s;
  const nd = doorCount();
  const { bays, bayW } = bayInfo();
  const P = [];
  const sheet = (o) => P.push({ stock: 'sheet', qty: 1, ...o });
  const thin = (o, k = 'ply3') => P.push({ stock: k, qty: 1, ...o });
  const lin = (o) => P.push({ stock: 'linear', qty: 1, ...o });
  const overlayDoors = (totalW, doorH) => {
    if (!nd) return;
    const dw = Math.floor((totalW - 4 - 3 * (nd - 1)) / nd);
    const hinges = calcHingePositions(doorH);
    sheet({ name: 'Door', w: dw, h: doorH, qty: nd, hinges, role: 'door', note: hinges.length + ' hinges each, 35mm bore', edge: 4 });
  };

  if (BAY_TEMPLATES.has(t)) {
    // Built from one or more boxes (see layout()). Panels shared by identical boxes are grouped.
    const L = layout(), eaves = t === 'eaves', g = eaves ? eavesGeom() : null, cosA = eaves ? (Math.cos(g.ang) || 1) : 1;
    const dep = eaves ? g.run : d - s, sideNote = eaves ? `Angled top: ${Math.round(h)} at the front, ${Math.round(S.low)} at the back (${g.angDeg} deg)` : null;
    const side = (name, qty, scribed) => qty > 0 && sheet({ name, w: dep, h, qty, scribed, role: 'side', edge: 1, ...(eaves ? { shape: { front: h, back: S.low }, note: sideNote } : {}) });
    if (t === 'understairs') {
      // Every upright is cut to the slope of the stairs: height to the underside of the top, top edge bevelled
      const sg = stairGeom();
      L.verticals.forEach(v => {
        const top = sg.topAt(v.x + th / 2) - sg.tv, divider = v.kind === 'divider';
        sheet({ name: v.name, w: d - s, h: Math.round(divider ? top - th : top), qty: 1, scribed: !divider && v.kind !== 'boxside' && sc, role: divider ? 'divider' : 'side', edge: 1, note: `Bevel the top edge at ${sg.angDeg} deg` });
      });
    } else {
      side('Left Side', 1, sc); side('Right Side', 1, sc);
      side('Box Side', 2 * L.n - 2, false);
    }
    const kinds = [...new Map(L.boxes.map(b => [b.type, b])).values()];
    kinds.forEach(k => {
      const qty = L.boxes.filter(b => b.type === k.type).length, inner = k.w - 2 * th;
      if (t === 'understairs') {
        const sg = stairGeom(), rise = sg.rise * k.w / w;
        sheet({ name: boxPart('Bottom', k), w: inner, h: d - s, qty, role: 'bottom', edge: 1 });
        sheet({ name: boxPart('Sloped Top', k), w: Math.round(Math.hypot(k.w, rise)), h: d - s, qty, role: 'top', note: `Sits on the uprights. Bevel both ends at ${sg.angDeg} deg`, edge: 1 });
      } else if (eaves) {
        sheet({ name: boxPart('Bottom', k), w: inner, h: g.run, qty, role: 'bottom', edge: 1 });
        sheet({ name: boxPart('Sloped Top', k), w: inner, h: Math.round(Math.hypot(g.run, g.rise)), qty, role: 'top', note: `Bevel front and back edges at ${g.angDeg} deg`, edge: 1 });
        thin({ name: boxPart('Back Panel', k), w: k.w - 4, h: Math.max(50, S.low - 4), qty, role: 'back', note: '3mm, glued and pinned on' });
      } else {
        sheet({ name: boxPart('Top', k), w: inner, h: d - s, qty, scribed: sc, role: 'top', edge: 1 });
        sheet({ name: boxPart('Bottom', k), w: inner, h: d - s, qty, scribed: sc, role: 'bottom', edge: 1 });
        thin({ name: boxPart('Back Panel', k), w: k.w - 4, h: h - 4, qty, role: 'back', note: '3mm, glued and pinned on. Stops the unit racking sideways' });
      }
    });
    if (t === 'understairs') {
      const sg = stairGeom();
      L.boxes.forEach(b => {
        const hl = Math.round(sg.topAt(b.x0) - 4), hr = Math.round(sg.topAt(b.x0 + b.w) - 4);
        thin({ name: boxPart('Back Panel', b), w: b.w - 4, h: Math.max(hl, hr), qty: 1, role: 'back', shape: { front: Math.max(hl, hr), back: Math.min(hl, hr) }, note: `3mm, glued and pinned on. Angled top: ${hl} at the left, ${hr} at the right` });
      });
    }
    // Shelves: one per compartment per row; on eaves they get shallower to clear the slope
    for (let i = 0; i < n; i++) {
      if (eaves) {
        const yc = th + (h - 2 * th) * (i + 1) / (n + 1), yTop = yc + th / 2;
        const maxDepth = g.rise > 0 ? (h - th / cosA - yTop) * S.d / g.rise : g.run;
        const depth = Math.floor(Math.min(g.run - 2, maxDepth) - 5);
        if (depth >= 100) sheet({ name: 'Shelf ' + (i + 1), w: L.bayW, h: depth, qty: L.C, role: 'shelf', edge: 1, yc, note: 'Shallower to clear the slope' });
      } else if (t === 'understairs') {
        // Same shelf heights all along, but only in the compartments tall enough for them
        const sg = stairGeom(), yc = th + (h - 2 * th) * (i + 1) / (n + 1);
        const fit = L.bays.map((b, j) => [j, Math.min(sg.topAt(b.x), sg.topAt(b.x + b.w)) - sg.tv]).filter(([, top]) => yc + th / 2 + 150 <= top).map(([j]) => j);
        if (fit.length) sheet({ name: 'Shelf ' + (i + 1), w: L.bayW, h: d - 20 - s, qty: fit.length, role: 'shelf', edge: 1, yc, bays: fit, note: fit.length < L.C ? `In ${fit.length} of ${L.C} compartments, where there is room` : '' });
      } else sheet({ name: 'Shelf ' + (i + 1), w: L.bayW, h: t === 'shelving' ? d - s - 2 : d - 20 - s, qty: L.C, role: 'shelf', edge: 1 });
    }
    const divs = t === 'understairs' ? 0 : L.verticals.filter(v => v.kind === 'divider').length;
    if (divs) {
      if (eaves) {
        const front = Math.round(h - th - th / cosA), back = Math.max(50, Math.round(S.low - th - th / cosA));
        sheet({ name: 'Divider', w: g.run, h: front, qty: divs, role: 'divider', shape: { front, back }, note: `Angled top: ${front} at the front, ${back} at the back (${g.angDeg} deg)`, edge: 1 });
      } else sheet({ name: 'Divider', w: d - s, h: h - 2 * th, qty: divs, role: 'divider', edge: 1 });
    }
    if (t === 'wardrobe') lin({ name: 'Hanging Rail', w: L.bayW - 20, h: 30, qty: L.C, section: '25mm rail', role: 'rail', note: 'Round chrome rail' });
    // Doors: one per compartment on multi-box units, so no door spans two boxes
    if (nd && t === 'understairs') {
      const sg = stairGeom();
      stairDoors().forEach((dr, i) => {
        const tall = Math.max(dr.hl, dr.hr), hinges = calcHingePositions(tall);
        sheet({ name: 'Door ' + (i + 1), w: dr.w, h: tall, qty: 1, hinges, role: 'door', shape: { front: tall, back: Math.min(dr.hl, dr.hr) }, note: `Angled top: ${dr.hl} at the left, ${dr.hr} at the right (${sg.angDeg} deg). Hinge on the ${dr.hingeLeft ? 'left' : 'right'}`, edge: 4 });
      });
    } else if (nd) {
      if (L.n === 1) {
        if (t === 'wardrobe') {
          const inner = w - 2 * th, dw = Math.floor((inner - 2 * (nd + 1)) / nd), dh = h - 2 * th - 4, hinges = calcHingePositions(dh);
          sheet({ name: 'Door', w: dw, h: dh, qty: nd, hinges, role: 'door', inset: true, note: 'Inset doors, ' + hinges.length + ' hinges each', edge: 4 });
        } else overlayDoors(w, h - 4);
      } else {
        const sizes = new Map();
        L.boxes.forEach(b => {
          const dw = t === 'wardrobe' ? Math.floor((b.w - 2 * th - 2 * (b.k + 1)) / b.k) : Math.floor((b.w - 4 - 3 * (b.k - 1)) / b.k);
          sizes.set(dw, (sizes.get(dw) || 0) + b.k);
        });
        const dh = t === 'wardrobe' ? h - 2 * th - 4 : h - 4, hinges = calcHingePositions(dh);
        [...sizes.entries()].sort((x, y) => y[0] - x[0]).forEach(([dw, qty], i) => sheet({ name: i ? 'Door ' + String.fromCharCode(65 + i) : 'Door', w: dw, h: dh, qty, hinges, role: 'door', inset: t === 'wardrobe', note: (t === 'wardrobe' ? 'Inset doors, ' : '') + hinges.length + ' hinges each, 35mm bore', edge: 4 }));
      }
    }
  } else if (t === 'kitchenbase') {
    const hc = h - 100, inner = w - 2 * th;
    sheet({ name: 'Left Side', w: d, h: hc, scribed: sc, role: 'side', edge: 1 });
    sheet({ name: 'Right Side', w: d, h: hc, scribed: sc, role: 'side', edge: 1 });
    sheet({ name: 'Bottom', w: inner, h: d - 20, role: 'bottom', edge: 1 });
    sheet({ name: 'Top Rail', w: inner, h: 100, qty: 2, role: 'top', note: 'Front and back rails under the worktop' });
    for (let i = 0; i < n; i++) sheet({ name: 'Shelf ' + (i + 1), w: inner, h: d - 20, role: 'shelf', edge: 1 });
    thin({ name: 'Back Panel', w: w - 4, h: hc - 4, role: 'back', note: '3mm, pinned on' });
    sheet({ name: 'Plinth', w: w - s * 2, h: 100, scribed: sc, role: 'plinth', edge: 1 });
    sheet({ name: 'Drawer Front', w: w - 4, h: 180, role: 'drawer', edge: 4 });
    sheet({ name: 'Drawer Side', w: d - 40, h: 150, qty: 2, role: 'drawer' });
    sheet({ name: 'Drawer Back', w: inner - 40, h: 150, role: 'drawer' });
    thin({ name: 'Drawer Base', w: inner - 36, h: d - 44, role: 'drawer', note: '6mm ply' }, 'ply6');
    overlayDoors(w, hc - 185);
  } else if (t === 'studwall' || t === 'partition') {
    const sec = th + 'x100 C16';
    const studCount = Math.floor(w / sp) + 1;
    lin({ name: 'Top Plate', w, h: th, section: sec, role: 'plate' });
    lin({ name: 'Bottom Plate', w, h: th, section: sec, role: 'plate' });
    lin({ name: 'Stud', w: th, h: h - 2 * th, qty: studCount, section: sec, role: 'stud' });
    const nogRows = Math.max(1, Math.floor((h - 2 * th) / 1200));
    lin({ name: 'Noggin', w: sp - th, h: th, qty: nogRows * (studCount - 1), section: sec, role: 'noggin' });
    if (t === 'partition') P.push({ stock: 'whole', kind: 'plaster', name: 'Plasterboard', w: 1200, h: 2400, qty: Math.ceil(w / 1200) * 2 * Math.max(1, Math.ceil(h / 2400)), role: 'board', note: 'Both sides' });
  } else if (t === 'flatroof') {
    const sec = th + 'x' + h + ' C16';
    const joists = Math.floor(d / sp) + 1;
    lin({ name: 'Joist', w, h, qty: joists, section: sec, role: 'joist' });
    P.push({ stock: 'whole', kind: 'deck', name: 'Deck Board', w: S.sheetW, h: S.sheetH, qty: Math.ceil((w * d) / (S.sheetW * S.sheetH)), role: 'board', note: '18mm ply' });
    lin({ name: 'Fascia', w: d, h: h + th + 20, qty: 1, section: '25x' + (h + th + 20) + ' timber', role: 'fascia' });
  } else if (t === 'floorjoists') {
    const sec = th + 'x' + h + ' C16';
    const joists = Math.floor(d / sp) + 1;
    lin({ name: 'Joist', w, h, qty: joists, section: sec, role: 'joist' });
    lin({ name: 'Header', w: d, h, qty: 2, section: sec, role: 'header' });
    const rows = Math.ceil(w / 1800) - 1;
    if (rows > 0) lin({ name: 'Herringbone Strut', w: Math.round(Math.hypot(sp - th, h - 20)), h: 50, qty: rows * 2 * (joists - 1), section: '50x50 timber', role: 'strut' });
    P.push({ stock: 'whole', kind: 'chip', name: 'Floor Board', w: 2400, h: 600, qty: Math.ceil((w * d) / (2400 * 600) * 1.05), role: 'board', note: '22mm T&G chipboard, 5% extra' });
  } else if (t === 'pitchedroof') {
    const rafters = Math.floor(w / sp) + 1;
    const rLen = Math.round(d / 2 / Math.cos(S.pitch * Math.PI / 180)) + 300;
    lin({ name: 'Rafter', w: rLen, h, qty: rafters * 2, section: th + 'x' + h + ' C16', role: 'rafter', note: 'Includes 300mm for the overhang' });
    lin({ name: 'Ridge Board', w, h: h + 50, section: '25x' + (h + 50) + ' timber', role: 'ridge' });
    lin({ name: 'Collar Tie', w: Math.round(d * 0.5), h: th, qty: Math.ceil(rafters / 2), section: th + 'x100 C16', role: 'collar' });
    lin({ name: 'Wall Plate', w, h: th, qty: 2, section: '100x' + th + ' treated', role: 'plate' });
    const feltArea = w * (rLen + 200) * 2;
    P.push({ stock: 'roll', name: 'Roofing Membrane', w: 1000, h: Math.ceil(feltArea / 1000), qty: 1, role: 'felt', area: feltArea / 1e6, note: '1m wide breathable membrane' });
  }

  // Apply manual overrides last
  P.forEach(p => {
    const o = S.overrides[p.name];
    if (!o) return;
    if (o.w) p.w = o.w;
    if (o.h) p.h = o.h;
    if (o.qty !== undefined) p.qty = o.qty;
    p.edited = true;
  });
  return P.filter(p => p.qty > 0 && p.w > 0 && p.h > 0);
}

// Guillotine packer. Tries several sort orders and split rules, keeps the layout
// with the fewest sheets (then the fullest last sheet). Rotation allowed (no grain lock).
function optimiseSheets(parts, sw, sh, kerf) {
  const all = [], oversize = [];
  parts.forEach(p => { for (let i = 0; i < p.qty; i++) all.push({ name: p.name, w: p.w, h: p.h }); });
  const rects = all.filter(r => {
    const fits = (r.w <= sw && r.h <= sh) || (r.h <= sw && r.w <= sh);
    if (!fits) oversize.push(r);
    return fits;
  });
  const orders = [
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => b.w * b.h - a.w * a.h,
    (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
    (a, b) => (b.w + b.h) - (a.w + a.h)
  ];
  let best = null;
  for (const ord of orders) for (const rule of ['short', 'long', 'area']) {
    const sheets = packGuillotine(rects.slice().sort(ord), sw, sh, kerf, rule);
    const last = sheets.length ? sheets[sheets.length - 1].rects.reduce((s, r) => s + r.w * r.h, 0) : 0;
    const score = sheets.length * 1e12 + last; // fewer sheets, then emptier last sheet (more reusable offcut)
    if (!best || score < best.score) best = { score, sheets };
  }
  return { sheets: best ? best.sheets : [], oversize };
}
function packGuillotine(rects, sw, sh, kerf, rule) {
  const sheets = [];
  rects.forEach(r => {
    for (const s of sheets) if (placeBest(s, r, kerf, rule)) return;
    const s = { rects: [], spaces: [{ x: 0, y: 0, w: sw, h: sh }] };
    placeBest(s, r, kerf, rule);
    sheets.push(s);
  });
  return sheets;
}
function placeBest(sheet, rect, kerf, rule) {
  let pick = null;
  sheet.spaces.forEach((sp, i) => {
    for (const rot of [false, true]) {
      const rw = rot ? rect.h : rect.w, rh = rot ? rect.w : rect.h;
      if (rw > sp.w || rh > sp.h) continue;
      const fit = Math.min(sp.w - rw, sp.h - rh); // best short side fit
      if (!pick || fit < pick.fit) pick = { i, rw, rh, fit };
    }
  });
  if (!pick) return false;
  const sp = sheet.spaces[pick.i], { rw, rh } = pick;
  sheet.rects.push({ name: rect.name, x: sp.x, y: sp.y, w: rw, h: rh });
  const lw = sp.w - rw - kerf, lh = sp.h - rh - kerf;
  // Decide whether the cut runs across (horizontal) or down (vertical)
  let horiz;
  if (rule === 'short') horiz = lw < lh;
  else if (rule === 'long') horiz = lw >= lh;
  else horiz = lw * sp.h < lh * sp.w; // keep the bigger free rectangle whole
  const ns = [];
  if (horiz) {
    if (lw > 10) ns.push({ x: sp.x + rw + kerf, y: sp.y, w: lw, h: rh });
    if (lh > 10) ns.push({ x: sp.x, y: sp.y + rh + kerf, w: sp.w, h: lh });
  } else {
    if (lw > 10) ns.push({ x: sp.x + rw + kerf, y: sp.y, w: lw, h: sp.h });
    if (lh > 10) ns.push({ x: sp.x, y: sp.y + rh + kerf, w: rw, h: lh });
  }
  sheet.spaces.splice(pick.i, 1, ...ns);
  return true;
}

// Pack timber into stock lengths per section size
function packLinear(parts, kerf) {
  const groups = {};
  parts.forEach(p => {
    const sec = p.section || 'timber';
    const stock = sec.includes('rail') ? 2400 : 4800;
    (groups[sec] = groups[sec] || { section: sec, stock, pieces: [], bins: [], long: [] });
    const len = Math.max(p.w, p.h);
    for (let i = 0; i < p.qty; i++) groups[sec].pieces.push({ name: p.name, len });
  });
  return Object.values(groups).map(g => {
    g.pieces.sort((a, b) => b.len - a.len);
    g.pieces.forEach(pc => {
      if (pc.len > g.stock) { g.long.push(pc); return; }
      const bin = g.bins.find(b => b.left >= pc.len);
      if (bin) { bin.cuts.push(pc); bin.left -= pc.len + kerf; } else g.bins.push({ cuts: [pc], left: g.stock - pc.len - kerf });
    });
    const m = g.section.match(/(\d+)x(\d+)/);
    const area = m ? (+m[1]) * (+m[2]) : 4700;
    g.unit = g.section.includes('rail') ? RAIL_PRICE : Math.max(4, TIMBER_BASE * area / 4700);
    g.longUnit = g.unit * 1.6; // longer lengths cost more per piece
    g.count = g.bins.length + g.long.length;
    g.cost = g.bins.length * g.unit + g.long.length * g.longUnit;
    return g;
  });
}

const FITTING_DB = {
  shelving: [{ name: 'Shelf pins', per: 'shelf', qty: 4, unit_cost: 0.15 }, { name: 'Wall fixing brackets', per: 'unit', qty: 4, unit_cost: 1.8 }],
  wardrobe: [{ name: 'Rail end sockets', per: 'rail', qty: 2, unit_cost: 0.8 }, { name: 'Shelf pins', per: 'shelf', qty: 4, unit_cost: 0.15 }, { name: 'Anti-tip wall brackets', per: 'unit', qty: 2, unit_cost: 1.8 }],
  kitchenbase: [{ name: 'Drawer runners 400mm (pair)', per: 'drawer', qty: 1, unit_cost: 8.5 }, { name: 'Plinth clips', per: 'unit', qty: 4, unit_cost: 0.6 }, { name: 'Adjustable legs', per: 'unit', qty: 4, unit_cost: 1.9 }, { name: 'Handles', per: 'handle', qty: 1, unit_cost: 2.8 }],
  kitchenwall: [{ name: 'Wall hanging brackets', per: 'unit', qty: 2, unit_cost: 3.5 }, { name: 'Shelf pins', per: 'shelf', qty: 4, unit_cost: 0.15 }, { name: 'Handles', per: 'handle', qty: 1, unit_cost: 2.8 }],
  eaves: [{ name: 'Shelf pins', per: 'shelf', qty: 4, unit_cost: 0.15 }, { name: 'Angle brackets 40mm', per: 'unit', qty: 6, unit_cost: 0.6 }, { name: 'Door knobs', per: 'handle', qty: 1, unit_cost: 2.8 }],
  understairs: [{ name: 'Shelf pins', per: 'shelf', qty: 4, unit_cost: 0.15 }, { name: 'Angle brackets 40mm', per: 'unit', qty: 4, unit_cost: 0.6 }, { name: 'Door knobs', per: 'handle', qty: 1, unit_cost: 2.8 }],
  studwall: [{ name: 'Framing nails 90mm', per: 'stud', qty: 4, unit_cost: 0.08 }, { name: 'Noggin nails 75mm', per: 'noggin', qty: 4, unit_cost: 0.06 }, { name: 'Frame fixings 100mm', per: 'unit', qty: 8, unit_cost: 0.45 }],
  partition: [{ name: 'Framing nails 90mm', per: 'stud', qty: 4, unit_cost: 0.08 }, { name: 'Plasterboard screws 32mm', per: 'plaster', qty: 28, unit_cost: 0.03 }, { name: 'Joint tape (m)', per: 'unit', qty: 10, unit_cost: 0.2 }],
  flatroof: [{ name: 'Joist hangers', per: 'joist', qty: 2, unit_cost: 2.2 }, { name: 'Ring-shank nails 65mm', per: 'board', qty: 20, unit_cost: 0.04 }, { name: 'Vapour control layer (m2)', per: 'area', qty: 1, unit_cost: 1.2 }],
  floorjoists: [{ name: 'Joist hangers', per: 'joist', qty: 2, unit_cost: 2.2 }, { name: 'Flooring screws 50mm', per: 'board', qty: 12, unit_cost: 0.04 }, { name: 'Flooring adhesive (tube)', per: 'unit', qty: 2, unit_cost: 6.5 }],
  pitchedroof: [{ name: 'Rafter brackets', per: 'rafter', qty: 1, unit_cost: 2.8 }, { name: 'Truss clips', per: 'rafter', qty: 1, unit_cost: 1.1 }, { name: 'Galvanised nails 75mm (kg)', per: 'unit', qty: 2, unit_cost: 6 }]
};

function calcFittings(parts) {
  const sum = (f) => parts.filter(f).reduce((s, p) => s + p.qty, 0);
  const nBox = layout().n;
  const cnt = {
    unit: nBox, shelf: sum(p => p.role === 'shelf'), rail: sum(p => p.role === 'rail'), drawer: sum(p => p.name === 'Drawer Front'),
    handle: sum(p => p.role === 'door') + sum(p => p.name === 'Drawer Front'),
    stud: sum(p => p.role === 'stud'), noggin: sum(p => p.role === 'noggin'), joist: sum(p => p.role === 'joist'),
    board: sum(p => p.stock === 'whole' && p.kind !== 'plaster'), plaster: sum(p => p.kind === 'plaster'), rafter: sum(p => p.role === 'rafter'),
    area: Math.ceil(S.w * S.d / 1e6)
  };
  // Joined boxes brace each other, so wall and floor fixings are 2 per box plus 2, not the full set each
  const perUnit = f => (f.per === 'unit' && nBox > 1 && /bracket|fixing/i.test(f.name) && !/hanging|anti-tip/i.test(f.name)) ? 2 * nBox + 2 : Math.ceil(f.qty * (cnt[f.per] ?? 1));
  const out = (FITTING_DB[S.template] || []).map(f => ({ ...f, total_qty: perUnit(f) })).filter(f => f.total_qty > 0);
  const hinges = parts.filter(p => p.hinges).reduce((s, p) => s + p.hinges.length * p.qty, 0);
  if (hinges) out.unshift({ name: 'Soft-close 35mm hinges', total_qty: hinges, unit_cost: 2.5, note: 'With mounting plates' });
  if (isCabinet(S.template)) {
    // Each box has four corner joints, each divider two
    const joints = 4 * nBox + 2 * sum(p => p.role === 'divider'), perJoint = Math.max(2, Math.ceil(S.d / 150));
    const f = joints * perJoint;
    if (S.joinery === 'screws') {
      out.push({ name: 'Wood screws 4x40mm', total_qty: f + 10, unit_cost: 0.05 });
      out.push({ name: 'Wood glue (PVA)', total_qty: 1, unit_cost: 6 });
    } else if (S.joinery === 'pocket') {
      out.push({ name: 'Pocket-hole screws 32mm', total_qty: f + 10, unit_cost: 0.08 });
      out.push({ name: 'Pocket-hole jig (buy once)', total_qty: 1, unit_cost: 25 });
      out.push({ name: 'Wood glue (PVA)', total_qty: 1, unit_cost: 6 });
    } else {
      out.push({ name: 'Cam lock and bolt sets', total_qty: f, unit_cost: 0.35 });
      out.push({ name: 'Wooden dowels 8x30mm', total_qty: f, unit_cost: 0.05 });
    }
    if (parts.some(p => p.role === 'back')) {
      // One pin every 150mm round each back and along every divider
      const backs = parts.filter(p => p.role === 'back'), divs = sum(p => p.role === 'divider');
      const pins = backs.reduce((a, p) => a + p.qty * Math.ceil(2 * (p.w + p.h) / 150), 0) + divs * Math.ceil((S.template === 'eaves' ? S.low : S.h) / 150);
      out.push({ name: 'Panel pins 25mm', total_qty: Math.ceil(pins * 1.1), unit_cost: 0.02 });
    }
    if (nBox > 1) out.push({ name: 'Cabinet connector screws', total_qty: (nBox - 1) * (S.h > 900 ? 4 : 3), unit_cost: 0.45, note: 'Join the boxes side by side, through both sides' });
    out.push({ name: 'Plastic packers (assorted)', total_qty: 1, unit_cost: 4, note: 'For levelling on uneven floors' });
  }
  return out.map(f => ({ ...f, total_cost: +(f.total_qty * f.unit_cost).toFixed(2) }));
}

function compute() {
  const parts = generateParts();
  const mainParts = parts.filter(p => p.stock === 'sheet');
  const res = { main: optimiseSheets(mainParts, S.sheetW, S.sheetH, S.kerf) };
  ['ply3', 'ply6'].forEach(k => { const ps = parts.filter(p => p.stock === k); if (ps.length) res[k] = optimiseSheets(ps, 2440, 1220, S.kerf); });
  const linear = packLinear(parts.filter(p => p.stock === 'linear'), S.kerf);
  const whole = parts.filter(p => p.stock === 'whole');
  const rolls = parts.filter(p => p.stock === 'roll').map(p => ({ ...p, rolls: Math.ceil(p.h / 10000) }));
  const fittings = calcFittings(parts);

  const mat = MATERIALS[S.material];
  const sheetPrice = S.priceSheet ?? mat.price;
  const nMain = res.main.sheets.length;
  const costs = {
    panels: isCabinet(S.template) ? nMain * sheetPrice : 0,
    thin: (res.ply3 ? res.ply3.sheets.length * THIN.ply3.price : 0) + (res.ply6 ? res.ply6.sheets.length * THIN.ply6.price : 0),
    timber: linear.reduce((s, g) => s + g.cost, 0),
    boards: whole.reduce((s, p) => s + p.qty * WHOLE[p.kind].price, 0),
    rolls: rolls.reduce((s, p) => s + p.rolls * FELT_ROLL, 0),
    hardware: fittings.reduce((s, f) => s + f.total_cost, 0),
    edging: isCabinet(S.template) ? 8 : 0,
    finish: isCabinet(S.template) ? 12 : 0,
    delivery: (DELIVERY.find(d => d.id === S.delivery) || DELIVERY[0]).p
  };
  const materials = costs.panels + costs.thin + costs.timber + costs.boards + costs.rolls;
  const total = Object.values(costs).reduce((a, b) => a + b, 0);
  const pieceCount = parts.reduce((s, p) => s + p.qty, 0);
  const usedArea = res.main.sheets.reduce((s, sh) => s + sh.rects.reduce((a, r) => a + r.w * r.h, 0), 0);
  const waste = nMain ? Math.max(0, 100 - usedArea / (nMain * S.sheetW * S.sheetH) * 100) : 0;
  R = { parts, sheets: res, linear, whole, rolls, fittings, sheetPrice, costs, materials, total, pieceCount, nMain, waste };
  return R;
}

// ───────────────────────── Drawings ─────────────────────────
// Returns shapes in SVG space (y down, mm units) for the front view
function cabinetShapes() {
  const t = S.template, th = S.thickness, W = S.w, H = S.h;
  const base = t === 'kitchenbase' ? 100 : 0, Hc = H - base;
  const L = layout(), sh = [];
  if (t === 'understairs') {
    // Front view, y measured down from the tall end
    const sg = stairGeom(), Y = y => H - y;
    L.boxes.forEach(b => {
      const x0 = b.x0, x1 = b.x0 + b.w;
      if (R.parts.some(p => p.role === 'back')) sh.push({ poly: [[x0 + th, Y(sg.topAt(x0 + th) - sg.tv)], [x1 - th, Y(sg.topAt(x1 - th) - sg.tv)], [x1 - th, Y(th)], [x0 + th, Y(th)]], c: 'bk', part: boxPart('Back Panel', b) });
      sh.push({ poly: [[x0, Y(sg.topAt(x0))], [x1, Y(sg.topAt(x1))], [x1, Y(sg.topAt(x1) - sg.tv)], [x0, Y(sg.topAt(x0) - sg.tv)]], c: 'p2', part: boxPart('Sloped Top', b) });
      sh.push({ x: x0 + th, y: Y(th), w: b.w - 2 * th, h: th, c: 'p2', part: boxPart('Bottom', b) });
    });
    L.verticals.forEach(v => {
      const top = sg.topAt(v.x + th / 2) - sg.tv, y0 = v.kind === 'divider' ? th : 0;
      sh.push({ x: v.x, y: Y(top), w: th, h: top - y0, c: 'p', part: v.name });
    });
    R.parts.filter(p => p.role === 'shelf').forEach(p => (p.bays || []).forEach(j => sh.push({ x: L.bays[j].x, y: Y(p.yc + th / 2), w: L.bayW, h: th, c: 'p2', part: p.name })));
    if (R.parts.some(p => p.role === 'door')) stairDoors().forEach((dr, i) => {
      const hx = dr.hingeLeft ? dr.x + dr.w - 50 : dr.x + 50;
      sh.push({ poly: [[dr.x, Y(dr.hl)], [dr.x + dr.w, Y(dr.hr)], [dr.x + dr.w, Y(2)], [dr.x, Y(2)]], c: 'dr', part: 'Door ' + (i + 1), handle: [hx, Y(Math.min(dr.hl, dr.hr) / 2)] });
    });
    return sh;
  }
  const has = name => R.parts.some(p => p.name === name || p.name.startsWith(name));
  L.boxes.forEach(b => {
    if (has('Back Panel')) sh.push(t === 'eaves' ? { x: b.x0 + th, y: H - S.low, w: b.w - 2 * th, h: S.low - th, c: 'bk', part: boxPart('Back Panel', b) } : { x: b.x0 + th, y: th, w: b.w - 2 * th, h: Hc - 2 * th, c: 'bk', part: boxPart('Back Panel', b) });
    if (t === 'kitchenbase') sh.push({ x: b.x0 + th, y: 0, w: b.w - 2 * th, h: th * 1.2, c: 'p2', part: 'Top Rail' });
    else sh.push({ x: b.x0 + th, y: 0, w: b.w - 2 * th, h: th, c: 'p2', part: boxPart(t === 'eaves' ? 'Sloped Top' : 'Top', b) });
    sh.push({ x: b.x0 + th, y: Hc - th, w: b.w - 2 * th, h: th, c: 'p2', part: boxPart('Bottom', b) });
  });
  L.verticals.forEach(v => {
    const part = v.name;
    sh.push(v.kind === 'divider' ? { x: v.x, y: th, w: th, h: Hc - 2 * th, c: 'p', part } : { x: v.x, y: 0, w: th, h: Hc, c: 'p', part });
  });
  R.parts.filter(p => p.role === 'shelf').forEach((p, i, arr) => {
    const yc = p.yc ?? (th + (Hc - 2 * th) * (i + 1) / (arr.length + 1));
    (p.bays ? p.bays.map(j => L.bays[j]) : L.bays).forEach(bay => sh.push({ x: bay.x, y: Hc - yc - th / 2, w: L.bayW, h: th, c: 'p2', part: p.name }));
  });
  if (base) sh.push({ x: 0, y: Hc, w: W, h: base, c: 'p', part: 'Plinth' });
  if (t === 'wardrobe') L.bays.forEach(bay => sh.push({ line: [bay.x + 20, th + 70, bay.x + L.bayW - 20, th + 70], c: 'rl', part: 'Hanging Rail' }));
  const drawer = R.parts.find(p => p.name === 'Drawer Front');
  if (drawer) sh.push({ x: 2, y: 2, w: W - 4, h: 180, c: 'dr', part: 'Drawer Front', handle: [W / 2, 60] });
  const doors = R.parts.filter(p => p.role === 'door');
  if (doors.length && L.n > 1) {
    // One door per compartment, each box on its own
    L.boxes.forEach(b => {
      for (let j = 0; j < b.k; j++) {
        const dw = doors[0].inset ? Math.floor((b.w - 2 * th - 2 * (b.k + 1)) / b.k) : Math.floor((b.w - 4 - 3 * (b.k - 1)) / b.k);
        const x = doors[0].inset ? b.x0 + th + 2 + j * (dw + 2) : b.x0 + 2 + j * (dw + 3), y = doors[0].inset ? th + 2 : 2;
        const part = (doors.find(p => p.w === dw) || doors[0]).name, hingeLeft = b.k === 1 ? b.i % 2 === 0 : j < b.k / 2;
        sh.push({ x, y, w: dw, h: doors[0].h, c: 'dr', part, handle: [hingeLeft ? x + dw - 50 : x + 50, y + Math.min(doors[0].h / 2, 900)] });
      }
    });
  } else if (doors.length) {
    const door = doors[0], n = door.qty;
    for (let i = 0; i < n; i++) {
      const x = door.inset ? th + 2 + i * (door.w + 2) : 2 + i * (door.w + 3);
      const y = door.inset ? th + 2 : (drawer ? 185 : 2);
      const hingeLeft = n === 1 ? true : i < n / 2;
      const hx = hingeLeft ? x + door.w - 50 : x + 50;
      sh.push({ x, y, w: door.w, h: door.h, c: 'dr', part: 'Door', handle: [hx, y + Math.min(door.h / 2, 900)] });
    }
  }
  return sh;
}

function frameShapes() {
  const t = S.template, th = S.thickness, W = S.w, H = S.h, sp = S.spacing;
  const sh = [];
  if (t === 'studwall' || t === 'partition') {
    sh.push({ x: 0, y: 0, w: W, h: th, c: 'p', part: 'Top Plate' });
    sh.push({ x: 0, y: H - th, w: W, h: th, c: 'p', part: 'Bottom Plate' });
    const count = Math.floor(W / sp) + 1;
    const rows = Math.max(1, Math.floor((H - 2 * th) / 1200));
    for (let i = 0; i < count; i++) {
      const x = Math.min(i * sp, W - th);
      sh.push({ x, y: th, w: th, h: H - 2 * th, c: 'p2', part: 'Stud' });
      if (i < count - 1) {
        for (let r = 1; r <= rows; r++) {
          const y = th + (H - 2 * th) * r / (rows + 1) + (i % 2 ? th : -th);
          sh.push({ x: x + th, y, w: Math.min(sp, W - x - th) - th, h: th, c: 'p', part: 'Noggin' });
        }
      }
    }
    if (t === 'partition') sh.push({ x: 0, y: 0, w: W, h: H, c: 'dr', part: 'Plasterboard' });
    return { sh, vw: W, vh: H };
  }
  if (t === 'flatroof' || t === 'floorjoists') {
    // Plan view: joists span W, laid across depth D
    const D = S.d;
    const count = Math.floor(D / sp) + 1;
    sh.push({ x: 0, y: 0, w: W, h: D, c: 'bk', part: t === 'flatroof' ? 'Deck Board' : 'Floor Board' });
    for (let i = 0; i < count; i++) sh.push({ x: 0, y: Math.min(i * sp, D - th), w: W, h: th, c: 'p2', part: 'Joist' });
    if (t === 'floorjoists') { sh.push({ x: 0, y: 0, w: th, h: D, c: 'p', part: 'Header' }); sh.push({ x: W - th, y: 0, w: th, h: D, c: 'p', part: 'Header' }); }
    else sh.push({ x: -th, y: 0, w: th, h: D, c: 'p', part: 'Fascia' });
    return { sh, vw: W, vh: D };
  }
  // Pitched roof: gable end
  const D = S.d, rise = Math.tan(S.pitch * Math.PI / 180) * D / 2;
  const Hh = rise + S.h + 120;
  const r = S.h / Math.cos(S.pitch * Math.PI / 180);
  sh.push({ poly: [[0, Hh], [D / 2, Hh - rise], [D / 2, Hh - rise - r], [0, Hh - r]], c: 'p2', part: 'Rafter' });
  sh.push({ poly: [[D, Hh], [D / 2, Hh - rise], [D / 2, Hh - rise - r], [D, Hh - r]], c: 'p2', part: 'Rafter' });
  sh.push({ x: D / 2 - 12, y: Hh - rise - r - 50, w: 25, h: S.h + 50, c: 'p', part: 'Ridge Board' });
  const cy = Hh - rise / 3;
  sh.push({ x: D / 6, y: cy - th, w: D * 2 / 3, h: th, c: 'p', part: 'Collar Tie' });
  sh.push({ x: -50, y: Hh, w: 100 + th, h: th, c: 'p', part: 'Wall Plate' });
  sh.push({ x: D - 50 - th, y: Hh, w: 100 + th, h: th, c: 'p', part: 'Wall Plate' });
  return { sh, vw: D, vh: Hh + th };
}

function shapesSVG(sh, hl) {
  const on = hl && hl.size;
  return sh.map(s => {
    const k = on ? (hl.has(s.part) ? ' hl' : ' fade') : '';
    const ve = ' vector-effect="non-scaling-stroke"';
    if (s.line) return `<line class="${s.c}${k}" x1="${s.line[0]}" y1="${s.line[1]}" x2="${s.line[2]}" y2="${s.line[3]}"${ve}/>`;
    if (s.poly) return `<polygon class="${s.c}${k}" points="${s.poly.map(p => p.join(',')).join(' ')}"${ve}/>` + (s.handle ? `<circle class="hd${k}" cx="${s.handle[0]}" cy="${s.handle[1]}" r="${Math.max(10, S.w / 120)}"/>` : '');
    let o = `<rect class="${s.c}${k}" x="${s.x}" y="${s.y}" width="${Math.max(0, s.w)}" height="${Math.max(0, s.h)}"${ve}/>`;
    if (s.handle) o += `<circle class="hd${k}" cx="${s.handle[0]}" cy="${s.handle[1]}" r="${Math.max(10, S.w / 120)}"/>`;
    return o;
  }).join('');
}

function dimLine(x1, y1, x2, y2, label, fs) {
  const vert = x1 === x2, tick = fs * 0.5;
  let s = `<line class="dim" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" vector-effect="non-scaling-stroke"/>`;
  s += vert
    ? `<line class="dim" x1="${x1 - tick}" y1="${y1}" x2="${x1 + tick}" y2="${y1}" vector-effect="non-scaling-stroke"/><line class="dim" x1="${x2 - tick}" y1="${y2}" x2="${x2 + tick}" y2="${y2}" vector-effect="non-scaling-stroke"/>`
    : `<line class="dim" x1="${x1}" y1="${y1 - tick}" x2="${x1}" y2="${y1 + tick}" vector-effect="non-scaling-stroke"/><line class="dim" x1="${x2}" y1="${y2 - tick}" x2="${x2}" y2="${y2 + tick}" vector-effect="non-scaling-stroke"/>`;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  s += vert
    ? `<text class="dimt" x="${mx - fs * 0.6}" y="${my}" font-size="${fs}" text-anchor="middle" transform="rotate(-90 ${mx - fs * 0.6} ${my})">${esc(label)}</text>`
    : `<text class="dimt" x="${mx}" y="${my - fs * 0.5}" font-size="${fs}" text-anchor="middle">${esc(label)}</text>`;
  return s;
}

// mode: 'elev' (dimensioned drawing), 'photo' (bare unit for overlay), 'fig' (build step, highlights)
function elevationSVG(mode = 'elev', hl = null) {
  const cab = isCabinet(S.template);
  let sh, vw, vh;
  if (cab) { sh = cabinetShapes(); vw = S.w; vh = S.h; } else ({ sh, vw, vh } = frameShapes());
  if (mode === 'photo' || mode === 'solid') {
    return `<svg viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none" class="on-photo${mode === 'solid' ? ' solid' : ''}" aria-hidden="true">${shapesSVG(sh, null)}</svg>`;
  }
  const big = Math.max(vw, vh);
  const fs = big / 32, pad = fs * 3.4;
  let extraW = 0, side = '';
  if (S.template === 'eaves' && mode !== 'photo') {
    const ox = vw + pad * 1.6, D = S.d, L = S.low, H = S.h;
    extraW = pad * 1.6 + D;
    const k = hl && hl.size ? (hl.has('Left Side') ? ' hl' : ' fade') : '';
    side = `<polygon class="p${k}" points="${ox},0 ${ox + D},${H - L} ${ox + D},${H} ${ox},${H}" vector-effect="non-scaling-stroke"/>`;
    side += `<text class="cap" x="${ox + D / 2}" y="${H + fs * 1.8}" font-size="${fs}" text-anchor="middle">Side view</text>`;
    if (mode === 'elev') side += dimLine(ox + D + fs * 1.4, H - L, ox + D + fs * 1.4, H, fmt(L), fs) + dimLine(ox, H + fs * 3.6, ox + D, H + fs * 3.6, fmt(D), fs);
  }
  const x0 = -pad, y0 = -pad, W = vw + extraW + pad * 2, Hh = vh + pad * 2 + (S.template === 'eaves' ? fs * 3 : 0);
  let svg = `<svg class="elev" viewBox="${x0} ${y0} ${W} ${Hh}" role="img" aria-label="${esc(designName())} drawing">`;
  svg += `<rect class="bg" x="${x0}" y="${y0}" width="${W}" height="${Hh}"/>`;
  svg += shapesSVG(sh, hl) + side;
  if (mode === 'elev') {
    const isPlan = S.template === 'flatroof' || S.template === 'floorjoists';
    svg += dimLine(0, -pad * 0.45, vw, -pad * 0.45, fmt(vw), fs);
    svg += dimLine(-pad * 0.45, 0, -pad * 0.45, vh, isPlan ? fmt(S.d) : fmt(vh), fs);
  }
  return svg + '</svg>';
}

// ───────────────────────── 3D view ─────────────────────────
function solids() {
  const t = S.template, th = S.thickness, W = S.w, H = S.h, D = S.d;
  const out = [];
  const box = (x, y, z, w, h, d, col) => {
    const v = [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z], [x, y, z + d], [x + w, y, z + d], [x + w, y + h, z + d], [x, y + h, z + d]];
    out.push({ v, f: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 3, 7, 4], [1, 2, 6, 5]], col });
  };
  const prismX = (x0, x1, prof, col) => { // prof: [[y,z]...] extruded along x
    const n = prof.length, v = [];
    prof.forEach(([y, z]) => v.push([x0, y, z]));
    prof.forEach(([y, z]) => v.push([x1, y, z]));
    const f = [prof.map((_, i) => i), prof.map((_, i) => n + i)];
    for (let i = 0; i < n; i++) f.push([i, (i + 1) % n, n + (i + 1) % n, n + i]);
    out.push({ v, f, col });
  };
  // Any 8-corner solid with box topology (a sloping slab, a door with an angled top)
  const hexa = (v, col) => out.push({ v, f: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 3, 7, 4], [1, 2, 6, 5]], col });
  if (isCabinet(t)) {
    const base = t === 'kitchenbase' ? 100 : 0, Hc = H - base, Lay = layout();
    const prof = [[0, 0], [H, 0], [S.low, D], [0, D]], c = t === 'eaves' ? (Math.cos(eavesGeom().ang) || 1) : 1;
    if (t === 'understairs') {
      const sg = stairGeom();
      Lay.verticals.forEach(v => { const top = sg.topAt(v.x + th / 2) - sg.tv, y0 = v.kind === 'divider' ? th : 0; box(v.x, y0, 0, th, top - y0, D, 'panel'); });
      Lay.boxes.forEach(b => {
        const x0 = b.x0, x1 = b.x0 + b.w, a = sg.topAt(x0), z = sg.topAt(x1);
        hexa([[x0, a - sg.tv, 0], [x1, z - sg.tv, 0], [x1, z, 0], [x0, a, 0], [x0, a - sg.tv, D], [x1, z - sg.tv, D], [x1, z, D], [x0, a, D]], 'panel2');
        box(x0 + th, 0, 0, b.w - 2 * th, th, D, 'panel2');
      });
      R.parts.filter(p => p.role === 'shelf').forEach(p => (p.bays || []).forEach(j => box(Lay.bays[j].x, p.yc - th / 2, 0, Lay.bayW, th, p.h, 'shelf')));
    } else {
    Lay.verticals.forEach(v => {
      if (v.kind === 'divider') {
        if (t === 'eaves') prismX(v.x, v.x + th, [[th, 0], [H - th / c, 0], [S.low - th / c, D], [th, D]], 'panel');
        else box(v.x, base + th, 0, th, Hc - 2 * th, D, 'panel');
      } else if (t === 'eaves') prismX(v.x, v.x + th, prof, 'panel');
      else box(v.x, base, 0, th, Hc, D, 'panel');
    });
    Lay.boxes.forEach(b => {
      if (t === 'eaves') prismX(b.x0 + th, b.x0 + b.w - th, [[H, 0], [S.low, D], [S.low - th, D], [H - th, 0]], 'panel2');
      else box(b.x0 + th, H - th, 0, b.w - 2 * th, th, D, 'panel2');
      box(b.x0 + th, base, 0, b.w - 2 * th, th, D - (t === 'kitchenbase' ? 20 : 0), 'panel2');
    });
    R.parts.filter(p => p.role === 'shelf').forEach((p, i, arr) => {
      const yc = p.yc ?? (th + (Hc - 2 * th) * (i + 1) / (arr.length + 1));
      Lay.bays.forEach(bay => box(bay.x, base + yc - th / 2, 0, Lay.bayW, th, Math.min(D, p.h), 'shelf'));
    });
    }
    if (base) box(0, 0, 20, W, base, th, 'panel');
  } else if (t === 'studwall' || t === 'partition') {
    const sp = S.spacing, cnt = Math.floor(W / sp) + 1;
    box(0, 0, 0, W, th, 100, 'panel'); box(0, H - th, 0, W, th, 100, 'panel');
    for (let i = 0; i < cnt; i++) box(Math.min(i * sp, W - th), th, 0, th, H - 2 * th, 100, 'panel2');
  } else if (t === 'flatroof' || t === 'floorjoists') {
    const sp = S.spacing, cnt = Math.floor(S.d / sp) + 1;
    for (let i = 0; i < cnt; i++) box(0, 0, Math.min(i * sp, S.d - th), W, H, th, 'panel2');
  } else {
    const sp = S.spacing, cnt = Math.min(30, Math.floor(W / sp) + 1), rise = Math.tan(S.pitch * Math.PI / 180) * S.d / 2;
    for (let i = 0; i < cnt; i++) {
      const x = Math.min(i * sp, W - th);
      prismX(x, x + th, [[0, 0], [rise, S.d / 2], [rise + S.h, S.d / 2], [S.h, 0]], 'panel2');
      prismX(x, x + th, [[0, S.d], [rise, S.d / 2], [rise + S.h, S.d / 2], [S.h, S.d]], 'panel2');
    }
  }
  return out;
}

function draw3D(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth, chh = canvas.clientHeight;
  canvas.width = cw * dpr; canvas.height = chh * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const col = n => css.getPropertyValue(n).trim();
  const COLORS = { panel: col('--el-panel'), panel2: col('--el-panel-2'), shelf: col('--el-panel-2') };
  const edge = col('--el-edge');
  ctx.fillStyle = col('--surface'); ctx.fillRect(0, 0, cw, chh);
  const sol = solids();
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  sol.forEach(s => s.v.forEach(([x, y, z]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }));
  const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2, cz0 = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const sc = Math.min(cw, chh) * 0.62 / span;
  const ax = S.drag3d.rx * Math.PI / 180, ay = S.drag3d.ry * Math.PI / 180;
  const cX = Math.cos(ax), sX = Math.sin(ax), cY = Math.cos(ay), sY = Math.sin(ay);
  const rot = ([x, y, z]) => {
    x -= cx0; y -= cy0; z -= cz0;
    const x1 = x * cY - z * sY, z1 = x * sY + z * cY;
    const y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
    return [x1, y1, z2];
  };
  const light = [0.35, 0.6, -0.72];
  const faces = [];
  sol.forEach(s => {
    const rv = s.v.map(rot);
    const cen = rv.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map(c => c / rv.length);
    s.f.forEach(f => {
      const fc = f.reduce((a, i) => [a[0] + rv[i][0], a[1] + rv[i][1], a[2] + rv[i][2]], [0, 0, 0]).map(c => c / f.length);
      const nrm = [fc[0] - cen[0], fc[1] - cen[1], fc[2] - cen[2]];
      const len = Math.hypot(...nrm) || 1;
      const nn = nrm.map(c => c / len);
      if (nn[2] > 0.02) return; // facing away (viewer at -z)
      const shade = 0.55 + 0.45 * Math.max(0, nn[0] * light[0] + nn[1] * light[1] + nn[2] * light[2]);
      faces.push({ pts: f.map(i => [cw / 2 + rv[i][0] * sc, chh / 2 - rv[i][1] * sc]), z: fc[2], shade, col: COLORS[s.col] || COLORS.panel });
    });
  });
  faces.sort((a, b) => b.z - a.z);
  ctx.lineJoin = 'round';
  faces.forEach(f => {
    ctx.beginPath();
    f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = f.col; ctx.fill();
    ctx.fillStyle = `rgba(0,0,0,${(1 - f.shade) * 0.55})`; ctx.fill();
    ctx.strokeStyle = edge; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
  });
}

function bind3D(canvas) {
  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    S.drag3d.ry += (e.clientX - drag.x) * 0.5;
    S.drag3d.rx = clamp(S.drag3d.rx + (e.clientY - drag.y) * 0.5, -85, 85);
    drag = { x: e.clientX, y: e.clientY };
    draw3D(canvas);
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  draw3D(canvas);
}

// ───────────────────────── Photo overlay ─────────────────────────
function unitAspect() {
  if (isCabinet(S.template)) return S.w / S.h;
  const { vw, vh } = frameShapes();
  return vw / vh;
}
function unitWidthMM() { return isCabinet(S.template) || S.template === 'studwall' || S.template === 'partition' ? S.w : S.template === 'pitchedroof' ? S.d : S.w; }

function ensureOverlay() {
  if (!S.photo) return;
  if (!S.fracPerMM) S.fracPerMM = 0.55 / unitWidthMM();
  if (!S.ov) S.ov = { x: 0.22, yb: 0.92 };
  // keep the unit inside the photo vertically
  const p = S.photo, wf = unitWidthMM() * S.fracPerMM;
  const hf = wf / unitAspect() * (p.w / p.h);
  if (hf > 0.95) S.fracPerMM *= 0.95 / hf;
}

function placeOverlay(box, cfg) {
  const wf = cfg.wf(), hf = wf / cfg.aspect() * (cfg.imgW / cfg.imgH);
  const o = cfg.pos();
  box.style.left = (o.x * 100) + '%';
  box.style.top = ((o.yb - hf) * 100) + '%';
  box.style.width = (wf * 100) + '%';
  box.style.height = (hf * 100) + '%';
}

function setCompare(root, pct) {
  const layer = root.querySelector('[data-layer]');
  layer.style.clipPath = `inset(0 0 0 ${pct}%)`;
  root.style.setProperty('--cmp', pct + '%');
}

function makeEditable(root, box, cfg) {
  box.classList.add('editable');
  const handle = document.createElement('span');
  handle.className = 'ov-resize';
  handle.setAttribute('aria-hidden', 'true');
  const hint = document.createElement('span');
  hint.className = 'ov-move';
  hint.textContent = 'Drag to place';
  box.append(handle, hint);
  let st = null;
  const down = (mode) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = root.getBoundingClientRect();
    st = { mode, x: e.clientX, y: e.clientY, r, ov: { ...S.ov }, frac: S.fracPerMM };
    (mode === 'move' ? box : handle).setPointerCapture(e.pointerId);
    hint.hidden = true;
  };
  box.addEventListener('pointerdown', down('move'));
  handle.addEventListener('pointerdown', down('size'));
  const move = (e) => {
    if (!st) return;
    const dx = (e.clientX - st.x) / st.r.width, dy = (e.clientY - st.y) / st.r.height;
    if (st.mode === 'move') {
      S.ov.x = clamp(st.ov.x + dx, -0.5, 0.95);
      S.ov.yb = clamp(st.ov.yb + dy, 0.05, 1.5);
    } else {
      const wf0 = unitWidthMM() * st.frac;
      const wf = clamp(wf0 + dx, 0.05, 2);
      S.fracPerMM = wf / unitWidthMM(); // resizing recalibrates scale
    }
    placeOverlay(box, cfg);
    updateScaleNote();
  };
  const up = () => { if (st) { st = null; saveDraft(); } };
  box.addEventListener('pointermove', move); handle.addEventListener('pointermove', move);
  box.addEventListener('pointerup', up); handle.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up); handle.addEventListener('pointercancel', up);
}

function updateScaleNote() {
  const el = $('#scaleNote');
  if (!el || !S.photo) return;
  el.textContent = S.measured ? 'Scaled from your measurements. Drag the corner to fine-tune.' : 'Drag to place, pull the orange corner to size it.';
}

// ───────────────────────── Views ─────────────────────────
function setView(view, step) {
  S.view = view;
  if (step !== undefined) S.step = clamp(step, 0, 4);
  document.body.dataset.view = view;
  $('#view-home').hidden = view !== 'home';
  $('#view-plan').hidden = view !== 'plan';
  const want = view === 'plan' ? '#plan-' + (S.step + 1) : '';
  if (view === 'plan' && location.hash !== want) history.pushState(null, '', want);
  if (view === 'home' && location.hash.startsWith('#plan')) history.pushState(null, '', location.pathname + location.search);
  render();
  window.scrollTo(0, 0);
}

function render() {
  compute();
  if (S.view === 'home') { renderHome(); return; }
  $('#projectName').value = S.name;
  $$('[data-action="unit"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === S.unit)));
  renderStepper();
  const wide = S.step >= 2;
  $('#plan').classList.toggle('wide', wide);
  $('#pageCol').hidden = !wide;
  if (wide) {
    $('#pageCol').innerHTML = [renderCutPage, renderBuildPage, renderOrderPage][S.step - 2]();
    afterPage();
  } else {
    $('#pageCol').innerHTML = '';
    renderStage();
    renderControls();
  }
  renderBar();
}

function renderStepper() {
  $('#stepper').innerHTML = STEP_NAMES.map((n, i) => `<li><button type="button" class="step-btn${i < S.step ? ' done' : ''}" data-action="goto" data-step="${i}"${i === S.step ? ' aria-current="step"' : ''}><span class="n">${i < S.step ? '<i class="ph ph-check" aria-hidden="true"></i>' : i + 1}</span>${n}</button></li>`).join('');
  const cur = $('#stepper [aria-current]');
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function renderBar() {
  const labels = ['Design it', 'See the cut list', 'How to build it', 'Order materials', 'Download order pack'];
  $('#nextBtn span').textContent = labels[S.step];
  $('[data-action="prev"]').disabled = false;
  $('#barSum').innerHTML = `<span class="bs-long"><strong>${R.pieceCount}</strong> parts, <strong>${R.nMain || R.linear.reduce((s, g) => s + g.count, 0)}</strong> ${R.nMain ? 'sheets' : 'lengths'}, </span><span class="bs-about">about </span><strong>${gbp0(R.total)}</strong>`;
}

// ── Stage (steps 1 and 2) ──
function renderStage() {
  const col = $('#stageCol');
  if (S.stage === 'photo' && !S.photo) S.stage = 'drawing';
  const meta = isCabinet(S.template) ? `${fmt(S.w)} x ${fmt(S.h)} x ${fmt(S.d)}` : `${fmt(S.w)} x ${fmt(S.template === 'studwall' || S.template === 'partition' ? S.h : S.d)}`;
  col.innerHTML = `
    <div class="stage-head">
      <div><div class="stage-title">${esc(designName())}</div><div class="stage-meta">${esc(meta)}</div></div>
      <div class="seg" role="group" aria-label="Preview">
        <button type="button" data-action="stage" data-value="photo" aria-pressed="${S.stage === 'photo'}"${S.photo ? '' : ' disabled title="Add a photo first"'}>On photo</button>
        <button type="button" data-action="stage" data-value="drawing" aria-pressed="${S.stage === 'drawing'}">Drawing</button>
        <button type="button" data-action="stage" data-value="3d" aria-pressed="${S.stage === '3d'}">3D</button>
      </div>
    </div>
    <div class="stage-box" id="stageBox"></div>
    <div class="stage-foot" id="stageFoot"></div>`;
  const box = $('#stageBox'), foot = $('#stageFoot');
  if (S.stage === 'photo') {
    ensureOverlay();
    box.innerHTML = `<div class="compare" id="planCompare"><img class="compare-img" alt="Your photo" src="${esc(S.photo.url)}"><div class="compare-layer" data-layer><div class="ov-box" id="planOverlay"></div></div><div class="compare-handle" aria-hidden="true"><span><i class="ph ph-arrows-left-right"></i></span></div></div>`;
    const root = $('#planCompare'), ovb = $('#planOverlay');
    root.style.aspectRatio = `${S.photo.w} / ${S.photo.h}`;
    ovb.innerHTML = elevationSVG('photo');
    const cfg = { wf: () => unitWidthMM() * S.fracPerMM, aspect: unitAspect, imgW: S.photo.w, imgH: S.photo.h, pos: () => S.ov };
    placeOverlay(ovb, cfg);
    makeEditable(root, ovb, cfg);
    foot.innerHTML = `<label class="sr-only" for="cmpRange">Before and after</label><span>Before</span><input id="cmpRange" type="range" min="0" max="100" value="${100 - S.cmp}" data-field="cmp" class="grow"><span>After</span><span id="scaleNote"></span>`;
    applyCmp();
    updateScaleNote();
  } else if (S.stage === '3d') {
    box.innerHTML = `<canvas id="canvas3d" aria-label="3D model, drag to rotate"></canvas>`;
    const c = $('#canvas3d');
    c.style.height = Math.min(520, Math.max(300, box.clientWidth * 0.7)) + 'px';
    bind3D(c);
    foot.innerHTML = `<span><i class="ph ph-hand-tap" aria-hidden="true"></i> Drag to turn it around.</span>${isCabinet(S.template) ? '<span>Doors are hidden so you can see inside.</span>' : ''}`;
  } else {
    box.innerHTML = elevationSVG('elev');
    foot.innerHTML = S.photo
      ? `<button type="button" class="chip" data-action="stage" data-value="photo"><i class="ph ph-image" aria-hidden="true"></i>See it on your photo</button>`
      : `<button type="button" class="chip" data-action="open-tips"><i class="ph ph-camera" aria-hidden="true"></i>Add a photo to see it in your room</button>`;
  }
}
function applyCmp() {
  const root = $('#planCompare');
  if (!root) return;
  const r = $('#cmpRange');
  const after = r ? Number(r.value) : 100; // 100 = fully "after"
  setCompare(root, 100 - after);
}

// ── Controls ──
function inchHelp(k) { return S.unit === 'in' && k !== 'shelves' && k !== 'pitch' ? ` = ${mm2in(S[k])} in` : ''; }

function renderControls() {
  const col = $('#ctlCol');
  if (S.step === 0) {
    const cab = TEMPLATES.filter(t => t.kind === 'cabinet'), fr = TEMPLATES.filter(t => t.kind === 'frame');
    const tpl = t => `<button type="button" class="tpl" data-action="template" data-template="${t.id}" aria-pressed="${S.template === t.id}"><i class="ph ph-${t.icon}" aria-hidden="true"></i>${esc(t.name)}</button>`;
    col.innerHTML = `
      <div class="group">
        <h2 class="group-title">What are you making?</h2>
        <div class="tpl-grid">${cab.map(tpl).join('')}<div class="tpl-sep">Building work</div>${fr.map(tpl).join('')}</div>
        ${isCabinet(S.template) ? `<div class="field full"><span class="lbl" id="styleLbl">Style</span><div class="seg" role="group" aria-labelledby="styleLbl"><button type="button" data-action="style" data-value="doors" aria-pressed="${doorCount() > 0}">With doors</button><button type="button" data-action="style" data-value="open" aria-pressed="${doorCount() === 0}">Open shelves</button></div></div>` : ''}
      </div>
      <div class="group">
        <h2 class="group-title">Your space</h2>
        ${photoBlock()}
        ${isCabinet(S.template) ? `<div class="field full"><span class="lbl" id="siteLbl">Where is it going?</span><div class="seg" role="group" aria-labelledby="siteLbl">${Object.entries(SITES).map(([k, v]) => `<button type="button" data-action="site" data-value="${k}" aria-pressed="${(S.site || 'upstairs') === k}">${v.name}</button>`).join('')}</div><span class="help">${esc((SITES[S.site] || SITES.upstairs).note)}. Panels up to ${fmt((SITES[S.site] || SITES.upstairs).carry)} long can usually be carried in, so longer units are built as separate boxes.</span></div>` : ''}
      </div>
      <div class="group">
        <h2 class="group-title">Measurements</h2>
        <p class="group-sub">In millimetres. Measure in two or three places and use the smallest.</p>
        <div class="fields">${fieldsFor(S.template).map(([k, label, help]) => numField(k, label, help, k === 'pitch' ? 'deg' : 'mm')).join('')}</div>
        ${S.template === 'understairs' ? `<div class="field full"><span class="lbl" id="handLbl">Tall end</span><div class="seg" role="group" aria-labelledby="handLbl"><button type="button" data-action="hand" data-value="left" aria-pressed="${S.hand === 'left'}">On the left</button><button type="button" data-action="hand" data-value="right" aria-pressed="${S.hand !== 'left'}">On the right</button></div><span class="help">Stand facing the space. Which end is under the top of the stairs?</span></div><div class="callout"><i class="ph ph-info" aria-hidden="true"></i><span>The stairs slope at <strong>${stairGeom().angDeg} deg</strong>. Each upright, the top and the doors are cut to follow it.</span></div><div class="callout warn"><i class="ph ph-warning" aria-hidden="true"></i><span>Keep a gas meter, fuse box or stopcock under the stairs easy to reach. If the stairs are your escape route in a house with three or more storeys, the cupboard may need fire-resisting linings and doors (Approved Document B). Check with Building Control.</span></div>` : ''}
        ${S.template === 'eaves' ? `<div class="callout"><i class="ph ph-info" aria-hidden="true"></i><span>Roof angle works out at <strong>${eavesGeom().angDeg} deg</strong>. The side panels are cut to follow it.</span></div>` : ''}
        ${STRUCTURAL.has(S.template) ? `<div class="callout warn"><i class="ph ph-hard-hat" aria-hidden="true"></i><span><strong>Structural work.</strong> Needs Building Regulations approval and timber sizes checked by an engineer. Use this to estimate and brief your builder.</span></div>` : ''}
      </div>`;
  } else {
    const cab = isCabinet(S.template);
    const nd = doorCount();
    col.innerHTML = cab ? `
      <div class="group">
        <h2 class="group-title">Material</h2>
        <div class="field full">
          <label for="f-material">Board</label>
          <select id="f-material" class="input" data-field="material">${Object.entries(MATERIALS).filter(([k]) => k !== 'c16').map(([k, m]) => `<option value="${k}"${S.material === k ? ' selected' : ''}>${esc(m.name)} ${m.thick}mm</option>`).join('')}</select>
          <span class="help">${esc(MATERIALS[S.material].note)}</span>
        </div>
      </div>
      <div class="group">
        <h2 class="group-title">Layout</h2>
        <div class="fields">
          <div class="field">
            <label for="f-doors">Doors</label>
            <select id="f-doors" class="input" data-field="doors">
              <option value="auto"${S.doors === 'auto' ? ' selected' : ''}>Suggested (${nd})</option>
              ${[0, 1, 2, 3, 4].map(n => `<option value="${n}"${S.doors === n ? ' selected' : ''}>${n === 0 ? 'No doors' : n + (n === 1 ? ' door' : ' doors')}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="steppers">
          ${BAY_TEMPLATES.has(S.template) ? stepper('compartments', 'Compartments side by side', 'Upright dividers split the unit into bays') : ''}
          ${stepper('shelves', BAY_TEMPLATES.has(S.template) ? 'Shelves in each compartment' : 'Shelves', BAY_TEMPLATES.has(S.template) ? 'Not counting the top and bottom' : 'Not counting the top and bottom')}
          ${BAY_TEMPLATES.has(S.template) ? boxesControl() : ''}
          ${layoutPreview()}
        </div>
        ${S.template === 'eaves' && R.parts.filter(p => p.role === 'shelf').length < S.shelves ? `<div class="callout warn"><i class="ph ph-warning" aria-hidden="true"></i><span>Some shelves would sit too close to the slope, so we left them out.</span></div>` : ''}
      </div>
      <div class="group">
        <h2 class="group-title">How it joins</h2>
        <div class="seg" role="group" aria-label="Joinery">${Object.entries(JOINERY).map(([k, j]) => `<button type="button" data-action="joinery" data-value="${k}" aria-pressed="${S.joinery === k}">${j.short}</button>`).join('')}</div>
        <p class="group-sub">${esc(JOINERY[S.joinery].note)}</p>
      </div>
      <div class="group">${safetyHTML()}</div>
      <div class="group">
        <label class="check"><input type="checkbox" data-field="scribe"${S.scribe ? ' checked' : ''}><span>Leave 2mm to scribe against walls<small>Walls are never straight. Trim the edge to fit with a plane.</small></span></label>
        <details class="more">
          <summary>Sheet size and saw blade</summary>
          <div class="fields">
            ${numField('sheetW', 'Sheet length', '', 'mm')}${numField('sheetH', 'Sheet width', '', 'mm')}
            ${numField('thickness', 'Board thickness', '', 'mm')}${numField('kerf', 'Saw kerf', 'Blade width, usually 3', 'mm')}
          </div>
        </details>
      </div>` : `
      <div class="group">
        <h2 class="group-title">Timber</h2>
        <div class="fields">${numField('thickness', 'Timber thickness', 'C16 is usually 38 or 47', 'mm')}${numField('spacing', 'Centres', 'Usually 400 or 600', 'mm')}</div>
        <div class="callout"><i class="ph ph-info" aria-hidden="true"></i><span>We pack pieces into 4.8m lengths to keep offcuts down.</span></div>
      </div>
      <details class="more"><summary>Saw blade</summary><div class="fields">${numField('kerf', 'Saw kerf', 'Blade width, usually 3', 'mm')}</div></details>`;
  }
}

// Big +/- control: no keyboard needed, and the number can't land in the wrong box
function stepper(k, label, help) {
  const lim = LIMITS[k], v = Math.round(S[k] || 0);
  return `<div class="count-field"><span class="lbl" id="lbl-${k}">${esc(label)}</span>
    <div class="count-step" role="group" aria-labelledby="lbl-${k}">
      <button type="button" data-action="step" data-k="${k}" data-d="-1" aria-label="One fewer"${v <= lim[0] ? ' disabled' : ''}><i class="ph ph-minus" aria-hidden="true"></i></button>
      <output aria-live="polite">${v}</output>
      <button type="button" data-action="step" data-k="${k}" data-d="1" aria-label="One more"${v >= lim[1] ? ' disabled' : ''}><i class="ph ph-plus" aria-hidden="true"></i></button>
    </div><span class="help">${esc(help)}</span></div>`;
}

// How many separate boxes the unit is built from. Auto keeps each box within maxBox().
function boxesControl() {
  const L = layout(), auto = S.boxes === 'auto' || S.boxes == null;
  const site = SITES[S.site] || SITES.upstairs;
  const help = auto ? `Auto: each box is ${fmt(maxBox())} or less, so its panels can be carried in (${site.name.toLowerCase()}) and cut from one sheet` : `${L.n === 1 ? 'One box' : L.n + ' boxes'}, chosen by you`;
  return `<div class="count-field"><span class="lbl" id="lbl-boxes">Built as separate boxes</span>
    <div class="count-step" role="group" aria-labelledby="lbl-boxes">
      <button type="button" data-action="step" data-k="boxes" data-d="-1" aria-label="One fewer box"${L.n <= 1 ? ' disabled' : ''}><i class="ph ph-minus" aria-hidden="true"></i></button>
      <output aria-live="polite">${L.n}</output>
      <button type="button" data-action="step" data-k="boxes" data-d="1" aria-label="One more box"${L.n >= 8 ? ' disabled' : ''}><i class="ph ph-plus" aria-hidden="true"></i></button>
    </div><span class="help">${esc(help)}${auto ? '' : ' <button type="button" class="link-btn" data-action="boxes-auto">Back to auto</button>'}</span>
    ${L.raised ? `<span class="help">Raised to ${L.C} compartments so every box has at least one.</span>` : ''}</div>`;
}

// Tiny front view so the numbers above read as a picture
function layoutPreview() {
  const L = layout(), W = 160, H = 64, t = 3, k = W / S.w;
  const shelves = R.parts.filter(p => p.role === 'shelf').length || 0;
  let g = '';
  L.boxes.forEach(b => { g += `<rect x="${b.x0 * k + 1}" y="0" width="${b.w * k - 2}" height="${H}" rx="2" fill="none" stroke="currentColor" stroke-width="${t}"/>`; });
  L.verticals.filter(v => v.kind === 'divider').forEach(v => { const x = (v.x + S.thickness / 2) * k; g += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="currentColor" stroke-width="${t}"/>`; });
  for (let i = 1; i <= shelves; i++) { const y = H * i / (shelves + 1); g += `<line x1="2" y1="${y}" x2="${W - 2}" y2="${y}" stroke="var(--accent)" stroke-width="${t}"/>`; }
  return `<div class="layout-preview" aria-hidden="true"><svg viewBox="-2 -2 ${W + 4} ${H + 4}" width="${W + 4}" height="${H + 4}">${g}</svg><span>${L.C} x ${shelves + 1} spaces${L.n > 1 ? `, built as ${L.n} boxes` : ''}</span></div>`;
}

function numField(k, label, help, unit) {
  const lim = LIMITS[k] || [0, 99999];
  return `<div class="field"><label for="f-${k}">${esc(label)}</label><div class="input-unit"><input id="f-${k}" class="input num" type="number" inputmode="numeric" min="${lim[0]}" max="${lim[1]}" value="${S[k]}" data-field="${k}"><span>${unit}</span></div><span class="help" data-help="${k}">${esc(help)}${inchHelp(k)}</span><span class="err" data-err="${k}" hidden></span></div>`;
}

function photoBlock() {
  const ar = AR_SUPPORTED ? `<button type="button" class="btn btn-ghost btn-sm" data-action="ar-start"><i class="ph ph-ruler" aria-hidden="true"></i>AR measure</button>` : '';
  if (!S.photo) {
    return `<div class="drop" id="drop">
      <i class="ph ph-camera" aria-hidden="true"></i>
      <div class="t">Add a photo of the space</div>
      <div class="s">With a bank card on the wall for scale. It stays on this device.</div>
      <div class="row-btns"><button type="button" class="btn btn-primary btn-sm" data-action="open-tips">Take or choose photo</button>${ar}</div>
    </div>`;
  }
  return `<div class="photo-card">
    <img src="${esc(S.photo.url)}" alt="">
    <div><div class="t">Photo added</div><div class="s">${S.measured ? 'Measured from photo' : 'Not measured yet'}</div></div>
    <div class="acts"><button type="button" class="icon-btn" data-action="remove-photo" aria-label="Remove photo"><i class="ph ph-trash" aria-hidden="true"></i></button></div>
  </div>
  <div class="row-btns"><button type="button" class="btn btn-primary btn-sm" data-action="cm-open"><i class="ph ph-ruler" aria-hidden="true"></i>Measure on photo</button><button type="button" class="btn btn-ghost btn-sm" data-action="open-tips">Replace photo</button>${ar}</div>`;
}

// ── Cut list page ──
function partRows(parts) {
  return parts.map(p => {
    const area = p.w * p.h * p.qty / 1e6;
    const tags = [];
    if (p.scribed) tags.push('<span class="tag acc">Scribe edge</span>');
    if (p.shape) tags.push('<span class="tag acc">Angled cut</span>');
    if (p.hinges) tags.push(`<span class="tag">${p.hinges.length} hinge holes</span>`);
    if (p.edited) tags.push('<span class="tag">Edited</span>');
    const cellW = S.editParts ? `<input class="input num" type="number" min="1" value="${p.w}" data-ov="${esc(p.name)}" data-k="w" aria-label="${esc(p.name)} width">` : fmt(p.w);
    const cellH = S.editParts ? `<input class="input num" type="number" min="1" value="${p.h}" data-ov="${esc(p.name)}" data-k="h" aria-label="${esc(p.name)} height">` : fmt(p.h);
    const cellQ = S.editParts ? `<input class="input num qty" type="number" min="0" value="${p.qty}" data-ov="${esc(p.name)}" data-k="qty" aria-label="${esc(p.name)} quantity">` : p.qty;
    return `<tr><td class="c-name"><div class="pname">${esc(p.name)}</div>${p.note ? `<div class="help">${esc(p.note)}</div>` : ''}${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}</td>
      <td class="num" data-l="L">${cellW}</td><td class="num" data-l="W">${cellH}</td><td class="num" data-l="Qty">${cellQ}</td><td class="num c-area">${area.toFixed(2)} m²</td></tr>`;
  }).join('');
}

function sheetSVG(sh, sw, shh) {
  let s = `<svg viewBox="0 0 ${sw} ${shh}" role="img" aria-label="Sheet layout"><rect class="sv-bg" x="0" y="0" width="${sw}" height="${shh}"/>`;
  sh.rects.forEach(r => {
    s += `<rect class="sv-p" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" vector-effect="non-scaling-stroke"/>`;
    const fs = Math.min(64, r.w / 7, r.h / 3.2);
    if (fs > 22) {
      s += `<text class="sv-t" x="${r.x + r.w / 2}" y="${r.y + r.h / 2 - fs * 0.15}" font-size="${fs}" text-anchor="middle">${esc(r.name)}</text>`;
      s += `<text class="sv-t2" x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + fs * 0.95}" font-size="${fs * 0.8}" text-anchor="middle">${Math.round(r.w)}x${Math.round(r.h)}</text>`;
    }
  });
  return s + '</svg>';
}

function sheetBlock(key, label, sw, shh) {
  const res = R.sheets[key];
  if (!res || (!res.sheets.length && !res.oversize.length)) return '';
  const cards = res.sheets.map((sh, i) => {
    const used = sh.rects.reduce((a, r) => a + r.w * r.h, 0);
    const waste = (100 - used / (sw * shh) * 100).toFixed(0);
    return `<div class="sheet"><h4>Sheet ${i + 1} of ${res.sheets.length}<span>${waste}% offcut</span></h4>${sheetSVG(sh, sw, shh)}</div>`;
  }).join('');
  const over = res.oversize.length ? `<div class="callout warn"><i class="ph ph-warning" aria-hidden="true"></i><span><strong>${res.oversize.length} part${res.oversize.length > 1 ? 's are' : ' is'} bigger than a sheet</strong> (${esc([...new Set(res.oversize.map(r => r.name))].join(', '))}). Split it into two pieces or use a bigger board.</span></div>` : '';
  return `<div class="sect"><div class="sect-head"><h3>${esc(label)}</h3><span class="sub">${res.sheets.length} sheet${res.sheets.length === 1 ? '' : 's'}, ${fmt(sw)} x ${fmt(shh)}</span></div>${over}<div class="sheets">${cards}</div></div>`;
}

function hingeBlock() {
  const doors = R.parts.filter(p => p.hinges);
  if (!doors.length) return '';
  const d = doors[0];
  const sc = 300 / d.h;
  const svg = `<svg viewBox="0 0 ${d.w * sc + 20} 320" aria-hidden="true"><rect class="hv-door" x="10" y="10" width="${d.w * sc}" height="${d.h * sc}" vector-effect="non-scaling-stroke"/>${d.hinges.map(h => `<circle class="hv-hole" cx="${10 + 22.5 * sc + 6}" cy="${10 + h.y * sc}" r="8" vector-effect="non-scaling-stroke"/>`).join('')}</svg>`;
  return `<div class="sect"><div class="sect-head"><h3>Hinge holes</h3><span class="sub">35mm Forstner bit, inside face</span></div>
    <div class="hinge-grid"><div class="hinge-card">${svg}<ul>${d.hinges.map(h => `<li><span>${esc(h.label)}</span><span>${h.y}mm down</span></li>`).join('')}<li><span>From hinge edge</span><span>22.5mm</span></li><li><span>Depth</span><span>13mm</span></li></ul></div></div></div>`;
}

function renderCutPage() {
  const groups = [
    ['sheet', isCabinet(S.template) ? `Panels from ${MATERIALS[S.material].name} ${S.thickness}mm` : 'Panels'],
    ['ply3', 'Thin backs, 3mm'], ['ply6', 'Drawer bases, 6mm'],
    ['linear', 'Timber pieces'], ['whole', 'Whole boards'], ['roll', 'Rolls']
  ];
  const tables = groups.map(([k, label]) => {
    const ps = R.parts.filter(p => p.stock === k);
    if (!ps.length) return '';
    return `<div class="sect"><div class="sect-head"><h3>${esc(label)}</h3><span class="sub">${(n => n + (n === 1 ? ' piece' : ' pieces'))(ps.reduce((s, p) => s + p.qty, 0))}</span></div>
      <div class="table-wrap"><table class="parts"><thead><tr><th>Part</th><th class="num">Length</th><th class="num">Width</th><th class="num">Qty</th><th class="num c-area">Area</th></tr></thead><tbody>${partRows(ps)}</tbody></table></div></div>`;
  }).join('');
  const timber = R.linear.length ? `<div class="sect"><div class="sect-head"><h3>Timber lengths to buy</h3><span class="sub">Packed into stock lengths</span></div><div class="bars">${R.linear.map(g => g.bins.slice(0, 12).map((b, i) => `<div class="bar-row"><span class="lbl">${esc(g.section)} #${i + 1}</span><div class="bar">${b.cuts.map(c => `<span style-w="${c.len / g.stock}">${esc(c.name)} ${Math.round(c.len)}</span>`).join('')}</div></div>`).join('') + (g.bins.length > 12 ? `<div class="help">and ${g.bins.length - 12} more ${esc(g.section)} lengths</div>` : '') + (g.long.length ? `<div class="callout warn"><i class="ph ph-warning" aria-hidden="true"></i><span>${g.long.length} piece${g.long.length > 1 ? 's are' : ' is'} longer than ${fmtLen(g.stock)}. Order special lengths or join over a support.</span></div>` : '')).join('')}</div></div>` : '';
  const hw = R.fittings.length ? `<div class="sect"><div class="sect-head"><h3>Screws and fittings</h3><span class="sub">${gbp(R.costs.hardware)} estimated</span></div><div class="hw">${R.fittings.map(f => `<div class="hw-item"><div><div class="n">${esc(f.name)}</div>${f.note ? `<div class="d">${esc(f.note)}</div>` : ''}</div><div class="q">${f.total_qty}<div class="d">${gbp(f.total_cost)}</div></div></div>`).join('')}</div></div>` : '';
  const scribe = R.parts.some(p => p.scribed) ? `<div class="callout"><i class="ph ph-info" aria-hidden="true"></i><span><strong>Scribe edges</strong> are 2mm oversize where they meet a wall. Trim them to fit on site.</span></div>` : '';
  const anyEdited = Object.keys(S.overrides).length;
  return `<div class="page">
    <div class="page-head"><div><h2>Your cut list</h2><p>${esc(designName())}, ${esc(isCabinet(S.template) ? `${fmt(S.w)} wide, ${fmt(S.h)} high, ${fmt(S.d)} deep` : `${fmt(S.w)} by ${fmt(S.template === 'studwall' || S.template === 'partition' ? S.h : S.d)}`)}.</p></div>
      <div class="files"><button type="button" class="btn btn-ghost btn-sm" data-action="toggle-edit"><i class="ph ph-pencil-simple" aria-hidden="true"></i>${S.editParts ? 'Done editing' : 'Edit sizes'}</button>${anyEdited ? '<button type="button" class="btn btn-ghost btn-sm" data-action="reset-overrides"><i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>Undo edits</button>' : ''}<button type="button" class="btn btn-ghost btn-sm" data-action="print"><i class="ph ph-printer" aria-hidden="true"></i>Print</button></div></div>
    <div class="stats">
      <div class="stat"><div class="k">Pieces</div><div class="v">${R.pieceCount}</div></div>
      <div class="stat"><div class="k">${R.nMain ? 'Sheets' : 'Timber lengths'}</div><div class="v">${R.nMain || R.linear.reduce((s, g) => s + g.count, 0)}</div></div>
      <div class="stat"><div class="k">Offcut</div><div class="v">${R.nMain ? Math.round(R.waste) : 0}<small>%</small></div></div>
      <div class="stat"><div class="k">Estimate</div><div class="v">${gbp0(R.total)}</div></div>
    </div>
    ${safetyHTML(true)}${scribe}${tables}
    ${sheetBlock('main', 'Sheet layouts', S.sheetW, S.sheetH)}${sheetBlock('ply3', 'Back panel sheets', 2440, 1220)}${sheetBlock('ply6', 'Drawer base sheets', 2440, 1220)}
    ${timber}${hingeBlock()}${hw}
  </div>`;
}


// ───────────────────────── Safety checks ─────────────────────────
// Deterministic engineering checks. Every figure is cited in docs/SAFETY.md. Conservative choices:
// cross-grain stiffness for plywood and OSB (the cutter may rotate parts), product minimums for MDF and chipboard.
const SAFETY_MAT = {
  plywood: { E: 7452, fm: 34.1, kdef: 0.8, kmod: 0.6, gM: 1.2, src: 'Birch plywood 18mm, across the face grain (Metsä DoP)' },
  mdf: { E: 2200, fm: 20, kdef: 2.25, kmod: 0.2, gM: 1.3, src: 'MDF, EN 622-5 minimum' },
  melamine: { E: 1600, fm: 11, kdef: 2.25, kmod: 0.3, gM: 1.3, src: 'Chipboard P2, EN 312 minimum' },
  osb: { E: 1980, fm: 8.2, kdef: 1.5, kmod: 0.4, gM: 1.2, src: 'OSB/3 across the strands (EN 12369-1)' }
};
const LOADS = {
  light: { name: 'Light', note: 'Clothes, towels, ornaments', perDm2: 1.0, perM: 0 },
  books: { name: 'Books', note: 'Books, files, games', perDm2: 1.0, perM: 60 },
  heavy: { name: 'Heavy', note: 'Tins, crockery, tools, paint', perDm2: 1.5, perM: 60 }
};
const PIN_KG = 12; // lowest common UK shelf-pin rating found (Häfele 12.5kg), rounded down
function defaultLoad(t) { return t === 'wardrobe' ? 'light' : t === 'kitchenbase' || t === 'kitchenwall' ? 'heavy' : 'books'; }

// kg per metre of shelf: the larger of the area load and the running load
const shelfKgPerM = (depth, load) => Math.max(LOADS[load].perDm2 * depth / 100 * 10, LOADS[load].perM);

function shelfCheck(span, depth, t, material, load) {
  const m = SAFETY_MAT[material];
  if (!m || span <= 0 || depth <= 0 || t <= 0) return null;
  const kgm = shelfKgPerM(depth, load), w = kgm * 9.81 / 1000; // N/mm
  const I = depth * t ** 3 / 12, Z = depth * t ** 2 / 6;
  const uInst = 5 * w * span ** 4 / (384 * m.E * I), uFin = uInst * (1 + m.kdef);
  const sigma = 1.5 * w * span ** 2 / 8 / Z, fd = m.kmod * m.fm / m.gM;
  const kgShelf = kgm * span / 1000, perPin = kgShelf / 4;
  const sagOK = uFin <= span / 200, looksOK = uInst <= span / 600, strong = sigma <= fd;
  return { span, depth, t, kgm, kgShelf, perPin, uInst, uFin, sigma, fd, sagOK, looksOK, strong, ok: sagOK && strong };
}

// Smallest change that makes the worst shelf pass: more compartments, or a thicker board
function safetyFixes(depth, load) {
  const out = [];
  if (BAY_TEMPLATES.has(S.template)) {
    for (let n = Math.max(1, S.compartments) + 1; n <= 8; n++) {
      const keep = S.compartments; S.compartments = n; const span = layout().bayW; S.compartments = keep;
      const c = shelfCheck(span, depth, S.thickness, S.material, load);
      if (c && c.ok && c.perPin <= PIN_KG) { out.push({ kind: 'compartments', value: n, label: `Use ${n} compartments` }); break; }
    }
  }
  const span = bayInfo().bayW;
  for (const t of (S.material === 'plywood' ? [24] : [25]).filter(x => x > S.thickness)) {
    const c = shelfCheck(span, depth, t, S.material, load);
    if (c && c.ok) { out.push({ kind: 'thickness', value: t, label: `Use ${t}mm board` }); break; }
  }
  if (S.material !== 'plywood') {
    const c = shelfCheck(span, depth, S.thickness, 'plywood', load);
    if (c && c.ok) out.push({ kind: 'material', value: 'plywood', label: 'Switch to plywood' });
  }
  return out;
}

function safetyChecks() {
  const out = [];
  if (!isCabinet(S.template)) {
    out.push({ status: STRUCTURAL.has(S.template) ? 'stop' : 'info', title: 'Building work', text: 'Structural sizes must be checked by an engineer or Building Control. This app does not check them.' });
    return out;
  }
  const load = LOADS[S.load] ? S.load : defaultLoad(S.template);
  const shelves = R.parts.filter(p => p.role === 'shelf');
  const mat = SAFETY_MAT[S.material];
  if (shelves.length && mat) {
    const checks = shelves.map(p => ({ p, c: shelfCheck(p.w, p.h, S.thickness, S.material, load) })).filter(x => x.c);
    const worst = checks.reduce((a, b) => (b.c.uFin / b.c.span > a.c.uFin / a.c.span ? b : a), checks[0]);
    if (worst) {
      const c = worst.c;
      const sagTxt = `${c.uFin.toFixed(1)}mm over time on a ${Math.round(c.span)}mm span, loaded with about ${Math.round(c.kgShelf)}kg`;
      if (!c.ok) out.push({ status: 'fail', id: 'sag', title: c.strong ? 'Shelves will sag too much' : 'Shelves are not strong enough', text: `The widest shelf would bend ${sagTxt}. The limit is ${(c.span / 200).toFixed(1)}mm.`, fixes: safetyFixes(worst.p.h, load) });
      else if (!c.looksOK) out.push({ status: 'warn', id: 'sag', title: 'Shelves will sag a little', text: `Safe, but you may see the widest shelf dip (${sagTxt}). More compartments or a thicker board would stop it.`, fixes: safetyFixes(worst.p.h, load) });
      else out.push({ status: 'pass', id: 'sag', title: 'Shelves are stiff and strong enough', text: `The widest shelf bends ${sagTxt}, within the ${(c.span / 200).toFixed(1)}mm limit.` });
      const pin = Math.max(...checks.map(x => x.c.perPin));
      if (pin > PIN_KG) out.push({ status: 'fail', id: 'pins', title: 'Too much weight for shelf pins', text: `Each pin would carry about ${Math.round(pin)}kg. Common pins are rated about 12kg. Screw the shelves in place${BAY_TEMPLATES.has(S.template) ? ' or add compartments' : ''}.` });
      else out.push({ status: 'pass', id: 'pins', title: 'Shelf pins can take the load', text: `About ${pin.toFixed(1)}kg on each pin. Buy pins rated 12kg or more.` });
    }
  }
  // A panel longer than the sheet cannot be cut in one piece, and a carcass that long is hard to get up stairs
  const over = ['main', 'ply3', 'ply6'].flatMap(k => R.sheets[k] ? R.sheets[k].oversize : []).map(r => r.name);
  if (over.length) {
    const n = Math.ceil(S.w / (Math.max(S.sheetW, S.sheetH) - 100));
    out.push({ status: 'fail', id: 'size', title: 'Some panels are longer than a sheet', text: `${[...new Set(over)].join(' and ')} would be ${fmt(Math.max(...R.parts.filter(p => over.includes(p.name)).map(p => Math.max(p.w, p.h))))} long, but a sheet is ${fmt(Math.max(S.sheetW, S.sheetH))}. A carpenter would build this as ${n} separate boxes side by side and screw them together. That also makes it easier to carry up the stairs.` });
  }
  const site = SITES[S.site] || SITES.upstairs, long = R.parts.filter(p => (p.stock === 'sheet' || p.stock === 'ply3') && Math.max(p.w, p.h) > site.carry && !over.includes(p.name));
  if (long.length) out.push({ status: 'warn', id: 'carry', title: 'Check the long panels will go in', text: `${[...new Set(long.map(p => p.name.replace(/ \d+$/, '')))].join(', ')} ${long.length > 1 ? 'are' : 'is'} up to ${fmt(Math.max(...long.map(p => Math.max(p.w, p.h))))} long. Panels over about ${fmt(site.carry)} are hard to get ${S.site === 'loft' ? 'up loft stairs or through a hatch' : S.site === 'upstairs' ? 'up stairs and round a landing' : 'in'}. Measure the tightest turn before you order.` });
  const back = R.parts.some(p => p.role === 'back');
  out.push(back
    ? { status: 'pass', id: 'back', title: 'Back panel stops it racking', text: 'Pin the back to every edge and divider so it holds the unit square.' }
    : { status: 'fail', id: 'back', title: 'No back panel', text: 'Without a fixed back the unit can lean sideways and collapse.' });
  out.push({ status: 'action', id: 'wall', title: S.template === 'eaves' ? 'Fix it to the floor and knee wall' : S.template === 'kitchenwall' ? 'Hang it on rated wall fixings' : 'Fix it to the wall', text: S.template === 'kitchenwall' ? 'Wall cupboards hang from the wall, so use fixings rated for your wall type and the full load.' : 'Furniture can tip forward, especially if a child climbs it. Always fix it, even if it feels steady.' });
  if (S.joinery === 'screws' && (S.material === 'mdf' || S.material === 'melamine')) out.push({ status: 'warn', id: 'joints', title: 'Screws hold poorly in board edges', text: `${MATERIALS[S.material].name} edges split and strip easily. Drill pilot holes, keep screws well away from corners, or switch to cam and dowel fittings.` });
  if (S.material === 'osb') out.push({ status: 'warn', id: 'osb', title: 'OSB is a building board', text: 'It is rough, flexible across the strands and can shed splinters. Fine for a loft store, not for a child\'s room.' });
  return out;
}

const SAFETY_ICON = { pass: 'check-circle', warn: 'warning', fail: 'x-circle', action: 'hand-pointing', info: 'info', stop: 'hard-hat' };
function safetyHTML(compact = false) {
  const list = safetyChecks();
  const fails = list.filter(c => c.status === 'fail').length, warns = list.filter(c => c.status === 'warn').length;
  const head = fails ? `${fails} safety check${fails > 1 ? 's' : ''} failed` : warns ? 'Safe, with things to watch' : 'All safety checks passed';
  const items = list.map(c => `<li class="sc sc-${c.status}"><i class="ph ph-${SAFETY_ICON[c.status]}" aria-hidden="true"></i><div><strong>${esc(c.title)}</strong><span>${esc(c.text)}</span>${c.fixes && c.fixes.length ? `<div class="sc-fixes">${c.fixes.map(f => `<button type="button" class="chip" data-action="safety-fix" data-kind="${f.kind}" data-value="${esc(String(f.value))}">${esc(f.label)}</button>`).join('')}</div>` : ''}</div></li>`).join('');
  const loadSeg = isCabinet(S.template) && R.parts.some(p => p.role === 'shelf') ? `<div class="sc-load"><span class="lbl" id="loadLbl">The shelves will hold</span><div class="seg" role="group" aria-labelledby="loadLbl">${Object.entries(LOADS).map(([k, l]) => `<button type="button" data-action="load" data-value="${k}" aria-pressed="${(S.load || defaultLoad(S.template)) === k}" title="${esc(l.note)}">${l.name}</button>`).join('')}</div></div>` : '';
  return `<section class="safety${fails ? ' has-fail' : ''}" aria-labelledby="safetyH"><div class="safety-head"><i class="ph ph-shield-check" aria-hidden="true"></i><h3 id="safetyH">${head}</h3></div>${compact ? '' : loadSeg}<ul class="sc-list">${items}</ul>
    <details class="more sc-src"><summary>How we check</summary><p>Shelf sag uses the standard beam formula with long-term creep from Eurocode 5 (EN 1995-1-1), board stiffness from manufacturer and EN data, and a limit of 1/200 of the span, the figure most furniture specifications use with the EN 16122 shelf test. Loads follow the EN furniture test levels and the Sagulator figure for books (up to 60kg per metre). Wall fixing follows RoSPA and GOV.UK advice. These are estimates, not a certificate. If in doubt, ask a carpenter. <a href="https://github.com/alice04121982/cutlist-pro/blob/main/docs/SAFETY.md" target="_blank" rel="noopener noreferrer">Every rule and source</a>.</p></details></section>`;
}

// ── Build guide ──
// Shelf-pin hole rows for the drilling step: one row under each designed shelf, plus one 32mm above
// and below so the shelf can be moved. Measured up from the bottom edge of the side panel.
function pinRows() {
  const th = S.thickness, base = S.template === 'kitchenbase' ? 100 : 0;
  const shelves = R.parts.filter(p => p.role === 'shelf');
  const ys = new Set();
  shelves.forEach((p, i, arr) => {
    const yc = p.yc ?? (th + ((S.h - base) - 2 * th) * (i + 1) / (arr.length + 1));
    const y = Math.round(yc - th / 2 - 4);
    [y - 32, y, y + 32].forEach(v => { if (v > th + 20 && v < S.h - base - th - 20) ys.add(v); });
  });
  return [...ys].sort((a, b) => a - b).map(y => ({ y, front: 37 }));
}

function buildSteps() {
  const t = S.template, cab = isCabinet(t);
  const names = r => R.parts.filter(p => p.role === r).map(p => p.name);
  const all = R.parts.map(p => p.name);
  const steps = [];
  if (cab) {
    // Carpenter's order: check, prepare every panel flat, build the carcass, square it with the back
    // while it is still out in the room, then fit it, then the loose parts.
    const doors = R.parts.find(p => p.role === 'door');
    const f = Math.max(2, Math.ceil(S.d / 150));
    const eaves = t === 'eaves', hasDiv = R.parts.some(p => p.role === 'divider'), shelves = R.parts.filter(p => p.role === 'shelf');
    const Lay = layout(), multi = Lay.n > 1, conn = S.h > 900 ? 4 : 3;
    const boxDesc = multi ? (() => { const g = {}; Lay.boxes.forEach(b => { g[b.w] = (g[b.w] || 0) + 1; }); return Object.entries(g).map(([w, c]) => `${c} x ${fmt(+w)} wide`).join(' and '); })() : '';
    const topName = eaves ? 'sloped top' : t === 'kitchenbase' ? 'top rails' : 'top';
    const pilot = S.joinery === 'screws' ? 'Drill 3mm pilot holes and countersink them. ' : '';
    steps.push({ title: 'Check your delivery', parts: all, tools: ['Tape measure', 'Pencil'], body: ['Lay every panel out flat and match it to the cut list.', 'Measure a few. Tell the supplier now if anything is off.', 'Pencil the part name on a hidden edge, and a small triangle on the inside face pointing to the front edge, so nothing goes in back to front.'] });
    const us = t === 'understairs';
    steps.push({ title: 'Check the space', parts: eaves || us ? ['Left Side', 'Right Side'] : [], tools: ['Tape measure', 'Spirit level', 'Stud and cable detector', eaves || us ? 'Sliding bevel' : 'Pencil'], body: us
      ? [`Measure the height to the underside of the stairs at both ends and where each upright will go. Your design is ${Math.round(S.h)}mm at the tall end and ${Math.round(S.low)}mm at the short end.`, `Set a sliding bevel to the stairs (about ${stairGeom().angDeg} degrees) and check it at a few points. Old stairs sag.`, 'Note anything under the stairs that must stay reachable: gas meter, fuse box, stopcock. Plan a door in front of it.', 'Find the wall studs, mark them on masking tape and scan for cables and pipes.']
      : eaves
      ? [`Measure the front height, back height and depth at both ends and in the middle. Lofts are rarely even. Your design is ${Math.round(S.h)}mm at the front and ${Math.round(S.low)}mm at the back.`, 'Offer one side panel up against the slope at each end. If the angle is off, fix it now, not after assembly.', 'Find the knee wall studs and the rafters and mark them on masking tape. Scan for cables and pipes.', 'Check the floor with a level so you know where you will need packers.']
      : ['Check the floor and wall with a level so you know where you will need packers.', 'Find the wall studs and mark them on masking tape.', 'Scan for cables and pipes. Avoid lines straight up, down and across from sockets and switches.'],
      warn: eaves ? 'Keep air moving in the eaves. Leave a gap of about 25mm behind the unit and do not squash or cover the insulation or vents.' : us ? 'If the stairs are the escape route in a house with three or more storeys, the cupboard may need fire-resisting linings and doors (Approved Document B). Check with Building Control first.' : null });
    if (R.parts.some(p => p.scribed)) steps.push({ title: 'Scribe to your walls', parts: R.parts.filter(p => p.scribed).map(p => p.name), tools: ['Pencil', 'Block plane or jigsaw'], body: ['Hold the panel against the wall where it will go.', 'Run a pencil along the wall on a 2mm block to copy its shape onto the panel.', 'Plane or cut down to the line, angled slightly back.'] });
    const drill = [];
    if (shelves.length) {
      const pins = pinRows();
      drill.push(`Lay each side${hasDiv ? ' and divider' : ''} flat, inside face up, and drill 5mm shelf-pin holes 10mm deep with a depth stop. Use a jig or a strip of pegboard so every panel matches.`);
      drill.push(`Hole centres, measured up from the bottom edge: ${pins.map(r => r.y + 'mm').join(', ')}. Set them ${pins[0].front}mm in from the front edge and the same from the back of the shelf.`);
      if (hasDiv) drill.push('On the dividers, drill right through. One hole then holds a pin on each side.');
    }
    if (doors) drill.push(`On the inside face of each door, drill 35mm hinge cups 13mm deep, ${doors.hinges.map(h => h.y + 'mm').join(', ')} from the top and 22.5mm in from the hinge edge. Test on an offcut first.`);
    if (drill.length) steps.push({ title: 'Drill everything while it is flat', parts: [...names('side'), ...names('divider'), ...(doors ? ['Door'] : [])], tools: ['Drill', '5mm bit', 'Depth stop', ...(shelves.length ? ['Shelf-pin jig'] : []), ...(doors ? ['35mm Forstner bit'] : [])], body: drill, warn: 'It is far easier and more accurate to drill now than inside a finished box.' });
    const join = S.joinery === 'screws'
      ? ['Work on a flat floor with the unit lying on its back, so you can reach both the top and the bottom. Lay the bottom between the two sides, flush at the front.', `${pilot}Glue the joint and drive ${f} screws (4x40mm) through each side into the bottom.`]
      : S.joinery === 'pocket'
        ? ['Set your pocket-hole jig for 18mm board and drill pocket holes on the underside of the bottom.', `Clamp each side flush at the front, glue, then drive ${f} 32mm pocket screws per joint.`]
        : ['Push glued dowels into the side panels.', 'Fit the cam bolts, slide the bottom on and turn each cam a quarter turn. Do not over-tighten.'];
    if (multi) join.unshift(`This unit is built as ${Lay.n} separate boxes (${boxDesc}) so each one fits on a sheet and up the stairs. Build every box with the next ${hasDiv ? 4 : 3} steps, then join them in place.`);
    steps.push({ title: multi ? 'Build each box: the base' : 'Build the base', parts: [...names('side'), ...names('bottom')], tools: S.joinery === 'pocket' ? ['Drill', 'Pocket-hole jig', 'Clamps'] : S.joinery === 'cam' ? ['Screwdriver', 'Rubber mallet'] : ['Drill', '3mm bit', 'Countersink', 'Clamps'], body: join });
    if (hasDiv) { const bi = bayInfo(); steps.push({ title: multi ? 'Each box: stand the dividers' : 'Stand the dividers', parts: names('divider'), tools: ['Tape measure', 'Square', 'Drill'], body: [`Mark the divider positions on the bottom. Each compartment is ${bi.bayW}mm wide inside.`, 'Cut a spacer from an offcut to that width. Use it to set each divider square and parallel.', `${pilot}Screw through the underside of the bottom into each divider, ${f} screws each.`] }); }
    steps.push({ title: (multi ? 'Each box: ' : '') + (eaves || us ? (multi ? 'fit the sloped top' : 'Fit the sloped top') : t === 'kitchenbase' ? 'Fit the top rails' : (multi ? 'fit the top' : 'Fit the top')), parts: names('top'), tools: ['Drill', 'Clamps'], body: [eaves ? `Check the front and back edges are bevelled at ${eavesGeom().angDeg} degrees.` : us ? `Plane or saw the top edge of each upright to ${stairGeom().angDeg} degrees so the top sits flat on them, then lay the top on, flush at the front.` : 'Lay the top on, flush at the front.', `${pilot}Glue and screw it down into the sides${hasDiv ? ' and every divider' : ''}, ${f} screws per joint.`] });
    if (R.parts.some(p => p.role === 'back')) steps.push({ title: multi ? 'Each box: square it and fit the back' : 'Square it and fit the back', parts: names('back'), tools: ['Tape measure', 'Hammer'], body: ['Turn the unit over so it lies face down on a blanket.', 'Measure both diagonals. Push the corners until they match: then the box is square.', `Run glue along every edge${hasDiv ? ' and divider' : ''}, lay the back on and pin it every 150mm with 25mm panel pins.`], warn: eaves ? 'Do this now, before it goes in. Once the unit is under the eaves you cannot reach the back.' : 'The back holds the unit square. Fit it before you stand the unit up or move it.' });
    if (t === 'kitchenbase') steps.push({ title: 'Make the drawer', parts: names('drawer'), tools: ['Drill', 'Clamps'], body: ['Glue and screw the sides to the back.', 'Slide the 6mm base in and pin it from below.', 'Fit the runners to the drawer and the cabinet.'] });
    if (t === 'kitchenbase') steps.push({ title: 'Legs and plinth', parts: ['Plinth'], tools: ['Spirit level'], body: ['Screw the legs to the underside, one near each corner.', 'Level the unit by twisting the legs.', 'Clip the plinth to the front legs.'] });
    if (multi) steps.push({ title: 'Put the boxes in place and join them', parts: names('side'), tools: ['Clamps', 'Drill', '5mm bit', 'Spirit level'], twoPeople: S.h > 1200, body: [
      `Carry the boxes in one at a time, starting at ${eaves ? 'one end of the eaves' : 'one end of the wall'}.${eaves ? ' Slide each one back under the slope, keeping the 25mm air gap.' : ''}`,
      'Stand the next box beside it. Line up the fronts and tops flush, level it with packers to match, and clamp the two sides together.',
      `Drill ${conn} 5mm holes through both sides, about 50mm in from the front and back edges, and fit a connector screw in each.`,
      'Repeat until every box is joined, checking with a level as you go.'] });
    steps.push({ title: eaves ? (multi ? 'Fix it to the floor and knee wall' : 'Slide it in and fix it') : 'Fix it in place', parts: names('side'), tools: ['Spirit level', 'Packers', 'Drill', 'Stud and cable detector'], twoPeople: true,
      body: eaves
        ? [...(multi ? [] : ['With two people, carry the unit in and slide it back under the slope, keeping the 25mm air gap behind it.']), 'Level it front to back and side to side with packers under the bottom.', 'Inside the unit, screw angle brackets to the floor. Screw through the top back edge into the knee wall studs you marked.', 'Fill the gaps to the walls and slope with a scribe strip or decorators caulk.']
        : us ? ['Level it with packers under the bottom.', 'Screw angle brackets inside the unit to the floor and into the wall studs you marked.', 'Do not screw up into the stairs: screws can split the treads or come through.', 'Fill the gap to the underside of the stairs with a scribe strip or caulk.']
        : ['Level the unit, packing under it if needed.', 'Fix it to the studs you marked, or with wall plugs that suit the wall.', 'Fill any gap to the wall with a scribe strip or caulk.'],
      warn: (t === 'wardrobe' || (t === 'shelving' && S.h > 1000)) ? 'Tall units can tip forward. Always fix them to the wall.' : null });
    if (shelves.length || t === 'wardrobe') steps.push({ title: t === 'wardrobe' ? 'Fit shelves and rail' : 'Fit the shelves', parts: [...names('shelf'), ...names('rail')], tools: ['Screwdriver'], body: ['Push four pins into the holes for each shelf and rest the shelf on them.', t === 'wardrobe' ? 'Screw the rail sockets 70mm below the top, then drop the rail in.' : 'Check each shelf sits flat and does not rock.'] });
    if (doors) steps.push({ title: 'Hang and adjust the doors', parts: ['Door'], tools: ['Screwdriver'], body: ['Screw the hinge cups into their holes and the mounting plates inside the unit.', 'Clip the doors on and use the adjusting screws to get even 2 to 3mm gaps.', 'Fit the handles last.'] });
  } else {
    const structural = STRUCTURAL.has(t);
    steps.push({ title: 'Check your timber', parts: all, tools: ['Tape measure', 'Pencil'], body: ['Check the grade stamp says C16 or better.', 'Sight down each length and put bowed ones aside for short pieces.', 'Cut list pieces are ready to mark from the stock lengths.'], warn: structural ? 'Structural work needs Building Regulations approval and an engineer to confirm timber sizes before you start.' : null });
    if (t === 'studwall' || t === 'partition') {
      steps.push({ title: 'Mark out the wall', parts: ['Bottom Plate', 'Top Plate'], tools: ['Chalk line', 'Laser or plumb line', 'Stud and cable detector'], body: ['Snap a chalk line on the floor.', 'Transfer it to the ceiling with a laser or plumb line.', 'Scan for pipes and cables first.'] });
      steps.push({ title: 'Fix the plates', parts: ['Bottom Plate', 'Top Plate'], tools: ['Drill', 'Frame fixings'], body: ['Screw the bottom plate down every 600mm.', 'Fix the top plate into the ceiling joists. If they run parallel, fit noggins between them first.'] });
      steps.push({ title: 'Cut and fit the studs', parts: ['Stud'], tools: ['Saw', 'Hammer', 'Spirit level'], body: [`Measure each stud on its own, floors are rarely level. Fix at ${S.spacing}mm centres.`, 'Skew-nail each end with two 90mm nails.', 'Check every stud with a level.'] });
      steps.push({ title: 'Fit the noggins', parts: ['Noggin'], tools: ['Saw', 'Hammer'], body: ['Fit noggins between studs, staggered so you can nail through the ends.', 'Add extra noggins where you will hang shelves, TVs or radiators.'] });
      if (t === 'partition') steps.push({ title: 'Board both sides', parts: ['Plasterboard'], tools: ['Drill', 'Plasterboard saw'], body: ['Screw boards every 300mm with 32mm plasterboard screws.', 'Stagger the joints on each side.', 'Tape and fill the joints.'], warn: 'Any new electrics must be fitted by a qualified electrician.' });
    } else {
      steps.push({ title: 'Set out', parts: names('plate').concat(names('header')), tools: ['Tape measure', 'Chalk line'], body: [`Mark positions at ${S.spacing}mm centres on the wall plates.`, 'Check diagonals so the frame is square.'] });
      steps.push({ title: t === 'pitchedroof' ? 'Cut and fit rafters' : 'Fit the joists', parts: names(t === 'pitchedroof' ? 'rafter' : 'joist'), tools: ['Saw', 'Drill', 'Hammer'], body: t === 'pitchedroof' ? ['Make one pattern rafter and check it fits both sides.', 'Copy it for the rest.', 'Fix to the wall plate and ridge with brackets.'] : ['Fit joist hangers and drop the joists in.', 'Nail every hole in the hanger.', 'Crown side up.'], warn: 'Do not notch or drill joists outside the zones your engineer allows.' });
      if (t === 'floorjoists') steps.push({ title: 'Struts and boards', parts: ['Herringbone Strut', 'Floor Board'], tools: ['Saw', 'Drill'], body: ['Fit herringbone struts in rows across the span.', 'Glue the tongues and screw the boards every 300mm.'] });
      if (t === 'flatroof') steps.push({ title: 'Deck and weatherproof', parts: ['Deck Board', 'Fascia'], tools: ['Drill', 'Saw'], body: ['Lay the deck boards with staggered joints.', 'Fix with ring-shank nails every 150mm at edges.', 'Fit the fascia, then the roof covering.'] });
      if (t === 'pitchedroof') steps.push({ title: 'Ties and membrane', parts: ['Collar Tie', 'Roofing Membrane'], tools: ['Hammer', 'Staple gun'], body: ['Fit collar ties to every other pair of rafters.', 'Roll the membrane from the eaves upward with 150mm overlaps.'] });
    }
  }
  return steps;
}

const TOOL_ICONS = { 'Tape measure': 'ruler', Pencil: 'pencil-simple', Drill: 'screwdriver', 'Spirit level': 'ruler', 'Stud and cable detector': 'lightning', Clamps: 'wrench', Saw: 'scissors', Hammer: 'hammer', Screwdriver: 'screwdriver' };
function renderBuildPage() {
  const steps = buildSteps();
  S.buildIdx = clamp(S.buildIdx, 0, steps.length - 1);
  const st = steps[S.buildIdx];
  const tools = [...new Set(steps.flatMap(s => s.tools))];
  const done = new Set(S.done);
  const manualOK = isCabinet(S.template), mode = manualOK ? S.buildMode : 'steps';
  const head = `<div class="page-head"><div><h2>How to build it</h2><p>${mode === 'manual' ? 'A picture manual, like flat-pack furniture. Print it or save it as a PDF.' : steps.length + ' steps. Tick each one off as you go.'}</p></div><div class="files">${manualOK ? `<div class="seg" role="group" aria-label="Guide type"><button type="button" data-action="build-mode" data-value="manual" aria-pressed="${mode === 'manual'}">Manual</button><button type="button" data-action="build-mode" data-value="steps" aria-pressed="${mode === 'steps'}">Step by step</button></div>` : ''}<button type="button" class="btn btn-ghost btn-sm" data-action="${mode === 'manual' ? 'print-manual' : 'print'}"><i class="ph ph-printer" aria-hidden="true"></i>${mode === 'manual' ? 'Print or save PDF' : 'Print the guide'}</button></div></div>`;
  if (mode === 'manual') return `<div class="page">${head}${renderManual()}</div>`;
  return `<div class="page">
    ${head}
    <div class="sect"><div class="sect-head"><h3>Tools you will need</h3></div><div class="tools">${tools.map(t => `<div class="tool"><i class="ph ph-${TOOL_ICONS[t] || 'wrench'}" aria-hidden="true"></i>${esc(t)}</div>`).join('')}</div></div>
    <div class="sect build">
      <div class="build-fig">${elevationSVG('fig', new Set(st.parts))}</div>
      <div class="build-card">
        <div class="progress" role="group" aria-label="Steps">${steps.map((s, i) => `<button type="button" data-action="build-go" data-step="${i}" aria-label="Step ${i + 1}: ${esc(s.title)}"${i === S.buildIdx ? ' aria-current="step"' : ''} class="${done.has(i) ? 'done' : ''}"></button>`).join('')}</div>
        <div class="build-count">Step ${S.buildIdx + 1} of ${steps.length}</div>
        <h3>${esc(st.title)}</h3>
        <ul class="how-to">${st.body.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
        ${st.warn ? `<div class="callout warn" style-mt><i class="ph ph-warning" aria-hidden="true"></i><span>${esc(st.warn)}</span></div>` : ''}
        <div class="label">Parts in this step</div>
        <div class="tags">${[...new Set(st.parts)].slice(0, 14).map(p => `<span class="tag acc">${esc(p)}</span>`).join('')}</div>
        <div class="label">Tools</div>
        <div class="tags">${st.tools.map(p => `<span class="tag">${esc(p)}</span>`).join('')}</div>
        <div class="build-nav">
          <button type="button" class="btn btn-ghost" data-action="build-prev"${S.buildIdx === 0 ? ' disabled' : ''}><i class="ph ph-arrow-left" aria-hidden="true"></i>Previous</button>
          <button type="button" class="btn btn-primary" data-action="build-done">${done.has(S.buildIdx) ? '<i class="ph ph-check" aria-hidden="true"></i>Done, next' : 'Mark done'}</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ───────────────────────── Assembly manual (IKEA style) ─────────────────────────
// Fixed "paper" palette so the manual looks the same on screen, in dark mode and in print.
const MP = { ink: '#15181B', done: '#E4E2DC', wood: '#E9D9BC', add: '#FF8A5C', line: '#15181B', paper: '#FBFBFA' };

// 3D solids for each named part, in mm. x right, y up, z from the front (0) to the back (D).
function partSolids(opt = {}) {
  const t = S.template, th = S.thickness, W = S.w, H = S.h, D = S.d;
  const out = [];
  const box = (part, x, y, z, w, h, d) => {
    const v = [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z], [x, y, z + d], [x + w, y, z + d], [x + w, y + h, z + d], [x, y + h, z + d]];
    out.push({ part, v, f: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 3, 7, 4], [1, 2, 6, 5]] });
  };
  const prismX = (part, x0, x1, prof) => {
    const n = prof.length, v = [];
    prof.forEach(([y, z]) => v.push([x0, y, z]));
    prof.forEach(([y, z]) => v.push([x1, y, z]));
    const f = [prof.map((_, i) => i), prof.map((_, i) => n + i)];
    for (let i = 0; i < n; i++) f.push([i, (i + 1) % n, n + (i + 1) % n, n + i]);
    out.push({ part, v, f });
  };
  const base = t === 'kitchenbase' ? 100 : 0, Hc = H - base, Lay = layout();
  // opt.box: only that box's carcass, moved to x = 0 (for the "build one box" steps)
  const only = opt.box != null ? Lay.boxes[opt.box] : null, dx = only ? -only.x0 : 0;
  const inBox = i => !only || i === only.i;
  const hexa = (part, v) => out.push({ part, v, f: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 3, 7, 4], [1, 2, 6, 5]] });
  if (t === 'understairs') {
    const sg = stairGeom();
    Lay.verticals.forEach(v => {
      if (!inBox(v.box)) return;
      const top = sg.topAt(v.x + th / 2) - sg.tv, y0 = v.kind === 'divider' ? th : 0;
      box(v.name, v.x + dx, y0, 0, th, top - y0, D);
      Object.assign(out[out.length - 1], { side: v.kind, box: v.box });
    });
    Lay.boxes.forEach(b => {
      if (!inBox(b.i)) return;
      const x0 = b.x0, x1 = b.x0 + b.w, a = sg.topAt(x0), z = sg.topAt(x1), X = x => x + dx;
      hexa(boxPart('Sloped Top', b), [[X(x0), a - sg.tv, 0], [X(x1), z - sg.tv, 0], [X(x1), z, 0], [X(x0), a, 0], [X(x0), a - sg.tv, D], [X(x1), z - sg.tv, D], [X(x1), z, D], [X(x0), a, D]]);
      out[out.length - 1].box = b.i;
      box(boxPart('Bottom', b), X(x0 + th), 0, 0, b.w - 2 * th, th, D); out[out.length - 1].box = b.i;
      if (R.parts.some(p => p.role === 'back')) { const al = a - sg.tv, zr = z - sg.tv; hexa(boxPart('Back Panel', b), [[X(x0), 0, D], [X(x1), 0, D], [X(x1), zr, D], [X(x0), al, D], [X(x0), 0, D + 3], [X(x1), 0, D + 3], [X(x1), zr, D + 3], [X(x0), al, D + 3]]); out[out.length - 1].box = b.i; }
    });
    if (only) return out;
    R.parts.filter(p => p.role === 'shelf').forEach(p => (p.bays || []).forEach(j => box(p.name, Lay.bays[j].x, p.yc - th / 2, 0, Lay.bayW, th, p.h)));
    if (R.parts.some(p => p.role === 'door')) stairDoors().forEach((dr, i) => hexa('Door ' + (i + 1), [[dr.x, 2, -th], [dr.x + dr.w, 2, -th], [dr.x + dr.w, dr.hr, -th], [dr.x, dr.hl, -th], [dr.x, 2, 0], [dr.x + dr.w, 2, 0], [dr.x + dr.w, dr.hr, 0], [dr.x, dr.hl, 0]]));
    return out;
  }
  const prof = [[0, 0], [H, 0], [S.low, D], [0, D]], c = t === 'eaves' ? (Math.cos(eavesGeom().ang) || 1) : 1;
  Lay.verticals.forEach(v => {
    if (!inBox(v.box)) return;
    const part = v.name, x = v.x + dx;
    if (v.kind === 'divider') {
      if (t === 'eaves') prismX(part, x, x + th, [[th, 0], [H - th / c, 0], [S.low - th / c, D], [th, D]]);
      else box(part, x, base + th, 0, th, Hc - 2 * th, D);
    } else if (t === 'eaves') prismX(part, x, x + th, prof);
    else box(part, x, base, 0, th, Hc, D);
    out[out.length - 1].side = v.kind; out[out.length - 1].box = v.box;
  });
  Lay.boxes.forEach(b => {
    if (!inBox(b.i)) return;
    const x = b.x0 + dx;
    if (t === 'eaves') prismX(boxPart('Sloped Top', b), x + th, x + b.w - th, [[H, 0], [S.low, D], [S.low - th, D], [H - th, 0]]);
    else if (t === 'kitchenbase') { box('Top Rail', x + th, H - th, 0, b.w - 2 * th, th, 100); box('Top Rail', x + th, H - th, D - 100, b.w - 2 * th, th, 100); }
    else box(boxPart('Top', b), x + th, H - th, 0, b.w - 2 * th, th, D);
    box(boxPart('Bottom', b), x + th, base, 0, b.w - 2 * th, th, D - (t === 'kitchenbase' ? 20 : 0));
    if (R.parts.some(p => p.role === 'back')) box(boxPart('Back Panel', b), x, base, D, b.w, t === 'eaves' ? S.low : Hc, 3);
    out.filter(o => o.box === undefined).forEach(o => { o.box = b.i; });
  });
  if (only) return out;
  R.parts.filter(p => p.role === 'shelf').forEach((p, i, arr) => {
    const yc = p.yc ?? (th + (Hc - 2 * th) * (i + 1) / (arr.length + 1));
    Lay.bays.forEach(bay => box(p.name, bay.x, base + yc - th / 2, 0, Lay.bayW, th, Math.min(D, p.h)));
  });
  if (base) box('Plinth', 0, 0, 30, W, base, th);
  if (t === 'wardrobe') Lay.bays.forEach(bay => box('Hanging Rail', bay.x + 10, H - th - 90, D / 2 - 12, Lay.bayW - 20, 25, 25));
  // Doors and drawer fronts come from the front elevation, laid on the front face
  cabinetShapes().filter(s => /^Door( [A-Z])?$/.test(s.part) || s.part === 'Drawer Front').forEach(s => box(s.part, s.x, H - s.y - s.h, -th, s.w, s.h, th));
  return out;
}

function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(clamp(v * k, 0, 255)));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

// items: [{ part, v, f, fill, offset:[dx,dy,dz], label }]
function isoSVG(items, opt = {}) {
  const VW = opt.w || 640, VH = opt.h || 460, pad = 34;
  const ax = (opt.rx ?? -24) * Math.PI / 180, ay = (opt.ry ?? 36) * Math.PI / 180;
  const cX = Math.cos(ax), sX = Math.sin(ax), cY = Math.cos(ay), sY = Math.sin(ay);
  const rot = ([x, y, z]) => { const x1 = x * cY - z * sY, z1 = x * sY + z * cY; return [x1, y * cX - z1 * sX, y * sX + z1 * cX]; };
  const moved = items.map(it => ({ ...it, mv: it.v.map(p => it.offset ? [p[0] + it.offset[0], p[1] + it.offset[1], p[2] + it.offset[2]] : p) }));
  const allP = moved.flatMap(it => it.mv.map(rot));
  if (!allP.length) return '';
  const minX = Math.min(...allP.map(p => p[0])), maxX = Math.max(...allP.map(p => p[0]));
  const minY = Math.min(...allP.map(p => -p[1])), maxY = Math.max(...allP.map(p => -p[1]));
  const sc = Math.min((VW - pad * 2) / (maxX - minX || 1), (VH - pad * 2) / (maxY - minY || 1));
  const ox = (VW - (maxX - minX) * sc) / 2 - minX * sc, oy = (VH - (maxY - minY) * sc) / 2 - minY * sc;
  const scr = p => { const r = rot(p); return [ox + r[0] * sc, oy - r[1] * sc, r[2]]; };
  const cen = pts => pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map(c => c / pts.length);
  const light = [0.35, 0.6, -0.72];
  // Animated steps: each moving part is drawn twice. The "fly" copy slides from the exploded spot
  // into place, then swaps for the "land" copy drawn where it ends.
  const travel = it => { const a = scr(cen(it.mv)), b = scr(cen(it.v)); return [(b[0] - a[0]).toFixed(1), (b[1] - a[1]).toFixed(1)]; };
  // Order whole parts, not faces. Every part is a convex solid, and parts in an assembly only touch, so
  // for any two parts one of their face planes separates them. The part on the camera's side of that
  // plane is drawn later. Faces of one convex part never overlap each other, so their order is free.
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const solidsList = [];
  const addSolid = (it, verts, cls, mvd) => {
    const c = cen(verts);
    const normals = it.f.map(f => {
      let n = cross(sub(verts[f[1]], verts[f[0]]), sub(verts[f[2]], verts[f[0]]));
      const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
      return dot(n, sub(cen(f.map(i => verts[i])), c)) < 0 ? n.map(x => -x) : n;
    });
    solidsList.push({ it, verts, cls, mvd, normals, depth: rot(c)[2] });
  };
  moved.forEach(it => {
    if (opt.animate && it.offset) { addSolid(it, it.mv, 'm-fly', travel(it)); addSolid(it, it.v, 'm-land'); }
    else addSolid(it, it.mv);
  });
  const N = solidsList.length, ahead = solidsList.map(() => []), indeg = new Array(N).fill(0);
  const range = (vs, n) => { let lo = Infinity, hi = -Infinity; vs.forEach(v => { const d = dot(v, n); if (d < lo) lo = d; if (d > hi) hi = d; }); return [lo, hi]; };
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const A = solidsList[i], B = solidsList[j];
    for (const n of A.normals.concat(B.normals)) {
      const tz = rot(n)[2];
      if (Math.abs(tz) < 1e-6) continue;
      const [a0, a1] = range(A.verts, n), [b0, b1] = range(B.verts, n);
      const plus = a1 <= b0 + 0.5 ? j : b1 <= a0 + 0.5 ? i : -1;
      if (plus < 0) continue;
      // +n points at the camera when its view-space z is negative
      const front = tz < 0 ? plus : (plus === i ? j : i), back = front === i ? j : i;
      ahead[back].push(front); indeg[front]++;
      break;
    }
  }
  const order = [], done = new Array(N).fill(false);
  for (let k = 0; k < N; k++) {
    // Among parts with nothing left behind them, draw the farthest first; a cycle falls back to depth
    let pick = -1;
    for (let i = 0; i < N; i++) if (!done[i] && indeg[i] === 0 && (pick < 0 || solidsList[i].depth > solidsList[pick].depth)) pick = i;
    if (pick < 0) for (let i = 0; i < N; i++) if (!done[i] && (pick < 0 || solidsList[i].depth > solidsList[pick].depth)) pick = i;
    done[pick] = true; order.push(pick);
    ahead[pick].forEach(q => indeg[q]--);
  }
  const anim = f => f.cls ? ` class="${f.cls}"${f.mv ? ` data-dx="${f.mv[0]}" data-dy="${f.mv[1]}"` : ''}` : '';
  let s = `<svg viewBox="0 0 ${VW} ${VH}" class="m-iso" role="img" aria-label="${esc(opt.alt || 'Assembly drawing')}"><defs><marker id="mArr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${MP.ink}"/></marker></defs>`;
  order.forEach(idx => {
    const { it, verts, cls, mvd, normals } = solidsList[idx];
    it.f.forEach((f, fi) => {
      const nn = rot(normals[fi]);
      if (nn[2] > 0.02) return;
      const k = 0.78 + 0.26 * Math.max(0, nn[0] * light[0] + nn[1] * light[1] + nn[2] * light[2]);
      s += `<polygon${anim({ cls, mv: mvd })} points="${f.map(i => scr(verts[i])).map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="${shadeHex(it.fill, k)}" stroke="${MP.line}" stroke-width="1.1" stroke-linejoin="round"/>`;
    });
  });
  // Movement arrows for exploded parts, then letter callouts
  const seen = new Set();
  moved.forEach(it => {
    if (!it.offset) return;
    const a = scr(cen(it.mv)), b = scr(cen(it.v));
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 24) s += `<line${opt.animate ? ' class="m-arrow"' : ''} x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${MP.ink}" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#mArr)"/>`;
  });
  moved.forEach(it => {
    if (!it.label || seen.has(it.label + (it.offset ? 'o' : ''))) return;
    seen.add(it.label + (it.offset ? 'o' : ''));
    const p = scr(cen(it.mv)), lx = p[0] + 26, ly = p[1] - 26;
    const g = opt.animate && it.offset ? travel(it) : null;
    if (g) s += `<g class="m-fly-lab" data-dx="${g[0]}" data-dy="${g[1]}">`;
    s += `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${lx}" y2="${ly}" stroke="${MP.ink}" stroke-width="1"/><circle cx="${lx}" cy="${ly}" r="13" fill="${MP.paper}" stroke="${MP.ink}" stroke-width="1.4"/><text x="${lx}" y="${ly + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${MP.ink}" font-family="General Sans, sans-serif">${esc(it.label)}</text>`;
    if (g) s += '</g>';
  });
  return s + '</svg>';
}

// Letter each distinct part. Identical sizes share a letter, like a flat-pack manual.
function manualParts() {
  const groups = [];
  R.parts.filter(p => ['sheet', 'ply3', 'ply6', 'linear'].includes(p.stock)).forEach(p => {
    const key = p.name.replace(/ \d+$/, '') + '|' + p.w + '|' + p.h;
    let g = groups.find(x => x.key === key);
    if (!g) groups.push(g = { key, names: [], p, qty: 0 });
    g.names.push(p.name); g.qty += p.qty;
  });
  const map = {};
  groups.forEach((g, i) => { g.letter = String.fromCharCode(65 + i); g.names.forEach(n => { map[n] = g.letter; }); });
  return { groups, letterOf: n => map[n] };
}

function manualHardware() {
  const list = R.fittings.filter(f => !/jig/i.test(f.name)).map((f, i) => ({ ...f, id: 101 + i }));
  return { list, find: key => list.find(f => f.name.toLowerCase().includes(key.toLowerCase())) };
}

// Simple technical line drawings. Screws, pins and dowels are drawn at actual size (mm units).
function hwArt(name) {
  const n = name.toLowerCase(), ink = MP.ink;
  const mm = (w, h, body) => `<svg width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" class="m-hw-art" aria-hidden="true">${body}</svg>`;
  const screw = (L, d) => {
    let th = '';
    for (let x = 6; x < L - 3; x += 1.8) th += `<line x1="${x}" y1="${5 - d / 2}" x2="${x + 1.1}" y2="${5 + d / 2}" stroke="${ink}" stroke-width=".3"/>`;
    return mm(L + 2, 10, `<path d="M1,1.5 L4,1.5 L5.5,${5 - d / 2} L${L - 3},${5 - d / 2} L${L + 1},5 L${L - 3},${5 + d / 2} L5.5,${5 + d / 2} L4,8.5 L1,8.5 Z" fill="#fff" stroke="${ink}" stroke-width=".45"/>${th}`);
  };
  if (/pocket/.test(n)) return { art: screw(32, 4), actual: true };
  if (/connector/.test(n)) return { art: mm(34, 12, `<rect x="1" y="2.5" width="3" height="7" rx="1" fill="#E9EAEC" stroke="${ink}" stroke-width=".45"/><rect x="4" y="4" width="26" height="4" fill="#fff" stroke="${ink}" stroke-width=".45"/><rect x="30" y="2.5" width="3" height="7" rx="1" fill="#E9EAEC" stroke="${ink}" stroke-width=".45"/>`), actual: true };
  if (/packer/.test(n)) return { art: `<svg viewBox="0 0 60 40" width="60" height="40" class="m-hw-art" aria-hidden="true"><path d="M4,32 L56,32 L56,24 L4,30 Z" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/><path d="M8,22 L52,22 L52,14 L8,20 Z" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/></svg>` };
  if (/screw/.test(n)) return { art: screw(/32/.test(n) ? 32 : /30/.test(n) ? 30 : 40, 4), actual: true };
  if (/panel pin|nail/.test(n)) return { art: mm(27, 6, `<rect x="1" y="1.6" width="1" height="2.8" fill="${ink}"/><path d="M2,2.6 L24,2.6 L26,3 L24,3.4 L2,3.4 Z" fill="#fff" stroke="${ink}" stroke-width=".35"/>`), actual: true };
  if (/dowel/.test(n)) return { art: mm(32, 10, `<rect x="1" y="1" width="30" height="8" rx="2" fill="#F1E6D2" stroke="${ink}" stroke-width=".45"/>${[6, 11, 16, 21, 26].map(x => `<line x1="${x}" y1="1" x2="${x - 2}" y2="9" stroke="${ink}" stroke-width=".3"/>`).join('')}`), actual: true };
  if (/shelf pin/.test(n)) return { art: mm(16, 8, `<rect x="1" y="2.5" width="8" height="3" fill="#fff" stroke="${ink}" stroke-width=".4"/><rect x="9" y="1" width="1.4" height="6" fill="${ink}"/><rect x="10.4" y="2" width="4.6" height="4" rx=".6" fill="#fff" stroke="${ink}" stroke-width=".4"/>`), actual: true };
  if (/cam/.test(n)) return { art: mm(40, 16, `<circle cx="8" cy="8" r="7.5" fill="#E9EAEC" stroke="${ink}" stroke-width=".45"/><path d="M4,8 h8 M8,6.5 v3" stroke="${ink}" stroke-width=".7"/><path d="M18,6.6 h18 l2,1.4 l-2,1.4 h-18 z" fill="#fff" stroke="${ink}" stroke-width=".4"/><circle cx="18" cy="8" r="2.4" fill="#fff" stroke="${ink}" stroke-width=".45"/>`), actual: true };
  const px = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="m-hw-art" aria-hidden="true">${body}</svg>`;
  if (/hinge/.test(n)) return { art: px(96, 44, `<circle cx="20" cy="22" r="17" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/><circle cx="20" cy="22" r="11" fill="#fff" stroke="${ink}" stroke-width="1"/><path d="M34,15 h44 a6,6 0 0 1 6,6 v2 a6,6 0 0 1 -6,6 h-44 z" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/><circle cx="62" cy="22" r="2.5" fill="${ink}"/><circle cx="76" cy="22" r="2.5" fill="${ink}"/>`) };
  if (/bracket/.test(n)) return { art: px(56, 56, `<path d="M8,6 h12 v30 h30 v12 h-42 z" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="14" cy="18" r="2.6" fill="#fff" stroke="${ink}"/><circle cx="36" cy="42" r="2.6" fill="#fff" stroke="${ink}"/>`) };
  if (/leg/.test(n)) return { art: px(40, 70, `<rect x="6" y="4" width="28" height="8" rx="2" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/><rect x="13" y="12" width="14" height="44" fill="#fff" stroke="${ink}" stroke-width="1.4"/><rect x="9" y="56" width="22" height="9" rx="3" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/>`) };
  if (/runner/.test(n)) return { art: px(110, 36, `<rect x="4" y="6" width="100" height="10" rx="2" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/><rect x="4" y="20" width="100" height="10" rx="2" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/>`) };
  if (/handle|knob/.test(n)) return { art: px(56, 40, /knob/.test(n) ? `<circle cx="28" cy="20" r="14" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/><circle cx="28" cy="20" r="6" fill="#fff" stroke="${ink}"/>` : `<path d="M6,26 v-10 a4,4 0 0 1 4,-4 h36 a4,4 0 0 1 4,4 v10" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`) };
  if (/glue/.test(n)) return { art: px(36, 66, `<path d="M15,4 h6 l2,10 h-10 z" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/><rect x="6" y="14" width="24" height="48" rx="5" fill="#fff" stroke="${ink}" stroke-width="1.4"/><rect x="10" y="30" width="16" height="14" fill="#E9EAEC"/>`) };
  if (/socket|clip/.test(n)) return { art: px(44, 44, `<rect x="6" y="6" width="32" height="32" rx="6" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/><circle cx="22" cy="22" r="7" fill="#fff" stroke="${ink}" stroke-width="1.2"/>`) };
  return { art: px(44, 44, `<rect x="6" y="6" width="32" height="32" rx="4" fill="#E9EAEC" stroke="${ink}" stroke-width="1.4"/>`) };
}

function manualSteps() {
  const t = S.template, W = S.w, H = S.h, D = S.d;
  const has = n => R.parts.some(p => p.name === n);
  const names = role => R.parts.filter(p => p.role === role).map(p => p.name);
  const f = Math.max(2, Math.ceil(D / 150));
  const join = k => S.joinery === 'cam' ? [['cam lock', f * k], ['dowels', f * k]] : S.joinery === 'pocket' ? [['pocket-hole screws', f * k]] : [['wood screws', f * k]];
  const topName = t === 'eaves' || t === 'understairs' ? 'Sloped Top' : t === 'kitchenbase' ? 'Top Rail' : 'Top';
  const steps = [];
  const eaves = t === 'eaves', L = layout(), b0 = L.boxes[0], multi = L.n > 1;
  const v0 = L.verticals.filter(v => v.box === 0), rightName = v0[v0.length - 1].name, divNames = v0.filter(v => v.kind === 'divider').map(v => v.name), bName = boxPart('Bottom', b0), tName = t === 'kitchenbase' ? 'Top Rail' : boxPart(topName, b0), backName = boxPart('Back Panel', b0);
  const box0Divs = b0.k - 1, scope = multi ? 'box' : null;
  const makeNote = multi ? (L.boxes.some(b => b.k !== b0.k) ? ` Build ${L.boxes.filter(b => b.k === b0.k).length} boxes like this, and ${L.boxes.filter(b => b.k !== b0.k).length} with ${L.boxes.find(b => b.k !== b0.k).k} compartment${L.boxes.find(b => b.k !== b0.k).k > 1 ? 's' : ''}.` : ` Build ${L.n} boxes like this.`) : '';
  // Same order as a carpenter: base, right side, dividers onto the base, top down onto them,
  // back on while it is still out in the room, then into place, then the loose parts.
  steps.push({ scope, times: multi ? L.n : 0, add: [bName], ex: { [bName]: [b0.w * 0.4, 0, 0] }, hw: [...join(1), ...(S.joinery === 'cam' ? [] : [['glue', 0]])], note: 'Work on a flat floor with the box on its back. Fix the bottom to the left side, flush at the front.' + makeNote });
  steps.push({ scope, add: [rightName], ex: { [rightName]: [b0.w * 0.45, 0, 0] }, hw: join(1), note: 'Fix the right side to the bottom.', twoPeople: H > 1500 });
  if (box0Divs > 0) steps.push({ scope, add: divNames, ex: Object.fromEntries(divNames.map(n => [n, [0, H * 0.9, 0]])), hw: join(box0Divs), note: `Stand the divider${box0Divs > 1 ? 's' : ''} on the bottom, ${L.bayW}mm apart. Use a spacer cut to that width to keep ${box0Divs > 1 ? 'them' : 'it'} square, then screw through the underside of the bottom.` });
  steps.push({ scope, add: [tName], ex: { [tName]: [0, H * 0.6, 0] }, hw: join(2 + box0Divs), note: eaves ? `Lay the sloped top on and screw it down into the sides${box0Divs ? ' and every divider' : ''}.` : t === 'understairs' ? `Bevel the top edges of the uprights to the stair angle. Lay the sloped top on them and screw it down into each one.` : 'Lay the top on, flush at the front, and screw it down.' });
  if (R.parts.some(p => p.role === 'back')) steps.push({ scope, add: [backName], ex: { [backName]: [0, 0, D * 1.1] }, hw: [['panel pins', Math.ceil(2 * (b0.w + (eaves ? S.low : H)) / 150) + box0Divs * Math.ceil((eaves ? S.low : H) / 150)], ['glue', 0]], note: (eaves ? 'Turn the box face down. Measure corner to corner both ways: when they match it is square. Glue and pin the back on now, before it goes under the eaves.' : 'Turn the box face down. Measure corner to corner both ways: when they match it is square. Glue and pin the back every 150mm.'), check: true });
  if (multi) steps.push({ join: true, add: [], hw: [['connector', (S.h > 900 ? 4 : 3)]], note: `Carry the boxes in one at a time${eaves ? ' and slide each back under the slope' : ''}. Stand each one beside the last with the fronts and tops flush, clamp the sides together and drill ${S.h > 900 ? 4 : 3} holes through both. Fit the connector screws.`, twoPeople: H > 1200 });
  if (has('Plinth')) steps.push({ add: ['Plinth'], ex: { Plinth: [0, -H * 0.1, -D * 0.7] }, hw: [['legs', 4], ['plinth clips', 4]], note: 'Screw on the legs. Level the unit, then clip the plinth onto the front legs.' });
  const wallHw = eaves ? [['angle brackets', 6]] : t === 'wardrobe' ? [['anti-tip', 2]] : t === 'kitchenwall' ? [['wall hanging', 2]] : t === 'shelving' ? [['wall fixing', 4]] : [];
  steps.push({ add: [], wall: true, hw: wallHw.map(([k, q]) => [k, multi && !/anti|hanging/.test(k) ? 2 * L.n + 2 : q * L.n]), note: eaves ? `${multi ? 'Push the joined boxes' : 'Slide it'} back under the slope, leaving a 25mm air gap behind. Level ${multi ? 'them' : 'it'} with packers, then screw brackets to the floor and into the knee wall studs.` : `Level ${multi ? 'the boxes' : 'it'}, then fix ${multi ? 'each one' : 'it'} to the wall studs.`, twoPeople: true });
  const shelves = names('shelf');
  if (shelves.length) steps.push({ add: shelves, ex: Object.fromEntries(shelves.map(n => [n, [0, 0, -D * 1.05]])), hw: [['shelf pins', 4 * R.parts.filter(p => p.role === 'shelf').reduce((a, p) => a + p.qty, 0)]], note: 'Push the pins into the holes you drilled, then rest each shelf on four pins.' });
  if (has('Hanging Rail')) steps.push({ add: ['Hanging Rail'], ex: { 'Hanging Rail': [0, 0, -D * 0.9] }, hw: [['rail end sockets', 2]], note: 'Screw the sockets to the sides, then drop the rail in.' });
  if (has('Drawer Front')) steps.push({ add: ['Drawer Front'], ex: { 'Drawer Front': [0, 0, -D * 0.8] }, hw: [['runners', 1]], note: 'Build the drawer box from its sides, back and base. Fit the runners, then slide it in.' });
  const doorParts = R.parts.filter(p => p.role === 'door');
  if (doorParts.length) {
    const nd = doorParts.reduce((a, p) => a + p.qty, 0), names = doorParts.map(p => p.name);
    steps.push({ add: names, ex: Object.fromEntries(names.map(n => [n, [0, 0, -D * 0.7]])), hw: [['hinges', doorParts[0].hinges.length * nd], ['knob', nd], ['handles', nd]], note: 'Clip each hinge onto its plate. Turn the adjusting screws until the gaps are even.', twoPeople: H > 1500 });
  }
  return steps;
}

function hwCallouts(hwList, find) {
  return hwList.map(([key, qty]) => {
    const f = find(key);
    if (!f) return '';
    const a = hwArt(f.name);
    return `<div class="m-call">${a.art}<div><b>${qty ? qty + 'x' : ''}</b><span>${f.id}</span></div></div>`;
  }).join('');
}

// Manual page: one side panel lying flat with every shelf-pin hole marked and dimensioned
function pinHoleSVG() {
  const rows = pinRows(), shelf = R.parts.find(p => p.role === 'shelf');
  if (!rows.length || !shelf) return '';
  const eaves = S.template === 'eaves', D = eaves ? eavesGeom().run : S.d, H = S.h - (S.template === 'kitchenbase' ? 100 : 0), L = eaves ? S.low : H;
  const sc = Math.min(300 / D, 330 / H), pad = 60, w = D * sc, h = H * sc;
  const X = x => pad + x * sc, Y = y => pad + h - y * sc;
  const ink = MP.ink, back = Math.min(D, shelf.h + (S.scribe ? 2 : 0)) - 37;
  let g = `<polygon points="${X(0)},${Y(0)} ${X(D)},${Y(0)} ${X(D)},${Y(L)} ${X(0)},${Y(H)}" fill="${MP.wood}" stroke="${ink}" stroke-width="1.6"/>`;
  g += `<text x="${X(0) - 8}" y="${Y(H / 2)}" font-size="12" text-anchor="end" fill="${ink}" font-family="General Sans, sans-serif">front</text>`;
  rows.forEach(r => {
    [37, back].forEach(x => { g += `<circle cx="${X(x)}" cy="${Y(r.y)}" r="4" fill="#fff" stroke="${ink}" stroke-width="1.4"/>`; });
    g += `<line x1="${X(D) + 10}" y1="${Y(r.y)}" x2="${X(D) + 18}" y2="${Y(r.y)}" stroke="${ink}"/><text x="${X(D) + 22}" y="${Y(r.y) + 4}" font-size="12" fill="${ink}" font-family="JetBrains Mono, monospace">${r.y}</text>`;
  });
  g += `<text x="${X(37)}" y="${Y(0) + 20}" font-size="12" text-anchor="middle" fill="${ink}" font-family="JetBrains Mono, monospace">37</text>`;
  return `<svg viewBox="0 0 ${w + pad * 2 + 40} ${h + pad * 2}" class="m-iso" role="img" aria-label="Side panel lying flat with the shelf-pin holes marked">${g}</svg>`;
}

function renderManual(print = false) {
  if (!isCabinet(S.template)) return `<div class="callout"><i class="ph ph-info" aria-hidden="true"></i><span>The picture manual is for furniture designs. Building work uses the step-by-step guide.</span></div>`;
  const solids = partSolids();
  const { groups, letterOf } = manualParts();
  const hw = manualHardware();
  const steps = manualSteps();
  const tools = [...new Set(buildSteps().flatMap(s => s.tools))];
  const pages = [];
  const page = (inner, cls = '') => `<section class="m-page ${cls}">${inner}</section>`;
  // Cover
  const cover = isoSVG(solids.map(s => ({ ...s, fill: s.part === 'Back Panel' ? MP.done : MP.wood })), { alt: designName(), h: 500 });
  pages.push(page(`<div class="m-cover-head"><h3>${esc(designName())}</h3><div class="m-dims">${fmt(S.w)} x ${fmt(S.h)} x ${fmt(S.d)}</div></div>${cover}
    <div class="m-meta"><div class="m-people"><i class="ph ph-${S.h > 1200 || S.w > 1500 ? 'users' : 'user'}" aria-hidden="true"></i>${S.h > 1200 || S.w > 1500 ? '2 people' : '1 person'}</div>
    <div class="m-tools">${tools.map(t => `<span><i class="ph ph-${TOOL_ICONS[t] || 'wrench'}" aria-hidden="true"></i>${esc(t)}</span>`).join('')}</div></div>`, 'm-cover'));
  // Parts
  const maxDim = Math.max(...groups.map(g => Math.max(g.p.w, g.p.h)));
  pages.push(page(`<h4 class="m-h">Parts</h4><div class="m-parts">${groups.map(g => {
    const sc = 120 / maxDim, w = Math.max(8, g.p.w * sc), h = Math.max(6, g.p.h * sc);
    const shape = g.p.shape ? `<polygon points="0,${h} ${w},${h} ${w},${h - g.p.shape.back * sc} 0,0" fill="${MP.wood}" stroke="${MP.ink}" stroke-width="1.2" transform="translate(2 2)"/>` : `<rect x="2" y="2" width="${w}" height="${h}" fill="${g.p.stock === 'linear' ? '#E9EAEC' : MP.wood}" stroke="${MP.ink}" stroke-width="1.2"/>`;
    return `<div class="m-part"><span class="m-letter">${g.letter}</span><svg viewBox="0 0 ${w + 4} ${h + 4}" width="${w + 4}" height="${h + 4}" aria-hidden="true">${shape}</svg><div class="m-pq">${g.qty}x</div><div class="m-pn">${esc(g.p.name.replace(/ \d+$/, ''))}</div><div class="m-ps">${Math.round(g.p.w)} x ${Math.round(g.p.h)}</div></div>`;
  }).join('')}</div>`));
  // Hardware
  pages.push(page(`<h4 class="m-h">Hardware</h4><p class="m-sub">Screws, pins and dowels are printed at actual size. Lay yours on top to check.</p><div class="m-hw">${hw.list.map(f => { const a = hwArt(f.name); return `<div class="m-hwi">${a.art}<div class="m-hwq"><b>${f.total_qty}x</b> <span>${f.id}</span></div><div class="m-hwn">${esc(f.name)}${a.actual ? ' <em>1:1</em>' : ''}</div></div>`; }).join('')}</div>`));
  // Safety
  const sc = safetyChecks().filter(c => c.status !== 'pass');
  if (sc.length) pages.push(page(`<h4 class="m-h">Before you start</h4><ul class="m-safety">${sc.map(c => `<li><i class="ph ph-${SAFETY_ICON[c.status]}" aria-hidden="true"></i><div><b>${esc(c.title)}</b><span>${esc(c.text)}</span></div></li>`).join('')}</ul>`));
  // Drill first, while every panel is flat
  const holes = pinHoleSVG(), hasDiv = R.parts.some(p => p.role === 'divider');
  if (holes) pages.push(page(`<h4 class="m-h">Drill first</h4><div class="m-calls">${hwCallouts([['shelf pins', 0]], hw.find)}</div>${holes}<p class="m-note">Lay each side${hasDiv ? ' and divider' : ''} flat, inside face up. Drill 5mm holes 10mm deep at these heights, measured up from the bottom edge.${hasDiv ? ' Drill right through the dividers so one hole holds a pin on each side.' : ''}</p>`));
  // Assembly. Multi-box units: the first steps show one box on its own, then a step joins them all.
  const Lay = layout(), oneBox = Lay.n > 1 ? partSolids({ box: 0 }) : null;
  let built = ['Left Side'];
  steps.forEach((st, i) => {
    const items = [];
    if (st.join) {
      solids.filter(s => s.box != null).forEach(s => items.push(s.box === Lay.n - 1
        ? { ...s, fill: MP.add, offset: [Lay.boxes[Lay.n - 1].w * 0.5, 0, 0], label: letterOf(s.part) }
        : { ...s, fill: MP.done }));
      built = [...new Set(solids.filter(s => s.box != null).map(s => s.part))];
    }
    else (st.scope === 'box' && oneBox ? oneBox : solids).forEach(s => {
      if (built.includes(s.part)) items.push({ ...s, fill: MP.done, label: st.wall ? letterOf(s.part) : null });
      else if (st.add.includes(s.part)) items.push({ ...s, fill: MP.add, offset: st.ex && st.ex[s.part], label: letterOf(s.part) });
    });
    if (i === 0) items.forEach(it => { if (it.part === 'Left Side') it.label = letterOf('Left Side'); });
    const art = isoSVG(items, { alt: 'Step ' + (i + 1), animate: !print && items.some(it => it.offset) });
    pages.push(page(`<div class="m-step-head"><span class="m-n">${i + 1}</span>${st.times ? `<span class="m-2p"><i class="ph ph-copy" aria-hidden="true"></i>Make ${st.times} boxes</span>` : ''}${st.twoPeople ? `<span class="m-2p"><i class="ph ph-users" aria-hidden="true"></i>2 people</span>` : ''}</div>
      <div class="m-calls">${hwCallouts(st.hw, hw.find)}</div>${art}
      ${st.check ? `<div class="m-check"><svg viewBox="0 0 120 80" width="120" height="80" aria-hidden="true"><rect x="10" y="10" width="100" height="60" fill="none" stroke="${MP.ink}" stroke-width="2"/><line x1="10" y1="10" x2="110" y2="70" stroke="${MP.add}" stroke-width="2"/><line x1="110" y1="10" x2="10" y2="70" stroke="${MP.add}" stroke-width="2"/></svg><span>A = B</span></div>` : ''}
      ${st.wall ? `<div class="m-warn"><i class="ph ph-warning" aria-hidden="true"></i>Check for pipes and cables before you drill.</div>` : ''}
      <p class="m-note">${esc(st.note)}</p>`));
    if (!st.join) built = built.concat(st.add);
  });
  pages.push(page(`<div class="m-done"><i class="ph ph-check-circle" aria-hidden="true"></i><h4 class="m-h">Done</h4><p class="m-note">Check every screw is tight.${R.parts.some(p => p.role === 'door') ? ' Re-check the doors after a week as the hinges settle.' : ''}</p></div>`));
  const play = print ? '' : `<div class="m-play"><button type="button" class="chip" data-action="manual-anim" aria-pressed="${S.manualAnim !== false}"><i class="ph ph-${S.manualAnim !== false ? 'pause' : 'play'}" aria-hidden="true"></i>${S.manualAnim !== false ? 'Pause animations' : 'Play animations'}</button></div>`;
  return `<div class="manual${!print && S.manualAnim !== false ? ' anim' : ''}">${play}${pages.join('')}</div>`;
}

// ── Order ──
// What this design asks of a cutter, and which services can do it near you
function orderNeeds() {
  const panels = R.parts.filter(p => p.stock === 'sheet' || p.stock === 'ply3' || p.stock === 'ply6');
  const holes = panels.reduce((a, p) => a + panelHoles(p).length * p.qty, 0);
  const angles = panels.some(p => p.shape || /Bevel/.test(p.note || ''));
  const edging = panels.some(p => p.edge);
  return { panels, holes, angles, edging, pieces: panels.reduce((a, p) => a + p.qty, 0) };
}
// What each fitting is called in shops and the pack size it usually comes in.
// Amazon and Screwfix links are searches, so they never point at a dead listing.
// To turn on the one-click Amazon basket, add an Associates tag and a checked ASIN per item.
const AMAZON_TAG = '';
const SHOP = [
  [/hinge/i, { q: 'soft close cabinet hinges 35mm full overlay', pack: 10, asin: '' }],
  [/shelf pin/i, { q: 'shelf support pins 5mm metal', pack: 50, asin: '' }],
  [/wood screws/i, { q: 'wood screws 4x40mm', pack: 200, asin: '' }],
  [/pocket-hole screws/i, { q: 'pocket hole screws 32mm', pack: 100, asin: '' }],
  [/pocket-hole jig/i, { q: 'pocket hole jig', pack: 1, asin: '' }],
  [/glue/i, { q: 'PVA wood glue', pack: 1, asin: '' }],
  [/cam lock/i, { q: 'cam lock fittings 15mm with bolts', pack: 20, asin: '' }],
  [/dowel/i, { q: 'wooden dowels 8x30mm', pack: 100, asin: '' }],
  [/panel pins/i, { q: 'panel pins 25mm', pack: 300, asin: '' }],
  [/connector screws/i, { q: 'cabinet connector screws', pack: 20, asin: '' }],
  [/packers/i, { q: 'plastic packers assorted', pack: 1, asin: '' }],
  [/angle brackets/i, { q: 'angle brackets 40mm', pack: 20, asin: '' }],
  [/anti-tip/i, { q: 'furniture anti tip wall brackets', pack: 2, asin: '' }],
  [/wall fixing brackets/i, { q: 'furniture wall fixing brackets', pack: 10, asin: '' }],
  [/hanging brackets/i, { q: 'wall cabinet hanging brackets', pack: 2, asin: '' }],
  [/knob/i, { q: 'cupboard door knobs', pack: 1, asin: '' }],
  [/handle/i, { q: 'cabinet handles', pack: 1, asin: '' }],
  [/drawer runners/i, { q: 'drawer runners 400mm soft close pair', pack: 1, asin: '' }],
  [/plinth clips/i, { q: 'kitchen plinth clips', pack: 10, asin: '' }],
  [/legs/i, { q: 'adjustable cabinet legs', pack: 4, asin: '' }],
  [/rail end/i, { q: 'wardrobe rail end sockets', pack: 2, asin: '' }]
];
function shopItem(f) {
  const hit = SHOP.find(([re]) => re.test(f.name)), spec = hit ? hit[1] : { q: f.name.replace(/\(.*?\)/g, ''), pack: 1, asin: '' };
  const packs = Math.max(1, Math.ceil(f.total_qty / spec.pack));
  return { ...f, ...spec, packs, spare: packs * spec.pack - f.total_qty };
}
const amazonSearch = q => 'https://www.amazon.co.uk/s?k=' + encodeURIComponent(q) + (AMAZON_TAG ? '&tag=' + encodeURIComponent(AMAZON_TAG) : '');
const screwfixSearch = q => 'https://www.screwfix.com/search?search=' + encodeURIComponent(q);
// One link that puts every item in the user's Amazon basket. Only product IDs and quantities go in it, no user data.
function amazonBasket(items) {
  const ok = items.filter(i => /^[A-Z0-9]{10}$/.test(i.asin));
  if (!AMAZON_TAG || ok.length !== items.length) return '';
  return 'https://www.amazon.co.uk/gp/aws/cart/add.html?AssociateTag=' + encodeURIComponent(AMAZON_TAG) + ok.map((i, n) => `&ASIN.${n + 1}=${i.asin}&Quantity.${n + 1}=${i.packs}`).join('');
}
function shoppingList() {
  return R.fittings.map(shopItem).map(i => `${i.packs} x ${i.name}${i.pack > 1 ? ` (pack of ${i.pack})` : ''}: need ${i.total_qty}`).join('\n');
}
function hardwareCard() {
  const items = R.fittings.map(shopItem), basket = amazonBasket(items);
  return `<div class="card">
    <h3><i class="ph ph-wrench" aria-hidden="true"></i>Hardware pack</h3>
    <p class="sub">Cutters supply boards only. Buy these yourself while the panels are being cut. Quantities are rounded up to whole packs.</p>
    ${basket ? `<a class="btn btn-primary" href="${basket}" target="_blank" rel="noopener noreferrer"><i class="ph ph-shopping-cart" aria-hidden="true"></i>Add all to Amazon basket</a>` : ''}
    <button type="button" class="btn btn-ghost" data-action="copy-shopping"><i class="ph ph-copy" aria-hidden="true"></i>Copy shopping list</button>
    <ul class="lines hw">${items.map(i => `<li><span>${esc(i.name)}<small>Need ${i.total_qty}. ${i.pack > 1 ? `Buy ${i.packs} pack${i.packs > 1 ? 's' : ''} of ${i.pack}${i.spare ? `, ${i.spare} spare` : ''}` : `Buy ${i.packs}`}${i.note ? '. ' + esc(i.note) : ''}</small>
      <span class="sup-act"><a class="chip" href="${amazonSearch(i.q)}" target="_blank" rel="noopener noreferrer">Amazon</a><a class="chip" href="${screwfixSearch(i.q)}" target="_blank" rel="noopener noreferrer">Screwfix</a></span></span><span>${gbp(i.total_cost)}</span></li>`).join('')}</ul>
    <p class="fine">Pick branded fittings. Shelf pins must be rated 12kg or more each. Prices are estimates for the amount you use.</p>
  </div>`;
}
function cutterCard() {
  if (!isCabinet(S.template)) return `<div class="card"><h3><i class="ph ph-storefront" aria-hidden="true"></i>Where to buy</h3><p class="sub">Timber merchants deliver C16 and boards cut to length. Take the timber list to your nearest merchant.</p></div>`;
  const need = orderNeeds(), pc = (S.postcode || '').trim().toUpperCase(), area = (pc.match(/^([A-Z]{1,2})\d/) || [])[1];
  const serves = sup => sup.area === 'uk' || sup.area === 'store' || (area && Array.isArray(sup.area) && sup.area.includes(area));
  const req = [['angles', need.angles, 'Angled cuts', 'Angled cuts'], ['drilling', need.holes > 0, `${need.holes} holes`, 'Drilling'], ['edging', need.edging, 'Edge banding', 'Edge banding']].filter(r => r[1]);
  const score = sup => req.reduce((a, [k]) => a + (sup[k] === 'yes' ? 0 : sup[k] === 'ask' ? 1 : 10), 0) + (serves(sup) ? 0 : 20);
  const list = SUPPLIERS.filter(sup => serves(sup) || !area).sort((x, y) => score(x) - score(y));
  const badge = (sup, k, label) => `<span class="cap cap-${sup[k]}"><i class="ph ph-${sup[k] === 'yes' ? 'check' : sup[k] === 'no' ? 'x' : 'question'}" aria-hidden="true"></i>${esc(label)}${sup[k] === 'ask' ? ': ask' : ''}</span>`;
  const mail = sup => {
    const body = [`Hello ${sup.name},`, '', `Please quote for cutting this project${pc ? ' and delivery to ' + pc : ''}.`, '',
      `Material: ${MATERIALS[S.material].name} ${S.thickness}mm${R.sheets.ply3 ? ', plus 3mm backs' : ''}`, `Pieces: ${need.pieces} (about ${R.nMain} sheets)`,
      need.angles ? 'Some panels have angled cuts (shown in the DXF).' : '', need.holes ? `Drilling: ${need.holes} holes (DXF layers starting DRILL_, named by diameter and depth, measured from the front or hinge edge).` : '',
      need.edging ? 'Edge banding: see the Edge columns in the CSV.' : '', '', `Attached: ${safeName(S.name)}-CNC.csv and ${safeName(S.name)}.dxf`, '', 'Thank you'].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
    return `mailto:${sup.email || ''}?subject=${encodeURIComponent('Cut-to-size quote: ' + S.name)}&body=${encodeURIComponent(body)}`;
  };
  return `<div class="card cutters">
    <h3><i class="ph ph-storefront" aria-hidden="true"></i>Send to a cutter</h3>
    <p class="sub">Your order pack has every panel, its shape, its edging and every hole to drill. ${req.length ? 'This design needs: ' + req.map(r => r[2]).join(', ') + '.' : ''}</p>
    <button type="button" class="btn btn-primary" data-action="order-pack"><i class="ph ph-download-simple" aria-hidden="true"></i>Download the order pack</button>
    <span class="help">Two files: a cut list spreadsheet (CSV) and a drawing (DXF) with shapes and holes.</span>
    ${area ? `<p class="sub">Showing services that deliver to ${esc(area)}.</p>` : '<p class="sub">Add your postcode under Delivery to see who serves your area.</p>'}
    <ul class="sup-list">${list.map(sup => `<li class="sup${score(sup) >= 10 ? ' sup-poor' : ''}">
      <div class="sup-head"><strong>${esc(sup.name)}</strong>${score(sup) === 0 ? '<span class="cap cap-yes">Good match</span>' : ''}</div>
      <div class="sup-meta">${esc(sup.howTo)}. ${sup.lead !== 'Ask' ? esc(sup.lead) + '. ' : ''}${esc(sup.note)}</div>
      ${req.length ? `<div class="caps">${req.map(([k, , , label]) => badge(sup, k, label)).join('')}</div>` : ''}
      <div class="sup-act"><a class="chip" href="${sup.url}" target="_blank" rel="noopener noreferrer"><i class="ph ph-arrow-square-out" aria-hidden="true"></i>Open site</a>${sup.area === 'store' ? '' : `<a class="chip" href="${mail(sup)}"><i class="ph ph-envelope-simple" aria-hidden="true"></i>${sup.email ? 'Email order' : 'Draft email'}</a>`}</div>
    </li>`).join('')}</ul>
    <p class="fine">Details from each company's website, October 2026. "Ask" means they do not say. Your quote and their terms are final.</p>
  </div>`;
}

function renderOrderPage() {
  const c = R.costs;
  const lines = [];
  if (R.nMain && isCabinet(S.template)) lines.push([`${MATERIALS[S.material].name} ${S.thickness}mm, cut to size`, `${R.nMain} sheet${R.nMain > 1 ? 's' : ''}, ${R.parts.filter(p => p.stock === 'sheet').reduce((s, p) => s + p.qty, 0)} pieces`, c.panels]);
  if (R.sheets.ply3) lines.push([THIN.ply3.name, `${R.sheets.ply3.sheets.length} sheet`, R.sheets.ply3.sheets.length * THIN.ply3.price]);
  if (R.sheets.ply6) lines.push([THIN.ply6.name, `${R.sheets.ply6.sheets.length} sheet`, R.sheets.ply6.sheets.length * THIN.ply6.price]);
  R.linear.forEach(g => lines.push([g.section, `${g.count} x ${fmtLen(g.stock)}${g.long.length ? ', plus long lengths' : ''}`, g.cost]));
  R.whole.forEach(p => lines.push([WHOLE[p.kind].name, `${p.qty} boards`, p.qty * WHOLE[p.kind].price]));
  R.rolls.forEach(p => lines.push(['Breathable membrane', `${p.rolls} roll${p.rolls > 1 ? 's' : ''}`, p.rolls * FELT_ROLL]));
  const pcErr = S.postcode && !/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(S.postcode.trim());
  return `<div class="page">
    <div class="page-head"><div><h2>Order your materials</h2><p>Send the order pack to a cutting service. They cut, drill, edge and deliver every panel, ready to build like flat-pack.</p></div></div>
    ${safetyChecks().some(c => c.status === 'fail') ? `<div class="callout warn"><i class="ph ph-warning" aria-hidden="true"></i><span><strong>A safety check failed.</strong> Go back to Design and fix it before you order.</span><button type="button" class="chip" data-action="goto" data-step="1">Fix it</button></div>` : ''}
    <div class="order">
      <div>
        <div class="card">
          <h3><i class="ph ph-package" aria-hidden="true"></i>Materials</h3>
          <ul class="lines">${lines.map(([a, b, p]) => `<li><span>${esc(a)}<small>${esc(b)}</small></span><span>${gbp(p)}</span></li>`).join('')}</ul>
          ${S.template !== 'pitchedroof' && isCabinet(S.template) ? `<div class="price-in"><label for="f-priceSheet">Price per sheet (edit to match your quote)</label><input id="f-priceSheet" class="input" type="number" min="0" step="0.5" value="${R.sheetPrice}" data-field="priceSheet"></div>` : ''}
        </div>
        ${hardwareCard()}
        <div class="card">
          <h3><i class="ph ph-truck" aria-hidden="true"></i>Delivery</h3>
          <div class="field" style-mt>
            <label for="f-postcode">Delivery postcode</label>
            <input id="f-postcode" class="input" autocomplete="postal-code" maxlength="8" value="${esc(S.postcode)}" data-field="postcode" aria-invalid="${pcErr}" aria-describedby="pcHelp">
            <span class="help" id="pcHelp">Used to pick a supplier near you. It stays on this device.</span>
            ${pcErr ? '<span class="err">That does not look like a UK postcode.</span>' : ''}
          </div>
          <div class="opts" role="radiogroup" aria-label="Delivery">${DELIVERY.map(d => `<label class="opt"><input type="radio" name="delivery" value="${d.id}" data-field="delivery"${S.delivery === d.id ? ' checked' : ''}><span><span class="t">${d.t}</span><br><span class="s">${d.s}</span></span><span class="p">${d.p ? gbp0(d.p) : 'Free'}</span></label>`).join('')}</div>
        </div>
        ${cutterCard()}
      </div>
      <aside class="card summary" aria-label="Order summary">
        <h3>Summary</h3>
        <ul class="lines">
          <li><span>Materials</span><span>${gbp(R.materials)}</span></li>
          <li><span>Hardware</span><span>${gbp(c.hardware)}</span></li>
          ${c.edging ? `<li><span>Edge banding</span><span>${gbp(c.edging)}</span></li><li><span>Glue and finish</span><span>${gbp(c.finish)}</span></li>` : ''}
          <li><span>Delivery</span><span>${c.delivery ? gbp(c.delivery) : 'Free'}</span></li>
        </ul>
        <div class="total"><span>Estimated total</span><span>${gbp0(R.total)}</span></div>
        <p class="fine">Estimate from typical UK prices. Your supplier's quote is final.</p>
        <button type="button" class="btn btn-primary btn-lg" data-action="export-cnc"><i class="ph ph-file-arrow-down" aria-hidden="true"></i>Download CNC cut file</button>
        <button type="button" class="btn btn-ghost" data-action="print"><i class="ph ph-printer" aria-hidden="true"></i>Print order and build guide</button>
        <div class="files">
          <button type="button" class="chip" data-action="export-csv"><i class="ph ph-file-csv" aria-hidden="true"></i>CSV</button>
          <button type="button" class="chip" data-action="export-dxf"><i class="ph ph-file-text" aria-hidden="true"></i>DXF</button>
          <button type="button" class="chip" data-action="export-json"><i class="ph ph-file-text" aria-hidden="true"></i>JSON</button>
        </div>
        <div class="callout"><i class="ph ph-info" aria-hidden="true"></i><span>Coming next: order and pay here, with cut, drilled and edged panels delivered in 3 to 4 working days. Until then, send the order pack to a cutter.</span></div>
      </aside>
    </div>
  </div>`;
}

function afterPage() {
  // Size timber bar segments without inline style attributes
  $$('[data-dx]', $('#pageCol')).forEach(el => { el.style.setProperty('--dx', el.dataset.dx + 'px'); el.style.setProperty('--dy', el.dataset.dy + 'px'); });
  $$('[style-w]', $('#pageCol')).forEach(el => { el.style.flex = '0 0 ' + (Number(el.getAttribute('style-w')) * 100) + '%'; el.removeAttribute('style-w'); });
  $$('[style-mt]', $('#pageCol')).forEach(el => { el.style.marginTop = '16px'; el.removeAttribute('style-mt'); });
}


// ───────────────────────── Hero scene ─────────────────────────
// A loft room drawn in true perspective from one fixed camera, so "before" and "after" line up exactly.
// Units are mm. x across the room, y up, z away from the camera. The knee wall is at z = KZ, roof pitch 45 deg.
function heroScene(after, d) {
  const VW = 1200, VH = 800, F = 1100, CX = 600, CY = 330, CAM = { x: 1500, y: 1350 };
  const L = d.w, KZ = 5000, KH = d.low, RIDGE = 2600;
  const P = (x, y, z) => [CX + F * (x - CAM.x) / z, CY - F * (y - CAM.y) / z];
  const pts = a => a.map(v => P(...v).map(n => n.toFixed(1)).join(',')).join(' ');
  const poly = (a, fill, extra = '') => `<polygon points="${pts(a)}" fill="${fill}"${extra}/>`;
  const slopeZ = y => KZ - (y - KH); // 45 deg roof
  const zr = slopeZ(RIDGE);
  let s = `<svg viewBox="0 0 ${VW} ${VH}" class="hero-svg" role="img" aria-label="${after ? 'The loft with built-in cupboards under the eaves' : 'An empty loft with boxes stacked under the eaves'}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="hsSlope${+after}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBFAF7"/><stop offset="1" stop-color="#E9E6E0"/></linearGradient>
    <linearGradient id="hsFloor${+after}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9A57A"/><stop offset="1" stop-color="#DDBE93"/></linearGradient>
    <linearGradient id="hsGlass${+after}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FC3DD"/><stop offset="1" stop-color="#E4EEF4"/></linearGradient>
    <linearGradient id="hsIn${+after}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A3F3A"/><stop offset="1" stop-color="#5B625A"/></linearGradient>
  </defs>
  <rect width="${VW}" height="${VH}" fill="#F3F1EC"/>`;
  const zn = 1200; // near plane for walls that run off screen
  // Floor and boards
  s += poly([[0, 0, zn], [L, 0, zn], [L, 0, KZ], [0, 0, KZ]], `url(#hsFloor${+after})`);
  for (let x = 0; x <= L; x += 160) s += `<line x1="${P(x, 0, zn)[0].toFixed(1)}" y1="${P(x, 0, zn)[1].toFixed(1)}" x2="${P(x, 0, KZ)[0].toFixed(1)}" y2="${P(x, 0, KZ)[1].toFixed(1)}" stroke="#B48F63" stroke-width="1" opacity=".55"/>`;
  // Gable walls, knee wall, slope, flat ceiling
  s += poly([[0, 0, zn], [0, 0, KZ], [0, KH, KZ], [0, RIDGE, zr], [0, RIDGE, zn]], '#E2DED7');
  s += poly([[L, 0, zn], [L, 0, KZ], [L, KH, KZ], [L, RIDGE, zr], [L, RIDGE, zn]], '#E9E6E0');
  s += poly([[0, 0, KZ], [L, 0, KZ], [L, KH, KZ], [0, KH, KZ]], '#ECE9E3');
  s += poly([[0, KH, KZ], [L, KH, KZ], [L, RIDGE, zr], [0, RIDGE, zr]], `url(#hsSlope${+after})`);
  s += poly([[0, RIDGE, zr], [L, RIDGE, zr], [L, RIDGE, zn], [0, RIDGE, zn]], '#F7F6F2');
  // Skirting boards
  s += poly([[0, 0, KZ], [L, 0, KZ], [L, 80, KZ], [0, 80, KZ]], '#F8F7F4', ' stroke="#D9D5CD" stroke-width="1"');
  s += poly([[0, 0, zn], [0, 0, KZ], [0, 80, KZ], [0, 80, zn]], '#F4F2EE');
  s += poly([[L, 0, zn], [L, 0, KZ], [L, 80, KZ], [L, 80, zn]], '#F6F4F0');
  // Roof window in the slope, with a patch of light on the floor
  const wx0 = L * 0.36, wx1 = L * 0.58, wy0 = 1500, wy1 = 2200;
  const win = [[wx0, wy0, slopeZ(wy0)], [wx1, wy0, slopeZ(wy0)], [wx1, wy1, slopeZ(wy1)], [wx0, wy1, slopeZ(wy1)]];
  s += poly(win, '#FFFFFF', ' stroke="#D3CFC7" stroke-width="2"');
  const inset = 70, iw = [[wx0 + inset, wy0 + inset, slopeZ(wy0 + inset)], [wx1 - inset, wy0 + inset, slopeZ(wy0 + inset)], [wx1 - inset, wy1 - inset, slopeZ(wy1 - inset)], [wx0 + inset, wy1 - inset, slopeZ(wy1 - inset)]];
  s += poly(iw, `url(#hsGlass${+after})`);
  // Boxes: faces drawn back to front
  const box = (x0, x1, y0, y1, z0, z1, c) => {
    let o = '';
    if (CAM.x < x0) o += poly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], shadeHex(c, 0.86));
    if (CAM.x > x1) o += poly([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], shadeHex(c, 0.86));
    if (CAM.y > y1) o += poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], shadeHex(c, 1.08));
    return o + poly([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], c, ' stroke="rgba(0,0,0,.12)" stroke-width="1"');
  };
  if (!after) {
    s += box(200, 800, 0, 420, 4500, 4980, '#C8A574') + box(300, 700, 420, 700, 4600, 4950, '#D5B484');
    s += box(1000, 1350, 0, 260, 4550, 4900, '#BFA07A');
    s += box(L - 1100, L - 450, 0, 380, 4520, 4990, '#C9A877') + box(L - 380, L - 120, 0, 600, 4700, 4990, '#9AA59B');
    return s + '</svg>';
  }
  // Built-in cupboards: front face at z = FZ, top follows the slope back to the knee wall
  const FZ = KZ - d.d, FH = d.h, n = d.bays, dw = L / n, plinth = 80;
  const sage = '#C3CDBD', sageDark = '#AEB9A8';
  s += poly([[0, FH, FZ], [L, FH, FZ], [L, KH, KZ], [0, KH, KZ]], '#F1EFEA');
  s += poly([[0, 0, FZ], [L, 0, FZ], [L, FH, FZ], [0, FH, FZ]], sage);
  s += poly([[0, 0, FZ], [L, 0, FZ], [L, plinth, FZ], [0, plinth, FZ]], '#8E9989');
  s += `<line x1="${P(0, FH, FZ)[0].toFixed(1)}" y1="${P(0, FH, FZ)[1].toFixed(1)}" x2="${P(L, FH, FZ)[0].toFixed(1)}" y2="${P(L, FH, FZ)[1].toFixed(1)}" stroke="#9AA595" stroke-width="2"/>`;
  const openIdx = 1;
  for (let i = 1; i < n; i++) { const x = i * dw; s += `<line x1="${P(x, plinth, FZ)[0].toFixed(1)}" y1="${P(x, plinth, FZ)[1].toFixed(1)}" x2="${P(x, FH - 10, FZ)[0].toFixed(1)}" y2="${P(x, FH - 10, FZ)[1].toFixed(1)}" stroke="#7F8B7A" stroke-width="2"/>`; }
  // Open compartment: interior clipped to the door opening
  const ox0 = openIdx * dw, ox1 = ox0 + dw;
  s += `<clipPath id="hsOpen"><polygon points="${pts([[ox0, plinth, FZ], [ox1, plinth, FZ], [ox1, FH - 10, FZ], [ox0, FH - 10, FZ]])}"/></clipPath><g clip-path="url(#hsOpen)">`;
  s += poly([[ox0 - 50, -50, FZ], [ox1 + 50, -50, FZ], [ox1 + 50, FH + 50, FZ], [ox0 - 50, FH + 50, FZ]], `url(#hsIn${+after})`);
  const sy = Math.round(FH * 0.5), sd = FZ + d.d - 40;
  s += poly([[ox0, sy, FZ], [ox1, sy, FZ], [ox1, sy, sd], [ox0, sy, sd]], '#E2C79C');
  s += poly([[ox0, sy - 18, FZ], [ox1, sy - 18, FZ], [ox1, sy, FZ], [ox0, sy, FZ]], '#C9AC7E');
  s += box(ox0 + 60, ox0 + 110, sy, sy + 230, 4700, 4900, '#B5533A') + box(ox0 + 115, ox0 + 160, sy, sy + 260, 4700, 4900, '#3F5A73') + box(ox0 + 165, ox0 + 205, sy, sy + 210, 4700, 4900, '#E0B54E');
  s += box(ox0 + 320, ox1 - 80, sy, sy + 160, 4600, 4880, '#E9E4DA');
  s += box(ox0 + 80, ox1 - 120, plinth, plinth + 260, 4500, 4850, '#B99366');
  s += '</g>';
  // Handles on the closed doors, at the meeting edges
  for (let i = 0; i < n; i++) {
    if (i === openIdx) continue;
    const hx = i % 2 === 0 ? (i + 1) * dw - 60 : i * dw + 60;
    s += poly([[hx - 8, FH * 0.55, FZ - 5], [hx + 8, FH * 0.55, FZ - 5], [hx + 8, FH * 0.75, FZ - 5], [hx - 8, FH * 0.75, FZ - 5]], '#B48A4A');
  }
  // The open door, hinged on its left edge and swung past square towards the room
  const a = 100 * Math.PI / 180, fx = ox0 + dw * Math.cos(a), fz = FZ - dw * Math.sin(a);
  s += poly([[ox0, plinth + 4, FZ], [ox0, FH - 12, FZ], [fx, FH - 12, fz], [fx, plinth + 4, fz]], sageDark, ' stroke="#7F8B7A" stroke-width="1.5"');
  // Measurements
  const chip = (x, y, z, txt, dx = 0, dy = 0) => { const [px, py] = P(x, y, z); return `<g transform="translate(${(px + dx).toFixed(1)} ${(py + dy).toFixed(1)})"><rect x="-44" y="-14" width="88" height="28" rx="14" fill="#FF5B1F"/><text x="0" y="5" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700" fill="#15181B">${txt}</text></g>`; };
  s += chip(L * 0.8, FH, FZ, fmt(L), 0, -26) + chip(L, FH / 2, FZ, fmt(FH), -54, 0);
  return s + '</svg>';
}

// ───────────────────────── Home ─────────────────────────
let heroBuilt = false;
function renderHome() {
  const draft = store.get('cutlist_draft', null);
  const card = $('#resumeCard');
  if (draft && draft.name) { card.hidden = false; $('#resumeName').textContent = String(draft.name).slice(0, 60); } else card.hidden = true;
  if (heroBuilt) return;
  heroBuilt = true;
  // Demo: five-compartment under-eaves cupboards in a loft, shown in a drawn 3D room
  const demo = { template: 'eaves', w: 3600, h: 1300, d: 600, low: 700, shelves: 1, compartments: 5, thickness: 18, material: 'plywood', doors: 5, joinery: 'screws', scribe: true, load: 'books', overrides: {} };
  const saved = {}; Object.keys(demo).forEach(k => { saved[k] = S[k]; S[k] = demo[k]; });
  compute();
  const root = $('#heroCompare');
  $('#heroBefore').innerHTML = heroScene(false, { w: S.w, h: S.h, d: S.d, low: S.low, bays: S.compartments });
  $('#heroOverlay').innerHTML = heroScene(true, { w: S.w, h: S.h, d: S.d, low: S.low, bays: S.compartments });
  $('#heroStats').innerHTML = `<li><i class="ph ph-ruler" aria-hidden="true"></i><span><strong>${fmt(S.w)} x ${fmt(S.h)}</strong> measured from the photo</span></li>`
    + `<li><i class="ph ph-scissors" aria-hidden="true"></i><span><strong>${R.pieceCount} cuts</strong> from ${R.nMain} ${R.nMain === 1 ? 'sheet' : 'sheets'} of plywood</span></li>`
    + `<li><i class="ph ph-truck" aria-hidden="true"></i><span><strong>About ${gbp0(R.total)}</strong> cut and delivered</span></li>`;
  Object.assign(S, saved);
  compute();
  const range = $('#heroSlider');
  const set = v => setCompare(root, 100 - Number(v));
  range.addEventListener('input', () => set(range.value));
  set(0);
  if (!reduceMotion()) {
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0 - 500) / 1400);
      if (k >= 0) { const e = 1 - Math.pow(1 - k, 3); range.value = String(Math.round(e * 58)); set(range.value); }
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  } else { range.value = '58'; set(58); }
}

function initReveal() {
  const els = $$('.reveal');
  if (!('IntersectionObserver' in window) || reduceMotion()) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  els.forEach(e => io.observe(e));
}

// ───────────────────────── Photo intake ─────────────────────────
const MAX_PHOTO = 30 * 1024 * 1024;
function takePhoto(file) {
  if (!file) return;
  if ($('#dlgTips').open) $('#dlgTips').close();
  if (!/^image\//.test(file.type) || file.size > MAX_PHOTO) { toast('Please choose an image under 30MB.'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (S.photo) URL.revokeObjectURL(S.photo.url);
    S.photo = { url, img, w: img.naturalWidth, h: img.naturalHeight };
    S.ov = null; S.fracPerMM = null; S.measured = false;
    S.stage = 'photo';
    if (S.view !== 'plan') setView('plan', 0); else render();
    cmOpen();
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('That photo could not be opened.'); };
  img.src = url;
}

// ───────────────────────── Projects ─────────────────────────
function listProjects() { const p = store.get('cutlist_projects', {}); return p && typeof p === 'object' ? p : {}; }
function saveProject() {
  const all = listProjects();
  const key = S.name.trim().slice(0, 60) || 'Untitled project';
  all[key] = snapshot();
  if (store.set('cutlist_projects', all)) { $('#saveState').textContent = 'Saved'; toast('Saved on this device'); } else toast('Could not save. Storage may be full or blocked.');
}
function renderProjects() {
  const all = listProjects();
  const names = Object.keys(all).sort((a, b) => (all[b].savedAt || 0) - (all[a].savedAt || 0));
  $('#projList').innerHTML = names.length ? names.map(n => {
    const p = all[n];
    const when = p.savedAt ? new Date(p.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    return `<li><button type="button" class="pn" data-action="load-project" data-name="${esc(n)}"><strong>${esc(n)}</strong><small>${esc(tplOf(p.template).name)}${when ? ', ' + esc(when) : ''}</small></button><button type="button" class="icon-btn" data-action="delete-project" data-name="${esc(n)}" aria-label="Delete ${esc(n)}"><i class="ph ph-trash" aria-hidden="true"></i></button></li>`;
  }).join('') : '<li class="proj-empty">No saved projects yet.</li>';
}

// ───────────────────────── Exports ─────────────────────────
// Every hole a CNC cutter should drill, in the panel's own coordinates (mm): x from the front edge
// (or the hinge edge on doors), y up from the bottom edge. Shelf-pin rows match the build guide.
function panelHoles(p) {
  const holes = [];
  if (p.role === 'side' || p.role === 'divider') {
    const shelves = R.parts.filter(q => q.role === 'shelf');
    if (shelves.length) {
      const depth = Math.max(...shelves.map(q => q.h)), back = Math.min(p.w - 37, depth - 37);
      const through = p.role === 'divider';
      pinRows().filter(r => r.y < p.h - 40).forEach(r => [37, back].forEach(x => holes.push({ x, y: r.y, dia: 5, depth: through ? S.thickness : 10, kind: through ? 'Shelf pin, drill through' : 'Shelf pin' })));
    }
  }
  if (p.hinges) p.hinges.forEach(h => holes.push({ x: h.inset, y: p.h - h.y, dia: h.bore, depth: h.depth, kind: 'Hinge cup' }));
  return holes;
}

function exportCNC() {
  const mat = MATERIALS[S.material];
  const panels = R.parts.filter(p => p.stock === 'sheet' || p.stock === 'ply3' || p.stock === 'ply6');
  if (!panels.length) { exportCSV(); return; }
  let csv = '# CNC Cut List Export - CutList Pro\n';
  csv += '# Project: ' + safeName(S.name) + '\n# Material: ' + mat.name + ' (' + S.thickness + 'mm)\n# Date: ' + new Date().toISOString().split('T')[0] + '\n# All dimensions in mm. Grain direction: L=Length\n#\n';
  csv += 'Part Name,Length (mm),Width (mm),Qty,Material,Thickness (mm),Grain,Edge L1,Edge L2,Edge W1,Edge W2,Scribed,Holes,Notes\n';
  panels.forEach(p => {
    const len = Math.max(p.w, p.h), wid = Math.min(p.w, p.h);
    const e = p.edge || 0; // 1 = front long edge, 4 = all edges
    const thick = p.stock === 'ply3' ? 3 : p.stock === 'ply6' ? 6 : S.thickness;
    const m = p.stock === 'sheet' ? mat.name : THIN[p.stock].name;
    let notes = p.shape ? '' : (p.note || ''); // shaped parts get a machine-readable note below instead
    if (p.hinges) notes += (notes ? '; ' : '') + p.hinges.map(h => `DRILL ${h.bore}mm@${h.y}mmY/${h.inset}mmX/${h.depth}mmD`).join('; ');
    const holes = panelHoles(p), holeText = holes.length ? `${holes.length} holes, see DXF layer DRILL` : '';
    if (p.shape) notes += (notes ? '; ' : '') + `ANGLED TOP ${p.shape.front}mm front to ${p.shape.back}mm back`;
    for (let i = 0; i < p.qty; i++) {
      const label = p.qty > 1 ? p.name + ' #' + (i + 1) : p.name;
      csv += [csvCell(label), len, wid, 1, csvCell(m), thick, csvCell('L'), e >= 1 ? 1 : 0, e >= 4 ? 1 : 0, e >= 4 ? 1 : 0, e >= 4 ? 1 : 0, csvCell(p.scribed ? 'YES' : 'NO'), csvCell(holeText), csvCell(notes)].join(',') + '\n';
    }
  });
  csv += '\n# Summary\n# Total panels: ' + panels.reduce((s, p) => s + p.qty, 0) + '\n# Sheets needed: ' + R.nMain + '\n# Sheet size: ' + S.sheetW + 'x' + S.sheetH + 'mm\n';
  downloadFile(safeName(S.name) + '-CNC.csv', csv, 'text/csv');
}
function exportCSV() {
  let csv = 'Part,Length (mm),Width (mm),Qty,Stock,Area (m2),Notes\n';
  R.parts.forEach(p => { csv += [csvCell(p.name), p.w, p.h, p.qty, csvCell(p.section || p.stock), (p.w * p.h * p.qty / 1e6).toFixed(3), csvCell(p.note || '')].join(',') + '\n'; });
  csv += '\nHardware,Qty,Cost (GBP)\n';
  R.fittings.forEach(f => { csv += [csvCell(f.name), f.total_qty, f.total_cost.toFixed(2)].join(',') + '\n'; });
  downloadFile(safeName(S.name) + '.csv', csv, 'text/csv');
}
function exportJSON() {
  const data = { project: S.name, template: S.template, material: S.material, thickness: S.thickness, dimensions: { w: S.w, h: S.h, d: S.d, low: S.low }, parts: R.parts.map(({ hinges, ...p }) => ({ ...p, hinges })), sheets: R.nMain, timber: R.linear.map(g => ({ section: g.section, lengths: g.count, stock: g.stock })), fittings: R.fittings, estimate: Math.round(R.total) };
  downloadFile(safeName(S.name) + '.json', JSON.stringify(data, null, 2), 'application/json');
}
function exportDXF() {
  // One outline per part, true shape, holes on layer DRILL_<dia>_<depth>, and a label with the quantity.
  // Units mm, origin bottom-left of each part, x = front edge (hinge edge on doors).
  const E = [];
  const line = (layer, a, b) => E.push(`0\nLINE\n8\n${layer}\n10\n${a[0]}\n20\n${a[1]}\n30\n0\n11\n${b[0]}\n21\n${b[1]}\n31\n0`);
  const circle = (layer, c, r) => E.push(`0\nCIRCLE\n8\n${layer}\n10\n${c[0]}\n20\n${c[1]}\n30\n0\n40\n${r}`);
  const text = (layer, at, hgt, str) => E.push(`0\nTEXT\n8\n${layer}\n10\n${at[0]}\n20\n${at[1]}\n30\n0\n40\n${hgt}\n1\n${str.replace(/[\r\n]/g, ' ')}`);
  let x = 0, y = 0, rowH = 0;
  const maxRow = 6000;
  R.parts.filter(p => p.stock === 'sheet' || p.stock === 'ply3' || p.stock === 'ply6').forEach(p => {
    if (x > 0 && x + p.w > maxRow) { x = 0; y += rowH + 150; rowH = 0; }
    const pts = p.shape ? [[0, 0], [p.w, 0], [p.w, p.shape.back], [0, p.shape.front]] : [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]];
    pts.forEach((a, k) => line('CUT', [x + a[0], y + a[1]], [x + pts[(k + 1) % pts.length][0], y + pts[(k + 1) % pts.length][1]]));
    panelHoles(p).forEach(h => circle(`DRILL_${h.dia}MM_${h.depth}DEEP`, [x + h.x, y + h.y], h.dia / 2));
    const thick = p.stock === 'ply3' ? 3 : p.stock === 'ply6' ? 6 : S.thickness;
    text('LABEL', [x, y - 40], 25, `${p.name} x${p.qty}  ${p.w} x ${p.h} x ${thick}mm${p.scribed ? '  SCRIBE' : ''}`);
    x += p.w + 150; rowH = Math.max(rowH, p.h);
  });
  const dxf = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${E.join('\n')}\n0\nENDSEC\n0\nEOF\n`;
  downloadFile(safeName(S.name) + '.dxf', dxf, 'application/dxf');
}

function printSheet() {
  const steps = buildSteps();
  let h = `<h1>${esc(S.name)}</h1><div class="meta">${esc(designName())}, ${esc(isCabinet(S.template) ? MATERIALS[S.material].name + ' ' + S.thickness + 'mm' : 'C16 timber')}, ${fmt(S.w)} x ${fmt(S.h)} x ${fmt(S.d)}. Estimate ${gbp0(R.total)}.</div>`;
  h += '<h2>Cut list</h2><table><tr><th>Part</th><th>Length</th><th>Width</th><th>Qty</th><th>Notes</th></tr>';
  R.parts.forEach(p => { h += `<tr><td>${esc(p.name)}</td><td>${fmt(p.w)}</td><td>${fmt(p.h)}</td><td>${p.qty}</td><td>${esc([p.note, p.scribed ? 'Scribe edge' : ''].filter(Boolean).join('. '))}</td></tr>`; });
  h += '</table><h2>Hardware</h2><table><tr><th>Item</th><th>Qty</th><th>Cost</th></tr>';
  R.fittings.forEach(f => { h += `<tr><td>${esc(f.name)}</td><td>${f.total_qty}</td><td>${gbp(f.total_cost)}</td></tr>`; });
  h += '</table><h2>Build steps</h2><ol>';
  steps.forEach(s => { h += `<li><strong>${esc(s.title)}.</strong> ${esc(s.body.join(' '))}${s.warn ? ' <em>' + esc(s.warn) + '</em>' : ''}</li>`; });
  h += `</ol><div class="meta">Made with CutList Pro. Prices are estimates. Check every measurement before cutting.</div>`;
  $('#printSheet').innerHTML = h;
  window.print();
}

// ───────────────────────── Camera measure ─────────────────────────
// Points are stored in "u" units (fraction of the drawn photo width) so they survive a resize.
const CM = { phase: 'calibrate', points: [], ref: null, k: 1, refSizeMM: 85.6, refType: 'card', targets: [], targetIdx: 0, measurements: {}, pts: {}, cw: 1, ch: 1 };
const TARGET_LABEL = { w: 'width', h: 'height', low: 'back height', d: 'depth', spacing: 'stud centres' };
const TARGET_DESC = { w: 'one wall to the other', h: 'the floor to the top', low: 'the floor to the top of the knee wall', d: 'the back wall to the front' };
const uDist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function cmOpen() {
  if (!S.photo) { $('#dlgTips').showModal(); return; }
  Object.assign(CM, { phase: 'calibrate', points: [], ref: null, measurements: {}, pts: {}, targetIdx: 0 });
  CM.targets = fieldsFor(S.template).map(f => f[0]).filter(k => k !== 'spacing' && k !== 'pitch');
  $('#camMeasure').hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { cmRedrawAll(); cmUpdateUI(); });
}
function cmClose() { $('#camMeasure').hidden = true; document.body.style.overflow = ''; }
function cmReset() { Object.assign(CM, { phase: 'calibrate', points: [], ref: null, measurements: {}, pts: {}, targetIdx: 0 }); cmRedrawAll(); cmUpdateUI(); }
function cmDrawImage() {
  const wrap = $('#cmWrap'), canvas = $('#cmCanvas'), ctx = canvas.getContext('2d');
  const img = S.photo.img, wrapW = wrap.clientWidth, wrapH = wrap.clientHeight;
  const ia = img.naturalWidth / img.naturalHeight, wa = wrapW / wrapH;
  const dw = Math.round(ia > wa ? wrapW : wrapH * ia), dh = Math.round(ia > wa ? wrapW / ia : wrapH);
  canvas.width = dw; canvas.height = dh;
  canvas.style.width = dw + 'px'; canvas.style.height = dh + 'px';
  canvas.style.left = ((wrapW - dw) / 2) + 'px'; canvas.style.top = ((wrapH - dh) / 2) + 'px';
  ctx.drawImage(img, 0, 0, dw, dh);
  CM.canvas = canvas; CM.ctx = ctx; CM.cw = dw; CM.ch = dh;
  $$('.cm-dot,.cm-label', wrap).forEach(e => e.remove());
}
function cmRedrawAll() {
  cmDrawImage();
  if (CM.ref) { CM.ref.forEach(p => cmAddDot(p, 'ref')); cmDrawLine(CM.ref[0], CM.ref[1], '#FF5B1F', CM.refSizeMM.toFixed(0) + 'mm reference'); }
  Object.entries(CM.pts).forEach(([k, p]) => { cmAddDot(p[0], 'a'); cmAddDot(p[1], 'b'); cmDrawLine(p[0], p[1], '#2E9E62', CM.measurements[k] + 'mm'); });
  CM.points.forEach((p, i) => cmAddDot(p, CM.phase === 'calibrate' ? 'ref' : (i ? 'b' : 'a')));
}
function cmTap(e) {
  if ($('#camMeasure').hidden) return;
  const rect = CM.canvas.getBoundingClientRect();
  const p = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.width };
  if (CM.phase === 'calibrate') {
    CM.points.push(p); cmAddDot(p, 'ref');
    if (CM.points.length === 2) {
      const du = uDist(CM.points[0], CM.points[1]);
      if (du < 0.01) { CM.points = []; cmRedrawAll(); toast('Those points are too close. Try again.'); cmUpdateUI(); return; }
      CM.k = du / CM.refSizeMM; // photo-width units per mm
      CM.ref = CM.points.slice();
      cmDrawLine(CM.ref[0], CM.ref[1], '#FF5B1F', CM.refSizeMM.toFixed(0) + 'mm reference');
      CM.phase = 'measure'; CM.points = [];
    }
  } else if (CM.phase === 'measure') {
    if (CM.points.length >= 2) return;
    CM.points.push(p); cmAddDot(p, CM.points.length === 1 ? 'a' : 'b');
    if (CM.points.length === 2) {
      const tg = CM.targets[CM.targetIdx];
      const mm = Math.round(uDist(CM.points[0], CM.points[1]) / CM.k);
      CM.measurements[tg] = mm; CM.pts[tg] = CM.points.slice();
      cmDrawLine(CM.points[0], CM.points[1], '#2E9E62', mm + 'mm');
    }
  }
  cmUpdateUI();
}
function cmPx(p) { return { x: p.x * CM.cw, y: p.y * CM.cw }; }
function cmAddDot(p, cls) {
  const wrap = $('#cmWrap'), r = CM.canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), q = cmPx(p);
  const d = document.createElement('div');
  d.className = 'cm-dot ' + cls;
  d.style.left = (r.left - wr.left + q.x) + 'px'; d.style.top = (r.top - wr.top + q.y) + 'px';
  wrap.appendChild(d);
}
function cmDrawLine(a, b, color, label) {
  const wrap = $('#cmWrap'), r = CM.canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  const p1 = cmPx(a), p2 = cmPx(b), ctx = CM.ctx;
  ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]);
  const l = document.createElement('div');
  l.className = 'cm-label'; l.textContent = label;
  l.style.left = (r.left - wr.left + (p1.x + p2.x) / 2) + 'px'; l.style.top = (r.top - wr.top + Math.min(p1.y, p2.y) - 4) + 'px';
  wrap.appendChild(l);
}
function cmUpdateUI() {
  const title = $('#cmTitle'), phase = $('#cmPhase'), inst = $('#cmInst'), dist = $('#cmDist'), actions = $('#cmActions');
  if (CM.phase === 'calibrate') {
    const refName = CM.refType === 'card' ? 'bank card' : 'A4 sheet';
    title.textContent = 'Set the scale';
    phase.innerHTML = CM.points.length === 0 ? `Tap the <strong>left edge</strong> of the ${refName}.` : `Now tap the <strong>right edge</strong> of the ${refName}.`;
    inst.textContent = CM.points.length === 0 ? `It is ${CM.refType === 'card' ? '85.6mm wide' : '297mm on its long side'}, so we can work out every other size from it.` : 'Zoom the page first if you need to be precise.';
    dist.innerHTML = `<div class="ref-seg" role="group" aria-label="Reference object"><button type="button" class="chip" data-action="cm-ref" data-value="card" aria-pressed="${CM.refType === 'card'}">Bank card</button><button type="button" class="chip" data-action="cm-ref" data-value="a4" aria-pressed="${CM.refType === 'a4'}">A4 paper</button></div>`;
    actions.innerHTML = `<button type="button" class="btn btn-ghost" data-action="cm-skip">Type sizes instead</button>`;
    return;
  }
  const tg = CM.targets[CM.targetIdx], label = TARGET_LABEL[tg] || tg;
  title.textContent = 'Measure the ' + label;
  if (CM.points.length === 0) { phase.innerHTML = `Tap <strong>one end</strong> of the ${esc(label)}.`; inst.textContent = `From ${TARGET_DESC[tg] || 'one end to the other'}.`; }
  else if (CM.points.length === 1) { phase.innerHTML = 'Now tap the <strong>other end</strong>.'; inst.textContent = ''; }
  else { const v = CM.measurements[tg]; phase.innerHTML = `${esc(label[0].toUpperCase() + label.slice(1))}: <strong>${v}mm</strong>`; inst.textContent = `That is ${mm2in(v)} inches. Check it against a tape if you can.`; }
  dist.innerHTML = CM.targets.map((x, i) => `<span class="${CM.measurements[x] ? 'got' : i === CM.targetIdx ? 'on' : ''}">${esc(TARGET_LABEL[x] || x)}: ${CM.measurements[x] ? CM.measurements[x] + 'mm' : '--'}</span>`).join('');
  let b = '';
  if (CM.targetIdx < CM.targets.length - 1) b += `<button type="button" class="btn btn-ghost" data-action="cm-next">${CM.points.length >= 2 ? 'Measure' : 'Skip to'} ${esc(TARGET_LABEL[CM.targets[CM.targetIdx + 1]])}</button>`;
  if (CM.points.length >= 1) b += `<button type="button" class="btn btn-ghost" data-action="cm-redo">Redo</button>`;
  if (Object.keys(CM.measurements).length) b += `<button type="button" class="btn btn-primary" data-action="cm-done">Use these sizes</button>`;
  actions.innerHTML = b;
}
function cmRedo() {
  const tg = CM.targets[CM.targetIdx];
  delete CM.measurements[tg]; delete CM.pts[tg]; CM.points = [];
  cmRedrawAll(); cmUpdateUI();
}
function cmDone() {
  const m = CM.measurements;
  Object.keys(m).forEach(k => { const lim = LIMITS[k]; if (lim) S[k] = clamp(m[k], lim[0], lim[1]); });
  if (S.template === 'eaves' && S.low >= S.h) S.low = Math.round(S.h * 0.6);
  // Anchor the design where the user measured. u units are fractions of photo width.
  S.fracPerMM = CM.k;
  S.ov = S.ov || { x: 0.2, yb: 0.92 };
  const toYFrac = u => u * CM.cw / CM.ch;
  if (CM.pts.w) S.ov.x = Math.min(CM.pts.w[0].x, CM.pts.w[1].x);
  if (CM.pts.h) S.ov.yb = toYFrac(Math.max(CM.pts.h[0].y, CM.pts.h[1].y));
  S.measured = true; S.stage = 'photo';
  cmClose();
  saveDraft();
  render();
  toast('Sizes added from your photo');
}

// ───────────────────────── AR (Android WebXR) ─────────────────────────
let AR_SUPPORTED = false;
const AR = { session: null, refSpace: null, viewerSpace: null, hitTestSource: null, gl: null, points: [], targets: ['w', 'h', 'd'], targetIdx: 0, measurements: {}, lastHitPose: null, reticleEl: null, overlayEls: [] };
function checkARSupport() {
  if (!navigator.xr || !navigator.xr.isSessionSupported) return;
  navigator.xr.isSessionSupported('immersive-ar').then(ok => { AR_SUPPORTED = !!ok; if (ok && S.view === 'plan' && S.step === 0) renderControls(); }).catch(() => {});
}
async function startAR() {
  const overlay = $('#arOverlay');
  try {
    overlay.hidden = false;
    AR.targetIdx = 0; AR.measurements = {}; AR.points = []; clearAROverlayEls(); updateARHud();
    const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlay } });
    AR.session = session;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { xrCompatible: true });
    AR.gl = gl;
    await session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
    AR.refSpace = await session.requestReferenceSpace('local');
    AR.viewerSpace = await session.requestReferenceSpace('viewer');
    AR.hitTestSource = await session.requestHitTestSource({ space: AR.viewerSpace });
    AR.reticleEl = document.createElement('div'); AR.reticleEl.className = 'ar-reticle'; overlay.appendChild(AR.reticleEl);
    session.addEventListener('select', onARSelect);
    session.addEventListener('end', onARSessionEnd);
    session.requestAnimationFrame(onARFrame);
  } catch (e) {
    overlay.hidden = true;
    toast('Could not start AR on this device.');
  }
}
function projectToScreen(wp, view) {
  const p = view.projectionMatrix, v = view.transform.inverse.matrix;
  const vx = v[0] * wp.x + v[4] * wp.y + v[8] * wp.z + v[12], vy = v[1] * wp.x + v[5] * wp.y + v[9] * wp.z + v[13];
  const vz = v[2] * wp.x + v[6] * wp.y + v[10] * wp.z + v[14], vw = v[3] * wp.x + v[7] * wp.y + v[11] * wp.z + v[15];
  const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12] * vw, cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13] * vw, cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15] * vw;
  if (cw <= 0) return null;
  return { x: window.innerWidth * (cx / cw + 1) / 2, y: window.innerHeight * (1 - cy / cw) / 2 };
}
function onARFrame(time, frame) {
  const session = AR.session; if (!session) return;
  session.requestAnimationFrame(onARFrame);
  const pose = frame.getViewerPose(AR.refSpace); if (!pose) return;
  const gl = AR.gl, layer = session.renderState.baseLayer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const hits = frame.getHitTestResults(AR.hitTestSource);
  const view = pose.views[0];
  if (hits.length) {
    const hp = hits[0].getPose(AR.refSpace); AR.lastHitPose = hp;
    const sp = projectToScreen(hp.transform.position, view);
    if (sp && AR.reticleEl) { AR.reticleEl.style.left = sp.x + 'px'; AR.reticleEl.style.top = sp.y + 'px'; AR.reticleEl.hidden = false; }
  } else { if (AR.reticleEl) AR.reticleEl.hidden = true; AR.lastHitPose = null; }
  AR.points.forEach((pt, i) => { const sp = projectToScreen(pt, view); if (sp && AR.overlayEls[i]) { AR.overlayEls[i].style.left = sp.x + 'px'; AR.overlayEls[i].style.top = sp.y + 'px'; } });
  if (AR.points.length === 2) { const a = projectToScreen(AR.points[0], view), b = projectToScreen(AR.points[1], view); if (a && b) updateARLine(a, b); }
}
function onARSelect() {
  if (!AR.lastHitPose) return;
  const pos = AR.lastHitPose.transform.position;
  if (AR.points.length >= 2) { clearAROverlayEls(); AR.points = []; }
  AR.points.push({ x: pos.x, y: pos.y, z: pos.z });
  const overlay = $('#arOverlay');
  const dot = document.createElement('div'); dot.className = 'ar-dot ' + (AR.points.length === 1 ? 'start' : 'end'); overlay.appendChild(dot); AR.overlayEls.push(dot);
  if (AR.points.length === 2) {
    const [a, b] = AR.points, mm = Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 1000);
    const tg = AR.targets[AR.targetIdx];
    AR.measurements[tg] = mm;
    $('#arDistance').textContent = mm + 'mm (' + mm2in(mm) + '")';
    const line = document.createElement('div'); line.className = 'ar-line'; line.id = 'arLineMeasure'; overlay.appendChild(line);
    const label = document.createElement('div'); label.className = 'ar-measure-label'; label.id = 'arLabelMeasure'; label.textContent = TARGET_LABEL[tg] + ': ' + mm + 'mm'; overlay.appendChild(label);
    $('#arInstructions').textContent = 'Tap Next to measure the ' + (TARGET_LABEL[AR.targets[AR.targetIdx + 1]] || 'next size') + ', or Done to finish';
  } else { $('#arInstructions').textContent = 'Tap a surface to place the end point'; $('#arDistance').textContent = '--'; }
  updateARHud();
}
function updateARLine(a, b) {
  const line = $('#arLineMeasure'), label = $('#arLabelMeasure'); if (!line || !label) return;
  const dx = b.x - a.x, dy = b.y - a.y;
  line.style.left = a.x + 'px'; line.style.top = a.y + 'px'; line.style.width = Math.hypot(dx, dy) + 'px'; line.style.transform = 'rotate(' + deg(Math.atan2(dy, dx)) + 'deg)';
  label.style.left = (a.x + b.x) / 2 + 'px'; label.style.top = (a.y + b.y) / 2 - 20 + 'px';
}
function arNext() {
  if (AR.points.length < 2) { toast('Place two points first'); return; }
  AR.targetIdx = (AR.targetIdx + 1) % AR.targets.length; AR.points = []; clearAROverlayEls(); updateARHud();
  $('#arDistance').textContent = '--'; $('#arInstructions').textContent = 'Tap a surface to place the start point';
}
function arUndo() {
  if (!AR.points.length) return;
  AR.points.pop(); const el = AR.overlayEls.pop(); if (el) el.remove();
  ['#arLineMeasure', '#arLabelMeasure'].forEach(s => { const e = $(s); if (e) e.remove(); });
  $('#arDistance').textContent = '--';
  $('#arInstructions').textContent = AR.points.length ? 'Tap a surface to place the end point' : 'Tap a surface to place the start point';
}
function arDone() {
  Object.entries(AR.measurements).forEach(([k, v]) => { const lim = LIMITS[k]; if (lim) S[k] = clamp(v, lim[0], lim[1]); });
  endARSession(); saveDraft(); render();
}
function endARSession() { if (AR.session) AR.session.end().catch(() => {}); else onARSessionEnd(); }
function onARSessionEnd() {
  Object.assign(AR, { session: null, hitTestSource: null, refSpace: null, viewerSpace: null, gl: null, lastHitPose: null });
  clearAROverlayEls();
  if (AR.reticleEl) { AR.reticleEl.remove(); AR.reticleEl = null; }
  $('#arOverlay').hidden = true;
}
function clearAROverlayEls() { AR.overlayEls.forEach(el => el.remove()); AR.overlayEls = []; ['#arLineMeasure', '#arLabelMeasure'].forEach(s => { const e = $(s); if (e) e.remove(); }); }
function updateARHud() {
  $('#arTarget').textContent = (TARGET_LABEL[AR.targets[AR.targetIdx]] || '').replace(/^./, c => c.toUpperCase());
  const n = Object.keys(AR.measurements).length;
  $('#arDoneBtn').textContent = n ? `Done (${n}/3)` : 'Done';
}

// ───────────────────────── Design assistant ─────────────────────────
// Sends the request and current sizes to /api/assistant (Claude, server side). If that is not
// set up or not reachable, a built-in phrase parser handles the common requests instead.
const ASK = { log: [], busy: false };
const ASK_FIELDS = ['template', 'w', 'h', 'd', 'low', 'shelves', 'compartments', 'thickness', 'spacing', 'pitch', 'doors', 'joinery', 'material'];
const FIELD_LABEL = { template: 'Design', w: 'Width', h: 'Height', d: 'Depth', low: 'Back height', shelves: 'Shelves', compartments: 'Compartments', thickness: 'Thickness', spacing: 'Centres', pitch: 'Pitch', doors: 'Doors', joinery: 'Joining', material: 'Board', scribe: 'Scribe edges' };
const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, single: 1, double: 2, a: 1, an: 1 };

function askSuggestions() {
  if (!isCabinet(S.template)) return ['Make it 3.6m long', 'Studs at 600 centres', 'Use 38mm timber'];
  const out = [];
  if (BAY_TEMPLATES.has(S.template)) out.push(S.compartments > 1 ? 'Make it one big space' : 'Split it into 5 compartments');
  out.push(doorCount() ? 'No doors, just shelves' : 'Add doors');
  out.push('Two shelves in each section', 'Make it 1.5m wide');
  return out;
}

function renderAsk() {
  $('#askLog').innerHTML = ASK.log.map(m => `<div class="msg ${m.role === 'user' ? 'user' : 'bot'}${m.wait ? ' wait' : ''}">${esc(m.text)}${m.diff && m.diff.length ? `<div class="tags">${m.diff.map(d => `<span class="tag acc">${esc(d)}</span>`).join('')}</div>` : ''}</div>`).join('');
  $('#askSugg').innerHTML = ASK.log.length ? '' : askSuggestions().map(t => `<button type="button" class="chip" data-action="ask-suggest" data-text="${esc(t)}">${esc(t)}</button>`).join('');
  const log = $('#askLog'); log.scrollTop = log.scrollHeight;
}

function fmtVal(k, v) {
  if (k === 'template') return tplOf(v).name;
  if (k === 'doors') return v === 'auto' ? 'suggested' : v === 0 ? 'none' : String(v);
  if (k === 'material') return MATERIALS[v] ? MATERIALS[v].name : v;
  if (k === 'joinery') return JOINERY[v] ? JOINERY[v].short : v;
  if (k === 'scribe') return v ? 'on' : 'off';
  if (['w', 'h', 'd', 'low', 'thickness', 'spacing'].includes(k)) return fmt(v);
  if (k === 'pitch') return v + ' deg';
  return String(v);
}

// Validate and apply. Never trust the server (or the parser) blindly.
function applyChanges(ch) {
  const diff = [];
  if (!ch || typeof ch !== 'object') return diff;
  if (ch.template && ch.template !== S.template && TEMPLATES.some(t => t.id === ch.template)) {
    const keep = { name: S.name, unit: S.unit };
    startTemplate(ch.template, { keepOverlay: true });
    Object.assign(S, keep);
    diff.push(`Design: ${tplOf(ch.template).name}`);
  }
  for (const k of ['w', 'h', 'd', 'low', 'shelves', 'compartments', 'thickness', 'spacing', 'pitch']) {
    if (ch[k] === undefined || ch[k] === null) continue;
    const v = Number(ch[k]); const lim = LIMITS[k];
    if (!Number.isFinite(v) || !lim) continue;
    const nv = Math.round(clamp(v, lim[0], lim[1]));
    if (nv !== S[k]) { diff.push(`${FIELD_LABEL[k]}: ${fmtVal(k, nv)}`); S[k] = nv; }
  }
  if (S.template === 'eaves' && S.low >= S.h) { S.low = Math.round(S.h * 0.6); diff.push(`Back height: ${fmtVal('low', S.low)}`); }
  if (ch.doors !== undefined && ch.doors !== null) {
    const v = ch.doors === 'auto' ? 'auto' : clamp(Math.round(Number(ch.doors)) || 0, 0, 8);
    if (v !== S.doors && isCabinet(S.template)) { S.doors = v; diff.push(`Doors: ${fmtVal('doors', v)}`); }
  }
  if (ch.joinery && JOINERY[ch.joinery] && ch.joinery !== S.joinery) { S.joinery = ch.joinery; diff.push(`Joining: ${JOINERY[ch.joinery].short}`); }
  if (ch.material && MATERIALS[ch.material] && ch.material !== 'c16' && isCabinet(S.template) && ch.material !== S.material) {
    S.material = ch.material; S.thickness = MATERIALS[ch.material].thick; S.priceSheet = null; diff.push(`Board: ${MATERIALS[ch.material].name}`);
  }
  if (typeof ch.scribe === 'boolean' && ch.scribe !== S.scribe) { S.scribe = ch.scribe; diff.push(`Scribe edges: ${ch.scribe ? 'on' : 'off'}`); }
  if (diff.length) { saveDraft(); render(); }
  return diff;
}

// Offline fallback: understands the common requests without any AI.
function parseLocally(text) {
  const t = ' ' + text.toLowerCase().replace(/[,;]/g, ' ') + ' ';
  const ch = {};
  const n = s => (s in WORDNUM ? WORDNUM[s] : Number(s));
  const NUM = '(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|single|double|a|an)';
  let m;
  if ((m = t.match(new RegExp(NUM + '\\s*(?:equal\\s+)?(?:compartments?|sections?|bays?|cubbies|cubby|columns?|boxes|divisions?|cubes?)'))) ) ch.compartments = n(m[1]);
  else if ((m = t.match(new RegExp(NUM + '\\s*dividers?')))) ch.compartments = n(m[1]) + 1;
  if (/one big|single space|no dividers|remove (the )?dividers/.test(t)) ch.compartments = 1;
  if ((m = t.match(new RegExp(NUM + '\\s*shel(?:f|ves)')))) ch.shelves = n(m[1]);
  if (/no shelves|without shelves/.test(t)) ch.shelves = 0;
  if (/no doors|without doors|remove (the )?doors|open shelv|just shelves|shelving only|doors off/.test(t)) ch.doors = '0';
  else if ((m = t.match(new RegExp(NUM + '\\s*doors?')))) ch.doors = String(clamp(n(m[1]), 0, 8));
  else if (/(add|with|put on|want) (some )?doors/.test(t)) ch.doors = 'auto';
  const toMM = (v, u) => { v = Number(v); u = (u || '').trim(); if (u === 'm' || u === 'metre' || u === 'metres' || u === 'meter' || u === 'meters') return v * 1000; if (u === 'cm') return v * 10; if (u === 'in' || u === 'inch' || u === 'inches' || u === '"') return v * 25.4; if (!u && v <= 10) return v * 1000; return v; };
  const UNIT = '\\s*(mm|cm|metres?|meters?|m|inches|inch|in|")?';
  const dims = [['low', 'back height|knee ?wall(?: height)?|back'], ['w', 'wide|width|long|length'], ['h', 'high|height|tall'], ['d', 'deep|depth']];
  for (const [k, words] of dims) {
    if (k === 'low' && S.template !== 'eaves') continue;
    let r = t.match(new RegExp('(\\d+(?:\\.\\d+)?)' + UNIT + '\\s*(?:' + words + ')\\b'));
    if (!r) { const q = t.match(new RegExp('\\b(?:' + words + ')\\s*(?:to|of|=|:|is|at)?\\s*(\\d+(?:\\.\\d+)?)' + UNIT)); if (q) r = q; }
    if (r && !(k === 'h' && /back height/.test(r[0]))) ch[k] = Math.round(toMM(r[1], r[2]));
  }
  if (/pocket/.test(t)) ch.joinery = 'pocket'; else if (/cam|flat ?pack|knock ?down/.test(t)) ch.joinery = 'cam'; else if (/\bscrews?\b/.test(t) && /join|fix|use/.test(t)) ch.joinery = 'screws';
  if (/\bmdf\b/.test(t)) ch.material = 'mdf'; else if (/melamine|chipboard/.test(t)) ch.material = 'melamine'; else if (/\bosb\b/.test(t)) ch.material = 'osb'; else if (/\bply(wood)?\b/.test(t)) ch.material = 'plywood';
  const T = [['understairs', /under ?(the )?stairs?|stair cupboard/], ['eaves', /eaves|loft|attic|knee ?wall/], ['wardrobe', /wardrobe/], ['kitchenbase', /kitchen base|base unit/], ['kitchenwall', /wall cupboard|wall unit/], ['shelving', /bookcase|shelving unit/]];
  for (const [id, re] of T) if (re.test(t) && /(make it|change (it )?to|switch to|turn it into|instead)/.test(t)) { ch.template = id; break; }
  return ch;
}

async function askSend(text) {
  text = String(text || '').trim().slice(0, 600);
  if (!text || ASK.busy) return;
  ASK.busy = true;
  const history = ASK.log.filter(m => !m.wait).slice(-6).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }));
  ASK.log.push({ role: 'user', text });
  ASK.log.push({ role: 'bot', text: 'Working on it...', wait: true });
  renderAsk();
  $('#askInput').value = '';
  const design = {}; ASK_FIELDS.forEach(k => { design[k] = S[k]; });
  let reply, changes, offline = false;
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 45000);
    const r = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, design, history }), signal: ctl.signal, credentials: 'same-origin' });
    clearTimeout(to);
    if (r.ok) { const j = await r.json(); reply = typeof j.reply === 'string' ? j.reply : ''; changes = j.changes; }
    else if (r.status === 429) reply = 'Lots of requests right now. Give it a minute and try again.';
    else offline = true;
  } catch { offline = true; }
  if (offline) { changes = parseLocally(text); }
  ASK.log.pop();
  const diff = applyChanges(changes);
  if (offline) reply = diff.length ? 'Done.' : "I couldn't work that out. Try something like \"5 compartments\", \"no doors\", \"2 shelves\" or \"1.5m wide\".";
  else if (!reply) reply = diff.length ? 'Done.' : 'Nothing to change there.';
  ASK.log.push({ role: 'bot', text: reply, diff });
  ASK.busy = false;
  renderAsk();
}

// ───────────────────────── Events ─────────────────────────
function startTemplate(id, opts = {}) {
  const keepPhoto = S.photo, unit = S.unit;
  Object.assign(S, freshState(id), { unit, photo: keepPhoto, ov: opts.keepOverlay ? S.ov : null, fracPerMM: opts.keepOverlay ? S.fracPerMM : null, measured: false, buildIdx: 0, editParts: false });
  S.stage = S.photo ? 'photo' : 'drawing';
}

const ACTIONS = {
  'go-home': () => setView('home'),
  start: () => { const d = store.get('cutlist_draft', null); if (!d || !applyProject(d)) startTemplate('eaves'); setView('plan', 0); },
  'start-photo': () => { startTemplate('eaves'); setView('plan', 0); $('#dlgTips').showModal(); },
  'start-template': el => { startTemplate(el.dataset.template); setView('plan', 0); },
  resume: () => { if (applyProject(store.get('cutlist_draft', null))) setView('plan', 0); },
  goto: el => setView('plan', Number(el.dataset.step)),
  next: () => { if (S.step < 4) setView('plan', S.step + 1); else exportCNC(); },
  prev: () => { if (S.step > 0) setView('plan', S.step - 1); else setView('home'); },
  template: el => {
    if (el.dataset.template === S.template) return;
    const name = S.name, isDefaultName = TEMPLATES.some(t => t.name === name) || name === 'Attic eaves cupboards';
    startTemplate(el.dataset.template, { keepOverlay: true });
    if (!isDefaultName) S.name = name;
    saveDraft(); render();
  },
  stage: el => { if (el.dataset.value === 'photo' && !S.photo) return; S.stage = el.dataset.value; renderStage(); },
  unit: el => { S.unit = el.dataset.value === 'in' ? 'in' : 'mm'; saveDraft(); render(); },
  style: el => {
    // 'auto' gives the template's usual door count; shelving defaults to none, so force 2 there
    if (el.dataset.value === 'open') S.doors = 0;
    else S.doors = S.template === 'shelving' ? 2 : 'auto';
    if (el.dataset.value === 'open' && S.template === 'eaves' && S.shelves < 2) S.shelves = 2;
    saveDraft(); render();
  },
  joinery: el => { S.joinery = JOINERY[el.dataset.value] ? el.dataset.value : 'screws'; saveDraft(); render(); },
  theme: () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('cutlist_theme', next);
    if (S.view === 'plan') render();
  },
  'open-tips': () => $('#dlgTips').showModal(),
  'open-ask': () => { renderAsk(); $('#dlgAsk').showModal(); setTimeout(() => $('#askInput').focus(), 50); },
  'ask-suggest': el => askSend(el.dataset.text),
  'take-photo': () => { $('#dlgTips').close(); $('#photoCapture').click(); },
  'pick-photo': () => { $('#dlgTips').close(); $('#photoPick').click(); },
  'close-dialog': el => el.closest('dialog').close(),
  'remove-photo': () => { if (S.photo) URL.revokeObjectURL(S.photo.url); S.photo = null; S.ov = null; S.fracPerMM = null; S.measured = false; S.stage = 'drawing'; render(); },
  'open-projects': () => { renderProjects(); $('#dlgProjects').showModal(); },
  'new-project': () => { $('#dlgProjects').close(); startTemplate('eaves'); setView('plan', 0); },
  'load-project': el => { const p = listProjects()[el.dataset.name]; if (p && applyProject(p)) { $('#dlgProjects').close(); S.stage = S.photo ? 'photo' : 'drawing'; saveDraft(); setView('plan', 0); toast('Opened ' + S.name); } },
  'delete-project': el => { const all = listProjects(); const n = el.dataset.name; if (!(n in all)) return; if (!confirm('Delete "' + n + '"? This cannot be undone.')) return; delete all[n]; store.set('cutlist_projects', all); renderProjects(); },
  save: () => saveProject(),
  'toggle-edit': () => { S.editParts = !S.editParts; render(); },
  'reset-overrides': () => { S.overrides = {}; saveDraft(); render(); },
  print: () => printSheet(),
  'order-pack': () => { exportCNC(); setTimeout(exportDXF, 400); toast('Order pack downloaded. Attach both files when you send it.'); },
  'copy-shopping': async () => { try { await navigator.clipboard.writeText(shoppingList()); toast('Shopping list copied'); } catch { toast('Could not copy. Select the list and copy it instead.'); } },
  'export-cnc': () => exportCNC(), 'export-csv': () => exportCSV(), 'export-dxf': () => exportDXF(), 'export-json': () => exportJSON(),
  step: el => {
    const k = el.dataset.k, lim = k === 'boxes' ? [1, 8] : LIMITS[k];
    if (k !== 'compartments' && k !== 'shelves' && k !== 'boxes') return;
    const cur = k === 'boxes' ? layout().n : Math.round(S[k] || 0);
    S[k] = clamp(cur + (Number(el.dataset.d) > 0 ? 1 : -1), lim[0], lim[1]);
    saveDraft(); render();
    const again = document.querySelector(`[data-action="step"][data-k="${k}"][data-d="${el.dataset.d}"]`);
    if (again && !again.disabled) again.focus();
  },
  hand: el => { S.hand = el.dataset.value === 'left' ? 'left' : 'right'; saveDraft(); render(); },
  site: el => { if (SITES[el.dataset.value]) { S.site = el.dataset.value; saveDraft(); render(); } },
  'boxes-auto': () => { S.boxes = 'auto'; saveDraft(); render(); },
  load: el => { if (LOADS[el.dataset.value]) { S.load = el.dataset.value; saveDraft(); render(); } },
  'safety-fix': el => {
    const v = el.dataset.value;
    if (el.dataset.kind === 'compartments') S.compartments = clamp(Math.round(Number(v)), 1, 8);
    else if (el.dataset.kind === 'thickness' && [24, 25].includes(Number(v))) S.thickness = Number(v);
    else if (el.dataset.kind === 'material' && v === 'plywood') { S.material = 'plywood'; S.priceSheet = null; }
    saveDraft(); render(); toast('Design updated. Safety checks re-run.');
  },
  'manual-anim': () => { S.manualAnim = S.manualAnim === false; render(); },
  'build-mode': el => { S.buildMode = el.dataset.value === 'steps' ? 'steps' : 'manual'; render(); },
  'print-manual': () => { $('#printSheet').innerHTML = `<h1>${esc(S.name)}</h1>` + renderManual(true); document.body.classList.add('print-manual'); window.print(); document.body.classList.remove('print-manual'); },
  'build-go': el => { S.buildIdx = Number(el.dataset.step); render(); },
  'build-prev': () => { S.buildIdx = Math.max(0, S.buildIdx - 1); render(); },
  'build-done': () => { const d = new Set(S.done); d.add(S.buildIdx); S.done = [...d]; const n = buildSteps().length; if (S.buildIdx < n - 1) S.buildIdx++; else toast('All steps done. Nice work.'); saveDraft(); render(); },
  'cm-open': () => cmOpen(), 'cm-close': () => cmClose(), 'cm-reset': () => cmReset(),
  'cm-ref': el => { CM.refType = el.dataset.value === 'a4' ? 'a4' : 'card'; CM.refSizeMM = CM.refType === 'card' ? 85.6 : 297; CM.points = []; cmRedrawAll(); cmUpdateUI(); },
  'cm-skip': () => { cmClose(); const f = $('#f-w'); if (f) f.focus(); },
  'cm-next': () => { CM.targetIdx = Math.min(CM.targets.length - 1, CM.targetIdx + 1); CM.points = []; cmUpdateUI(); },
  'cm-redo': () => cmRedo(),
  'cm-done': () => cmDone(),
  'ar-start': () => startAR(), 'ar-next': () => arNext(), 'ar-undo': () => arUndo(), 'ar-done': () => arDone(), 'ar-cancel': () => endARSession()
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el); }
});

// Close dialogs by tapping the backdrop
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

let liveTimer;
function liveUpdate() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    compute();
    if (S.step < 2) {
      renderStage();
      $$('[data-help]').forEach(h => { const k = h.dataset.help; const f = fieldsFor(S.template).find(x => x[0] === k); const base = f ? f[2] : (k === 'kerf' ? 'Blade width, usually 3' : k === 'thickness' && !isCabinet(S.template) ? 'C16 is usually 38 or 47' : k === 'spacing' ? 'Usually 400 or 600' : ''); h.textContent = base + inchHelp(k); });
    } else render();
    renderBar();
    saveDraft();
  }, 120);
}

document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'heroSlider') return;
  if (el.dataset.ov) {
    const v = Number(el.value);
    if (!Number.isFinite(v) || v < 0 || v > 15000) return;
    const o = S.overrides[el.dataset.ov] = S.overrides[el.dataset.ov] || {};
    o[el.dataset.k] = el.dataset.k === 'qty' ? Math.round(v) : v;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { compute(); saveDraft(); }, 200);
    return;
  }
  const k = el.dataset.field;
  if (!k) return;
  if (k === 'name') { S.name = el.value.slice(0, 60); $('#saveState').textContent = ''; saveDraft(); return; }
  if (k === 'cmp') { S.cmp = 100 - Number(el.value); applyCmp(); return; }
  if (k === 'postcode') { S.postcode = el.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8); saveDraft(); return; }
  if (LIMITS[k] || k === 'priceSheet') {
    const v = Number(el.value);
    const lim = k === 'priceSheet' ? [0, 1000] : LIMITS[k];
    const err = $(`[data-err="${k}"]`);
    let msg = '';
    if (el.value === '' || !Number.isFinite(v)) msg = 'Enter a number';
    else if (v < lim[0] || v > lim[1]) msg = `Between ${lim[0]} and ${lim[1]}`;
    else if (k === 'low' && v >= S.h) msg = 'Must be lower than the front height';
    el.setAttribute('aria-invalid', String(!!msg));
    if (err) { err.textContent = msg; err.hidden = !msg; }
    if (msg) return;
    S[k] = k === 'shelves' ? Math.round(v) : v;
    if (k === 'priceSheet') { clearTimeout(liveTimer); liveTimer = setTimeout(() => { compute(); renderBar(); saveDraft(); const p = $('.summary'); if (p) render(); }, 500); return; }
    liveUpdate();
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.ov) { render(); return; }
  const k = el.dataset.field;
  if (!k) return;
  if (k === 'material') { if (MATERIALS[el.value]) { S.material = el.value; S.thickness = MATERIALS[el.value].thick; S.priceSheet = null; } }
  else if (k === 'doors') S.doors = el.value === 'auto' ? 'auto' : clamp(Math.round(Number(el.value)) || 0, 0, 8);
  else if (k === 'scribe') S.scribe = el.checked;
  else if (k === 'delivery') S.delivery = DELIVERY.some(d => d.id === el.value) ? el.value : 'standard';
  else if (k === 'postcode') { render(); return; }
  else if (k === 'compartments' || k === 'shelves') { render(); return; }
  else if (k === 'name') { S.name = el.value.trim().slice(0, 60) || 'Untitled project'; el.value = S.name; saveDraft(); return; }
  else return;
  saveDraft(); render();
});

$('#askForm').addEventListener('submit', e => { e.preventDefault(); askSend($('#askInput').value); });
$('#askInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askSend($('#askInput').value); } });
['photoCapture', 'photoPick'].forEach(id => $('#' + id).addEventListener('change', e => { takePhoto(e.target.files[0]); e.target.value = ''; }));

// Drag and drop a photo onto the drop zone (desktop)
document.addEventListener('dragover', e => { const d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('drag'); } });
document.addEventListener('dragleave', e => { const d = e.target.closest && e.target.closest('#drop'); if (d) d.classList.remove('drag'); });
document.addEventListener('drop', e => { const d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.remove('drag'); takePhoto(e.dataTransfer.files[0]); } });

$('#cmCanvas').addEventListener('click', cmTap);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#camMeasure').hidden) cmClose(); });

window.addEventListener('popstate', () => {
  const m = location.hash.match(/^#plan-(\d)$/);
  if (m) { S.view = 'plan'; S.step = clamp(Number(m[1]) - 1, 0, 4); document.body.dataset.view = 'plan'; $('#view-home').hidden = true; $('#view-plan').hidden = false; render(); }
  else if (S.view === 'plan' && !location.hash) { S.view = 'home'; document.body.dataset.view = 'home'; $('#view-home').hidden = false; $('#view-plan').hidden = true; render(); }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (S.view === 'plan' && S.step < 2 && S.stage === '3d') renderStage();
    if (!$('#camMeasure').hidden) cmRedrawAll();
  }, 200);
});

// ───────────────────────── Boot ─────────────────────────
(function init() {
  const theme = store.get('cutlist_theme', null);
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
  const draft = store.get('cutlist_draft', null);
  if (draft) applyProject(draft);
  checkARSupport();
  initReveal();
  const m = location.hash.match(/^#plan-(\d)$/);
  if (m) { S.view = 'plan'; S.step = clamp(Number(m[1]) - 1, 0, 4); document.body.dataset.view = 'plan'; $('#view-home').hidden = true; $('#view-plan').hidden = false; }
  render();
})();
