# DT_DataCenter — Canonical PRD for Codex

**Project:** DT_DataCenter
**Physical object:** Data Center, Laboratorium Sistem Cerdas
**Document role:** Product and implementation contract for Codex
**Repository root:** `E:\Projects\Digital_Twin`
**Canonical PRD path:** `E:\Projects\Digital_Twin\docs\PRD.md`
**Current maturity target:** R1 Representation + R2 Replication
**Current data direction:** Physical → Virtual
**Future maturity:** R3 Reality + R4 Relational, owned by a later Digital Twin team
**Status:** Canonical current-scope requirements

---

## 0. How Codex MUST use this document

This file defines what `DT_DataCenter` MUST become.

`AGENTS.md` defines repository execution rules.
`docs/PRD.md` defines product scope, architecture, contracts, acceptance criteria, and explicit non-goals.

When this file and an ad-hoc implementation idea conflict, this file wins unless the user explicitly changes the requirement.

Codex MUST NOT silently reinterpret, expand, or "future-proof" the project beyond this PRD.

Codex MUST NOT replace a locked decision because another technology is newer, more popular, or more familiar.

Codex MUST preserve the project as a staged Digital Twin of the Data Center in Laboratorium Sistem Cerdas, not as a generic IoT dashboard and not as a generic 3D viewer.

---

## 1. Normative language

The following terms are intentional:

- `MUST`: mandatory for the current project.
- `MUST NOT`: prohibited for the current project.
- `SHOULD`: preferred unless a concrete project constraint justifies another choice.
- `MAY`: allowed but not required.
- `TBD`: unresolved and MUST NOT be invented by Codex.
- `GATE`: requires real evidence or explicit user/supervisor decision before implementation.
- `FUTURE`: reserved for the later R3/R4 team and MUST NOT be implemented in current scope.

Codex MUST distinguish a missing requirement from a `TBD`.

A `TBD` is not permission to guess.

---

## 2. Product vision

`DT_DataCenter` MUST create a validated virtual counterpart of the physical Data Center in Laboratorium Sistem Cerdas and then replicate selected real physical and operational conditions into that counterpart using real empirical data.

The system MUST combine:

- a faithful 3D representation of the physical data-center environment;
- stable digital identities for rooms, racks, servers, sensors, and selected infrastructure;
- real environmental telemetry;
- selected native server/IT telemetry;
- a canonical persisted Twin state;
- WebGL 3D visualization;
- spatial temperature visualization attached to the real 3D geometry;
- a separate humidity representation;
- an Augmented Reality view for the Replication deliverable;
- traceability from a digital value back to its physical source;
- measurable synchronization behavior.

The current project MUST stop at:

```text
R1 Representation
        ↓
R2 Replication
```

The current project MUST NOT implement:

```text
R3 Reality
R4 Relational
```

The long-term vision may become bidirectional, but the current implementation is deliberately one-way:

```text
PHYSICAL ─────────────────────────────► VIRTUAL
```

---

## 3. Academic foundation: the 4R framework

The project follows the staged Digital Twin capability framework:

```text
Representation → Replication → Reality → Relational
```

The levels increase in capability, complexity, and development effort.

The current thesis/project implementation is intentionally limited to the first two levels.

### 3.1 R1 Representation

For this project, Representation means more than rendering a 3D model.

Representation MUST include:

- understanding the selected physical data-center structure;
- identifying relevant components and relationships;
- identifying the variables required by the use case;
- creating a digital representation of the physical environment;
- establishing physical → virtual data flow;
- collecting and storing real data;
- using data for visualization, validation, and analysis;
- capturing and verifying digital data against the original physical system.

A beautiful GLB without real identity, coordinates, physical telemetry, and traceability does not satisfy Representation.

### 3.2 R2 Replication

Replication MUST use the architecture and data established in Representation.

Replication MUST:

- virtually duplicate selected components or variables;
- use real empirical inputs from the physical system;
- reproduce the selected state/output consistently for the same input and configuration;
- continuously update the virtual counterpart from real measurements;
- remain physical → virtual only;
- expose the same canonical state to WebGL and AR.

### 3.3 R3 Reality — OUT OF SCOPE

Reality/R3 is not current scope.

Codex MUST NOT implement or claim current support for:

- independent virtual what-if scenarios;
- virtual runs intended to predict future physical outcomes;
- optimization based on hypothetical inputs;
- independent virtual behavior after the physical source is removed;
- AI/ML scenario prediction;
- predictive thermal simulation claimed as R3.

The word "reality" when describing the physical world MUST NOT be confused with maturity stage `Reality/R3`.

### 3.4 R4 Relational — OUT OF SCOPE

Relational/R4 is not current scope.

Codex MUST NOT implement:

- bidirectional physical/virtual control;
- autonomous decision making;
- automatic HVAC control;
- actuator commands;
- automatic server restart;
- automatic remediation;
- self-adjustment;
- self-calibration driven by AI;
- ML/AI decision engines;
- virtual → physical commands.

Those capabilities are FUTURE handoff items only.

---

## 4. Mandatory advisor directives translated into project requirements

The following directives are treated as frozen current-project intent:

1. The physical object is the Data Center in Laboratorium Sistem Cerdas.
2. The project uses gradual/staged Digital Twin adoption.
3. The current maturity stops at Representation and Replication.
4. The current implementation is one-way physical → virtual.
5. The real physical space MUST be reconstructed into a 3D counterpart.
6. The 3D counterpart MUST eventually be connected to real sensor data.
7. Environmental sensor data MUST travel through the ESP32-S3 edge path.
8. Data MUST reach a server-side digital interface.
9. The Digital Twin MUST be viewable through WebGL.
10. Temperature MUST affect the 3D object/space appearance, not exist only as isolated sensor dots.
11. Humidity MUST be represented independently from temperature.
12. AR is part of the Replication deliverable.
13. Edge/local computing MUST carry the latency-critical R1/R2 path.
14. Public cloud MUST NOT be required for the realtime local Twin path.
15. Cloud capability MAY be added later for archive, backup, heavy analytics, or future deep learning.
16. Pareto prioritization SHOULD be used to implement high-value data-center assets and variables first.
17. Gaussian spatial weighting MAY be used for the R1/R2 thermal field, but MUST be validated.
18. Gaussian motion for actuators is FUTURE because actuators are outside current one-way R1/R2 scope.
19. TIA-942 is an infrastructure reference, not an excuse to invent thermal compliance thresholds.
20. WebGL is a hard requirement.
21. Unity is not an active implementation path unless the supervisor explicitly requires Unity itself.

---

## 5. Product identity and naming

The canonical project name is:

```text
DT_DataCenter
```

The project root is:

```text
E:\Projects\Digital_Twin
```

The canonical PostgreSQL database name is:

```text
DT_DataCenter
```

The established project/admin role is:

```text
bagus
```

Codex MUST use established project naming consistently and MUST NOT create parallel names such as:

```text
digital_twin_db
datacenter_db
dt_lab
my_twin
demo_twin
```

unless explicitly requested.

Canonical site identity MAY use a stable machine-friendly identifier such as:

```text
lab-sc
```

but the human-readable physical site remains:

```text
Data Center — Laboratorium Sistem Cerdas
```

---

## 6. Codex working style: Ponytail

Codex MUST use the project-specific Ponytail style:

