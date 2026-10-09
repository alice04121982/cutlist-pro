# Safety checks: rules, figures and sources

This page lists every rule the app uses to check a furniture design, so a qualified carpenter or engineer can review it. The checks are in `safetyChecks()` and `shelfCheck()` in `app.js`. They are estimates to catch unsafe designs, not a certificate.

**Status: awaiting professional review.**

## 1. Shelf sag (stiffness)

- Model: shelf as a simply supported beam with a uniform load (conservative: real shelves on pins or screws are partly restrained).
- Instant sag: `u = 5 w L^4 / (384 E I)`, with `I = b t^3 / 12` (b = shelf depth, t = board thickness, L = clear span between sides or dividers).
- Long-term sag: `u_fin = u (1 + k_def)` (EN 1995-1-1, 3.1.4). Assumes the shelf stays loaded.
- **Fail** if `u_fin > L / 200`. 0.5% of span is the limit most furniture specifications apply to the EN 16122 shelf deflection test ([CATAS](https://catas.com/uploads/media/mobili-e-ripiani-imbarcati-alcune-considerazioni-eng.pdf)).
- **Warn** if instant sag `> L / 600` (Sagulator's "visible sag" target of 0.02 in per foot, [woodbin.com](https://woodbin.com/calcs/sagulator/)).

## 2. Shelf strength

- Bending stress `σ = 1.5 × w L^2 / 8 / (b t^2 / 6)` (1.5 load factor, EN 1990 variable action).
- Design strength `f_d = k_mod × f_m / γ_M` with permanent-load k_mod and γ_M from EN 1995-1-1 Tables 3.1 and 2.3.
- **Fail** if `σ > f_d`.

## 3. Material values (N/mm²)

| App material | E used | f_m | k_def | k_mod | γ_M | Basis |
|---|---|---|---|---|---|---|
| Plywood | 7,452 | 34.1 | 0.8 | 0.6 | 1.2 | Birch ply 18mm **across** the face grain, Metsä DoP MW/PW/411-001. Along the grain is 10,048. Cross-grain is used because the sheet packer may rotate parts. |
| MDF | 2,200 | 20 | 2.25 | 0.2 | 1.3 | EN 622-5 product minimum (12 to 19mm). Design value in EN 12369-1 is 3,000. |
| Melamine-faced chipboard | 1,600 | 11 | 2.25 | 0.3 | 1.3 | EN 312 P2 minimum. P2 is non-structural; k_def taken as for P4/P5 (our assumption). |
| OSB | 1,980 | 8.2 | 1.5 | 0.4 | 1.2 | OSB/3 across the strands, EN 12369-1. Along the strands is 4,930. |

Sources: [Metsä birch DoP](https://cdn.byggtjeneste.no/nobb/097daa71-8f19-4787-a34c-b325c3cb9a6e), [EN 12369-1 and EN 1995-1-1 tables as reproduced by University of Galway / Swedish Wood](https://www.universityofgalway.ie/media/timberengineeringresearchgroup/Design-of-timber-structures_Volume2_Rules-and-formulas-according-to-Eurocode-5.pdf), [Kastamonu MDF](https://www.kastamonuentegre.com/uploads/2023/01/004-ts-eng-001-2-medepan-technical-specifications.pdf), [Kastamonu P2](https://www.kastamonuentegre.com/uploads/2023/03/1200-ub-002-technical-data-sheet-particle-board-boards-type-p2-emission-class-e1.pdf), [West Fraser OSB/3 DoP](https://uk.westfraser.com/wp-content/uploads/2023/07/UKOSB3DoPv1_E.pdf).

Note: softwood and poplar plywood (common in UK DIY stores) is less stiff than birch. The app currently treats all plywood as birch.

## 4. Loads

The load per metre of shelf is the larger of an area load and a running load.

| Setting | Area load | Running load | Basis |
|---|---|---|---|
| Light | 1.0 kg/dm² | none | Domestic shelf test level (ISO 7170, UNI 11663 level 1) |
| Books (default for shelving and eaves) | 1.0 kg/dm² | 60 kg/m | Upper end of 30 to 60 kg/m for books (Sagulator notes) |
| Heavy (default for kitchens) | 1.5 kg/dm² | 60 kg/m | Kitchen shelf test level |

Source for test levels: [CATAS comparison table](https://catas.com/uploads/media/catas-tabella-comparativa-norme-mobili-eng-febbraio-2024.pdf).

## 5. Shelf pins

- Load per pin = shelf load / 4. **Fail** above 12 kg.
- 12 kg is the lower of common UK ratings: Häfele zinc support 12.5 kg ([Screwfix](https://screwfix.com/p/hafele-galvanised-steel-shelf-supports-100-pack/1803t)); Würth OPTIMUS 20 kg to DIN 16337.

## 6. Racking

- Every cabinet and open shelf unit gets a 3mm back panel pinned to every edge and divider. A fixed back acts as a shear panel; a loose one does nothing ([Fine Woodworking](https://www.finewoodworking.com/forum/bookcase-despair)).
- No quantitative racking rule was found. **Review needed.**

## 7. Tipping and wall fixing

- Every unit gets a "fix it to the wall" step and fixings in the hardware list. RoSPA advises securing bookshelves and drawers to the wall ([RoSPA](https://www.rospa.com/home-safety/Accidents-to-Children)); GOV.UK says heavy furniture should be attached to the wall ([GOV.UK](https://www.gov.uk/guidance/consumer-product-safety-advice-for-staying-safe)).
- No UK statutory height threshold exists, so the app tells you to fix every unit.

## 8. Joints

- Screws into MDF or chipboard edges get a warning: drill pilot holes (85 to 90% of the screw's root diameter, [study](https://www.redalyc.org/journal/744/74460212007/74460212007.pdf)), keep away from corners, or use cam and dowel. EN 320 edge screw-holding minimums: P2 ≥ 450 N, MDF > 700 N.
- No manufacturer figures for screw spacing were found. The app uses at least 2 screws per joint, one per 150mm of depth. **Review needed.**

## 9. Out of scope

- Stud walls, joists and roofs: the app shows a stop notice. These need Building Regulations approval and an engineer.
- Wardrobe hanging rails, drawer runners and door hinges: not calculated. The app follows the fitting makers' ratings.

## Gaps for the reviewer

1. Should plywood use along-grain stiffness if the cut file locks grain direction on shelves?
2. Is L/200 with full creep the right pass line for domestic shelving?
3. A racking rule for open units without doors.
4. Minimum screw count and spacing per joint by material.
