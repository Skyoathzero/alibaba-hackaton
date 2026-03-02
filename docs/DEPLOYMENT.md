# Deploy Property Valuation Dashboard to Vercel

## What's Ready

- **`viz/vercel.json`** — SPA rewrites so `/property/:id` and other client routes work on refresh
- **Build verified** — `npm run build` in `viz/` produces static assets with all CSV files in `dist/`

## Manual Steps

### 1. Push to GitHub

```bash
git push origin main
```

(Must be logged in to GitHub. If using HTTPS, ensure credentials are configured.)

### 2. Deploy via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) and sign in (GitHub recommended)
2. Click **Add New Project** and import `alibaba-hackaton`
3. Set **Root Directory** to `viz`
4. Confirm:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Click **Deploy**

### 3. Deploy via Vercel CLI (Alternative)

```bash
cd viz
vercel login   # if not already logged in
npx vercel     # preview deploy
npx vercel --prod   # production deploy
```

## Verify After Deploy

- Homepage loads at your Vercel URL
- Navigate to a property detail page (e.g. `/property/abc123`)
- Refresh the page — should not 404 (SPA rewrites)
- Open DevTools Network tab — all 4 CSVs should load (200 OK)