- efficient;
- professional;
- concise but sufficiently informative;
- no emoji;
- no decorative output;
- no AI-slop;
- no unnecessary architectural ceremony;
- no speculative abstraction;
- no dependency sprawl;
- no repetitive explanations;
- no unnecessary code comments;
- no rewriting working code only for style;
- no over-engineering.

Codex MUST follow this decision ladder:

```text
1. Is this change actually required by the PRD?
2. Does the repository already contain the capability?
3. Can the standard library or native platform solve it?
4. Can an already-installed dependency solve it?
5. If not, what is the smallest justified new dependency?
6. Implement the smallest complete change.
```

Codex MUST work one coherent step at a time and MUST NOT jump to a later subsystem before the current dependency is ready.

Codex SHOULD group related work within the same subsystem rather than repeatedly stopping for trivial confirmations.

---

## 7. Validation and checkpoint discipline

Codex MUST run focused automated checks that are appropriate to the change.

Codex MUST NOT interrupt the user after every small step with ceremonial validation.

The default user-facing checkpoint cadence is:

```text
approximately every 10 coherent implementation steps
```

A checkpoint MAY happen earlier only when:

- an actual error or breakage occurs;
- a hard decision gate blocks progress;
- real physical data is required;
- real hardware information is required;
- the user explicitly asks for validation.

At a checkpoint, Codex SHOULD report only:

```text
what changed
what focused checks passed or failed
what real input or decision is needed next
```

Codex MUST NOT repeatedly re-run completed audits such as Node/npm/Git/tool installation checks unless a concrete new failure points to that subsystem.

---

## 8. Git and repository authority

Codex MAY:

- inspect repository status;
- edit files;
- create files;
- run focused tests;
- show diffs;
- prepare a change for review.

Codex MUST NOT autonomously:

- commit;
- push;
- force push;
- merge;
- delete branches;
- delete repositories;
- change remotes.

Commit and push remain under user control.

A one-time explicit approval for one commit or push MUST NOT be treated as approval for future Git writes.

Codex MUST avoid casually using:

```text
git add .
```

When a commit is explicitly approved, Codex MUST show the relevant status/staged change context before the action if it has not already been reviewed.

---

## 9. CODEX EXECUTION ZONE

The following belongs to Codex because it is repository/code/configuration work:

```text
repository architecture
contracts and schemas
database migrations
PostgreSQL schema
MQTT topic contracts
telemetry validation
backend ingestion
canonical current-state logic
realtime API/state distribution
ESP32-S3 firmware source
ESP-IDF configuration stored in repository
Three.js/WebGL application
GLB programmatic validation
glTF Transform operations
semantic asset binding
thermal interpolation implementation
humidity visualization logic
AR web/application integration after its gate
Prometheus configuration stored in repository
Grafana provisioning files stored in repository
Docker/Compose files if justified
deployment configuration
tests
documentation
production migration configuration
```

Codex may use command-line tools that are already part of the project environment when required.

---

## 10. MANUAL / EXTERNAL ZONE

Codex MUST NOT attempt to automate or invent manual physical/GUI work that it cannot perform reliably.

The following remains external/manual:

```text
physical access to the data center
taking photographs
stereoscopic/panoramic/manual capture
camera operation
physical measurement
sensor mounting
sensor wiring
rack inspection
server label inspection
RealityScan GUI reconstruction
Blender artistic/manual cleanup
CloudCompare manual inspection/registration work
MeshLab manual cleanup
GIMP texture/image editing
other physical installation tasks
```

The PRD does not instruct Codex how to click through those applications.

Codex MUST instead consume approved artifacts produced by the manual workflow.

### 10.1 Manual-to-Codex 3D handoff contract

Before a 3D model becomes a runtime candidate, the operator SHOULD provide:

```text
approved runtime-candidate GLB
asset/model version
known real-world scale
unit information
orientation description
origin description
critical racks represented
critical servers represented when available
semantic node naming notes
known missing geometry
known reconstruction limitations
known texture limitations
coordinate-registration notes
```

Codex MAY then perform reproducible programmatic inspection/optimization.

Codex MUST NOT instruct a manual 3D tool to hit arbitrary triangle targets before the real scan is profiled.

---

## 11. Existing project software and technology baseline

Codex MUST prefer the software and technology already established for the project.

### 11.1 Source and development tooling

```text
Git
VS Code
Node.js 24.x
npm 11.x
Python 3.12.x when needed by tooling
Bruno API collection under E:\Projects\Digital_Twin\api\bruno
Docker Desktop as development convenience only
```

VS Code is the working editor, but this PRD is not a VS Code tutorial.

### 11.2 Firmware and edge

```text
MCU: ESP32-S3
Firmware: ESP-IDF
Primary ESP-IDF: 5.5.5
Fallback ESP-IDF: 5.4.4
Messaging: MQTT
```

Codex MUST NOT replace ESP32-S3 with another MCU unless the user explicitly changes the platform.

### 11.3 Data and messaging

```text
PostgreSQL 17.x
Database: DT_DataCenter
Owner/admin: bagus
Mosquitto MQTT 2.1.x
```

PostgreSQL is the canonical persisted Twin database.

Mosquitto is the current project broker baseline.

MongoDB may exist on the development machine, but it is NOT the canonical Twin database and MUST NOT be added to the architecture merely because MongoDB appears in the example paper.

### 11.4 Observability

```text
Prometheus
Grafana
Windows Exporter for the current Windows development host
```

Prometheus/Grafana are observability tools.

They MUST NOT become the Twin product database.

If the final laboratory server is Linux, a Linux exporter MAY be selected later after server discovery.

Codex MUST NOT install/configure Node Exporter now merely because Linux is possible.

### 11.5 Web and 3D runtime

```text
Three.js
WebGL 2
Vite
glTF / GLB
glTF Transform
```

Current package baseline includes Three.js and glTF Transform in the repository.

WebGL 2 is a hard rendering requirement.

Three.js is the current implementation.

### 11.6 Unity gate

```text
WebGL   = REQUIRED
Three.js = CURRENT PRIMARY IMPLEMENTATION
Unity   = SUPERVISOR-CONFIRMATION GATE
```

Codex MUST NOT create a parallel Unity implementation.

Codex MUST NOT install or scaffold Unity solely because the advisor's example diagram contains a Unity 3D platform logo.

If the supervisor explicitly states that Unity itself is mandatory, that becomes a new architecture decision and MUST be handled deliberately.

---

## 12. High-level Digital Twin architecture

The advisor's example architecture is adapted as a pattern:

```text
physical object
    ↓
sensor/camera interface
    ↓
digital interface
    ↓
network
    ↓
human / 3D interface
```

For `DT_DataCenter`, the canonical architecture is:

