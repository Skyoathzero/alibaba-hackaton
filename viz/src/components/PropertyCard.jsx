import { useNavigate } from "react-router-dom";
import { getRiskLevel, formatPrice, formatPriceCompact } from "../utils/scoring";

const DECISION_LABELS = { RECOMMEND: "Recommend", DUE_DILIGENCE: "Due Diligence", DECLINE: "Decline" };
const DECISION_CLASSES = { RECOMMEND: "recommend", DUE_DILIGENCE: "dd", DECLINE: "decline" };

function PropertyCard({ property, apiKey, approvalStatus, onApprovalChange }) {
  const navigate = useNavigate();
  const risk = property._riskData || {};
  const loan = property._loan || {};
  const riskLevel = getRiskLevel(risk.score || 0);

  const streetViewUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=128x128&location=${property.latitude},${property.longitude}&fov=90&heading=0&pitch=0&key=${apiKey}`
    : null;

  const growthPct = risk.growthPct || 0;

  const specs = [
    property.bedrooms ? `${property.bedrooms} BR` : null,
    property.bathrooms ? `${property.bathrooms} BA` : null,
    property.land_size_sqm ? `${property.land_size_sqm}m\u00B2` : null,
    property.certificate_type || null,
  ].filter(Boolean).join(" \u00B7 ");

  const handleApprove = (e) => {
    e.stopPropagation();
    if (loan.decision === "DECLINE") {
      onApprovalChange?.(property.property_id, "confirm_needed");
    } else {
      onApprovalChange?.(property.property_id, "approved");
    }
  };

  const handleDecline = (e) => {
    e.stopPropagation();
    onApprovalChange?.(property.property_id, "declined");
  };

  const handleUndo = (e) => {
    e.stopPropagation();
    onApprovalChange?.(property.property_id, null);
  };

  return (
    <div
      className="property-card"
      onClick={() => navigate(`/property/${property.property_id}`)}
    >
      <div className="card-score-section">
        <div className="score-ring" style={{ color: riskLevel.color }}>
          <span className="score-value">{risk.score || 0}</span>
        </div>
        <span className="score-label" style={{ color: riskLevel.color }}>
          {riskLevel.label}
        </span>
        {risk.elRate != null && (
          <span className="score-el-rate">
            EL: {(risk.elRate * 100).toFixed(2)}%
          </span>
        )}
      </div>

      <div className="card-thumbnail">
        {streetViewUrl ? (
          <img
            src={streetViewUrl}
            alt=""
            onError={(e) => {
              e.target.style.display = "none";
              if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
            }}
          />
        ) : null}
        <div
          className="card-thumbnail-empty"
          style={streetViewUrl ? { display: "none" } : {}}
        >
          No img
        </div>
      </div>

      <div className="card-info">
        <div className="card-title">
          {property.title || "Untitled Property"}
        </div>
        <div className="card-location">
          {property.district ? `${property.district}, ` : ""}
          {property.region || "Unknown"}
        </div>
        {specs && <div className="card-specs">{specs}</div>}
      </div>

      <div className="card-metrics">
        <div className="card-price">{formatPrice(property.price)}</div>
        <div className={`card-growth ${growthPct >= 0 ? "positive" : "negative"}`}>
          {growthPct >= 0 ? "\u25B2" : "\u25BC"} {growthPct >= 0 ? "+" : ""}
          {growthPct.toFixed(1)}% / yr
        </div>
      </div>

      <div className="card-loan-col">
        {loan.decision && (
          <>
            <span className={`card-loan-decision card-loan-${DECISION_CLASSES[loan.decision]}`}>
              {DECISION_LABELS[loan.decision]}
            </span>
            <span className="card-loan-amount">
              Rp {formatPriceCompact(loan.recommendedLoan)}
            </span>
            <span className="card-loan-tenor">{loan.recommendedTenor} yr</span>
          </>
        )}
      </div>

      <div className="card-action-col">
        {approvalStatus === "approved" ? (
          <>
            <span className="card-status-badge card-status-approved">Approved</span>
            <button className="card-undo-btn" onClick={handleUndo}>undo</button>
          </>
        ) : approvalStatus === "declined" ? (
          <>
            <span className="card-status-badge card-status-declined">Declined</span>
            <button className="card-undo-btn" onClick={handleUndo}>undo</button>
          </>
        ) : (
          <div className="card-action-btns">
            <button className="card-approve-btn" onClick={handleApprove} title="Approve">
              {"\u2713"}
            </button>
            <button className="card-decline-btn" onClick={handleDecline} title="Decline">
              {"\u2717"}
            </button>
          </div>
        )}
      </div>

      <div className="card-arrow">&rarr;</div>
    </div>
  );
}

export default PropertyCard;
