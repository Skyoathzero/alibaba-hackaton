import { useState } from "react";
import { formatPriceCompact, getRiskLevel } from "../utils/scoring";

const TENOR_OPTIONS = [3, 5, 7, 10];

const DECISION_CONFIG = {
  RECOMMEND: { label: "Recommend", icon: "\u2713", color: "var(--success)", bg: "var(--success-light)", summary: "Low expected loss — strong collateral position supports lending" },
  DUE_DILIGENCE: { label: "Due Diligence", icon: "!", color: "var(--warning)", bg: "var(--warning-light)", summary: "Moderate expected loss — requires additional review" },
  DECLINE: { label: "Decline", icon: "\u2717", color: "var(--danger)", bg: "var(--danger-light)", summary: "High expected loss or hard-stop trigger — insufficient risk profile" },
};

function formatPct(v) { return `${(v * 100).toFixed(1)}%`; }
function formatPctPrecise(v) { return `${(v * 100).toFixed(2)}%`; }
function formatRatio(v) { return `${v.toFixed(2)}\u00D7`; }

function formatDelta(v) {
  if (v === 0 || v === null || v === undefined) return "0";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}

function metricStatus(val, greenThreshold, amberThreshold, higherIsBetter = true) {
  if (higherIsBetter) {
    if (val >= greenThreshold) return "green";
    if (val >= amberThreshold) return "amber";
    return "red";
  }
  if (val <= greenThreshold) return "green";
  if (val <= amberThreshold) return "amber";
  return "red";
}

function MetricCard({ label, value, note, status }) {
  return (
    <div className={`loan-metric-card loan-metric-${status || "neutral"}`}>
      <span className="loan-metric-label">{label}</span>
      <span className="loan-metric-value">{value}</span>
      {note && <span className="loan-metric-note">{note}</span>}
    </div>
  );
}

// ── EL Decomposition Sub-Components ─────────────────────────

function SubFactorRow({ label, value, note, isPositive }) {
  const color = isPositive === true ? "var(--success)" : isPositive === false ? "var(--danger)" : "var(--text-secondary)";
  return (
    <div className="el-subfactor-row">
      <span className="el-subfactor-label">{label}</span>
      <span className="el-subfactor-value" style={{ color }}>{value}</span>
      {note && <span className="el-subfactor-note">{note}</span>}
    </div>
  );
}

function QuantileMiniBar({ quantiles, currentPrice }) {
  if (!quantiles || !currentPrice) return null;

  const p05 = currentPrice * Math.exp(quantiles.q05);
  const p50 = currentPrice * Math.exp(quantiles.q50);
  const p95 = currentPrice * Math.exp(quantiles.q95);

  const min = p05 * 0.95;
  const max = p95 * 1.05;
  const range = max - min;
  if (range <= 0) return null;

  const pos05 = ((p05 - min) / range) * 100;
  const pos50 = ((p50 - min) / range) * 100;
  const pos95 = ((p95 - min) / range) * 100;

  return (
    <div className="el-quantile-bar">
      <div className="el-quantile-header">12-Month Price Forecast</div>
      <div className="el-quantile-track">
        <div
          className="el-quantile-range"
          style={{ left: `${pos05}%`, width: `${pos95 - pos05}%` }}
        />
        <div className="el-quantile-marker el-q05" style={{ left: `${pos05}%` }} />
        <div className="el-quantile-marker el-q50" style={{ left: `${pos50}%` }} />
        <div className="el-quantile-marker el-q95" style={{ left: `${pos95}%` }} />
      </div>
      <div className="el-quantile-labels">
        <span className="el-quantile-label">q5: {formatPriceCompact(p05)}</span>
        <span className="el-quantile-label el-q50-label">q50: {formatPriceCompact(p50)}</span>
        <span className="el-quantile-label">q95: {formatPriceCompact(p95)}</span>
      </div>
    </div>
  );
}

