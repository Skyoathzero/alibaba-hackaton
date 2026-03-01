#!/usr/bin/env python3
"""
Preprocess AI-labeled news articles into one-hot encoded scores.

Reads data/articles_labeled.csv, computes per-article impact scores using
a fixed weight vector dot product on one-hot encoded features, then aggregates
per region/month for the web app.

Outputs:
  - data/news_scores.csv (per-region, per-month aggregated scores)
  - Copies articles_labeled.csv and news_scores.csv to viz/public/

Usage:
    python preprocess_news_scores.py
"""

import csv
import shutil
from collections import defaultdict
from pathlib import Path

# ── Config ────────────────────────────────────────────────────

INPUT_CSV = Path("data/articles_labeled.csv")
OUTPUT_SCORES_CSV = Path("data/news_scores.csv")
VIZ_PUBLIC = Path("viz/public")

# ── Weight Vectors ────────────────────────────────────────────

# Category weights: base impact magnitude (always positive, direction from sentiment)
CATEGORY_WEIGHTS = {
    "infrastructure": 0.030,
    "development":    0.030,
    "policy":         0.025,
    "market":         0.020,
    "economy":        0.020,
    "environment":    0.020,
    "disaster":       0.050,
}

# Scope multipliers: how far-reaching the impact is
SCOPE_MULTIPLIERS = {
    "local":    1.0,
    "regional": 1.5,
    "national": 2.5,
}

# Sentiment weights: direction and magnitude
SENTIMENT_WEIGHTS = {
    "very_positive": +2.0,
    "positive":      +1.0,
    "neutral":        0.0,
    "negative":      -1.0,
    "very_negative": -2.0,
}


def compute_article_impact(category: str, scope: str, sentiment: str) -> float:
    """Compute impact score for a single article using one-hot dot product."""
    cat_w = CATEGORY_WEIGHTS.get(category, 0.020)
    scope_m = SCOPE_MULTIPLIERS.get(scope, 1.0)
    sent_w = SENTIMENT_WEIGHTS.get(sentiment, 0.0)
    return cat_w * scope_m * sent_w


def get_month_key(date_str: str) -> str:
    """Extract YYYY-MM from a date string."""
    if not date_str or len(date_str) < 7:
        return "unknown"
    return date_str[:7]


def most_common(items: list) -> str:
    """Return the most common item in a list."""
    if not items:
        return ""
    counts = defaultdict(int)
    for item in items:
        counts[item] += 1
    return max(counts, key=counts.get)


