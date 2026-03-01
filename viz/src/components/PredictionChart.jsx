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
      {isForecast && data.forecastQ50 != null && (
        <>
          <div className="chart-tooltip-predicted">Median: {formatTooltipPrice(data.forecastQ50)}</div>
          {data.forecastQ05 != null && data.forecastQ95 != null && (
            <div className="chart-tooltip-range">
              Range: {formatTooltipPrice(data.forecastQ05)} — {formatTooltipPrice(data.forecastQ95)}
            </div>
          )}
        </>
      )}
      {data.freqScore != null && data.article_count > 0 && (
        <>
          <div className="chart-tooltip-divider" />
          <div className={`chart-tooltip-sentiment ${data.freqScore >= 0 ? "positive" : "negative"}`}>
            News Score: {data.freqScore >= 0 ? "+" : ""}{data.freqScore.toFixed(2)}
          </div>
          <div className="chart-tooltip-meta">
            {data.article_count} articles · {CATEGORY_LABELS[data.dominant_category] || data.dominant_category}
          </div>
          <div className="chart-tooltip-breakdown">
            {data.n_very_positive > 0 && <span style={{ color: "#1B7A4E" }}>V+ {data.n_very_positive}</span>}
            {data.n_positive > 0 && <span style={{ color: "#4ade80" }}>+ {data.n_positive}</span>}
            {data.n_neutral > 0 && <span style={{ color: "#94a3b8" }}>= {data.n_neutral}</span>}
            {data.n_negative > 0 && <span style={{ color: "#f59e0b" }}>- {data.n_negative}</span>}
            {data.n_very_negative > 0 && <span style={{ color: "#B42318" }}>V- {data.n_very_negative}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function PredictionChart({ priceHistory, newsScoreData, predictedGrowthPct, quantiles }) {
  if (!priceHistory || priceHistory.length === 0) return null;

  const scoreMap = {};
  if (newsScoreData && newsScoreData.length > 0) {
    newsScoreData.forEach((s) => { scoreMap[s.date] = s; });
    console.log(`[PredictionChart] ${newsScoreData.length} news scores, ${Object.keys(scoreMap).length} unique dates`);
  } else {
    console.warn("[PredictionChart] No newsScoreData received:", newsScoreData);
  }

  const historicalData = priceHistory.map((row) => {
    const score = scoreMap[row.date];
    return {
      date: row.date,
      price: row.price,
      forecastQ50: null,
      forecastBase: null,
      forecastBand: null,
      forecastQ05: null,
      forecastQ95: null,
      // Frequency-weighted sentiment score for the bar chart
      freqScore: score?.freq_sentiment_score ?? null,
      article_count: score?.article_count ?? 0,
      n_very_positive: score?.n_very_positive ?? 0,
      n_positive: score?.n_positive ?? 0,
      n_neutral: score?.n_neutral ?? 0,
      n_negative: score?.n_negative ?? 0,
      n_very_negative: score?.n_very_negative ?? 0,
      dominant_category: score?.dominant_category ?? "",
      dominant_sentiment: score?.dominant_sentiment ?? "",
      _forecast: false,
    };
  });

  const lastEntry = historicalData[historicalData.length - 1];
  const lastDate = new Date(lastEntry.date);
  const lastPrice = lastEntry.price;

  // Use quantile data for distribution fan, or fall back to single prediction
  const q05 = quantiles?.q05 ?? -0.10;
  const q50 = quantiles?.q50 ?? (predictedGrowthPct || computeGrowthRate(priceHistory) * 100) / 100;
  const q95 = quantiles?.q95 ?? 0.10;

  const forecastData = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(lastDate);
    d.setMonth(d.getMonth() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const t = i / 12;
    const pQ05 = Math.round(lastPrice * Math.exp(q05 * t));
    const pQ50 = Math.round(lastPrice * Math.exp(q50 * t));
    const pQ95 = Math.round(lastPrice * Math.exp(q95 * t));

    forecastData.push({
      date: dateStr,
      price: null,
      forecastQ50: pQ50,
      forecastBase: pQ05,
      forecastBand: pQ95 - pQ05,
      forecastQ05: pQ05,
      forecastQ95: pQ95,
      freqScore: null,
      article_count: 0,
      n_very_positive: 0, n_positive: 0, n_neutral: 0, n_negative: 0, n_very_negative: 0,
      dominant_category: "",
      dominant_sentiment: "",
      _forecast: true,
    });
  }

  // Bridge: connect historical to forecast at the last data point
  const bridged = [...historicalData];
  bridged[bridged.length - 1] = {
    ...bridged[bridged.length - 1],
    forecastQ50: lastPrice,
    forecastBase: lastPrice,
    forecastBand: 0,
    forecastQ05: lastPrice,
    forecastQ95: lastPrice,
  };

  const chartData = [...bridged, ...forecastData];

  const ticks = chartData.filter((_, i) => i % 6 === 0).map((d) => d.date);

  // Price domain: include both historical and forecast range
  const allPrices = chartData.flatMap((d) => [
    d.price, d.forecastQ50, d.forecastQ05, d.forecastQ95,
  ]).filter((v) => v != null && v > 0);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const padding = (maxPrice - minPrice) * 0.1;

  const hasNewsScores = historicalData.some((d) => d.freqScore !== null);
  const todayDate = lastEntry.date;

  // Color function for frequency-weighted bars:
  // Strong positive (very_positive heavy) = deep green
  // Positive = light green
  // Negative = orange
  // Strong negative (very_negative heavy) = red
  function getBarColor(entry) {
    if (entry.freqScore == null) return "transparent";
    if (entry.n_very_positive > 0 && entry.freqScore > 1.0) return "#1B7A4E";
    if (entry.freqScore > 0) return "#4ade80";
    if (entry.n_very_negative > 0 && entry.freqScore < -1.0) return "#B42318";
    if (entry.freqScore < 0) return "#f59e0b";
    return "#94a3b8";
  }

  return (
    <div className="prediction-chart-container">
      <div className="prediction-chart-title">
        Price History & Quantile Forecast (3yr + 1yr Distribution)
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="priceGradientNew" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0D3B66" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#0D3B66" stopOpacity={0.02} />
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
          {hasNewsScores && (
            <YAxis
              yAxisId="sentiment" orientation="right" domain={[-3, 3]}
              tick={{ fontSize: 9, fill: "#cbd5e1" }} axisLine={false} tickLine={false} width={30}
              tickFormatter={(v) => (v > 0 ? `+${v.toFixed(0)}` : v.toFixed(0))}
            />
          )}
          <Tooltip content={<CustomTooltip />} />

          <ReferenceLine
            x={todayDate} yAxisId="price" stroke="#94a3b8"
            strokeDasharray="4 4" label={{ value: "Today", position: "top", fill: "#94a3b8", fontSize: 10 }}
          />

          {hasNewsScores && (
            <Bar yAxisId="sentiment" dataKey="freqScore" barSize={6} opacity={0.35}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={getBarColor(entry)} />
              ))}
            </Bar>
          )}

          {/* Historical price line */}
          <Area
            yAxisId="price" type="monotone" dataKey="price" stroke="#0D3B66" strokeWidth={2}
            fill="url(#priceGradientNew)" dot={false}
            activeDot={{ r: 4, fill: "#0D3B66", stroke: "#fff", strokeWidth: 2 }}
          />

          {/* Forecast distribution band: invisible base (q05) + visible band (q95-q05) */}
          <Area
            yAxisId="price" type="monotone" dataKey="forecastBase" stackId="forecast"
            stroke="none" fill="transparent" dot={false} activeDot={false}
          />
          <Area
            yAxisId="price" type="monotone" dataKey="forecastBand" stackId="forecast"
            stroke="rgba(13,59,102,0.15)" strokeWidth={1} fill="rgba(13,59,102,0.08)"
            dot={false} activeDot={false} strokeDasharray="3 3"
          />

          {/* Forecast median line (q50) */}
          <Line
            yAxisId="price" type="monotone" dataKey="forecastQ50" stroke="#0D3B66"
            strokeWidth={2} strokeDasharray="6 4" dot={false}
            activeDot={{ r: 4, fill: "#0D3B66", stroke: "#fff", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="chart-legend-line" style={{ background: "#0D3B66" }} /> Historical Price
        </span>
        <span className="chart-legend-item">
          <span className="chart-legend-line dashed" style={{ background: "#0D3B66" }} /> Median Forecast (q50)
        </span>
        <span className="chart-legend-item">
          <span className="chart-legend-band" /> 90% Confidence (q5-q95)
        </span>
        {hasNewsScores && (
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
