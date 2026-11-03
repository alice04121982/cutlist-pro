// Reads a generated DXF back with an independent parser (dxf-parser) and checks it using only
// what is in the file: every expected part is drawn at its true size, no two parts are closer than
// the gap, every part sits inside its sheet less the margin, holes sit inside their part, and every
// label sits inside its part.
import DxfParser from 'dxf-parser';
import assert from 'node:assert/strict';
import { DXF_SETTINGS } from '../../api/_lib/dxf-settings.js';

const EPS = 1e-3;
const L = DXF_SETTINGS.layers;

function bbox(pts) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}
function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2; // signed: positive when anticlockwise
}
const inside = (a, b, m = 0) => a.x1 >= b.x1 + m - EPS && a.y1 >= b.y1 + m - EPS && a.x2 <= b.x2 - m + EPS && a.y2 <= b.y2 - m + EPS;

// Size signature of a part that does not depend on how it was turned: sorted sides of the enclosing
// rectangle and the true area of the outline.
export function signature(w, h, outlineArea) {
  const [a, b] = [w, h].sort((x, y) => x - y);
  return `${a.toFixed(1)}x${b.toFixed(1)}:${outlineArea.toFixed(0)}`;
}

export function expectedSignatures(payload) {
  return payload.parts.flatMap(p => {
    const h = p.h;
    const a = p.shape ? p.w * (p.shape.front + p.shape.back) / 2 : p.w * h;
    return Array.from({ length: p.qty }, () => signature(p.w, h, a));
  });
}

export function reread(content, { gap, margin, sheetW, sheetH }) {
  const dxf = new DxfParser().parseSync(content);
  assert.equal(dxf.header.$INSUNITS, DXF_SETTINGS.units.insunits, 'units header is millimetres');
  const ents = dxf.entities;
  const sheets = ents.filter(e => e.layer === L.sheet.name && e.type === 'LWPOLYLINE').map(e => ({ ...bbox(e.vertices), parts: [] }));
  assert.ok(sheets.length >= 1, 'at least one sheet outline');
  for (const s of sheets) {
    assert.ok(Math.abs(s.x2 - s.x1 - sheetW) < EPS && Math.abs(s.y2 - s.y1 - sheetH) < EPS, 'sheet outline at stock size');
  }
  // Sheets must not overlap each other in the drawing
  sheets.slice().sort((a, b) => a.x1 - b.x1).forEach((s, i, arr) => { if (i) assert.ok(s.x1 > arr[i - 1].x2, 'sheets are spaced apart'); });

  const parts = ents.filter(e => e.layer === L.cut.name);
  for (const e of parts) {
    assert.equal(e.type, 'LWPOLYLINE', 'parts are polylines');
    assert.equal(e.shape, true, 'every part outline is closed');
    assert.ok(area(e.vertices) > 0, 'outline winds anticlockwise');
  }
  const P = parts.map(e => ({ verts: e.vertices, box: bbox(e.vertices), area: area(e.vertices), holes: [], labels: [] }));
  for (const p of P) {
    const s = sheets.find(sh => inside(p.box, sh));
    assert.ok(s, 'every part is on a sheet');
    assert.ok(inside(p.box, s, margin), `part at ${p.box.x1},${p.box.y1} keeps the ${margin}mm margin`);
    s.parts.push(p);
  }
  for (const s of sheets) for (let i = 0; i < s.parts.length; i++) for (let j = i + 1; j < s.parts.length; j++) {
    const a = s.parts[i].box, b = s.parts[j].box;
    const apart = a.x2 + gap <= b.x1 + EPS || b.x2 + gap <= a.x1 + EPS || a.y2 + gap <= b.y1 + EPS || b.y2 + gap <= a.y1 + EPS;
    assert.ok(apart, `parts at ${a.x1},${a.y1} and ${b.x1},${b.y1} are at least ${gap}mm apart`);
  }

  // Holes: on a DRILL layer, inside exactly one part outline (checked against every edge)
  const drills = ents.filter(e => e.layer.startsWith(L.drill.prefix));
  for (const c of drills) {
    assert.equal(c.type, 'CIRCLE', 'holes are circles');
    const owner = P.find(p => circleInPoly(p.verts, c.center.x, c.center.y, c.radius));
    assert.ok(owner, `hole at ${c.center.x},${c.center.y} is inside a part`);
    owner.holes.push(c);
  }

  // Labels: every part has one, and its text box lies inside that part's outline box
  const T = DXF_SETTINGS.text;
  for (const t of ents.filter(e => e.layer === L.labels.name)) {
    assert.equal(t.type, 'TEXT');
    const h = t.textHeight, len = t.text.length * h * T.charWidth, d = h * 0.35;
    const rot = t.rotation || 0;
    const box = rot === 90
      ? { x1: t.startPoint.x - h, y1: t.startPoint.y, x2: t.startPoint.x + d, y2: t.startPoint.y + len }
      : { x1: t.startPoint.x, y1: t.startPoint.y - d, x2: t.startPoint.x + len, y2: t.startPoint.y + h };
    const owner = P.find(p => inside(box, p.box, 0.5) && cornersInPoly(p.verts, box));
    assert.ok(owner, `label "${t.text}" sits inside a part without touching its outline`);
    owner.labels.push(t);
  }
  for (const p of P) assert.ok(p.labels.length >= 1, `part at ${p.box.x1},${p.box.y1} has a label`);

  return {
    dxf, sheets, parts: P,
    signatures: P.map(p => signature(p.box.x2 - p.box.x1, p.box.y2 - p.box.y1, p.area)),
    labels: P.map(p => p.labels.map(l => l.text))
  };
}

function circleInPoly(verts, cx, cy, r) {
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length], len = Math.hypot(b.x - a.x, b.y - a.y);
    if ((b.x - a.x) * (cy - a.y) - (b.y - a.y) * (cx - a.x) < (r - EPS) * len) return false;
  }
  return true;
}
const cornersInPoly = (verts, b) => [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]].every(([x, y]) => circleInPoly(verts, x, y, 0));