```text
┌──────────────────────────────────────────────────────────┐
│ PHYSICAL DATA CENTER                                    │
│ Laboratorium Sistem Cerdas                              │
│                                                          │
│ Room                                                     │
│ ├── Rack                                                 │
│ │   ├── Server                                           │
│ │   └── Environmental Sensors                            │
│ ├── Selected physical infrastructure                     │
│ ├── Camera/capture source [manual/optional runtime]      │
│ └── Native IT telemetry                                  │
└──────────────────────────────┬───────────────────────────┘
                               │
                               │ physical → virtual
                               ▼
┌──────────────────────────────────────────────────────────┐
│ EDGE / SOURCE INTERFACE                                  │
│                                                          │
│ ESP32-S3 + ESP-IDF                                       │
│ ├── temperature                                          │
│ ├── humidity                                             │
│ └── future approved physical sensors                     │
│                                                          │
│ Native server/exporter/API                               │
│ ├── CPU                                                  │
│ ├── RAM                                                  │
│ ├── disk                                                 │
│ ├── network                                              │
│ └── service/host health                                  │
└──────────────────────────────┬───────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────┐
│ DIGITAL INTERFACE                                        │
│                                                          │
│ Mosquitto MQTT                                           │
│       ↓                                                  │
│ Ingestion + validation + idempotency                     │
│       ↓                                                  │
│ Canonical measurement                                    │
│       ↓                                                  │
│ PostgreSQL                                               │
│ ├── registry                                             │
│ ├── measurement history                                  │
│ └── canonical current state                              │
│       ↓                                                  │
│ Realtime application interface                           │
└──────────────────────────────┬───────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────┐
│ HUMAN INTERFACE                                          │
│                                                          │
│ Three.js + WebGL 2                                       │
│ ├── registered GLB                                       │
│ ├── asset inspection                                     │
│ ├── continuous thermal field                             │
│ ├── separate humidity mode                               │
│ └── freshness / source state                             │
│                                                          │
│ AR                                                       │
│ └── reads the same canonical Twin state                  │
└──────────────────────────────────────────────────────────┘
```

---

## 13. Canonical data-flow rule

There MUST be one canonical product-state path.

Correct:

```text
REAL PHYSICAL INPUT
        ↓
source validation
        ↓
CANONICAL MEASUREMENT
        ↓
PERSISTED HISTORY
        ↓
CANONICAL CURRENT STATE
        ↓
        ├── WebGL
        └── AR
```

Incorrect:

```text
sensor → separate WebGL database
sensor → separate AR database
sensor → Grafana as product storage
sensor → random MongoDB mirror
```

WebGL and AR MUST NOT maintain competing sources of truth.

---

## 14. R1 Representation requirements

Representation MUST be implemented for a deliberately selected physical scope, beginning with the highest-value data-center assets.

### 14.1 Physical scope identification

Codex MUST support a registry capable of representing:

```text
site
room
zone
rack
server
sensor device
sensor channel
selected infrastructure asset
```

The real-world scope will be filled from physical discovery.

Codex MUST NOT fabricate racks, server models, dimensions, or sensor placements as production facts.

### 14.2 Stable digital identity

Critical assets MUST have stable identifiers.

At minimum:

```text
site_id
asset_id
rack_id when applicable
server_id when applicable
device_id
sensor_id
```

Identifiers MUST remain stable across:

- database records;
- telemetry;
- current state;
- GLB semantic bindings;
- WebGL inspection;
- AR resolution.

### 14.3 Physical-to-digital telemetry

Representation MUST prove that real data can travel from the physical source to the digital environment.

The pipeline MUST preserve:

```text
source identity
metric identity
value
unit
source timestamp
server receipt timestamp
sequence identity
quality
freshness
asset relationship
```

### 14.4 Persistence

Real accepted measurements MUST be stored historically.

The system MUST also maintain an efficient canonical current-state representation.

History and current state MUST be related but MUST NOT be confused.

### 14.5 Traceability

For a digital displayed value, the system SHOULD be able to resolve:

```text
displayed value
    ↓
canonical current state
    ↓
accepted measurement
    ↓
sensor/source identity
    ↓
physical asset relationship
```

### 14.6 Verification

Representation is not complete until selected digital data is compared with its physical source.

The project MUST support recording verification evidence such as:

```text
reference measurement
digital measurement
timestamp
asset/sensor identity
difference/error
verification note
```

Exact scientific verification procedures depend on the real sensor and calibration plan and remain TBD until hardware is selected.

---

## 15. R1 Representation acceptance criteria

R1 passes only when all applicable criteria below are demonstrated with real project artifacts/data:

- an approved 3D representation of the real data-center scope loads in WebGL;
- critical racks have stable `asset_id`;
- selected servers/assets have stable identity when they are in scope;
- GLB nodes can be mapped to canonical assets;
- a canonical coordinate system is defined;
- production sensor positions used for spatial visualization are verified;
- real physical telemetry reaches the digital interface;
- message identity, unit, timestamps, quality, and freshness are preserved;
- accepted measurements are historically persisted;
- canonical current state exists;
- stale/offline/unknown semantics exist;
- selected native server metrics follow an exporter/API path rather than being faked through ESP32;
- WebGL asset inspection can resolve the relevant canonical state;
- a displayed physical value can be traced back to its physical source;
- verification evidence exists for selected physical-vs-digital measurements;
- no unlabeled fake production data is used.

A mere working 3D viewer does not pass R1.

---

## 16. R2 Replication requirements

Replication starts only after the required Representation foundation exists.

### 16.1 Empirical input

Replication MUST operate on real empirical physical data for acceptance.

Synthetic data MAY be used in unit/integration tests, but MUST be clearly labeled as synthetic and MUST NOT be presented as production evidence.

### 16.2 Selected variable replication

Initial high-priority replication variables are:

```text
temperature
humidity
asset position/identity
selected server health
selected server/network condition
freshness/online state
```

Additional sensors MAY be added later only after their hardware and use case are approved.

### 16.3 Same input, same result

For deterministic mapping functions:

```text
same input measurements
+ same configuration
+ same semantic/coordinate mapping
=
same virtual replicated result
```

The system MUST contain automated deterministic tests for pure mapping/interpolation logic.

### 16.4 One-way rule

Replication remains:

```text
physical → virtual
```

The virtual counterpart MUST NOT command the physical system.

### 16.5 Shared WebGL and AR state

The same canonical current state MUST drive:

```text
WebGL
AR
```

No independent AR database is allowed.

### 16.6 Measured synchronization

Replication MUST measure synchronization timing instead of merely claiming "real-time".

The architecture SHOULD capture:

```text
source_ts
received_at
canonical_state_updated_at
client_received_at
client_rendered_at
```

---

## 17. R2 Replication acceptance criteria

R2 passes only when all applicable criteria are demonstrated:

- real measurements update the virtual counterpart;
- the selected physical components/variables are replicated;
- temperature becomes a continuous spatial field on/around the relevant 3D geometry;
- only verified-position sensors influence the production thermal field;
- invalid sensors are excluded from the field;
- stale sensors are excluded from the field;
- insufficient sensor coverage produces `UNKNOWN` or degraded confidence, not invented temperature;
- same input + same configuration produces the same deterministic virtual result;
- humidity remains a distinct data/visualization mode;
- selected real server state is represented on the same asset hierarchy;
- WebGL and AR read the same canonical state;
- synchronization latency is instrumented and measured;
- offline/stale source state is visible;
- AR can resolve a physical rack/asset to the correct `asset_id` and current state;
- no virtual-to-physical command capability exists.

---

## 18. Pareto implementation principle

The project SHOULD use Pareto prioritization as a scope strategy.

The initial implementation SHOULD focus first on the minority of assets/variables that provide the majority of Digital Twin value.

Typical first-priority items:

```text
critical racks
temperature
humidity
verified sensor position
rack/server identity
server health
network condition when useful
source freshness
```

Pareto is NOT:

- a Digital Twin validation formula;
- a substitute for measurement;
- a thermal model;
- an excuse to invent 80/20 numerical acceptance thresholds.

---

## 19. Canonical asset hierarchy

The minimum logical hierarchy SHOULD support:

```text
site
└── room
    ├── zone
    └── rack
        ├── server
        ├── environmental sensor
        └── selected rack infrastructure
```

