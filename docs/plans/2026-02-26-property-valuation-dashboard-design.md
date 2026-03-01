# Property Valuation ML Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Jakarta Housing Map into a bank-facing Property Valuation Dashboard with risk scoring, growth prediction, and a dashboard-first UX.

**Architecture:** React Router splits the app into two pages — a dashboard landing page with property cards sorted by ML risk score, and a detail page with map + prediction chart. All CSV data is loaded once in App.jsx and shared via React Context. Risk scores are computed client-side via a weighted formula in `scoring.js`.

**Tech Stack:** React 19, Vite 7, react-router-dom (new), Leaflet, Recharts, PapaParse. Light SaaS theme.

---

### Task 1: Install react-router-dom

**Files:**
- Modify: `viz/package.json`

**Step 1: Install dependency**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm install react-router-dom`

**Step 2: Verify install succeeded**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm ls react-router-dom`

Expected: Shows react-router-dom version in tree.

**Step 3: Commit**

```bash
cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton
git add viz/package.json viz/package-lock.json
git commit -m "chore: add react-router-dom dependency"
```

---

### Task 2: Create scoring utility (`scoring.js`)

**Files:**
- Create: `viz/src/utils/scoring.js`

**Step 1: Create the utils directory and scoring.js**

```js
// viz/src/utils/scoring.js

const REGION_QUALITY = {
  "Jakarta Selatan": 90,
  "Jakarta Pusat": 80,
  "Jakarta Barat": 70,
  "Jakarta Timur": 60,
  "Jakarta Utara": 50,
};

/**
 * Compute annualized growth rate from price history array.
 * Returns fractional rate (e.g., 0.06 for 6%).
 */
export function computeGrowthRate(priceHistory) {
  if (!priceHistory || priceHistory.length < 2) return 0;
  const first = priceHistory[0].price;
  const last = priceHistory[priceHistory.length - 1].price;
  const months = priceHistory.length - 1;
  if (first <= 0 || months <= 0) return 0;
  // Annualized: (last/first)^(12/months) - 1
  return Math.pow(last / first, 12 / months) - 1;
}

/**
 * Compute price trend stability (0-100).
 * Lower monthly std deviation = higher score.
 */
function trendStabilityScore(priceHistory) {
  if (!priceHistory || priceHistory.length < 3) return 50;
  const changes = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const prev = priceHistory[i - 1].price;
    if (prev > 0) {
      changes.push((priceHistory[i].price - prev) / prev);
    }
  }
  if (changes.length === 0) return 50;
  const mean = changes.reduce((s, v) => s + v, 0) / changes.length;
  const variance = changes.reduce((s, v) => s + (v - mean) ** 2, 0) / changes.length;
  const stdDev = Math.sqrt(variance);
  // Map stdDev 0->100, 0.05->0 (5% monthly volatility = max risk)
  return Math.max(0, Math.min(100, (1 - stdDev / 0.05) * 100));
}

/**
 * Score the growth rate (0-100).
 * 10% annual or higher = 100. Negative = 0.
 */
function growthScore(growthRate) {
  if (growthRate <= 0) return Math.max(0, 50 + growthRate * 500); // slight penalty
  return Math.min(100, (growthRate / 0.10) * 100);
}

/**
 * Score news sentiment for a region (0-100).
 * Uses the average weighted sentiment from news_signals.
 */
function sentimentScore(newsSignals) {
  if (!newsSignals || newsSignals.length === 0) return 50;
  const recent = newsSignals.slice(-6); // last 6 months
  const avg = recent.reduce((s, n) => s + n.weighted_avg_sentiment, 0) / recent.length;
  // Map -0.5..+0.5 to 0..100
  return Math.max(0, Math.min(100, (avg + 0.5) * 100));
}

/**
 * Score amenities density (0-100).
 * 20+ amenities = 100.
 */
function amenitiesScore(amenityCount) {
  return Math.min(100, (amenityCount / 20) * 100);
}

/**
 * Score property data completeness and quality (0-100).
 */
function propertyQualityScore(property) {
  let score = 50; // base
  if (property.certificate_type === "SHM") score += 20;
  else if (property.certificate_type === "HGB") score += 10;
  if (property.condition === "Bagus" || property.condition === "Baru") score += 15;
  else if (property.condition === "Sudah Renovasi") score += 10;
  if (property.furnished_status === "Furnished") score += 10;
  else if (property.furnished_status === "Semi Furnished") score += 5;
  // Penalize missing data
  const missing = ["bedrooms", "bathrooms", "land_size_sqm", "building_size_sqm"]
    .filter(f => !property[f]).length;
  score -= missing * 5;
  return Math.max(0, Math.min(100, score));
}

/**
 * Score location quality based on region (0-100).
 */
function locationScore(region) {
  return REGION_QUALITY[region] || 50;
}

/**
 * Compute composite risk score (0-100). Higher = safer.
 * Weights: stability 25%, growth 20%, sentiment 15%, amenities 15%, property 10%, location 15%.
 */
export function computeRiskScore(property, priceHistory, newsSignals, amenityCount) {
  const stability = trendStabilityScore(priceHistory);
  const growth = growthScore(computeGrowthRate(priceHistory));
  const sentiment = sentimentScore(newsSignals);
  const amenities = amenitiesScore(amenityCount || 0);
  const quality = propertyQualityScore(property);
  const location = locationScore(property.region);

  const composite = Math.round(
    stability * 0.25 +
    growth * 0.20 +
    sentiment * 0.15 +
    amenities * 0.15 +
    quality * 0.10 +
    location * 0.15
  );

  return Math.max(0, Math.min(100, composite));
}

/**
 * Get risk level label and color from score.
 */
export function getRiskLevel(score) {
  if (score >= 70) return { label: "LOW RISK", color: "#10b981" };
  if (score >= 40) return { label: "MEDIUM RISK", color: "#f59e0b" };
  return { label: "HIGH RISK", color: "#ef4444" };
}

/**
 * Predict price 12 months from now.
 * Uses growth rate + sentiment adjustment.
 */
export function predictPrice(currentPrice, growthRate, newsSignals) {
  if (!currentPrice || currentPrice <= 0) return { predicted: 0, growthPct: 0 };
  let adjustedRate = growthRate;
  // Sentiment adjustment: ±1% based on recent trend
  if (newsSignals && newsSignals.length >= 3) {
    const recent = newsSignals.slice(-3);
    const avgSentiment = recent.reduce((s, n) => s + n.weighted_avg_sentiment, 0) / recent.length;
    adjustedRate += avgSentiment * 0.02; // scale sentiment to ±1%
  }
  const predicted = Math.round(currentPrice * (1 + adjustedRate));
  return {
    predicted,
    growthPct: adjustedRate * 100,
  };
}

/**
 * Format price for display.
 */
export function formatPrice(price) {
  if (!price) return "—";
  if (price >= 1e9) return `Rp ${(price / 1e9).toFixed(2)} Miliar`;
  if (price >= 1e6) return `Rp ${(price / 1e6).toFixed(0)} Juta`;
  return `Rp ${Number(price).toLocaleString()}`;
}

/**
 * Format price short (for cards).
 */
export function formatPriceShort(price) {
  if (!price) return "N/A";
  if (price >= 1e9) return `Rp ${(price / 1e9).toFixed(1)}B`;
  if (price >= 1e6) return `Rp ${(price / 1e6).toFixed(0)}M`;
  return `Rp ${price.toLocaleString()}`;
}
```

