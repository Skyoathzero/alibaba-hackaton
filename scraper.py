"""
Rumah123 Jakarta Housing Scraper (MVP — Fast Mode)
Pure httpx, no browser. ~20x faster than Playwright version.
Phase 1: Harvest listing URLs from search pages
Phase 2: Scrape detail pages for full data + address
Phase 3: Geocode addresses missing coordinates
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import random
import re
import time
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup

import config


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")


def random_ua() -> str:
    return random.choice(config.USER_AGENTS)


def make_headers() -> dict:
    return {
        "User-Agent": random_ua(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate",
        "Referer": "https://www.rumah123.com/",
    }


def load_checkpoint() -> dict:
    if os.path.exists(config.CHECKPOINT_FILE):
        with open(config.CHECKPOINT_FILE, "r") as f:
            return json.load(f)
    return {"scraped_urls": [], "results": []}


def save_checkpoint(data: dict):
    os.makedirs(config.DATA_DIR, exist_ok=True)
    with open(config.CHECKPOINT_FILE, "w") as f:
        json.dump(data, f, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Phase 1: URL Harvesting
# ---------------------------------------------------------------------------

def parse_search_json_ld(html: str) -> list[dict]:
    """Extract listing URLs and basic data from search page JSON-LD."""
    soup = BeautifulSoup(html, "lxml")
    listings = []

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string)
        except (json.JSONDecodeError, TypeError):
            continue

        items = data if isinstance(data, list) else [data]
        for item in items:
            if item.get("@type") == "SingleFamilyResidence":
                listing = {
                    "url": item.get("url", ""),
                    "latitude": None,
                    "longitude": None,
                    "bedrooms": item.get("numberOfBedrooms"),
                    "bathrooms": item.get("numberOfBathroomsTotal"),
                }
                geo = item.get("geo", {})
                if geo:
                    listing["latitude"] = geo.get("latitude")
                    listing["longitude"] = geo.get("longitude")
                if listing["url"]:
                    listings.append(listing)

    if not listings:
        for a in soup.select('a[href*="/properti/"]'):
            href = a.get("href", "")
            if "/properti/" in href and href not in [l["url"] for l in listings]:
                url = href if href.startswith("http") else config.BASE_URL + href
                listings.append({"url": url})

    return listings


async def harvest_region(client: httpx.AsyncClient, region: str, semaphore: asyncio.Semaphore, limit: int | None = None) -> list[dict]:
    pages_needed = math.ceil(config.LISTINGS_PER_REGION / config.LISTINGS_PER_PAGE)
    if limit:
        pages_needed = math.ceil(limit / config.LISTINGS_PER_PAGE)

    listings = []
    log(f"  Harvesting {region}: up to {pages_needed} pages")

    for page_num in range(1, pages_needed + 1):
        async with semaphore:
            url = config.SEARCH_URL_TEMPLATE.format(region=region, page=page_num)
            for attempt in range(config.MAX_RETRIES):
                try:
                    resp = await client.get(url, headers=make_headers())
                    if resp.status_code == 200:
                        page_listings = parse_search_json_ld(resp.text)
                        listings.extend(page_listings)
                        if page_num % 10 == 0 or page_num == 1:
                            log(f"    {region} p{page_num}/{pages_needed} -> {len(page_listings)} ({len(listings)} total)")
                        break
                    elif resp.status_code == 429:
                        wait = config.RETRY_DELAYS[min(attempt, len(config.RETRY_DELAYS) - 1)]
                        log(f"    429 on {region} p{page_num}, retry in {wait}s")
                        await asyncio.sleep(wait)
                    else:
                        log(f"    {region} p{page_num} -> {resp.status_code}")
                        break
                except Exception as e:
                    if attempt < config.MAX_RETRIES - 1:
                        await asyncio.sleep(config.RETRY_DELAYS[attempt])
                    else:
                        log(f"    Error {region} p{page_num}: {e}")

            await asyncio.sleep(random.uniform(config.SEARCH_DELAY_MIN, config.SEARCH_DELAY_MAX))

        if limit and len(listings) >= limit:
            listings = listings[:limit]
            break

    log(f"  {region}: {len(listings)} URLs")
    return listings


async def harvest_all_urls(limit_per_region: int | None = None) -> list[dict]:
    log("=== Phase 1: URL Harvesting ===")
    semaphore = asyncio.Semaphore(config.SEARCH_CONCURRENCY)

    async with httpx.AsyncClient(follow_redirects=True, timeout=config.REQUEST_TIMEOUT) as client:
        tasks = [harvest_region(client, region, semaphore, limit_per_region) for region in config.REGIONS]
        results = await asyncio.gather(*tasks)

    all_listings = []
    seen_urls = set()
    for region_listings, region in zip(results, config.REGIONS):
        for listing in region_listings:
            if listing["url"] not in seen_urls:
                listing["region"] = region
                all_listings.append(listing)
                seen_urls.add(listing["url"])

    log(f"Total unique URLs: {len(all_listings)}")
    return all_listings


# ---------------------------------------------------------------------------
# Phase 2: Detail Scraping (pure httpx — no browser)
# ---------------------------------------------------------------------------

def _flatten_json_ld(ld_obj) -> list[dict]:
    items = []
    if isinstance(ld_obj, list):
        for item in ld_obj:
            items.extend(_flatten_json_ld(item))
    elif isinstance(ld_obj, dict):
        if "@graph" in ld_obj:
            items.extend(_flatten_json_ld(ld_obj["@graph"]))
        else:
            items.append(ld_obj)
    return items


def parse_detail_json_ld(html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    data = {}

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            ld = json.loads(script.string)
        except (json.JSONDecodeError, TypeError):
            continue

        for item in _flatten_json_ld(ld):
            t = item.get("@type", "")

            if t == "Product":
                data["title"] = item.get("name", "")
                data["property_id"] = item.get("sku", "")
                offers = item.get("offers", {})
                data["price"] = offers.get("price")
                data["price_currency"] = offers.get("priceCurrency", "IDR")
                seller = offers.get("seller", {})
                if seller:
                    data["agent_name"] = seller.get("name", "").strip()

            elif t == "Place":
                addr = item.get("address", {})
                data["full_address"] = addr.get("streetAddress") or ""
                data["district"] = addr.get("addressLocality", "")
                data["region_name"] = addr.get("addressRegion", "")
                geo = item.get("geo", {})
                data["latitude"] = geo.get("latitude")
                data["longitude"] = geo.get("longitude")

            elif t == "SingleFamilyResidence":
                data["bedrooms"] = item.get("numberOfBedrooms")
                data["bathrooms"] = item.get("numberOfBathroomsTotal")
                floor_size = item.get("floorSize", {})
                if isinstance(floor_size, dict):
                    data["building_size_sqm"] = floor_size.get("value")

    return data


def parse_nextjs_data(html: str) -> dict:
    data = {}
    normalized = html.replace('\\"', '"')

    def get_formatted(key):
        m = re.search(rf'"{key}"\s*:\s*\{{[^}}]*?"formattedValue"\s*:\s*"([^"]*)"', normalized)
        return m.group(1) if m else None

    def get_value(key):
        m = re.search(rf'"{key}"\s*:\s*\{{[^}}]*?"value"\s*:\s*"([^"]*)"', normalized)
        return m.group(1) if m else None

    def get_simple(key):
        m = re.search(rf'"{key}"\s*:\s*"([^"]*)"', normalized)
        return m.group(1) if m else None

    data["property_type"] = get_formatted("propertyType")
    data["condition"] = get_formatted("conditions")
    data["certificate_type"] = get_formatted("certification") or get_simple("certificate")
    data["furnished_status"] = get_formatted("furnishing")
    data["facing_direction"] = get_formatted("facing")
    data["building_material"] = get_formatted("buildingMaterials")
    data["floor_material"] = get_formatted("floorMaterials")
    data["water_source"] = get_formatted("waterSource")

    elec = get_formatted("electricity")
    if elec:
        num = re.sub(r"[^\d]", "", elec)
        data["electricity_watt"] = int(num) if num else elec

    for field, key in [
        ("land_size_sqm", "landSize"),
        ("building_size_sqm", "buildingSize"),
        ("bedrooms", "bedrooms"),
        ("bathrooms", "bathrooms"),
        ("maid_bedrooms", "maidBedrooms"),
        ("maid_bathrooms", "maidBathrooms"),
        ("floors", "floors"),
        ("carports", "carports"),
        ("garages", "garages"),
    ]:
        val = get_value(key)
        if val:
            num = re.sub(r"[^\d]", "", val)
            if num:
                data[field] = int(num)

    facilities = []
    for fac_key in ["residentialFacilities", "homeAppliance", "roomFacilities"]:
        val = get_formatted(fac_key)
        if val:
            facilities.append(val)
    if facilities:
        data["facilities"] = ", ".join(facilities)

    val = get_simple("agencyName") or get_simple("organisationName")
    if val:
        data["agent_company"] = val

    m = re.search(r'"(Rp\s+[\d,.]+\s*(?:Juta|Miliar|Ribu)?(?:\s*/\s*\w+)?)"', normalized)
    if m:
        data["price_display"] = m.group(1)

    return {k: v for k, v in data.items() if v is not None}


def extract_address(html: str) -> str:
    """Extract the best available address from page source."""
    normalized = html.replace('\\"', '"')

    # Tier 1: fullAddress from Next.js data
    fa = re.search(r'"fullAddress"\s*:\s*"([^"]+)"', normalized)
    if fa and len(fa.group(1).strip()) > 5:
        return fa.group(1).replace("\\u0026", "&").strip()

    # Tier 2: additionalAddress (district-level)
    aa = re.search(r'"additionalAddress"\s*:\s*"([^"]+)"', normalized)
    if aa and len(aa.group(1).strip()) > 3:
        return aa.group(1).replace("\\u0026", "&").strip()

    return ""


def scrape_detail_from_html(html: str, url: str, region: str) -> dict:
    """Extract all property data from a detail page's HTML. No browser needed."""
    result = parse_detail_json_ld(html)

    nextjs_data = parse_nextjs_data(html)
    for key, val in nextjs_data.items():
        if val is not None and (key not in result or result.get(key) is None):
            result[key] = val

    # Address
    json_ld_address = result.get("full_address", "")
    if not json_ld_address or len(json_ld_address) < 10:
        extracted = extract_address(html)
        if extracted:
            result["full_address"] = extracted

    result["url"] = url
    result["region"] = config.REGIONS.get(region, region)
    result["scraped_at"] = datetime.now(timezone.utc).isoformat()
    return result


