import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateOrderDxf, fileNameFor, safeFileName } from '../api/_lib/order-dxf.js';
import { validateOrder, ValidationError } from '../api/_lib/validate.js';
import { nest, verifyLayout, allowedRotations, LayoutError } from '../api/_lib/nest.js';
import { DXF_SETTINGS } from '../api/_lib/dxf-settings.js';
import handler from '../api/dxf.js';
import { reread, expectedSignatures } from './helpers/reread.js';

const ply = (extra = {}) => ({ id: 'a', material: 'plywood', thickness: 18, ...extra });
const order = (parts, extra = {}) => ({ materials: [ply()], parts: parts.map(p => ({ material: 'a', qty: 1, ...p })), ...extra });
const optsFor = (out, i = 0) => ({ gap: out.gap, margin: out.margin, sheetW: out.summary[i].sheetW, sheetH: out.summary[i].sheetH });

// Generate, then re-read every file and check it holds exactly the parts asked for
function checkRoundTrip(payload) {
  const out = generateOrderDxf(payload, { reference: 'TEST1' });
  const byMat = new Map(payload.materials.map(m => [m.id, m]));
  out.summary.forEach((s, i) => {
    const mat = [...byMat.values()].find(m => m.material === s.material && m.thickness === s.thickness);
    const expected = expectedSignatures({ parts: payload.parts.filter(p => p.material === mat.id) }).sort();
    const got = reread(out.files[i].content, optsFor(out, i));
    assert.deepEqual(got.signatures.slice().sort(), expected, 'every part is present at its true size, once per quantity');
    assert.equal(got.sheets.length, s.sheets.length, 'summary sheet count matches the file');
    assert.equal(s.sheets.reduce((n, x) => n + x.parts, 0), expected.length, 'summary part count matches');
  });
  return out;
}

test('a single part', () => {
  const out = checkRoundTrip(order([{ name: 'Shelf', w: 800, h: 300 }]));
  assert.equal(out.files.length, 1);
  assert.equal(out.summary[0].sheets.length, 1);
  assert.equal(out.summary[0].sheets[0].parts, 1);
  // Waste is the sheet less the part
  assert.equal(out.summary[0].sheets[0].wastePercent, Math.round(1000 * (1 - 800 * 300 / (2440 * 1220))) / 10);
  const r = reread(out.files[0].content, optsFor(out));
  assert.deepEqual(r.parts[0].box, { x1: 10, y1: 10, x2: 810, y2: 310 }, 'placed at the margin, at true size');
  assert.deepEqual(r.labels[0], ['P1 Shelf', '800 x 300mm']);
});

test('many parts across several sheets', () => {
  const out = checkRoundTrip(order([
    { name: 'Side', w: 1200, h: 600, qty: 9 },
    { name: 'Shelf', w: 900, h: 400, qty: 12 },
    { name: 'Rail', w: 2000, h: 100, qty: 5 }
  ]));
  assert.ok(out.summary[0].sheets.length >= 4);
  const r = reread(out.files[0].content, optsFor(out));
  // Sheets sit side by side along x, the configured spacing apart
  const xs = r.sheets.map(s => s.x1).sort((a, b) => a - b);
  xs.forEach((x, i) => assert.equal(x, i * (2440 + DXF_SETTINGS.layout.sheetSpacing)));
  for (const s of out.summary[0].sheets) assert.ok(s.wastePercent >= 0 && s.wastePercent < 100);
});

test('parts without grain are turned when that is the only way they fit', () => {
  // 1000 x 2000 fits a 2440 x 1220 sheet only when turned
  const out = checkRoundTrip(order([{ name: 'Tall', w: 1000, h: 2000 }]));
  const r = reread(out.files[0].content, optsFor(out));
  const b = r.parts[0].box;
  assert.equal(b.x2 - b.x1, 2000);
  assert.equal(b.y2 - b.y1, 1000);
});

