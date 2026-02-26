import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useData } from "../DataContext";
import { computeRiskScore, computeGrowthRate, predictPrice, formatPrice } from "../utils/scoring";
import { AMENITY_CATEGORIES, fetchNearbyAmenities, formatDistance } from "../api";
import Map from "../Map";
import RiskScoreGauge from "../components/RiskScoreGauge";
import PredictionChart from "../components/PredictionChart";
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
                    {riskData.growthPct >= 0 ? "\u25B2" : "\u25BC"}
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
                            {a.rating && <span className="amenity-rating">{"\u2605"} {a.rating.toFixed(1)}</span>}
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

      <PredictionChart
        priceHistory={history}
        sentimentData={signals}
        predictedGrowthPct={riskData?.growthPct}
      />

      <div className="detail-news-section">
        <NewsFeed articles={articles} region={p.region} />
      </div>
    </div>
  );
}

export default PropertyDetailPage;
