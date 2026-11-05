# Digital Twin — Product Requirements

**Project:** Digital Twin
**Internal identifier:** DT_DataCenter
**Physical object:** One lower-environment rack
**Document role:** Product and implementation contract for Codex
**Repository root:** `Digital Twin/` (USB / Windows); `/opt/digital-twin-datacenter` (Debian runtime)
**Canonical PRD path:** `docs/PRD.md` relative to the repository root
**Current scope:** Physical acquisition, monitoring, historical analytics, and deployment
**Current data direction:** Physical → Virtual
**Out of current scope:** R2 Replication, R3 Reality, R4 Relational
**Status:** Canonical current-scope requirements

---

## 0. How Codex MUST use this document

This file defines the requirements of Digital Twin. `DT_DataCenter` remains the internal repository/database identifier, not alternate branding.

The deployment authority is one source with OS-specific wrappers under `deployment/windows` and `deployment/linux`. See `CONFIGURATION.md`, `LINUX.md`, `WINDOWS.md` and `TAILSCALE.md` for current operational procedures. The user reports a running Debian deployment; this session has not reached that server. Do not mistake locally validated configuration for server verification. Public Funnel activation requires a separate read-only Nginx listener and approval to publish telemetry.

`AGENTS.md` defines repository execution rules.
`docs/PRD.md` defines product scope, architecture, contracts, acceptance criteria, and explicit non-goals.

When this file and an ad-hoc implementation idea conflict, this file wins unless the user explicitly changes the requirement.

Codex MUST NOT silently reinterpret, expand, or "future-proof" the project beyond this PRD.

Codex MUST NOT replace a locked decision because another technology is newer, more popular, or more familiar.

Codex MUST preserve Digital Twin as the existing operational physical system. Product branding MUST NOT append classifications, institutional framing, or context from other projects.

---

## 1. Normative language

The following terms are intentional:

- `MUST`: mandatory for the current R1 project.
- `MUST NOT`: prohibited for the current R1 project.
- `SHOULD`: preferred unless a concrete project constraint justifies another choice.
- `MAY`: allowed but not required.
- `TBD`: unresolved and MUST NOT be invented by Codex.
- `GATE`: requires real evidence or explicit user/supervisor decision before implementation.

Codex MUST distinguish a missing requirement from a `TBD`.

A `TBD` is not permission to guess.

---

## 2. Product vision

Digital Twin MUST represent its physical rack and measured state using real acquisition, canonical telemetry, and traceable observations.

The active physical scope is one rack in the lower rack/server environment. The upper
server is outside every discovery, test,
deployment, configuration, and monitoring action performed by this project.

The system MUST combine:

- a faithful 3D representation of the physical data-center environment;
- stable digital identities for rooms, racks, servers, sensors, and selected infrastructure;
- real environmental telemetry;
- selected native server/IT telemetry;
- a canonical persisted Twin state;
- WebGL 3D visualization;
- traceability from a digital value back to its physical source;
- physical-to-digital verification evidence.

The operational data direction is:

```text
PHYSICAL ─────────────────────────────► VIRTUAL
```

---

## 3. Representation terminology

The following framework is retained as reference terminology, not project identity or a requirement to build further capabilities:

```text
Representation → Replication → Reality → Relational
```

The levels increase in capability, complexity, and development effort.

The active scope is the physical monitoring and analysis system described here. The R1 references below describe representation requirements, not an additional product classification.

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

---

## 4. Physical system requirements

1. The physical object is one lower-environment rack; the upper server is no-touch.
2. The active scope is physical acquisition, monitoring, historical analytics, and deployment.
3. The current implementation is one-way physical → virtual.
4. The real physical space MUST be reconstructed into a 3D counterpart and connected to real data for acceptance.
5. Mechanical acquisition and communication use an ESP32-S3 board carrying ESP32-S3-WROOM-1-N16R8; the physical marking remains unverified.
6. Temperature and humidity use two DFRobot Fermion SEN0331 modules with Sensirion SHT31-DIS-B over separate I2C controllers currently configured at 50 kHz by the active sketch.
7. Sensor A uses I2C0 on SDA GPIO8/SCL GPIO9; sensor B uses I2C1 on SDA GPIO10/SCL GPIO11. Both use high-repeatability measurements at approximately 1 Hz with mandatory CRC validation.
8. Sound acquisition uses the INMP441 digital I2S MEMS microphone with a 24-bit source and 48 kHz target.
9. ESP32-S3 owns acquisition, validation, conversion, acoustic processing, Wi-Fi, and MQTT. The ESP32 ADC is not used for these digital sensors.
10. Data MUST reach the server-side canonical digital interface.
11. The Digital Twin MUST be viewable through WebGL.
12. Public cloud MUST NOT be required for the local Twin path.
13. Pareto prioritization SHOULD focus work on high-value data-center assets and variables.
14. TIA-942 is a data-center infrastructure reference; formal compliance requires applicable current-standard evidence.
15. Unresolved physical verification, acoustic calibration, identity/time provisioning, and credentials MUST NOT be invented.

