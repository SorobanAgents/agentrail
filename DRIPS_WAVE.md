# Drips Wave — Maintainer Guide & Initial Bounty Queue

This document specifies the setup for **AgentRail** in the **Stellar Drips Wave Program**.

---

## 1. Application Checklist

- [x] **GitHub Organization Host:** `SorobanAgents` (verified organization account).
- [x] **Open-Source License:** [`LICENSE`](LICENSE) (MIT).
- [x] **`FUNDING.json`:** Located at repo root on default branch (`main`).
- [x] **Ecosystem Utility:** Solves the #1 AI Agent settlement and Soroban state rent problem on Stellar.
- [x] **Setup Guide:** 5-minute setup in [`README.md`](README.md).
- [x] **`CONTRIBUTING.md`:** Contribution and Drips Wave complexity rubrics.
- [x] **Issue Template:** [`.github/ISSUE_TEMPLATE/drips_wave_task.md`](.github/ISSUE_TEMPLATE/drips_wave_task.md).
- [x] **Automated CI Matrix:** GitHub Actions workflow with TypeScript strict and Vitest suite.

---

## 2. Initial Scoped Bounty Queue

### Issue 1 — Implement Scoped Allowance Expiration & Spending Cap Verification
**Labels:** `drips-wave`, `complexity: high`, `security`
- **Description:** Implement Soroban smart authorization logic restricting AI agents to a maximum spending cap within a fixed epoch window.
- **Acceptance Criteria:**
  - Enforce max stroop spending limit per session.
  - Reject transactions when allowance epoch has expired.
  - 100% test coverage with Vitest.

### Issue 2 — Automated Soroban State TTL Rent-Bumping Keeper Engine
**Labels:** `drips-wave`, `complexity: high`, `soroban`
- **Description:** Implement an automated keeper utility that monitors Soroban contract instance and storage TTL and executes `extend_ttl` operations before rent archival.
- **Acceptance Criteria:**
  - Calculate remaining ledger thresholds.
  - Determine optimal bump window and fee calculation.
  - Zero network dependency in unit tests.

### Issue 3 — Proof-of-Task Cryptographic Verification and Escrow Release
**Labels:** `drips-wave`, `complexity: high`, `smart-contracts`
- **Description:** Build a cryptographic verification module where an AI service provider submits output SHA-256 hashes to unlock held escrow funds.
- **Acceptance Criteria:**
  - Verify proof payload against escrow commitment hash.
  - Release funds upon valid proof; refund payer after expiration timeout.
  - Complete mock integration tests.

### Issue 4 — Real-Time Micro-Streaming Payment Calculator for LLM Token Fees
**Labels:** `drips-wave`, `complexity: medium`, `sdk`
- **Description:** Add continuous micro-payment calculation supporting sub-cent USDC streams per prompt and token count.
- **Acceptance Criteria:**
  - Convert token counts to stroop amounts with 7 decimal precision.
  - Handle overflow guards and minimum fee assertions.
  - Full unit test coverage.

### Issue 5 — SEP-10 Authentication Challenge Middleware for AI Agent Sessions
**Labels:** `drips-wave`, `complexity: medium`, `stellar`
- **Description:** Implement SEP-10 challenge transaction generation and verification tailored for ephemeral AI agent sub-keypairs.
- **Acceptance Criteria:**
  - Verify challenge signature and home domain attribution.
  - Enforce time bounds (min/max time) for agent authentication tokens.
  - Unit tests with mock Keypairs.

### Issue 6 — Anomaly Spending Detection and Circuit Breaker Module
**Labels:** `drips-wave`, `complexity: medium`, `security`
- **Description:** Implement circuit breaker rules that pause agent allowance when unusual frequency or rapid succession withdrawals are detected.
- **Acceptance Criteria:**
  - Track moving window transaction counts.
  - Trip circuit breaker state when threshold is exceeded.
  - Unit tests for tripped and reset states.

### Issue 7 — AgentRail TypeScript SDK Core Client Wrapper
**Labels:** `drips-wave`, `complexity: medium`, `sdk`
- **Description:** Provide an ergonomic client wrapper (`AgentRailClient`) orchestrating allowance setup, micro-settlement, and balance queries.
- **Acceptance Criteria:**
  - Fluent API for agent developers.
  - Comprehensive TypeScript typings and docstrings.
  - SDK integration tests with mocked Horizon client.

### Issue 8 — Exported Zod Schemas for Agent Protocol Payloads
**Labels:** `drips-wave`, `complexity: trivial`, `good first issue`
- **Description:** Provide reusable Zod schemas for all protocol request and response payloads with informative validation error messages.
- **Acceptance Criteria:**
  - Validate addresses, stroops, epochs, and hashes.
  - Unit tests for valid and malformed inputs.
