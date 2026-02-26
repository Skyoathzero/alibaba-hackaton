import { getRiskLevel } from "../utils/scoring";

function RiskScoreGauge({ score }) {
  const { label, color } = getRiskLevel(score);
  const pct = Math.max(0, Math.min(100, score));

  return (
    <div className="risk-gauge">
      <div className="risk-gauge-header">
        <span className="risk-gauge-label" style={{ color }}>{label}</span>
        <span className="risk-gauge-score">{score}<span className="risk-gauge-max">/100</span></span>
      </div>
      <div className="risk-gauge-track">
        <div
          className="risk-gauge-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="risk-gauge-labels">
        <span>High Risk</span>
        <span>Low Risk</span>
      </div>
    </div>
  );
}

export default RiskScoreGauge;
