export const AMENITY_CATEGORIES = [
  {
    id: "education",
    label: "Education",
    color: "#2196F3",
    types: ["school", "university", "primary_school", "secondary_school"],
  },
  {
    id: "healthcare",
    label: "Healthcare",
    color: "#4CAF50",
    types: ["hospital"],
  },
  {
    id: "shopping",
    label: "Shopping",
    color: "#FF9800",
    types: ["shopping_mall"],
  },
  {
    id: "leisure",
    label: "Leisure",
    color: "#E91E63",
    types: [
      "park",
      "bowling_alley",
      "movie_theater",
      "amusement_park",
      "museum",
      "stadium",
      "performing_arts_theater",
      "art_gallery",
      "aquarium",
      "zoo",
      "convention_center",
      "cultural_center",
    ],
  },
  {
    id: "transport",
    label: "Transport",
    color: "#9C27B0",
    types: [
      "transit_station",
      "bus_station",
      "train_station",
      "light_rail_station",
      "subway_station",
      "airport",
    ],
  },
];

const TOP_N = 4;
const DEDUP_RADIUS_M = 150; // meters — places closer than this are considered the same location

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function deduplicateByRadius(places) {
  const kept = [];
  for (const place of places) {
    const tooClose = kept.some(
      (k) =>
        k.latitude &&
        place.latitude &&
        haversineMeters(k.latitude, k.longitude, place.latitude, place.longitude) < DEDUP_RADIUS_M
    );
    if (!tooClose) kept.push(place);
  }
  return kept;
}

const amenityCache = new Map();

function getCacheKey(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export async function fetchNearbyAmenities(lat, lng, apiKey) {
  const cacheKey = getCacheKey(lat, lng);
  if (amenityCache.has(cacheKey)) {
    return amenityCache.get(cacheKey);
  }

  const results = await Promise.allSettled(
    AMENITY_CATEGORIES.map(async (category) => {
      const res = await fetch(
        "https://places.googleapis.com/v1/places:searchNearby",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "places.displayName,places.location,places.types,places.rating,places.userRatingCount,places.formattedAddress",
          },
          body: JSON.stringify({
            includedTypes: category.types,
            maxResultCount: 20,
            locationRestriction: {
              circle: {
                center: { latitude: lat, longitude: lng },
                radius: 50000.0,
              },
            },
          }),
        }
      );

      if (!res.ok) {
        console.warn(`Places API error for ${category.id}:`, res.status);
        return [];
      }

      const data = await res.json();
      const places = (data.places || []).map((place, i) => {
        const pLat = place.location?.latitude;
        const pLng = place.location?.longitude;
        const dist = pLat && pLng ? haversineMeters(lat, lng, pLat, pLng) : 99999;
        return {
          id: `${category.id}-${i}-${pLat}`,
          name: place.displayName?.text || "Unknown",
          category: category.id,
          categoryLabel: category.label,
          color: category.color,
          latitude: pLat,
          longitude: pLng,
          rating: place.rating || null,
          ratingCount: place.userRatingCount || 0,
          address: place.formattedAddress || "",
          distance: dist,
        };
      });

      // Sort by distance, deduplicate overlapping locations, take top N
      places.sort((a, b) => a.distance - b.distance);
      const unique = deduplicateByRadius(places);
      return unique.slice(0, TOP_N);
    })
  );

  const amenities = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  amenityCache.set(cacheKey, amenities);
  return amenities;
}
