# Dataset catalogue

Written for whoever runs experiments outside the platform. Checked 18 October 2026. **No external dataset is bundled in this repository, and none is used to train or evaluate anything here.** Public data is for testing pipelines and methods, kept separate from Synovra's records, with its own lineage. It is never mixed into a Synovra training set.

| Dataset | Chemistry and use | Labels it actually has | Licence (as published) | Commercial use | In this repo |
| --- | --- | --- | --- | --- | --- |
| Oxford / BBOXX solar field data | Lead-acid, 12 V 20 Ah (six 2 V cells), off-grid solar homes in sub-Saharan Africa | Operational field measurements over 400–760 days; end of life as used in the Joule 2021 paper | CC BY-NC; "all rights reserved" copyright statement by BBOXX and Oxford | **No** without permission | No |
| OPzS 1200 Ah bank, charge/discharge | Stationary flooded OPzS cells, six in series (12 V) | Per-cell voltage, temperature, electrolyte density over 14 charge/discharge cycles | CC BY 4.0 on the Zenodo record | Yes, with attribution | No |
| RWTH M5BAT field data | Lead-acid strings (OCSM and OPzV) in a 6 MW hybrid storage plant, Aachen | Unknown | Unknown | Unknown | No |
| Microsoft BatteryML | Tool, not a lead-acid dataset. Supports seven lithium-ion sources (CALCE, MATR, HUST, HNEI, RWTH, SNL, UL_PUR) | RUL benchmarks for lithium-ion | MIT (code); each dataset keeps its own licence | Code yes; data per source | No |

## Details

### Oxford / BBOXX
- Record: [ora.ox.ac.uk/objects/uuid:e41d3d4c-f74e-4d76-81fd-0caa77ec6cec](https://ora.ox.ac.uk/objects/uuid:e41d3d4c-f74e-4d76-81fd-0caa77ec6cec). Creators A. Aitio and D. Howey, University of Oxford, 2021.
- Files: `meta_data.csv`, `GITT_OCV.mpt`, `set_0.zip` to `set_10.zip` (about 78–287 MB each), `zip_to_npy.py`, `LICENSE`, `readme.md.txt`. The contents of the zip archives were not inspected.
- Fit for Synovra: a pipeline and field-ageing benchmark only. It is a different duty cycle (daily solar cycling) and battery size, with no restoration step.

### OPzS 1200 Ah bank
- Record: [zenodo.org/records/17252822](https://zenodo.org/records/17252822), DOI 10.5281/zenodo.17252822. Rocha-Henríquez (ITC), Aguasca Colomo and Méndez (ULPGC). Published 3 October 2025.
- Contents: six CSV archives (one per cell) and a description PDF, 6.9 MB in total. One-minute logging from August 2024 to May 2025, 1,648 hours in all.
- Charge profiles are conventional, PV and wind; discharge profiles are C10, C20, real consumption and random pulses.
- Fit for Synovra: closest to the OPzS family in the demo. Useful for feature engineering on charge/discharge curves, but it is six cells in one controlled setup, not a returned-battery population.
- Note: an earlier brief described this as non-commercial. The Zenodo record says CC BY 4.0. The accompanying paper may carry a different licence, so check before reusing its text or figures.

### RWTH M5BAT
- The brief's link ([publications.rwth-aachen.de/record/1038622](https://publications.rwth-aachen.de/record/1038622)) did not render readable content. No data release, DOI or download page was found.
- What exists: a dissertation analysing M5BAT operation since 2016 (DOI 10.18154/RWTH-2025-06200), and a 2022 Battery-Power abstract on multi-year field measurements of its two lead-acid types.
- Status: treat as unavailable until RWTH confirms access and terms.

### BatteryML
- [github.com/microsoft/BatteryML](https://github.com/microsoft/BatteryML). The repository is archived (read-only). It is the code for an ICLR 2024 paper.
- Useful as a structure for preprocessing, feature extraction and model benchmarking. It is not a lead-acid model, and none of its datasets is lead-acid.

## Rules for using any of these
1. Read the licence on the record before downloading, and again before any commercial use.
2. Keep public data in its own store with its source, version and licence recorded. Never bundle it in this repository.
3. Do not mix it with Synovra's records in one training set. Any transfer from public data must be a separate, written method and evaluated on Synovra's own held-out batteries.
4. A result on public data is a result about that data. Do not present it as a prediction of Synovra's restoration success.
