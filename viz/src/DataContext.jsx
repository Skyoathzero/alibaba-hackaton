import { createContext, useContext, useState, useEffect } from "react";
import Papa from "papaparse";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [properties, setProperties] = useState([]);
  const [priceHistory, setPriceHistory] = useState({});
  const [newsSignals, setNewsSignals] = useState({});
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

    Papa.parse("/news_signals.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const byRegion = {};
        result.data.forEach((row) => {
          if (row.scope !== "combined" || !row.region_id) return;
          if (!byRegion[row.region_id]) byRegion[row.region_id] = [];
          byRegion[row.region_id].push({
            date: row.period_start,
            signal_strength: parseFloat(row.signal_strength) || 0,
            avg_sentiment: parseFloat(row.avg_sentiment) || 0,
            weighted_avg_sentiment: parseFloat(row.weighted_avg_sentiment) || 0,
            article_count: parseInt(row.article_count) || 0,
            dominant_category: row.dominant_category || "",
          });
        });
        setNewsSignals(byRegion);
        checkDone();
      },
    });

    Papa.parse("/articles.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setArticles(result.data.filter((r) => r.article_id));
        checkDone();
      },
    });
  }, []);

  return (
    <DataContext.Provider value={{ properties, priceHistory, newsSignals, articles, loading }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
