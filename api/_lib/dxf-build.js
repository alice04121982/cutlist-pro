// Writes one DXF file for one material and thickness: every sheet side by side along x, each part
// as a closed polyline on CUT, holes as circles on DRILL layers, part labels on LABELS and the
// stock sheet outline on SHEET. Uses @tarikjabiri/dxf so the file structure is the library's,
// not hand written.
import { DxfWriter, LWPolylineFlags, point3d } from '@tarikjabiri/dxf';
import { DXF_SETTINGS, drillLayerName } from './dxf-settings.js';
import { cleanText } from './validate.js';

const r3 = v => Math.round(v * 1000) / 1000; // keep coordinates tidy in the file

// Part coordinates to sheet coordinates for a placement.
export function toSheet(pl, [x, y]) {
  // Turned 90 degrees anticlockwise, then moved back into the placed rectangle
  return pl.rot === 90 ? [pl.x + (pl.item.h - y), pl.y + x] : [pl.x + x, pl.y + y];
}

// The largest upright rectangle we know is inside the part, in sheet coordinates.
// For an angled part this is the strip below the lower end of the slope.
function safeBox(pl) {
  const it = pl.item;
  const lowTop = it.shape ? Math.min(it.shape.front, it.shape.back) : it.h;
  const a = toSheet(pl, [0, 0]), b = toSheet(pl, [it.w, lowTop]);
  return { x1: Math.min(a[0], b[0]), y1: Math.min(a[1], b[1]), x2: Math.max(a[0], b[0]), y2: Math.max(a[1], b[1]) };
}

// Text block size for lines at a height, horizontal. Includes room for descenders.
function blockSize(lines, height) {
  const T = DXF_SETTINGS.text;
  const w = Math.max(...lines.map(l => l.length)) * height * T.charWidth;
  const h = height * (1 + T.lineSpacing * (lines.length - 1)) + height * 0.35;
  return { w, h };
}

// Choose the largest label that fits inside the part, trying the full label then just the number,
// horizontal first, then turned 90 degrees for long thin parts. Returns null when nothing fits.
export function fitLabel(pl, full, short) {
  const T = DXF_SETTINGS.text, box = safeBox(pl);
  const bw = box.x2 - box.x1, bh = box.y2 - box.y1;
  for (const lines of [full, short]) {
    for (let height = T.height; height >= T.minHeight - 1e-9; height = Math.round((height - 0.5) * 10) / 10) {
      const pad = Math.min(T.padding, Math.max(1, height / 2));
      const s = blockSize(lines, height);
      for (const vertical of [false, true]) {
        const w = vertical ? s.h : s.w, h = vertical ? s.w : s.h;
        if (w + 2 * pad > bw || h + 2 * pad > bh) continue;
        // Centre the block in the safe box
        const bx = box.x1 + (bw - w) / 2, by = box.y1 + (bh - h) / 2;
        return { lines, height, vertical, box: { x1: bx, y1: by, x2: bx + w, y2: by + h } };
      }
    }
  }
  return null;
}

export function buildDxf(group, sheets, reference) {
  const S = DXF_SETTINGS, Ly = S.layers;
  if (S.dxfVersion !== 'AC1021') throw new Error('Only DXF version AC1021 is supported by the current writer.');
  const dxf = new DxfWriter();
  dxf.setVariable('$ACADVER', { 1: S.dxfVersion });
  dxf.setVariable('$LASTSAVEDBY', { 1: 'madetofit' });
  dxf.setVariable('$INSUNITS', { 70: S.units.insunits });
  dxf.setVariable('$MEASUREMENT', { 70: S.units.measurement });
  dxf.addLayer(Ly.cut.name, Ly.cut.color, 'Continuous');
  dxf.addLayer(Ly.labels.name, Ly.labels.color, 'Continuous');
  dxf.addLayer(Ly.sheet.name, Ly.sheet.color, 'Continuous');
  const drillLayers = new Set();
  const poly = (pts, layerName) => dxf.addLWPolyline(pts.map(([x, y]) => ({ point: { x: r3(x), y: r3(y) } })), { flags: LWPolylineFlags.Closed, layerName });
  const text = (x, y, h, value, layerName, rotation = 0, max) => dxf.addText(point3d(r3(x), r3(y), 0), r3(h), cleanText(value, max), { layerName, rotation });

  const { sheetW, sheetH } = group;
  const warnings = [];
  sheets.forEach((sheet, si) => {
    const ox = si * (sheetW + S.layout.sheetSpacing);
    poly([[ox, 0], [ox + sheetW, 0], [ox + sheetW, sheetH], [ox, sheetH]], Ly.sheet.name);
    const th = S.layout.sheetTitleHeight;
    text(ox, -th * 2, th, `Sheet ${si + 1} of ${sheets.length}  ${group.material} ${group.thickness}mm  ${sheetW} x ${sheetH}  order ${reference}`, Ly.sheet.name, 0, 120);

    for (const pl of sheet.placements) {
      const it = pl.item;
      const shift = ([x, y]) => [ox + x, y];
      // Outline, kept anticlockwise after turning so every closed shape winds the same way
      poly(it.outline.map(p => shift(toSheet(pl, p))), Ly.cut.name);
      for (const hole of it.holes) {
        const layer = drillLayerName(hole.dia, hole.depth);
        if (!drillLayers.has(layer)) { dxf.addLayer(layer, Ly.drill.color, 'Continuous'); drillLayers.add(layer); }
        const [cx, cy] = shift(toSheet(pl, [hole.x, hole.y]));
        dxf.addCircle(point3d(r3(cx), r3(cy), 0), r3(hole.dia / 2), { layerName: layer });
      }
      const full = [`P${it.number} ${it.label}`, `${it.w} x ${it.h}mm`], short = [`P${it.number}`];
      const fit = fitLabel(pl, full, short);
      pl.labelFit = fit;
      if (!fit) { warnings.push(`P${it.number} ${it.label} is too small for a label.`); continue; }
      const T = S.text, desc = fit.height * 0.35;
      fit.lines.forEach((line, k) => {
        if (fit.vertical) {
          // Turned 90 degrees: lines run upwards, stacked from right to left
          const x = fit.box.x2 - desc - k * fit.height * T.lineSpacing;
          text(ox + x, fit.box.y1, fit.height, line, Ly.labels.name, 90);
        } else {
          const y = fit.box.y2 - fit.height - k * fit.height * T.lineSpacing;
          text(ox + fit.box.x1, y, fit.height, line, Ly.labels.name);
        }
      });
    }
  });
  // So CAD software zooms to the whole drawing on opening
  const totalW = sheets.length * sheetW + (sheets.length - 1) * S.layout.sheetSpacing;
  dxf.setVariable('$EXTMIN', { 10: 0, 20: -S.layout.sheetTitleHeight * 3, 30: 0 });
  dxf.setVariable('$EXTMAX', { 10: totalW, 20: sheetH, 30: 0 });
  return { content: dxf.stringify(), warnings };
}