An example is:

```text
lab-sc
└── room-dc-01
    └── rack-r01
        ├── server-r01-s01
        ├── temp-r01-inlet-01
        └── rh-r01-inlet-01
```

This example is a naming pattern only.

Codex MUST NOT treat example identifiers as proof that those exact assets physically exist.

---

## 20. Canonical coordinate system and spatial registration

Spatial registration is a hard requirement.

All spatially meaningful objects MUST ultimately map into one canonical world coordinate system.

```text
RealityScan / GLB coordinates
            │
            ▼
CANONICAL WORLD SPACE
      ▲              ▲
      │              │
sensor coordinates  AR alignment
```

### 20.1 Sensor spatial contract

A sensor that influences a spatial field MUST have at least:

```text
sensor_id
device_id
asset_id
coordinate_system_id
position_x
position_y
position_z
position_verified
position_version
```

Optional orientation data MAY be added when required.

### 20.2 Asset transform contract

A spatial asset SHOULD support:

```text
asset_id
coordinate_system_id
position
rotation
scale
model_node_id
transform_version
```

### 20.3 Registration rule

Without verified registration:

```text
sensor position
≠ trusted thermal influence position
```

Therefore an unverified sensor MUST NOT influence the production spatial field.

Raw values from such a sensor MAY still appear in diagnostic views with an explicit registration warning.

---

## 21. Sensor hardware policy

Exact sensor hardware is TBD.

Codex MUST NOT invent or lock:

```text
DHT22
SHT31
BME280
PIR model
airflow sensor model
power sensor model
door sensor model
```

unless the team explicitly selects the BOM.

The architecture MUST remain sensor-agnostic at the backend and Twin-state layers.

Changing a physical sensor model SHOULD NOT require redesigning:

```text
MQTT contract
backend canonical measurement
PostgreSQL canonical model
WebGL asset state
AR asset state
```

provided the source still conforms to the approved telemetry contract.

---

## 22. ESP32-S3 firmware responsibilities

ESP32-S3 is the fixed environmental edge platform.

Firmware MUST:

- identify the device;
- identify each sensor channel;
- read approved sensor hardware;
- normalize each metric into the agreed telemetry contract;
- include source timestamp when clock validity is known;
- include a boot identity;
- include a monotonic sequence within the boot;
- publish quality information;
- publish MQTT telemetry;
- support a Last Will/offline strategy;
- support secure MQTT configuration for production;
- avoid hardcoding development-only credentials into committed source;
- remain compatible with the selected ESP-IDF baseline.

Firmware MUST NOT:

- make autonomous R4 decisions;
- command HVAC;
- restart servers;
- implement actuator control for the current project;
- fabricate missing measurements.

---

## 23. Canonical telemetry message

A canonical environmental telemetry message SHOULD follow this shape:

```json
{
  "schema_version": "1.0",
  "site_id": "lab-sc",
  "device_id": "esp32s3-edge-01",
  "boot_id": "REAL_BOOT_ID",
  "seq": 12345,
  "sensor_id": "temp-r01-inlet-01",
  "asset_id": "rack-r01",
  "metric": "temperature",
  "value": 24.6,
  "unit": "degC",
  "ts": "2026-08-22T03:10:11.123Z",
  "quality": "good"
}
```

This is a contract example, not fake production data.

### 23.1 Required semantic fields

At minimum:

```text
schema_version
site_id
device_id
boot_id
seq
sensor_id
asset_id
metric
value
unit
ts
quality
```

### 23.2 Server-added fields

The ingestion side MUST add authoritative server-side timestamps such as:

```text
received_at
```

and MAY add:

```text
validated_at
persisted_at
canonical_state_updated_at
```

### 23.3 Idempotency

For QoS 1 telemetry, a recommended logical idempotency key is:

```text
(device_id, boot_id, seq, sensor_id, metric)
```

Exact database constraints MAY evolve, but duplicate handling is mandatory.

---

## 24. MQTT contract

MQTT is the physical environmental telemetry transport.

### 24.1 Broker

Current baseline:

```text
Mosquitto
```

Codex SHOULD keep broker-specific assumptions isolated so deployment remains configurable.

### 24.2 QoS

Environmental telemetry SHOULD initially use:

```text
QoS 1
```

because delivery is at-least-once and duplicate delivery is possible.

Therefore the ingestion layer MUST be duplicate-tolerant.

### 24.3 Last Will

Each ESP32 source SHOULD publish a Last Will/offline state sufficient for the Twin to determine unexpected disconnection.

### 24.4 Topic design

Topics MUST carry routing identity but MUST NOT become the only source of message identity.

A recommended pattern is:

```text
dt/<site_id>/telemetry/<device_id>/<sensor_id>/<metric>
```

Example:

```text
dt/lab-sc/telemetry/esp32s3-edge-01/temp-r01-inlet-01/temperature
```

Device state MAY use:

```text
dt/<site_id>/device/<device_id>/status
```

The payload remains canonical and versioned even if topic structure changes.

### 24.5 Development security

Plain MQTT on port 1883 MAY be used only for isolated development/LAN conditions that are explicitly treated as development.

### 24.6 Production security

Production SHOULD use authenticated MQTT over TLS with certificate validation according to the final lab network/security policy.

Exact certificate lifecycle and port policy are TBD until production-server/network discovery.

---

## 25. Ingestion and validation

The ingestion service MUST:

- subscribe to approved telemetry topics;
- parse the schema version;
- validate required fields;
- validate metric/unit compatibility;
- reject malformed messages;
- handle duplicate QoS 1 messages idempotently;
- record server receipt time;
- preserve source timestamp;
- classify source freshness;
- store accepted history;
- update canonical current state;
- expose enough diagnostics to distinguish rejected, duplicate, stale, and accepted messages.

Invalid messages MUST NOT silently update the canonical Twin state.

Unknown schema versions MUST be rejected or quarantined explicitly.

---

## 26. PostgreSQL responsibilities

PostgreSQL is the canonical persisted database.

The initial data domains SHOULD include:

```text
sites
rooms
zones
assets
asset_relationships
coordinate_systems
asset_transforms
devices
sensors
sensor_positions
measurements
current_state
source_status
model_versions
model_asset_bindings
verification_records
```

Exact SQL table names MAY differ if a cleaner normalized design is justified.

### 26.1 History

Historical measurements MUST be append-oriented and traceable.

### 26.2 Current state

Current state MUST provide efficient access to the latest accepted state needed by WebGL and AR.

### 26.3 Registry

Physical identity, digital identity, and spatial identity MUST be stored in an auditable registry.

### 26.4 No competing canonical database

Codex MUST NOT create a second canonical database without an explicit architecture change.

---

## 27. Canonical Twin state

The canonical state is the product-level source consumed by client interfaces.

A conceptual asset state:

```json
{
  "asset_id": "rack-r01",
  "state_version": 12001,
  "updated_at": "2026-08-22T03:10:11.500Z",
  "environment": {
    "temperature": {
      "value": 25.1,
      "unit": "degC",
      "freshness": "fresh"
    },
    "humidity": {
      "value": 53.0,
      "unit": "percent_rh",
      "freshness": "fresh"
    }
  },
  "children": [
    {
      "asset_id": "server-r01-s01",
      "health": "available"
    }
  ]
}
```

The exact API representation is TBD with the backend choice, but the semantics are mandatory.

The current state MUST distinguish:

```text
fresh
stale
offline
unknown
invalid
```

as appropriate.

---

## 28. Native server/IT telemetry

Not all telemetry belongs on ESP32.

Environmental/physical sensors use:

```text
physical sensor
    ↓
ESP32-S3
    ↓
MQTT
```

Native server state SHOULD use:

```text
server
    ↓
exporter / OS API / hardware-management API
    ↓
digital interface
```

Candidate native metrics include:

```text
CPU
RAM
disk
network
host availability
selected service health
```

Exact metrics depend on the real laboratory server and monitoring policy.

Codex MUST NOT route CPU/RAM/network data through ESP32 merely to make every source use one transport.

### 28.1 Exporter selection gate

Current development host is Windows and uses Windows Exporter.

Final server exporter MUST be selected after real server OS discovery.

### 28.2 Redfish

Redfish MAY be used only if the real server/hardware supports it and the use case requires it.

Redfish MUST NOT become a dependency by assumption.

---

## 29. Realtime application interface

WebGL and AR require current state updates.

The backend SHOULD provide:

- an initial current-state snapshot;
- incremental updates;
- asset-specific state lookup;
- source/freshness metadata;
- stable state/version identity.

Transport MAY use:

```text
HTTP/HTTPS
WebSocket/WSS
```

or another minimal web-compatible mechanism justified by the backend choice.

Codex SHOULD prefer one clean realtime mechanism rather than building multiple overlapping transports.

---

## 30. 3D representation pipeline contract

The physical reconstruction workflow is:

```text
Physical Data Center
        ↓
photos / capture
        ↓
RealityScan manual reconstruction
        ↓
high-fidelity MASTER model
        ↓
manual cleanup / optimization when needed
        ↓
scale + coordinate registration
        ↓
semantic rack/server preparation
        ↓
runtime-candidate GLB
        ↓
Codex programmatic inspection
        ↓
glTF Transform when justified
        ↓
runtime GLB
        ↓
Three.js / WebGL
```

### 30.1 MASTER model

The MASTER model is for:

```text
archival fidelity
reconstruction reference
validation
future reprocessing
```

It MUST NOT automatically be used as the browser runtime model.

### 30.2 RUNTIME model

The RUNTIME model is for:

```text
browser delivery
semantic binding
interaction
thermal visualization
AR/WebGL consumption when applicable
```

### 30.3 Optimization rule

Codex MUST inspect the actual model before optimization.

Codex MUST NOT invent a universal requirement such as:

```text
must be below 100k triangles
must be below 200k vertices
```

before profiling.

Performance bottlenecks MAY come from:

```text
geometry
textures
draw calls
materials
node count
compression
GPU upload
memory
```

Optimization decisions MUST be evidence-based.

---

## 31. Semantic 3D binding

Every critical runtime asset that needs live state SHOULD have a semantic binding between:

```text
canonical asset_id
        ↕
GLB node / mesh identity
```

A semantic manifest MAY contain:

```json
{
  "model_version": "runtime-001",
  "bindings": [
    {
      "asset_id": "rack-r01",
      "node_name": "Rack_R01"
    }
  ]
}
```

The manifest MAY live outside the GLB when that makes versioning and maintenance easier.

Codex MUST NOT rely only on visual mesh position to guess asset identity.

---

## 32. Three.js and WebGL requirements

WebGL is mandatory.

Three.js is the current implementation.

The web application MUST:

- load the approved runtime GLB;
- preserve canonical scale/orientation;
- resolve semantic asset identity;
- allow inspection of selected rack/server assets;
- retrieve canonical current state;
- show source freshness;
- support thermal visualization;
- support a separate humidity mode;
- remain compatible with the current WebGL 2 baseline.

The web application MUST NOT become a separate data authority.

---

## 33. Temperature visualization — hard requirement

Temperature MUST NOT be represented primarily as isolated sensor dots.

Diagnostic sensor markers MAY exist.

The main Replication visualization MUST transform real sensor data and real sensor positions into a spatial thermal field that is visually carried by the data-center/rack geometry.

Conceptual pipeline:

```text
REAL TEMPERATURE VALUES
        +
VERIFIED SENSOR POSITIONS
        ↓
spatial weighting/interpolation
        ↓
CONTINUOUS THERMAL FIELD
        ↓
3D rack / zone / data-center geometry
```

The user MUST still be able to inspect the raw source value for traceability.

---

## 34. Gaussian spatial thermal model

Gaussian weighting is an approved candidate for R1/R2 spatial interpolation.

For sensor `i` at position `p_i` and a sampled 3D position `x`:

```text
w_i(x) = exp(-||x - p_i||² / (2σ_i²))
```

A weighted temperature estimate is:

```text
T(x) = Σ(w_i(x) * T_i) / Σ(w_i(x))
```

### 34.1 Hard guardrails

The thermal model MUST exclude:

```text
invalid sensor data
stale sensor data
sensor without verified coordinates
sensor explicitly disabled for the field
```

When the model lacks enough trustworthy coverage:

```text
result = UNKNOWN / insufficient confidence
```

not:

```text
result = invented temperature
```

### 34.2 Sigma

Final `σ` is TBD.

Codex MUST NOT hardcode a scientifically authoritative sigma before real sensor placement and validation data exist.

Sigma SHOULD be configurable.

### 34.3 Scientific claim boundary

Gaussian spatial interpolation is:

```text
a spatial estimation / visualization method
```

It is NOT:

```text
CFD
airflow simulation
physics-grade thermal simulation
ASHRAE compliance proof
predictive R3 model
```

Codex MUST use scientifically honest naming in UI, code, and documentation.

---

## 35. Humidity requirements

Humidity is a required environmental data class when the selected hardware provides it.

Humidity MUST NOT be mathematically blended with temperature into one arbitrary color metric.

The interface MUST provide a separate humidity mode.

If verified humidity sensor density/placement is sufficient for a spatial field, the project MAY create a humidity spatial field.

If coverage is insufficient, humidity SHOULD be shown by asset/zone/source without inventing false spatial precision.

A validated dew-point derivation MAY be added if:

- temperature and RH are available;
- the formula is selected explicitly;
- unit handling is correct;
- its purpose is documented.

---

## 36. Environmental reference and standards

### 36.1 TIA-942

ANSI/TIA-942-C is a data-center infrastructure reference covering areas such as:

```text
telecommunications
power
cooling/mechanical
architecture
fire protection
safety
physical security
```

The project MAY map relevant discovered infrastructure against those domains.

Codex MUST NOT fabricate a formal TIA-942 compliance assessment.

### 36.2 ASHRAE thermal guidance

Thermal/environmental limits SHOULD be grounded in an appropriate thermal source such as ASHRAE guidance and actual equipment manufacturer limits.

An initial dry-bulb visualization reference of:

```text
18–27 °C
```

MAY be used for A1–A4-oriented visualization context.

It MUST NOT be labeled as:

```text
universal server limit
final laboratory threshold
TIA-942 violation boundary
```

Final thresholds are a GATE requiring:

```text
actual equipment class
manufacturer environmental limits
laboratory policy
applicable ASHRAE guidance
sensor accuracy/calibration evidence
```

Codex MUST NOT display:

```text
28 °C = TIA-942 VIOLATION
```

without a real compliance basis.

---

## 37. AR requirement for Replication

AR is a required R2 deliverable.

AR MUST consume the same canonical Twin state as WebGL.

Minimum conceptual flow:

```text
physical rack
    ↓
AR alignment / identification
    ↓
resolve asset_id
    ↓
canonical current state
    ↓
overlay
```

Minimum overlay SHOULD include:

```text
rack identity
temperature
humidity when available
freshness
selected health/state
```

### 37.1 AR implementation gate

The project is web-first.

WebXR is a preferred candidate because the current primary runtime is web-based.

However:

```text
target AR device = TBD
target browser = TBD
WebXR compatibility = GATE
anchor/marker method = TBD
```

Codex MUST NOT assume every Android phone supports the required AR path.

### 37.2 Unity XR gate

Unity/AR Foundation is not the active implementation.

It becomes relevant only if the supervisor explicitly requires Unity itself or a native Unity AR deliverable.

---

## 38. Observability

Observability supports engineering reliability and deployment health.

Prometheus/Grafana MAY monitor:

```text
backend process health
ingestion rate
ingestion errors
duplicate count
MQTT connectivity
database availability
API latency
source freshness
host metrics
selected server metrics
```

Prometheus MUST NOT replace canonical measurement history.

Grafana MUST NOT become the primary Digital Twin operator interface when the requirement is the WebGL/AR Twin.

Grafana is an engineering/monitoring plane.

---

## 39. Freshness, stale, offline, and unknown semantics

The Digital Twin MUST distinguish data age and source availability.

The system SHOULD support configurable policies for:

```text
fresh
stale
offline
unknown
invalid
```

The exact time thresholds are TBD until real sensor sampling and network behavior are known.

A stale value MUST NOT continue influencing the thermal field indefinitely.

An offline device MUST be visible as offline/stale rather than silently appearing healthy.

---

## 40. Synchronization and latency

"Real-time" MUST be measured.

The implementation SHOULD instrument:

```text
source_ts
received_at
canonical_state_updated_at
client_received_at
client_rendered_at
```

An initial local-LAN engineering target MAY be:

```text
p95 backend receive → browser state update <= 2 seconds
```

This excludes the physical sensor sampling interval.

This target is provisional and MAY be revised after real sensor/network measurement.

The instrumentation MUST remain even if the numeric target changes.

---

## 41. Security requirements

Development and production security are different profiles.

### 41.1 Development

Development MAY use local-only services and isolated LAN configurations.

Development credentials MUST NOT be committed as reusable production secrets.

### 41.2 Production

Production SHOULD require:

```text
authenticated MQTT
MQTT over TLS
HTTPS
WSS when WebSocket is used
database access restricted to required services
least-privilege service credentials
time synchronization
backup policy
logging
firewall rules
```

Final policy depends on the real laboratory server/network.

### 41.3 Secret handling

Secrets MUST NOT be committed in source.

Codex SHOULD use environment/config mechanisms appropriate to the selected runtime.

---

## 42. Edge, local network, and cloud boundaries

The R1/R2 critical path MUST function without a public-cloud dependency.

Required conceptual path:

```text
physical data center
        ↓
ESP32-S3 / native server source
        ↓
local/edge network
        ↓
lab-hosted Digital Twin services
        ↓
WebGL / AR
```

Public cloud MAY later be used for:

```text
archive
off-site backup if policy allows
heavy analytics
future deep-learning workloads
future ML training
```

Public cloud MUST NOT be required to:

```text
receive a local temperature sensor
update the canonical current state
render a local thermal field
operate the local Replication Twin
```

Cloud-provider selection is TBD.

Codex MUST NOT install AWS/Azure/GCP tooling until a provider is explicitly selected.

---

## 43. Development laptop profile

During development, the laptop MAY host:

```text
Mosquitto
backend
PostgreSQL
Prometheus
Grafana
WebGL application
```

The laptop is a development/configuration/testing environment.

It is not the permanent production server.

Heavy services are intended to be manually started rather than forced to auto-start at Windows login.

Codex MUST NOT redesign the product around the laptop as the permanent deployment target.

---

## 44. Production migration objective

The final runtime is intended to move to the server located in the laboratory/data-center environment being twinned.

Migration SHOULD require:

```text
configuration changes
deployment changes
environment-specific service definitions
```

rather than:

```text
a separate production code fork
```

Target:

```text
DEVELOPMENT
Laptop
├── Mosquitto
├── backend
├── PostgreSQL
├── Prometheus
├── Grafana
└── WebGL
        │
        │ configuration/deployment change
        ▼
PRODUCTION
Laboratory Data Center Server
├── messaging
├── backend
├── PostgreSQL
├── observability
└── WebGL
```

Exact service placement may change after discovery, but application contracts SHOULD remain stable.

---

## 45. Production Server Discovery Gate

Codex MUST NOT guess the final laboratory server specification.

Before production deployment, real discovery MUST capture:

```text
manufacturer
model
OS
OS version
CPU architecture
CPU model
core/thread count
RAM
storage
RAID/storage layout
GPU if any
virtualization capability
hypervisor if any
container runtime if any
service-management mechanism
NICs
VLAN
subnet
IP policy
DNS
NTP
firewall policy
allowed ports
TLS policy
PostgreSQL policy
backup policy
UPS/power context
administrator permissions
internet egress
monitoring policy
hardware-management interface
Redfish availability
```

Codex MUST NOT pre-assume:

```text
Ubuntu
Windows Server
Xeon
32 GB RAM
NVIDIA GPU
Docker
Podman
Proxmox
VMware
```

The deployment architecture is finalized only after this gate.

---

## 46. Backend implementation gate

The backend language/framework is currently TBD.

Codex MUST NOT choose a backend solely because Node.js or Python is already installed.

Before locking the backend, choose based on:

```text
repository fit
MQTT integration
PostgreSQL integration
realtime web delivery
maintainability
deployment compatibility
team capability
minimum dependency burden
```

Once selected, Codex SHOULD avoid parallel backend frameworks.

---

## 47. Data contract versioning

External contracts MUST be versioned.

At minimum:

```text
telemetry schema version
database migration version
canonical state/API version when breaking changes occur
3D model version
semantic binding version
coordinate registration version
thermal model configuration version
```

Breaking contract changes MUST be explicit.

Codex MUST NOT silently change field meaning while keeping the same schema version.

---

## 48. Error and quality model

Telemetry quality MUST be explicit.

Initial conceptual quality states MAY include:

```text
good
degraded
invalid
unknown
```

Exact quality rules are sensor-specific and remain TBD until hardware is selected.

Malformed, impossible, or rejected values MUST NOT silently update production current state.

The system SHOULD retain enough diagnostics to explain why a measurement was rejected.

---

## 49. No fake production data

Synthetic fixtures are allowed for automated tests.

Synthetic/demo data MUST be labeled.

Codex MUST NOT populate the production UI with made-up rack temperatures, humidity, server health, or sensor positions and then present them as a completed Digital Twin.

When real physical input is unavailable, the product SHOULD show:

```text
NO DATA
UNKNOWN
NOT REGISTERED
OFFLINE
AWAITING REAL SENSOR
```

instead of inventing reality.

---

## 50. Primary user interactions

The current WebGL Twin SHOULD support these product interactions:

### 50.1 Inspect a rack

User selects a rack.

The system resolves:

```text
rack asset identity
current environmental state
source freshness
selected child server state
```

### 50.2 Inspect raw source evidence

User can trace an environmental state back to:

```text
sensor identity
raw/latest accepted value
unit
timestamp
quality
position/registration status
```

### 50.3 View thermal mode

