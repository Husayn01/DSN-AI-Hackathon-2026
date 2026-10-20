/**
 * Nigeria Digital Divide — Geospatial Decision Platform
 * Interactive Map & Analytics Dashboard
 */

document.addEventListener("DOMContentLoaded", () => {
  const state = {
    summary: null,
    lgasGeo: null,
    statesGeo: null,
    towersGeo: null,
    facilitiesGeo: null,
    lgaLayersById: {},
    filteredLGAs: [],
    selectedLGAId: null,
    currentN: 100,
    currentMinScore: 0,
    selectedZone: "ALL",
    selectedState: "ALL",
    sortCol: "priority_rank",
    sortAsc: true,
    charts: {}
  };

  // Color schemes
  const PRIORITY_COLORS = {
    "Q5 highest": "#8f1d14",
    "Q4": "#d9582b",
    "Q3": "#f29b4b",
    "Q2": "#fcd08a",
    "Q1 lowest": "#fff1d6"
  };

  const CLUSTER_COLORS = {
    "High-High (priority cluster)": "#e11d48",
    "Low-Low": "#3b82f6",
    "High-Low outlier": "#f59e0b",
    "Low-High outlier": "#06b6d4",
    "Not significant": "#475569"
  };

  // Initialize Leaflet Map
  const map = L.map("map", {
    center: [9.0820, 8.6753],
    zoom: 6,
    minZoom: 5,
    maxZoom: 14,
    zoomControl: false
  });

  L.control.zoom({ position: "topright" }).add_to(map);

  // Basemaps
  const positron = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>, OpenStreetMap',
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);

  const darkMatter = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>, OpenStreetMap',
    subdomains: "abcd",
    maxZoom: 19
  });

  L.control.layers({ "Light (Positron)": positron, "Dark (Dark Matter)": darkMatter }, null, { position: "topright" }).addTo(map);

  // Layer groups
  const lgaLayerGroup = L.geoJSON(null, {
    style: styleLGA,
    onEachFeature: onEachLGA
  }).addTo(map);

  const towersLayerGroup = L.layerGroup().addTo(map);
  const healthClusterGroup = L.markerClusterGroup({ disableClusteringAtZoom: 11, maxClusterRadius: 40 });
  const schoolsClusterGroup = L.markerClusterGroup({ disableClusteringAtZoom: 11, maxClusterRadius: 40 });

  // Load all datasets
  Promise.all([
    fetch("summary.json").then(r => r.json()),
    fetch("lgas.geojson").then(r => r.json()),
    fetch("states.geojson").then(r => r.json()),
    fetch("tower_sites.geojson").then(r => r.json()),
    fetch("facilities_priority.geojson").then(r => r.json())
  ]).then(([summary, lgas, states, towers, facilities]) => {
    state.summary = summary;
    state.lgasGeo = lgas;
    state.statesGeo = states;
    state.towersGeo = towers;
    state.facilitiesGeo = facilities;

    initApp();
  }).catch(err => {
    console.error("Error loading web data:", err);
    alert("Could not load dataset files. Please ensure you are serving this from a web server.");
  });

  function initApp() {
    populateDropdowns();
    setupEventListeners();
    updateTowersLayer();
    initFacilitiesLayers();
    filterAndRender();
    initCharts();
    initTabs();
  }

  // Polygon styling
  function styleLGA(feature) {
    const props = feature.properties;
    const isClusterMode = document.getElementById("toggleClusters").checked;
    
    let fillColor;
    if (isClusterMode) {
      fillColor = CLUSTER_COLORS[props.cluster] || "#475569";
    } else {
      fillColor = PRIORITY_COLORS[props.priority_class] || "#94a3b8";
    }

    const matchesFilter = isLGAMatchingFilters(props);
    return {
      fillColor: fillColor,
      weight: matchesFilter ? (props.lga_id === state.selectedLGAId ? 2.5 : 0.8) : 0.3,
      opacity: matchesFilter ? 1 : 0.2,
      color: props.lga_id === state.selectedLGAId ? "#38bdf8" : "#334155",
      fillOpacity: matchesFilter ? (props.in_priority_set ? 0.75 : 0.5) : 0.08
    };
  }

  function isLGAMatchingFilters(props) {
    if (state.selectedZone !== "ALL" && props.zone !== state.selectedZone) return false;
    if (state.selectedState !== "ALL" && props.statename !== state.selectedState) return false;
    if (props.priority < state.currentMinScore) return false;
    return true;
  }

  function onEachLGA(feature, layer) {
    const p = feature.properties;
    state.lgaLayersById[p.lga_id] = layer;

    const tooltipContent = `
      <div style="font-size: 0.78rem;">
        <strong>${p.lganame}</strong>, <span style="color:#94a3b8;">${p.statename}</span><br>
        <span style="color: #38bdf8; font-weight:700;">Priority Score: ${p.priority.toFixed(1)}</span> (Rank #${p.priority_rank})<br>
        Class: <strong>${p.priority_class}</strong> | Cluster: <em>${p.cluster}</em><br>
        Population: <strong>${(p.population || 0).toLocaleString()}</strong><br>
        Underserved Share: <strong>${((p.underserved_share || 0) * 100).toFixed(1)}%</strong> (Unmeasured: ${((p.unmeasured_share || 0) * 100).toFixed(1)}%)<br>
        Mean Tower Distance: <strong>${(p.mean_dist_tower_km || 0).toFixed(1)} km</strong>
      </div>
    `;

    layer.bindTooltip(tooltipContent, { className: "leaflet-tooltip-custom", sticky: true });

    layer.on({
      mouseover: (e) => {
        const l = e.target;
        if (p.lga_id !== state.selectedLGAId) {
          l.setStyle({ weight: 2, color: "#fff" });
        }
      },
      mouseout: (e) => {
        const l = e.target;
        if (p.lga_id !== state.selectedLGAId) {
          lgaLayerGroup.resetStyle(l);
        }
      },
      click: (e) => {
        selectLGA(p.lga_id, true);
      }
    });
  }

  function populateDropdowns() {
    const zones = new Set();
    const states = new Set();

    state.lgasGeo.features.forEach(f => {
      if (f.properties.zone) zones.add(f.properties.zone);
      if (f.properties.statename) states.add(f.properties.statename);
    });

    const zoneSelect = document.getElementById("zoneSelect");
    Array.from(zones).sort().forEach(z => {
      const opt = document.createElement("option");
      opt.value = z;
      opt.textContent = z;
      zoneSelect.appendChild(opt);
    });

    const stateSelect = document.getElementById("stateSelect");
    Array.from(states).sort().forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      stateSelect.appendChild(opt);
    });
  }

  function setupEventListeners() {
    document.getElementById("zoneSelect").addEventListener("change", e => {
      state.selectedZone = e.target.value;
      updateStateDropdown();
      filterAndRender();
    });

    document.getElementById("stateSelect").addEventListener("change", e => {
      state.selectedState = e.target.value;
      filterAndRender();
    });

    const scoreSlider = document.getElementById("scoreSlider");
    const scoreVal = document.getElementById("scoreVal");
    scoreSlider.addEventListener("input", e => {
      state.currentMinScore = Number(e.target.value);
      scoreVal.textContent = state.currentMinScore;
      filterAndRender();
    });

    const towerSlider = document.getElementById("towerSlider");
    const towerCountVal = document.getElementById("towerCountVal");
    towerSlider.addEventListener("input", e => {
      state.currentN = Number(e.target.value);
      towerCountVal.textContent = state.currentN;
      updateTowerKPI();
      updateTowersLayer();
      updateSitingChartCursor();
    });

    // Layer toggles
    document.getElementById("togglePriority").addEventListener("change", e => {
      if (e.target.checked) {
        document.getElementById("toggleClusters").checked = false;
        updateLegend("priority");
      }
      lgaLayerGroup.setStyle(styleLGA);
    });

    document.getElementById("toggleClusters").addEventListener("change", e => {
      if (e.target.checked) {
        document.getElementById("togglePriority").checked = false;
        updateLegend("clusters");
      } else {
        document.getElementById("togglePriority").checked = true;
        updateLegend("priority");
      }
      lgaLayerGroup.setStyle(styleLGA);
    });

    document.getElementById("toggleTowers").addEventListener("change", e => {
      if (e.target.checked) {
        map.addLayer(towersLayerGroup);
      } else {
        map.removeLayer(towersLayerGroup);
      }
    });

    document.getElementById("toggleHealth").addEventListener("change", e => {
      if (e.target.checked) {
        map.addLayer(healthClusterGroup);
      } else {
        map.removeLayer(healthClusterGroup);
      }
    });

    document.getElementById("toggleSchools").addEventListener("change", e => {
      if (e.target.checked) {
        map.addLayer(schoolsClusterGroup);
      } else {
        map.removeLayer(schoolsClusterGroup);
      }
    });

    document.getElementById("btnResetFilters").addEventListener("click", () => {
      state.selectedZone = "ALL";
      state.selectedState = "ALL";
      state.currentMinScore = 0;
      state.currentN = 100;
      document.getElementById("zoneSelect").value = "ALL";
      document.getElementById("stateSelect").value = "ALL";
      document.getElementById("scoreSlider").value = 0;
      document.getElementById("scoreVal").textContent = "0";
      document.getElementById("towerSlider").value = 100;
      document.getElementById("towerCountVal").textContent = "100";
      updateTowerKPI();
      updateTowersLayer();
      filterAndRender();
      map.setView([9.0820, 8.6753], 6);
    });

    // Table search
    document.getElementById("tableSearch").addEventListener("input", e => {
      renderTable(e.target.value);
    });

    // Table sorting
    document.querySelectorAll("table.data-table th").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.getAttribute("data-col");
        if (state.sortCol === col) {
          state.sortAsc = !state.sortAsc;
        } else {
          state.sortCol = col;
          state.sortAsc = true;
        }
        renderTable(document.getElementById("tableSearch").value);
      });
    });
  }

  function updateStateDropdown() {
    const stateSelect = document.getElementById("stateSelect");
    stateSelect.innerHTML = '<option value="ALL">All States</option>';
    
    const states = new Set();
    state.lgasGeo.features.forEach(f => {
      if (state.selectedZone === "ALL" || f.properties.zone === state.selectedZone) {
        if (f.properties.statename) states.add(f.properties.statename);
      }
    });

    Array.from(states).sort().forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      stateSelect.appendChild(opt);
    });
    state.selectedState = "ALL";
  }

  function updateLegend(mode) {
    const title = document.getElementById("legendTitle");
    const container = document.getElementById("legendItems");
    
    if (mode === "clusters") {
      title.textContent = "Moran's I Clusters";
      container.innerHTML = `
        <div class="legend-item"><span class="legend-color" style="background: #e11d48;"></span><span>High-High (Priority Cluster)</span></div>
        <div class="legend-item"><span class="legend-color" style="background: #3b82f6;"></span><span>Low-Low Cold Spot</span></div>
        <div class="legend-item"><span class="legend-color" style="background: #f59e0b;"></span><span>High-Low Outlier</span></div>
        <div class="legend-item"><span class="legend-color" style="background: #06b6d4;"></span><span>Low-High Outlier</span></div>
        <div class="legend-item"><span class="legend-color" style="background: #475569;"></span><span>Not Significant</span></div>
      `;
    } else {
      title.textContent = "Priority Class";
      container.innerHTML = `
        <div class="legend-item"><span class="legend-color" style="background: var(--q5-color);"></span><span>Q5 Highest Priority (Top 20%)</span></div>
        <div class="legend-item"><span class="legend-color" style="background: var(--q4-color);"></span><span>Q4 High Priority</span></div>
        <div class="legend-item"><span class="legend-color" style="background: var(--q3-color);"></span><span>Q3 Medium</span></div>
        <div class="legend-item"><span class="legend-color" style="background: var(--q2-color);"></span><span>Q2 Moderate</span></div>
        <div class="legend-item"><span class="legend-color" style="background: var(--q1-color);"></span><span>Q1 Lowest</span></div>
      `;
    }
  }

  function updateTowerKPI() {
    const curve = state.summary.siting_curve;
    const entry = curve[state.currentN - 1] || curve[curve.length - 1];
    
    document.getElementById("kpiTowersCount").textContent = state.currentN;
    document.getElementById("kpiTowersShare").textContent = (entry.cumulative_share * 100).toFixed(1) + "%";
    
    const popMillions = (entry.cumulative_people / 1e6).toFixed(1) + "M";
    document.getElementById("kpiTowersPeople").textContent = popMillions;
  }

  function updateTowersLayer() {
    towersLayerGroup.clearLayers();
    if (!state.towersGeo) return;

    const visibleTowers = state.towersGeo.features.slice(0, state.currentN);
    visibleTowers.forEach(t => {
      const p = t.properties;
      const coords = [t.geometry.coordinates[1], t.geometry.coordinates[0]];

      // Siting reach radius circle (3 km)
      const circle = L.circle(coords, {
        radius: 3000,
        color: "#0284c7",
        weight: 1,
        fillColor: "#38bdf8",
        fillOpacity: 0.15
      });

      // Center marker
      const marker = L.circleMarker(coords, {
        radius: 5,
        fillColor: "#0284c7",
        color: "#ffffff",
        weight: 1.5,
        fillOpacity: 0.9
      });

      const popupHtml = `
        <div style="font-size: 0.8rem;">
          <strong>Tower Upgrade #${p.rank}</strong> (${p.radio})<br>
          LGA: <strong>${p.lga}</strong> (${p.zone})<br>
          People Reached: <strong>${Math.round(p.people_reached).toLocaleString()}</strong><br>
          Cumulative Reached: <strong>${Math.round(p.cumulative_people).toLocaleString()}</strong> (${(p.cumulative_share * 100).toFixed(2)}%)
        </div>
      `;
      marker.bindPopup(popupHtml);
      circle.bindPopup(popupHtml);

      towersLayerGroup.addLayer(circle);
      towersLayerGroup.addLayer(marker);
    });
  }

  function initFacilitiesLayers() {
    if (!state.facilitiesGeo) return;

    healthClusterGroup.clearLayers();
    schoolsClusterGroup.clearLayers();

    state.facilitiesGeo.features.forEach(f => {
      const p = f.properties;
      const coords = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
      
      const isHealth = p.kind === "health";
      const marker = L.circleMarker(coords, {
        radius: 4,
        fillColor: isHealth ? "#10b981" : "#a855f7",
        color: "#ffffff",
        weight: 1,
        fillOpacity: 0.8
      });

      const popupHtml = `
        <div style="font-size: 0.78rem;">
          <strong>${p.name || 'Unnamed Facility'}</strong><br>
          Type: <strong>${isHealth ? 'Health Facility' : 'School'}</strong> (${p.level || 'Standard'})<br>
          Status: <strong style="color: ${p.status === 'Unmeasured' ? '#f87171' : '#fb923c'}">${p.status}</strong><br>
          Owner: ${p.owner || 'N/A'}<br>
          LGA: ${p.lga}
        </div>
      `;
      marker.bindPopup(popupHtml);

      if (isHealth) {
        healthClusterGroup.addLayer(marker);
      } else {
        schoolsClusterGroup.addLayer(marker);
      }
    });
  }

  function filterAndRender() {
    if (!state.lgasGeo) return;

    // Filter features
    state.filteredLGAs = state.lgasGeo.features
      .map(f => f.properties)
      .filter(p => isLGAMatchingFilters(p));

    // Update map polygons
    lgaLayerGroup.clearLayers();
    lgaLayerGroup.addData(state.lgasGeo);

    // Update KPIs based on active filter
    updateKPIs();

    // Render Table
    renderTable(document.getElementById("tableSearch").value);

    // Update State Ranking Chart
    updateStateChart();
  }

  function updateKPIs() {
    const list = state.filteredLGAs;
    if (list.length === 0) return;

    let totPop = 0;
    let totUnderservedPop = 0;
    let totUnmeasuredShareSum = 0;
    let priorityCount = 0;
    let totHealthUnderserved = 0;

    list.forEach(p => {
      totPop += p.population || 0;
      totUnderservedPop += p.underserved_pop || 0;
      totUnmeasuredShareSum += p.unmeasured_share || 0;
      if (p.in_priority_set) priorityCount++;
      totHealthUnderserved += p.health_underserved || 0;
    });

    const avgUnmeasured = (totUnmeasuredShareSum / list.length) * 100;
    document.getElementById("kpiUnmeasured").textContent = avgUnmeasured.toFixed(1) + "%";
    document.getElementById("kpiPriorityLGAs").textContent = priorityCount;
    document.getElementById("kpiPrioritySub").textContent = `${((priorityCount / list.length) * 100).toFixed(0)}% of filtered (${list.length} LGAs)`;
    document.getElementById("kpiHealth").textContent = totHealthUnderserved.toLocaleString();
  }

  function selectLGA(lgaId, zoomTo = false) {
    state.selectedLGAId = lgaId;
    const feature = state.lgasGeo.features.find(f => f.properties.lga_id === lgaId);
    if (!feature) return;

    const p = feature.properties;
    lgaLayerGroup.setStyle(styleLGA);

    const layer = state.lgaLayersById[lgaId];
    if (layer && zoomTo) {
      map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 11 });
      layer.openTooltip();
    }

    // Populate Sidebar Detail Inspector
    const container = document.getElementById("lgaDetailContainer");
    const badgeClass = `badge-${p.priority_class ? p.priority_class.toLowerCase().replace(" ", "-") : "q1"}`;

    container.innerHTML = `
      <div style="margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <h4 style="font-size: 0.95rem; font-weight: 700; color: #fff;">${p.lganame}</h4>
          <span class="badge ${badgeClass}">${p.priority_class}</span>
        </div>
        <div style="font-size: 0.72rem; color: var(--text-secondary);">${p.statename} State • ${p.zone} Zone</div>
      </div>

      <div class="detail-row"><span>Priority Score</span><strong style="color: #38bdf8;">${p.priority.toFixed(1)} (#${p.priority_rank})</strong></div>
      <div class="detail-row"><span>Population</span><strong>${(p.population || 0).toLocaleString()}</strong></div>
      <div class="detail-row"><span>Underserved Share</span><strong>${((p.underserved_share || 0) * 100).toFixed(1)}%</strong></div>
      <div class="detail-row"><span>Unmeasured Share</span><strong>${((p.unmeasured_share || 0) * 100).toFixed(1)}%</strong></div>
      <div class="detail-row"><span>Mean Tower Dist</span><strong>${(p.mean_dist_tower_km || 0).toFixed(1)} km</strong></div>
      <div class="detail-row"><span>Relative Wealth Index</span><strong>${(p.mean_rwi || 0).toFixed(2)}</strong></div>
      <div class="detail-row"><span>Health Underserved</span><strong style="color: #fb923c;">${p.health_underserved || 0} / ${p.health || 0}</strong></div>
      <div class="detail-row"><span>Schools Underserved</span><strong style="color: #c084fc;">${p.schools_underserved || 0} / ${p.schools || 0}</strong></div>

      <div style="margin-top: 10px; border-top: 1px solid #334155; padding-top: 8px;">
        <span style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">Component Breakdown:</span>
        ${renderProgressBar("Service Gap (30%)", p.service_gap)}
        ${renderProgressBar("Exposure (20%)", p.exposure)}
        ${renderProgressBar("Infrastructure Gap (15%)", p.infra_gap)}
        ${renderProgressBar("Socioeconomic Need (20%)", p.need)}
        ${renderProgressBar("Institution Gap (15%)", p.institution_gap)}
      </div>
    `;

    // Highlight row in table
    document.querySelectorAll("#lgaTableBody tr").forEach(tr => {
      tr.classList.toggle("selected", Number(tr.getAttribute("data-lga-id")) === lgaId);
    });
  }

  function renderProgressBar(label, val) {
    const pct = Math.min(100, Math.max(0, (val || 0) * 100));
    return `
      <div style="margin-top: 4px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.68rem; color: var(--text-secondary);">
          <span>${label}</span>
          <span>${(val || 0).toFixed(2)}</span>
        </div>
        <div style="background: #334155; height: 4px; border-radius: 2px; overflow: hidden;">
          <div style="background: #38bdf8; width: ${pct}%; height: 100%;"></div>
        </div>
      </div>
    `;
  }

  function renderTable(searchQuery = "") {
    const tbody = document.getElementById("lgaTableBody");
    tbody.innerHTML = "";

    const q = searchQuery.toLowerCase().trim();
    let rows = state.filteredLGAs;
    if (q) {
      rows = rows.filter(p => 
        (p.lganame && p.lganame.toLowerCase().includes(q)) || 
        (p.statename && p.statename.toLowerCase().includes(q))
      );
    }

    // Sort
    rows.sort((a, b) => {
      let va = a[state.sortCol];
      let vb = b[state.sortCol];
      if (typeof va === "string") {
        return state.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return state.sortAsc ? (va - vb) : (vb - va);
    });

    document.getElementById("filteredRowCount").textContent = rows.length;

    rows.slice(0, 150).forEach(p => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-lga-id", p.lga_id);
      if (p.lga_id === state.selectedLGAId) tr.classList.add("selected");

      const badgeClass = `badge-${p.priority_class ? p.priority_class.toLowerCase().replace(" ", "-") : "q1"}`;

      tr.innerHTML = `
        <td><strong>#${p.priority_rank}</strong></td>
        <td><strong>${p.lganame}</strong></td>
        <td>${p.statename}</td>
        <td>${p.zone}</td>
        <td><strong style="color: #38bdf8;">${p.priority.toFixed(1)}</strong></td>
        <td><span class="badge ${badgeClass}">${p.priority_class}</span></td>
        <td>${(p.population || 0).toLocaleString()}</td>
        <td>${((p.underserved_share || 0) * 100).toFixed(1)}%</td>
        <td>${((p.unmeasured_share || 0) * 100).toFixed(1)}%</td>
        <td>${(p.mean_dist_tower_km || 0).toFixed(1)}</td>
        <td><span style="color: #fb923c;">${p.health_underserved || 0}</span></td>
        <td><span style="color: #c084fc;">${p.schools_underserved || 0}</span></td>
      `;

      tr.addEventListener("click", () => selectLGA(p.lga_id, true));
      tbody.appendChild(tr);
    });
  }

  // Analytics Tab Switcher
  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        
        btn.classList.add("active");
        const tabId = btn.getAttribute("data-tab");
        document.getElementById(tabId).classList.add("active");

        // Trigger chart resize on tab switch
        Object.values(state.charts).forEach(chart => chart.resize());
      });
    });
  }

  function initCharts() {
    initTop20Chart();
    initStateChart();
    initSitingChart();
  }

  function initTop20Chart() {
    const ctx = document.getElementById("top20Chart").getContext("2d");
    const top20 = state.summary.top_lgas.slice(0, 20);

    // Look up component values for the top 20
    const lgaLookup = {};
    state.lgasGeo.features.forEach(f => {
      lgaLookup[f.properties.label] = f.properties;
    });

    const labels = top20.map(d => d.label.split("(")[0].trim());
    const serviceGap = top20.map(d => (lgaLookup[d.label]?.service_gap || 0) * 0.30);
    const exposure = top20.map(d => (lgaLookup[d.label]?.exposure || 0) * 0.20);
    const infraGap = top20.map(d => (lgaLookup[d.label]?.infra_gap || 0) * 0.15);
    const need = top20.map(d => (lgaLookup[d.label]?.need || 0) * 0.20);
    const instGap = top20.map(d => (lgaLookup[d.label]?.institution_gap || 0) * 0.15);

    state.charts.top20 = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          { label: "Service Gap (30%)", data: serviceGap, backgroundColor: "#ef4444" },
          { label: "Exposure (20%)", data: exposure, backgroundColor: "#f97316" },
          { label: "Infra Gap (15%)", data: infraGap, backgroundColor: "#eab308" },
          { label: "Socioeconomic Need (20%)", data: need, backgroundColor: "#06b6d4" },
          { label: "Institution Gap (15%)", data: instGap, backgroundColor: "#a855f7" }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { color: "#334155" }, ticks: { color: "#94a3b8" } },
          y: { stacked: true, grid: { display: false }, ticks: { color: "#f8fafc", font: { size: 9 } } }
        },
        plugins: {
          legend: { position: "top", labels: { color: "#94a3b8", boxWidth: 10, font: { size: 10 } } }
        }
      }
    });
  }

  function initStateChart() {
    const ctx = document.getElementById("stateRankChart").getContext("2d");
    const states = state.summary.states.slice().sort((a, b) => b.priority - a.priority);

    state.charts.states = new Chart(ctx, {
      type: "bar",
      data: {
        labels: states.map(s => s.state),
        datasets: [{
          label: "State Priority Score",
          data: states.map(s => s.priority),
          backgroundColor: states.map(s => PRIORITY_COLORS[s.priority_class] || "#3b82f6")
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: "#f8fafc", font: { size: 9 }, maxRotation: 45 } },
          y: { grid: { color: "#334155" }, ticks: { color: "#94a3b8" } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  function updateStateChart() {
    if (!state.charts.states) return;
    let states = state.summary.states.slice();
    if (state.selectedZone !== "ALL") {
      states = states.filter(s => s.zone === state.selectedZone);
    }
    states.sort((a, b) => b.priority - a.priority);

    state.charts.states.data.labels = states.map(s => s.state);
    state.charts.states.data.datasets[0].data = states.map(s => s.priority);
    state.charts.states.data.datasets[0].backgroundColor = states.map(s => PRIORITY_COLORS[s.priority_class] || "#3b82f6");
    state.charts.states.update();
  }

  function initSitingChart() {
    const ctx = document.getElementById("sitingCurveChart").getContext("2d");
    const curve = state.summary.siting_curve;

    state.charts.siting = new Chart(ctx, {
      type: "line",
      data: {
        labels: curve.map(d => d.rank),
        datasets: [{
          label: "Cumulative Population Reached (%)",
          data: curve.map(d => (d.cumulative_share * 100)),
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.1)",
          fill: true,
          tension: 0.2,
          pointRadius: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Number of Tower Sites Upgraded", color: "#94a3b8" }, grid: { color: "#334155" }, ticks: { color: "#94a3b8" } },
          y: { title: { display: true, text: "% of Underserved Population Reached", color: "#94a3b8" }, grid: { color: "#334155" }, ticks: { color: "#94a3b8" } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  function updateSitingChartCursor() {
    if (!state.charts.siting) return;
    state.charts.siting.update();
  }

});