function ELDecompositionColumns({ elResult }) {
  if (!elResult) return null;

  const { pd, lgd, ead } = elResult;

  return (
    <div className="el-decomp">
      <div className="el-decomp-section-title">EL Decomposition</div>
      <div className="el-decomp-columns">
        {/* PD Column */}
        <div className="el-column el-column-pd">
          <div className="el-column-header">
            <span className="el-column-title">PD</span>
            <span className="el-column-value">{formatPctPrecise(pd.annualPD)}</span>
          </div>
          <div className="el-column-subtitle">Probability of Default</div>
          <div className="el-subfactors">
            <SubFactorRow label="Base (regional)" value={formatPctPrecise(pd.basePD)} />
            <SubFactorRow label="News (AI one-hot)" value={formatDelta(pd.newsAdj)} isPositive={pd.newsAdj < 0} />
            <SubFactorRow label="Certificate" value={formatDelta(pd.certAdj)} isPositive={pd.certAdj < 0} />
            <SubFactorRow label="Macro cycle" value={formatDelta(pd.macroAdj)} isPositive={pd.macroAdj < 0} />
          </div>
        </div>

        {/* LGD Column */}
        <div className="el-column el-column-lgd">
          <div className="el-column-header">
            <span className="el-column-title">LGD</span>
            <span className="el-column-value">{formatPct(lgd.lgd)}</span>
          </div>
          <div className="el-column-subtitle">Loss Given Default</div>
          <div className="el-subfactors">
            <SubFactorRow
              label="Haircut"
              value={lgd.haircut > 0 ? `+${formatPct(lgd.haircut)}` : formatPct(lgd.haircut)}
              note={lgd.haircut > 0.05 ? "overpriced" : lgd.haircut < -0.05 ? "underpriced" : "fair"}
              isPositive={lgd.haircut < 0}
            />
            <SubFactorRow label="Volatility" value={formatPct(lgd.annualizedVol)} note="annualized" isPositive={lgd.annualizedVol < 0.10} />
            <SubFactorRow label="Fire sale" value={formatPct(lgd.fireSaleDiscount || 0.20)} note="forced auction" />
            <SubFactorRow label="Legal costs" value={formatPct(lgd.legalCosts)} note="fixed" />
            <SubFactorRow label="E[Shortfall]" value={`Rp ${formatPriceCompact(lgd.expectedShortfall)}`} />
          </div>
          <QuantileMiniBar quantiles={lgd.quantiles} currentPrice={ead.propertyPrice} />
        </div>

        {/* EAD Column */}
        <div className="el-column el-column-ead">
          <div className="el-column-header">
            <span className="el-column-title">EAD</span>
            <span className="el-column-value">Rp {formatPriceCompact(ead.ead)}</span>
          </div>
          <div className="el-column-subtitle">Exposure at Default</div>
          <div className="el-subfactors">
            <SubFactorRow label="Property value" value={`Rp ${formatPriceCompact(ead.propertyPrice)}`} />
            <SubFactorRow label="Max LTV" value={formatPct(ead.ltv)} />
            <SubFactorRow label="Loan amount" value={`Rp ${formatPriceCompact(ead.ead)}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────

function LoanAssessmentPanel({ assessment, elResult, onOverride, onApprove, approvalStatus }) {
  const a = assessment;
  const d = DECISION_CONFIG[a.decision] || DECISION_CONFIG.DUE_DILIGENCE;

  const [loanInput, setLoanInput] = useState("");
  const isOverridden = a.loanAmount !== a.recommendedLoan || a.tenor !== a.recommendedTenor;

  const currentLTV = a.price > 0 ? a.loanAmount / a.price : 0;
  const maxSliderLTV = Math.min(0.95, a.maxLTV + 0.15);

  const handleLtvSlider = (e) => {
    const ltv = parseFloat(e.target.value) / 100;
    const newLoan = Math.round(a.price * ltv);
    setLoanInput(newLoan.toString());
    onOverride({ loanAmount: newLoan, tenor: a.tenor });
  };

  const handleLoanChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    setLoanInput(raw);
    if (raw && Number(raw) > 0) {
      onOverride({ loanAmount: Number(raw), tenor: a.tenor });
    }
  };

  const handleTenorChange = (t) => {
    onOverride({ loanAmount: a.loanAmount, tenor: t });
  };

  const handleReset = () => {
    setLoanInput("");
    onOverride(null);
  };

  const displayLoan = loanInput || a.loanAmount.toString();

  const ltvPct = Math.round(currentLTV * 100);
  const ltvZone = currentLTV <= a.maxLTV * 0.85 ? "green"
    : currentLTV <= a.maxLTV ? "amber"
    : "red";

  const score = elResult?.score ?? 0;
  const elRate = elResult?.elRate ?? 0;
  const riskLevel = getRiskLevel(score);

  return (
    <div className="loan-panel">
      {/* ═══ Unified Control Block ═══ */}
      <div className="loan-control-block" style={{ borderLeftColor: d.color }}>
        {/* Row 1: Decision + Score */}
        <div className="loan-control-header" style={{ background: d.bg }}>
          <div className="loan-control-decision">
            <div className="loan-hero-icon" style={{ color: d.color }}>{d.icon}</div>
            <div>
              <div className="loan-hero-decision" style={{ color: d.color }}>{d.label}</div>
              <div className="loan-hero-summary">{d.summary}</div>
            </div>
          </div>
          <div className="loan-control-score">
            <div className="el-score-large" style={{ color: riskLevel.color }}>
              {score}<span className="el-score-max">/100</span>
            </div>
            <span className="el-risk-badge" style={{ background: riskLevel.color }}>
              {riskLevel.label}
            </span>
            <span className="el-rate-inline">
              EL: {(elRate * 100).toFixed(3)}%
            </span>
          </div>
        </div>

        {/* Row 2: LTV Slider */}
        <div className="loan-control-ltv">
          <div className="loan-ltv-header">
            <label className="loan-ltv-title">Loan-to-Value</label>
            <span className={`loan-ltv-badge loan-ltv-${ltvZone}`}>
              {ltvPct}% LTV
            </span>
            <span className="loan-ltv-amount">Rp {formatPriceCompact(a.loanAmount)}</span>
            {currentLTV > a.maxLTV && (
              <span className="loan-ltv-warning">Exceeds max LTV</span>
            )}
          </div>
          <div className="loan-ltv-slider-wrap">
            <input
              type="range"
              className={`loan-ltv-slider loan-ltv-slider-${ltvZone}`}
              min="30"
              max={Math.round(maxSliderLTV * 100)}
              step="1"
              value={ltvPct}
              onChange={handleLtvSlider}
            />
            <div className="loan-ltv-marks">
              <span>30%</span>
              <span className="loan-ltv-mark-max">Max {formatPct(a.maxLTV)}</span>
              <span>{Math.round(maxSliderLTV * 100)}%</span>
            </div>
            <div
              className="loan-ltv-max-indicator"
              style={{ left: `${((a.maxLTV * 100 - 30) / (maxSliderLTV * 100 - 30)) * 100}%` }}
            />
          </div>
        </div>

        {/* Row 3: Loan Amount + Tenor */}
        <div className="loan-control-inputs">
          <div className="loan-override-group">
            <label className="loan-override-label">Loan Amount</label>
            <div className="loan-override-input-wrap">
              <span className="loan-override-prefix">Rp</span>
              <input
                type="text"
                className="loan-override-input"
                value={displayLoan}
                onChange={handleLoanChange}
                placeholder={a.recommendedLoan.toString()}
              />
            </div>
          </div>
          <div className="loan-override-group">
            <label className="loan-override-label">Tenor</label>
            <div className="loan-tenor-options">
              {TENOR_OPTIONS.map((t) => (
                <button
                  key={t}
                  className={`loan-tenor-btn${a.tenor === t ? " active" : ""}`}
                  onClick={() => handleTenorChange(t)}
                >
                  {t} yr
                </button>
              ))}
            </div>
          </div>
          {isOverridden && (
            <button className="loan-reset-btn" onClick={handleReset}>Reset</button>
          )}
        </div>

        {/* Row 4: Approve / Decline */}
        <div className="loan-control-actions">
          {approvalStatus === "approved" ? (
            <div className="loan-status-badge loan-status-approved">Approved</div>
          ) : approvalStatus === "declined" ? (
            <div className="loan-status-badge loan-status-declined">Declined</div>
          ) : (
            <>
              <button className="loan-approve-btn" onClick={() => onApprove("approved")}>
                Approve
              </button>
              <button className="loan-decline-btn" onClick={() => onApprove("declined")}>
                Decline
              </button>
            </>
          )}
          {approvalStatus && (
            <button className="loan-undo-btn" onClick={() => onApprove(null)}>Undo</button>
          )}
        </div>
      </div>

      {/* ═══ EL Decomposition Details ═══ */}
      <ELDecompositionColumns elResult={elResult} />

      {/* ═══ Metrics Grid ═══ */}
      <div className="loan-metrics-grid">
        <MetricCard
          label="LTV Current"
          value={formatPct(a.ltvCurrent)}
          note={`Max ${formatPct(a.maxLTV)}`}
          status={metricStatus(a.ltvCurrent, a.maxLTV * 0.9, a.maxLTV, false)}
        />
        <MetricCard
          label="LTV Future (1yr)"
          value={formatPct(a.ltvFuture)}
          note={a.ltvFuture < a.ltvCurrent ? "Improving" : a.ltvFuture > a.ltvCurrent ? "Worsening" : "Stable"}
          status={metricStatus(a.ltvFuture, a.maxLTV * 0.9, a.maxLTV, false)}
        />
        <MetricCard
          label="Collateral"
          value={formatRatio(a.collateralCoverage)}
          note="Coverage ratio"
          status={metricStatus(a.collateralCoverage, 1.5, 1.2)}
        />
        <MetricCard
          label="Monthly Payment"
          value={`Rp ${formatPriceCompact(a.monthly)}`}
          note={`${a.tenor} yr tenor`}
          status="neutral"
        />
        <MetricCard
          label="Interest Rate"
          value={formatPct(a.interestRate)}
          note="Collateral Loan"
          status={metricStatus(a.interestRate, 0.08, 0.10, false)}
        />
        <MetricCard
          label="DSCR"
          value={formatRatio(a.dscr)}
          note="Min 1.00\u00D7"
          status={metricStatus(a.dscr, 1.5, 1.0)}
        />
        <MetricCard
          label="Total Interest"
          value={`Rp ${formatPriceCompact(a.totalInterest)}`}
          note={`Over ${a.tenor} years`}
          status="neutral"
        />
        <MetricCard
          label="Min Income Req."
          value={`Rp ${formatPriceCompact(a.minIncomeRequired)}`}
          note="35% DTI rule"
          status="neutral"
        />
      </div>

      {/* ═══ AI Reasoning ═══ */}
      <div className="loan-reasoning">
        <h4 className="loan-section-title">Assessment Reasoning</h4>
        <ul className="loan-reasoning-list">
          {a.reasoning.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      {/* ═══ Amortization Summary ═══ */}
      {a.amortization.length > 0 && (
        <div className="loan-amortization">
          <h4 className="loan-section-title">Amortization Milestones</h4>
          <table className="loan-amort-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Monthly</th>
                <th>Balance</th>
                <th>Total Paid</th>
                <th>Equity</th>
              </tr>
            </thead>
            <tbody>
              {a.amortization.map((row) => (
                <tr key={row.year}>
                  <td>{row.year}</td>
                  <td>Rp {formatPriceCompact(row.monthlyPayment)}</td>
                  <td>Rp {formatPriceCompact(row.remainingBalance)}</td>
                  <td>Rp {formatPriceCompact(row.totalPaid)}</td>
                  <td>Rp {formatPriceCompact(row.equityBuilt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default LoanAssessmentPanel;
