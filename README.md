# Mapping Nigeria's Digital Divide Through Geospatial Data

DSN AI Bootcamp 2026, Geospatial Track | **Team: Terralytica**

## The question

Which communities in Nigeria have poor internet connectivity relative to their population, settlements and socioeconomic needs, and where should connectivity improvements be prioritised?

## Our approach

Ookla speed tiles exist only where someone ran a speed test, so a map of speeds alone shows where people already have service, not where they do not. We start from where people live and ask what connectivity they have.

1. **Settlements and population.** GRID3 settlement blocks (building counts and settlement type) and WorldPop population show where people live.
2. **Service.** Each settlement block is matched to the Ookla tile it falls in. A block with no tile is treated as *unmeasured*, a signal in its own right, and is never filled in with estimated speeds.
3. **Infrastructure and need.** Cell tower locations, the Relative Wealth Index, health facilities and schools add distance to the network, socioeconomic need and anchor institutions.
4. **Priority Index.** Every LGA gets a score from five components: service gap, exposure (underserved people), infrastructure gap, need, and institution gap. The ranking is stress-tested with alternative weights and a stricter measurement rule.
5. **Top-down priority list.** The same index is applied to geopolitical zones, states and LGAs, so the list reads zone, then state, then the LGAs inside the top states. Local Moran's I identifies clusters of high-priority LGAs.
6. **Action.** A greedy maximum-coverage step shortlists the existing cell towers to upgrade first, and reports how many people are beyond the reach of any existing tower and need new sites.

## Repository contents

```
.
|-- README.md
|-- requirements.txt
|-- Mapping Nigeria's Digital Divide Through Geospatial Data.docx.pdf   (challenge guideline)
|-- Data/              input data (large files are not committed, see below)
|-- notebooks/
|   `-- analysis.ipynb the full analysis, from raw data to results
|-- outputs/           maps, charts and tables written by the notebook
|   `-- web/           GeoJSON, JSON and CSV files for the dashboard and web map
`-- cache/             intermediate results (not committed)
```

`outputs/web/` includes a generated `DATA_CONTRACT.md` listing every field in each file.

## How to run

1. Create and activate a Python environment, then install the requirements:

   ```
   python -m venv .venv
   .venv\Scripts\activate          # Windows
   source .venv/bin/activate       # macOS and Linux
   pip install -r requirements.txt
   ```

2. Download the data listed below and place it under `Data/` (see the next section for what is and is not in the repository).
3. Open `notebooks/analysis.ipynb` and run it from the `notebooks/` folder.
4. Optional: set `QUICK_RUN = True` in the settings cell to test the pipeline on the first 500,000 settlement blocks. The full run takes several minutes and caches its main result in `cache/`.

### Interactive Web Application & Decision Platform

To launch the interactive geospatial web dashboard locally:

```bash
python run_web.py
```

This will automatically serve `outputs/web/` at `http://localhost:8000` and open it in your browser. The platform includes:
* **Interactive Map**: LGAs coloured by priority class, with rich tooltips, Moran's I spatial clusters, top 100 tower siting circles, and clustered health & education facilities.
* **KPI Metrics**: Dynamic unmeasured share, count of priority LGAs, underserved health sites, and population reached by top $N$ upgrades.
* **Interactive Controls**: State/Zone filters, priority score slider, and tower upgrade count slider ($N=1\dots100$).
* **Analytics Tabs**: Top 20 LGAs by component breakdown, State rankings chart, tower siting curve, and searchable LGA table with click-to-zoom.

## Data sources

Accessed 20 October 2026.

