# Order pack: what a cutting partner receives

CutList Pro turns a customer's design into two files. This page is for cutting services: it says exactly what is in them, so an order can be cut, drilled, edged and delivered without a back-and-forth quote.

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

## 2. Drawing (`<project>.dxf`, millimetres)

- One outline per part type on layer `CUT`, drawn at true shape (angled eaves sides and under-stairs doors are not rectangles).
- Holes as circles on layers named by diameter and depth, for example `DRILL_5MM_10DEEP` (shelf pins), `DRILL_5MM_18DEEP` (shelf pins drilled through dividers), `DRILL_35MM_13DEEP` (hinge cups).
- Each part's origin is its bottom-left corner. x is measured from the front edge (the hinge edge on doors), y up from the bottom edge.
- A `LABEL` text under each part gives the name, quantity and size.

## What we would like from a partner

1. A price from the files without a manual quote (an API, a price list we can apply, or a fixed rate per sheet, cut, hole and metre of edging).
2. Cut, drilled and edged panels delivered in 3 to 4 working days, labelled with the part names above.
3. The hardware pack (screws, connectors, pins, hinges, brackets) shipped with the panels.
