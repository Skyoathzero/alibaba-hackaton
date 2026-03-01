"""
Generate mock amenity count columns for jakarta_housing_clean.csv.

Adds 8 columns representing nearby amenity counts at various radii:
  mall_5km, school_5km, school_2km, hospital_5km, hospital_2km,
  transit_1km, transit_5km, park_5km

Uses region-based density multipliers and a deterministic hash of
property_id for reproducible per-property variation.
"""

import hashlib
import math
import pandas as pd
import shutil

INPUT_CSV = "data/jakarta_housing_clean.csv"
OUTPUT_CSV = "data/jakarta_housing_clean.csv"
PUBLIC_CSV = "viz/public/jakarta_housing_clean.csv"

# Regional amenity density (0-1 scale, higher = more urban/developed)
REGION_DENSITY = {
    "Jakarta Selatan": 0.85,
    "Jakarta Pusat": 0.95,
    "Jakarta Barat": 0.65,
    "Jakarta Timur": 0.55,
    "Jakarta Utara": 0.60,
}

# Column definitions: (column_name, base_count, max_count)
# base_count is multiplied by density_factor to get expected value
AMENITY_COLS = {
    "mall_5km":      (8,  15),
    "school_5km":    (18, 30),
    "school_2km":    (6,  12),
    "hospital_5km":  (10, 18),
    "hospital_2km":  (3,  6),
    "transit_1km":   (4,  8),
    "transit_5km":   (14, 25),
    "park_5km":      (7,  12),
}


def deterministic_random(property_id: str, seed: int = 0) -> float:
    """Hash-based pseudo-random number in [0, 1) for a given property_id + seed."""
    h = hashlib.md5(f"{property_id}_{seed}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def generate_amenity_value(property_id: str, region: str, col_name: str,
                           base_count: int, max_count: int) -> int:
    density = REGION_DENSITY.get(region, 0.60)
    # Per-property variation factor: 0.6 to 1.4
    prop_factor = 0.6 + 0.8 * deterministic_random(property_id, hash(col_name) % 1000)
    expected = density * base_count * prop_factor
    # Add small noise
    noise = (deterministic_random(property_id, hash(col_name) % 1000 + 500) - 0.5) * 2
    value = round(expected + noise)
    return max(0, min(max_count, value))


def main():
    df = pd.read_csv(INPUT_CSV)
    print(f"Loaded {len(df)} properties")

    for col_name, (base_count, max_count) in AMENITY_COLS.items():
        df[col_name] = df.apply(
            lambda row: generate_amenity_value(
                str(row["property_id"]), str(row.get("region", "")),
                col_name, base_count, max_count
            ),
            axis=1,
        )
        print(f"  {col_name}: min={df[col_name].min()}, max={df[col_name].max()}, "
              f"mean={df[col_name].mean():.1f}")

    df.to_csv(OUTPUT_CSV, index=False)
    shutil.copy2(OUTPUT_CSV, PUBLIC_CSV)
    print(f"\nWritten to {OUTPUT_CSV} and {PUBLIC_CSV}")


if __name__ == "__main__":
    main()
