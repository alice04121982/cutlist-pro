# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Nervous first-time builders: UK homeowners with an awkward space (under the eaves, under the stairs, an alcove) who have never built furniture. They want a fitted cupboard without paying a carpenter, and need to feel the job is doable, safe and correct before they spend money on board. Confident DIYers use it too, but the brand is pitched at the first-timer (confirmed 12 October 2026).

## Product Purpose

Made to Fit turns a photo of an awkward space into a fitted cupboard you can build yourself: the space is measured on the photo, a design is chosen and previewed on that photo, and the product produces exact cuts, sheet layouts, a picture manual and a supplier-ready order. Success is a first-timer finishing a cupboard that fits, at the price of the board rather than the £2,000 to £3,000 a carpenter charges.

## Positioning

The photo of the reader's own space is the starting point and the proof: the design is measured on it, previewed on it, then broken into boxes that fit up the stairs and onto one sheet each. Cut-list tools start from a spreadsheet; this starts from the room.

## Operating Context

Used at home, often on a phone in the space itself (taking the photo, measuring against a bank card or A4 sheet, AR on Android), then on a larger screen to review drawings and order. Outputs leave the app: a printable picture manual, a cut list CSV and DXF order pack, a quote email to a UK cutting service, an Amazon fittings basket.

## Capabilities and Constraints

- Static site (`index.html`, `styles.css`, `app.js`) with one serverless function for the design assistant; no build step. Strict CSP: fonts from Google Fonts or self-hosted only.
- Templates: under-eaves, under-stairs, wardrobe, open shelving, kitchen base, wall cupboard; building work (stud walls, joists, roofs) with a stop notice.
- Safety checks on every furniture design (shelf sag, strength, pin load, racking, wall fixing) with one-tap fixes.
- Light and dark themes.
- The product was renamed from CutList Pro to Made to Fit (October 2026).

## Brand Commitments

- Name: Made to Fit. The logo is fixed: the "m" cupboard mark (`assets/icon.svg`, `.brand-mark` in `index.html`) and the lowercase "made to fit" wordmark in Outfit 600. Only its colour may change (confirmed 12 October 2026).
- Fonts already used by sibling products are off limits: Bricolage Grotesque and Hanken Grotesk (IVF app), Archivo (Stay Prepared).
- No em dashes in copy; ranges use "to".
- Look and feel: the "Drafting table" direction with a pencil-sketch feel, chosen 12 October 2026 (`docs/brand/look-and-feel.html`, option 3). The earlier Chalk Line look was rejected as generic SaaS. Earlier explorations live in `docs/brand/`.

## Evidence on Hand

No testimonials, user counts, press or reviews exist. The safety rules and sources are in `docs/SAFETY.md`; the order file format in `docs/ORDER-PACK.md`. There are no photos of our own users' builds. The home page uses a pencil sketch drawn in code plus licensed Unsplash photos credited in the README and footer; never present them as customer builds. Do not invent customers, savings figures beyond the carpenter range above, or build counts.

## Product Principles

1. The reader's own space comes first; every screen should feel anchored to it.
2. Make a first-timer feel capable: show the next step, never the whole trade.
3. Exact and honest: measurements, prices and safety limits are specific and sourced.
4. Privacy by default: photos never leave the device.

## Accessibility & Inclusion

WCAG AA contrast in both themes; reduced motion respected in the animated manual; usable one-handed on a phone in a cramped space.
