import { useState } from "react";

function ApiKeyModal({ onSave, onCancel }) {
  const [key, setKey] = useState("");

  const handleSave = () => {
    if (key.trim()) {
      localStorage.setItem("google_maps_api_key", key.trim());
      onSave(key.trim());
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Google Maps API Key</h2>
        <p>
          Enter your Google Maps API key to enable Street View previews and
          nearby amenities search.
        </p>
        <p className="modal-note">
          Required APIs: Places API (New) and Street View Static API.
        </p>
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIza..."
          className="api-key-input"
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
        <div className="modal-actions">
          {onCancel && (
            <button className="modal-btn-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button
            className="modal-btn-save"
            onClick={handleSave}
            disabled={!key.trim()}
          >
            Save Key
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApiKeyModal;
