# DT_DataCenter Design Contract

## Product intent

DT_DataCenter is a spatial engineering workstation for one physical data-center rack.
It combines reference geometry, canonical engineering identity, observed state, and
traceable measurement context without presenting unavailable capabilities as complete.

The interface is professional, technical, calm, precise, mature, modern, approachable,
and comfortable for sustained use. It is not a marketing site, terminal, game HUD,
generic SaaS dashboard, or spreadsheet placed inside a browser.

## Digital Twin scope

The active scope is R1 Representation. The application represents geometry, assets,
systems, relationships, measurement definitions, spatial registration, and the canonical
physical-to-digital path. It is prepared to display observed state from that path, but it
does not imply physical validation before real hardware, placement, and network evidence
exist.

The physical scope is one rack. Multiple cabinets visible in `rack.glb` are reference
geometry and are not automatically physical asset records.

## Design principles

- Present engineering truth before visual completeness.
- Keep geometry, identity, observation, and capability semantically distinct.
- Make the spatial relationship between an object and its measurements explicit.
- Keep workspaces distinct while sharing canonical state and rendering ownership.
- Prefer quiet hierarchy, compact context, and selection-driven detail.
- Place unavailable states inside complete engineering structures; never fabricate data.
- Preserve one direct implementation path and existing platform capabilities.

## Information architecture

The product separates three classification levels:

1. Application workspaces answer where the operator works.
2. Infrastructure domains answer which engineering system owns the context.
3. Measurement and state answer what is defined or observed.

Measurements, domains, sensor identities, and asset identities are not application
workspaces.

## Application shell

The single-page shell contains a compact top bar, narrow primary navigation rail,
contextual workspace sidebar, main working surface, contextual inspector when selection
warrants it, and measurement history/context when relevant.

Workspace identity belongs in the top bar as a path such as `Twin / Spatial
representation` or `Systems / Telecommunications`. No detached workspace title floats
over the working surface.

## Navigation model

Primary workspaces are Twin, Assets, Streams, Analytics, Events, and Systems. Native hash
navigation controls the work mode without separate pages, a routing dependency,
duplicated state, or duplicated rendering infrastructure. The active destination exposes
`aria-current`; controls have keyboard access, accessible names, and visible focus.

## Workspace ownership

| Workspace | Primary responsibility                                      |
| --------- | ----------------------------------------------------------- |
| Twin      | Spatial representation and measurement-layer interaction    |
| Assets    | Identity, hierarchy, relationships, and registration status |
| Streams   | Measurement definitions and observed source state           |
| Analytics | Historical measurement analysis                             |
| Events    | Canonical operational event inspection                      |
| Systems   | Infrastructure-domain engineering context                   |

The application owns one `LiveCurrentState`, one canonical current-state `Map`, one
`EventSource`, and one `RackViewer`. Workspaces consume these owners; they do not create
parallel stores, transports, viewers, or models.

## Twin

Twin is the primary spatial Digital Twin workspace. The Three.js viewport is dominant.
Its sidebar contains reference/spatial readiness, measurement-layer controls,
registration controls, layer state, and factual counts.

Twin supports reference geometry inspection; geometry, sensor-anchor, and localized
measurement-zone visibility; mutually exclusive Temperature and Humidity spatial
metrics; acoustic dBFS source context without thermal semantics; explicit manual sensor
registration; selection-driven inspector content; and contextual history only when a
source or metric is selected.

With no selection, the inspector quietly explains the available context. With no anchor
or observation, the viewport remains useful and states why no marker or zone is visible.

## Assets

Assets is a registry and relationship workspace, not a 3D clone. It provides hierarchy,
identity, relationships, spatial registration, measurement relationships, and observed
identity state. An empty registry keeps its structure and states `No canonical asset
records observed`; it never invents racks or equipment.

## Streams

Streams is the measurement/source registry. It separates configured definitions from
observed sources and presents system, source, metric, unit, definition state, observation
state, latest value, source time, and spatial state.

Canonical families are Environment (Temperature and Humidity), Acoustic diagnostics
(RMS dBFS and Peak dBFS), and Device/system state where canonical evidence exists. An
absent observation is `Not observed`, never zero. `Locate in Twin` uses the existing
identity; an unregistered source reports `Spatial anchor unregistered` and does not gain
an inferred position.

