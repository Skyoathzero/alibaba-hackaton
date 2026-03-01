/**
 * Loan assessment computation — EL-based decision engine.
 * Indonesian collateral lending (Kredit dengan Jaminan Properti) parameters.
 *
 * Decision model (EL-based):
 *   GREEN  "Recommend"       — EL < 0.5%, strong collateral
 *   YELLOW "Due Diligence"   — 0.5% ≤ EL < 2.5%, moderate risk
 *   RED    "Decline"         — EL ≥ 2.5% or hard-stop triggers
 */

import { elToScore } from "./scoring";

// ── Constants ────────────────────────────────────────────────
const BASE_RATE = 0.085;
const RATE_SPREAD = 0.035;
const INCOME_PRICE_RATIO = 0.01;
const DTI_LIMIT = 0.35;

const CERT_LTV = { SHM: 0.80, HGB: 0.70 };
const DEFAULT_LTV = 0.60;

// EL-based decision thresholds
const EL_RECOMMEND = 0.005;      // EL < 0.5%
const EL_DUE_DILIGENCE = 0.025;  // 0.5% ≤ EL < 2.5%

// ── Deterministic hash for per-property variation ───────────
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

function propertyRandom(propertyId, seed = 0) {
  const h = Math.abs(hashCode(String(propertyId) + String(seed)));
  return (h % 10000) / 10000;
}

// ── Individual computations ─────────────────────────────────

export function computeInterestRate(riskScore) {
  const t = Math.max(0, Math.min(100, riskScore)) / 100;
  return BASE_RATE + RATE_SPREAD - t * RATE_SPREAD * 2;
}

export function computeMaxLTV(certificate, riskScore) {
  const baseLTV = CERT_LTV[certificate] || DEFAULT_LTV;
  const riskPenalty = riskScore < 40 ? 0.10 : riskScore < 60 ? 0.05 : 0;
  return Math.max(0.40, baseLTV - riskPenalty);
}

export function computeRecommendedLoan(price, maxLTV, propertyId) {
  const r = propertyRandom(propertyId, 1);
  const ltvSpread = 0.90 + r * 0.10;  // 90-100% of maxLTV (standard collateral lending)
  const actualLTV = maxLTV * ltvSpread;
  return Math.round(price * actualLTV);
}

export function computeRecommendedTenor(price, riskScore) {
  if (price >= 5e9 && riskScore >= 60) return 10;
  if (price >= 2e9 && riskScore >= 50) return 7;
  if (riskScore >= 40) return 5;
  return 3;
}

