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
