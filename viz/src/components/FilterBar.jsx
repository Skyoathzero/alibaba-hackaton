function FilterBar({ filter, onFilterChange, regions, propertyCount }) {
  const update = (key, value) => onFilterChange({ ...filter, [key]: value });

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <select value={filter.region} onChange={(e) => update("region", e.target.value)}>
          {regions.map((r) => (
            <option key={r} value={r}>{r === "All" ? "All Regions" : r}</option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Min price (Rp)"
          value={filter.minPrice}
          onChange={(e) => update("minPrice", e.target.value)}
        />
        <input
          type="number"
          placeholder="Max price (Rp)"
          value={filter.maxPrice}
          onChange={(e) => update("maxPrice", e.target.value)}
        />

        <select value={filter.riskLevel} onChange={(e) => update("riskLevel", e.target.value)}>
          <option value="All">All Risk Levels</option>
          <option value="low">Low Risk (70+)</option>
          <option value="medium">Medium Risk (40-69)</option>
          <option value="high">High Risk (&lt;40)</option>
        </select>

        <input
          type="text"
          placeholder="Search address, district..."
          value={filter.search}
          onChange={(e) => update("search", e.target.value)}
          className="search-input"
        />
      </div>

      <span className="filter-count">{propertyCount} properties</span>
    </div>
  );
}

export default FilterBar;
