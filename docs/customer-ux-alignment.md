# Customer UX and data strategy: where the prototype stands

This maps two direction documents onto the prototype, section by section:

- **SYNOVRA OS: Product, Customer Experience and Connected Hardware Vision** (the "UX vision", 73 sections)
- **Synovra Battery Data and Intelligence Strategy**, 19 October 2026 (the "data strategy")

Each line says what exists, what is partial, and what is deliberately not built, with the reason. Everything in the prototype runs on synthetic data.

## Where the two documents disagree, and what the prototype does

| Topic | UX vision | Data strategy | Prototype |
| --- | --- | --- | --- |
| Health number | "Health 72", "95% healthy" ring (§14, §19, §20) | No universal health score without a validated model; show "baseline not established" (§01, §06) | **No score.** A status (Good, Watching, Needs attention, Baseline being established, Out of service) from fixed, versioned rules, with every reason listed. The home ring shows how many batteries are in each status. |
| Replacement window | "3–6 months" on the twin and in the portfolio (§16, §19) | Only after survival analysis with follow-up data (§07) | Shown as **"Not estimated"** on the passport. The column is left out of the portfolio rather than filled with blanks. |
| Plate health | Modelled crystal build-up on the plates (§24) | No model yet; a resistance or capacity value is not a plate diagnosis (§10) | Shown as **"Not modelled"**, labelled with the "modelled" data kind, so the gap is visible. |
| Monitoring hardware | Early phase (§42) | Phase 2 in the original OS; a product-owner decision (§01) | Telemetry is **simulated** and labelled so. Nothing is connected. |
| Words | Avoid "restored", "refurbished", "revived" (§37) | Uses "restoration attempt" as the internal record term (§03) | New customer-facing views (home, status, the before-and-after section) avoid those words. Internal screens keep "Restoration", the original OS term. **Needs a decision** before any customer launch. |
| Model alerts | n/a | Models run in shadow mode and do not drive decisions (§08) | A shadow-mode model alert **never changes a battery's status**, for any reader. It still appears for review. |

## What was built for this

- **Status rule**: `src/domain/status.ts`, version `battery-status 0.1.0`. It is pure and tested. It decides the status, the one-line reason, the next step and an urgency order from:
  - the last approved test (attention below 85% of rated, the same as the demonstration qualification threshold);
  - the attributed sensor (attention above 35 °C, watching above 30 °C, watching when readings are stale);
  - open non-model alerts, identity conflicts and returns.

  All thresholds are placeholders for engineering to set.
- **One source for every screen**: `src/services/mock/status.ts` serves the list, the passport, home and `GET /api/v1/home`. Tests prove the three agree and that no battery that needs attention is told "nothing needs doing".
- **Home** (`/app/home`, UX §14–15, §29–30): one ring, one sentence, counts that link to the filtered list, the batteries that need attention (most urgent first) with their next step, an action summary, "since your last visit", and what each kind of number means. Customers land here; staff keep the operational Overview.
- **Portfolio** (UX §16–17): status filters with counts, and a **Simple** default (battery, status, location, last test, next step) with a **Detailed** view for technical users. Both are kept in the address.
- **Battery page** (UX §18–21): the status under the label (glance), the factors that decided it, each tagged Measured, Calculated or Rule (understand), the full record below (technical). "Not modelled" and "Not estimated" are said, not hidden.
- **What the last intervention changed** (UX §34–37): capacity as a share of rated, internal resistance, and the battery's temperature above ambient at test, each before → after with bars that move once. The footnote reads "Based on measurements before and after the intervention… not that the process caused it."
- **Data kinds** (UX §26): Measured, Calculated, Modelled, Predicted, Controlled (never used: nothing controls equipment) and Rule, with a legend on home.

## Section by section