User enables the temperature mode.

The rack/area geometry carries the continuous thermal field.

### 50.4 View humidity mode

User enables humidity mode.

Humidity is shown independently from temperature.

### 50.5 Detect stale/offline state

The user can tell when a displayed state is stale, offline, unknown, or based on insufficient coverage.

### 50.6 AR inspection

At R2 completion, a supported AR client can resolve a physical asset and show the same canonical state.

---

## 51. Non-goals for the current project

The following are explicitly NOT current deliverables:

```text
R3 predictive Reality
R4 Relational autonomy
bidirectional control
actuator control
automatic HVAC adjustment
automatic server reboot
autonomous maintenance
autonomous remediation
AI decision making
ML prediction
what-if scenario engine
CFD airflow simulation
physics-grade thermal simulation
full TIA-942 compliance certification
automatic cloud provider deployment
Kubernetes
multi-cloud orchestration
a second canonical database
a parallel Unity and Three.js implementation
arbitrary new microcontroller support
sensor BOM invention
production hardware specification guessing
```

Do not implement these "just in case".

---

## 52. Explicit TBD and decision gates

The following MUST remain unresolved until real evidence or explicit approval exists:

| Area | Status |
|---|---|
| Exact temperature sensor | TBD |
| Exact humidity sensor | TBD |
| Additional physical sensor models | TBD |
| Number of sensors | TBD |
| Final sensor placement | TBD |
| Sensor sampling interval | TBD |
| Sensor calibration process | TBD |
| Final freshness thresholds | TBD |
| Backend language/framework | TBD |
| Final server OS/specification | TBD |
| Final container/runtime choice | TBD after server discovery |
| Production service manager | TBD |
| Production network/VLAN | TBD |
| Production ports | TBD |
| Production TLS/certificate policy | TBD |
| AR target device | TBD |
| AR target browser | TBD |
| WebXR compatibility | GATE |
| WebXR vs Unity XR | GATE |
| Whether Unity itself is mandatory | SUPERVISOR GATE |
| AR anchor/marker/alignment method | TBD |
| Camera as runtime sensor | TBD |
| Exact native server telemetry | TBD |
| Redfish availability | TBD |
| Final Gaussian sigma | validation gate |
| Final thermal thresholds | hardware/site gate |
| Final humidity field method | sensor-density gate |
| Public cloud provider | TBD |
| Cloud archive/backup policy | TBD |

Codex MUST NOT resolve these by assumption.

---

## 53. Frozen decisions

The following are not TBD unless the user explicitly changes the PRD:

```text
Project object       = Data Center, Laboratorium Sistem Cerdas
Project name         = DT_DataCenter
Current maturity     = R1 Representation + R2 Replication
Current direction    = physical → virtual
R3 Reality           = out of scope
R4 Relational        = out of scope
Bidirectional        = future
Actuator control     = future
MCU                   = ESP32-S3
Firmware              = ESP-IDF
Messaging family      = MQTT
Current broker        = Mosquitto
Canonical database    = PostgreSQL
Database name         = DT_DataCenter
Observability         = Prometheus + Grafana
Web interface         = required
WebGL                 = hard requirement
Primary 3D runtime    = Three.js + WebGL 2
Runtime 3D format     = GLB/glTF
Programmatic 3D tool  = glTF Transform
AR                    = required for Replication
Temperature display   = continuous spatial 3D field
Humidity              = separate data/visualization class
Fake production data  = forbidden
Manual GUI 3D work    = external handoff
Production server     = real lab server after discovery
Public cloud realtime dependency = forbidden
```

---

## 54. Implementation order

Codex MUST respect dependency order.

A practical current-project order is:

```text
architecture/contracts
        ↓
database schema
        ↓
MQTT ingestion
        ↓
canonical current state
        ↓
realtime API
        ↓
ESP32-S3 physical source path
        ↓
native server telemetry adapter
        ↓
3D runtime artifact integration
        ↓
semantic binding
        ↓
WebGL Representation
        ↓
thermal/humidity Replication
        ↓
latency/freshness instrumentation
        ↓
AR Replication
        ↓
production server discovery
        ↓
production migration
```

Substantial frontend work SHOULD NOT outrun the backend contracts it needs.

---

## 55. 50-step Codex execution sequence

This sequence is a planning contract, not a demand to perform all steps in one response.

### Steps 1–10 — Foundation and canonical contracts

1. Read `AGENTS.md` and this PRD.
2. Inspect existing repository structure without re-auditing healthy global tools.
3. Define/finalize canonical identity and telemetry contracts in repository docs/schema.
4. Define the canonical asset hierarchy.
5. Define the canonical coordinate-system contract.
6. Create PostgreSQL migration foundation for registries and measurements.
7. Add current-state persistence model.
8. Implement MQTT ingestion boundary with schema validation.
9. Add QoS-1 duplicate/idempotency handling.
10. Expose the first canonical current-state read contract.

**Checkpoint 10:** summarize only the coherent foundation, focused checks, and real TBDs.

### Steps 11–20 — Real physical source path

11. Prepare ESP32-S3 firmware structure around the canonical telemetry contract.
12. Implement stable device identity.
13. Implement boot identity and sequence behavior.
14. Implement approved sensor adapters only after BOM selection.
15. Implement MQTT publishing.
16. Implement Last Will/source status.
17. Keep production TLS support configurable.
18. Integrate real environmental telemetry with ingestion.
19. Add the selected native server telemetry adapter available on the development environment.
20. Add focused source/ingestion observability.

**Checkpoint 20:** report real source flow and unresolved physical hardware items.

### Steps 21–30 — Representation

21. Receive the approved runtime-candidate GLB from the manual workflow.
22. Programmatically inspect the GLB.
23. Optimize with glTF Transform only when profiling justifies it.
24. Register model version and coordinate-system metadata.
25. Create semantic asset-to-GLB-node bindings.
26. Load runtime GLB in Three.js/WebGL.
27. Implement asset picking/inspection.
28. Connect WebGL assets to canonical current state.
29. Show freshness/unknown/offline semantics.
30. Record physical-vs-digital Representation verification evidence.

**Checkpoint 30:** evaluate R1 acceptance criteria without repeating unrelated tool audits.

### Steps 31–40 — Replication

31. Implement production-safe thermal-source filtering.
32. Implement Gaussian spatial weighting as a deterministic pure function.
33. Add automated deterministic tests for interpolation.
34. Make sigma configurable.
35. Bind thermal field to registered 3D geometry.
36. Add insufficient-coverage/UNKNOWN behavior.
37. Implement separate humidity mode.
38. Integrate selected native server state with the same asset hierarchy.
39. Instrument synchronization latency through the client.
40. Implement the AR path after the device/alignment gate and connect it to the same canonical state.

**Checkpoint 40:** evaluate R2 evidence, latency measurements, and AR gate status.

### Steps 41–50 — Production migration and final evidence

41. Perform the real laboratory-server discovery gate.
42. Record OS/hardware/network facts.
43. Choose production service/deployment method from real facts.
44. Map development configuration to production configuration.
45. Apply production authentication/TLS policy.
46. Deploy the canonical services without application-code fork.
47. Verify time synchronization, persistence, source freshness, and observability.
48. Re-run physical-vs-digital Representation evidence on the real environment.
49. Re-run Replication evidence with real sensor data and measured latency.
50. Produce the R1/R2 handoff package for the next Digital Twin team.

