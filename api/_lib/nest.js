// Lays parts out on stock sheets. Each part is placed by its enclosing rectangle (so angled parts
// keep their true shape inside it), with a gap between parts and a margin from every sheet edge.
// Parts with grain set keep the one orientation that runs their grain along the board's grain;
// parts without grain may also be turned 90 degrees.
//
// Guillotine packing: every placement splits the free space it sits in into a part, a strip to its
// right and a strip above, each starting a full gap away. Free spaces therefore never overlap each
// other or a part, and stay at least one gap apart. verifyLayout() checks the result independently.
import { DXF_SETTINGS } from './dxf-settings.js';

export class LayoutError extends Error {
  constructor(message) { super(message); this.name = 'LayoutError'; }
}

const EPS = 1e-6;

// Which orientations a part may take on this sheet: 0 (as drawn) and/or 90 (turned).
export function allowedRotations(part, sheetW, sheetH) {
  if (!part.grain) return [0, 90];
  const sheetGrainAlongX = (DXF_SETTINGS.layout.sheetGrain === 'length') === (sheetW >= sheetH);
  if (part.w === part.h) return [0, 90];
  // The part's grain runs along its longer side ('length') or its shorter side ('width')
  const partGrainAlongX = (part.grain === 'length') === (part.w > part.h);
  return [partGrainAlongX === sheetGrainAlongX ? 0 : 90];
}

const dims = (p, rot) => rot === 90 ? { w: p.h, h: p.w } : { w: p.w, h: p.h };

// Throws a LayoutError naming the first part that cannot go on the sheet at all.
export function checkFits(items, sheetW, sheetH, margin) {
  const uw = sheetW - 2 * margin, uh = sheetH - 2 * margin;
  for (const it of items) {
    const rots = allowedRotations(it, sheetW, sheetH);
    if (rots.some(r => { const d = dims(it, r); return d.w <= uw + EPS && d.h <= uh + EPS; })) continue;
    const anyWay = [0, 90].some(r => { const d = dims(it, r); return d.w <= uw + EPS && d.h <= uh + EPS; });
    const room = `${uw} x ${uh}mm (a ${sheetW} x ${sheetH}mm sheet less the ${margin}mm margin)`;
    throw new LayoutError(anyWay
      ? `"${it.label}" (${it.w} x ${it.h}mm) only fits the sheet if turned, but its grain direction is set. Usable area is ${room}.`
      : `"${it.label}" (${it.w} x ${it.h}mm) is larger than the usable sheet area of ${room}.`);
  }
}

// items: [{ id, label, w, h, grain, area }]. Returns sheets: [{ placements: [{ item, x, y, w, h, rot }] }]
export function nest(items, { sheetW, sheetH, gap, margin }) {
  checkFits(items, sheetW, sheetH, margin);
  const orders = [
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => b.w * b.h - a.w * a.h,
    (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
    (a, b) => (b.w + b.h) - (a.w + a.h)
  ];
  let best = null;
  for (const order of orders) for (const rule of ['short', 'long', 'area']) for (const fit of ['area', 'shortSide']) {
    // Stable tie-break on id so the same order always gives the same file
    const sorted = items.slice().sort((a, b) => order(a, b) || a.id - b.id);
    const sheets = pack(sorted, sheetW, sheetH, gap, margin, rule, fit);
    const used = sheets.map(s => s.placements.reduce((t, p) => t + p.w * p.h, 0));
    // Fewest sheets, then the emptiest last sheet (the most reusable offcut)
    const score = sheets.length * 1e13 + used[used.length - 1];
    if (!best || score < best.score) best = { score, sheets };
  }
  return best.sheets;
}

function pack(items, sheetW, sheetH, gap, margin, rule, fit) {
  const sheets = [];
  const newSheet = () => ({ placements: [], spaces: [{ x: margin, y: margin, w: sheetW - 2 * margin, h: sheetH - 2 * margin }] });
  for (const it of items) {
    let placed = false;
    for (const s of sheets) if ((placed = place(s, it, gap, rule, fit, sheetW, sheetH))) break;
    if (!placed) {
      const s = newSheet();
      if (!place(s, it, gap, rule, fit, sheetW, sheetH)) throw new LayoutError(`"${it.label}" could not be placed on an empty sheet.`);
      sheets.push(s);
    }
    if (sheets.length > DXF_SETTINGS.limits.sheetsPerFile) throw new LayoutError(`This order needs more than ${DXF_SETTINGS.limits.sheetsPerFile} sheets of one material.`);
  }
  return sheets.map(s => ({ placements: s.placements }));
}

function place(sheet, it, gap, rule, fit, sheetW, sheetH) {
  let pick = null;
  sheet.spaces.forEach((sp, i) => {
    for (const rot of allowedRotations(it, sheetW, sheetH)) {
      const d = dims(it, rot);
      if (d.w > sp.w + EPS || d.h > sp.h + EPS) continue;
      const score = fit === 'area' ? sp.w * sp.h - d.w * d.h : Math.min(sp.w - d.w, sp.h - d.h);
      if (!pick || score < pick.score - EPS) pick = { i, rot, d, score };
    }
  });
  if (!pick) return false;
  const sp = sheet.spaces[pick.i], { w, h } = pick.d;
  sheet.placements.push({ item: it, x: sp.x, y: sp.y, w, h, rot: pick.rot });
  const lw = sp.w - w - gap, lh = sp.h - h - gap; // what is left to the right and above, after the gap
  const horizontal = rule === 'short' ? lw < lh : rule === 'long' ? lw >= lh : lw * sp.h < sp.w * lh;
  const next = [];
  if (horizontal) {
    // The strip above takes the full width; the strip to the right is only as tall as the part
    if (lw > EPS) next.push({ x: sp.x + w + gap, y: sp.y, w: lw, h });
    if (lh > EPS) next.push({ x: sp.x, y: sp.y + h + gap, w: sp.w, h: lh });
  } else {
    if (lw > EPS) next.push({ x: sp.x + w + gap, y: sp.y, w: lw, h: sp.h });
    if (lh > EPS) next.push({ x: sp.x, y: sp.y + h + gap, w, h: lh });
  }
  sheet.spaces.splice(pick.i, 1, ...next);
  return true;
}

// Independent check of a finished layout. Returns a list of problems (empty when it is sound).
export function verifyLayout(sheets, { sheetW, sheetH, gap, margin }) {
  const problems = [];
  sheets.forEach((s, si) => {
    s.placements.forEach((a, i) => {
      if (a.x < margin - EPS || a.y < margin - EPS || a.x + a.w > sheetW - margin + EPS || a.y + a.h > sheetH - margin + EPS)
        problems.push(`Sheet ${si + 1}: "${a.item.label}" is outside the usable area.`);
      if (!allowedRotations(a.item, sheetW, sheetH).includes(a.rot)) problems.push(`Sheet ${si + 1}: "${a.item.label}" is turned against its grain.`);
      for (let j = i + 1; j < s.placements.length; j++) {
        const b = s.placements[j];
        // Separated when one is at least `gap` clear of the other along x or along y
        const apart = a.x + a.w + gap <= b.x + EPS || b.x + b.w + gap <= a.x + EPS || a.y + a.h + gap <= b.y + EPS || b.y + b.h + gap <= a.y + EPS;
        if (!apart) problems.push(`Sheet ${si + 1}: "${a.item.label}" and "${b.item.label}" are closer than the ${gap}mm gap.`);
      }
    });
  });
  return problems;
}
