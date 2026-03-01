import { useState, useMemo } from "react";
import { useData } from "../DataContext";
import { computeELScore, computeRegionStats, predictPrice } from "../utils/scoring";
import { computeLoanAssessment } from "../utils/loanAssessment";
import KpiBar from "../components/KpiBar";
import FilterBar from "../components/FilterBar";
import PropertyCard from "../components/PropertyCard";

function DashboardPage({ apiKey, onOpenSettings }) {
  const { properties, priceHistory, newsScores, articles } = useData();

  const [filter, setFilter] = useState({
    region: "All",
    minPrice: "",
    maxPrice: "",
    riskLevel: "All",
    search: "",
  });

  const [approvalStatuses, setApprovalStatuses] = useState({});
  const [confirmTarget, setConfirmTarget] = useState(null);

  const handleApprovalChange = (propertyId, status) => {
    if (status === "confirm_needed") {
      setConfirmTarget(propertyId);
      return;
    }
    setApprovalStatuses((prev) => {
      const next = { ...prev };
      if (status === null) {
        delete next[propertyId];
      } else {
        next[propertyId] = status;
      }
      return next;
    });
  };

  const handleConfirmApprove = () => {
    setApprovalStatuses((prev) => ({ ...prev, [confirmTarget]: "approved" }));
    setConfirmTarget(null);
  };

  const regionStats = useMemo(
    () => computeRegionStats(properties),
    [properties]
  );

  const enriched = useMemo(() => {
    return properties.map((p) => {
      const history = priceHistory[p.property_id] || [];
      const scores = newsScores[p.region] || [];

      const elResult = computeELScore(p, history, scores, articles, regionStats);
      const prediction = predictPrice(p.price, elResult.growthRate, scores);
      const loan = computeLoanAssessment(p, elResult, null);

      const recentScores = scores.slice(-6);
      const avgImpact = recentScores.length > 0
        ? recentScores.reduce((s, n) => s + n.mean_impact, 0) / recentScores.length
        : 0;

      // Use loan-adjusted EL so scores reflect actual proposed loan risk
      const effectiveEL = loan.elResult || elResult;

      return {
        ...p,
        _riskData: {
          score: effectiveEL.score,
          growthRate: elResult.growthRate,
          growthPct: prediction.growthPct,
          predictedPrice: prediction.predicted,
          currentPrice: p.price || 0,
          sentiment: avgImpact,
          elRate: effectiveEL.elRate,
        },
        _elResult: effectiveEL,
        _loan: loan,
      };
    }).sort((a, b) => (b._riskData.score || 0) - (a._riskData.score || 0));
  }, [properties, priceHistory, newsScores, articles, regionStats]);

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
          <h1>Property Collateral Dashboard</h1>
          <p className="dashboard-subtitle">EL Model Risk Assessment</p>
        </div>
        <button className="settings-btn" onClick={onOpenSettings} title="API Key Settings">
          {"\u2699"}
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
        <div className="card-list-header">
          <span className="col-score">Score</span>
          <span className="col-thumbnail"></span>
          <span className="col-property">Property</span>
          <span className="col-price">Valuation</span>
          <span className="col-growth">Growth</span>
          <span className="col-loan">Proposed Loan</span>
          <span className="col-action">Action</span>
          <span></span>
        </div>
        {filtered.map((property) => (
          <PropertyCard
            key={property.property_id}
            property={property}
            apiKey={apiKey}
            approvalStatus={approvalStatuses[property.property_id]}
            onApprovalChange={handleApprovalChange}
          />
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">No properties match your filters.</div>
        )}
      </div>

      {confirmTarget && (
        <div className="confirm-overlay" onClick={() => setConfirmTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">!</div>
            <h3>High Risk Property</h3>
            <p>This property has a <strong>Decline</strong> recommendation due to high risk factors. Are you sure you want to approve this collateral loan?</p>
            <div className="confirm-actions">
              <button className="confirm-yes" onClick={handleConfirmApprove}>
                Yes, Approve Anyway
              </button>
              <button className="confirm-no" onClick={() => setConfirmTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
