#!/usr/bin/env python3
"""
Label news articles using Qwen Flash via Alibaba Cloud DashScope API.

Reads data/articles.csv, classifies each article's category, scope, sentiment,
and confidence using AI, then outputs data/articles_labeled.csv.

Usage:
    export DASHSCOPE_API_KEY="your-key"
    python label_news.py
"""

import csv
import json
import os
import sys
import time
import asyncio
from pathlib import Path
from openai import OpenAI

# ── Config ────────────────────────────────────────────────────

API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
BASE_URL = "https://openrouter.ai/api/v1"
MODEL = "qwen/qwen-turbo"

INPUT_CSV = Path("data/articles.csv")
OUTPUT_CSV = Path("data/articles_labeled.csv")
CHECKPOINT_CSV = Path("data/.label_checkpoint.csv")

BATCH_SIZE = 5
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds, doubles each retry

VALID_CATEGORIES = {"infrastructure", "policy", "market", "disaster", "development", "economy", "environment"}
VALID_SCOPES = {"local", "regional", "national"}
VALID_SENTIMENTS = {"very_positive", "positive", "neutral", "negative", "very_negative"}
VALID_CONFIDENCES = {"high", "medium", "low"}

SYSTEM_PROMPT = """You are a news classification expert for Indonesian real estate and property markets.

For each news article, analyze the title and summary and return a JSON object with exactly these fields:

{
  "category": one of "infrastructure", "policy", "market", "disaster", "development", "economy", "environment",
  "scope": one of "local", "regional", "national",
  "sentiment": one of "very_positive", "positive", "neutral", "negative", "very_negative",
  "confidence": one of "high", "medium", "low"
}

Category definitions:
- infrastructure: transportation, utilities, roads, MRT, airports, power grids
- policy: government regulations, zoning laws, tax changes, permits, KPR rules
- market: property prices, supply/demand, transactions, market trends
- disaster: floods, earthquakes, fires, natural disasters, climate events
- development: new construction projects, urban renewal, housing developments
- economy: GDP, interest rates, inflation, banking, employment, macro indicators
- environment: pollution, green spaces, waste management, environmental impact

Scope definitions:
- local: affects a specific neighborhood or district within a city
- regional: affects a whole city or province (e.g., all of Jakarta)
- national: affects the entire country or multiple provinces

Sentiment definitions:
- very_positive: strongly beneficial for property values and market confidence
- positive: somewhat beneficial
- neutral: no clear positive or negative impact
- negative: somewhat harmful
- very_negative: strongly harmful for property values and market confidence

Return ONLY the JSON object, no other text."""


def classify_article(client: OpenAI, title: str, summary: str) -> dict:
    """Send a single article to Qwen Flash for classification."""
    user_msg = f"Title: {title}\nSummary: {summary}"

    for attempt in range(MAX_RETRIES):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                temperature=0.1,
                max_tokens=200,
            )
            raw = response.choices[0].message.content.strip()

            # Parse JSON (handle markdown code blocks if present)
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            result = json.loads(raw)

            # Validate fields
            category = result.get("category", "").lower().strip()
            scope = result.get("scope", "").lower().strip()
            sentiment = result.get("sentiment", "").lower().strip()
            confidence = result.get("confidence", "").lower().strip()

            return {
                "ai_category": category if category in VALID_CATEGORIES else "economy",
                "ai_scope": scope if scope in VALID_SCOPES else "local",
                "ai_sentiment": sentiment if sentiment in VALID_SENTIMENTS else "neutral",
                "ai_confidence": confidence if confidence in VALID_CONFIDENCES else "medium",
            }

        except (json.JSONDecodeError, KeyError, IndexError) as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (2 ** attempt))
                continue
            print(f"  WARNING: Failed to parse response after {MAX_RETRIES} attempts: {e}")
            return {
                "ai_category": "economy",
                "ai_scope": "local",
                "ai_sentiment": "neutral",
                "ai_confidence": "low",
            }

        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (2 ** attempt))
                continue
            print(f"  WARNING: API error after {MAX_RETRIES} attempts: {e}")
            return {
                "ai_category": "economy",
                "ai_scope": "local",
                "ai_sentiment": "neutral",
                "ai_confidence": "low",
            }


def load_checkpoint() -> dict:
    """Load previously labeled articles from checkpoint file."""
    labeled = {}
    if CHECKPOINT_CSV.exists():
        with open(CHECKPOINT_CSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                labeled[row["article_id"]] = row
    return labeled


def save_checkpoint(labeled: list[dict], fieldnames: list[str]):
    """Save progress to checkpoint file."""
    with open(CHECKPOINT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(labeled)


def main():
    if not API_KEY:
        print("ERROR: Set OPENROUTER_API_KEY environment variable.")
        print("  export OPENROUTER_API_KEY='your-key-here'")
        sys.exit(1)

    if not INPUT_CSV.exists():
        print(f"ERROR: {INPUT_CSV} not found.")
        sys.exit(1)

    # Read input articles
    with open(INPUT_CSV, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        input_fieldnames = reader.fieldnames
        articles = list(reader)

    print(f"Loaded {len(articles)} articles from {INPUT_CSV}")

    # Output fieldnames — drop old scalar sentiment columns, replace with AI labels
    DROP_COLUMNS = {"sentiment_raw", "impact_magnitude", "weighted_sentiment"}
    output_fieldnames = [f for f in input_fieldnames if f not in DROP_COLUMNS] + ["ai_category", "ai_scope", "ai_sentiment", "ai_confidence"]

    # Load checkpoint (previously labeled articles)
    checkpoint = load_checkpoint()
    print(f"Found {len(checkpoint)} previously labeled articles in checkpoint")

    # Initialize API client
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

    # Process articles
    labeled_articles = []
    to_process = []

    for article in articles:
        aid = article["article_id"]
        if aid in checkpoint:
            # Use cached result
            labeled_articles.append(checkpoint[aid])
        else:
            to_process.append(article)
            labeled_articles.append(article)  # placeholder, will be updated

    print(f"Need to classify {len(to_process)} new articles")

    if to_process:
        # Process in batches
        for i in range(0, len(to_process), BATCH_SIZE):
            batch = to_process[i:i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            total_batches = (len(to_process) + BATCH_SIZE - 1) // BATCH_SIZE
            print(f"  Batch {batch_num}/{total_batches} ({len(batch)} articles)...")

            for article in batch:
                title = article.get("title", "")
                summary = article.get("summary", "")
                aid = article["article_id"]

                result = classify_article(client, title, summary)

                # Merge AI labels into article
                labeled = {**article, **result}

                # Update in the labeled_articles list
                for idx, la in enumerate(labeled_articles):
                    if la.get("article_id") == aid and "ai_category" not in la:
                        labeled_articles[idx] = labeled
                        break

                print(f"    {aid}: {result['ai_category']} / {result['ai_scope']} / {result['ai_sentiment']} ({result['ai_confidence']})")

            # Save checkpoint after each batch
            save_checkpoint(labeled_articles, output_fieldnames)
            print(f"  Checkpoint saved ({i + len(batch)}/{len(to_process)} done)")

            # Small delay between batches to avoid rate limits
            if i + BATCH_SIZE < len(to_process):
                time.sleep(1)

    # Write final output (strip old scalar columns)
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=output_fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(labeled_articles)

    print(f"\nDone! Wrote {len(labeled_articles)} labeled articles to {OUTPUT_CSV}")

    # Clean up checkpoint
    if CHECKPOINT_CSV.exists():
        CHECKPOINT_CSV.unlink()
        print("Cleaned up checkpoint file")


if __name__ == "__main__":
    main()
