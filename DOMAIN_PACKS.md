# JARVIS v0.9 — Domain Intelligence Packs

JARVIS treats each professional field as a **source + retrieval + verification + computation** problem. Model answers are proposals, not authority.

## Engineering packs

The general scholarly discovery backbone is OpenAlex (`knowledge.openalex.search`). Open/public datasets, standards metadata, manuals and project files can be promoted into Knowledge Fabric with provenance.

### Mechanical Engineering
- dynamics, statics, mechanics of materials, machine design
- thermodynamics, heat transfer, fluid mechanics, HVAC
- CAD/CAE/FEA/CFD research workflows
- tribology, manufacturing, tolerances, reliability
- materials properties and NIST materials sources

### Electrical & Electronics Engineering
- circuits, analog/digital electronics, power systems
- motors, drives, transformers, power electronics
- signal processing, RF, communications, EMC
- PCB design evidence, component datasheets, control loops

### Control, Mechatronics & Robotics
- state-space/control theory, PID/MPC
- sensor fusion, robotics kinematics/dynamics
- embedded systems, ROS-class architectures, digital twins

### Civil & Structural Engineering
- structures, geotechnical, transportation, water resources
- construction/project engineering
- code/standard-aware calculations; safety-critical designs require the relevant governing standard and independent verification

### Chemical / Process Engineering
- mass/energy balances, thermodynamics, transport phenomena
- reaction engineering, process control, safety data

### Materials / Manufacturing Engineering
- metals, polymers, ceramics, composites, additive manufacturing
- NIST materials repositories and published measurement data

### Aerospace / Automotive / Energy
- aerodynamics, propulsion, flight mechanics, vehicle dynamics
- batteries, renewable energy, grids, thermal systems
- NASA/NREL/NIST/public technical literature can be indexed where licensing permits

### Computer / Software / AI Engineering
- software architecture, databases, distributed systems, security
- ML/AI research, benchmarking, reproducible experiments

## Biomedical and medical research pack

`domain.pubmed.search` uses NCBI E-utilities for PubMed citations. OpenAlex remains available for cross-disciplinary literature.

Suggested evidence hierarchy stored in provenance metadata:
1. guidelines / systematic reviews / meta-analyses
2. randomized controlled trials
3. prospective/retrospective observational studies
4. case series/reports
5. mechanistic/preclinical evidence
6. expert/model-generated hypothesis

JARVIS may compare evidence, identify contradictions, extract study design/population/endpoints, and generate research hypotheses. It must not treat one paper, one dataset, or one model output as sufficient authority for autonomous diagnosis or treatment.

## Research discipline shared by every pack

Every persistent claim should be able to carry:
- source reference and retrieval date
- license/usage status when relevant
- domain and sub-domain
- evidence/study type
- freshness
- trust/confidence score
- contradiction links
- reproducible computation/test reference

For engineering and trading, numerical claims should be executable or testable where possible. For medicine, evidence synthesis should preserve population, intervention/exposure, comparator, outcomes, and limitations.
