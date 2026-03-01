"""
Generate realistic mock monthly price history for Jakarta housing data.
Produces 36 months (Mar 2023 — Feb 2026) of price data per property.

Logic:
  - Current CSV price = the Feb 2026 endpoint
  - Work backwards using region-specific annual appreciation rates
  - Add monthly Gaussian noise + market event adjustments
  - Each property gets a random growth multiplier for variety
"""

import os
import random
import shutil

import pandas as pd

# Regional annual appreciation rates (min, max)
REGION_GROWTH = {
    "Jakarta Selatan": (0.06, 0.08),
    "Jakarta Pusat": (0.05, 0.07),
    "Jakarta Barat": (0.04, 0.06),
    "Jakarta Timur": (0.03, 0.05),
    "Jakarta Utara": (0.04, 0.06),
}
DEFAULT_GROWTH = (0.04, 0.06)

# Market event adjustments (additive monthly % shifts)
# Keyed by (year, month) — amplified for visible chart correlation
MARKET_EVENTS = {
    # 2023 Q1-Q2: post-pandemic correction dip (sharp)
    (2023, 3): -0.035,
    (2023, 4): -0.025,
    (2023, 5): -0.015,
    (2023, 6): -0.008,
    # 2024 Q3: election bump (strong positive)
    (2024, 7): 0.020,
    (2024, 8): 0.030,
    (2024, 9): 0.020,
}

# Region-specific event adjustments: (region, year, month) -> shift
REGIONAL_EVENTS = {
    # 2024 Q1: Jakarta Utara flood disaster
    ("Jakarta Utara", 2024, 1): -0.025,
    ("Jakarta Utara", 2024, 2): -0.015,
    # 2025 Q2: MRT Phase 2 opening boosts Jakarta Selatan
    ("Jakarta Selatan", 2025, 5): 0.025,
    ("Jakarta Selatan", 2025, 6): 0.015,
}

MONTHS = 36
NOISE_STDDEV = 0.008  # ~0.8% monthly noise (smoother trend, events more visible)
SNAP_TO = 1_000_000   # round prices to nearest 1M Rp

random.seed(42)


def generate_history(property_id, current_price, region):
    """Generate 36 months of price history ending at current_price."""
    growth_range = REGION_GROWTH.get(region, DEFAULT_GROWTH)
    annual_rate = random.uniform(*growth_range)

    # Per-property variation (0.7x to 1.3x of base rate)
    prop_multiplier = random.uniform(0.7, 1.3)
    annual_rate *= prop_multiplier

    monthly_rate = annual_rate / 12

    # Build prices backwards from current (Feb 2026 = month index 35)
    prices = [0.0] * MONTHS
    prices[-1] = float(current_price)

    for i in range(MONTHS - 2, -1, -1):
        year = 2023 + (i + 2) // 12  # month 0 = Mar 2023
        month = ((i + 2) % 12) + 1
        if month > 12:
            month -= 12
            year += 1

        # Base monthly change
        change = monthly_rate

        # Market event adjustment (national)
        event = MARKET_EVENTS.get((year, month), 0.0)
        change += event

        # Regional event adjustment
        regional_event = REGIONAL_EVENTS.get((region, year, month), 0.0)
        change += regional_event

        # Gaussian noise
        noise = random.gauss(0, NOISE_STDDEV)
        change += noise

        # prices[i+1] = prices[i] * (1 + change)
        # so prices[i] = prices[i+1] / (1 + change)
        prices[i] = prices[i + 1] / (1 + change)

    # Generate dates and snap prices
    rows = []
    for i in range(MONTHS):
        # month 0 = Mar 2023, month 35 = Feb 2026
        m = 3 + i  # starting from March
        year = 2023 + (m - 1) // 12
        month = ((m - 1) % 12) + 1
        date_str = f"{year}-{month:02d}-01"

        snapped = round(prices[i] / SNAP_TO) * SNAP_TO
        snapped = max(snapped, SNAP_TO)  # floor at 1M

        rows.append({
            "property_id": property_id,
            "date": date_str,
            "price": int(snapped),
        })

    return rows


def main():
    input_csv = "data/jakarta_housing_clean.csv"
    output_csv = "data/price_history.csv"
    viz_public = "viz/public/price_history.csv"

    df = pd.read_csv(input_csv)
    print(f"Loaded {len(df)} properties")

    all_rows = []
    for _, row in df.iterrows():
        pid = row["property_id"]
        price = row.get("price")
        region = row.get("region", "")

        if pd.isna(price) or price <= 0:
            continue

        history = generate_history(pid, price, region)
        all_rows.extend(history)

    out = pd.DataFrame(all_rows)
    out.to_csv(output_csv, index=False, encoding="utf-8-sig")
    print(f"Generated {len(out)} rows -> {output_csv}")

    # Copy to viz public folder
    os.makedirs(os.path.dirname(viz_public), exist_ok=True)
    shutil.copy2(output_csv, viz_public)
    print(f"Copied to {viz_public}")

    # Summary
    print(f"\nProperties: {out['property_id'].nunique()}")
    print(f"Date range: {out['date'].min()} to {out['date'].max()}")
    print(f"Price range: Rp {out['price'].min():,.0f} to Rp {out['price'].max():,.0f}")


if __name__ == "__main__":
    main()
