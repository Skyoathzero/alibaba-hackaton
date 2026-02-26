const REGION_QUALITY = {
  "Jakarta Selatan": 90,
  "Jakarta Pusat": 80,
  "Jakarta Barat": 70,
  "Jakarta Timur": 60,
  "Jakarta Utara": 50,
};

export function computeGrowthRate(priceHistory) {
  if (!priceHistory || priceHistory.length < 2) return 0;
  const first = priceHistory[0].price;
  const last = priceHistory[priceHistory.length - 1].price;
  const months = priceHistory.length - 1;
  if (first <= 0 || months <= 0) return 0;
  return Math.pow(last / first, 12 / months) - 1;
}

function trendStabilityScore(priceHistory) {
  if (!priceHistory || priceHistory.length < 3) return 50;
  const changes = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const prev = priceHistory[i - 1].price;
    if (prev > 0) {
      changes.push((priceHistory[i].price - prev) / prev);
    }
  }
  if (changes.length === 0) return 50;
  const mean = changes.reduce((s, v) => s + v, 0) / changes.length;
  const variance = changes.reduce((s, v) => s + (v - mean) ** 2, 0) / changes.length;
  const stdDev = Math.sqrt(variance);
  return Math.max(0, Math.min(100, (1 - stdDev / 0.05) * 100));
}

function growthScore(growthRate) {
  if (growthRate <= 0) return Math.max(0, 50 + growthRate * 500);
  return Math.min(100, (growthRate / 0.10) * 100);
}

function sentimentScore(newsSignals) {
  if (!newsSignals || newsSignals.length === 0) return 50;
  const recent = newsSignals.slice(-6);
  const avg = recent.reduce((s, n) => s + n.weighted_avg_sentiment, 0) / recent.length;
  return Math.max(0, Math.min(100, (avg + 0.5) * 100));
}

function amenitiesScore(amenityCount) {
  return Math.min(100, (amenityCount / 20) * 100);
}

function propertyQualityScore(property) {
  let score = 50;
  if (property.certificate_type === "SHM") score += 20;
  else if (property.certificate_type === "HGB") score += 10;
  if (property.condition === "Bagus" || property.condition === "Baru") score += 15;
  else if (property.condition === "Sudah Renovasi") score += 10;
  if (property.furnished_status === "Furnished") score += 10;
  else if (property.furnished_status === "Semi Furnished") score += 5;
  const missing = ["bedrooms", "bathrooms", "land_size_sqm", "building_size_sqm"]
    .filter(f => !property[f]).length;
  score -= missing * 5;
  return Math.max(0, Math.min(100, score));
}

function locationScore(region) {
  return REGION_QUALITY[region] || 50;
}

export function computeRiskScore(property, priceHistory, newsSignals, amenityCount) {
  const stability = trendStabilityScore(priceHistory);
  const growth = growthScore(computeGrowthRate(priceHistory));
  const sentiment = sentimentScore(newsSignals);
  const amenities = amenitiesScore(amenityCount || 0);
  const quality = propertyQualityScore(property);
  const location = locationScore(property.region);

  const composite = Math.round(
    stability * 0.25 +
    growth * 0.20 +
    sentiment * 0.15 +
    amenities * 0.15 +
    quality * 0.10 +
    location * 0.15
  );

  return Math.max(0, Math.min(100, composite));
}

export function getRiskLevel(score) {
  if (score >= 70) return { label: "LOW RISK", color: "#10b981" };
  if (score >= 40) return { label: "MEDIUM RISK", color: "#f59e0b" };
  return { label: "HIGH RISK", color: "#ef4444" };
}

export function predictPrice(currentPrice, growthRate, newsSignals) {
  if (!currentPrice || currentPrice <= 0) return { predicted: 0, growthPct: 0 };
  let adjustedRate = growthRate;
  if (newsSignals && newsSignals.length >= 3) {
    const recent = newsSignals.slice(-3);
    const avgSentiment = recent.reduce((s, n) => s + n.weighted_avg_sentiment, 0) / recent.length;
    adjustedRate += avgSentiment * 0.02;
  }
  const predicted = Math.round(currentPrice * (1 + adjustedRate));
  return {
    predicted,
    growthPct: adjustedRate * 100,
  };
}

export function formatPrice(price) {
  if (!price) return "\u2014";
  if (price >= 1e9) return `Rp ${(price / 1e9).toFixed(2)} Miliar`;
  if (price >= 1e6) return `Rp ${(price / 1e6).toFixed(0)} Juta`;
  return `Rp ${Number(price).toLocaleString()}`;
}

export function formatPriceShort(price) {
  if (!price) return "N/A";
  if (price >= 1e9) return `Rp ${(price / 1e9).toFixed(1)}B`;
  if (price >= 1e6) return `Rp ${(price / 1e6).toFixed(0)}M`;
  return `Rp ${price.toLocaleString()}`;
}