test('rotated parts keep their holes and angled tops in the right place', () => {
  const payload = order([{ name: 'Eaves Side', w: 600, h: 2000, shape: { front: 2000, back: 900 }, holes: [{ x: 37, y: 100, dia: 5, depth: 10 }, { x: 560, y: 850, dia: 5, depth: 10 }] }]);
  const out = checkRoundTrip(payload);
  const r = reread(out.files[0].content, optsFor(out));
  assert.equal(r.parts[0].holes.length, 2);
  // Turned 90 degrees anticlockwise: part (x, y) lands at (margin + h - y, margin + x)
  const centres = r.parts[0].holes.map(c => [c.center.x, c.center.y]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(centres, [[10 + 2000 - 850, 10 + 560], [10 + 2000 - 100, 10 + 37]]);
});

test('grain direction stops a part from being turned', () => {
  const grained = { w: 300, h: 1000, grain: 'length' };
  assert.deepEqual(allowedRotations(grained, 2440, 1220), [90], 'long side follows the sheet grain');
  assert.deepEqual(allowedRotations({ ...grained, grain: 'width' }, 2440, 1220), [0]);
  assert.deepEqual(allowedRotations({ ...grained, grain: null }, 2440, 1220), [0, 90]);
  const out = checkRoundTrip(order([{ name: 'Upright', w: 300, h: 1000, grain: 'length', qty: 6 }]));
  const r = reread(out.files[0].content, optsFor(out));
  for (const p of r.parts) assert.equal(p.box.x2 - p.box.x1, 1000, 'grain (long side) runs along the sheet length');
  // A grain-set part that would only fit turned is refused with a clear reason
  assert.throws(() => generateOrderDxf(order([{ name: 'Wide', w: 2000, h: 1000, grain: 'width' }])), e => e instanceof LayoutError && /only fits the sheet if turned/.test(e.message));
});

test('quantities above one are expanded and numbered', () => {
  const out = checkRoundTrip(order([{ name: 'Door', w: 500, h: 700, qty: 4 }]));
  const r = reread(out.files[0].content, optsFor(out));
  assert.equal(r.parts.length, 4);
  const names = r.labels.map(l => l[0]).sort();
  assert.deepEqual(names, ['P1 Door #1', 'P2 Door #2', 'P3 Door #3', 'P4 Door #4']);
});

test('parts too large for the sheet are refused', () => {
  assert.throws(() => generateOrderDxf(order([{ name: 'Huge', w: 2500, h: 1300 }])), e => e instanceof LayoutError && /larger than the usable sheet area/.test(e.message));
  // Fits the sheet, but not once the margin is taken off
  assert.throws(() => generateOrderDxf(order([{ name: 'Edge', w: 2440, h: 600 }])), LayoutError);
  // Larger than any sheet can be
  assert.throws(() => validateOrder(order([{ name: 'Beam', w: 5000, h: 100 }])), ValidationError);
});

test('zero, negative and missing sizes are refused with a clear message', () => {
  for (const [w, h] of [[0, 300], [-5, 300], [300, 0], [300, -1], [NaN, 300], ['300', 300], [null, 300]]) {
    assert.throws(() => validateOrder(order([{ name: 'Bad', w, h }])), e => e instanceof ValidationError && /Part "Bad"/.test(e.message), `w=${w} h=${h}`);
  }
  assert.throws(() => validateOrder(order([{ name: 'Q', w: 300, h: 300, qty: 0 }])), /quantity/);
  assert.throws(() => validateOrder(order([{ name: 'Q', w: 300, h: 300, qty: 1.5 }])), /quantity/);
  assert.throws(() => validateOrder(order([{ name: 'Q', w: 300, h: 300, qty: -2 }])), /quantity/);
  assert.throws(() => validateOrder({ materials: [ply({ thickness: 0 })], parts: [{ name: 'A', material: 'a', w: 100, h: 100, qty: 1 }] }), /thickness/);
  assert.throws(() => validateOrder(order([{ name: 'A', w: 100, h: 100 }], { gap: -1 })), /gap/);
});

test('other bad input is refused', () => {
  assert.throws(() => validateOrder(null), ValidationError);
  assert.throws(() => validateOrder({ materials: [], parts: [] }), ValidationError);
  assert.throws(() => validateOrder({ materials: [{ id: 'a', material: 'unobtanium', thickness: 18 }], parts: [] }), /must be one of/);
  assert.throws(() => validateOrder(order([{ name: 'A', w: 100, h: 100, material: 'nope' }])), /not in the materials list/);
  assert.throws(() => validateOrder(order([{ name: 'A', w: 100, h: 100, qty: 201 }])), /quantity/);
  const many = Array.from({ length: 6 }, (_, i) => ({ name: 'P' + i, w: 100, h: 100, qty: 200 }));
  assert.throws(() => validateOrder(order(many)), /up to 1000 parts/);
  // Holes must sit wholly inside the part, and not deeper than the board
  assert.throws(() => validateOrder(order([{ name: 'A', w: 100, h: 100, holes: [{ x: 2, y: 50, dia: 5, depth: 10 }] }])), /not fully inside/);
  assert.throws(() => validateOrder(order([{ name: 'A', w: 100, h: 100, holes: [{ x: 50, y: 50, dia: 5, depth: 25 }] }])), /depth/);
  // A hole above an angled top is outside the true shape even though it is inside the rectangle
  assert.throws(() => validateOrder(order([{ name: 'A', w: 500, h: 1000, shape: { front: 1000, back: 400 }, holes: [{ x: 480, y: 900, dia: 5, depth: 10 }] }])), /not fully inside/);
  assert.throws(() => validateOrder(order([{ name: 'A', w: 500, h: 900, shape: { front: 1000, back: 400 } }])), /front height|taller end/);
  assert.throws(() => validateOrder(order([{ name: 'A', w: 100, h: 100, grain: 'diagonal' }])), /grain/);
  // The same material and thickness twice would make two files with one name
  assert.throws(() => validateOrder({ materials: [ply(), ply({ id: 'b' })], parts: [{ name: 'A', material: 'a', w: 100, h: 100, qty: 1 }] }), /listed twice/);
});

test('text cannot break the file, and no personal data reaches it', () => {
  const payload = order([{ name: 'Shelf\n0\nLINE\n8\nCUT', w: 400, h: 300 }]);
  payload.customer = { name: 'Jane Smith', email: 'jane@example.com', address: '1 High Street' };
  payload.project = 'Jane Smith loft';
  const out = checkRoundTrip(payload);
  const c = out.files[0].content;
  for (const s of ['Jane', 'Smith', 'example.com', 'High Street']) assert.ok(!c.includes(s), `${s} is not in the file`);
  const r = reread(c, optsFor(out));
  assert.equal(r.dxf.entities.filter(e => e.type === 'LINE').length, 0, 'no injected entity');
  assert.equal(r.labels[0][0], 'P1 Shelf 0 LINE 8 CUT');
  assert.ok(!JSON.stringify(out).includes('Jane'));
});

test('file names are clear and safe', () => {
  assert.equal(fileNameFor('AB12', 'plywood', 18), 'madetofit-order-ab12-plywood-18mm.dxf');
  assert.equal(fileNameFor('AB12', 'hardboard', 3), 'madetofit-order-ab12-hardboard-3mm.dxf');
  assert.equal(safeFileName('../../etc/passwd'), 'etc-passwd');
  assert.equal(safeFileName('a b<c>?"d'), 'a-b-c-d');
  assert.throws(() => generateOrderDxf(order([{ name: 'A', w: 100, h: 100 }]), { reference: '../x' }));
});

test('one file per material and thickness, with the DXF settings applied', () => {
  const payload = {
    materials: [ply(), { id: 'b', material: 'hardboard', thickness: 3 }, { id: 'c', material: 'mdf', thickness: 18, sheetW: 3050, sheetH: 1220 }],
    parts: [
      { name: 'Side', material: 'a', w: 600, h: 1100, qty: 2, holes: [{ x: 37, y: 200, dia: 5, depth: 10 }, { x: 300, y: 500, dia: 5, depth: 18 }] },
      { name: 'Back', material: 'b', w: 1100, h: 700, qty: 2 },
      { name: 'Top', material: 'c', w: 2900, h: 500, qty: 1 }
    ]
  };
  const out = checkRoundTrip(payload);
  assert.deepEqual(out.summary.map(s => s.filename), ['madetofit-order-test1-plywood-18mm.dxf', 'madetofit-order-test1-hardboard-3mm.dxf', 'madetofit-order-test1-mdf-18mm.dxf']);
  assert.equal(out.summary[2].sheetW, 3050, 'sheet size set per material');
  const r = reread(out.files[0].content, optsFor(out));
  const layers = Object.keys(r.dxf.tables.layer.layers);
  for (const l of ['CUT', 'LABELS', 'SHEET', 'DRILL_5MM_10DEEP', 'DRILL_5MM_18DEEP']) assert.ok(layers.includes(l), l);
  assert.equal(r.dxf.header.$ACADVER, DXF_SETTINGS.dxfVersion);
  assert.equal(r.dxf.header.$MEASUREMENT, 1);
  // The hardboard file has no holes, so no drill layers
  assert.ok(!Object.keys(reread(out.files[1].content, optsFor(out, 1)).dxf.tables.layer.layers).some(l => l.startsWith('DRILL')));
});

test('gap and margin can be changed and are respected', () => {
  const payload = order([{ name: 'Square', w: 290, h: 290, qty: 30 }], { gap: 20, margin: 40 });
  const out = checkRoundTrip(payload);
  assert.equal(out.gap, 20);
  assert.equal(out.margin, 40);
});

test('small parts get a smaller label or just their number, always inside the part', () => {
  const out = checkRoundTrip(order([{ name: 'A very long part name here', w: 60, h: 30, qty: 2 }, { name: 'Strip', w: 1500, h: 40 }, { name: 'Tiny', w: 10, h: 10 }]));
  const r = reread(out.files[0].content, optsFor(out));
  assert.ok(r.labels.every(l => l.length >= 1));
});

test('random cut lists always give a sound layout (fuzz)', () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let run = 0; run < 40; run++) {
    const parts = Array.from({ length: 1 + Math.floor(rnd() * 15) }, (_, i) => {
      const w = Math.round(20 + rnd() * 2000), h = Math.round(20 + rnd() * 1000);
      const angled = rnd() < 0.3;
      return { name: 'R' + i, w, h, qty: 1 + Math.floor(rnd() * 5), grain: rnd() < 0.5 ? 'length' : null, ...(angled ? { shape: { front: h, back: Math.max(1, Math.round(h * rnd())) } } : {}) };
    });
    checkRoundTrip(order(parts, { gap: Math.round(rnd() * 12), margin: Math.round(rnd() * 30) }));
  }
});

