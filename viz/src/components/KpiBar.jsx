import { formatPriceShort } from "../utils/scoring";

function KpiBar({ properties }) {
  const total = properties.length;
  const totalValue = properties.reduce((sum, p) => sum + (p._riskData?.currentPrice || 0), 0);
  const avgScore = total > 0
    ? Math.round(properties.reduce((sum, p) => sum + (p._riskData?.score || 0), 0) / total)
    : 0;
  const avgGrowth = total > 0
    ? (properties.reduce((sum, p) => sum + (p._riskData?.growthPct || 0), 0) / total).toFixed(1)
    : "0.0";
  const highRisk = properties.filter((p) => (p._riskData?.score || 0) < 40).length;
  const highRiskPct = total > 0 ? ((highRisk / total) * 100).toFixed(0) : "0";

  const cards = [
    { label: "Total Properties", value: total, sub: "In Portfolio" },
    { label: "Portfolio Value", value: formatPriceShort(totalValue), sub: "Total Valuation" },
    { label: "Avg Risk Score", value: `${avgScore}/100`, sub: avgScore >= 70 ? "Low Risk" : avgScore >= 40 ? "Medium" : "High Risk" },
    { label: "Avg Growth", value: `+${avgGrowth}%/yr`, sub: "Predicted 1yr" },
    { label: "High Risk", value: `${highRisk} (${highRiskPct}%)`, sub: "Needs Attention", alert: highRisk > 0 },
  ];

  return (
    <div className="kpi-bar">
      {cards.map((card) => (
        <div key={card.label} className={`kpi-card${card.alert ? " kpi-alert" : ""}`}>
          <div className="kpi-value">{card.value}</div>
          <div className="kpi-label">{card.label}</div>
          <div className="kpi-sub">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}

export default KpiBar;