## Analytics

Analytics owns historical analysis. It provides query context and one primary chart
surface with clear axes and subtle grid structure. Empty history remains a complete
analysis surface labeled `No historical series available`; the browser never accumulates
SSE messages into synthetic history.

A selected Temperature context may show the 18–27 °C equipment-inlet reference envelope
as a reference overlay distinct from measured series. Humidity has no fixed RH conformity
band.

## Events

Events is a structured operational event browser with timestamp, severity/state, source,
asset, event, and status columns. Without a canonical event source, it presents a compact
summary and `No canonical operational events observed`. Current measurements are not
converted into synthetic events.

## Systems

Systems organizes Architecture, Telecommunications, Electrical, and Mechanical. Domains
are selected inside Systems and never flattened into primary navigation.

ANSI/TIA-942-C is an infrastructure reference taxonomy, not the complete scope of this
application and not evidence of certification. Fire protection, safety, physical
security, monitoring, and other standard concerns remain outside the displayed core
domains unless real scope and evidence are added. Conformance is `Not assessed`.

## Architecture domain

Architecture is the reference-model and registration view. It may use the existing
viewer, but emphasizes reference geometry, geometry state, physical registration,
spatial anchors, and asset placement rather than Twin measurement operation.

Current geometry remains `Reference Geometry`. A model-local anchor is a
reference-geometry registration and does not make `Physical Registration` available.

## Telecommunications domain

Telecommunications is a directed engineering topology, not a rack viewer:

```text
SHT31 / INMP441 → ESP32-S3 → Wi-Fi → Network Infrastructure [Not modeled]
→ MQTT / Mosquitto → Node backend → PostgreSQL → SSE / Frontend
```

Configured topology and observed state are visually distinct. The interface does not
invent access points, switches, routers, VLANs, subnets, throughput, latency, loss, or
campus topology.

## Electrical domain

Electrical is a structured absence model when instrumentation is unavailable. It shows
rack-power context, unconfigured measurement source, unmodeled topology, unavailable
instrumentation, and no observed measurements. It does not invent a PDU, UPS, breaker,
feed, voltage, current, power, or energy value.

## Mechanical domain

Mechanical is the environmental engineering workspace. It uses the same spatial engine
as Twin with Mechanical-specific source, reference, and availability context. Temperature
and Humidity are environmental metrics. RMS dBFS and Peak dBFS remain separate
diagnostics and never produce a thermal zone.

Mechanical shows ASHRAE TC 9.9 as the thermal reference and ANSI/TIA-942-C as the
infrastructure reference taxonomy. Conformance remains `Not assessed`.

## Reference model vs observed state vs capability

| Layer           | Content                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| Reference model | Assets, geometry, systems, relationships, measurement definitions, spatial registration |
| Observed state  | Current measurements, device state, source/receive time, history, events                |
| Capability      | Analysis, simulation, optimization, command, and control                                |

Reference content must not masquerade as observation. Observation must not imply an
alarm policy. Capability appears only when implemented and backed by a canonical data or
control contract.

## Spatial registration

A spatial anchor associates an existing canonical sensor source with a coordinate system
and finite model-local position. Anchors do not exist until explicitly registered.

The operator chooses an existing source, enters registration mode, selects an actual
reference-geometry mesh intersection, reviews the preview position, then explicitly
confirms or cancels. Confirmation persists through the canonical spatial API;
cancellation creates nothing. Zero canonical sources disables registration. Orbiting does
not create an anchor. Count and markers derive from the same canonical anchor collection.

Model-local registration remains unverified until physical evidence establishes role and
position.

## Measurement layers

Temperature and Humidity are separate metric modes. One environmental metric controls
spatial coloring at a time. Matching anchors retain the same physical positions when the
metric changes; values and color semantics change with the selected metric.

```text
No registered anchor                       → no spatial marker or zone
Registered anchor, no matching observation → anchor marker only
Registered anchor and matching observation → marker and localized zone
```

Objects update in place when current state changes. A state update must not reload the
GLB, scene, camera, renderer, controls, or whole overlay group.

## Temperature reference visualization

