import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useData } from "../DataContext";
import { computeELScore, computeRegionStats, computeGrowthRate, predictPrice, formatPrice, formatPriceCompact, getRiskLevel } from "../utils/scoring";
import { computeLoanAssessment } from "../utils/loanAssessment";
import { AMENITY_CATEGORIES, fetchNearbyAmenities, formatDistance } from "../api";
import Map from "../Map";
import RiskScoreGauge from "../components/RiskScoreGauge";
import PredictionChart from "../components/PredictionChart";
import LoanAssessmentPanel from "../components/LoanAssessmentPanel";
import NewsFeed from "../NewsFeed";

function InfoItem({ label, value }) {
  return (
    <div className="info-item">
      <span className="info-label">{label}</span>
      <span className={`info-value${!value || value === "undefined" ? " empty" : ""}`}>
        {value && value !== "undefined" ? value : "\u2014"}
      </span>
    </div>
  );
}

const TABS = [
  { id: "details", label: "Property Details" },
  { id: "analysis", label: "Price & Sentiment Analysis" },
  { id: "loan", label: "Loan Assessment" },
];

const DECISION_COLORS = {
  RECOMMEND: "var(--success)",
  DUE_DILIGENCE: "var(--warning)",
  DECLINE: "var(--danger)",
};
const DECISION_LABELS = {
  RECOMMEND: "Recommend",
  DUE_DILIGENCE: "Due Diligence",
  DECLINE: "Decline",
};

