// Every setting the cutting partner may want changed lives here, and only here.
// PlyCut has not yet confirmed their layer names, units, text rules or DXF version.
// When they reply, change the values below; nothing else in the code needs to move.
// (Files and folders in api/ that start with an underscore are not deployed as endpoints.)

export const DXF_SETTINGS = Object.freeze({
  // The DXF version written into the header. The writer library (@tarikjabiri/dxf) produces
  // AutoCAD 2007 structure, so 'AC1021' is the only honest value. If PlyCut need R12 (AC1009),
  // the writer has to change too: buildDxf() refuses any other value rather than mislabel the file.
  dxfVersion: 'AC1021',

  // Units. 4 = millimetres in $INSUNITS; 1 = metric in $MEASUREMENT.
  units: { insunits: 4, measurement: 1, label: 'mm' },

  // Layer names and colours (AutoCAD colour index: 1 red, 2 yellow, 3 green, 4 cyan, 5 blue, 7 white/black, 8 grey).
  layers: {
    cut: { name: 'CUT', color: 7 },
    labels: { name: 'LABELS', color: 3 },
    sheet: { name: 'SHEET', color: 8 },
    drill: {
      color: 1,
      // 'byDiameterAndDepth' writes DRILL_5MM_10DEEP and so on, so the router knows how deep to go.
      // 'single' puts every hole on one layer called `prefix`.
      mode: 'byDiameterAndDepth',
      prefix: 'DRILL'
    }
  },

  // Text on the LABELS layer. Heights in mm. Labels shrink to fit small parts, never below minHeight.
  text: {
    height: 20,
    minHeight: 3,
    // Assumed width of one character as a share of the text height. Kept on the generous side so a
    // label drawn in a wider CNC font still stays inside its part.
    charWidth: 0.9,
    lineSpacing: 1.6, // baseline to baseline, as a multiple of height
    padding: 8, // clear space between a label and the part outline
    // Characters allowed in any text written to the file. Everything else is removed. This also stops
    // a part name from injecting DXF group codes through a line break.
    allowed: /[^A-Za-z0-9 #&()+,./:'x-]/g,
    maxLength: 40
  },

  // Sheet layout defaults. All can be overridden per request within the limits below.
  layout: {
    gap: 6, // space left between parts for the cutter
    margin: 10, // space left from every sheet edge
    sheetSpacing: 300, // space between sheets in the file, along x
    // Which way the board's grain runs: along the sheet's longer side ('length') or shorter side ('width').
    sheetGrain: 'length',
    sheetTitleHeight: 30
  },

  // Default stock sheet for each material. Length first.
  sheets: {
    plywood: { w: 2440, h: 1220 },
    mdf: { w: 2440, h: 1220 },
    melamine: { w: 2440, h: 1220 },
    osb: { w: 2440, h: 1220 },
    hardboard: { w: 2440, h: 1220 }
  },

  // What the server accepts. Anything outside these is rejected with a clear message.
  limits: {
    bodyBytes: 512 * 1024,
    outputBytes: 4 * 1024 * 1024, // Vercel caps a response at about 4.5MB
    materials: 10,
    partTypes: 300,
    qtyPerPart: 200,
    expandedParts: 1000,
    holesPerPart: 300,
    totalHoles: 20000,
    sheetsPerFile: 100,
    partSize: [10, 3700], // smallest and largest side of a part
    sheetW: [300, 3700],
    sheetH: [300, 2200],
    thickness: [3, 50],
    gap: [0, 30],
    margin: [0, 100],
    holeDia: [1, 60],
    nameLength: 60
  },

  // File names: madetofit-order-{reference}-{material}-{thickness}mm.dxf
  fileNamePrefix: 'madetofit-order'
});

export const MATERIAL_KEYS = Object.freeze(Object.keys(DXF_SETTINGS.sheets));

export function drillLayerName(dia, depth) {
  const d = DXF_SETTINGS.layers.drill;
  if (d.mode === 'single') return d.prefix;
  return `${d.prefix}_${fmtNum(dia)}MM_${fmtNum(depth)}DEEP`;
}

// 5 -> "5", 2.5 -> "2P5": no dots in layer names, which some CAM software dislikes.
function fmtNum(n) { return String(Math.round(n * 10) / 10).replace('.', 'P'); }
