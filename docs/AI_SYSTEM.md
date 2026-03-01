# AI System — Current State vs. Production Vision

## Overview

The app presents itself as an "ML-powered" property risk assessment tool. In reality, the current implementation uses **deterministic heuristics and rule-based logic** — no machine learning models are trained or deployed. This document explains what the "AI" actually does today and what a real production implementation would look like.

---

## Part 1: What the "AI" Actually Does Today

### There Are No ML Models

Every "intelligent" feature in the app is implemented as **hardcoded formulas, weighted averages, and if/else rule trees** running entirely in the browser. Nothing is learned from data — all weights, thresholds, and parameters are manually tuned constants.

---

### 1. Risk Scoring — `scoring.js`

**What users see:** A 0–100 risk score per property labeled as "ML-powered."

**What actually happens:** A fixed weighted average of 6 sub-scores:

```
Risk Score = stability × 0.25
           + growth   × 0.20
           + sentiment × 0.15
           + amenities × 0.15
           + quality   × 0.10
           + location  × 0.15
```

Each sub-score is a simple formula:

| Sub-Score | Formula | Hardcoded? |
|-----------|---------|------------|
| **Stability** | `(1 - stdDev / 0.05) × 100` — penalizes volatile price histories | Yes — threshold 0.05 is arbitrary |
| **Growth** | `growthRate / 0.10 × 100` — maps annualized growth to 0-100 | Yes — assumes 10% growth = perfect |
| **Sentiment** | `(avgSentiment + 0.5) × 100` — shifts [-0.5, +0.5] to [0, 100] | Yes — linear mapping, no NLP |
| **Amenities** | `count / 20 × 100` — 20 amenities = perfect score | Yes — arbitrary cap |
| **Quality** | Adds points for SHM (+20), good condition (+15), furnished (+10) | Yes — manual point system |
| **Location** | Static lookup: Selatan=90, Pusat=80, Barat=70, Timur=60, Utara=50 | Yes — completely hardcoded |

**No training, no model, no feature engineering.** The weights (0.25, 0.20, etc.) were chosen manually.

---

### 2. Price Prediction — `scoring.js → predictPrice()`

**What users see:** "12-month ML price forecast" with a dashed future line on the chart.

**What actually happens:** A 3-line formula:

```javascript
adjustedRate = growthRate + (avg3MonthSentiment × 0.02)
predictedPrice = currentPrice × (1 + adjustedRate)
```

This is not a prediction — it's **linear extrapolation**. It takes the historical annualized growth rate, nudges it ±2% based on recent news sentiment, and projects forward one year. There is:

- No regression model
- No time-series analysis (no ARIMA, no Prophet, no LSTM)
- No feature selection or training
- No confidence intervals
- No seasonal decomposition

---

### 3. Loan Decision Engine — `loanAssessment.js → computeDecision()`

**What users see:** Automated lending decisions (Recommend / Due Diligence / Decline) with detailed reasoning.

**What actually happens:** A cascading if/else rule tree with ~20 hardcoded rules:

```
if ltvRatio > 0.95                          → DECLINE
if collateralCoverage < 1.05                → DECLINE
if riskScore < 20                           → DECLINE
if collateralCoverage >= 1.8 && score >= 55 → RECOMMEND
...etc (20+ rules)
```

Supporting calculations are standard finance formulas (not ML):
- **LTV** = loan / property value (with certificate-based caps: SHM=80%, HGB=70%)
- **Monthly payment** = standard amortization formula
- **DSCR** = estimated income / monthly payment
- **Interest rate** = base rate ± risk spread

The reasoning text is generated from templates, not from an LLM.

---

### 4. News Sentiment — `generate_mock_news.py`

**What users see:** ~700 news articles with NLP sentiment scores ranging from -1.0 to +1.0.

**What actually happens:** All articles are **synthetically generated** from hardcoded templates. The sentiment scores are `random.uniform(min, max)` within manually set ranges per template:

```python
# Example: a flood template always produces negative sentiment
("disaster", "Banjir Melanda...", "...", (-0.08, -0.02), [11,12,1,2,3])
```

There is no NLP, no sentiment analysis model, no text classification. The "sentiment" is a random number from a predefined range baked into the template.

---

### 5. Price History — `generate_mock_history.py`

**What users see:** 36 months of historical price data with visible market events.

**What actually happens:** Prices are **backward-generated** from the current listing price using:

```python
monthly_change = regional_growth_rate + market_event_shift + gaussian_noise
previous_price = current_price / (1 + monthly_change)
```

The "market events" (post-pandemic correction, election bump, MRT opening) are manually coded date-specific adjustments, not detected from data.

---

### 6. Amenity Scoring — `api.js`

**What users see:** Nearby amenity analysis affecting the risk score.

