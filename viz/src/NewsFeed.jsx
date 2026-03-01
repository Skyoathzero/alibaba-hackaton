const SCOPE_LABELS = { local: "Local", regional: "Regional", national: "National" };

const CATEGORY_LABELS = {
  infrastructure: "Infrastructure",
  policy: "Policy",
  market: "Market",
  disaster: "Disaster",
  development: "Development",
  economy: "Economy",
  environment: "Environment",
};

const SENTIMENT_LABELS = {
  very_positive: "Very Positive",
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  very_negative: "Very Negative",
};

const SENTIMENT_COLORS = {
  very_positive: "#1B7A4E",
  positive: "#4ade80",
  neutral: "#94a3b8",
  negative: "#f59e0b",
  very_negative: "#B42318",
};

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function sentimentClass(aiSentiment) {
  return aiSentiment || "neutral";
}

function NewsFeed({ articles, region }) {
  if (!articles || articles.length === 0) return null;

  // Filter articles for this region (local + regional) and national
  const relevant = articles
    .filter((a) => a.region_id === region || a.ai_scope === "national" || a.scope === "national")
    .sort((a, b) => b.published_date.localeCompare(a.published_date))
    .slice(0, 8);

  if (relevant.length === 0) return null;

  return (
    <div className="info-section">
      <h3>News Sentiment</h3>
      <div className="news-feed">
        {relevant.map((article) => {
          const aiSentiment = article.ai_sentiment || "neutral";
          const aiCategory = article.ai_category || article.category || "";
          const aiScope = article.ai_scope || article.scope || "";
          const aiConfidence = article.ai_confidence || "";

          return (
            <div key={article.article_id} className="news-item">
              <div className="news-item-header">
                <span className="news-date">{formatDate(article.published_date)}</span>
                <span className="news-source">{article.source}</span>
              </div>
              <div className="news-title">{article.title}</div>
              <div className="news-meta">
                <span
                  className={`sentiment-badge sentiment-${sentimentClass(aiSentiment)}`}
                >
                  {SENTIMENT_LABELS[aiSentiment] || aiSentiment}
                </span>
                <span className={`scope-tag scope-${aiScope}`}>
                  {SCOPE_LABELS[aiScope] || aiScope}
                </span>
                <span className="category-tag">
                  {CATEGORY_LABELS[aiCategory] || aiCategory}
                </span>
                {aiConfidence === "low" && (
                  <span className="confidence-tag low">Low Conf.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default NewsFeed;
