"""
Export scraped data to CSV.
Can be run standalone or imported by scraper.py.
"""

import json
import os
import re

import pandas as pd

import config

# Column order for the CSV
CSV_COLUMNS = [
    "property_id",
    "url",
    "title",
    "price",
    "price_display",
    "price_currency",
    "property_type",
    "region",
    "district",
    "full_address",
    "latitude",
    "longitude",
    "land_size_sqm",
    "building_size_sqm",
    "bedrooms",
    "bathrooms",
    "maid_bedrooms",
    "maid_bathrooms",
    "floors",
    "carports",
    "garages",
    "condition",
    "certificate_type",
    "furnished_status",
    "electricity_watt",
    "facing_direction",
    "building_material",
    "floor_material",
    "water_source",
    "facilities",
    "agent_name",
    "agent_company",
    "scraped_at",
]


def clean_price(val):
    """Normalize price to integer."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return int(val)
    num = re.sub(r"[^\d]", "", str(val))
    return int(num) if num else None


def clean_numeric(val):
    """Extract integer from string."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return int(val)
    num = re.sub(r"[^\d]", "", str(val))
    return int(num) if num else None


def clean_record(record: dict) -> dict:
    """Normalize a single record for CSV output."""
    cleaned = {}
    for col in CSV_COLUMNS:
        cleaned[col] = record.get(col)

    # Normalize specific fields
    cleaned["price"] = clean_price(cleaned.get("price"))
    for int_field in ["land_size_sqm", "building_size_sqm", "bedrooms", "bathrooms",
                       "maid_bedrooms", "maid_bathrooms", "floors", "carports",
                       "garages", "electricity_watt"]:
        cleaned[int_field] = clean_numeric(cleaned.get(int_field))

    # Extract property_id from URL if missing
    if not cleaned.get("property_id") and cleaned.get("url"):
        match = re.search(r"(ho[srw]\d+)", cleaned["url"])
        if match:
            cleaned["property_id"] = match.group(1)

    return cleaned


def export_csv(results: list[dict], output_path: str = None):
    """Export results list to CSV."""
    if not results:
        print("No results to export.")
        return

    output_path = output_path or config.OUTPUT_CSV
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    cleaned = [clean_record(r) for r in results]
    df = pd.DataFrame(cleaned, columns=CSV_COLUMNS)

    # Drop duplicates by property_id
    before = len(df)
    df = df.drop_duplicates(subset="property_id", keep="first")
    after = len(df)
    if before != after:
        print(f"Removed {before - after} duplicate listings")

    df.to_csv(output_path, index=False, encoding="utf-8-sig")
    print(f"Exported {len(df)} listings to {output_path}")

    # Print summary
    print(f"\nSummary:")
    print(f"  Total listings: {len(df)}")
    print(f"  With full address: {df['full_address'].notna().sum()}")
    print(f"  With price: {df['price'].notna().sum()}")
    print(f"  With coordinates: {df['latitude'].notna().sum()}")
    print(f"  Regions: {df['region'].value_counts().to_dict()}")


def main():
    """Standalone: export from checkpoint file."""
    checkpoint_path = config.CHECKPOINT_FILE
    if not os.path.exists(checkpoint_path):
        print(f"No checkpoint file found at {checkpoint_path}")
        print("Run scraper.py first to collect data.")
        return

    with open(checkpoint_path, "r") as f:
        checkpoint = json.load(f)

    results = checkpoint.get("results", [])
    print(f"Loaded {len(results)} results from checkpoint")
    export_csv(results)


if __name__ == "__main__":
    main()