**What actually happens:** This is the one genuinely external data source. Google Places API is queried for 5 categories (education, healthcare, shopping, leisure, transport). Results are counted and the count is linearly mapped to a 0–100 score. No weighting by quality, distance decay, or walkability — just `min(count/20, 1) × 100`.

---

## Part 2: What a Real Production System Would Look Like

### Architecture Shift

```
CURRENT (Hackathon)                    PRODUCTION
────────────────────                   ────────────────────
Browser-only                           Client + Backend + ML Pipeline
Static CSV files                       Live database + API
Hardcoded formulas                     Trained ML models
Mock data generators                   Real data ingestion
No NLP                                 LLM / NLP sentiment pipeline
Manual rule tree                       ML-based credit scoring
```

---

### 1. Real Price Prediction Model

**Replace:** `predictPrice()` linear extrapolation

**With:** A trained time-series forecasting model:

| Approach | Description |
|----------|-------------|
| **Gradient Boosted Trees** (XGBoost/LightGBM) | Tabular features: location, size, age, condition, macro indicators, nearby transactions. Best for structured data. |
| **Prophet / NeuralProphet** | Time-series decomposition with trend, seasonality, and regressor support. Good for per-property or per-region forecasts. |
| **LSTM / Transformer** | Sequence models on price history + external signals. Higher accuracy but needs more data per property. |

**Training data needed:**
- Historical transaction prices (not listing prices) — at least 3–5 years
- Macro indicators: BI interest rates, inflation, GDP, USD/IDR exchange rate
- Neighborhood features: new development permits, infrastructure projects, population density
- Comparable sales (hedonic pricing model inputs)

**Output:** Price prediction with **confidence intervals** (e.g., "Rp 4.2B ± 0.3B at 80% confidence").

---

### 2. Real Risk Scoring Model

**Replace:** Manually weighted `computeRiskScore()` with 6 hardcoded weights

**With:** A supervised ML model trained on historical loan outcomes:

| Approach | Description |
|----------|-------------|
| **Logistic Regression / XGBoost** | Train on historical default data. Features: LTV, property type, location, price trend, borrower profile, macro conditions. Output: probability of default (PD). |
| **Ensemble Scoring** | Combine property-level risk (price volatility, liquidity) + borrower risk (credit history, income) + market risk (regional trends, policy changes). Each component uses a separate specialized model. |

**Training data needed:**
- Historical loan performance (default/no-default labels)
- Property characteristics at origination
- Borrower profiles (credit score, income, DTI)
- Market conditions at origination time

**Output:** Calibrated probability of default, not an arbitrary 0–100 score.

---

### 3. Real NLP Sentiment Pipeline

**Replace:** Mock articles with hardcoded sentiment ranges

**With:** A multi-stage NLP pipeline processing real news:

```
Real News Sources (RSS, APIs, web scraping)
        │
        ▼
┌──────────────────────────────────┐
│  Stage 1: Ingestion              │
│  - RSS feeds: Kompas, Detik,     │
│    Bisnis Indonesia, Jakarta Post│
│  - News APIs (GDELT, Event       │
│    Registry, Google News)        │
│  - Scheduled scraping            │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  Stage 2: NLP Processing         │
│  - Language detection (ID/EN)    │
│  - Named entity recognition      │
│    (locations, companies, govt)  │
│  - Topic classification          │
│  - Sentiment analysis            │
│    (fine-tuned Indonesian BERT   │
│     or LLM-based extraction)    │
│  - Relevance scoring to          │
│    property/region               │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  Stage 3: Signal Aggregation     │
│  - Per-region sentiment trends   │
│  - Event detection (flood,       │
│    infrastructure, policy)       │
│  - Anomaly detection (sudden     │
│    sentiment shifts)             │
│  - Decay-weighted aggregation    │
│    (recent news matters more)    │
└──────────────────────────────────┘
```

**Models:**
- **IndoBERT** (fine-tuned) for Indonesian-language sentiment classification
- **LLM (Qwen / GPT)** for article summarization and structured extraction (category, affected regions, impact magnitude)
- **Topic modeling** (BERTopic) for emerging theme detection

---

### 4. Real Loan Decision Engine

**Replace:** 20-rule if/else tree in `computeDecision()`

**With:** A hybrid ML + rules system:

```
┌─────────────────────────────────────────────────────────┐
│                  LOAN DECISION PIPELINE                   │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ ML Scoring  │  │ Rule Engine  │  │ LLM Reasoning  │  │
│  │             │  │              │  │                │  │
│  │ PD model    │  │ Regulatory   │  │ Generate       │  │
│  │ LGD model   │  │ compliance   │  │ human-readable │  │
│  │ EAD model   │  │ checks       │  │ decision       │  │
│  │ (trained on │  │ (LTV caps,   │  │ explanations   │  │
│  │  historical │  │  DSCR floors,│  │ using full     │  │
│  │  defaults)  │  │  blacklists) │  │ context        │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                   │            │
│         └────────┬───────┘                   │            │
│                  ▼                           │            │
│         Combined Risk Score                  │            │
│         + Decision Matrix ──────────────────►│            │
│                                              ▼            │
│                                    Final Decision +       │
│                                    Reasoning Report       │
└─────────────────────────────────────────────────────────┘
```