async def scrape_one_detail(client: httpx.AsyncClient, listing: dict, semaphore: asyncio.Semaphore) -> dict | None:
    """Fetch and parse one detail page."""
    url = listing["url"]
    region = listing.get("region", "")

    async with semaphore:
        for attempt in range(config.MAX_RETRIES):
            try:
                resp = await client.get(url, headers=make_headers())
                if resp.status_code == 200:
                    if "SingleFamilyResidence" in resp.text or "Product" in resp.text or "propertyType" in resp.text:
                        return scrape_detail_from_html(resp.text, url, region)
                    else:
                        # Got a page but no property data — might be blocked or captcha
                        if attempt < config.MAX_RETRIES - 1:
                            await asyncio.sleep(config.RETRY_DELAYS[attempt])
                            continue
                elif resp.status_code == 429:
                    wait = config.RETRY_DELAYS[min(attempt, len(config.RETRY_DELAYS) - 1)]
                    log(f"    429 on detail, wait {wait}s")
                    await asyncio.sleep(wait)
                    continue
                elif resp.status_code in (404, 410):
                    return None
                elif resp.status_code == 403:
                    await asyncio.sleep(config.RETRY_DELAYS[min(attempt, len(config.RETRY_DELAYS) - 1)])
                    continue
                else:
                    log(f"    Detail {resp.status_code}: {url[-40:]}")
                    break
            except (httpx.ReadTimeout, httpx.ConnectTimeout):
                if attempt < config.MAX_RETRIES - 1:
                    await asyncio.sleep(config.RETRY_DELAYS[attempt])
            except Exception as e:
                if attempt < config.MAX_RETRIES - 1:
                    await asyncio.sleep(config.RETRY_DELAYS[attempt])

        await asyncio.sleep(random.uniform(config.DETAIL_DELAY_MIN, config.DETAIL_DELAY_MAX))
    return None