---

## 5. Product identity and naming

The canonical project name is:

```text
Digital Twin
```

The project root is:

```text
Digital Twin/
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

but site identity MUST remain separate from product branding. The human-readable product name is:

```text
Digital Twin
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

Codex MUST keep each change coherent and MUST NOT enter another subsystem before its dependencies and authorization are ready.

Codex SHOULD group related work within the same subsystem rather than repeatedly stopping for trivial confirmations.

---

## 7. Validation discipline

Codex MUST run focused automated checks that are appropriate to the change.

Codex MUST NOT interrupt the user after every small change with ceremonial validation.

At completion or a genuine gate, Codex SHOULD report only:

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
ESP32-S3 acquisition and communication firmware after implementation gates
Three.js/WebGL application
GLB programmatic validation
glTF Transform operations
semantic asset binding
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

The existing operational model is one procedural Three.js rack. For an optional imported model, the operator SHOULD provide:

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
Bruno API collection under api/bruno relative to Digital Twin/
Docker Desktop as development convenience only
```

VS Code is the working editor, but this PRD is not a VS Code tutorial.

### 11.2 Hardware and firmware

The fixed hardware and digital interfaces are defined in the sensor hardware policy and hardware-role contract below. `docs/contracts/foundation.md` preserves the hardware-neutral identity and telemetry mapping.

The active firmware authority is the existing Arduino `DT_DataCenter.ino` sketch from the original development workstation. USB contains private recovered build/sketch artifacts under `firmware/ESP32/recovered`, but the original `.ino` has not been located; see `firmware/ESP32/README.md`. Preserve the private `local_config.h`, USB/NVS provisioning, acquisition, MQTT payload and Wi-Fi credentials. `firmware/esp32s3_datacenter` is a separate ESP-IDF implementation and MUST NOT be substituted as authority for the running board. Prior physical operation is reported; this session does not independently verify board operation, calibration, clock accuracy, sensor placement or server runtime.

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

Debian deployment uses Node Exporter `prom/node-exporter:v1.9.0` with host networking and host proc/sys mounts. The backend collector must use the actual server NIC; reference enp11s0 differs from the recovered USB env enp0s3. Verify before applying configuration. Windows uses Windows Exporter on the host, never Linux host metrics from Docker Desktop's VM as a substitute for Windows NIC telemetry.

### 11.5 Web and 3D runtime

```text
Three.js
WebGL 2
Vite
ECharts
glTF / GLB
glTF Transform
```

The operational frontend uses Three.js for the procedural rack and ECharts for analytics. glTF Transform is available for optional imported assets; a GLB is not required for the existing rack.

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

The canonical physical source path is:

```text
SEN0331 A ── I2C0, GPIO8/GPIO9 ──┐
SEN0331 B ── I2C1, GPIO10/GPIO11 ├──► ESP32-S3 acquisition / processing
INMP441 ──── digital I2S ─────────┘              │
                                                  ▼
                                            Wi-Fi / MQTT
                                                  │
                                                  ▼
                                           Server ingestion
```

The server maintains the same hardware-neutral canonical path:

```text
Environmental MQTT ──► validation + idempotency ──┐
                                                 ▼
Native server/exporter/API ───────────► canonical measurements
                                                 │
                                                 ▼
                                       PostgreSQL
                                       registry / history / current state
                                                 │
                                                 ▼
                                       HTTP snapshot + SSE
                                                 │
                                                 ▼
                                       Three.js / WebGL
                                       procedural rack / asset inspection
                                       freshness / source state
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
      WebGL
