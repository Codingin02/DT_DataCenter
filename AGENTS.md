# DT_DataCenter Engineering Rules

Project: Digital Twin Data Center Laboratorium Kampus
Identifier: DT_DataCenter
Project root: E:\Projects\Digital_Twin
Owner/admin identifier: bagus
Primary MCU: ESP32-S3

## Execution

Work as a senior engineer. Prefer correctness, stability, simplicity, maintainability, and predictable behavior over novelty.

Use the simplest correct implementation. Apply YAGNI. Prefer existing project capabilities, standard libraries, native platform features, and existing dependencies before adding new abstractions or dependencies.

Do not overengineer.

Do not add tutorial comments, generic explanations, decorative comments, or AI narration to source code.

Comments are allowed only for non-obvious constraints, invariants, protocol behavior, security reasoning, important workarounds, or decisions another senior engineer cannot infer from the code.

When an error occurs, identify the root cause and continue until the problem is resolved. Start with the most recent relevant change. If necessary, inspect the complete relevant call path, configuration, dependency chain, and logs.

Do not repeatedly validate unchanged working components.

Normal implementation checkpoints occur after steps 5, 10, 15, 20, and so on.

A real error may be investigated immediately.

## Development Priority

Functional correctness comes before presentation.

Development order:
1. system architecture and contracts;
2. firmware and device communication;
3. MQTT data flow;
4. backend;
5. database;
6. observability;
7. integration;
8. frontend and 3D presentation.

Do not begin substantial frontend implementation until the backend and relevant integrations are stable.

Before substantial frontend work begins, the relevant backend functional test or backtest must complete successfully twice.

## Platform

Primary firmware framework:
ESP-IDF

Primary MCU:
ESP32-S3

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