**Step 2: Verify build still works**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm run build`

Expected: Build succeeds (scoring.js is not yet imported, but should have no syntax errors if tree-shaken).

**Step 3: Commit**

```bash
cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton
git add viz/src/utils/scoring.js
git commit -m "feat: add risk scoring and price prediction utility"
```

---

### Task 3: Create DataContext

**Files:**
- Create: `viz/src/DataContext.jsx`

**Step 1: Create DataContext.jsx**

```jsx
// viz/src/DataContext.jsx
import { createContext, useContext, useState, useEffect } from "react";
import Papa from "papaparse";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [properties, setProperties] = useState([]);
  const [priceHistory, setPriceHistory] = useState({});
  const [newsSignals, setNewsSignals] = useState({});
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let completed = 0;
    const total = 4;
    const checkDone = () => { if (++completed >= total) setLoading(false); };

    Papa.parse("/jakarta_housing_clean.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsed = result.data
          .filter((r) => r.latitude && r.longitude)
          .map((r) => ({
            ...r,
            latitude: parseFloat(r.latitude),
            longitude: parseFloat(r.longitude),
            price: r.price ? parseFloat(r.price) : null,
          }));
        setProperties(parsed);
        checkDone();
      },
    });

    Papa.parse("/price_history.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const historyObj = {};
        result.data.forEach((row) => {
          if (!row.property_id || !row.date || !row.price) return;
          if (!historyObj[row.property_id]) historyObj[row.property_id] = [];
          historyObj[row.property_id].push({
            date: row.date,
            price: parseFloat(row.price),
          });
        });
        Object.values(historyObj).forEach((entries) =>
          entries.sort((a, b) => a.date.localeCompare(b.date))
        );
        setPriceHistory(historyObj);
        checkDone();
      },
    });

    Papa.parse("/news_signals.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const byRegion = {};
        result.data.forEach((row) => {
          if (row.scope !== "combined" || !row.region_id) return;
          if (!byRegion[row.region_id]) byRegion[row.region_id] = [];
          byRegion[row.region_id].push({
            date: row.period_start,
            signal_strength: parseFloat(row.signal_strength) || 0,
            avg_sentiment: parseFloat(row.avg_sentiment) || 0,
            weighted_avg_sentiment: parseFloat(row.weighted_avg_sentiment) || 0,
            article_count: parseInt(row.article_count) || 0,
            dominant_category: row.dominant_category || "",
          });
        });
        setNewsSignals(byRegion);
        checkDone();
      },
    });

    Papa.parse("/articles.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setArticles(result.data.filter((r) => r.article_id));
        checkDone();
      },
    });
  }, []);

  return (
    <DataContext.Provider value={{ properties, priceHistory, newsSignals, articles, loading }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
```

**Step 2: Verify build**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm run build`

**Step 3: Commit**

```bash
cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton
git add viz/src/DataContext.jsx
git commit -m "feat: add DataContext for shared CSV data loading"
```

---

### Task 4: Create Dashboard page components

**Files:**
- Create: `viz/src/components/KpiBar.jsx`
- Create: `viz/src/components/PropertyCard.jsx`
- Create: `viz/src/components/FilterBar.jsx`
- Create: `viz/src/components/RiskScoreGauge.jsx`
- Create: `viz/src/pages/DashboardPage.jsx`

**Step 1: Create directories**

Run: `mkdir -p /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz/src/components /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz/src/pages`

**Step 2: Create KpiBar.jsx**

```jsx
// viz/src/components/KpiBar.jsx
import { formatPriceShort } from "../utils/scoring";

function KpiBar({ properties }) {
  const total = properties.length;
  const totalValue = properties.reduce((sum, p) => sum + (p._riskData?.currentPrice || 0), 0);
  const avgScore = total > 0
    ? Math.round(properties.reduce((sum, p) => sum + (p._riskData?.score || 0), 0) / total)
    : 0;
  const avgGrowth = total > 0
    ? (properties.reduce((sum, p) => sum + (p._riskData?.growthPct || 0), 0) / total).toFixed(1)
    : "0.0";
  const highRisk = properties.filter((p) => (p._riskData?.score || 0) < 40).length;
  const highRiskPct = total > 0 ? ((highRisk / total) * 100).toFixed(0) : "0";

  const cards = [
    { label: "Total Properties", value: total, sub: "In Portfolio" },
    { label: "Portfolio Value", value: formatPriceShort(totalValue), sub: "Total Valuation" },
    { label: "Avg Risk Score", value: `${avgScore}/100`, sub: avgScore >= 70 ? "Low Risk" : avgScore >= 40 ? "Medium" : "High Risk" },
    { label: "Avg Growth", value: `+${avgGrowth}%/yr`, sub: "Predicted 1yr" },
    { label: "High Risk", value: `${highRisk} (${highRiskPct}%)`, sub: "Needs Attention", alert: highRisk > 0 },
  ];

  return (
    <div className="kpi-bar">
      {cards.map((card) => (
        <div key={card.label} className={`kpi-card${card.alert ? " kpi-alert" : ""}`}>
          <div className="kpi-value">{card.value}</div>
          <div className="kpi-label">{card.label}</div>
          <div className="kpi-sub">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}

export default KpiBar;
```

**Step 3: Create FilterBar.jsx**

```jsx
// viz/src/components/FilterBar.jsx

function FilterBar({ filter, onFilterChange, regions, propertyCount }) {
  const update = (key, value) => onFilterChange({ ...filter, [key]: value });

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <select value={filter.region} onChange={(e) => update("region", e.target.value)}>
          {regions.map((r) => (
            <option key={r} value={r}>{r === "All" ? "All Regions" : r}</option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Min price (Rp)"
          value={filter.minPrice}
          onChange={(e) => update("minPrice", e.target.value)}
        />
        <input
          type="number"
          placeholder="Max price (Rp)"
          value={filter.maxPrice}
          onChange={(e) => update("maxPrice", e.target.value)}
        />

        <select value={filter.riskLevel} onChange={(e) => update("riskLevel", e.target.value)}>
          <option value="All">All Risk Levels</option>
          <option value="low">Low Risk (70+)</option>
          <option value="medium">Medium Risk (40-69)</option>
          <option value="high">High Risk (&lt;40)</option>
        </select>

        <input
          type="text"
          placeholder="Search address, district..."
          value={filter.search}
          onChange={(e) => update("search", e.target.value)}
          className="search-input"
        />
      </div>

      <span className="filter-count">{propertyCount} properties</span>
    </div>
  );
}

export default FilterBar;
```

**Step 4: Create PropertyCard.jsx**

```jsx
// viz/src/components/PropertyCard.jsx
import { useNavigate } from "react-router-dom";
import { getRiskLevel, formatPrice } from "../utils/scoring";

function PropertyCard({ property, apiKey }) {
  const navigate = useNavigate();
  const risk = property._riskData || {};
  const riskLevel = getRiskLevel(risk.score || 0);

  const streetViewUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=240x240&location=${property.latitude},${property.longitude}&fov=90&heading=0&pitch=0&key=${apiKey}`
    : null;

  const sentimentValue = risk.sentiment ?? 0;
  const sentimentWidth = Math.min(100, Math.max(0, (sentimentValue + 0.5) * 100));

  return (
    <div
      className="property-card"
      onClick={() => navigate(`/property/${property.property_id}`)}
    >
      <div className="card-image">
        {streetViewUrl ? (
          <img
            src={streetViewUrl}
            alt="Street View"
            onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
          />
        ) : null}
        <div className="card-image-placeholder" style={streetViewUrl ? { display: "none" } : {}}>
          <span>No Image</span>
        </div>
      </div>

      <div className="card-body">
        <div className="card-top-row">
          <span className="risk-badge" style={{ background: riskLevel.color }}>
            {riskLevel.label} ({risk.score || 0})
          </span>
          <span className="card-price">{formatPrice(property.price)}</span>
        </div>

        <div className="card-growth">
          {(risk.growthPct || 0) >= 0 ? "▲" : "▼"} {risk.growthPct >= 0 ? "+" : ""}{(risk.growthPct || 0).toFixed(1)}% predicted 1yr
        </div>

        <div className="card-location">
          {property.district ? `${property.district}, ` : ""}{property.region || "Unknown"}
        </div>

        <div className="card-specs">
          {property.bedrooms ? `${property.bedrooms} BR` : ""}
          {property.bathrooms ? ` · ${property.bathrooms} BA` : ""}
          {property.land_size_sqm ? ` · ${property.land_size_sqm}m²` : ""}
          {property.building_size_sqm ? ` · ${property.building_size_sqm}m² bld` : ""}
          {property.certificate_type ? ` · ${property.certificate_type}` : ""}
        </div>

        <div className="card-bottom-row">
          <div className="card-sentiment">
            <span className="sentiment-label">Sentiment:</span>
            <div className="sentiment-bar-track">
              <div
                className="sentiment-bar-fill"
                style={{
                  width: `${sentimentWidth}%`,
                  background: sentimentValue >= 0 ? "#10b981" : "#ef4444",
                }}
              />
            </div>
            <span className="sentiment-value">
              {sentimentValue >= 0 ? "+" : ""}{sentimentValue.toFixed(2)}
            </span>
          </div>
          <button className="card-detail-btn">View Details →</button>
        </div>
      </div>
    </div>
  );
}

export default PropertyCard;
```

**Step 5: Create RiskScoreGauge.jsx**

```jsx
// viz/src/components/RiskScoreGauge.jsx
import { getRiskLevel } from "../utils/scoring";

function RiskScoreGauge({ score }) {
  const { label, color } = getRiskLevel(score);
  const pct = Math.max(0, Math.min(100, score));

  return (
    <div className="risk-gauge">
      <div className="risk-gauge-header">
        <span className="risk-gauge-label" style={{ color }}>{label}</span>
        <span className="risk-gauge-score">{score}<span className="risk-gauge-max">/100</span></span>
      </div>
      <div className="risk-gauge-track">
        <div
          className="risk-gauge-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="risk-gauge-labels">
        <span>High Risk</span>
        <span>Low Risk</span>
      </div>
    </div>
  );
}

export default RiskScoreGauge;
```

**Step 6: Create DashboardPage.jsx**

```jsx
// viz/src/pages/DashboardPage.jsx
import { useState, useMemo } from "react";
import { useData } from "../DataContext";
import { computeRiskScore, computeGrowthRate, predictPrice } from "../utils/scoring";
import KpiBar from "../components/KpiBar";
import FilterBar from "../components/FilterBar";
import PropertyCard from "../components/PropertyCard";

function DashboardPage({ apiKey, onOpenSettings }) {
  const { properties, priceHistory, newsSignals } = useData();

  const [filter, setFilter] = useState({
    region: "All",
    minPrice: "",
    maxPrice: "",
    riskLevel: "All",
    search: "",
  });

  // Enrich properties with risk data
  const enriched = useMemo(() => {
    return properties.map((p) => {
      const history = priceHistory[p.property_id] || [];
      const signals = newsSignals[p.region] || [];
      const growthRate = computeGrowthRate(history);
      const score = computeRiskScore(p, history, signals, 0);
      const prediction = predictPrice(p.price, growthRate, signals);
      const recentSignals = signals.slice(-6);
      const avgSentiment = recentSignals.length > 0
        ? recentSignals.reduce((s, n) => s + n.weighted_avg_sentiment, 0) / recentSignals.length
        : 0;

      return {
        ...p,
        _riskData: {
          score,
          growthRate,
          growthPct: prediction.growthPct,
          predictedPrice: prediction.predicted,
          currentPrice: p.price || 0,
          sentiment: avgSentiment,
        },
      };
    }).sort((a, b) => (b._riskData.score || 0) - (a._riskData.score || 0));
  }, [properties, priceHistory, newsSignals]);

  const regions = useMemo(
    () => ["All", ...new Set(properties.map((d) => d.region).filter(Boolean))],
    [properties]
  );

  const filtered = useMemo(() => {
    return enriched.filter((d) => {
      if (filter.region !== "All" && d.region !== filter.region) return false;
      if (filter.minPrice && d.price < parseFloat(filter.minPrice)) return false;
      if (filter.maxPrice && d.price > parseFloat(filter.maxPrice)) return false;
      if (filter.riskLevel !== "All") {
        const score = d._riskData?.score || 0;
        if (filter.riskLevel === "low" && score < 70) return false;
        if (filter.riskLevel === "medium" && (score < 40 || score >= 70)) return false;
        if (filter.riskLevel === "high" && score >= 40) return false;
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        const searchable = `${d.full_address || ""} ${d.district || ""} ${d.region || ""} ${d.title || ""}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, filter]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <h1>Property Valuation Dashboard</h1>
          <p className="dashboard-subtitle">ML-Powered Loan Risk Assessment</p>
        </div>
        <button className="settings-btn" onClick={onOpenSettings} title="API Key Settings">
          ⚙
        </button>
      </header>

      <KpiBar properties={filtered} />

      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        regions={regions}
        propertyCount={filtered.length}
      />

      <div className="card-list">
        {filtered.map((property) => (
          <PropertyCard
            key={property.property_id}
            property={property}
            apiKey={apiKey}
          />
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">No properties match your filters.</div>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;
```

**Step 7: Verify build**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm run build`

**Step 8: Commit**

```bash
cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton
git add viz/src/components/ viz/src/pages/DashboardPage.jsx
git commit -m "feat: add dashboard page with KPI bar, filters, and property cards"
```

---

### Task 5: Create PredictionChart component

**Files:**
- Create: `viz/src/components/PredictionChart.jsx`

This is an enhanced version of the existing `PriceChart.jsx` that adds a predicted future price dashed line and a "today" marker.

**Step 1: Create PredictionChart.jsx**

```jsx
// viz/src/components/PredictionChart.jsx
import {
  ResponsiveContainer, ComposedChart, Area, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import { computeGrowthRate } from "../utils/scoring";

function formatPriceBillions(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  return value.toLocaleString();
}

function formatTooltipPrice(value) {
  if (value >= 1e9) return `Rp ${(value / 1e9).toFixed(2)} Miliar`;
  if (value >= 1e6) return `Rp ${(value / 1e6).toFixed(0)} Juta`;
  return `Rp ${value.toLocaleString()}`;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

const CATEGORY_LABELS = {
  infrastructure: "Infrastructure", policy: "Policy", market: "Market",
  disaster: "Disaster", development: "Development", economy: "Economy", environment: "Environment",
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const isForecast = data._forecast;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">
        {formatDateLabel(data.date)} {isForecast ? "(Forecast)" : ""}
      </div>
      {data.price != null && (
        <div className="chart-tooltip-price">{formatTooltipPrice(data.price)}</div>
      )}
      {data.predictedPrice != null && isForecast && (
        <div className="chart-tooltip-predicted">Predicted: {formatTooltipPrice(data.predictedPrice)}</div>
      )}
      {data.sentiment != null && (
        <>
          <div className="chart-tooltip-divider" />
          <div className={`chart-tooltip-sentiment ${data.sentiment >= 0 ? "positive" : "negative"}`}>
            Sentiment: {data.sentiment >= 0 ? "+" : ""}{data.sentiment.toFixed(3)}
          </div>
          {data.article_count > 0 && (
            <div className="chart-tooltip-meta">
              {data.article_count} articles · {CATEGORY_LABELS[data.dominant_category] || data.dominant_category}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PredictionChart({ priceHistory, sentimentData, predictedGrowthPct }) {
  if (!priceHistory || priceHistory.length === 0) return null;

  // Merge price and sentiment
  const sentimentMap = {};
  if (sentimentData) {
    sentimentData.forEach((s) => { sentimentMap[s.date] = s; });
  }

  const historicalData = priceHistory.map((row) => {
    const signal = sentimentMap[row.date];
    return {
      date: row.date,
      price: row.price,
      predictedPrice: null,
      sentiment: signal?.weighted_avg_sentiment ?? null,
      article_count: signal?.article_count ?? 0,
      dominant_category: signal?.dominant_category ?? "",
      _forecast: false,
    };
  });

  // Generate 12-month forecast
  const lastEntry = historicalData[historicalData.length - 1];
  const monthlyGrowth = (predictedGrowthPct || computeGrowthRate(priceHistory) * 100) / 12 / 100;
  const forecastData = [];
  const lastDate = new Date(lastEntry.date);

  for (let i = 1; i <= 12; i++) {
    const d = new Date(lastDate);
    d.setMonth(d.getMonth() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const predictedPrice = Math.round(lastEntry.price * Math.pow(1 + monthlyGrowth, i));
    forecastData.push({
      date: dateStr,
      price: null,
      predictedPrice,
      sentiment: null,
      article_count: 0,
      dominant_category: "",
      _forecast: true,
    });
  }

  // Bridge: last historical point also gets predictedPrice for continuity
  const bridged = [...historicalData];
  bridged[bridged.length - 1] = {
    ...bridged[bridged.length - 1],
    predictedPrice: bridged[bridged.length - 1].price,
  };

  const chartData = [...bridged, ...forecastData];

  const ticks = chartData.filter((_, i) => i % 6 === 0).map((d) => d.date);
  const allPrices = chartData.map((d) => d.price || d.predictedPrice).filter(Boolean);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const padding = (maxPrice - minPrice) * 0.1;
  const hasSentiment = historicalData.some((d) => d.sentiment !== null);
  const todayDate = lastEntry.date;

  return (
    <div className="prediction-chart-container">
      <div className="prediction-chart-title">
        Price History & ML Prediction (3yr + 1yr Forecast)
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="priceGradientNew" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date" ticks={ticks} tickFormatter={formatDateLabel}
            tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false}
          />
          <YAxis
            yAxisId="price" domain={[minPrice - padding, maxPrice + padding]}
            tickFormatter={formatPriceBillions}
            tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={55}
          />
          {hasSentiment && (
            <YAxis
              yAxisId="sentiment" orientation="right" domain={[-0.6, 0.6]}
              tick={{ fontSize: 9, fill: "#cbd5e1" }} axisLine={false} tickLine={false} width={30}
              tickFormatter={(v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1))}
            />
          )}
          <Tooltip content={<CustomTooltip />} />

          <ReferenceLine
            x={todayDate} yAxisId="price" stroke="#94a3b8"
            strokeDasharray="4 4" label={{ value: "Today", position: "top", fill: "#94a3b8", fontSize: 10 }}
          />

          {hasSentiment && (
            <Bar yAxisId="sentiment" dataKey="sentiment" barSize={6} opacity={0.25}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.sentiment >= 0 ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          )}

          <Area
            yAxisId="price" type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2}
            fill="url(#priceGradientNew)" dot={false}
            activeDot={{ r: 4, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }}
          />

          <Line
            yAxisId="price" type="monotone" dataKey="predictedPrice" stroke="#3b82f6"
            strokeWidth={2} strokeDasharray="6 4" dot={false}
            activeDot={{ r: 4, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="chart-legend-line" style={{ background: "#3b82f6" }} /> Historical Price
        </span>
        <span className="chart-legend-item">
          <span className="chart-legend-line dashed" style={{ background: "#3b82f6" }} /> ML Prediction
        </span>
        {hasSentiment && (
          <>
            <span className="chart-legend-item">
              <span className="chart-legend-bar positive" /> Positive News
            </span>
            <span className="chart-legend-item">
              <span className="chart-legend-bar negative" /> Negative News
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default PredictionChart;
```

**Step 2: Verify build**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm run build`

**Step 3: Commit**

```bash
cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton
git add viz/src/components/PredictionChart.jsx
git commit -m "feat: add prediction chart with 12-month forecast and sentiment overlay"
```

---

### Task 6: Create PropertyDetailPage

**Files:**
- Create: `viz/src/pages/PropertyDetailPage.jsx`

This page combines the Map, a detail sidebar, PredictionChart, and NewsFeed.

**Step 1: Create PropertyDetailPage.jsx**

```jsx
// viz/src/pages/PropertyDetailPage.jsx
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useData } from "../DataContext";
import { computeRiskScore, computeGrowthRate, predictPrice, formatPrice } from "../utils/scoring";
import { AMENITY_CATEGORIES, fetchNearbyAmenities, formatDistance } from "../api";
import Map from "../Map";
import RiskScoreGauge from "../components/RiskScoreGauge";
import PredictionChart from "../components/PredictionChart";
import NewsFeed from "../NewsFeed";

function PropertyDetailPage({ apiKey, onOpenSettings }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { properties, priceHistory, newsSignals, articles } = useData();

  const [amenities, setAmenities] = useState([]);
  const [amenitiesLoading, setAmenitiesLoading] = useState(false);
  const [enabledCategories, setEnabledCategories] = useState(() =>
    Object.fromEntries(AMENITY_CATEGORIES.map((c) => [c.id, true]))
  );

  const property = useMemo(
    () => properties.find((p) => p.property_id === id),
    [properties, id]
  );

  const history = useMemo(
    () => (property ? priceHistory[property.property_id] || [] : []),
    [property, priceHistory]
  );

  const signals = useMemo(
    () => (property ? newsSignals[property.region] || [] : []),
    [property, newsSignals]
  );

  const riskData = useMemo(() => {
    if (!property) return null;
    const growthRate = computeGrowthRate(history);
    const score = computeRiskScore(property, history, signals, amenities.length);
    const prediction = predictPrice(property.price, growthRate, signals);
    return { score, growthRate, ...prediction };
  }, [property, history, signals, amenities]);

  // Fetch amenities on mount
  useEffect(() => {
    if (!property || !apiKey) return;
    setAmenitiesLoading(true);
    fetchNearbyAmenities(property.latitude, property.longitude, apiKey)
      .then(setAmenities)
      .catch((err) => console.error("Failed to fetch amenities:", err))
      .finally(() => setAmenitiesLoading(false));
  }, [property, apiKey]);

  const filteredAmenities = useMemo(
    () => amenities.filter((a) => enabledCategories[a.category]),
    [amenities, enabledCategories]
  );

  const toggleCategory = (catId) => {
    setEnabledCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  if (!property) {
    return (
      <div className="detail-not-found">
        <h2>Property not found</h2>
        <button onClick={() => navigate("/")}>← Back to Dashboard</button>
      </div>
    );
  }

  const p = property;
  const facilities = p.facilities
    ? p.facilities.split(",").map((f) => f.trim()).filter(Boolean)
    : [];

  const streetViewUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${p.latitude},${p.longitude}&fov=90&heading=0&pitch=0&key=${apiKey}`
    : null;

  return (
    <div className="detail-page">
      <header className="detail-header">
        <button className="back-to-dashboard" onClick={() => navigate("/")}>
          ← Back to Dashboard
        </button>
        <h1>Property Valuation Detail</h1>
        <button className="settings-btn" onClick={onOpenSettings} title="API Key Settings">
          ⚙
        </button>
      </header>

      <div className="detail-top">
        {/* Map section - 65% */}
        <div className="detail-map-section">
          <Map
            data={[property]}
            selected={property}
            viewMode="detail"
            amenities={filteredAmenities}
            amenitiesLoading={amenitiesLoading}
            onSelect={() => {}}
            onBack={() => navigate("/")}
            hideBackBtn
          />
        </div>

        {/* Sidebar section - 35% */}
        <div className="detail-sidebar">
          <div className="detail-sidebar-scroll">
            {streetViewUrl && (
              <img
                src={streetViewUrl}
                alt="Street View"
                className="detail-street-view"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}

            <div className="detail-sidebar-body">
              <div className="detail-property-title">{p.title || "Untitled Property"}</div>
              <div className="detail-property-price">{formatPrice(p.price)}</div>
              <div className="detail-property-location">
                {p.district ? `${p.district}, ` : ""}{p.region}
              </div>

              {riskData && <RiskScoreGauge score={riskData.score} />}

              {riskData && (
                <div className="detail-prediction">
                  <span className={`prediction-arrow ${riskData.growthPct >= 0 ? "up" : "down"}`}>
                    {riskData.growthPct >= 0 ? "▲" : "▼"}
                  </span>
                  <span>
                    {riskData.growthPct >= 0 ? "+" : ""}{riskData.growthPct.toFixed(1)}% predicted 1yr
                  </span>
                  <div className="prediction-values">
                    Current: {formatPrice(p.price)} → {formatPrice(riskData.predicted)}
                  </div>
                </div>
              )}

              {p.url && (
                <a className="property-link" href={p.url} target="_blank" rel="noopener noreferrer">
                  View on Rumah123 →
                </a>
              )}

              <div className="info-section">
                <h3>Property Details</h3>
                <div className="info-grid">
                  <InfoItem label="Bedrooms" value={p.bedrooms} />
                  <InfoItem label="Bathrooms" value={p.bathrooms} />
                  <InfoItem label="Land Size" value={p.land_size_sqm ? `${p.land_size_sqm} m²` : null} />
                  <InfoItem label="Building" value={p.building_size_sqm ? `${p.building_size_sqm} m²` : null} />
                  <InfoItem label="Certificate" value={p.certificate_type} />
                  <InfoItem label="Condition" value={p.condition} />
                  <InfoItem label="Furnished" value={p.furnished_status} />
                  <InfoItem label="Electricity" value={p.electricity_watt ? `${p.electricity_watt} W` : null} />
                  <InfoItem label="Floors" value={p.floors} />
                  <InfoItem label="Type" value={p.property_type} />
                </div>
              </div>

              {facilities.length > 0 && (
                <div className="info-section">
                  <h3>Facilities</h3>
                  <div className="facilities-list">
                    {facilities.map((f, i) => (
                      <span key={i} className="facility-tag">{f}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="info-section">
                <h3>Nearby Amenities</h3>
                <div className="category-filters">
                  {AMENITY_CATEGORIES.map((cat) => {
                    const count = amenities.filter((a) => a.category === cat.id).length;
                    const enabled = enabledCategories[cat.id];
                    return (
                      <button
                        key={cat.id}
                        className={`category-pill ${enabled ? "category-pill-on" : "category-pill-off"}`}
                        style={{
                          "--pill-color": cat.color,
                          borderColor: enabled ? cat.color : "#e2e8f0",
                          background: enabled ? cat.color : "transparent",
                          color: enabled ? "#fff" : "#94a3b8",
                        }}
                        onClick={() => toggleCategory(cat.id)}
                      >
                        <span className="pill-dot" style={{ background: enabled ? "#fff" : "#cbd5e1" }} />
                        {cat.label}
                        {count > 0 && <span className="pill-count">{count}</span>}
                      </button>
                    );
                  })}
                </div>
                {amenitiesLoading ? (
                  <div className="amenities-loading-text">Searching nearby amenities...</div>
                ) : filteredAmenities.length > 0 ? (
                  AMENITY_CATEGORIES.map((cat) => {
                    const items = filteredAmenities.filter((a) => a.category === cat.id);
                    if (items.length === 0) return null;
                    return (
                      <div key={cat.id} className="amenity-category-group">
                        <div className="amenity-category-label" style={{ color: cat.color }}>{cat.label}</div>
                        {items.map((a) => (
                          <div key={a.id} className="amenity-item">
                            <span className="amenity-dot" style={{ background: cat.color }} />
                            <span className="amenity-name">{a.name}</span>
                            <span className="amenity-distance">{formatDistance(a.distance)}</span>
                            {a.rating && <span className="amenity-rating">★ {a.rating.toFixed(1)}</span>}
                          </div>
                        ))}
                      </div>
                    );
                  }).filter(Boolean)
                ) : !apiKey ? (
                  <div className="amenities-empty">Add Google Maps API key for amenities.</div>
                ) : (
                  <div className="amenities-empty">No amenities found nearby.</div>
                )}
              </div>

              <div className="info-section">
                <h3>Agent</h3>
                <div className="info-grid">
                  <InfoItem label="Name" value={p.agent_name} />
                  <InfoItem label="Company" value={p.agent_company} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full-width chart */}
      <PredictionChart
        priceHistory={history}
        sentimentData={signals}
        predictedGrowthPct={riskData?.growthPct}
      />

      {/* Full-width news feed */}
      <div className="detail-news-section">
        <NewsFeed articles={articles} region={p.region} />
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div className="info-item">
      <span className="info-label">{label}</span>
      <span className={`info-value${!value || value === "undefined" ? " empty" : ""}`}>
        {value && value !== "undefined" ? value : "—"}
      </span>
    </div>
  );
}

export default PropertyDetailPage;
```

**Step 2: Update Map.jsx to accept `hideBackBtn` prop**

In `viz/src/Map.jsx`, the Map component needs a small update to accept a `hideBackBtn` prop so the detail page can handle its own back navigation:

Change the back button rendering (around line 131-135):

```jsx
// OLD:
{viewMode === "detail" && (
  <button className="back-btn" onClick={onBack}>
    &larr; Back to overview
  </button>
)}

// NEW:
{viewMode === "detail" && !hideBackBtn && (
  <button className="back-btn" onClick={onBack}>
    &larr; Back to overview
  </button>
)}
```

And update the function signature (line 37):

```jsx
// OLD:
function Map({ data, selected, viewMode, amenities, amenitiesLoading, onSelect, onBack }) {

// NEW:
function Map({ data, selected, viewMode, amenities, amenitiesLoading, onSelect, onBack, hideBackBtn }) {
```

**Step 3: Verify build**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm run build`

**Step 4: Commit**

```bash
cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton
git add viz/src/pages/PropertyDetailPage.jsx viz/src/Map.jsx
git commit -m "feat: add property detail page with map, sidebar, prediction chart, and news"
```

---

### Task 7: Rewrite App.jsx with Router + Context

**Files:**
- Modify: `viz/src/App.jsx`
- Modify: `viz/src/main.jsx`
- Modify: `viz/index.html`

**Step 1: Rewrite App.jsx**

Replace `viz/src/App.jsx` entirely with:

```jsx
// viz/src/App.jsx
import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { DataProvider, useData } from "./DataContext";
import DashboardPage from "./pages/DashboardPage";
import PropertyDetailPage from "./pages/PropertyDetailPage";
import ApiKeyModal from "./ApiKeyModal";
import "./App.css";

function AppContent() {
  const { loading } = useData();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("google_maps_api_key") || "");
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading property data...</p>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <DashboardPage
              apiKey={apiKey}
              onOpenSettings={() => setShowApiKeyModal(true)}
            />
          }
        />
        <Route
          path="/property/:id"
          element={
            <PropertyDetailPage
              apiKey={apiKey}
              onOpenSettings={() => setShowApiKeyModal(true)}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showApiKeyModal && (
        <ApiKeyModal
          onSave={(key) => { setApiKey(key); setShowApiKeyModal(false); }}
          onCancel={() => setShowApiKeyModal(false)}
        />
      )}
    </>
  );
}

function App() {
  return (
    <DataProvider>
      <AppContent />
    </DataProvider>
  );
}

export default App;
```

**Step 2: Update main.jsx to add BrowserRouter**

Replace `viz/src/main.jsx` with:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

**Step 3: Update index.html title**

Change `<title>Jakarta Housing Map</title>` to `<title>Property Valuation Dashboard</title>` in `viz/index.html`.

**Step 4: Verify build**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm run build`

**Step 5: Commit**

```bash
cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton
git add viz/src/App.jsx viz/src/main.jsx viz/index.html
git commit -m "feat: rewrite app with React Router, Context provider, and dashboard-first UX"
```

---

### Task 8: Full CSS restyle to light SaaS theme

**Files:**
- Modify: `viz/src/index.css`
- Rewrite: `viz/src/App.css`

**Step 1: Update index.css**

Replace `viz/src/index.css` with:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  width: 100%;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1e293b;
  background: #f8fafc;
}
```

**Step 2: Rewrite App.css**

Replace `viz/src/App.css` entirely with the new light SaaS theme. This is a large file — see full content below.

The CSS must cover:
- Loading screen
- Dashboard header, KPI bar, filter bar, property cards
- Detail page: header, map+sidebar split, prediction chart, news feed
- Risk gauge, sentiment bars
- Modal (kept from current, restyled)
- Map components (leaflet popups, amenity markers)
- All info-grid, info-item, facility tags, category pills
- Responsive breakpoints

```css
/* ========== LOADING SCREEN ========== */
.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
  color: #64748b;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ========== DASHBOARD ========== */
.dashboard {
  min-height: 100vh;
  padding-bottom: 40px;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 32px;
  background: #1e293b;
  color: white;
}

.dashboard-header-left {
  display: flex;
  flex-direction: column;
}

.dashboard-header h1 {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.dashboard-subtitle {
  font-size: 0.8rem;
  color: #94a3b8;
  margin-top: 2px;
}

.settings-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.3rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: color 0.2s;
}

.settings-btn:hover {
  color: #3b82f6;
}

/* ========== KPI BAR ========== */
.kpi-bar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  padding: 20px 32px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
}

.kpi-card {
  padding: 16px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  text-align: center;
}

.kpi-card.kpi-alert {
  border-color: #fecaca;
  background: #fef2f2;
}

.kpi-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 4px;
}

.kpi-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #64748b;
  font-weight: 600;
}

.kpi-sub {
  font-size: 0.7rem;
  color: #94a3b8;
  margin-top: 2px;
}

/* ========== FILTER BAR ========== */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 32px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  gap: 12px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-bar select,
.filter-bar input {
  padding: 7px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  color: #334155;
  font-size: 0.85rem;
}

.filter-bar select:focus,
.filter-bar input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.filter-bar input[type="number"] {
  width: 140px;
}

.search-input {
  width: 220px !important;
}

.filter-count {
  font-size: 0.85rem;
  color: #3b82f6;
  font-weight: 600;
  white-space: nowrap;
}

/* ========== CARD LIST ========== */
.card-list {
  padding: 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #94a3b8;
  font-size: 1rem;
}

/* ========== PROPERTY CARD ========== */
.property-card {
  display: flex;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.property-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border-color: #3b82f6;
}

.card-image {
  width: 120px;
  min-height: 120px;
  flex-shrink: 0;
  background: #f1f5f9;
  position: relative;
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #cbd5e1;
  font-size: 0.75rem;
}

.card-body {
  flex: 1;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.risk-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 700;
  color: white;
  letter-spacing: 0.3px;
}

.card-price {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1e293b;
}

.card-growth {
  font-size: 0.8rem;
  font-weight: 600;
  color: #10b981;
}

.card-location {
  font-size: 0.85rem;
  color: #64748b;
}

.card-specs {
  font-size: 0.8rem;
  color: #94a3b8;
}

.card-bottom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

.card-sentiment {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: #94a3b8;
}

.sentiment-label {
  white-space: nowrap;
}

.sentiment-bar-track {
  width: 60px;
  height: 6px;
  background: #f1f5f9;
  border-radius: 3px;
  overflow: hidden;
}

.sentiment-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

.sentiment-value {
  font-family: monospace;
  font-size: 0.7rem;
}

.card-detail-btn {
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 0;
}

.card-detail-btn:hover {
  text-decoration: underline;
}

/* ========== DETAIL PAGE ========== */
.detail-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: #1e293b;
  color: white;
}

.detail-header h1 {
  font-size: 1.1rem;
  font-weight: 600;
}

.back-to-dashboard {
  background: none;
  border: 1px solid #475569;
  color: #e2e8f0;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.back-to-dashboard:hover {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.detail-not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
}

.detail-not-found button {
  padding: 8px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

/* Top section: map + sidebar */
.detail-top {
  display: flex;
  height: 55vh;
  min-height: 400px;
}

.detail-map-section {
  flex: 65;
  position: relative;
}

.detail-sidebar {
  flex: 35;
  border-left: 1px solid #e2e8f0;
  background: #ffffff;
}

.detail-sidebar-scroll {
  height: 100%;
  overflow-y: auto;
}

.detail-street-view {
  width: 100%;
  height: 160px;
  object-fit: cover;
  display: block;
}

.detail-sidebar-body {
  padding: 16px;
}

.detail-property-title {
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
  line-height: 1.3;
}

.detail-property-price {
  font-size: 1.3rem;
  font-weight: 700;
  color: #3b82f6;
  margin-bottom: 4px;
}

.detail-property-location {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 12px;
}

.detail-prediction {
  padding: 10px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 0.85rem;
  color: #15803d;
}

.detail-prediction .prediction-arrow {
  font-size: 1rem;
  margin-right: 4px;
}

.prediction-arrow.up { color: #10b981; }
.prediction-arrow.down { color: #ef4444; }

.prediction-values {
  font-size: 0.8rem;
  color: #64748b;
  margin-top: 4px;
}

.property-link {
  display: inline-block;
  margin-bottom: 12px;
  color: #3b82f6;
  font-size: 0.85rem;
  text-decoration: none;
}

.property-link:hover {
  text-decoration: underline;
}

/* ========== RISK GAUGE ========== */
.risk-gauge {
  margin-bottom: 12px;
}

.risk-gauge-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}

.risk-gauge-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.risk-gauge-score {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
}

.risk-gauge-max {
  font-size: 0.85rem;
  color: #94a3b8;
  font-weight: 400;
}

.risk-gauge-track {
  height: 8px;
  background: #f1f5f9;
  border-radius: 4px;
  overflow: hidden;
}

.risk-gauge-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.risk-gauge-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: #94a3b8;
  margin-top: 4px;
}

/* ========== SHARED INFO SECTIONS ========== */
.info-section {
  margin-bottom: 16px;
}

.info-section h3 {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #94a3b8;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #f1f5f9;
  font-weight: 600;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.info-item {
  display: flex;
  flex-direction: column;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-label {
  font-size: 0.65rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.info-value {
  font-size: 0.85rem;
  color: #334155;
  font-weight: 500;
}

.info-value.empty {
  color: #cbd5e1;
  font-style: italic;
  font-weight: 400;
}

.facilities-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.facility-tag {
  background: #f1f5f9;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #64748b;
}

/* Category filter pills */
.category-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.category-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1.5px solid;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.category-pill:hover { opacity: 0.85; }

.pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pill-count {
  font-weight: 400;
  opacity: 0.8;
  font-size: 0.68rem;
}

/* Amenity items */
.amenity-category-group { margin-bottom: 10px; }

.amenity-category-label {
  font-weight: 600;
  font-size: 0.8rem;
  margin-bottom: 4px;
}

.amenity-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 0.8rem;
  color: #475569;
}

.amenity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.amenity-name { flex: 1; }

.amenity-distance {
  color: #94a3b8;
  font-size: 0.7rem;
  white-space: nowrap;
}

.amenity-rating {
  color: #f59e0b;
  font-size: 0.75rem;
  white-space: nowrap;
}

.amenities-loading-text {
  font-size: 0.85rem;
  color: #94a3b8;
  font-style: italic;
  padding: 8px 0;
}

.amenities-empty {
  font-size: 0.85rem;
  color: #cbd5e1;
  font-style: italic;
  padding: 8px 0;
}

/* ========== PREDICTION CHART ========== */
.prediction-chart-container {
  padding: 20px 32px 8px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
}

.prediction-chart-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 12px;
}

.chart-tooltip {
  background: #1e293b;
  padding: 10px 14px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.chart-tooltip-date {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 2px;
}

.chart-tooltip-price {
  font-size: 0.9rem;
  color: #3b82f6;
  font-weight: 600;
}

.chart-tooltip-predicted {
  font-size: 0.85rem;
  color: #60a5fa;
  font-weight: 500;
  font-style: italic;
}

.chart-tooltip-divider {
  height: 1px;
  background: #475569;
  margin: 4px 0;
}

.chart-tooltip-sentiment {
  font-size: 0.8rem;
  font-weight: 500;
}

.chart-tooltip-sentiment.positive { color: #10b981; }
.chart-tooltip-sentiment.negative { color: #ef4444; }

.chart-tooltip-meta {
  font-size: 0.7rem;
  color: #94a3b8;
  margin-top: 2px;
}

.chart-legend {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 8px;
  font-size: 0.75rem;
  color: #94a3b8;
}

.chart-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.chart-legend-line {
  width: 20px;
  height: 2px;
}

.chart-legend-line.dashed {
  background: repeating-linear-gradient(
    to right,
    #3b82f6 0px,
    #3b82f6 5px,
    transparent 5px,
    transparent 9px
  ) !important;
}

.chart-legend-bar {
  width: 8px;
  height: 10px;
  border-radius: 1px;
}

.chart-legend-bar.positive { background: rgba(16, 185, 129, 0.4); }
.chart-legend-bar.negative { background: rgba(239, 68, 68, 0.4); }

/* ========== NEWS FEED ========== */
.detail-news-section {
  padding: 0 32px 32px;
  background: #ffffff;
}

.news-feed {
  max-height: 400px;
  overflow-y: auto;
}

.news-item {
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}

.news-item:last-child { border-bottom: none; }

.news-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 3px;
}

.news-date {
  font-size: 0.7rem;
  color: #94a3b8;
}

.news-source {
  font-size: 0.65rem;
  color: #cbd5e1;
  font-style: italic;
}

.news-title {
  font-size: 0.85rem;
  font-weight: 500;
  color: #334155;
  line-height: 1.3;
  margin-bottom: 5px;
}

.news-meta {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.sentiment-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.65rem;
  font-weight: 600;
  font-family: monospace;
}

.sentiment-positive { background: #ecfdf5; color: #059669; }
.sentiment-negative { background: #fef2f2; color: #dc2626; }
.sentiment-neutral { background: #f8fafc; color: #64748b; }

.scope-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.63rem;
  font-weight: 500;
}

.scope-local { background: #eff6ff; color: #2563eb; }
.scope-regional { background: #fff7ed; color: #ea580c; }
.scope-national { background: #faf5ff; color: #9333ea; }

.category-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.63rem;
  color: #94a3b8;
  background: #f8fafc;
}

/* ========== MAP COMPONENTS ========== */
.map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  width: 100%;
  height: 100%;
}

.back-btn {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 1000;
  padding: 8px 16px;
  background: #1e293b;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: background 0.2s;
}

.back-btn:hover { background: #3b82f6; }

.amenities-loading {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 8px 16px;
  background: rgba(30, 41, 59, 0.85);
  color: white;
  border-radius: 8px;
  font-size: 0.85rem;
  white-space: nowrap;
}

/* Leaflet popup */
.leaflet-popup-content-wrapper { border-radius: 10px; }

.leaflet-popup-content {
  margin: 10px 14px;
  font-size: 0.85rem;
  line-height: 1.4;
}

.popup-title {
  font-weight: 600;
  margin-bottom: 4px;
  color: #1e293b;
}

.popup-price {
  color: #3b82f6;
  font-weight: 700;
  font-size: 0.95rem;
}

.popup-address {
  color: #64748b;
  font-size: 0.8rem;
  margin-top: 2px;
}

.amenity-popup-name {
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 2px;
}

.amenity-popup-category {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 4px;
}

.amenity-popup-rating {
  color: #f59e0b;
  font-size: 0.85rem;
}

.amenity-popup-distance {
  font-size: 0.8rem;
  color: #475569;
  font-weight: 500;
  margin-top: 2px;
}

.amenity-popup-address {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 4px;
}

/* ========== MODAL ========== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: white;
  border-radius: 14px;
  padding: 32px;
  max-width: 440px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.modal-content h2 {
  margin-bottom: 12px;
  color: #1e293b;
  font-size: 1.2rem;
}

.modal-content p {
  color: #64748b;
  font-size: 0.9rem;
  margin-bottom: 8px;
  line-height: 1.4;
}

.modal-note {
  font-size: 0.8rem !important;
  color: #94a3b8 !important;
  margin-bottom: 16px !important;
}

.api-key-input {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.95rem;
  font-family: monospace;
  margin-bottom: 16px;
  box-sizing: border-box;
}

.api-key-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-btn-save {
  padding: 8px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: background 0.2s;
}

.modal-btn-save:hover { background: #2563eb; }

.modal-btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-btn-cancel {
  padding: 8px 20px;
  background: #f1f5f9;
  color: #64748b;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
}

.modal-btn-cancel:hover { background: #e2e8f0; }

/* ========== RESPONSIVE ========== */
@media (max-width: 1024px) {
  .kpi-bar {
    grid-template-columns: repeat(3, 1fr);
  }

  .detail-top {
    flex-direction: column;
    height: auto;
  }

  .detail-map-section {
    height: 50vh;
  }

  .detail-sidebar {
    border-left: none;
    border-top: 1px solid #e2e8f0;
  }
}

@media (max-width: 640px) {
  .kpi-bar {
    grid-template-columns: repeat(2, 1fr);
    padding: 12px 16px;
    gap: 8px;
  }

  .filter-bar {
    flex-direction: column;
    padding: 12px 16px;
  }

  .card-list {
    padding: 12px 16px;
  }

  .dashboard-header {
    padding: 12px 16px;
  }

  .prediction-chart-container {
    padding: 16px;
  }

  .detail-news-section {
    padding: 0 16px 16px;
  }
}
```

**Step 3: Verify build**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm run build`

**Step 4: Commit**

```bash
cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton
git add viz/src/App.css viz/src/index.css
git commit -m "feat: restyle entire app to modern SaaS light theme"
```

---

### Task 9: Clean up old unused files

**Files:**
- Delete: `viz/src/Sidebar.jsx` (functionality moved to PropertyDetailPage)
- Delete: `viz/src/PriceChart.jsx` (replaced by PredictionChart)

**Step 1: Delete old files**

Run:
```bash
rm /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz/src/Sidebar.jsx
rm /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz/src/PriceChart.jsx
```

**Step 2: Verify build**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm run build`

Expected: Build succeeds — these files are no longer imported.

**Step 3: Commit**

```bash
cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton
git add -A viz/src/Sidebar.jsx viz/src/PriceChart.jsx
git commit -m "chore: remove old Sidebar and PriceChart (replaced by new components)"
```

---

### Task 10: Final build verification and dev test

**Step 1: Full build**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm run build`

Expected: Build completes with no errors.

**Step 2: Run dev server**

Run: `cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton/viz && npm run dev`

**Step 3: Manual verification checklist**

1. Dashboard loads at `http://localhost:5173/` with property cards
2. KPI bar shows correct aggregate stats
3. Filters work: region dropdown, price range, risk level, text search
4. Property cards show: image (or placeholder), risk badge, price, growth %, location, specs, sentiment bar
5. Clicking a card navigates to `/property/<id>`
6. Detail page: map centered on property (65% width), sidebar (35% width)
7. Risk Score Gauge renders with correct color
8. Prediction chart: 36 months historical (solid) + 12 months forecast (dashed) + sentiment bars
9. "Today" reference line on chart
10. News feed below chart with sentiment badges
11. Back to Dashboard button works
12. API Key modal opens via settings button
13. Page transitions don't lose data (context persists)

**Step 4: Commit final state**

```bash
cd /Users/aozoraterminal/Documents/GitHub/alibaba-hackaton
git add -A
git commit -m "feat: complete Property Valuation ML Dashboard redesign

- Dashboard-first UX with risk-scored property cards
- KPI bar with portfolio summary stats
- Full filtering (region, price, risk level, search)
- Property detail page with map, risk gauge, prediction chart
- ML-style composite risk scoring (weighted formula)
- 12-month price prediction with sentiment overlay
- Modern SaaS light theme
- React Router for dashboard/detail navigation
- React Context for shared data loading"
```

---

## Key File Paths

| File | Purpose |
|------|---------|
| `viz/src/App.jsx` | Router + Context wrapper |
| `viz/src/DataContext.jsx` | Shared CSV data loading |
| `viz/src/utils/scoring.js` | Risk scoring + growth prediction |
| `viz/src/pages/DashboardPage.jsx` | Dashboard landing page |
| `viz/src/pages/PropertyDetailPage.jsx` | Property detail page |
| `viz/src/components/KpiBar.jsx` | KPI stat cards |
| `viz/src/components/FilterBar.jsx` | Filter controls |
| `viz/src/components/PropertyCard.jsx` | Property card |
| `viz/src/components/RiskScoreGauge.jsx` | Risk score meter |
| `viz/src/components/PredictionChart.jsx` | Enhanced chart w/ forecast |
| `viz/src/Map.jsx` | Leaflet map (updated) |
| `viz/src/NewsFeed.jsx` | News articles (kept) |
| `viz/src/ApiKeyModal.jsx` | API key input (kept) |
| `viz/src/api.js` | Google Places API (kept) |
| `viz/src/App.css` | Full restyle |
| `viz/src/index.css` | Global styles |

## Reused Utilities

| Utility | From File | Reused In |
|---------|-----------|-----------|
| `AMENITY_CATEGORIES` | `viz/src/api.js` | PropertyDetailPage |
| `fetchNearbyAmenities` | `viz/src/api.js` | PropertyDetailPage |
| `formatDistance` | `viz/src/api.js` | PropertyDetailPage |
| `NewsFeed` component | `viz/src/NewsFeed.jsx` | PropertyDetailPage |
| `ApiKeyModal` component | `viz/src/ApiKeyModal.jsx` | App.jsx |
| `Map` component | `viz/src/Map.jsx` | PropertyDetailPage |