| UX vision | State | Notes |
| --- | --- | --- |
| §2–4, §69 One ecosystem | Partial | Battery-only record model. Meters, inverters and storage need a device/asset abstraction. The register-map decoder (`src/domain/registerMap.ts`) is already device-neutral. |
| §5, §54 Journey and passport timeline | Built | Lifecycle events from intake to recycling on one identity. |
| §6–8 Site visit, scan, identity | Partial | QR lookup, intake form, CSV import, Site → Bank → String → Position. **Missing:** a "System/Area" level (UPS room, telecom room), a site-first technician flow, and the `SV-BAT-000012` ID format (the prototype uses `B-0001` plus `SYN-XXXX-XXXX`). |
| §9–10 First health check | Partial | Tests capture voltage, battery temperature, ambient, resistance, capacity, conditions, instrument, calibration and report. **Missing:** terminal condition, electrolyte/specific gravity, charge/discharge behaviour, per-test photos as fields (photos are evidence files). |
| §11 No fake precision | Built | "Baseline being established" instead of a number. |
| §12–13 Data twin vs visual twin | Built | The record is the data twin. The cutaway illustration loads only on the battery page and is labelled as an illustration. |
| §14–15 Home | Built | See above. |
| §16–17 Portfolio and filters | Built | Replacement column omitted (no model). |
| §18–21 Twin page and three levels | Built, without a score | No health ring number, by design. |
| §22–23 Temperature, against ambient | Partial | The illustration tints with the measured block temperature. Sensors do not measure ambient; tests do, so "above ambient" appears for tests. |
| §24–25 Plate health, model not camera | Not built | No model. Shown as "Not modelled". |
| §26 Data kinds | Built in the interface | **Gap:** the database does not yet store a provenance type and a measurement scope on every observation (data strategy §03). |
| §27 Confidence | Not applicable yet | Comes with the first validated prediction. Shadow outputs already carry uncertainty text. |
| §28 Freshness | Built | Stale readings say how old they are and move the battery to Watching. |
| §29 Since your last visit | Built | Battery page and home, per viewer, per device. |
| §30 Action centre | Partial | Counts on home plus the Alerts and tasks page. **Missing:** due-window grouping ("within 7 days"). |
| §31 Notifications that matter | Partial | Alert rules need three consecutive readings. No push notifications. |
| §32 Voice | Built for new views | Short, calm; no "Synovra has detected". |
| §33 Ask | Built | The assistant knows which battery is open. The read-only analyst cites records. |
| §34–36 Maintenance and intervention | Partial | Before-and-after from measured tests. **Not built:** scan-to-open work orders; a liquid-entering animation (it would depict a process the record does not contain). |
| §37 Performance Lab | Partial | Restoration batches and decisions. Naming decision pending (above). |
| §38–41 Machine integration and identity | Partial | Bench CSV import with export profiles; device register decoder. Instrument and calibration reference per test. **Missing:** a machine/channel/firmware registry; any live connection (none is authorised). |
| §42–45 Phase 1 hardware | Simulated | Voltage, temperature, resistance, gateway last-seen and mapping quality. **Missing:** current, charge/discharge/deep-discharge events, device self-health beyond last seen. |
| §46–51 Protect, act, control, dosing | Not built, by design | Monitoring is not control. Both documents put control behind engineering, electrical and safety review. |
| §52 Replacement journey | Partial | A slot keeps its assignment history; a replacement link exists on the record. |
| §53 Site intelligence | Not built | Needs real outcomes across sites. |
| §55–56 Recycling | Partial | Recycler, consignment, mass handed over, certificate state. **Missing:** per-material breakdown; the separation animation (no material data to drive it honestly). |
| §57 Reports | Built | |
| §58 Customer value | Partial | Route economics and recorded money in. **Not built:** "spend deferred" or "downtime avoided" estimates, which need a validated baseline. |
| §59–61 Technician speed, offline, live onboarding | Not built | The biggest remaining gap for field use. |
| §62–65 Design language, colour, animation, rendering | Built | Calm warm palette; colour reserved for status and heat; animation only where it shows a change. One illustration per battery type. |
| §66 Raw data never lost | Partial | Evidence files keep checksums; corrections append. The status rule version travels with every status but is not yet stored per assessment. |

## The data strategy's demo, step by step

| Step | Where |
| --- | --- |
| 1. Register / scan | Intake, QR lookup, battery page identity block |
| 2. Inspect evidence | Battery page: latest approved test with method, conditions, instrument, calibration, reviewer, report |
| 3. Compare attempts | Battery page: "What the last intervention changed"; Restoration tab |
| 4. View economics | Route calculator (Outlook lens), costs and value, Reports |
| 5. Check readiness | Intelligence → Learning loop (readiness gate, exclusions) |
| 6. Close the loop | Recycling record, values, customer-safe passport (customer role) |

## What would move this forward (from the data strategy, §16)

1. **The costliest decision today** (intake, route, process, release, warranty or recycling). It decides which screen gets real data first.
2. **The physical unit that gets the ID** (12 V block, 2 V cell or string). It changes the hierarchy and which tests apply.
3. **One pilot family and its approved pass rule.** This replaces the 85% placeholder and the temperature limits in `battery-status`.
4. **Linked records from intake to final outcome, including failures and rejects.** These are needed before any score, replacement window or plate model can be trained and shown.
5. **The machine's data path** (documented export or API) and the hosting and identity facts. Needed for the machine registry and any live connection.
