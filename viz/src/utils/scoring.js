/**
 * EL = PD × LGD × EAD risk scoring framework.
 *
 * Simulates three sub-models client-side:
 *   1. Haircut model (XGBoost-style) — house features + geospatial → fair value gap
 *   2. Price quantile model (LightGBM-style) — time series → return distribution
 *   3. PD model (Binomial GBM-style) — news/sentiment/macro → default probability
 *
 * Final EL rate is mapped to a 0–100 score via logarithmic scale.
 */

// ── Helpers ──────────────────────────────────────────────────

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

// ── Region Statistics (computed once, memoized in useMemo) ───

export function computeRegionStats(properties) {
  const byRegion = {};
  for (const p of properties) {
    const region = p.region;
    if (!region) continue;
    if (!byRegion[region]) byRegion[region] = [];
    byRegion[region].push(p);
  }
  const stats = {};
  for (const [region, props] of Object.entries(byRegion)) {
    const pricesPerSqm = props
      .filter((p) => p.price > 0 && p.building_size_sqm > 0)
      .map((p) => p.price / p.building_size_sqm);
    stats[region] = {
      medianPricePerSqm: median(pricesPerSqm),
      stdPricePerSqm: stddev(pricesPerSqm),
      meanBedrooms: mean(props.map((p) => parseFloat(p.bedrooms) || 0)),
      meanBathrooms: mean(props.map((p) => parseFloat(p.bathrooms) || 0)),
      meanLandSize: mean(props.map((p) => parseFloat(p.land_size_sqm) || 0)),
      meanBuildingSize: mean(props.map((p) => parseFloat(p.building_size_sqm) || 0)),
      count: props.length,
    };
  }
  return stats;
}

// ── Amenity Density Score ────────────────────────────────────

const AMENITY_WEIGHTS = {
  mall_5km: 0.10,
  school_5km: 0.10,
  school_2km: 0.15,
  hospital_5km: 0.10,
  hospital_2km: 0.15,
  transit_1km: 0.20,
  transit_5km: 0.10,
  park_5km: 0.10,
};

const AMENITY_MAX = {
  mall_5km: 12,
  school_5km: 25,
  school_2km: 10,
  hospital_5km: 15,
  hospital_2km: 5,
  transit_1km: 6,
  transit_5km: 20,
  park_5km: 10,
};

export function computeAmenityDensityScore(property) {
  let score = 0;
  for (const [col, weight] of Object.entries(AMENITY_WEIGHTS)) {
    const val = parseFloat(property[col]) || 0;
    score += weight * Math.min(val / AMENITY_MAX[col], 1.0);
  }
  return score; // 0 to 1
}

// ── 1. Haircut Model (simulates XGBoost on house features) ──

const CERT_MULTIPLIER = { SHM: 1.12, HGB: 1.0 };
const CONDITION_MULTIPLIER = {
  Baru: 1.15,
  Bagus: 1.08,
  "Sudah Renovasi": 1.05,
  "Butuh Renovasi": 0.85,
};
const FURNISHED_MULTIPLIER = {
  Furnished: 1.10,
  "Semi Furnished": 1.05,
  Unfurnished: 1.0,
};

export function computeHaircut(property, regionStats) {
  const stats = regionStats[property.region];
  if (!stats || !property.price || !property.building_size_sqm) return 0;

  const basePricePerSqm = stats.medianPricePerSqm;
  if (basePricePerSqm <= 0) return 0;

  let adjustment = 1.0;

  // Certificate premium
  adjustment *= CERT_MULTIPLIER[property.certificate_type] || 0.88;

  // Condition premium
  adjustment *= CONDITION_MULTIPLIER[property.condition] || 1.0;

  // Furnished premium
  adjustment *= FURNISHED_MULTIPLIER[property.furnished_status] || 1.0;

  // Size efficiency: building/land ratio
  const landSize = parseFloat(property.land_size_sqm) || 0;
  if (landSize > 0) {
    const buildRatio = property.building_size_sqm / landSize;
    adjustment *= 0.95 + Math.min(buildRatio, 2.0) * 0.05;
  }

  // Bedroom count vs regional mean
  const bedrooms = parseFloat(property.bedrooms) || 0;
  if (stats.meanBedrooms > 0) {
    const bedDelta = (bedrooms - stats.meanBedrooms) / stats.meanBedrooms;
    adjustment *= 1 + bedDelta * 0.03;
  }

  // Amenity density premium
  const amenityScore = computeAmenityDensityScore(property);
  adjustment *= 0.95 + amenityScore * 0.10;

  // Fair price
  const fairPricePerSqm = basePricePerSqm * adjustment;
  const fairPrice = fairPricePerSqm * property.building_size_sqm;

  // Haircut: positive = overpriced, negative = underpriced
  const haircut = (property.price - fairPrice) / property.price;
  return Math.max(-0.30, Math.min(0.30, haircut));
}