```

Incorrect:

```text
sensor → separate WebGL database
sensor → Grafana as product storage
sensor → random MongoDB mirror
```

WebGL MUST consume canonical state without maintaining a competing source of truth.

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
- model-component bindings, or GLB semantic bindings for imported assets;
- WebGL inspection.

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

Exact scientific verification procedures and calibration remain TBD for the fixed sensor hardware.

---

## 15. R1 Representation acceptance criteria

R1 passes only when all applicable criteria below are demonstrated with real project artifacts/data:

- an approved 3D representation of the real data-center scope loads in WebGL;
- critical racks have stable `asset_id`;
- selected servers/assets have stable identity when they are in scope;
- procedural components or imported GLB nodes can be mapped to canonical assets;
- a canonical coordinate system is defined;
- sensor positions included in the R1 physical representation are registered and verified;
- after the wiring, timing, identity, and calibration gates, real SEN0331 temperature + humidity and INMP441 sound-level measurements reach the digital interface through the ESP32-S3;
- message identity, unit, timestamps, quality, and freshness are preserved;
- accepted measurements are historically persisted;
- canonical current state exists;
- stale/offline/unknown semantics exist;
- selected native server metrics follow an exporter/API path rather than the environmental MCU chain;
- WebGL asset inspection can resolve the relevant canonical state;
- a displayed physical value can be traced back to its physical source;
- verification evidence exists for selected physical-vs-digital measurements;
- no unlabeled fake production data is used.

A mere working 3D viewer does not pass R1.

---

## 16. Pareto implementation principle

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
- an excuse to invent 80/20 numerical acceptance thresholds.

---

## 17. Canonical asset hierarchy

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

## 18. Canonical coordinate system and spatial registration

Spatial registration is a hard requirement.

All spatially meaningful objects MUST ultimately map into one canonical world coordinate system.

```text
RealityScan / GLB coordinates
            │
            ▼
CANONICAL WORLD SPACE
            ▲
            │
   sensor / asset coordinates