test('the layout checker catches overlaps and parts off the sheet', () => {
  const item = { label: 'X', w: 100, h: 100, grain: null };
  const opts = { sheetW: 1000, sheetH: 500, gap: 6, margin: 10 };
  assert.deepEqual(verifyLayout([{ placements: [{ item, x: 10, y: 10, w: 100, h: 100, rot: 0 }] }], opts), []);
  assert.equal(verifyLayout([{ placements: [{ item, x: 10, y: 10, w: 100, h: 100, rot: 0 }, { item, x: 112, y: 10, w: 100, h: 100, rot: 0 }] }], opts).length, 1, 'closer than the gap');
  assert.equal(verifyLayout([{ placements: [{ item, x: 950, y: 10, w: 100, h: 100, rot: 0 }] }], opts).length, 1, 'off the sheet');
  assert.equal(nest([{ ...item, id: 0 }], opts).length, 1);
});

test('the real example: under-eaves shelving in 18mm plywood', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/under-eaves-app-default.json', import.meta.url)));
  const out = checkRoundTrip(fx.payload);
  const plyFile = out.summary.find(s => s.material === 'plywood' && s.thickness === 18);
  assert.ok(plyFile, 'an 18mm plywood file');
  const r = reread(out.files[out.summary.indexOf(plyFile)].content, optsFor(out, out.summary.indexOf(plyFile)));
  // The angled eaves sides are drawn to true shape: 598 deep, 1200 at the front, 700 at the back
  const sides = r.parts.filter(p => p.verts.length === 4 && Math.abs(p.area - 598 * (1200 + 700) / 2) < 1);
  assert.equal(sides.length, 4, 'left, right and two box sides');
  const expectedHoles = fx.payload.parts.filter(p => p.material === 'm0').reduce((n, p) => n + p.holes.length * p.qty, 0);
  assert.equal(r.parts.reduce((n, p) => n + p.holes.length, 0), expectedHoles, 'every hole is drawn');
});

