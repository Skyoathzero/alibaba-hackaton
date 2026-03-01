import { createContext, useContext, useState, useEffect } from "react";
import Papa from "papaparse";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [properties, setProperties] = useState([]);
  const [priceHistory, setPriceHistory] = useState({});
  const [newsScores, setNewsScores] = useState({});
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
            building_size_sqm: parseFloat(r.building_size_sqm) || 0,
            land_size_sqm: parseFloat(r.land_size_sqm) || 0,
            bedrooms: parseFloat(r.bedrooms) || 0,
            bathrooms: parseFloat(r.bathrooms) || 0,
            mall_5km: parseInt(r.mall_5km) || 0,
            school_5km: parseInt(r.school_5km) || 0,
            school_2km: parseInt(r.school_2km) || 0,
            hospital_5km: parseInt(r.hospital_5km) || 0,
            hospital_2km: parseInt(r.hospital_2km) || 0,
            transit_1km: parseInt(r.transit_1km) || 0,
            transit_5km: parseInt(r.transit_5km) || 0,
            park_5km: parseInt(r.park_5km) || 0,
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

    Papa.parse("/news_scores.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const byRegion = {};
        result.data.forEach((row) => {
          if (!row.region_id) return;
          if (!byRegion[row.region_id]) byRegion[row.region_id] = [];
          byRegion[row.region_id].push({
            date: row.month + "-01",
            mean_impact: parseFloat(row.mean_impact) || 0,
            sum_impact: parseFloat(row.sum_impact) || 0,
            freq_sentiment_score: parseFloat(row.freq_sentiment_score) || 0,
            article_count: parseInt(row.article_count) || 0,
            n_very_positive: parseInt(row.n_very_positive) || 0,
            n_positive: parseInt(row.n_positive) || 0,
            n_neutral: parseInt(row.n_neutral) || 0,
            n_negative: parseInt(row.n_negative) || 0,
            n_very_negative: parseInt(row.n_very_negative) || 0,
            dominant_category: row.dominant_category || "",
            dominant_sentiment: row.dominant_sentiment || "",
          });
        });
        Object.values(byRegion).forEach((entries) =>
          entries.sort((a, b) => a.date.localeCompare(b.date))
        );
        console.log(`[DataContext] news_scores: ${result.data.length} rows, ${Object.keys(byRegion).length} regions`);
        setNewsScores(byRegion);
        checkDone();
      },
      error: (err) => { console.error("[DataContext] Failed to load news_scores.csv:", err); checkDone(); },
    });

    Papa.parse("/articles_labeled.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const filtered = result.data.filter((r) => r.article_id);
        console.log(`[DataContext] articles: ${filtered.length} loaded`);
        setArticles(filtered);
        checkDone();
      },
      error: (err) => { console.error("[DataContext] Failed to load articles_labeled.csv:", err); checkDone(); },
    });
  }, []);

  return (
    <DataContext.Provider value={{ properties, priceHistory, newsScores, articles, loading }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
