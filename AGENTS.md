# DT_DataCenter Engineering Rules

Project: Digital Twin Data Center Laboratorium Kampus
Identifier: DT_DataCenter
Project root: E:\Projects\Digital_Twin
Owner/admin identifier: bagus
Active maturity: R1 Representation only
Out of current scope: R2, R3, R4
Physical scope: one rack in the lower rack/server environment
Measurement and communication MCU: ESP32-S3 board carrying ESP32-S3-WROOM-1-N16R8
Environmental sensors: 2x DFRobot Fermion SHT31 SEN0331 and INMP441

## Execution

Work as a senior engineer. Prefer correctness, stability, simplicity, maintainability, and predictable behavior over novelty.

Use the simplest correct implementation. Apply YAGNI. Prefer existing project capabilities, standard libraries, native platform features, and existing dependencies before adding new abstractions or dependencies.

Do not overengineer.

Do not add tutorial comments, generic explanations, decorative comments, or AI narration to source code.

Comments are allowed only for non-obvious constraints, invariants, protocol behavior, security reasoning, important workarounds, or decisions another senior engineer cannot infer from the code.

When an error occurs, identify the root cause and continue until the problem is resolved. Start with the most recent relevant change. If necessary, inspect the complete relevant call path, configuration, dependency chain, and logs.

Do not repeatedly validate unchanged working components.

A real error may be investigated immediately.

## Development Priority

Functional correctness comes before presentation.

Reuse completed hardware-neutral infrastructure. Implement only the subsystem authorized by the current task and respect its physical/software gates.

Do not begin substantial frontend implementation until the backend and relevant integrations are stable.

Before substantial frontend work begins, the relevant backend functional test or backtest must complete successfully twice.

## Platform

Measurement and communication MCU:
ESP32-S3 board carrying ESP32-S3-WROOM-1-N16R8

Configured module assumptions:
16 MB Flash and 8 MB Octal PSRAM; physical module marking remains unverified

Temperature and humidity sensors:
2x DFRobot Fermion SHT31 SEN0331, digital I2C

Sensor A: I2C0, SDA GPIO8, SCL GPIO9, 100 kHz, high repeatability, 1 Hz, CRC required

Sensor B: I2C1, SDA GPIO10, SCL GPIO11, 100 kHz, high repeatability, 1 Hz, CRC required

Microphone:
INMP441, digital I2S MEMS, 24-bit source, 48 kHz target; WS GPIO4, BCLK GPIO5, DIN GPIO6, L/R tied to GND for the left channel. Philips I2S uses two 32-clock slots per frame; target BCLK is 3.072 MHz. Wiring and clocks remain physically unverified.

Locked path:
SEN0331 A → I2C0 → ESP32-S3
SEN0331 B → I2C1 → ESP32-S3
INMP441 → I2S → ESP32-S3
ESP32-S3 → Wi-Fi/MQTT → server

ESP32-S3 owns authoritative acquisition, validation, measurement processing, Wi-Fi, and MQTT. SEN0331 and INMP441 provide digital inputs; the ESP32 ADC is not used for the current mechanical sensors.

`docs/contracts/foundation.md` defines canonical source identity and telemetry mapping. Preserve the existing server telemetry schema.

Physical module marking, SEN0331 address-selection state, I2C electrical verification, physical sensor placement, INMP441 wiring/clock verification, microphone calibration, SPL/dBA/Leq policy, clock synchronization/provisioning mechanisms, and production network/server configuration remain TBD.

The active firmware project is `firmware/esp32s3_datacenter` and uses ESP-IDF 5.5.5.

Messaging:
MQTT

Relational database:
PostgreSQL

Observability:
Prometheus
Windows Exporter
Grafana

Web 3D:
Three.js
WebGL
glTF/GLB

## Project Environment

Keep project source and project data under:
E:\Projects\Digital_Twin

Prefer development tools on D: when practical.

The laptop is used for development, configuration, testing, and deployment preparation.

The physical project scope is the lower rack/server environment. The upper server is reserved for supervisor research and MUST NOT be accessed, probed, configured, tested against, deployed to, or modified by this project.

Final runtime targets the campus data-center server.

Keep configured Windows services manual-start unless project requirements explicitly change.

Use the existing Start Digital Twin and Stop Digital Twin launchers for the local runtime where applicable.

## Data

Do not generate fake production sensor data merely to make functionality appear complete.

Controlled test fixtures are allowed only when explicitly required for testing and must be clearly separated from production data.

## Frontend

Frontend functionality must follow design.md when that file exists.

Avoid generic AI visual design.

Do not use unnecessary purple-blue gradients, excessive glow, generic glassmorphism, decorative cards, or visual effects without functional purpose.

Prioritize usability, information hierarchy, responsive behavior, accessibility, performance, and clarity.

## Git

Do not use git add . blindly.

Never commit credentials, passwords, secrets, database files, logs, cache, backups, generated artifacts, or build output.

Before destructive Git operations, identify the active repository, branch, remote, and scope.

Do not force-push, destructively reset, delete branches, delete remote repositories, or modify remotes without explicit user approval.

For now, DT_DataCenter is the priority project for GitHub publication.

Existing local projects must not be deleted merely because their remote repositories may later be cleaned up.

## Project Documents

AGENTS.md defines engineering execution rules.

PRD defines what the product must do.

design.md defines frontend visual and interaction direction.

Do not invent requirements that belong in the PRD.

## Commit and push approval

- Never commit or push changes autonomously.
- After completing a change, stop before commit and show the repository status, changed files, and relevant diff for user review.
- The user performs `git commit` and `git push` manually.
- Codex may execute a commit or push only when the user gives explicit approval for that specific commit or push.
- Previous approval does not authorize future commits or pushes.
- Never force-push, merge, delete branches, delete repositories, or modify remotes without explicit user approval.
- Before any approved commit, show `git status`, staged files, and the relevant staged diff.
- Before any approved push, show the target repository, remote, branch, and commits that will be pushed.
- If there is any uncertainty about repository, branch, remote, staged files, or scope, stop and ask the user.