```

### 18.1 Sensor spatial contract

A spatially represented sensor MUST have at least:

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

### 18.2 Asset transform contract

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

### 18.3 Registration rule

Unverified sensor positions and asset transforms MUST remain distinguishable from verified physical locations. Raw values MAY appear with an explicit registration warning. Production coordinates MUST come from physical registration evidence.

---

## 19. Sensor hardware policy

The mechanical hardware is fixed:

| Role                              | Hardware                                       | Digital interface                                          |
| --------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| Measurement and communication MCU | ESP32-S3 board carrying ESP32-S3-WROOM-1-N16R8 | I2C, I2S, Wi-Fi, and MQTT                                  |
| Temperature + humidity            | 2x DFRobot Fermion SHT31 SEN0331               | Sensor A: I2C0, GPIO8/GPIO9; sensor B: I2C1, GPIO10/GPIO11 |
| Microphone                        | INMP441 digital I2S MEMS                       | I2S, 24-bit source, 48 kHz target                          |

The firmware target assumes 16 MB Flash and 8 MB Octal PSRAM. The marketplace board MUST be described as an ESP32-S3 board carrying ESP32-S3-WROOM-1-N16R8, not as an official Espressif development-board variant. Module marking and memory capacity remain physical verification gates.

SEN0331 SHT31 is a DIGITAL I2C sensor. INMP441 is a DIGITAL I2S microphone with its own internal ADC/filter. The ESP32 ADC is not used for either sensor type.

The two SEN0331 modules use independent I2C controllers currently configured at 50 kHz (`50000` Hz in each `begin` call of the active sketch). Both use high-repeatability acquisition at approximately 1 Hz with mandatory CRC validation. Final measured placement remains distinct from reference placement; the software MUST keep the two sources independently traceable.

INMP441 uses WS GPIO4, BCLK GPIO5, and DIN GPIO6, with VDD at 3V3 and common GND. L/R is specified as GND for the left channel. Philips I2S carries 24-bit two's-complement source data in two 32-clock slots at 48 kHz, targeting 3.072 MHz BCLK below the microphone's 3.2 MHz limit. These are software/wiring targets; physical connections and clocks remain unverified.

The active sketch uses ESP_I2S at 48 kHz with 32-bit mono left-channel slots. Signed sample words are shifted right by eight bits and normalized by 8388608 for RMS/Peak dBFS. Each window requires 48000 samples and is bounded by 2500 ms; incomplete or zero-peak windows are invalid. Do not substitute the repository ESP-IDF implementation's framing or DMA behavior for this acquisition path. Raw PCM stays in local fixed-size buffers; the canonical payload preserves the raw peak, not a PCM stream. These diagnostics are not calibrated SPL or dBA.

Microphone calibration and the SPL/dBA/Leq policy remain TBD. Production network credentials remain external configuration and MUST NOT be committed or logged.

The backend, MQTT telemetry contract, and PostgreSQL canonical model remain hardware-neutral. The sound-level metric/unit/quality contract depends on the calibration and SPL/dBA/Leq decisions; it MUST NOT be invented or added during cleanup.

---

## 20. Hardware-role contract

### 20.1 ESP32-S3 measurement and communication

ESP32-S3 owns authoritative sensor acquisition, validation, engineering-unit conversion, acoustic processing, source identity, measurement sequencing, Wi-Fi, MQTT, TLS, and network connection state. SEN0331 connects directly through I2C0 and I2C1. INMP441 connects directly through I2S.

### 20.2 Source identity and precision

The two SEN0331 sources MUST retain separate stable `sensor_id` values. Raw SHT31 words and calculated floating-point values MUST retain their available precision inside firmware; no averaging or placement-derived naming is allowed without physical evidence. Network retry MUST reuse canonical message identity and MUST NOT replace source measurement time with server receipt time.

### 20.3 Firmware and physical gates

`docs/contracts/foundation.md` defines the canonical identity, telemetry, status, timestamp, and retry semantics. The direct ESP32-S3 architecture does not require a parallel MQTT schema or PostgreSQL model.

INMP441 physical wiring, measured clocks and capture stability, acoustic calibration, provisioned stable identities, boot-identity uniqueness in operation, and synchronized-clock accuracy require physical verification evidence before acceptance. Firmware already implements random boot identity generation and SNTP-backed source time; it does not treat either as physically verified.

---

## 21. Canonical telemetry message

A canonical environmental telemetry message SHOULD follow this shape:

```json
{
  "schema_version": "1.0",
  "site_id": "lab-sc",
  "device_id": "environment-source-01",
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

This is a contract example, not production inventory or data. Edge ownership and mapping to these unchanged server fields are defined in `docs/contracts/foundation.md`.

### 21.1 Required semantic fields

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

### 21.2 Server-added fields

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

### 21.3 Idempotency

For QoS 1 telemetry, a recommended logical idempotency key is:

```text
(device_id, boot_id, seq, sensor_id, metric)
```

Exact database constraints MAY evolve, but duplicate handling is mandatory.

---

## 22. MQTT contract

MQTT is the physical environmental telemetry transport.

### 22.1 Broker

Current baseline:

```text
Mosquitto
```

Codex SHOULD keep broker-specific assumptions isolated so deployment remains configurable.

### 22.2 QoS

Environmental telemetry SHOULD initially use:

```text
QoS 1
```

because delivery is at-least-once and duplicate delivery is possible.

Therefore the ingestion layer MUST be duplicate-tolerant.

### 22.3 Last Will

Each MQTT communication endpoint SHOULD publish a Last Will/offline state sufficient for the Twin to determine unexpected disconnection.

### 22.4 Topic design

Topics MUST carry routing identity but MUST NOT become the only source of message identity.

A recommended pattern is:

```text
dt/<site_id>/telemetry/<device_id>/<sensor_id>/<metric>
```

Example:

```text
dt/lab-sc/telemetry/environment-source-01/temp-r01-inlet-01/temperature
```

Device state MAY use:

```text
dt/<site_id>/device/<device_id>/status
```

The payload remains canonical and versioned even if topic structure changes.

### 22.5 Development security

Plain MQTT on port 1883 MAY be used only for isolated development/LAN conditions that are explicitly treated as development.

### 22.6 Production security

Production SHOULD use authenticated MQTT over TLS with certificate validation according to the final lab network/security policy.

Exact certificate lifecycle and port policy are TBD until production-server/network discovery.

---

## 23. Ingestion and validation

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

## 24. PostgreSQL responsibilities

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

### 24.1 History

Historical measurements MUST be append-oriented and traceable.

### 24.2 Current state

Current state MUST provide efficient access to the latest accepted state needed by WebGL.

### 24.3 Registry

Physical identity, digital identity, and spatial identity MUST be stored in an auditable registry.

### 24.4 No competing canonical database

Codex MUST NOT create a second canonical database without an explicit architecture change.

---

## 25. Canonical Twin state

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

The example is conceptual. The implemented read contract is `docs/contracts/current-state.schema.json`, documented in `docs/contracts/foundation.md`.

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

## 26. Native server/IT telemetry

Not all telemetry belongs on the environmental MCU chain.

Environmental/physical sensors use:

```text
physical sensor
    ↓
ESP32-S3 acquisition / conversion / acoustic processing / Wi-Fi
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

Native server NIC telemetry remains gated by the real laboratory server and monitoring policy. Its interface, exact metrics, and acquisition method MUST be selected only after authorized server discovery.

Codex MUST NOT route CPU/RAM/network data through the environmental sensor path merely to make every source use one transport.

### 26.1 Exporter selection gate

Windows deployment supports Windows Exporter; Debian supports Node Exporter. Source code for parsing/rates remains shared. Exporter URL and exact NIC label require verification on each actual host; do not invent measurements or copy Linux interface names to Windows.

### 26.2 Redfish

Redfish MAY be used only if the real server/hardware supports it and the use case requires it.

Redfish MUST NOT become a dependency by assumption.

---

## 27. Realtime application interface

WebGL requires current state updates from the canonical backend.

The backend SHOULD provide:

- an initial current-state snapshot;
- incremental updates;
- asset-specific state lookup;
- source/freshness metadata;
- stable state/version identity.

The existing Node.js runtime provides HTTP snapshot reads and Server-Sent Events (SSE). HTTPS is part of the production security policy.

Codex SHOULD prefer one clean realtime mechanism rather than building multiple overlapping transports.

---

## 28. 3D representation pipeline contract

The operational representation is the existing single procedural 42U rack rendered by Three.js. Preserve its dimensions, component identities, and sensor bindings; reference geometry does not claim surveyed placement. The following reconstruction workflow applies only to an explicitly approved imported model:

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

### 28.1 MASTER model

The MASTER model is for:

```text
archival fidelity
reconstruction reference
validation
future reprocessing
```

It MUST NOT automatically be used as the browser runtime model.

### 28.2 RUNTIME model

The RUNTIME model is for:

```text
browser delivery
semantic binding
interaction
WebGL consumption
```

### 28.3 Optimization rule

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

## 29. Semantic 3D binding

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

## 30. Three.js and WebGL requirements

WebGL is mandatory.

Three.js is the current implementation.

The web application MUST:

- instantiate the existing single procedural 42U rack, or an explicitly approved imported model;
- preserve canonical scale/orientation;
- resolve semantic asset identity;
- allow inspection of selected rack/server assets;
- retrieve canonical current state;
- show source freshness;
- remain compatible with the current WebGL 2 baseline.

The web application MUST NOT become a separate data authority.

---

## 31. Environmental reference and standards

### 31.1 TIA-942

TIA-942 is a data-center infrastructure reference. The project-supplied PDF is ANSI/TIA-942-2005, a historical edition and not the current revision. It covers areas such as:

```text
telecommunications
power
cooling/mechanical
architecture
fire protection
safety
physical security
```

The project MAY use those domains as infrastructure context. Formal compliance claims are outside current scope unless assessed against the applicable current standard with supporting evidence.

### 31.2 ASHRAE thermal guidance

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

## 32. Observability

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

Grafana MUST NOT become the primary Digital Twin operator interface when the requirement is the WebGL R1 Twin.

Grafana is an engineering/monitoring plane.

---

## 33. Freshness, stale, offline, and unknown semantics

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

An offline device MUST be visible as offline/stale rather than silently appearing healthy.

---

## 34. Security requirements

Development and production security are different profiles.

### 34.1 Development

Development MAY use local-only services and isolated LAN configurations.

Development credentials MUST NOT be committed as reusable production secrets.

### 34.2 Production

Production SHOULD require:

```text
authenticated MQTT
MQTT over TLS
HTTPS
database access restricted to required services
least-privilege service credentials
time synchronization
backup policy
logging
firewall rules
```

Final policy depends on the real laboratory server/network.

### 34.3 Secret handling

Secrets MUST NOT be committed in source.

Codex SHOULD use environment/config mechanisms appropriate to the selected runtime.

---

## 35. Edge, local network, and cloud boundaries

The R1 critical path MUST function without a public-cloud dependency.

Required conceptual path:

```text
physical data center
├── environmental sources
│       ↓
│   ESP32-S3 acquisition / conversion / acoustic processing / Wi-Fi
└── native server source
        │
        ▼
local/edge network
        ↓
lab-hosted Digital Twin services
        ↓
WebGL [R1]
```

Public cloud MAY later be used for:

```text
archive
off-site backup if policy allows
heavy analytics
```

Public cloud MUST NOT be required to:

```text
receive a local temperature sensor
update the canonical current state
```

Cloud-provider selection is TBD.

Codex MUST NOT install AWS/Azure/GCP tooling until a provider is explicitly selected.

---

## 36. Development laptop profile

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

## 37. Production migration objective

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
Authorized Dedicated Server
├── messaging
├── backend
├── PostgreSQL
├── observability
└── WebGL
```

Exact service placement may change after discovery, but application contracts SHOULD remain stable.

---

## 38. Production Server Discovery Gate

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

## 39. Backend implementation baseline

The existing backend uses Node.js 24, ESM, and Node's built-in HTTP server. MQTT ingestion, PostgreSQL persistence, snapshot reads, SSE, device status, health/readiness, and observability are hardware-neutral R1 infrastructure.

Reuse this implementation. The MCU change does not require another backend framework or a new database/MQTT architecture.

---

## 40. Data contract versioning

External contracts MUST be versioned.

At minimum:

```text
telemetry schema version
database migration version
canonical state/API version when breaking changes occur
3D model version
semantic binding version
coordinate registration version
```

Breaking contract changes MUST be explicit.

Codex MUST NOT silently change field meaning while keeping the same schema version.

---

## 41. Error and quality model

Telemetry quality MUST be explicit.

Initial conceptual quality states MAY include:

```text
good
degraded
invalid
unknown
```

Exact acquisition quality rules remain TBD for the fixed hardware and measurement policy.

Malformed, impossible, or rejected values MUST NOT silently update production current state.

The system SHOULD retain enough diagnostics to explain why a measurement was rejected.

---

## 42. No fake production data

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

## 43. Primary user interactions

The current WebGL Twin SHOULD support these R1 interactions:

### 43.1 Inspect a rack

User selects a rack.

The system resolves:

```text
rack asset identity
current environmental state
source freshness
selected child server state
```

### 43.2 Inspect raw source evidence

User can trace an environmental state back to:

```text
sensor identity
raw/latest accepted value
unit
timestamp
quality
position/registration status
```

### 43.3 Detect stale/offline state

The user can tell when a displayed state is stale, offline, or unknown.

---

## 44. Non-goals for the current project

The following are explicitly NOT current deliverables:

```text
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

## 45. Explicit TBD and decision gates

These details remain unresolved and MUST NOT be inferred from the fixed board/sensor selection:

| Area                                                              | Status                                                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Physical ESP32-S3 module marking and memory capacity              | NOT VERIFIED; software targets ESP32-S3-WROOM-1-N16R8 with 16 MB Flash and 8 MB Octal PSRAM                                      |
| Physical SHT31 address-selection state                            | TBD; firmware MUST support the valid 0x44/0x45 address without assuming a placement                                              |
| I2C electrical wiring, pull-ups, and measured bus frequency       | Physical verification required                                                                                                   |
| INMP441 physical channel selection                                | L/R target is GND / left; physical verification required                                                                         |
| INMP441 GPIO mapping and physical wiring                          | WS GPIO4, BCLK GPIO5, DIN GPIO6; physical verification required                                                                  |
| Microphone calibration                                            | TBD                                                                                                                              |
| SPL/dBA/Leq policy                                                | TBD                                                                                                                              |
| I2S word framing and DMA behavior                                 | Philips, 24-bit source, two 32-clock slots, 48 kHz; physical timing and DMA stability verification required                      |
| Edge identity provisioning and unique boot generation mechanism   | Configuration and random boot generation implemented; real identity provisioning and operational uniqueness require verification |
| Source clock synchronization mechanism and verified time accuracy | SNTP-backed source time implemented; endpoint provisioning and time accuracy require verification                                |
| Acoustic diagnostic metric/unit                                   | `sound_rms_dbfs` and `sound_peak_dbfs` in dBFS; calibrated SPL/dBA/Leq semantics remain gated                                    |
| Final sensor placement and physical registration                  | TBD                                                                                                                              |
| Sensor verification/calibration procedure                         | TBD                                                                                                                              |
| Final freshness thresholds                                        | TBD                                                                                                                              |
| Production network credentials                                    | TBD; never committed or logged                                                                                                   |
| Final server OS/specification                                     | TBD                                                                                                                              |
| Final container/runtime choice                                    | Existing Docker Compose deployment; dedicated-server portability requires target verification                                    |
| Production service manager                                        | TBD                                                                                                                              |
| Production network/VLAN                                           | TBD                                                                                                                              |
| Production ports                                                  | TBD                                                                                                                              |
| Production TLS/certificate policy                                 | TBD                                                                                                                              |
| Camera as runtime sensor                                          | TBD                                                                                                                              |
| Native server NIC metrics/interface/acquisition method            | Windows physical NIC collector implemented; dedicated-server interface/exporter requires authorized target verification          |
| Electrical measurement source                                     | Shelly Plug PM Gen3 native PM1 measurements; calibration or measurement-direction claims require physical evidence               |
| Redfish availability                                              | TBD                                                                                                                              |
| Public cloud provider                                             | TBD                                                                                                                              |
| Cloud backup policy                                               | TBD                                                                                                                              |

The ESP32-S3 module target, two SEN0331 units, independent I2C controllers and pins, currently configured 50 kHz bus rate, high-repeatability 1 Hz environmental cadence, mandatory CRC, INMP441 type, and 48 kHz acoustic target must follow the active sketch. Operational verification does not resolve unmeasured timing, placement, calibration, or dedicated-server gates.

---

## 46. Frozen decisions

The following are not TBD unless the user explicitly changes the PRD:

```text
Project object       = one physical rack
Project name         = Digital Twin
Internal identifier  = DT_DataCenter
Current scope        = physical acquisition, monitoring, historical analytics, deployment
Current direction    = physical → virtual
Physical scope         = one lower-environment rack; upper server is no-touch
Measurement/comms MCU  = ESP32-S3 board carrying ESP32-S3-WROOM-1-N16R8
Target memory config   = 16 MB Flash + 8 MB Octal PSRAM; physical verification pending
Temperature + humidity = 2x DFRobot Fermion SHT31 SEN0331, digital I2C
Sensor A interface     = I2C0, SDA GPIO8, SCL GPIO9, configured 50 kHz
Sensor B interface     = I2C1, SDA GPIO10, SCL GPIO11, configured 50 kHz
Environmental mode     = high repeatability, approximately 1 Hz, CRC mandatory
Microphone             = INMP441, digital I2S, 24-bit source, 48 kHz target
ESP32-S3 responsibility = acquisition / validation / conversion / acoustic processing / Wi-Fi / MQTT
Messaging family      = MQTT
Current broker        = Mosquitto
Canonical database    = PostgreSQL
Database name         = DT_DataCenter
Observability         = Prometheus + Grafana
Web interface         = required
WebGL                 = hard requirement
Primary 3D runtime    = Three.js + WebGL 2
Runtime 3D model      = one procedural Three.js 42U rack
Historical charts    = existing ECharts implementation
Fake production data  = forbidden
Manual GUI 3D work    = external handoff
Production server     = authorized dedicated server after target verification
Public cloud realtime dependency = forbidden
```

---

## 47. Implementation boundaries

Reuse completed hardware-neutral infrastructure. The edge architecture change MUST NOT create a parallel backend, telemetry schema, database model, or WebGL runtime.

Firmware functionality MUST be implemented only when its required hardware facts, protocol decisions, and metrology policy are available. Substantial frontend work SHOULD NOT outrun the backend contracts it needs.

---

## 48. R1 acceptance dependencies

R1 acceptance requires all applicable evidence in section 15 and section 49, including:

- a buildable direct ESP32-S3 firmware path;
- physical module, wiring, power, I2C, I2S, Wi-Fi, MQTT, LWT, and TLS verification;
- real dual-SEN0331 validation with independent source identity;
- real INMP441 capture and an approved acoustic calibration/measurement policy;
- complete physical telemetry traceability through the canonical server state;
- authorized native server NIC telemetry discovery and implementation;
- final 3D, spatial, and WebGL verification;
- production deployment evidence on the approved lower-environment server target.

Electrical telemetry uses the existing Shelly Plug PM Gen3 PM1 source. Preserve signed native values, counters, errors, and flags; do not infer per-component consumption or add relay control. Calibration and measurement-direction claims require physical evidence.

---

## 49. Definition of Done — current project

The current project is complete when R1 is satisfied.

### 49.1 R1 Definition of Done

All of the following MUST be true:

```text
real physical scope is identified
approved 3D representation exists
critical asset identities are stable
coordinate system is documented
sensor positions included in the R1 representation are registered and verified
real SEN0331 temperature + humidity and INMP441 sound-level measurements reach the digital interface through the direct ESP32-S3 path after their implementation gates
telemetry is validated
measurement history is persisted
canonical current state exists
freshness/offline/unknown semantics exist
WebGL loads the actual runtime model
WebGL resolves canonical assets
physical data is traceable from virtual state
selected physical-vs-digital verification evidence exists
```

### 49.2 Forbidden completion shortcuts

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

Those are components, not R1 completion by themselves.

---

## 50. R1 delivery package

At R1 completion, the project SHOULD provide:

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
runtime rack geometry, with GLB only for an approved imported model
semantic asset manifest
physical verification evidence
freshness semantics
production configuration
security boundary
known limitations
open research questions
```

---

## 51. Research/source basis for project interpretation

This PRD is grounded in the project materials supplied by the user, including:

### 51.1 Hyre, Harris, Osho et al. — Digital twins: Representation, Replication, Reality, and Relational (4Rs)

Key project use:

- 4R maturity sequence;
- Representation as understanding the physical system and building collection/storage architecture;
- identifying critical data and using sensors for comparison/verification.

### 51.2 Ramadhani et al. — Virtual Avatar Representation in the Digital Twin: A Photogrammetric Three-Dimensional Modeling Approach

Key project use:

- photogrammetry as a Representation technique;
- reconstruction fidelity matters;
- raw reconstructed meshes may be computationally heavy/noisy;
- cleanup/resampling/optimization can preserve the general form while making runtime use more practical;
- this supports the MASTER-model versus RUNTIME-model separation.

The reported optimization result in that paper is evidence that photogrammetric output often benefits from optimization; it is NOT a triangle-count target for this data-center project.

### 51.3 Prasetyo et al. — Digital Twin Framework for Human to Environment Interaction in Interactive Spaces

Key project use:

- explicit qualitative Representation requirements;
- selected virtual components should use the same source data;
- physical and virtual counterparts should remain consistent;
- 4R is a qualitative maturity framework, not a numeric scoring formula.

### 51.4 Data-center and technical references

The project also uses appropriate technical reference families:

```text
project-supplied ANSI/TIA-942-2005 as a historical infrastructure reference, not the current revision
ASHRAE data-center thermal/environmental guidance
Espressif ESP-IDF / ESP-MQTT documentation
OASIS MQTT specification
Three.js/WebGL/glTF documentation
PostgreSQL documentation
Prometheus/Grafana documentation
```

Codex SHOULD prefer primary/official technical documentation when implementing concrete protocol or API behavior.

---

## 52. Codex guardrail checklist

Before implementing a meaningful change, Codex SHOULD be able to answer:

```text
Does this change serve active R1?
Is it physical → virtual?
Does it preserve one canonical state?
Does it preserve stable asset identity?
Does it preserve spatial registration?
Does it use real data or clearly labeled test data?
Does it avoid inventing a TBD?
Does it avoid prediction and autonomous control?
Does it avoid a duplicate database?
Does it avoid a duplicate renderer?
Does it avoid an unnecessary dependency?
Does it avoid trying to control a manual GUI workflow?
Does it preserve user-controlled Git commit/push?
```

If the answer reveals a scope violation, Codex MUST stop that implementation path.

---

## 53. Canonical short-form project contract

When context is tight, Codex may use this summary, but it MUST defer to the full PRD for detail:

```text
Digital Twin is an operational physical rack monitoring system.
Internal identifier: DT_DataCenter.

CURRENT SCOPE:
physical acquisition, monitoring, historical analytics, and deployment

CURRENT DIRECTION:
physical → virtual only

PHYSICAL ENVIRONMENTAL PATH:
SEN0331 sensor A → I2C0, GPIO8/GPIO9, configured 50 kHz ─┐
SEN0331 sensor B → I2C1, GPIO10/GPIO11, configured 50 kHz ├→ ESP32-S3 board carrying
INMP441 → digital I2S, 24-bit, 48 kHz target ───┘  ESP32-S3-WROOM-1-N16R8
→ authoritative acquisition / validation / conversion / acoustic processing
→ Wi-Fi / MQTT
→ MQTT / Mosquitto
→ validation + idempotent ingestion
→ PostgreSQL measurement/history/current state
→ realtime application interface
→ Three.js/WebGL

SEN0331 is digital I2C. INMP441 has its own internal ADC/filter and outputs digital
I2S. The ESP32 ADC is not used for these sensor inputs.

NATIVE SERVER PATH:
server/exporter/API
→ canonical Twin state

3D:
one procedural 42U rack with provisional installation geometry
→ semantic asset binding
→ Three.js/WebGL

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
→ authorized dedicated server
through configuration/deployment changes
after real server discovery

CODEX STYLE:
Ponytail
smallest complete change
no useless repetitive validation
no autonomous commit/push
do not invent TBDs
```

---

## 54. Final instruction to Codex

Preserve Digital Twin as one traceable operational system with real physical acquisition, canonical storage, spatial reference geometry, historical analytics, and reproducible deployment. Do not add another project identity or rebuild completed capabilities.

Do not dilute the project into a generic dashboard.

Do not replace real evidence with plausible-looking demo data.

Do not create duplicate sources of truth.

Do not guess the production server.

Do not guess physical module verification, SHT31 address-selection state or placement, INMP441 physical verification, calibration/SPL policy, provisioning/time synchronization mechanisms, or production credentials/server details.

Do not create a second 3D runtime unless explicitly required.

Keep the implementation small, testable, traceable, and ready to migrate from the development laptop to the real laboratory server.

**End of canonical current-scope PRD.**
