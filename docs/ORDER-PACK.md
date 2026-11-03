# Order pack: what a cutting partner receives

Made to Fit turns a customer's design into two files. This page is for cutting services: it says exactly what is in them, so an order can be cut, drilled, edged and delivered without a back-and-forth quote.

## 1. Cut list (`<project>-CNC.csv`)

One row per physical panel (quantities are expanded). Columns:

| Column | Meaning |
|---|---|
| Part Name | Matches the label in the DXF and the customer's picture manual (for example `Box Side #3`) |
| Length, Width (mm) | Finished size, length along the grain |
| Qty | Always 1 per row |
| Material, Thickness | For example `Plywood`, 18. Backs are 3mm hardboard or ply |
| Grain | `L` = grain runs along the length |
| Edge L1, L2, W1, W2 | 1 = edge band that edge. L1 is the front edge |
| Scribed | `YES` = 2mm oversize on the wall edge, trimmed on site |
| Holes | Count of holes, positions in the DXF |
| Notes | Angled tops (`ANGLED TOP 800mm front to 400mm back`), bevels, hinge positions |

## 2. Drawings (`madetofit-order-{reference}-{material}-{thickness}mm.dxf`)

One DXF per material and thickness (for example the 18mm plywood and the 3mm hardboard backs are two files). Made on the server by `api/dxf.js`, written with the `@tarikjabiri/dxf` library.

- Units are millimetres (`$INSUNITS` 4, `$MEASUREMENT` 1). DXF version AC1021 (AutoCAD 2007).
- Parts are laid out on stock sheets (default 2440 x 1220, set per material), 10mm from the sheet edge and 6mm apart for the cutter. Every sheet for that material is in the same file, side by side along x, 300mm apart.
- Layer `SHEET`: the stock sheet outline and a title under it (sheet number, material, size, order reference). For reference only, not to be cut.
- Layer `CUT`: one closed polyline per piece at true shape (angled eaves sides are not rectangles). Quantities are expanded, so 4 doors are 4 outlines.
- Layers `DRILL_<dia>MM_<depth>DEEP`, for example `DRILL_5MM_10DEEP` (shelf pins), `DRILL_5MM_18DEEP` (through holes in 18mm board), `DRILL_35MM_13DEEP` (hinge cups): holes as circles at true diameter and position.
- Layer `LABELS`: inside each piece, a number (`P1`, `P2` ...), the part name as in the CSV (`Box Side #2`) and its size. Small pieces get smaller text or just the number. Text never touches the outline.
- Grain: plywood and melamine pieces keep their grain along the sheet length (the longer side of each piece follows the sheet's long side). MDF, OSB and hardboard pieces may be turned 90 degrees.
- No customer names, addresses or emails are in the file. The order reference is random.

Layer names, colours, text size, units and DXF version are all in `api/_lib/dxf-settings.js`, so they can change to suit a partner's software.

## What we would like from a partner

1. A price from the files without a manual quote (an API, a price list we can apply, or a fixed rate per sheet, cut, hole and metre of edging).
2. Cut, drilled and edged panels delivered in 3 to 4 working days, labelled with the part names above.
3. The hardware pack (screws, connectors, pins, hinges, brackets) shipped with the panels.

## Hardware

Cutters supply boards only, so the order page lists the hardware separately. Each item is rounded up to a typical pack size and has Amazon and Screwfix search links. "Copy shopping list" copies the whole list.

A one-click "Add all to Amazon basket" button appears once `AMAZON_TAG` (an Amazon Associates tag) and a checked ASIN for every item are filled in `SHOP` in `app.js`. The link carries only product IDs and quantities, never user data.

## Holes the cutter drills

All holes are on the panel faces, so a CNC router with a drilling head can do them. Positions are from the front edge (x) and bottom edge (y).

| Hole | Panel | Size |
|---|---|---|
| Shelf pins | Sides and dividers | 5mm x 10mm deep (through on dividers), 37mm from front and back |
| Joint screws | Sides, where top and bottom meet | 4mm through, countersink outside, 50mm from each end, one per 150mm |
| Cam bolts (flat-pack joining) | Sides | 5mm x 11mm deep |
| Cam housings | Tops and bottoms | 15mm x 13mm deep, 34mm from each end |
| Divider screws | Tops and bottoms | 4mm through, on the divider centre line |
| Connector screws | Box sides | 5mm through, matching on both boxes |
| Hinge cups | Doors | 35mm x 13mm deep |

Not in the DXF: the 8mm edge holes for cam bolts (need horizontal boring; the order email asks), hinge plate pilot holes, and pocket holes.
