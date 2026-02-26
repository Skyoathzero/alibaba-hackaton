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
          {(risk.growthPct || 0) >= 0 ? "\u25B2" : "\u25BC"} {risk.growthPct >= 0 ? "+" : ""}{(risk.growthPct || 0).toFixed(1)}% predicted 1yr
        </div>

        <div className="card-location">
          {property.district ? `${property.district}, ` : ""}{property.region || "Unknown"}
        </div>

        <div className="card-specs">
          {property.bedrooms ? `${property.bedrooms} BR` : ""}
          {property.bathrooms ? ` \u00B7 ${property.bathrooms} BA` : ""}
          {property.land_size_sqm ? ` \u00B7 ${property.land_size_sqm}m\u00B2` : ""}
          {property.building_size_sqm ? ` \u00B7 ${property.building_size_sqm}m\u00B2 bld` : ""}
          {property.certificate_type ? ` \u00B7 ${property.certificate_type}` : ""}
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
          <button className="card-detail-btn">View Details \u2192</button>
        </div>
      </div>
    </div>
  );
}

export default PropertyCard;