| Dataset | Provider | Used for | Link |
|---|---|---|---|
| Ookla speed tiles, Nigeria | Ookla (Speedtest open data), provided by the challenge | Measured download, upload, latency and tests | Provided with the challenge |
| LGA boundaries | GRID3 Nigeria | Unit of analysis (774 LGAs) | [GRID3 Data Hub](https://data.grid3.org/datasets/2bb616a49ee84f409427cc2143787113_0) |
| Operational state boundaries | GRID3 Nigeria | State roll-up, geopolitical zones | [GRID3 Data Hub](https://data.grid3.org/datasets/c41532b720504f4799fe20438b7e3b7f_0) |
| Settlement extents (building blocks) | GRID3 Nigeria | Where buildings are, settlement type | [GRID3 Data Hub](https://data.grid3.org/datasets/f705d65c012c46748e6e5f44a33728b1_0) |
| Population count, Nigeria 2020, 100 m, constrained (R2024B) | WorldPop, University of Southampton | People per LGA | [WorldPop](https://data.worldpop.org/GIS/Population/Global_2015_2030/R2024B/2020/NGA/v1/100m/constrained) |
| Health Facilities v2.0 | GRID3 Nigeria | Anchor institutions | [GRID3 Data Hub](https://data.grid3.org/datasets/a0ed9627a8b240ff8b315a84575754a4_0) |
| Schools | GRID3 Nigeria | Anchor institutions | [GRID3 Data Hub](https://data.grid3.org/datasets/8aef208577664f859c44a18f61238a90_0) |
| Relative Wealth Index | Meta Data for Good, via the Humanitarian Data Exchange | Socioeconomic need | [HDX](https://data.humdata.org/dataset/relative-wealth-index/resource/b112d3f9-7a9d-4798-b27d-a505219186aa) |
| Cell tower locations | OpenCelliD | Network infrastructure | [OpenCelliD downloads](https://www.opencellid.org/downloads.php) |

### What is in the repository

The Ookla GeoPackage, the LGA and state boundaries, health facilities, cell towers (filtered to Nigeria) and the wealth index are in `Data/`. The settlement layer (multiple gigabytes), the population raster and the schools shapefile are too large for GitHub, so download them from the links above and place them under `Data/` (the notebook finds them by name). Cell towers were filtered to Nigeria (mobile country code 621) from the global OpenCelliD file.

## Attribution and licences

Please credit the original data providers when reusing any output of this project.

* **Cell tower data from OpenCellID, licensed under CC BY-SA 4.0.** ([OpenCelliD](https://opencellid.org), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)). We filtered the global file to Nigeria and derived distances and a tower upgrade shortlist from it. Outputs derived from this data (including `tower_sites.geojson` and `tower_sites.csv`) are shared under the same licence.
* **Speedtest by Ookla.** Network performance tiles are based on Ookla Speedtest data and are released by Ookla under CC BY-NC-SA 4.0 (non-commercial, share-alike). They were supplied through the challenge, and this project is non-commercial.
* **GRID3.** Settlement extents, LGA and state boundaries, health facilities and schools are from GRID3 (Geo-Referenced Infrastructure and Demographic Data for Development) Nigeria, accessed through the GRID3 Data Hub (data.grid3.org). The data is used under the terms published on each dataset page. The health facilities dataset is a non-exhaustive, non-validated representation of facilities, and incorporates updates from the Nigeria Health Facility Registry.
* **WorldPop.** Population count data from WorldPop (www.worldpop.org), University of Southampton, Global 2015-2030 release R2024B, Nigeria 2020, constrained, 100 m. WorldPop data is licensed under CC BY 4.0.
* **Relative Wealth Index.** Meta Data for Good, shared through the Humanitarian Data Exchange and used under the terms on its dataset page. Method: Chi, G., Fang, H., Chatterjee, S. and Blumenstock, J. E. (2022). Microestimates of wealth for all low- and middle-income countries. *Proceedings of the National Academy of Sciences*, 119(3).

The analysis code in this repository is our own work for the DSN AI Bootcamp 2026 challenge.

## Limitations

* Ookla tiles exist only where tests were run, and many rest on one or two tests. Unmeasured means weak or absent usage, not proof of no signal.
* Underserved people are estimated by sharing each LGA's population in proportion to its underserved buildings.
* OpenCelliD is crowd-sourced, so 3G and 4G towers are probably under-recorded. Tower distance measures proximity to infrastructure, not coverage.
* The Relative Wealth Index is modelled and relative. Student counts are missing for some schools.
* The layers come from different years. The 3 km reach of an upgraded tower is an assumption, and the siting step ignores terrain, power and backhaul.
* The index weights are a judgement. The notebook tests how much the ranking depends on them.

## Team

**Terralytica** — DSN AI Bootcamp 2026, Geospatial Track.
