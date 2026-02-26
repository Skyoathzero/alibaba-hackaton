import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import { formatDistance } from "./api";
import "leaflet/dist/leaflet.css";

const REGION_COLORS = {
  "Jakarta Selatan": "#e94560",
  "Jakarta Barat": "#0f3460",
  "Jakarta Utara": "#16a085",
  "Jakarta Timur": "#e67e22",
  "Jakarta Pusat": "#8e44ad",
};

const CENTER = [-6.2, 106.85];
const ZOOM = 11;

function formatPrice(price) {
  if (!price) return "N/A";
  if (price >= 1e9) return `Rp ${(price / 1e9).toFixed(1)} M`;
  if (price >= 1e6) return `Rp ${(price / 1e6).toFixed(0)} Jt`;
  return `Rp ${price.toLocaleString()}`;
}

function MapController({ data, selected, viewMode }) {
  const map = useMap();
  useEffect(() => {
    if (viewMode === "detail" && selected) {
      map.flyTo([selected.latitude, selected.longitude], 16, { duration: 1.5 });
    } else if (viewMode === "overview" && data.length > 0) {
      const bounds = data.map((d) => [d.latitude, d.longitude]);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [viewMode, selected, data, map]);
  return null;
}

function Map({ data, selected, viewMode, amenities, amenitiesLoading, onSelect, onBack, hideBackBtn }) {
  return (
    <div className="map-wrapper">
      <MapContainer center={CENTER} zoom={ZOOM} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController data={data} selected={selected} viewMode={viewMode} />

        {viewMode === "overview"
          ? data.map((property) => {
              const color = REGION_COLORS[property.region] || "#666";
              return (
                <CircleMarker
                  key={property.property_id || `${property.latitude}-${property.longitude}`}
                  center={[property.latitude, property.longitude]}
                  radius={7}
                  pathOptions={{
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.75,
                    weight: 1.5,
                  }}
                  eventHandlers={{ click: () => onSelect(property) }}
                >
                  <Popup>
                    <div className="popup-title">
                      {property.title?.slice(0, 60) || "Property"}
                      {property.title?.length > 60 ? "..." : ""}
                    </div>
                    <div className="popup-price">{formatPrice(property.price)}</div>
                    <div className="popup-address">
                      {property.full_address || property.district || "\u2014"}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })
          : selected && (
              <CircleMarker
                key={selected.property_id}
                center={[selected.latitude, selected.longitude]}
                radius={10}
                pathOptions={{
                  color: "#fff",
                  fillColor: REGION_COLORS[selected.region] || "#e94560",
                  fillOpacity: 1,
                  weight: 3,
                }}
              >
                <Popup>
                  <div className="popup-title">
                    {selected.title?.slice(0, 60) || "Property"}
                  </div>
                  <div className="popup-price">{formatPrice(selected.price)}</div>
                </Popup>
              </CircleMarker>
            )
        }

        {viewMode === "detail" &&
          amenities.map((amenity) => (
            <CircleMarker
              key={amenity.id}
              center={[amenity.latitude, amenity.longitude]}
              radius={6}
              pathOptions={{
                color: "#fff",
                fillColor: amenity.color,
                fillOpacity: 0.9,
                weight: 1.5,
              }}
            >
              <Popup>
                <div className="amenity-popup-name">{amenity.name}</div>
                <div className="amenity-popup-category">{amenity.categoryLabel}</div>
                {amenity.rating && (
                  <div className="amenity-popup-rating">
                    {"★"} {amenity.rating.toFixed(1)}
                    {amenity.ratingCount > 0 && ` (${amenity.ratingCount})`}
                  </div>
                )}
                <div className="amenity-popup-distance">
                  {formatDistance(amenity.distance)}
                </div>
                {amenity.address && (
                  <div className="amenity-popup-address">{amenity.address}</div>
                )}
              </Popup>
            </CircleMarker>
          ))}
      </MapContainer>

      {viewMode === "detail" && !hideBackBtn && (
        <button className="back-btn" onClick={onBack}>
          &larr; Back to overview
        </button>
      )}

      {amenitiesLoading && (
        <div className="amenities-loading">Loading nearby amenities...</div>
      )}
    </div>
  );
}

export default Map;