export function computeMonthlyPayment(principal, annualRate, tenorYears) {
  if (principal <= 0 || tenorYears <= 0) return 0;
  const r = annualRate / 12;
  const n = tenorYears * 12;
  if (r <= 0) return principal / n;
  return Math.round(principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

export function computeDSCR(monthlyPayment, estimatedIncome) {
  if (monthlyPayment <= 0) return 99;
  return estimatedIncome / monthlyPayment;
}

export function computeCollateralCoverage(propertyPrice, loanAmount) {
  if (loanAmount <= 0) return 99;
  return propertyPrice / loanAmount;
}

// ── EL-Based Decision Engine ────────────────────────────────

export function computeDecisionFromEL(elResult) {
  const { elRate, pd, lgd, ead } = elResult;

  // Hard stops
  if (lgd.lgd > 0.60) return "DECLINE";
  if (pd.annualPD > 0.12) return "DECLINE";
  if (ead.ltv > 0.95) return "DECLINE";

  // EL-based thresholds
  if (elRate < EL_RECOMMEND) return "RECOMMEND";
  if (elRate < EL_DUE_DILIGENCE) return "DUE_DILIGENCE";
  return "DECLINE";
}

// ── EL-Based Reasoning ──────────────────────────────────────

export function generateLoanReasoning(m, elResult) {
  const reasons = [];
  const cert = m.certificate || "Unknown";

  if (elResult) {
    // EL summary
    reasons.push(
      `Expected Loss rate: ${(elResult.elRate * 100).toFixed(3)}% ` +
        `(PD: ${(elResult.pd.annualPD * 100).toFixed(2)}% \u00D7 ` +
        `LGD: ${(elResult.lgd.lgd * 100).toFixed(1)}%)`
    );

    // PD drivers — news one-hot score
    if (elResult.pd.newsAdj > 0.01) {
      reasons.push("Negative news sentiment (AI-scored) raises estimated probability of default.");
    } else if (elResult.pd.newsAdj < -0.005) {
      reasons.push("Positive news sentiment (AI-scored) lowers estimated probability of default.");
    }

    // LGD drivers
    if (elResult.lgd.haircut > 0.10) {
      reasons.push(
        `Property appears ${(elResult.lgd.haircut * 100).toFixed(0)}% overpriced vs feature-based fair value \u2014 higher loss given default.`
      );
    } else if (elResult.lgd.haircut < -0.05) {
      reasons.push(
        `Property is ${(-elResult.lgd.haircut * 100).toFixed(0)}% below fair value \u2014 strong collateral cushion.`
      );
    }

    if (elResult.lgd.annualizedVol > 0.15) {
      reasons.push(
        `High price volatility (${(elResult.lgd.annualizedVol * 100).toFixed(0)}% annualized) increases tail risk.`
      );
    }
  }

  // LTV
  const ltvMargin = m.maxLTV - m.ltvCurrent;
  if (ltvMargin >= 0.15) {
    reasons.push(`LTV of ${(m.ltvCurrent * 100).toFixed(1)}% is well within the ${(m.maxLTV * 100).toFixed(0)}% limit for ${cert} \u2014 comfortable margin.`);
  } else if (ltvMargin >= 0.05) {
    reasons.push(`LTV of ${(m.ltvCurrent * 100).toFixed(1)}% approaches the ${(m.maxLTV * 100).toFixed(0)}% limit for ${cert}.`);
  } else if (m.ltvCurrent <= m.maxLTV) {
    reasons.push(`LTV of ${(m.ltvCurrent * 100).toFixed(1)}% is near the ${(m.maxLTV * 100).toFixed(0)}% ceiling for ${cert} \u2014 minimal buffer.`);
  } else {
    reasons.push(`LTV of ${(m.ltvCurrent * 100).toFixed(1)}% exceeds the ${(m.maxLTV * 100).toFixed(0)}% limit for ${cert}.`);
  }

  // Collateral coverage
  if (m.collateralCoverage >= 1.5) {
    reasons.push(`Excellent collateral coverage (${m.collateralCoverage.toFixed(2)}\u00D7) provides strong loss protection.`);
  } else if (m.collateralCoverage >= 1.2) {
    reasons.push(`Adequate collateral coverage (${m.collateralCoverage.toFixed(2)}\u00D7) with moderate safety margin.`);
  } else {
    reasons.push(`Low collateral coverage (${m.collateralCoverage.toFixed(2)}\u00D7) \u2014 limited recovery in case of default.`);
  }

  // DSCR
  if (m.dscr >= 1.5) {
    reasons.push(`Strong debt service coverage (${m.dscr.toFixed(2)}\u00D7) indicates comfortable repayment capacity.`);
  } else if (m.dscr >= 0.8) {
    reasons.push(`DSCR of ${m.dscr.toFixed(2)}\u00D7 meets minimum threshold but leaves limited buffer.`);
  } else {
    reasons.push(`DSCR of ${m.dscr.toFixed(2)}\u00D7 is below target \u2014 collateral coverage is the primary consideration.`);
  }

  return reasons;
}

export function computeAmortizationSummary(principal, annualRate, tenorYears) {
  const monthly = computeMonthlyPayment(principal, annualRate, tenorYears);
  const r = annualRate / 12;
  const milestones = [1, 5, 10, tenorYears].filter((y, i, arr) => y <= tenorYears && arr.indexOf(y) === i);
  const rows = [];
  let balance = principal;
  let totalPaid = 0;
  let year = 0;
  let nextMilestone = 0;

  for (let m = 1; m <= tenorYears * 12; m++) {
    const interest = balance * r;
    const principalPart = monthly - interest;
    balance = Math.max(0, balance - principalPart);
    totalPaid += monthly;

    if (m % 12 === 0) {
      year++;
      if (nextMilestone < milestones.length && year === milestones[nextMilestone]) {
        rows.push({
          year,
          monthlyPayment: monthly,
          remainingBalance: Math.round(balance),
          totalPaid: Math.round(totalPaid),
          equityBuilt: Math.round(principal - balance),
        });
        nextMilestone++;
      }
    }
  }

  return rows;
}

// ── Master assessment ───────────────────────────────────────

export function computeLoanAssessment(property, elResult, overrides) {
  const price = property.price;
  const cert = property.certificate_type || "Unknown";
  const riskScore = elResult.score;

  const maxLTV = computeMaxLTV(cert, riskScore);
  const recLoan = computeRecommendedLoan(price, maxLTV, property.property_id);
  const recTenor = computeRecommendedTenor(price, riskScore);

  const loanAmount = overrides?.loanAmount ?? recLoan;
  const tenor = overrides?.tenor ?? recTenor;

  // Always recompute EL with actual loan amount as EAD (not max-LTV theoretical exposure)
  let effectiveEL = elResult;
  if (loanAmount !== elResult.ead.ead) {
    const actualEAD = loanAmount;
    const actualLTV = price > 0 ? actualEAD / price : 0;
    // Recompute LGD with actual EAD using shortfall formula
    const lgd = elResult.lgd;
    const L_q05 = lgd.liquidation?.L_q05 ?? 0;
    const L_q50 = lgd.liquidation?.L_q50 ?? 0;
    const L_q95 = lgd.liquidation?.L_q95 ?? 0;
    const S_q05 = Math.max(0, actualEAD - L_q05);
    const S_q50 = Math.max(0, actualEAD - L_q50);
    const S_q95 = Math.max(0, actualEAD - L_q95);
    const expectedShortfall = 0.30 * S_q05 + 0.50 * S_q50 + 0.20 * S_q95;
    const shortfallLGD = actualEAD > 0 ? expectedShortfall / actualEAD : 0;

    // Coverage-based LGD: ensures LGD responds to LTV slider changes
    // even when shortfall is zero (loan < liquidation value)
    const bufferRatio = L_q50 > 0 && actualEAD > 0 ? L_q50 / actualEAD : 999;
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

    const newLGD = actualEAD > 0 ? Math.max(0.05, Math.min(1.0, Math.max(shortfallLGD, coverageLGD))) : 0;
    const newElRate = elResult.pd.annualPD * newLGD;

    effectiveEL = {
      ...elResult,
      elRate: newElRate,
      elAbsolute: newElRate * actualEAD,
      score: elToScore(newElRate),
      lgd: { ...lgd, lgd: newLGD, expectedShortfall, shortfall: { S_q05, S_q50, S_q95 } },
      ead: { ead: actualEAD, ltv: actualLTV, propertyPrice: price },
    };
  }

  const interestRate = computeInterestRate(effectiveEL.score);
  const monthly = computeMonthlyPayment(loanAmount, interestRate, tenor);
  const estimatedIncome = price * INCOME_PRICE_RATIO;
  const dscr = computeDSCR(monthly, estimatedIncome);
  const collateralCoverage = computeCollateralCoverage(price, loanAmount);
  const ltvCurrent = loanAmount / price;
  const predictedPrice = price * (1 + (elResult.growthRate || 0));
  const ltvFuture = predictedPrice > 0 ? loanAmount / predictedPrice : ltvCurrent;
  const totalInterest = monthly * tenor * 12 - loanAmount;
  const minIncomeRequired = Math.round(monthly / DTI_LIMIT);

  const decision = computeDecisionFromEL(effectiveEL);

  const metrics = {
    loanAmount,
    tenor,
    interestRate,
    monthly,
    ltvCurrent,
    ltvFuture,
    maxLTV,
    dscr,
    collateralCoverage,
    totalInterest,
    minIncomeRequired,
    estimatedIncome,
    riskScore: effectiveEL.score,
    certificate: cert,
    decision,
    recommendedLoan: recLoan,
    recommendedTenor: recTenor,
    price,
    predictedPrice,
    elResult: effectiveEL,
  };

  const reasoning = generateLoanReasoning(metrics, effectiveEL);
  const amortization = computeAmortizationSummary(loanAmount, interestRate, tenor);

  return { ...metrics, reasoning, amortization };
}
