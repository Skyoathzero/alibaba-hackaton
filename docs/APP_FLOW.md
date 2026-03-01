# App Purpose & Flow

## Purpose

**Property Collateral Risk Assessment Dashboard** — a bank-facing tool for evaluating Jakarta residential properties as loan collateral.

The app combines real estate data, ML-style risk scoring, price forecasting, news sentiment analysis, and automated loan decisioning into a single interactive dashboard. It helps credit analysts make faster, data-driven lending decisions on property-backed loans.

---

## Key Capabilities

1. **Risk Scoring** — Weighted composite score (0–100) per property based on price stability, growth trend, news sentiment, amenity access, property quality, and location
2. **Price Prediction** — 12-month forward price estimate using historical growth rates adjusted by regional sentiment
3. **Loan Assessment** — Automated LTV calculation, DSCR analysis, collateral coverage ratio, and lending decision (Recommend / Due Diligence / Decline)
4. **Amenity Mapping** — Nearby points of interest (schools, hospitals, malls, parks, transit) via Google Places API
5. **News Sentiment** — Regional/national news articles with NLP sentiment scores overlaid on price charts

---

## Data Pipeline

```
Rumah123.com (Jakarta listings)
        │
        ▼
  ┌─────────────┐     ┌──────────────┐     ┌────────────┐
  │ scraper.py   │ ──▶ │ exporter.py  │ ──▶ │  clean.py  │
  │ (httpx async)│     │ (normalize)  │     │ (filter)   │
  └─────────────┘     └──────────────┘     └─────┬──────┘
                                                  │
                    ┌─────────────────────────────┼──────────────────┐
                    ▼                             ▼                  ▼
        ┌───────────────────┐     ┌───────────────────┐  ┌─────────────────┐
        │ generate_mock_    │     │ generate_mock_     │  │ jakarta_housing_ │
        │ history.py        │     │ news.py            │  │ clean.csv        │
        │ → price_history   │     │ → articles.csv     │  │ (properties)     │
        │   .csv            │     │ → news_signals.csv │  │                  │
        └───────────────────┘     └───────────────────┘  └─────────────────┘
```

All outputs are static CSV files loaded by the React frontend at startup.

---

## User Flow

### 1. App Initialization

```
Browser loads SPA
        │
        ▼
  DataProvider mounts
        │
        ▼
  Fetch 4 CSVs in parallel (PapaParse)
  ├── jakarta_housing_clean.csv  →  properties[]
  ├── price_history.csv          →  priceHistory{}
  ├── news_signals.csv           →  newsSignals{}
  └── articles.csv               →  articles[]
        │
        ▼
  Loading spinner until all complete
        │
        ▼
  Route to Dashboard (/)
```

### 2. Dashboard Page (`/`)

```
┌─────────────────────────────────────────────────┐
│  Header: Logo + App Title + Settings Icon       │
├─────────────────────────────────────────────────┤
│  KPI Bar (5 metrics)                            │
│  [Portfolio Size] [Total Value] [Avg Score]     │
│  [Avg Growth] [Loan Decisions Breakdown]        │
├─────────────────────────────────────────────────┤
│  Filter Bar                                     │
│  [Region ▼] [Price Min] [Price Max]             │
│  [Risk Level ▼] [Search...] [Reset]             │
├─────────────────────────────────────────────────┤
│  Property Cards (sorted by risk score desc)     │
│  ┌───────────────────────────────────────────┐  │
│  │ [Image] Risk:87 | Rp 4.5M | +6.2% | ...  │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │ [Image] Risk:52 | Rp 2.1M | +1.8% | ...  │  │
│  └───────────────────────────────────────────┘  │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

**Interactions:**
- Filter by region, price range, risk level, or free-text search
- KPI bar updates dynamically to reflect filtered dataset
- Click any card → navigate to `/property/:id`

### 3. Property Detail Page (`/property/:id`)

```
┌──────────────────────────────────────┬──────────────────┐
│                                      │  Property Title   │
│           Leaflet Map (65%)          │  Price: Rp X.X M  │
│                                      │  Location          │
│    [Property Marker]                 │  ──────────────── │
│    [Amenity Markers]                 │  Risk Score Gauge  │
│                                      │  [████████░░] 74   │
│    [Category Toggle Pills]           │  ──────────────── │
│                                      │  1yr Prediction    │
│                                      │  Specs & Details   │
│                                      │  Agent Info        │
├──────────────────────────────────────┴──────────────────┤
│  Tabs:                                                   │
│  [Property Details] [Analysis] [Loan] [Amenities] [News]│
├──────────────────────────────────────────────────────────┤
│  Tab Content:                                            │
│  • Property Details — Full specs, facilities, amenities  │
│  • Price Analysis — 36-mo chart + 12-mo forecast         │
│  • Loan Assessment — LTV, DSCR, decision, amortization   │
│  • Amenities — Filterable nearby places by category      │
│  • News & Sentiment — Regional articles + scores         │
└──────────────────────────────────────────────────────────┘
```

**Interactions:**
- Toggle amenity categories on the map
- Switch between detail tabs
- View full loan recommendation with reasoning
- Read regional news with sentiment indicators
- Back button returns to dashboard (preserving filters)

---

## Architecture

```
┌───────────────────────────────────────────────────────┐
│                   PRESENTATION                         │
│   DashboardPage  ·  PropertyDetailPage  ·  Components │
├───────────────────────────────────────────────────────┤
│                   STATE (React Context)                │
│   DataContext: properties, priceHistory, newsSignals,  │
│                articles — loaded once from CSVs        │
├───────────────────────────────────────────────────────┤
│                   BUSINESS LOGIC                       │
│   scoring.js        — risk scores, price prediction   │
│   loanAssessment.js — LTV, DSCR, loan decisioning    │
│   api.js            — Google Places amenity fetching  │
├───────────────────────────────────────────────────────┤
│                   DATA SOURCES                         │
│   Static CSVs (scraped + generated)                   │
│   Google Places API (optional, runtime)               │
│   OpenStreetMap tiles (Leaflet, runtime)              │
└───────────────────────────────────────────────────────┘
```

---

## Scoring Model

The risk score is a weighted composite of 6 factors:

| Factor             | Weight | Source                                   |
| ------------------ | ------ | ---------------------------------------- |
| Price Stability    | 25%    | Std deviation of monthly % changes       |
| Growth Trend       | 20%    | Annualized growth from price history     |
| News Sentiment     | 15%    | Weighted average regional sentiment      |
| Amenity Access     | 15%    | Nearby facilities count and diversity    |
| Property Quality   | 10%    | Condition, certificate type, furnishing  |
| Location           | 15%    | Region premium + district factors        |

**Risk Levels:**
- **Low** (≥70): Green — strong collateral
- **Medium** (40–69): Orange — additional review needed
- **High** (<40): Red — elevated lending risk

---

## Loan Decision Engine

The loan assessment runs 20+ rules combining:

- **Max LTV** — based on certificate type (SHM highest, Girik lowest) with risk penalty
- **Recommended Loan** — 55–100% of max LTV, scaled by risk profile
- **Tenor** — 3–10 years based on price tier and risk
- **DSCR** — Debt service coverage ratio (assumed rental yield)
- **Collateral Coverage** — Property value / loan amount

**Decisions:**
- **Recommend** — strong score, good collateral, favorable market
- **Due Diligence** — borderline metrics, needs manual review
- **Decline** — high risk, poor collateral, negative trends
