"""
Clean jakarta_housing.csv:
  - Drop rows with more than 4 empty columns
  - Drop rows missing latitude or longitude
"""

import pandas as pd
import config

def main():
    df = pd.read_csv(config.OUTPUT_CSV)
    total = len(df)
    print(f"Loaded {total} rows")

    # Drop rows missing geolocation
    before = len(df)
    df = df.dropna(subset=["latitude", "longitude"])
    dropped_geo = before - len(df)

    # Drop rows with more than 4 empty columns
    before = len(df)
    df = df[df.isna().sum(axis=1) <= 5]
    dropped_empty = before - len(df)

    out = config.OUTPUT_CSV.replace(".csv", "_clean.csv")
    df.to_csv(out, index=False, encoding="utf-8-sig")

    print(f"Dropped {dropped_geo} rows missing geolocation")
    print(f"Dropped {dropped_empty} rows with >4 empty columns")
    print(f"Kept {len(df)}/{total} rows -> {out}")

    # Show remaining nulls summary
    nulls = df.isna().sum()
    if nulls.any():
        print("\nRemaining nulls per column:")
        for col, n in nulls[nulls > 0].items():
            print(f"  {col}: {n} ({n/len(df)*100:.0f}%)")


if __name__ == "__main__":
    main()
