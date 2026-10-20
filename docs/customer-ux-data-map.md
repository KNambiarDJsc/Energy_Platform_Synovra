# Customer demo: data map

Working backward from what the customer sees to the data it needs. Everything below is **synthetic** in this build. The "Status" column says whether Synovra could fill the field today from its own records, what the demo stands in for, and what is a future dependency.

The customer journey lives at `/app/customer` (fleet), `/app/customer/batteries/[id]` (a battery's record) and `/app/customer/report` (the report). The code is in `src/lib/customer/` (model, report, framework config, demo requests) and `src/components/customer/`. It reads only existing services (`batteries`, `deployments`, `overview`), so there is no new backend, cloud service or ML.

Status key: **Have** = Synovra records it in its own workflow. **Synthetic** = the demo supplies a stand-in. **Future** = needs a source that does not exist yet. **Gap** = the model has no field.

## Hierarchy

| Shown | Field, unit | Source | Scope | Timestamp, frequency | Provenance and checks | Status |
|---|---|---|---|---|---|---|
| Customer | tenant id, name | Customer record | Customer | On change | Name is a demo label (`DEMO_CUSTOMERS`). Tenants are not readable by customer roles | Synthetic |
| Site | name, city, kind | Customer record | Site | On change | Site scope enforced per user | Have |
| System | voltage, kind | Derived from string nominal voltage and site kind | System | On change | Not a stored entity. Shown as "Not recorded" when no string is known | **Gap** |
| Bank / string | bank, string, nominal V | Deployment record | Bank, string | On move | Compatibility check at deployment | Have |
| Battery | permanent id, label, position | Intake, deployment | Battery | On intake and move | Id never reused. Label is not identity | Have |

## Fleet and site overview

| Shown | Field, unit | Source | Scope | Timestamp, frequency | Provenance and checks | Status |
|---|---|---|---|---|---|---|
| Condition (good, watching, needs attention, baseline) | status code | Fixed rule `battery-status 0.1.0` over test, sensor, alerts, identity | Battery | Evaluated at read | Rule version travels with it. Thresholds are placeholders pending engineering | Have (placeholder thresholds) |
| Why | headline, factors | Same rule | Battery | At read | Each factor names its data kind | Have |
| Approved test coverage | count of batteries | Test sessions, approved by an engineer | Battery | Per test | Only approved tests count | Have |
| Sensor coverage, current readings | count of batteries | Sensor attribution and readings | Battery | Intended 15 min | In the demo the readings are simulated | **Synthetic**. Real sensors: future |
| Newest change in records | timestamp | Max of record, test and reading times | Site | At read | Derived, not stored | Have |
| Site structure | banks, strings, positions | Deployment records | Site | On move | Empty positions shown as empty | Have |

## A battery's record

| Shown | Field, unit | Source | Scope | Timestamp, frequency | Provenance and checks | Status |
|---|---|---|---|---|---|---|
| Rated voltage, capacity | V, Ah (and rating conditions) | Manufacturer datasheet via battery family | Battery | Once | Manufacturer's rating, not measured | Have |
| Chemistry, type, serial, manufactured | text, date | Intake | Battery | Once | Missing values say "Not recorded" | Have (dates partial) |
| Capacity at last approved test | Ah, measured | Test machine or manual entry | Battery | Per test (about yearly) | Protocol, instrument, calibration reference, engineer approval. Not temperature-corrected | Have. Real test-machine feed: future |
| Capacity against rating | % of rated, calculated | Measured capacity ÷ rated capacity | Battery | Per test | Comparison at one test. Not a health score | Have |
| Open-circuit voltage, internal resistance at test | V, mΩ | Same test | Battery | Per test | As above | Have |
| String capacity | Ah | String-level test | String | Per test | Shown as string scope. Never as the battery's capacity | Have (rare) |
| Voltage, temperature | V, °C | Sensor | Battery | Intended 15 min | Mapped sensor, completeness over 30 days | **Synthetic** ("demo only") |
| Internal resistance (sensor) | mΩ | Sensor, or inferred | Battery | Intended 15 min | "Estimated" when inferred | Synthetic |
| Reading completeness | % of expected readings | Readings received ÷ expected | Battery | At read | Calculated over 30 days | Synthetic |
| Freshness | current, dated, none | Age against `staleTestDays` or sensor freshness | Battery | At read | Rule constants in `STATUS_RULE` | Have |
| Remaining useful life, failure date | n/a | None | Battery | n/a | **Never shown.** No validated model exists | **Future** |
| History | events with dates | Intake, tests, deployments, alerts, service, recycling | Battery | Per event | Approximate dates flagged | Have |
| Service work | "completed, approved by an engineer" | Restoration record | Battery | Per attempt | Shown only when approved. Method, lots and notes are confidential | Have |
| Evidence files | file, kind, date, SHA-256 | Evidence store | Battery | Per upload | Only `customer_visible` files | Have |
| Warranty | state, end date | Warranty record | Battery | On change | Shown only if the role may read it | Have |
| Replacement relation | linked battery | Replacement link | Battery | On replace | Separate identity kept | Have |
| Recycling | state, recycler, consigned kg, certificate | Recycler document | Battery | On consignment | Consigned mass is not recovered weight | Have (partial) |

## Request and replacement interaction

| Shown | Field | Source | Status |
|---|---|---|---|
| Maintenance request, replacement plan | kind, battery, site, window, note, role | The customer, in the browser | **Demo only.** Saved in `localStorage` (`synovra-customer-demo-requests:v1`). Nothing is sent, scheduled or notified. A real workflow needs a service-task service with ownership, SLAs and notifications |

## Report sections

| Section | Fields it uses | Status |
|---|---|---|
| Scope, period, coverage | Customer, sites, period, snapshot time, coverage counts | Have |
| Inventory | Rating, chemistry, manufactured, in place since, location | Have (manufacture date partial) |
| Operational performance | Test coverage, approved tests, service events, rule alerts, per-battery condition | Partly. **Gap:** outage and failure log |
| Lifecycle and circularity | Lifecycle states, restoration approvals, replacement links, recycling records | Partly. **Gap:** recovered material weights by type |
| Energy and emissions | None | **Future.** Needs: metered charging and processing energy, transport legs, emission factors with source and version, an agreed boundary |
| Social and safety | Count of temperature-limit alerts | Partly. **Gap:** safety-check and incident register (aggregated, no personal data) |
| Governance and evidence | Provenance, calibration references, approvals, evidence checksums, corrections, missing data | Have |
| Value summary | Counts from the same records | Have. Scenario inputs are the customer's own assumptions |

Framework pointers (`src/lib/customer/frameworks.ts`) are configuration. They name candidate disclosure areas for GHG Protocol, GRI, ESRS and IFRS S2 and assign **no GHG Protocol scope**. They were written without checking the current official text, so a reporting lead must confirm each before use.

## Missing inputs and decisions for Synovra

1. **Real readings:** which gateway, protocol and interval, and who owns the mapping from sensor to battery.
2. **Energy and transport:** meters at the Performance Lab and a log of transport legs, so activity data exists.
3. **Emissions method:** one agreed boundary, factor source and version, and the comparison baseline for any avoided-manufacturing claim. Until then no figure is shown.
4. **Recycler documents:** recovered weights by material, not only consigned mass.
5. **System entity:** a record between site and bank, if customers think in systems.
6. **Condition thresholds:** engineering to replace the placeholders in `STATUS_RULE`.
7. **Wording:** whether "restored" may be used with customers. The report says "service work completed, approved by an engineer".
8. **Customer identity:** real authentication and customer-to-site scoping (the demo picks a role from a list).
9. **Requests:** the workflow behind the demo request: owner, SLA, scheduling, notification.
