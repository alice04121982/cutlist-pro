// Strict server-side check of a cut list sent from the browser. Nothing from the request is used
// until it has passed through here: unknown fields are dropped, every number is checked, and the
// first problems found are returned as plain-English messages.
import { DXF_SETTINGS, MATERIAL_KEYS } from './dxf-settings.js';

export class ValidationError extends Error {
  constructor(problems) {
    super(problems[0]);
    this.name = 'ValidationError';
    this.problems = problems;
  }
}

const L = DXF_SETTINGS.limits;
const round1 = v => Math.round(v * 10) / 10; // sizes are kept to 0.1mm

export function cleanText(s, max = DXF_SETTINGS.text.maxLength) {
  const t = DXF_SETTINGS.text;
  return String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(t.allowed, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

export function validateOrder(body) {
  const problems = [];
  const fail = msg => { if (problems.length < 20) problems.push(msg); };
  if (!isObj(body)) throw new ValidationError(['The request must be a JSON object.']);

  const num = (v, [lo, hi], what, { optional = false, def } = {}) => {
    if (v === undefined || v === null) {
      if (optional) return def;
      fail(`${what} is missing.`);
      return NaN;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) { fail(`${what} must be a number.`); return NaN; }
    if (v <= 0 && lo > 0) { fail(`${what} must be more than 0 (got ${v}).`); return NaN; }
    if (v < lo || v > hi) { fail(`${what} must be between ${lo} and ${hi} (got ${v}).`); return NaN; }
    return round1(v);
  };

  const gap = num(body.gap, L.gap, 'The gap between parts', { optional: true, def: DXF_SETTINGS.layout.gap });
  const margin = num(body.margin, L.margin, 'The sheet margin', { optional: true, def: DXF_SETTINGS.layout.margin });

  // Materials
  const materials = new Map();
  if (!Array.isArray(body.materials) || !body.materials.length) fail('At least one material is needed.');
  else if (body.materials.length > L.materials) fail(`No more than ${L.materials} materials per order.`);
  else body.materials.forEach((m, i) => {
    const what = `Material ${i + 1}`;
    if (!isObj(m)) return fail(`${what} is not valid.`);
    const id = typeof m.id === 'string' && /^[a-z0-9_-]{1,20}$/i.test(m.id) ? m.id : null;
    if (!id) return fail(`${what} needs an id of up to 20 letters or numbers.`);
    if (materials.has(id)) return fail(`Material id "${id}" is used twice.`);
    if (!MATERIAL_KEYS.includes(m.material)) return fail(`${what} must be one of: ${MATERIAL_KEYS.join(', ')}.`);
    const def = DXF_SETTINGS.sheets[m.material];
    const thickness = num(m.thickness, L.thickness, `${what} thickness`);
    const sheetW = num(m.sheetW, L.sheetW, `${what} sheet length`, { optional: true, def: def.w });
    const sheetH = num(m.sheetH, L.sheetH, `${what} sheet width`, { optional: true, def: def.h });
    if (Number.isFinite(sheetW) && Number.isFinite(sheetH) && (sheetW - 2 * margin <= 0 || sheetH - 2 * margin <= 0)) fail(`${what}: the margin leaves no room on the sheet.`);
    materials.set(id, { id, material: m.material, thickness, sheetW, sheetH });
  });
  // One file per material and thickness, so the pair must be unique
  const seen = new Set();
  for (const m of materials.values()) {
    const k = m.material + '|' + m.thickness;
    if (seen.has(k)) fail(`${m.material} ${m.thickness}mm is listed twice.`);
    seen.add(k);
  }

  // Parts
  const parts = [];
  let expanded = 0, holeCount = 0;
  if (!Array.isArray(body.parts) || !body.parts.length) fail('The cut list has no parts.');
  else if (body.parts.length > L.partTypes) fail(`No more than ${L.partTypes} different parts per order.`);
  else body.parts.forEach((p, i) => {
    if (!isObj(p)) return fail(`Part ${i + 1} is not valid.`);
    const name = cleanText(p.name);
    const what = name ? `Part "${name}"` : `Part ${i + 1}`;
    if (!name) fail(`${what} needs a name.`);
    if (typeof p.name === 'string' && p.name.length > L.nameLength) fail(`${what}: the name is longer than ${L.nameLength} characters.`);
    const mat = materials.get(p.material);
    if (!mat) return fail(`${what} uses a material that is not in the materials list.`);
    const w = num(p.w, L.partSize, `${what} length`), h = num(p.h, L.partSize, `${what} width`);
    if (!Number.isInteger(p.qty) || p.qty < 1 || p.qty > L.qtyPerPart) return fail(`${what}: quantity must be a whole number from 1 to ${L.qtyPerPart}.`);
    expanded += p.qty;
    let grain = null;
    if (p.grain !== undefined && p.grain !== null) {
      if (p.grain !== 'length' && p.grain !== 'width') return fail(`${what}: grain must be "length", "width" or empty.`);
      grain = p.grain;
    }
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;

    // Outline in the part's own coordinates: x along w, y along h, origin bottom left
    let outline = [[0, 0], [w, 0], [w, h], [0, h]];
    let shape = null;
    if (p.shape !== undefined && p.shape !== null) {
      if (!isObj(p.shape)) return fail(`${what}: the angled top is not valid.`);
      const front = num(p.shape.front, [1, h], `${what} front height`), back = num(p.shape.back, [1, h], `${what} back height`);
      if (!Number.isFinite(front) || !Number.isFinite(back)) return;
      if (Math.max(front, back) !== h) return fail(`${what}: the taller end of the angled top (${Math.max(front, back)}) must equal the width (${h}).`);
      shape = { front, back };
      outline = [[0, 0], [w, 0], [w, back], [0, front]];
    }

    // Holes
    const holes = [];
    const thickness = mat.thickness;
    if (p.holes !== undefined && p.holes !== null) {
      if (!Array.isArray(p.holes)) return fail(`${what}: holes must be a list.`);
      if (p.holes.length > L.holesPerPart) return fail(`${what}: no more than ${L.holesPerPart} holes per part.`);
      holeCount += p.holes.length * p.qty;
      for (const [j, hole] of p.holes.entries()) {
        const hw = `${what} hole ${j + 1}`;
        if (!isObj(hole)) { fail(`${hw} is not valid.`); break; }
        const dia = num(hole.dia, L.holeDia, `${hw} diameter`);
        const depth = num(hole.depth, [0.1, thickness], `${hw} depth`);
        const x = num(hole.x, [0, w], `${hw} position from the front edge`), y = num(hole.y, [0, h], `${hw} position from the bottom edge`);
        if (![dia, depth, x, y].every(Number.isFinite)) break;
        if (!circleInside(outline, x, y, dia / 2)) { fail(`${hw} (${dia}mm at ${x}, ${y}) is not fully inside the part.`); break; }
        holes.push({ x, y, dia, depth, through: depth >= thickness });
      }
    }
    parts.push({ index: i, name, materialId: mat.id, w, h, qty: p.qty, grain, shape, outline, holes });
  });

  if (expanded > L.expandedParts) fail(`An order can have up to ${L.expandedParts} parts in total; this one has ${expanded}.`);
  if (holeCount > L.totalHoles) fail(`An order can have up to ${L.totalHoles} holes in total; this one has ${holeCount}.`);
  if (problems.length) throw new ValidationError(problems);
  return { gap, margin, materials: [...materials.values()], parts };
}

// True when a circle lies wholly inside a convex polygon given counter-clockwise.
export function circleInside(poly, cx, cy, r) {
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const ex = x2 - x1, ey = y2 - y1, len = Math.hypot(ex, ey);
    if (len === 0) continue;
    // Signed distance to the left of the edge (inside for a counter-clockwise polygon)
    const dist = (ex * (cy - y1) - ey * (cx - x1)) / len;
    if (dist < r - 1e-9) return false;
  }
  return true;
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}
