# CutList Pro

Photograph the space, pick a design, and get exact cuts, build steps and a supplier-ready order.

Static site: `index.html`, `styles.css`, `app.js`, `assets/`. No build step. Open `index.html` through any static server.

## The flow

1. **Space**: pick what you are making, add a photo, measure on the photo (bank card or A4 for scale) or with AR on Android.
2. **Design**: material, doors, shelves, joinery (screws, pocket screws, cam and dowel). Preview on your photo with a before/after slider, as a dimensioned drawing, or in 3D.
3. **Cut list**: every panel, sheet layouts, timber lengths, hinge holes, hardware. Sizes can be edited.
4. **Build**: generated step-by-step guide with the parts for each step highlighted.
5. **Order**: itemised estimate, delivery options, CNC cut file for UK cutting services.

Templates: under-eaves cupboard, wardrobe, open shelving, kitchen base, wall cupboard, plus stud wall, partition, floor joists, flat roof and pitched roof.

## Design system

- Type: General Sans (display) and Satoshi (body) from Fontshare, JetBrains Mono for measurements.
- Colour: cool neutrals with one accent, hi-vis orange `#FF5B1F`. Dark text on the accent for contrast.
- Shape: surfaces 12px radius, every button and chip a full pill.
- Light and dark themes follow the system, with a manual toggle.
- Icons: Phosphor (regular).

UX patterns referenced on Mobbin: Zillow virtual staging (before/after slider), Cal AI and Quizlet capture tips, IKEA camera framing, IKEA and LARQ step-by-step setup, Stripe split configurator with live preview, Instacart and Amazon checkout summaries.

## Privacy and security

- Photos are processed in the browser and never uploaded or stored.
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

Hero photo by Алан Албегов, design tile photo by Andrea Davis, both on Unsplash.

Prices are estimates. Always check measurements before you order.