class RateLimiter:
    """Global token bucket rate limiter shared across all workers."""

    def __init__(self, requests_per_second: float = 3.0):
        self.rps = requests_per_second
        self.interval = 1.0 / requests_per_second
        self._lock = asyncio.Lock()
        self._last_request = 0.0
        self._paused_until = 0.0

    async def acquire(self):
        async with self._lock:
            now = time.time()
            # If globally paused (429 cooldown), wait
            if now < self._paused_until:
                wait = self._paused_until - now
                await asyncio.sleep(wait)
                now = time.time()

            # Enforce minimum interval between requests
            elapsed = now - self._last_request
            if elapsed < self.interval:
                await asyncio.sleep(self.interval - elapsed)
            self._last_request = time.time()

    def backoff(self, seconds: float):
        """Globally pause all workers for N seconds (called on 429)."""
        self._paused_until = max(self._paused_until, time.time() + seconds)

    def speed_up(self):
        """Slightly increase rate on success."""
        self.interval = max(0.2, self.interval * 0.98)

    def slow_down(self):
        """Decrease rate on 429."""
        self.interval = min(3.0, self.interval * 1.3)


async def scrape_all_details(listings: list[dict]) -> list[dict]:
    log(f"=== Phase 2: Detail Scraping ({len(listings)} listings) ===")

    checkpoint = load_checkpoint()
    scraped_urls = set(checkpoint["scraped_urls"])
    results = checkpoint["results"]

    remaining = [l for l in listings if l["url"] not in scraped_urls]
    log(f"  Already scraped: {len(scraped_urls)}, remaining: {len(remaining)}")

    if not remaining:
        return results

    counter = {"done": 0, "failed": 0, "retries_429": 0}
    start_time = time.time()
    limiter = RateLimiter(requests_per_second=3.0)

    # Create a shared client pool
    clients = []
    for i in range(config.DETAIL_CONCURRENCY):
        c = httpx.AsyncClient(
            follow_redirects=True,
            timeout=config.REQUEST_TIMEOUT,
            headers={
                "User-Agent": config.USER_AGENTS[i % len(config.USER_AGENTS)],
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept-Encoding": "gzip, deflate",
                "Referer": "https://www.rumah123.com/",
            },
        )
        clients.append(c)

    queue = asyncio.Queue()
    for l in remaining:
        await queue.put(l)

    async def worker(worker_id: int):
        client = clients[worker_id % len(clients)]
        while not queue.empty():
            try:
                listing = queue.get_nowait()
            except asyncio.QueueEmpty:
                break

            url = listing["url"]
            region = listing.get("region", "")
            success = False

            for attempt in range(config.MAX_RETRIES):
                await limiter.acquire()
                try:
                    resp = await client.get(url, headers={"User-Agent": random_ua()})
                    if resp.status_code == 200 and ("Product" in resp.text or "propertyType" in resp.text):
                        result = scrape_detail_from_html(resp.text, url, region)
                        results.append(result)
                        scraped_urls.add(url)
                        counter["done"] += 1
                        success = True
                        limiter.speed_up()
                        break
                    elif resp.status_code == 429:
                        counter["retries_429"] += 1
                        limiter.slow_down()
                        # Global cooldown — all workers pause
                        cooldown = 3 + attempt * 2
                        limiter.backoff(cooldown)
                        continue
                    elif resp.status_code in (404, 410):
                        break
                    elif resp.status_code == 403:
                        limiter.backoff(5)
                        continue
                    else:
                        await asyncio.sleep(1)
                        break
                except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError):
                    limiter.backoff(2)
                    continue

            if not success:
                counter["failed"] += 1

            done = counter["done"] + counter["failed"]
            if done % 50 == 0 and done > 0:
                elapsed = time.time() - start_time
                rate = done / elapsed * 3600 if elapsed > 0 else 0
                log(f"  Progress: {done}/{len(remaining)} ({counter['done']} ok, {counter['failed']} fail, {counter['retries_429']} 429s) | {rate:.0f}/hr")

            if counter["done"] % config.CHECKPOINT_INTERVAL == 0 and counter["done"] > 0:
                save_checkpoint({"scraped_urls": list(scraped_urls), "results": results})

    workers = [worker(i) for i in range(config.DETAIL_CONCURRENCY)]
    await asyncio.gather(*workers)

    for c in clients:
        await c.aclose()

    save_checkpoint({"scraped_urls": list(scraped_urls), "results": results})
    elapsed = time.time() - start_time
    rate = counter["done"] / elapsed * 3600 if elapsed > 0 else 0
    log(f"=== Phase 2 Complete: {counter['done']} ok, {counter['failed']} failed, {counter['retries_429']} 429s in {elapsed:.0f}s ({rate:.0f}/hr) ===")
    return results


