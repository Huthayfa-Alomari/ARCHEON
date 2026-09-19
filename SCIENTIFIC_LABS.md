# JARVIS v1.0 — Scientific Engineering & Biomedical Labs

## Engineering kernel

The deterministic engineering kernel is the beginning of a larger solver registry. Every calculation returns its equation and, where relevant, assumptions.

Implemented primitives:

- electrical: Ohm's law, DC power;
- structural: simply-supported beam center-load deflection/moment;
- mechanical: shaft torsion, kinetic energy;
- fluids: Reynolds number;
- thermal: 1-D steady plane-wall conduction.

The architecture is intended to grow into domain adapters for mechanical design, electrical/electronics, controls, mechatronics, robotics, civil/structural, materials, manufacturing, chemical/process, energy, automotive, aerospace, and software systems.

Safety-critical engineering results must be checked against the appropriate governing standard, boundary conditions, material data, load cases, tolerances, and independent simulation/verification before fabrication or operation.

## Biomedical Research Council

`domain.biomed.evidenceBrief` retrieves PubMed citation metadata and classifies title-level study hints such as evidence synthesis, trials, observational work, or guidance.

It deliberately does **not** convert citation metadata into diagnosis, dosing, prescribing, or autonomous clinical action. Full methods, population, endpoints, effect sizes, harms, conflicts, recency, and external validity still require review.

Recommended expansion path:

- PubMed/PMC full-text adapters where legally accessible;
- ClinicalTrials.gov research-status adapter;
- evidence-table extraction;
- PICO structuring;
- guideline/version tracking;
- contradiction detection;
- biomedical knowledge graph with provenance;
- private health data kept isolated in Health Vault and never silently merged into general learning.
