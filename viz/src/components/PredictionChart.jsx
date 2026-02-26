import {
  ResponsiveContainer, ComposedChart, Area, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import { computeGrowthRate } from "../utils/scoring";

function formatPriceBillions(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  return value.toLocaleString();
}

function formatTooltipPrice(value) {
  if (value >= 1e9) return `Rp ${(value / 1e9).toFixed(2)} Miliar`;
  if (value >= 1e6) return `Rp ${(value / 1e6).toFixed(0)} Juta`;
  return `Rp ${value.toLocaleString()}`;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

const CATEGORY_LABELS = {
  infrastructure: "Infrastructure", policy: "Policy", market: "Market",
  disaster: "Disaster", development: "Development", economy: "Economy", environment: "Environment",
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const isForecast = data._forecast;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">
        {formatDateLabel(data.date)} {isForecast ? "(Forecast)" : ""}
      </div>
      {data.price != null && (
        <div className="chart-tooltip-price">{formatTooltipPrice(data.price)}</div>
      )}
      {data.predictedPrice != null && isForecast && (
        <div className="chart-tooltip-predicted">Predicted: {formatTooltipPrice(data.predictedPrice)}</div>
      )}
      {data.sentiment != null && (
        <>
          <div className="chart-tooltip-divider" />
          <div className={`chart-tooltip-sentiment ${data.sentiment >= 0 ? "positive" : "negative"}`}>
            Sentiment: {data.sentiment >= 0 ? "+" : ""}{data.sentiment.toFixed(3)}
          </div>
          {data.article_count > 0 && (
            <div className="chart-tooltip-meta">
              {data.article_count} articles · {CATEGORY_LABELS[data.dominant_category] || data.dominant_category}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PredictionChart({ priceHistory, sentimentData, predictedGrowthPct }) {
  if (!priceHistory || priceHistory.length === 0) return null;

  const sentimentMap = {};
  if (sentimentData) {
    sentimentData.forEach((s) => { sentimentMap[s.date] = s; });
  }

  const historicalData = priceHistory.map((row) => {
    const signal = sentimentMap[row.date];
    return {
      date: row.date,
      price: row.price,
      predictedPrice: null,
      sentiment: signal?.weighted_avg_sentiment ?? null,
      article_count: signal?.article_count ?? 0,
      dominant_category: signal?.dominant_category ?? "",
      _forecast: false,
    };
  });

  const lastEntry = historicalData[historicalData.length - 1];
  const monthlyGrowth = (predictedGrowthPct || computeGrowthRate(priceHistory) * 100) / 12 / 100;
  const forecastData = [];
  const lastDate = new Date(lastEntry.date);

  for (let i = 1; i <= 12; i++) {
    const d = new Date(lastDate);
    d.setMonth(d.getMonth() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const predictedPrice = Math.round(lastEntry.price * Math.pow(1 + monthlyGrowth, i));
    forecastData.push({
      date: dateStr,
      price: null,
      predictedPrice,
      sentiment: null,
      article_count: 0,
      dominant_category: "",
      _forecast: true,
    });
  }

  const bridged = [...historicalData];
  bridged[bridged.length - 1] = {
    ...bridged[bridged.length - 1],
    predictedPrice: bridged[bridged.length - 1].price,
  };

  const chartData = [...bridged, ...forecastData];

  const ticks = chartData.filter((_, i) => i % 6 === 0).map((d) => d.date);
  const allPrices = chartData.map((d) => d.price || d.predictedPrice).filter(Boolean);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const padding = (maxPrice - minPrice) * 0.1;
  const hasSentiment = historicalData.some((d) => d.sentiment !== null);
  const todayDate = lastEntry.date;

  return (
    <div className="prediction-chart-container">
      <div className="prediction-chart-title">
        Price History & ML Prediction (3yr + 1yr Forecast)
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="priceGradientNew" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date" ticks={ticks} tickFormatter={formatDateLabel}
            tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false}
          />
          <YAxis
            yAxisId="price" domain={[minPrice - padding, maxPrice + padding]}
            tickFormatter={formatPriceBillions}
            tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={55}
          />
          {hasSentiment && (
            <YAxis
              yAxisId="sentiment" orientation="right" domain={[-0.6, 0.6]}
              tick={{ fontSize: 9, fill: "#cbd5e1" }} axisLine={false} tickLine={false} width={30}
              tickFormatter={(v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1))}
            />
          )}
          <Tooltip content={<CustomTooltip />} />

          <ReferenceLine
            x={todayDate} yAxisId="price" stroke="#94a3b8"
            strokeDasharray="4 4" label={{ value: "Today", position: "top", fill: "#94a3b8", fontSize: 10 }}
          />

          {hasSentiment && (
            <Bar yAxisId="sentiment" dataKey="sentiment" barSize={6} opacity={0.25}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.sentiment >= 0 ? "#10b981" : "#ef4444"} />
              ))}
            </Bar>
          )}

          <Area
            yAxisId="price" type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2}
            fill="url(#priceGradientNew)" dot={false}
            activeDot={{ r: 4, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }}
          />

          <Line
            yAxisId="price" type="monotone" dataKey="predictedPrice" stroke="#3b82f6"
            strokeWidth={2} strokeDasharray="6 4" dot={false}
            activeDot={{ r: 4, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="chart-legend-line" style={{ background: "#3b82f6" }} /> Historical Price
        </span>
        <span className="chart-legend-item">
          <span className="chart-legend-line dashed" style={{ background: "#3b82f6" }} /> ML Prediction
        </span>
        {hasSentiment && (
          <>
            <span className="chart-legend-item">
              <span className="chart-legend-bar positive" /> Positive News
            </span>
            <span className="chart-legend-item">
              <span className="chart-legend-bar negative" /> Negative News
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default PredictionChart;