// ── 2. Price Quantile Model (simulates LightGBM quantile regression) ──

export function computePriceQuantiles(priceHistory) {
  if (!priceHistory || priceHistory.length < 12) {
    return { q05: -0.15, q50: 0.0, q95: 0.15, annualizedVol: 0.10, monthlyMu: 0, monthlySigma: 0.03 };
  }

  // Monthly log returns
  const returns = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const prev = priceHistory[i - 1].price;
    const curr = priceHistory[i].price;
    if (prev > 0 && curr > 0) {
      returns.push(Math.log(curr / prev));
    }
  }

  if (returns.length < 6) {
    return { q05: -0.15, q50: 0.0, q95: 0.15, annualizedVol: 0.10, monthlyMu: 0, monthlySigma: 0.03 };
  }

  const mu = mean(returns);
  const sigma = stddev(returns);

  // 12-month horizon under GBM: r_12 ~ N(12*mu, 12*sigma^2)
  const H = 12;
  const drift = H * mu;
  const diffusion = Math.sqrt(H) * sigma;

  return {
    q05: drift - 1.645 * diffusion,
    q50: drift,
    q95: drift + 1.645 * diffusion,
    annualizedVol: sigma * Math.sqrt(12),
    monthlyMu: mu,
    monthlySigma: sigma,
  };
}

// ── 3. LGD Calculation ──────────────────────────────────────

const LEGAL_COSTS = 0.065;  // 6.5% auction, legal, admin fees
const LGD_FLOOR = 0.05;     // 5% minimum LGD

// Variable fire sale discount based on property liquidity characteristics
const REGION_LIQUIDITY_ADJ = {
  "Jakarta Selatan": -0.03,  // premium, liquid
  "Jakarta Pusat": -0.02,
  "Jakarta Barat": 0.02,
  "Jakarta Timur": 0.04,
  "Jakarta Utara": 0.05,    // peripheral, illiquid
};

function computeFireSaleDiscount(property) {
  let discount = 0.22;  // base 22%

  // Certificate: non-SHM harder to sell at auction
  if (property.certificate_type === "SHM") discount -= 0.02;
  else if (property.certificate_type === "HGB") discount += 0.03;
  else discount += 0.06;  // unknown/other certificate

  // Condition: poor condition harder to liquidate
  if (property.condition === "Baru") discount -= 0.02;
  else if (property.condition === "Bagus") discount -= 0.01;
  else if (property.condition === "Sudah Renovasi") discount += 0.02;
  else if (property.condition === "Butuh Renovasi") discount += 0.08;

  // Location liquidity
  discount += REGION_LIQUIDITY_ADJ[property.region] || 0.03;

  // Amenity density: high density = more liquid market = lower discount
  const amenityScore = computeAmenityDensityScore(property);
  discount -= amenityScore * 0.05;

  // Furnished properties sell slightly easier
  if (property.furnished_status === "Furnished") discount -= 0.01;

  return Math.max(0.15, Math.min(0.40, discount));
}