# ---------------------------------------------------------------------------
# Phase 3: Geocoding (address → coordinates)
# ---------------------------------------------------------------------------

async def geocode_address(client: httpx.AsyncClient, address: str, semaphore: asyncio.Semaphore) -> tuple[float, float] | None:
    """Geocode an address using Nominatim (OpenStreetMap). Returns (lat, lng) or None."""
    async with semaphore:
        try:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": address, "format": "json", "limit": 1, "countrycodes": "id"},
                headers={"User-Agent": "Rumah123Scraper/1.0 (student project)"},
            )
            if resp.status_code == 200:
                data = resp.json()
                if data:
                    return float(data[0]["lat"]), float(data[0]["lon"])
        except Exception:
            pass
        finally:
            await asyncio.sleep(config.GEOCODE_DELAY)
    return None


async def geocode_missing(results: list[dict]) -> list[dict]:
    """Geocode results that have an address but missing coordinates."""
    need_geocoding = [
        r for r in results
        if r.get("full_address")
        and len(r.get("full_address", "")) > 10
        and (r.get("latitude") is None or r.get("longitude") is None)
    ]

    if not need_geocoding:
        log("  All listings already have coordinates, skipping geocoding")
        return results

    log(f"=== Phase 3: Geocoding {len(need_geocoding)} addresses ===")
    semaphore = asyncio.Semaphore(config.GEOCODE_CONCURRENCY)

    async with httpx.AsyncClient(timeout=15.0) as client:
        for i, record in enumerate(need_geocoding):
            coords = await geocode_address(client, record["full_address"], semaphore)
            if coords:
                record["latitude"] = coords[0]
                record["longitude"] = coords[1]
                record["geocoded"] = True

            if (i + 1) % 20 == 0:
                log(f"  Geocoded {i + 1}/{len(need_geocoding)}")

    geocoded = sum(1 for r in need_geocoding if r.get("geocoded"))
    log(f"  Geocoded {geocoded}/{len(need_geocoding)} addresses")
    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(description="Rumah123 Jakarta Housing Scraper (Fast)")
    parser.add_argument("--limit", type=int, default=None, help="Limit total listings")
    parser.add_argument("--phase", choices=["harvest", "scrape", "both"], default="both")
    parser.add_argument("--no-geocode", action="store_true", help="Skip geocoding step")
    args = parser.parse_args()

    limit_per_region = None
    if args.limit:
        limit_per_region = math.ceil(args.limit / len(config.REGIONS))
        log(f"Limit mode: {args.limit} total ({limit_per_region}/region)")

    if args.phase in ("harvest", "both"):
        listings = await harvest_all_urls(limit_per_region)
        os.makedirs(config.DATA_DIR, exist_ok=True)
        with open(f"{config.DATA_DIR}/harvested_urls.json", "w") as f:
            json.dump(listings, f, ensure_ascii=False)
        log(f"Saved {len(listings)} URLs")
    else:
        with open(f"{config.DATA_DIR}/harvested_urls.json", "r") as f:
            listings = json.load(f)
        log(f"Loaded {len(listings)} URLs")

    if args.phase in ("scrape", "both"):
        if args.limit:
            listings = listings[:args.limit]
        results = await scrape_all_details(listings)

        # Geocode addresses missing coordinates
        if not args.no_geocode:
            results = await geocode_missing(results)
            save_checkpoint({"scraped_urls": [r["url"] for r in results], "results": results})

        log(f"Total results: {len(results)}")

        from exporter import export_csv
        export_csv(results)


if __name__ == "__main__":
    asyncio.run(main())
