# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # local dev server (Vite + Pages Functions + D1)
npm run build        # build to dist/
npm run deploy       # build + deploy to Cloudflare Pages
```

## Architecture

**Stack:** Vite + React + Cloudflare Pages Functions + Cloudflare D1 (SQLite)

```
src/AssetTracker.jsx      # main React component (all UI + logic)
src/main.jsx              # React entry point
functions/api/data.js     # Cloudflare Pages Function — REST API for D1
schema.sql                # D1 table definition (run once to init)
wrangler.toml             # Cloudflare config (D1 binding: env.DB)
```

The original `asset-tracker.jsx` at the root is the pre-migration source; `src/AssetTracker.jsx` is the live version.

**API:** Single endpoint `/api/data`
- `GET` → `{ value: string | null }` — full JSON blob from D1
- `POST` `{ value: string }` → saves serialized data
- `DELETE` → clears all data

**Storage shape:** The entire app state is stored as a single JSON string in D1's `kv` table under key `"asset-tracker-data"`. Shape:
```
{
  cashAccounts: [{ name: string, currency: "TWD"|"USD"|"AUD"|"JPY" }],
  [year]: {
    [monthIndex 0–11]: {
      cash: { [accountName]: number },  // keyed by cashAccounts[].name
      insurance: number,
      stock: number,
      stockUS: number,   // USD amount, converted to TWD at runtime
      fund: number,
      etf: number
    }
  }
}
```

**Asset categories** are defined in the `CATEGORIES` constant in `AssetTracker.jsx`. Adding a category there propagates to all UI and storage automatically.

**Styling:** All styles are inline via a `styles` object at the bottom of `AssetTracker.jsx`. No CSS files or Tailwind.

**Local D1** state is stored in `.wrangler/state/v3/d1/` during `npm run dev`.

## One-time setup (first deploy)

```bash
# 1. Create D1 database and copy the returned database_id into wrangler.toml
npx wrangler d1 create asset-tracker-db

# 2. Create the table locally and remotely
npx wrangler d1 execute asset-tracker-db --local --file=schema.sql
npx wrangler d1 execute asset-tracker-db --remote --file=schema.sql

# 3. Deploy
npm run deploy
# First run will prompt for a Cloudflare Pages project name
```