export function computeLGD(property, priceHistory, regionStats, ead) {
  const fireSaleDiscount = computeFireSaleDiscount(property);

  if (ead <= 0 || !property.price) {
    return { lgd: LGD_FLOOR, haircut: 0, legalCosts: LEGAL_COSTS, fireSaleDiscount, quantiles: null, liquidation: null, shortfall: null, expectedShortfall: 0, annualizedVol: 0, fairValueRatio: 1 };
  }

  const haircut = computeHaircut(property, regionStats);
  const quantiles = computePriceQuantiles(priceHistory);
  const currentPrice = property.price;

  // Price at each quantile
  const P_q05 = currentPrice * Math.exp(quantiles.q05);
  const P_q50 = currentPrice * Math.exp(quantiles.q50);
  const P_q95 = currentPrice * Math.exp(quantiles.q95);

  // Liquidation value includes fire sale discount (forced auction) + haircut + legal costs
  // L = P_future * (1 - haircut) * (1 - fire_sale_discount) * (1 - legal_costs)
  const liquidationFactor = (1 - haircut) * (1 - fireSaleDiscount) * (1 - LEGAL_COSTS);
  const L_q05 = P_q05 * liquidationFactor;
  const L_q50 = P_q50 * liquidationFactor;
  const L_q95 = P_q95 * liquidationFactor;

  // Shortfall at each quantile: S = max(0, EAD - L)
  const S_q05 = Math.max(0, ead - L_q05);
  const S_q50 = Math.max(0, ead - L_q50);
  const S_q95 = Math.max(0, ead - L_q95);

  // Expected shortfall: tail-weighted approximation
  const expectedShortfall = 0.30 * S_q05 + 0.50 * S_q50 + 0.20 * S_q95;

  // Shortfall-based LGD
  const rawLGD = expectedShortfall / ead;

  // Coverage-based LGD: measures buffer between loan and expected liquidation value.
  // Ensures LGD responds to LTV even when shortfall is zero (EAD < liquidation).
  const bufferRatio = L_q50 > 0 && ead > 0 ? L_q50 / ead : 999;
  let coverageLGD;
  if (bufferRatio >= 2.0) {
    coverageLGD = 0.03;
  } else if (bufferRatio >= 1.5) {
    coverageLGD = 0.03 + (2.0 - bufferRatio) * 0.08;
  } else if (bufferRatio >= 1.0) {
    coverageLGD = 0.07 + (1.5 - bufferRatio) * 0.30;
  } else {
    coverageLGD = 0.22 + (1.0 - bufferRatio) * 0.78;
  }

  // LGD = max(floor, shortfall-based, coverage-based)
  const lgd = Math.max(LGD_FLOOR, Math.min(1.0, Math.max(rawLGD, coverageLGD)));

  return {
    lgd,
    haircut,
    legalCosts: LEGAL_COSTS,
    fireSaleDiscount,
    quantiles: { q05: quantiles.q05, q50: quantiles.q50, q95: quantiles.q95 },
    priceQuantiles: { P_q05, P_q50, P_q95 },
    liquidation: { L_q05, L_q50, L_q95 },
    shortfall: { S_q05, S_q50, S_q95 },
    expectedShortfall,
    annualizedVol: quantiles.annualizedVol,
    fairValueRatio: 1 - haircut,
  };
}

// ── 4. PD Model (simulates Binomial GBM) ────────────────────

const REGIONAL_BASE_PD = {
  "Jakarta Selatan": 0.020,
  "Jakarta Pusat": 0.030,
  "Jakarta Barat": 0.045,
  "Jakarta Timur": 0.055,
  "Jakarta Utara": 0.065,
};

export function computePD(property, newsScores) {
  const basePD = REGIONAL_BASE_PD[property.region] || 0.035;

  // Recent one-hot aggregated scores (last 6 months)
  const recentScores = (newsScores || []).slice(-6);

  // News adjustment from one-hot encoded AI labels (dot product scores)
  // mean_impact is pre-computed as: category_weight × scope_multiplier × sentiment_weight
  // Typical range: -0.5 to +0.5.  We scale to ±1-3pp PD adjustment.
  // Positive mean_impact = good news → lower PD; negative = bad news → raise PD.
  // Asymmetric: bad news hurts 1.5x more than good news helps.
  let newsAdj = 0;
  if (recentScores.length > 0) {
    const avgImpact = mean(recentScores.map((s) => s.mean_impact));
    newsAdj = -avgImpact * (avgImpact >= 0 ? 0.025 : 0.04);
  }

  // Certificate quality adjustment — SHM (freehold) is strongest title
  const CERT_PD_ADJ = { SHM: -0.008, HGB: 0.005 };
  const certAdj = CERT_PD_ADJ[property.certificate_type] ?? 0.015;

  // Macro cycle (deterministic sine wave, ±1pp)
  const now = new Date();
  const monthIndex = (now.getFullYear() - 2023) * 12 + now.getMonth();
  const macroAdj = 0.010 * Math.sin((monthIndex * Math.PI) / 18);

  // Combine: basePD + news one-hot score + certificate + macro
  const annualPD = Math.max(
    0.005,
    Math.min(0.15, basePD + newsAdj + certAdj + macroAdj)
  );

  return {
    annualPD,
    basePD,
    newsAdj,
    certAdj,
    macroAdj,
    monthlyPD: 1 - Math.pow(1 - annualPD, 1 / 12),
  };
}

// ── 5. EL → Score Mapping (logarithmic) ─────────────────────