The shared continuous mapping is below 18 °C in a cool blue family, 18 °C at a blue-cyan
transition, 22.5 °C at a green midpoint, 27 °C at a yellow-orange transition, and above
27 °C in a restrained warm orange family.

The legend remains visible whenever Temperature is selected, including with no
observation. It labels 18–27 °C as the `Recommended envelope` for air-cooled datacom
equipment inlet conditions under ASHRAE TC 9.9. It is guidance, not an alarm, fault,
shutdown threshold, or conformity result. The anchor location role is `Unclassified`
until physically registered; an exhaust or unknown-role reading cannot be judged against
the inlet envelope.

An observed pointer appears only for a real value. Marker, localized zone, inspector
swatch, and legend pointer use the same mapping.

## Humidity visualization

Humidity uses one continuous 0–100 %RH value scale with 0, 25, 50, 75, and 100 marks. It
is a visualization scale, not a conformity band. ASHRAE moisture guidance is dew-point
based; moisture assessment is unavailable from RH alone. No fixed RH range is presented
as compliant, safe, or alarming.

## Acoustic diagnostics

`sound_rms_dbfs` and `sound_peak_dbfs` remain digital-domain diagnostics with unit dBFS.
They are not SPL, dBA, Leq, LAeq, or calibrated pressure. A registered microphone may
use a point marker and numeric context, but acoustic data never uses temperature colors
or creates a thermal field.

## 3D viewer contract

The application preserves one Three.js scene, `PerspectiveCamera`, `WebGLRenderer`,
`OrbitControls`, `GLTFLoader`, model root, overlay owner, and `ResizeObserver`. The GLB is
loaded once and reused across spatial contexts.

The viewer uses render-on-demand. Camera interaction, resize, layer changes, selection,
registration preview, and affected current-state updates request rendering; no continuous
animation loop is allowed.

Lighting preserves PBR materials and embedded textures. Neutral environment, key, and
fill illumination keep front, rear, sides, and top readable without crushed black faces
or washed-white materials. No external HDR, material replacement, decorative
environment, emissive glow, or source GLB mutation is allowed.

Spatial zones are bounded translucent fields centered on registered measured points. One
source produces one zone; two sources produce two zones. Overlap is visual only. The
application does not reconstruct a continuous field, interpolate unmeasured space,
simulate airflow, or imply CFD.

## Typography

The native system stack is `"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica
Neue", Arial, sans-serif`. Monospace is limited to IDs, raw values, coordinates,
timestamps, hashes, and exact machine fields. Titles, navigation, status prose, buttons,
and ordinary table content use system sans.

Use 11–12 px for captions, 12–13 px for dense support text, 13–14 px for navigation and
controls, 14–15 px for body/context, and 16–18 px for workspace or strong panel titles.
Weights are approximately 400 regular, 500 labels, and 600 emphasis. Uppercase is
reserved for compact technical eyebrows and legends.

## Color roles

Use warm neutral light surfaces, graphite chrome, dark primary ink, and a restrained
blue-cyan interaction accent. Approximate anchors are `#F1EFED` for application/workspace
neutral, near-white warm neutral for raised surfaces, `#161513` for ink, `#D4CFCA` for
borders, `#2A2F2F` for chrome, and `#006B8F` for interaction.

Green means healthy/available, amber attention, red fault, and gray unavailable/not
observed. Semantic colors are not branding. Measurement gradients encode values, not
alarm states.

## Surface hierarchy

Use three light levels: soft neutral application background, lighter workspace surface,
and near-white raised/context surface. The viewport keeps a cooler engineering neutral
so dark geometry remains legible. The contextual sidebar mediates dark chrome and light
workspaces.

## Spacing

Use an 8 px rhythm: 4 px only for micro gaps, then 8, 16, 24, and 32 px. Density comes
from hierarchy and alignment, not compressed line height or arbitrary padding. Give the
main working surface priority over surrounding chrome.

## Shape/radius

Use 4 px for controls, 6 px for standard engineering panels, and 8 px for larger
contextual surfaces. Shapes remain rectangular. Ordinary controls are not pills and
panels do not use large consumer-card radii.

## Borders/depth

Use subtle 1 px separators and prefer surface hierarchy over nested outlines. Shadows
are absent or limited to quiet separation of a raised context surface. No glass,
decorative glow, or dramatic elevation is allowed.

