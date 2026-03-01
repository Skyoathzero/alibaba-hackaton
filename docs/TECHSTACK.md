# Tech Stack

## Frontend

| Layer            | Technology                        | Version  |
| ---------------- | --------------------------------- | -------- |
| Framework        | React                             | 19.2.0   |
| Build Tool       | Vite                              | 7.3.1    |
| Routing          | React Router DOM                  | 7.13.1   |
| Charting         | Recharts                          | 3.7.0    |
| Mapping          | Leaflet + React Leaflet           | 1.9.4 / 5.0.0 |
| CSV Parsing      | PapaParse                         | 5.5.3    |
| Linting          | ESLint (React plugins)            | 9.39.1   |
| Language         | JavaScript (ES Modules)           | —        |

### State Management

- **React Context** (`DataContext.jsx`) — single global provider that loads all CSV datasets on mount and exposes them via a `useData()` hook. No external state library.

### External APIs (Optional)

- **Google Places API** — fetches nearby amenities (education, healthcare, shopping, leisure, transport)
- **Google Street View Static API** — property thumbnail images
- **OpenStreetMap / CartoDB** — base map tiles via Leaflet

---

## Backend (Python Data Pipeline)

| Library              | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `httpx` ≥0.25.0      | Async HTTP client for web scraping           |
| `playwright` ≥1.40.0 | Browser automation fallback (stealth mode)   |
| `beautifulsoup4`     | HTML parsing of listing pages                |
| `lxml`               | Fast XML/HTML processing                     |
| `pandas` ≥2.1.0      | Data manipulation, CSV read/write            |

### Pipeline Scripts

```
scraper.py          →  Scrapes Rumah123 listings (httpx, ~15 concurrent)
exporter.py         →  Normalizes & exports raw CSV
clean.py            →  Filters bad rows (missing coords, excess nulls)
generate_mock_history.py  →  Synthesizes 36-month price history
generate_mock_news.py     →  Synthesizes news articles + sentiment signals
periodic_scraper.py       →  Scaffold for recurring monthly price updates
config.py           →  Central configuration (regions, concurrency, delays)
```

---

## Data Format

All data is served as **static CSV files** loaded client-side at startup. No backend server runs at runtime.

| File                        | Records          | Description                              |
| --------------------------- | ---------------- | ---------------------------------------- |
| `jakarta_housing_clean.csv` | ~5000 properties | Scraped listings with 49 columns         |
| `price_history.csv`         | ~180k rows       | 36 months of monthly prices per property |
| `news_signals.csv`          | ~600 rows        | Aggregated monthly sentiment by region   |
| `articles.csv`              | ~700 articles    | Individual news with sentiment scores    |

---

## Infrastructure

- **No backend server** — fully static SPA after build
- **No database** — CSV files as data source
- **Deployment** — standard Vite build (`npm run build`) produces static assets
- **Dev server** — `npm run dev` with HMR via Vite
