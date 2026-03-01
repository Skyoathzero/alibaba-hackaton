import { formatPriceShort } from "../utils/scoring";

function KpiBar({ properties }) {
  const total = properties.length;
  const totalValue = properties.reduce((sum, p) => sum + (p._riskData?.currentPrice || 0), 0);
  const avgScore = total > 0
    ? Math.round(properties.reduce((sum, p) => sum + (p._riskData?.score || 0), 0) / total)
    : 0;
  const avgEL = total > 0
    ? properties.reduce((sum, p) => sum + (p._riskData?.elRate || 0), 0) / total
    : 0;

  const approvedCount = properties.filter((p) => p._loan?.decision === "RECOMMEND").length;
  const conditionalCount = properties.filter((p) => p._loan?.decision === "DUE_DILIGENCE").length;
  const declinedCount = properties.filter((p) => p._loan?.decision === "DECLINE").length;
  const totalLoanValue = properties.reduce((sum, p) => sum + (p._loan?.recommendedLoan || 0), 0);

  const cards = [
    { label: "Total Properties", value: total, sub: "In Portfolio" },
    { label: "Portfolio Value", value: formatPriceShort(totalValue), sub: "Total Valuation" },
    {
      label: "Avg EL Rate",
      value: `${(avgEL * 100).toFixed(2)}%`,
      sub: `Score: ${avgScore}/100`,
    },
    { label: "Total Loan Value", value: formatPriceShort(totalLoanValue), sub: "Recommended" },
    {
      label: "Loan Decisions",
      value: `${approvedCount} rec.`,
      sub: `${conditionalCount} DD \u00B7 ${declinedCount} declined`,
      accent: approvedCount > 0,
    },
  ];

  return (
    <div className="kpi-bar">
      {cards.map((card) => (
        <div key={card.label} className={`kpi-card${card.alert ? " kpi-alert" : ""}${card.accent ? " kpi-accent" : ""}`}>
          <div className="kpi-value">{card.value}</div>
          <div className="kpi-label">{card.label}</div>
          <div className="kpi-sub">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}

export default KpiBar;