## Tables

Tables use aligned columns, a slightly stronger header surface, restrained row
separation, tabular numerals, and comfortable vertical density. Borders do not box every
cell unless needed for an engineering matrix. Hover and focus appear only on interactive
rows or controls.

## Charts

Charts use a clear title, metric/unit context, restrained axes, subtle grid lines, and
measured data only. Reference overlays are labeled and distinct from series. Empty charts
retain plotting structure without invented lines or random decoration.

## Empty/unavailable state

Unavailable data appears inside the structure that receives canonical data. Accepted
phrasing includes `Not configured`, `Not observed`, `Unavailable`, `Unregistered`, `No
canonical records observed`, and `No historical series available`.

An empty state explains the missing prerequisite and preserves useful hierarchy,
diagram, table, legend, or chart context. It is not a giant blank region, marketing
illustration, or synthetic dataset.

## Interaction states

Controls have distinct default, hover, focus, active/selected, and disabled states.
Selection uses a restrained accent edge or quiet background, not a large saturated fill.
Disabled controls explain unmet prerequisites where practical. Registration requires
explicit confirmation. Workspace and metric changes preserve canonical state and viewer
ownership.

## Accessibility

- Use semantic links, buttons, radio groups, tables, headings, and definition lists.
- Provide accessible names independent of icons.
- Expose active navigation with `aria-current` and toggle state with native/ARIA state.
- Maintain visible keyboard focus and logical tab order.
- Do not communicate state by color alone.
- Keep text readable at normal zoom and preserve text/control contrast.
- Honor `prefers-reduced-motion`; meaning must not depend on animation.
- Announce changing operational state through restrained live regions where appropriate.

## Responsive behavior

Desktop engineering use is primary. The navigation rail remains compact. At narrower
widths, the context browser may collapse, inspector may overlay, analytics may reduce or
stack, and tables may scroll inside their surface. The viewport remains operable and the
document does not gain horizontal scroll. The layout does not transform into mobile SaaS
cards.

## Performance rules

- Keep one viewer and one current-state owner.
- Load and parse the GLB once.
- Use render-on-demand and update affected overlay objects in place.
- Bound pixel ratio and GPU resource count.
- Dispose owned geometry, material, and texture resources when removed or destroyed.
- Do not add interpolation grids, post-processing, shader frameworks, or chart libraries.

## Data truthfulness rules

- Never fabricate telemetry, timestamps, identities, coordinates, assets, history, or events.
- Preserve `source_ts` separately from server `received_at`.
- Preserve current-state identity `(asset_id, sensor_id, metric)` and exact state version.
- Consume snapshot plus SSE; do not add browser MQTT, polling, WebSocket, or another `EventSource`.
- Do not infer position from identity, metric, geometry appearance, or planned installation.
- Do not call reference geometry surveyed physical geometry.
- Do not claim ANSI/TIA-942-C or ASHRAE conformity from reference labels or one reading.
- Do not convert dBFS diagnostics into physical acoustic units.

## Anti-patterns

The interface excludes duplicated viewers/state/transports/pages; generic card
dashboards; terminal typography for ordinary copy; excessive uppercase or hard grid
borders; neon, glow, glass, and decorative gradients; full-rack fields from sparse
points; placeholder controls; invented topology; browser-generated history/events/alarm
thresholds; and unsupported physical or capability claims.

## R2 scalability

Physical-to-digital observation attaches to the existing reference model through stable
asset, device, sensor, metric, and spatial identities. Canonical measurements populate
Streams, Twin, Mechanical, and Analytics through PostgreSQL, snapshot HTTP, and SSE
without a new workspace hierarchy or browser data path.

Physical installation supplies real identities, secrets, endpoint, bus/network
verification, calibration evidence where required, and sensor positions. These facts
populate existing contracts; they do not require replacement UI architecture.

## Later capability attachment rules

Analysis, simulation, optimization, command, and control attach to existing assets and
systems only after canonical contracts, evidence, safety boundaries, and operator
authorization exist. They do not create parallel navigation merely to advertise
unsupported function. One-way physical-to-digital representation remains active until
product authority explicitly changes it.
