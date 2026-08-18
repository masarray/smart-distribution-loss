# Security Policy

## Supported version

The currently supported public engineering beta is `v0.4.0-beta.1` and newer commits on `main` until a later release supersedes it.

## Processing model

Smart Distribution Loss is a static browser application. The engineering workflow is designed to run locally in the browser using Web Workers, Pyodide, and pandapower. The project does not require an application backend for normal operation.

The first physics run downloads the pinned browser scientific runtime and Python dependencies from their configured public package/CDN sources.

## Sensitive data

Do not use public GitHub issues to attach confidential utility datasets, customer-identifying AMI, credentials, internal network diagrams, or regulated information.

When testing the public beta, prefer synthetic or explicitly authorized datasets. Review organizational policy before loading production utility data into any browser-based engineering tool.

## Reporting a vulnerability

For a security vulnerability that could expose user data, execute unintended code, compromise the static deployment, or materially weaken package integrity:

1. use GitHub's private security-advisory/reporting feature for this repository when available;
2. do not publish exploit details in a public issue before a fix is available; and
3. include the affected commit/version, browser/OS, reproduction steps, and impact.

Ordinary bugs, numerical discrepancies, documentation corrections, and feature requests can use public GitHub issues.

## Scope note

A numerical/modeling limitation is not automatically a software-security vulnerability. Engineering limitations should still be reported when they can produce misleading results, especially if a gate, provenance record, or claim boundary can be bypassed.