def main():
    if not INPUT_CSV.exists():
        print(f"ERROR: {INPUT_CSV} not found. Run label_news.py first.")
        return

    # Read labeled articles
    with open(INPUT_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        articles = list(reader)

    print(f"Loaded {len(articles)} labeled articles from {INPUT_CSV}")

    # Compute per-article impact scores and add to articles
    for article in articles:
        category = article.get("ai_category", "economy")
        scope = article.get("ai_scope", "local")
        sentiment = article.get("ai_sentiment", "neutral")
        article["impact_score"] = compute_article_impact(category, scope, sentiment)

    # Write updated articles with impact_score back
    article_fieldnames = list(articles[0].keys())
    labeled_output = Path("data/articles_labeled.csv")
    with open(labeled_output, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=article_fieldnames)
        writer.writeheader()
        writer.writerows(articles)
    print(f"Updated {labeled_output} with impact_score column")

    # Aggregate by region + month
    # Key: (region_id, month) -> list of impacts
    aggregation = defaultdict(lambda: {
        "impacts": [],
        "categories": [],
        "sentiments": [],
        "sentiment_counts": defaultdict(int),
    })

    for article in articles:
        region = article.get("region_id", "").strip()
        month = get_month_key(article.get("published_date", ""))

        # For national-scope articles, add to all regions
        scope = article.get("ai_scope", article.get("scope", "local"))
        if scope == "national" or not region:
            regions_to_add = [
                "Jakarta Selatan", "Jakarta Pusat",
                "Jakarta Barat", "Jakarta Timur", "Jakarta Utara"
            ]
        else:
            regions_to_add = [region]

        for r in regions_to_add:
            key = (r, month)
            aggregation[key]["impacts"].append(article["impact_score"])
            aggregation[key]["categories"].append(article.get("ai_category", "economy"))
            sentiment = article.get("ai_sentiment", "neutral")
            aggregation[key]["sentiments"].append(sentiment)
            aggregation[key]["sentiment_counts"][sentiment] += 1

    # Build output rows
    score_rows = []
    for (region_id, month), data in sorted(aggregation.items()):
        impacts = data["impacts"]
        mean_impact = sum(impacts) / len(impacts) if impacts else 0.0
        sum_impact = sum(impacts)
        article_count = len(impacts)
        dominant_category = most_common(data["categories"])
        dominant_sentiment = most_common(data["sentiments"])

        # Frequency-weighted sentiment score:
        # Weight: very_positive=3, positive=1, neutral=0, negative=-1, very_negative=-3
        FREQ_WEIGHTS = {
            "very_positive": 3.0,
            "positive": 1.0,
            "neutral": 0.0,
            "negative": -1.0,
            "very_negative": -3.0,
        }
        sent_counts = data["sentiment_counts"]
        freq_score = sum(
            FREQ_WEIGHTS.get(s, 0) * count
            for s, count in sent_counts.items()
        ) / max(article_count, 1)

        score_rows.append({
            "region_id": region_id,
            "month": month,
            "mean_impact": round(mean_impact, 6),
            "sum_impact": round(sum_impact, 6),
            "freq_sentiment_score": round(freq_score, 4),
            "article_count": article_count,
            "n_very_positive": sent_counts.get("very_positive", 0),
            "n_positive": sent_counts.get("positive", 0),
            "n_neutral": sent_counts.get("neutral", 0),
            "n_negative": sent_counts.get("negative", 0),
            "n_very_negative": sent_counts.get("very_negative", 0),
            "dominant_category": dominant_category,
            "dominant_sentiment": dominant_sentiment,
        })

    # Write news_scores.csv
    score_fieldnames = ["region_id", "month", "mean_impact", "sum_impact",
                        "freq_sentiment_score", "article_count",
                        "n_very_positive", "n_positive", "n_neutral",
                        "n_negative", "n_very_negative",
                        "dominant_category", "dominant_sentiment"]

    with open(OUTPUT_SCORES_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=score_fieldnames)
        writer.writeheader()
        writer.writerows(score_rows)

    print(f"Wrote {len(score_rows)} region/month rows to {OUTPUT_SCORES_CSV}")

    # Print summary stats
    all_impacts = [a["impact_score"] for a in articles]
    print(f"\nArticle impact stats:")
    print(f"  Min:  {min(all_impacts):.4f}")
    print(f"  Max:  {max(all_impacts):.4f}")
    print(f"  Mean: {sum(all_impacts) / len(all_impacts):.4f}")

    # Count by category
    cat_counts = defaultdict(int)
    sent_counts = defaultdict(int)
    scope_counts = defaultdict(int)
    for a in articles:
        cat_counts[a.get("ai_category", "?")] += 1
        sent_counts[a.get("ai_sentiment", "?")] += 1
        scope_counts[a.get("ai_scope", "?")] += 1

    print(f"\nCategory distribution:")
    for k, v in sorted(cat_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")
    print(f"\nSentiment distribution:")
    for k, v in sorted(sent_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")
    print(f"\nScope distribution:")
    for k, v in sorted(scope_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")

    # Copy to viz/public/
    VIZ_PUBLIC.mkdir(parents=True, exist_ok=True)
    shutil.copy2(labeled_output, VIZ_PUBLIC / "articles_labeled.csv")
    shutil.copy2(OUTPUT_SCORES_CSV, VIZ_PUBLIC / "news_scores.csv")
    print(f"\nCopied files to {VIZ_PUBLIC}/")


if __name__ == "__main__":
    main()
