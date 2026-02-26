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
          \u2699
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