**Key models:**
- **PD (Probability of Default):** XGBoost on historical loan outcomes
- **LGD (Loss Given Default):** How much is lost if the borrower defaults — depends on property liquidity, location, condition
- **EAD (Exposure at Default):** Expected outstanding balance at time of default
- **Expected Loss = PD × LGD × EAD** — standard Basel II/III framework

**Regulatory rules remain hardcoded** (LTV caps per OJK regulation, minimum capital requirements, etc.) — these are non-negotiable compliance checks, not ML problems.

---

### 5. Real Data Infrastructure

**Replace:** Static CSVs loaded in browser

**With:**

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Database** | PostgreSQL + TimescaleDB | Property listings, transaction history, time-series prices |
| **Cache** | Redis | API response caching, session state |
| **ML Serving** | FastAPI + MLflow or BentoML | Model inference endpoints |
| **Pipeline** | Airflow / Dagster | Scheduled scraping, model retraining, signal aggregation |
| **Feature Store** | Feast or custom | Precomputed features for real-time scoring |
| **Object Storage** | S3 / GCS | Raw scraped data, model artifacts, training datasets |

**API endpoints would include:**
```
POST /api/v1/property/{id}/risk-score     → ML risk assessment
POST /api/v1/property/{id}/price-forecast → Time-series prediction
POST /api/v1/loan/assess                  → Full loan evaluation
GET  /api/v1/signals/{region}             → Live sentiment signals
GET  /api/v1/news/latest                  → Real-time news feed
```

---

### 6. Real Amenity Intelligence

**Replace:** Simple count-based scoring (`count / 20 × 100`)

**With:** A weighted amenity score incorporating:

- **Distance decay** — closer amenities matter more (inverse-distance weighting)
- **Category importance** — schools and transit weighted higher than leisure for families
- **Quality signals** — Google rating, review count, operating status
- **Walkability / accessibility** — walking time via routing API, not just Haversine distance
- **Completeness** — bonus for having all 5 categories covered nearby
- **Competitive density** — multiple hospitals nearby = more resilient than exactly one

---

## Part 3: Summary Comparison

| Feature | Current (Hackathon) | Production |
|---------|-------------------|------------|
| **Risk Score** | Hardcoded 6-weight formula | Supervised ML (PD model) trained on default data |
| **Price Prediction** | Linear extrapolation + 2% sentiment nudge | XGBoost / Prophet / LSTM with macro features + confidence intervals |
| **Loan Decision** | 20-rule if/else cascade | PD × LGD × EAD + regulatory rule engine + LLM reasoning |
| **News Sentiment** | Fake articles with `random.uniform()` | Real news ingestion + IndoBERT/LLM sentiment extraction |
| **Price History** | Backward-generated from listing price | Real transaction records from notary/BPN databases |
| **Amenity Score** | `count / 20` | Distance-weighted, quality-adjusted, category-balanced |
| **Data** | Static CSVs, loaded once | PostgreSQL + TimescaleDB, live API, scheduled pipelines |
| **Compute** | 100% client-side JavaScript | Backend ML inference + client-side visualization |
| **Retraining** | N/A — no models to retrain | Scheduled retraining with drift detection |
| **Explainability** | Template strings | SHAP values + LLM-generated natural language explanations |

---

## Part 4: Migration Path (Hackathon → Production)

### Phase 1 — Backend API + Database
- Move property data from CSV to PostgreSQL
- Build FastAPI backend with the same scoring logic (port JS → Python)
- Frontend fetches from API instead of loading CSVs
- **No ML yet** — same formulas, but now server-side and auditable

### Phase 2 — Real Data Ingestion
- Activate `periodic_scraper.py` for monthly price tracking
- Build news scraping pipeline (RSS + web) with scheduled Airflow jobs
- Integrate real NLP (IndoBERT or LLM API) for sentiment extraction
- Replace mock generators with real data

### Phase 3 — ML Models
- Train price prediction model on accumulated transaction history
- Train PD model on historical loan performance data (requires bank partnership)
- Deploy models via MLflow / BentoML with A/B testing framework
- Add SHAP-based explainability for every prediction

### Phase 4 — Production Hardening
- Model monitoring and drift detection
- Automated retraining pipeline
- Regulatory compliance audit trail (OJK requirements)
- Role-based access control for credit analysts
- Integration with bank's core lending system