function PropertyDetailPage({ apiKey, onOpenSettings }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { properties, priceHistory, newsScores, articles } = useData();

  const [activeTab, setActiveTab] = useState("details");
  const [amenities, setAmenities] = useState([]);
  const [amenitiesLoading, setAmenitiesLoading] = useState(false);
  const [loanOverrides, setLoanOverrides] = useState(null);
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
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

  const scores = useMemo(
    () => (property ? newsScores[property.region] || [] : []),
    [property, newsScores]
  );

  const regionStats = useMemo(
    () => computeRegionStats(properties),
    [properties]
  );

  const elResult = useMemo(() => {
    if (!property) return null;
    return computeELScore(property, history, scores, articles, regionStats);
  }, [property, history, scores, articles, regionStats]);

  const loanAssessment = useMemo(() => {
    if (!property || !elResult) return null;
    return computeLoanAssessment(property, elResult, loanOverrides);
  }, [property, elResult, loanOverrides]);

  const riskData = useMemo(() => {
    if (!property || !elResult) return null;
    // Use loan-adjusted EL so summary strip updates with LTV slider
    const effectiveEL = loanAssessment?.elResult || elResult;
    const prediction = predictPrice(property.price, elResult.growthRate, scores);
    return {
      score: effectiveEL.score,
      growthRate: elResult.growthRate,
      ...prediction,
      elRate: effectiveEL.elRate,
    };
  }, [property, elResult, loanAssessment, scores]);

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
  const riskLevel = getRiskLevel(riskData?.score || 0);

  const streetViewUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${p.latitude},${p.longitude}&fov=90&heading=0&pitch=0&key=${apiKey}`
    : null;

  const decisionColor = loanAssessment ? DECISION_COLORS[loanAssessment.decision] : null;
  const decisionLabel = loanAssessment ? DECISION_LABELS[loanAssessment.decision] : null;

  return (
    <div className="detail-page">
      <header className="detail-header">
        <button className="back-to-dashboard" onClick={() => navigate("/")}>
          ← Back
        </button>
        <h1>Property Valuation Detail</h1>
        <button className="settings-btn" onClick={onOpenSettings} title="API Key Settings">
          ⚙
        </button>
      </header>

      <div className="detail-body">
        {/* LEFT: Map */}
        <div className="detail-map-col">
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

        {/* RIGHT: Summary + Tabs */}
        <div className="detail-content-col">
          {/* Compact summary strip */}
          <div className="detail-summary">
            <div className="detail-summary-top">
              <div className="detail-summary-left">
                <div className="detail-property-title">{p.title || "Untitled Property"}</div>
                <div className="detail-property-location">
                  {p.district ? `${p.district}, ` : ""}{p.region}
                </div>
              </div>
              <div className="detail-summary-right">
                <div className="detail-property-price">{formatPrice(p.price)}</div>
                {p.url && (
                  <a className="property-link" href={p.url} target="_blank" rel="noopener noreferrer">
                    View listing →
                  </a>
                )}
              </div>
            </div>

            <div className="detail-summary-metrics">
              {riskData && (
                <>
                  <div className="summary-metric">
                    <span className="summary-metric-label">EL Score</span>
                    <span className="summary-metric-value" style={{ color: riskLevel.color }}>
                      {riskData.score}/100
                    </span>
                  </div>
                  <div className="summary-metric">
                    <span className="summary-metric-label">EL Rate</span>
                    <span className="summary-metric-value" style={{ color: riskLevel.color }}>
                      {(riskData.elRate * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="summary-metric">
                    <span className="summary-metric-label">1yr Forecast</span>
                    <span className={`detail-prediction-inline ${riskData.growthPct >= 0 ? "up" : "down"}`}>
                      {riskData.growthPct >= 0 ? "\u25B2" : "\u25BC"}
                      {riskData.growthPct >= 0 ? "+" : ""}{riskData.growthPct.toFixed(1)}%
                    </span>
                  </div>
                </>
              )}
              {loanAssessment && (
                <>
                  <div className="summary-metric-divider" />
                  <div className="summary-metric">
                    <span className="summary-metric-label">Proposed Loan</span>
                    <span className="summary-metric-value">Rp {formatPriceCompact(loanAssessment.recommendedLoan)}</span>
                  </div>
                  <div className="summary-metric">
                    <span className="summary-metric-label">Decision</span>
                    <span className="summary-metric-badge" style={{ background: decisionColor }}>
                      {decisionLabel}
                    </span>
                  </div>
                </>
              )}
              {approvalStatus ? (
                <>
                  <div className="summary-metric">
                    <span className="summary-metric-label">Status</span>
                    <span className={`summary-metric-badge summary-badge-${approvalStatus}`}>
                      {approvalStatus === "approved" ? "Approved" : "Declined"}
                    </span>
                  </div>
                  <button
                    className="summary-undo-btn"
                    onClick={() => setApprovalStatus(null)}
                  >
                    Undo
                  </button>
                </>
              ) : loanAssessment ? (
                <div className="summary-actions">
                  <button
                    className="summary-approve-btn"
                    onClick={() => {
                      if (loanAssessment.decision === "DECLINE") {
                        setPendingAction("approved");
                        setShowConfirmDialog(true);
                      } else {
                        setApprovalStatus("approved");
                      }
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="summary-decline-btn"
                    onClick={() => setApprovalStatus("declined")}
                  >
                    Decline
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {/* Tab bar */}
          <div className="detail-tab-bar">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`detail-tab-btn${activeTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="detail-tab-content">
            {activeTab === "details" && (
              <div className="tab-panel" key="details">
                {streetViewUrl && (
                  <img
                    src={streetViewUrl}
                    alt="Street View"
                    className="tab-street-view"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                )}

                {riskData && <RiskScoreGauge score={riskData.score} />}

                <div className="info-section">
                  <h3>Specifications</h3>
                  <div className="tab-info-grid">
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
                  <h3>Agent</h3>
                  <div className="info-grid">
                    <InfoItem label="Name" value={p.agent_name} />
                    <InfoItem label="Company" value={p.agent_company} />
                  </div>
                </div>

                {/* Nearby Amenities */}
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
                    <div className="amenities-columns">
                      {AMENITY_CATEGORIES.map((cat) => {
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
                                {a.rating && <span className="amenity-rating">{"\u2605"} {a.rating.toFixed(1)}</span>}
                              </div>
                            ))}
                          </div>
                        );
                      }).filter(Boolean)}
                    </div>
                  ) : !apiKey ? (
                    <div className="amenities-empty">Add Google Maps API key in settings for nearby amenities.</div>
                  ) : (
                    <div className="amenities-empty">No amenities found nearby.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "analysis" && (
              <div className="tab-panel" key="analysis">
                <PredictionChart
                  priceHistory={history}
                  newsScoreData={scores}
                  predictedGrowthPct={riskData?.growthPct}
                  quantiles={elResult?.lgd?.quantiles}
                />
                <div className="detail-news-section">
                  <h3>News & Sentiment</h3>
                  <NewsFeed articles={articles} region={p.region} />
                </div>
              </div>
            )}

            {activeTab === "loan" && loanAssessment && elResult && (
              <div className="tab-panel" key="loan">
                <LoanAssessmentPanel
                  assessment={loanAssessment}
                  elResult={loanAssessment.elResult || elResult}
                  onOverride={setLoanOverrides}
                  onApprove={setApprovalStatus}
                  approvalStatus={approvalStatus}
                />
              </div>
            )}

          </div>
        </div>
      </div>

      {showConfirmDialog && (
        <div className="confirm-overlay" onClick={() => { setShowConfirmDialog(false); setPendingAction(null); }}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">!</div>
            <h3>High Risk Property</h3>
            <p>This property has a <strong>Decline</strong> recommendation due to high risk factors. Are you sure you want to approve this collateral loan?</p>
            <div className="confirm-actions">
              <button className="confirm-yes" onClick={() => {
                setApprovalStatus(pendingAction);
                setShowConfirmDialog(false);
                setPendingAction(null);
              }}>
                Yes, Approve Anyway
              </button>
              <button className="confirm-no" onClick={() => { setShowConfirmDialog(false); setPendingAction(null); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PropertyDetailPage;