export function elToScore(elRate) {
  if (elRate <= 0) return 100;

  // Calibrated so score thresholds align with EL decision boundaries:
  //   Score 70 = EL 0.5%  (RECOMMEND / DUE_DILIGENCE boundary)
  //   Score 40 = EL 2.5%  (DUE_DILIGENCE / DECLINE boundary)
  const logMin = -6.907;  // EL ≈ 0.1% → score 100
  const logMax = -1.544;  // EL ≈ 21%  → score 0
  const logEl = Math.log(Math.max(elRate, 1e-10));

  const score = 100 * (1 - (logEl - logMin) / (logMax - logMin));
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── 6. Master EL Score ──────────────────────────────────────

const CERT_LTV = { SHM: 0.80, HGB: 0.70 };

export function computeELScore(property, priceHistory, newsScores, articles, regionStats) {
  const maxLTV = CERT_LTV[property.certificate_type] || 0.60;
  const ead = (property.price || 0) * maxLTV;

  const pd = computePD(property, newsScores);
  const lgd = computeLGD(property, priceHistory, regionStats, ead);

  const elRate = pd.annualPD * lgd.lgd;
  const elAbsolute = elRate * ead;
  const score = elToScore(elRate);

  return {
    score,
    elRate,
    elAbsolute,
    pd,
    lgd,
    ead: { ead, ltv: maxLTV, propertyPrice: property.price || 0 },
    growthRate: computeGrowthRate(priceHistory),
  };
}

// ── Backward-Compatible Wrapper ─────────────────────────────

export function computeRiskScore(property, priceHistory, newsScores, amenityCount, articles, regionStats) {
  if (!regionStats) {
    return 50;
  }
  const result = computeELScore(property, priceHistory, newsScores, articles, regionStats);
  return result.score;
}

// ── Preserved Exports ───────────────────────────────────────

export function computeGrowthRate(priceHistory) {
  if (!priceHistory || priceHistory.length < 2) return 0;
  const first = priceHistory[0].price;
  const last = priceHistory[priceHistory.length - 1].price;
  const months = priceHistory.length - 1;
  if (first <= 0 || months <= 0) return 0;
  return Math.pow(last / first, 12 / months) - 1;
}

export function predictPrice(currentPrice, growthRate, newsScores) {
  if (!currentPrice || currentPrice <= 0) return { predicted: 0, growthPct: 0 };
  let adjustedRate = growthRate;
  if (newsScores && newsScores.length >= 3) {
    const recent = newsScores.slice(-3);
    const avgImpact = mean(recent.map((n) => n.mean_impact));
    adjustedRate += avgImpact * 0.02;
  }
  const predicted = Math.round(currentPrice * (1 + adjustedRate));
  return { predicted, growthPct: adjustedRate * 100 };
}

export function getRiskLevel(score) {
  if (score >= 70) return { label: "LOW RISK", color: "#1B7A4E" };
  if (score >= 40) return { label: "MEDIUM RISK", color: "#A16207" };
  return { label: "HIGH RISK", color: "#B42318" };
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

export function formatPriceCompact(price) {
  if (!price) return "\u2014";
  if (price >= 1e12) return `${(price / 1e12).toFixed(1)}T`;
  if (price >= 1e9) return `${(price / 1e9).toFixed(1)}M`;
  if (price >= 1e6) return `${(price / 1e6).toFixed(0)}Jt`;
  return Number(price).toLocaleString();
}

// Legacy exports kept for PredictionChart compatibility
export function trendStabilityScore(priceHistory) {
  if (!priceHistory || priceHistory.length < 3) return 50;
  const changes = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const prev = priceHistory[i - 1].price;
    if (prev > 0) changes.push((priceHistory[i].price - prev) / prev);
  }
  if (changes.length === 0) return 50;
  const m = mean(changes);
  const variance = changes.reduce((s, v) => s + (v - m) ** 2, 0) / changes.length;
  return Math.max(0, Math.min(100, (1 - Math.sqrt(variance) / 0.05) * 100));
}

export function propertyQualityScore(property) {
  let score = 50;
  if (property.certificate_type === "SHM") score += 20;
  else if (property.certificate_type === "HGB") score += 10;
  if (property.condition === "Bagus" || property.condition === "Baru") score += 15;
  else if (property.condition === "Sudah Renovasi") score += 10;
  if (property.furnished_status === "Furnished") score += 10;
  else if (property.furnished_status === "Semi Furnished") score += 5;
  return Math.max(0, Math.min(100, score));
}

export function locationScore(region) {
  const REGION_QUALITY = {
    "Jakarta Selatan": 90,
    "Jakarta Pusat": 80,
    "Jakarta Barat": 70,
    "Jakarta Timur": 60,
    "Jakarta Utara": 50,
  };
  return REGION_QUALITY[region] || 50;
}
