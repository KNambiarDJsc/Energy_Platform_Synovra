# Research: what transfers to lead-acid revival

Written for Synovra's technical team and whoever builds the models. Checked 18 October 2026 against each source's own page where it could be reached; where it could not, the entry says so. Abstracts and records were read, not full texts, unless noted.

## The short answer

- **No validated system exists for this job.** In these sources there is no agent or model that chooses a lead-acid revival process and shows better commercial yield. Most of the work is on lithium-ion. It covers materials, charging or field ageing, not restoring returned lead-acid units.
- **Data is the bottleneck.** The lead-acid sources and the Nature Reviews perspective say the same thing: data is scarce, every battery differs, and method choice should follow what data exists. That is why this platform starts with records that link intake test → treatment → retest → outcome → cost, not with a model.
- **Agents help with the evidence, not the electrochemistry.** The agent papers are useful for how an agent should work: call verified tools, show its evidence, and keep a person or a lab in the loop. They are not evidence that an agent should run Synovra's equipment.

## How each idea is used here

| Idea | Source | Where it lives in this build | Not taken |
| --- | --- | --- | --- |
| Start with a well-defined label and trustworthy records | Lead-acid mapping study; Nature Reviews perspective | Reason codes on every rework and rejection; point-in-time training view; data-quality capability | A general "battery health" score |
| Survival analysis for sparse, irregular field data | Predictive maintenance with sparse vehicle data | Planned for warranty and return risk once follow-up dates exist (`docs/ML_PLAN.md`, V3) | Training it now: there are no failure dates in the records |
| Impedance as a quick screen before a long capacity test | EIS second-life paper | A test-method question for Synovra's benches: record impedance or conductance next to capacity, then compare | Using a published formula for Synovra's batteries before it is checked on them |
| Diagnose, intervene, retest, and keep the link between them | Sulfation identification and remediation | Before-test, attempt and after-test are linked per battery, with a reason code | Any treatment recipe or charging scheme |
| Agent calls verified tools and shows the evidence | Battery-Sim-Agent; LLMB | The analyst routes a question to a capability, calls named read-only tools, and lists them with the records it used | Letting an agent change parameters on real equipment |
| A person and a lab validate what the agent proposes | ChatBattery | Every suggestion is labelled decision support; qualification stays an engineer's approval | Agent-proposed experiments on production units |
| Battery passport as the data foundation | Nature Reviews perspective | Per-battery identity, append-only history and provenance on every value | Claims that passport data alone improves prediction |

## Lead-acid sources