**Checkpoint 50:** final Definition of Done and explicit R3/R4 handoff.

---

## 56. Definition of Done — current project

The current project is complete only when both R1 and R2 are satisfied.

### 56.1 R1 Definition of Done

All of the following MUST be true:

```text
real physical scope is identified
approved 3D representation exists
critical asset identities are stable
coordinate system is documented
sensor coordinates used by spatial fields are verified
real physical telemetry reaches the digital interface
telemetry is validated
measurement history is persisted
canonical current state exists
freshness/offline/unknown semantics exist
WebGL loads the actual runtime model
WebGL resolves canonical assets
physical data is traceable from virtual state
selected physical-vs-digital verification evidence exists
```

### 56.2 R2 Definition of Done

All of the following MUST be true:

```text
real measurements update the virtual counterpart
selected physical variables are replicated
thermal state is spatially carried by 3D geometry
only trustworthy registered sensor data influences the field
stale/invalid data is excluded
insufficient coverage is explicit
same input/config gives deterministic mapping result
humidity is independently represented
selected native server state joins the same asset hierarchy
WebGL uses canonical state
AR uses canonical state
AR can resolve a physical asset
synchronization latency is measured
one-way physical → virtual rule is preserved
```

### 56.3 Forbidden completion shortcuts

The project MUST NOT be declared complete because:

```text
a dashboard works
a GLB loads
MQTT messages arrive
Grafana shows a chart
a sensor dot changes color
dummy data animates
a 3D model looks visually similar
```

Those are components, not R1/R2 completion by themselves.

---

## 57. Handoff package for the future R3/R4 team

At completion, the project SHOULD leave the next team a stable foundation:

```text
canonical asset registry
coordinate-system definition
sensor registry
verified spatial bindings
telemetry schema
MQTT contract
database migrations
measurement history
canonical current-state contract
realtime API/state mechanism
runtime GLB
semantic asset manifest
thermal interpolation implementation
thermal model configuration
humidity-state implementation
physical verification evidence
latency measurements
freshness semantics
production configuration
security boundary
known limitations
open research questions
```

The future team may then pursue:

```text
R3 Reality
    ↓
R4 Relational
```

without rebuilding R1/R2 foundations.

---

## 58. Research/source basis for project interpretation

This PRD is grounded in the project materials supplied by the user, including:

### 58.1 Hyre, Harris, Osho et al. — Digital twins: Representation, Replication, Reality, and Relational (4Rs)

Key project use:

- 4R maturity sequence;
- Representation as understanding the physical system and building collection/storage architecture;
- identifying critical data and using sensors for comparison/verification;
- Replication as virtual duplication of selected components/variables;
- Replication using data/architecture from Representation;
- same-input reproduction of physical output;
- gradual adoption from Representation toward higher maturity;
- R3 what-if/prediction boundary;
- R4 autonomy/bidirectional/AI boundary.

### 58.2 Ramadhani et al. — Virtual Avatar Representation in the Digital Twin: A Photogrammetric Three-Dimensional Modeling Approach

Key project use:

- photogrammetry as a Representation technique;
- reconstruction fidelity matters;
- raw reconstructed meshes may be computationally heavy/noisy;
- cleanup/resampling/optimization can preserve the general form while making runtime use more practical;
- this supports the MASTER-model versus RUNTIME-model separation.

The reported optimization result in that paper is evidence that photogrammetric output often benefits from optimization; it is NOT a triangle-count target for this data-center project.

### 58.3 Prasetyo et al. — Digital Twin Framework for Human to Environment Interaction in Interactive Spaces

Key project use:

- explicit qualitative Representation requirements;
- explicit Replication requirements;
- selected virtual components should use the same source data;
- physical and virtual counterparts should remain consistent;
- AR can participate in a real/virtual counterpart workflow;
- 4R is a qualitative maturity framework, not a numeric scoring formula.

### 58.4 Data-center and technical references

The project also uses appropriate technical reference families:

```text
ANSI/TIA-942-C for data-center infrastructure context
ASHRAE data-center thermal/environmental guidance
Espressif ESP-IDF / ESP-MQTT documentation
OASIS MQTT specification
Three.js/WebGL/glTF documentation
W3C WebXR documentation
PostgreSQL documentation
Prometheus/Grafana documentation
```

Codex SHOULD prefer primary/official technical documentation when implementing concrete protocol or API behavior.

---

## 59. Codex guardrail checklist

Before implementing a meaningful change, Codex SHOULD be able to answer:

```text
Does this change serve R1 or R2?
Is it physical → virtual?
Does it preserve one canonical state?
Does it preserve stable asset identity?
Does it preserve spatial registration?
Does it use real data or clearly labeled test data?
Does it avoid inventing a TBD?
Does it avoid R3 prediction?
Does it avoid R4 autonomous control?
Does it avoid a duplicate database?
Does it avoid a duplicate renderer?
Does it avoid an unnecessary dependency?
Does it avoid trying to control a manual GUI workflow?
Does it preserve user-controlled Git commit/push?
```

If the answer reveals a scope violation, Codex MUST stop that implementation path.

---

## 60. Canonical short-form project contract

When context is tight, Codex may use this summary, but it MUST defer to the full PRD for detail:

```text
DT_DataCenter is a staged Digital Twin of the Data Center in
Laboratorium Sistem Cerdas.

CURRENT SCOPE:
R1 Representation
R2 Replication

CURRENT DIRECTION:
physical → virtual only

PHYSICAL ENVIRONMENTAL PATH:
real sensor
→ ESP32-S3 / ESP-IDF
→ MQTT / Mosquitto
→ validation + idempotent ingestion
→ PostgreSQL measurement/history/current state
→ realtime application interface
→ Three.js/WebGL + AR

NATIVE SERVER PATH:
server/exporter/API
→ canonical Twin state

3D:
manual scan/reconstruction
→ approved registered GLB
→ programmatic validation/optimization
→ semantic asset binding
→ Three.js/WebGL

TEMPERATURE:
real values + verified positions
→ validated Gaussian candidate interpolation
→ continuous thermal field on 3D geometry
not sensor dots only
not CFD
not invented data

HUMIDITY:
separate mode/data class

AR:
required in Replication
same canonical state as WebGL
device/alignment path remains a gate

WEBGL:
mandatory

UNITY:
not active unless supervisor explicitly requires Unity itself

DATABASE:
PostgreSQL is canonical

OBSERVABILITY:
Prometheus + Grafana
not product storage

DEPLOYMENT:
development on laptop
→ final lab data-center server
through configuration/deployment changes
after real server discovery

R3 REALITY:
future, do not implement

R4 RELATIONAL:
future, do not implement

CODEX STYLE:
Ponytail
smallest complete change
one coherent step at a time
no useless repetitive validation
user-facing checkpoint around every 10 steps
no autonomous commit/push
do not invent TBDs
```

---

## 61. Final instruction to Codex

Build only what is required to make the physical Data Center in Laboratorium Sistem Cerdas a traceable, spatially registered, real-data-driven Digital Twin through **Representation and Replication**.

Do not dilute the project into a generic dashboard.

Do not inflate the project into R3/R4.

Do not replace real evidence with plausible-looking demo data.

Do not create duplicate sources of truth.

Do not guess the production server.

Do not guess the sensor BOM.

Do not create a second 3D runtime unless explicitly required.

Keep the implementation small, testable, traceable, and ready to migrate from the development laptop to the real laboratory server.

**End of canonical current-scope PRD.**
