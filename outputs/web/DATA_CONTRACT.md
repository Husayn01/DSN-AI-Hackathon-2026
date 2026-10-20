# Web data contract

All coordinates are WGS 84 (EPSG:4326). Missing values are null.

## lgas.geojson

`lga_id`, `label`, `lganame`, `statename`, `statecode`, `zone`, `state_rank`, `zone_rank`, `in_priority_set`, `cluster`, `top_decile_freq`, `buildings`, `population`, `underserved_buildings`, `underserved_pop`, `underserved_share`, `unmeasured_share`, `slow_share`, `mean_speed_mbps`, `mean_dist_tower_km`, `far_share`, `mean_rwi`, `health`, `health_underserved`, `schools`, `schools_underserved`, `students`, `students_underserved`, `institution_share`, `service_gap`, `exposure`, `infra_gap`, `need`, `institution_gap`, `priority`, `priority_rank`, `priority_class`

## states.geojson

`statecode`, `statename`, `zone`, `n_lgas`, `buildings`, `population`, `underserved_buildings`, `underserved_pop`, `underserved_share`, `unmeasured_share`, `slow_share`, `mean_speed_mbps`, `mean_dist_tower_km`, `far_share`, `mean_rwi`, `health`, `health_underserved`, `schools`, `schools_underserved`, `students`, `students_underserved`, `institution_share`, `service_gap`, `exposure`, `infra_gap`, `need`, `institution_gap`, `priority`, `priority_rank`, `priority_class`

## zones.geojson

`zone`, `n_lgas`, `buildings`, `population`, `underserved_buildings`, `underserved_pop`, `underserved_share`, `unmeasured_share`, `slow_share`, `mean_speed_mbps`, `mean_dist_tower_km`, `far_share`, `mean_rwi`, `health`, `health_underserved`, `schools`, `schools_underserved`, `students`, `students_underserved`, `institution_share`, `service_gap`, `exposure`, `infra_gap`, `need`, `institution_gap`, `priority`, `priority_rank`, `priority_class`

## tower_sites.geojson

`rank`, `radio`, `lon`, `lat`, `lga_id`, `people_reached`, `cumulative_people`, `cumulative_share`, `lga`, `statename`, `zone`

## facilities_priority.geojson

`kind`, `name`, `level`, `owner`, `status`, `students`, `lga_id`, `lga`

## summary.json

Keys: `parameters`, `national`, `zones`, `states`, `top_lgas`, `settlement_types`, `siting_curve`, `robustness`