// The HTTP endpoint, with a stand-in for Vercel's request and response
function call(req) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b, headers: this.headers }); return this; } };
    handler({ method: 'POST', headers: { host: 'madetofit.app', origin: 'https://madetofit.app', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.' + Math.floor(Math.random() * 250) }, ...req }, res);
  });
}

test('the endpoint returns files and refuses bad requests', async () => {
  const ok = await call({ body: order([{ name: 'Shelf', w: 800, h: 300 }]) });
  assert.equal(ok.status, 200);
  assert.match(ok.body.files[0].filename, /^madetofit-order-[0-9a-f]{8}-plywood-18mm\.dxf$/);
  assert.equal(ok.headers['Cache-Control'], 'no-store');
  assert.equal((await call({ method: 'GET' })).status, 405);
  assert.equal((await call({ headers: { host: 'madetofit.app', origin: 'https://evil.example', 'content-type': 'application/json' }, body: {} })).status, 403);
  assert.equal((await call({ headers: { host: 'madetofit.app', 'content-type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await call({ body: '{not json' })).status, 400);
  const bad = await call({ body: order([{ name: 'Bad', w: -1, h: 300 }]) });
  assert.equal(bad.status, 422);
  assert.match(bad.body.message, /Part "Bad"/);
  const big = await call({ body: order([{ name: 'Huge', w: 3000, h: 2000 }]) });
  assert.equal(big.status, 422);
  assert.match(big.body.message, /larger than the usable sheet area/);
  assert.equal((await call({ headers: { host: 'madetofit.app', 'content-type': 'application/json', 'content-length': String(10 * 1024 * 1024) }, body: {} })).status, 413);
});
