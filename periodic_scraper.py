"""
Periodic Price Tracker for Jakarta Housing

Scaffold for building real price history via recurring scraping.
Run monthly via cron to track how listing prices change over time.

Usage:
  python periodic_scraper.py

Cron example (1st of every month at midnight):
  0 0 1 * * cd /path/to/alibaba-hackaton && python periodic_scraper.py

NOTE: This is a scaffold — not run during the hackathon.
      Uses generate_mock_history.py for demo data instead.
"""

import asyncio
import os
from datetime import datetime, timezone

import pandas as pd

import config
from scraper import scrape_detail_from_html, RateLimiter

HISTORY_CSV = "data/price_history.csv"


def load_existing_history():
    """Load existing price history or create empty DataFrame."""
    if os.path.exists(HISTORY_CSV):
        return pd.read_csv(HISTORY_CSV)
    return pd.DataFrame(columns=["property_id", "date", "price"])


def load_tracked_properties():
    """Load the list of properties we're tracking from the clean CSV."""
    df = pd.read_csv(config.OUTPUT_CSV.replace(".csv", "_clean.csv"))
    return df[["property_id", "url", "region"]].dropna(subset=["property_id", "url"])


async def scrape_current_prices(properties_df):
    """Re-scrape current prices for all tracked properties."""
    import httpx

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    limiter = RateLimiter(max_per_second=3)
    results = []

    async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT) as client:
        for _, row in properties_df.iterrows():
            await limiter.acquire()

            try:
                headers = {"User-Agent": config.USER_AGENTS[0]}
                resp = await client.get(row["url"], headers=headers)
                if resp.status_code != 200:
                    print(f"  Skip {row['property_id']}: HTTP {resp.status_code}")
                    continue

                data = scrape_detail_from_html(resp.text, row["url"], row["region"])
                price = data.get("price")
                if price:
                    results.append({
                        "property_id": row["property_id"],
                        "date": today,
                        "price": int(float(price)),
                    })
                    print(f"  {row['property_id']}: Rp {int(float(price)):,}")
            except Exception as e:
                print(f"  Error {row['property_id']}: {e}")

    return results


def update_history(existing_df, new_rows):
    """Append new price data, deduplicate by (property_id, date)."""
    new_df = pd.DataFrame(new_rows)
    combined = pd.concat([existing_df, new_df], ignore_index=True)
    combined = combined.drop_duplicates(
        subset=["property_id", "date"], keep="last"
    )
    combined = combined.sort_values(["property_id", "date"])
    return combined


def main():
    print("=== Periodic Price Tracker ===")
    print(f"Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")

    # Load data
    history = load_existing_history()
    properties = load_tracked_properties()
    print(f"Tracking {len(properties)} properties")
    print(f"Existing history: {len(history)} rows")

    # Scrape current prices
    print("\nScraping current prices...")
    new_rows = asyncio.run(scrape_current_prices(properties))
    print(f"Got {len(new_rows)} prices")

    # Update and save
    updated = update_history(history, new_rows)
    updated.to_csv(HISTORY_CSV, index=False, encoding="utf-8-sig")
    print(f"\nSaved {len(updated)} total rows to {HISTORY_CSV}")

    # Summary
    dates = updated["date"].unique()
    print(f"Snapshots: {len(dates)} dates")
    print(f"Date range: {min(dates)} to {max(dates)}")


if __name__ == "__main__":
    main()