### A Mapping Study of Machine Learning Methods for Remaining Useful Life Estimation of Lead-Acid Batteries
Chevtchenko, da Silva Rocha, Cruz, Carneiro de Andrade, de Araújo. arXiv:2307.05163, July 2023. [arxiv.org/abs/2307.05163](https://arxiv.org/abs/2307.05163)

- **What it is:** a mapping study of ML for state of health and RUL of lead-acid batteries. It categorises the algorithms, compares accuracy and inference time, and lists common sensor combinations, mostly for vehicle batteries.
- **What transfers:** pick one well-defined target before choosing an algorithm.
- **Limits:** it is a literature map, not a model. The abstract does not quantify data scarcity; read the full text before quoting it on that.

### Predictive Maintenance of Lead-Acid Batteries with Sparse Vehicle Operational Data
Voronov, Krysander, Frisk (Linköping University). *International Journal of Prognostics and Health Management* 11(1), 2020. [papers.phmsociety.org](https://www.papers.phmsociety.org/index.php/ijphm/article/view/2608)

- **What it is:** an LSTM and a Random Survival Forest compared on sparse, irregular readouts from heavy-vehicle workshops, with imputation for missing data. The task is predicting when a battery in service will fail.
- **What transfers:** survival methods for data where many batteries have not failed yet.
- **Limits:** this is field-failure prediction, not revival success. The abstract gives no quantitative results.

### A new lead-acid battery state-of-health evaluation method using electrochemical impedance spectroscopy for second life in rural electrification systems
Mohsin, Picot, Maussion. *Journal of Energy Storage* 52 (2022) 104647. [sciencedirect.com](https://www.sciencedirect.com/science/article/abs/pii/S2352152X22006612). Publisher page blocked automated reading; details from the indexed abstract and highlights.

- **What it is:** a way to estimate the state of health of reused car batteries of unknown history from EIS, called the "CdS based method". The authors attribute ageing 80% to sulphation and 20% to corrosion.
- **What transfers:** a candidate fast screen for batteries that arrive with no history, which is Synovra's intake situation.
- **Limits:** experimental results were not checked here. Any formula must be validated against Synovra's capacity tests on Synovra's battery types and instruments.

### Identification and remediation of sulfation in lead-acid batteries using cell voltage and pressure sensing
Penn State Mechatronics Research Laboratory. *Journal of Power Sources* 221 (2013) 177–185. Publisher page blocked automated reading; from the Penn State record. A 2012 conference version lists Shi, Ferone and Rahn as authors.

- **What it is:** cell voltage and pressure were monitored on new and failed VRLA batteries. One failed cell was sulfated and three were dehydrated. A pressure-feedback desulfation charge recovered the sulfated cell's capacity by 41% with minimal water loss.
- **What transfers:** record the diagnosis per cell, the intervention and the retest, and keep them linked.
- **Limits:** a controlled study of specific VRLA cells. It is not evidence that any process works on other batteries, and no charging scheme is taken from it.

### Predicting battery end of life from solar off-grid system field data using machine learning
Aitio, Howey (University of Oxford). *Joule* 5(12), 3204–3220, December 2021. [ora.ox.ac.uk](https://ora.ox.ac.uk/objects/uuid:8ecbff88-f21a-40da-b36b-532966c81673)

- **What it is:** 1,027 lead-acid batteries in BBOXX solar home systems, each in service for 400–760 days. A probabilistic model predicted end of life with 73% accuracy eight weeks ahead and 82% at the point of failure.
- **What transfers:** a reference for ingesting and analysing operational lead-acid data.
- **Limits:** solar field use, not restoration. For the dataset's licence see `datasets.md`.

### Artificial intelligence for battery reuse, recycling and remanufacturing
Tao, Moura, Brandell, Han, Zou, Zhang, Zhou and others. Perspective, *Nature Reviews Clean Technology* 2(5), 366–381, May 2026. DOI 10.1038/s44359-026-00167-0. Publisher page requires sign-in; from the Chalmers record and press release.

- **What it is:** argues that missing data is the main obstacle to reuse decisions. It suggests matching method to data: physics-based models with no data, field sensing with limited data, and federated learning when data cannot be shared.
- **What transfers:** passports, data curation and method-by-data-availability are the backbone of this platform's plan.
- **Limits:** it centres on lithium-ion. The profit and emissions figures come from the press release, not the paper as read here.

## Agent and adjacent sources

### LLMB: AI agent for lithium metal battery research
KAIST. *ACS Central Science*, 2026, DOI 10.1021/acscentsci.5c02433. The ACS page blocked automated reading; details from R&D World (May 2026) and the 2026 MRS Spring Meeting abstract. **Confirm against the DOI before quoting figures.**

- **What it is:** an LLM plus a graph-digitising tool mined 3,606 papers into a database of 8,074 cells, reported at F1 96.4% for extraction. Models built on it predicted early capacity of NCM cells with R² 0.75 and 0.69.
- **What transfers:** turning scattered documents (bench reports, datasheets, procedures) into structured, cited records with a person confirming each row.
- **Limits:** lithium-metal research literature, not lead-acid operations.

### Battery-Sim-Agent: Leveraging LLM-Agent for Inverse Battery Parameter Estimation
Chen, Gui, Fang, Tao, Zheng, Liu, Bian (Microsoft Research Asia). arXiv preprint, May 2026. [microsoft.com](https://www.microsoft.com/en-us/research/publication/battery-sim-agent-leveraging-llm-agent-for-inverse-battery-parameter-estimation/)

- **What it is:** an LLM agent in a closed loop with a high-fidelity simulator. It reads results, proposes physics-based explanations for mismatches, and suggests parameter changes. It beat baselines including Bayesian optimisation on the authors' benchmark.
- **What transfers:** the agent calls verified tools and reasons over their output; the analyst here does the same with read-only tools.
- **Limits:** a preprint, and parameter estimation in a simulator. It says nothing about controlling hardware.

### Expert-Guided LLM Reasoning for Battery Discovery (ChatBattery)
Liu, Xu, Ai, Li, Bengio, Guo. arXiv:2507.16110, July 2025. [arxiv.org/abs/2507.16110](https://arxiv.org/abs/2507.16110)

- **What it is:** an agentic framework that guided the design of three new lithium-ion cathode materials. They were synthesised and characterised, with reported capacity gains of 28.8%, 25.2% and 18.5% over NMC811.
- **What transfers:** the agent proposes and a lab verifies; nothing counts until it is measured.
- **Limits:** materials discovery for lithium-ion.

## Not verified

These were in the brief. No record of them was found in searchable indexes on 18 October 2026, and their pages could not be read. They are **not used as evidence** anywhere in this repository until someone confirms them from the publisher.

| As cited | Link given | Status |
| --- | --- | --- |
| A method for evaluating the health status of lead-acid batteries based on the incremental drive of pulsed EIS changes (2026) | [S2352152X26016579](https://www.sciencedirect.com/science/article/abs/pii/S2352152X26016579) | Publisher blocked reading; not found by search |
| Agent-coordinated multimodal battery SoH prediction with passport-aligned information (2026) | [S2590123026042106](https://www.sciencedirect.com/science/article/pii/S2590123026042106) | Not found by search. The claims about four NASA cells, synthetic passport text and no significant difference are unconfirmed |
| Explainable agentic AI for autonomous battery health prediction and management (IEEE ICNWC 2026) | [doi.org/10.1109/ICNWC68145.2026.11518403](https://doi.org/10.1109/ICNWC68145.2026.11518403) | DOI resolves to IEEE Xplore, which returned no readable content; not found by search |

Related work that was found while checking, for orientation only: a 2024 *Journal of Energy Storage* study used EIS at three selected frequencies on lead-acid batteries retired from substations, and Kwiecien et al. (*Applied Sciences*, 2018) found single impedance values rise with capacity loss but with slopes that depend on each cell's history.
