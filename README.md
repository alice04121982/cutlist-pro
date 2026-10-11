# Made to Fit

Photograph the space, pick a design, and get exact cuts, build steps and a supplier-ready order.

Static site: `index.html`, `styles.css`, `app.js`, `assets/`, plus one serverless function, `api/assistant.js`, for the design assistant. No build step.

## The flow

1. **Space**: pick what you are making, add a photo, measure on the photo (bank card or A4 for scale) or with AR on Android.
2. **Design**: material, doors, compartments (upright dividers), shelves per compartment, joinery (screws, pocket screws, cam and dowel). Preview on your photo with a before/after slider, as a dimensioned drawing, or in 3D.
3. **Cut list**: every panel, sheet layouts, timber lengths, hinge holes, hardware. Sizes can be edited.
4. **Build**: an IKEA-style picture manual (lettered parts, actual-size hardware, exploded assembly drawings, printable as PDF) plus a step-by-step text guide.
5. **Order**: itemised estimate, an order pack (cut list CSV plus a DXF with true shapes and every hole to drill), and "Send to a cutter": UK cutting services matched to your postcode and to what the design needs (angled cuts, drilling, edging), with a pre-filled quote email. The file format is described for partners in [docs/ORDER-PACK.md](docs/ORDER-PACK.md).

Templates: under-eaves cupboard, under-stairs cupboard (tall end left or right, every upright, top and door cut to the stair angle), wardrobe, open shelving, kitchen base, wall cupboard, plus stud wall, partition, floor joists, flat roof and pitched roof.

## Built as boxes

Long furniture is split automatically into separate boxes. How big a box can be depends on where it is going (ground floor 2400mm, upstairs 1800mm, loft or attic 1200mm: the longest panel you can carry in), and every panel, including sloped tops and 3mm backs, must also fit its sheet. This works like kitchen units: each box is a complete carcass (two sides, top, bottom, back) that fits on one sheet and up the stairs. Boxes are joined in place with cabinet connector screws. The number of boxes can be set by hand. The cut list, fittings (screws per joint, connectors, panel pins per back, brackets, packers), drawings and the picture manual all follow the boxes: build one box, make N, join them, fix to the wall.

## Safety checks

Every furniture design is checked as you edit it: shelf sag over time (beam formula with Eurocode 5 creep), shelf strength, load per shelf pin, back panel against racking, and wall fixing. Failing checks offer a one-tap fix (more compartments, thicker board, plywood). The rules, figures and sources are in [docs/SAFETY.md](docs/SAFETY.md) for professional review. Building work (walls, joists, roofs) is not checked and shows a stop notice.

The picture manual animates each step: parts slide into place, with a pause button, and stays still for reduced motion and in print.

## Design assistant ("Change it")

Type what is wrong in plain English ("make it five compartments with two shelves each, no doors") and the design updates. The request and the design sizes go to `api/assistant.js`, which asks Claude (`claude-opus-5-5`, low effort, structured JSON output, server-side refusal fallback) for a list of setting changes. The browser validates every change again before applying it.

To switch it on in Vercel:

1. Add an environment variable `ANTHROPIC_API_KEY` (Project Settings, Environment Variables) and redeploy.
2. Set a monthly spend limit for that key in the Anthropic Console. The function also rate-limits each visitor, accepts same-origin requests only and caps message length.

Without a key, or if the AI is unreachable, a built-in phrase parser handles the common requests (compartments, shelves, doors, sizes, board, joining) so the button still works.

## Design system

- Type: General Sans (display) and Satoshi (body) from Fontshare, JetBrains Mono for measurements.
- Colour: cool neutrals with one accent, hi-vis orange `#FF5B1F`. Dark text on the accent for contrast.
- Shape: surfaces 12px radius, every button and chip a full pill.
- Light and dark themes follow the system, with a manual toggle.
- Icons: Phosphor (regular).

UX patterns referenced on Mobbin: Zillow virtual staging (before/after slider, shown on a drawn 3D loft), Cal AI and Quizlet capture tips, IKEA camera framing, IKEA and LARQ step-by-step setup, Stripe split configurator with live preview, Instacart and Amazon checkout summaries.

## Privacy and security

- Photos are processed in the browser and never uploaded or stored. The assistant only receives the typed request and the design sizes.
- Projects are stored in `localStorage` on the device only and validated on load.
- Strict Content Security Policy (no inline scripts or handlers), Subresource Integrity on the icon stylesheet, escaped output everywhere, spreadsheet formula injection guarded in CSV exports.

Hosting headers are set in `vercel.json` (frame-ancestors and HSTS cannot be set from a meta tag). On another host, send:

```
Content-Security-Policy: frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), geolocation=(), microphone=(), xr-spatial-tracking=(self)
```

## Credits

The home page loft scene is drawn in code (`heroScene()` in `app.js`). Design tile photo by Andrea Davis on Unsplash.

Prices are estimates. Always check measurements before you order.
