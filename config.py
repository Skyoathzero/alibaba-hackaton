"""Configuration for Rumah123 Jakarta housing scraper."""

# Regions to scrape (slug -> display name)
REGIONS = {
    "jakarta-selatan": "Jakarta Selatan",
    "jakarta-barat": "Jakarta Barat",
    "jakarta-utara": "Jakarta Utara",
    "jakarta-timur": "Jakarta Timur",
    "jakarta-pusat": "Jakarta Pusat",
}

# How many listings per region (total target = LISTINGS_PER_REGION * 5)
LISTINGS_PER_REGION = 1000
LISTINGS_PER_PAGE = 24

# Concurrency — pure httpx, no browser bottleneck
SEARCH_CONCURRENCY = 15      # parallel requests for search pages
DETAIL_CONCURRENCY = 10      # parallel requests for detail pages
CHECKPOINT_INTERVAL = 200    # save progress every N listings

# Delays — small but present to avoid connection floods
SEARCH_DELAY_MIN = 0.2
SEARCH_DELAY_MAX = 0.5
DETAIL_DELAY_MIN = 0.3
DETAIL_DELAY_MAX = 0.8

# Retry settings
MAX_RETRIES = 5
RETRY_DELAYS = [2, 4, 8, 15, 30]  # seconds — escalating backoff

# Request timeout
REQUEST_TIMEOUT = 20.0  # seconds

# User agents — rotated per request
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
]

# URLs
BASE_URL = "https://www.rumah123.com"
SEARCH_URL_TEMPLATE = BASE_URL + "/jual/{region}/rumah/?page={page}"

# Geocoding (Nominatim — free, no API key)
GEOCODE_CONCURRENCY = 5      # be nice to Nominatim
GEOCODE_DELAY = 1.1          # Nominatim requires >= 1s between requests

# Output
DATA_DIR = "data"
CHECKPOINT_FILE = "data/checkpoint.json"
OUTPUT_CSV = "data/jakarta_housing.csv"
