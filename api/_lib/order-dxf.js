// From a validated cut list to DXF files and a summary: one file per material and thickness.
import { randomBytes } from 'node:crypto';
import { DXF_SETTINGS } from './dxf-settings.js';
import { validateOrder, polygonArea } from './validate.js';
import { nest, verifyLayout, LayoutError } from './nest.js';
import { buildDxf } from './dxf-build.js';

// A random reference for the file names. It is not linked to the customer and holds no personal data.
export function newReference() { return randomBytes(4).toString('hex').toUpperCase(); }

export function safeFileName(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/\.{2,}/g, '.').replace(/-{2,}/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 120) || 'file';
}

export function fileNameFor(reference, material, thickness) {
  const t = String(thickness).replace('.', '-');
  return safeFileName(`${DXF_SETTINGS.fileNamePrefix}-${reference}-${material}-${t}mm`) + '.dxf';
}

export function generateOrderDxf(body, { reference = newReference() } = {}) {
  if (!/^[A-Z0-9-]{1,40}$/i.test(reference)) throw new Error('Bad reference');
  const order = validateOrder(body);
  const files = [], summary = [];
  for (const mat of order.materials) {
    const types = order.parts.filter(p => p.materialId === mat.id);
    if (!types.length) continue;
    // Expand quantities: a part with quantity 4 becomes four numbered pieces
    const items = [];
    for (const t of types) for (let i = 0; i < t.qty; i++) {
      items.push({ ...t, id: items.length, number: items.length + 1, label: t.qty > 1 ? `${t.name} #${i + 1}` : t.name, area: polygonArea(t.outline) });
    }
    const opts = { sheetW: mat.sheetW, sheetH: mat.sheetH, gap: order.gap, margin: order.margin };
    const sheets = nest(items, opts);
    // Never send a layout that fails its own check
    const problems = verifyLayout(sheets, opts);
    const placedCount = sheets.reduce((n, s) => n + s.placements.length, 0);
    if (placedCount !== items.length) problems.push(`${items.length - placedCount} parts were not placed.`);
    if (problems.length) throw new LayoutError('The sheet layout failed its own check: ' + problems[0]);

    const group = { material: mat.material, thickness: mat.thickness, sheetW: mat.sheetW, sheetH: mat.sheetH };
    const { content, warnings } = buildDxf(group, sheets, reference);
    const filename = fileNameFor(reference, mat.material, mat.thickness);
    const sheetArea = mat.sheetW * mat.sheetH;
    files.push({ filename, content });
    summary.push({
      filename, material: mat.material, thickness: mat.thickness, sheetW: mat.sheetW, sheetH: mat.sheetH,
      parts: items.length,
      sheets: sheets.map((s, i) => {
        const used = s.placements.reduce((a, p) => a + p.item.area, 0);
        return { sheet: i + 1, parts: s.placements.length, wastePercent: Math.round(1000 * (1 - used / sheetArea)) / 10 };
      }),
      warnings
    });
  }
  const bytes = files.reduce((n, f) => n + Buffer.byteLength(f.content), 0);
  if (bytes > DXF_SETTINGS.limits.outputBytes) throw new LayoutError('These files would be too large to download in one go. Split the order into smaller parts.');
  return { reference, gap: order.gap, margin: order.margin, files, summary };
}
