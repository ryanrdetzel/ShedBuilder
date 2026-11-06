# ShedBuilder

Shed Workshop is a browser-based shed designer. Set the footprint, wall height, roof style, and openings. Inspect the finished exterior or framing in 3D, hide the roof, and use section cuts to look inside.

The prototype starts with a 12 × 16 ft gable shed. It also supports lean-to roofs, a floor plan with movable openings, editable sample prices, and comparisons by cost, lumber offcuts, or crosscut count. The CSV export includes the shopping list and rough cut assignments.

## Run locally

Serve the static files over HTTP from the repository root.

```sh
python3 -m http.server 8000 --directory dist
```

Open [http://localhost:8000](http://localhost:8000). The app stores the current design and unit prices in the browser.

## Cloudflare Workers

The included Wrangler configuration serves `dist/` as static assets. Preview locally with Wrangler, or sign in to the intended Cloudflare account and deploy from the repository root.

```sh
npx wrangler@4 dev
```

```sh
npx wrangler@4 deploy
```

## Scope

This is a concept model. Material prices are editable estimates, and framing dimensions, fastener allowances, and rough cut lengths require review before construction.
