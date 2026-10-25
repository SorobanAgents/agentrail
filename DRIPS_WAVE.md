# 🌊 Stellar Drips Wave — Contributor & Maintainer Blueprint

Welcome to the **AgentRail** Drips Wave portal! AgentRail is an open-source protocol built for the **Stellar & Soroban Ecosystem**, sponsored through the Stellar Development Foundation (SDF) Drips Wave program.

---

## 💎 Program Overview

- **Project:** AgentRail Protocol
- **Organization:** [SorobanAgents](https://github.com/SorobanAgents)
- **Flagship Repository:** [SorobanAgents/agentrail](https://github.com/SorobanAgents/agentrail)
- **Settlement Token:** Circle USDC on Stellar & Soroban
- **Maintainer Wallet:** `GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT`

---

## 🎯 Task Complexity & Points Matrix

Every merged Pull Request meeting acceptance criteria awards points tracked through the Stellar Drips Wave indexer:

| Complexity Tag | Definition & Scope | Points per PR |
| :--- | :--- | :---: |
| `complexity: high` / `security` | Major architectural component, smart contract logic, or cryptographic security | **200 Points** |
| `complexity: medium` | Feature adapter, tool integration, or RPC client module | **150 – 200 Points** |
| `complexity: trivial` | Documentation, type schemas, or localized helper utilities | **50 – 100 Points** |

---

## 🗺️ 32-Issue Master Roadmap Index

### Phase 1: Soroban Rust Contracts & Storage
- **[Issue #1](https://github.com/SorobanAgents/agentrail/issues/1):** `[CRITICAL/SECURITY]` Re-entrancy & Signature Replay Defense (200 pts)
- **[Issue #2](https://github.com/SorobanAgents/agentrail/issues/2):** `[CRITICAL]` Automated Soroban State TTL Rent-Bumping Keeper Engine (200 pts)
- **[Issue #3](https://github.com/SorobanAgents/agentrail/issues/3):** `[CRITICAL]` Proof-of-Task Cryptographic Verification & Escrow Release (200 pts)
- **[Issue #4](https://github.com/SorobanAgents/agentrail/issues/4):** `[HIGH/SECURITY]` Scoped Allowance Expiration & Spending Cap Verification (200 pts)
- **[Issue #9](https://github.com/SorobanAgents/agentrail/issues/9):** `[CRITICAL/SOROBAN]` Rust Smart Contract: Scoped Allowance Escrow Core (200 pts)
- **[Issue #17](https://github.com/SorobanAgents/agentrail/issues/17):** `[CRITICAL/SOROBAN]` Comprehensive Contract Unit Test Suite (`soroban-sdk::testutils`) (200 pts)
- **[Issue #18](https://github.com/SorobanAgents/agentrail/issues/18):** `[CRITICAL/SOROBAN]` Time-Locked Multi-Sig Emergency Pause & Drain Circuit Breaker (200 pts)
- **[Issue #19](https://github.com/SorobanAgents/agentrail/issues/19):** `[HIGH/SOROBAN]` Optimized Soroban Ledger Storage Tiering (200 pts)

### Phase 2: Cryptographic Security & Multi-Agent Swarms
- **[Issue #7](https://github.com/SorobanAgents/agentrail/issues/7):** `[MEDIUM]` Anomaly Spending Detection and Circuit Breaker Module (150 pts)
- **[Issue #10](https://github.com/SorobanAgents/agentrail/issues/10):** `[CRITICAL/SECURITY]` Cryptographic Multi-Party Threshold Signature Verification (200 pts)
- **[Issue #15](https://github.com/SorobanAgents/agentrail/issues/15):** `[MEDIUM]` Gas Metering Optimizer & Stroop-to-Compute Benchmarking Suite (150 pts)
- **[Issue #16](https://github.com/SorobanAgents/agentrail/issues/16):** `[MEDIUM]` Soroban Contract Error Code Matrix & Trait Mappings (150 pts)
- **[Issue #30](https://github.com/SorobanAgents/agentrail/issues/30):** `[HIGH/SECURITY]` Ed25519 Hardware Security Module (HSM) & KMS Signer Provider (200 pts)

### Phase 3: Modern AI Framework Adapters
- **[Issue #5](https://github.com/SorobanAgents/agentrail/issues/5):** `[MEDIUM]` Real-Time Micro-Streaming Payment Calculator for LLM Token Fees (150 pts)
- **[Issue #12](https://github.com/SorobanAgents/agentrail/issues/12):** `[HIGH]` LangChain & LlamaIndex AgentTool Integration Module (200 pts)
- **[Issue #13](https://github.com/SorobanAgents/agentrail/issues/13):** `[HIGH]` CrewAI & ElizaOS Multi-Agent Swarm Payment Adapter (200 pts)
- **[Issue #23](https://github.com/SorobanAgents/agentrail/issues/23):** `[CRITICAL/AI]` Vercel AI SDK Core Tool Provider for Agentic Micropayments (200 pts)
- **[Issue #24](https://github.com/SorobanAgents/agentrail/issues/24):** `[HIGH/AI]` AutoGen Multi-Agent Conversational Settlement Adapter (200 pts)
- **[Issue #25](https://github.com/SorobanAgents/agentrail/issues/25):** `[HIGH/AI]` ElizaOS (ai16z) Autonomous Twitter/Discord Agent Rail Plugin (200 pts)
- **[Issue #26](https://github.com/SorobanAgents/agentrail/issues/26):** `[MEDIUM/AI]` Semantic Kernel (Microsoft) Payment Connector for Soroban (150 pts)

### Phase 4: Stellar Ecosystem Proposals (SEPs) & Identity
- **[Issue #6](https://github.com/SorobanAgents/agentrail/issues/6):** `[MEDIUM]` SEP-10 Authentication Challenge Middleware for AI Agent Sessions (150 pts)
- **[Issue #20](https://github.com/SorobanAgents/agentrail/issues/20):** `[HIGH/SEP]` SEP-38 Anchor RFQ Price Quote Integration for Real-Time Currency Swaps (200 pts)
- **[Issue #21](https://github.com/SorobanAgents/agentrail/issues/21):** `[HIGH/SEP]` SEP-24 Interactive Deposit & Withdrawal Flow Bridge (200 pts)
- **[Issue #22](https://github.com/SorobanAgents/agentrail/issues/22):** `[MEDIUM/SEP]` SEP-01 stellar.toml Specification & Validator Discovery Host (150 pts)

### Phase 5: Infrastructure, Observability & DevEx
- **[Issue #8](https://github.com/SorobanAgents/agentrail/issues/8):** `[TRIVIAL]` Export Reusable Zod Schemas for Agent Protocol Request & Response Payloads (100 pts)
- **[Issue #11](https://github.com/SorobanAgents/agentrail/issues/11):** `[HIGH]` Soroban RPC Event Poller & WebSocket Real-Time Stream Engine (200 pts)
- **[Issue #14](https://github.com/SorobanAgents/agentrail/issues/14):** `[MEDIUM]` CLI Runner: AgentRail Local Sandbox & Testnet Faucet Provisioner (150 pts)
- **[Issue #27](https://github.com/SorobanAgents/agentrail/issues/27):** `[HIGH/INFRA]` Real-Time Soroban RPC Transaction Receipt Poller with Exponential Jitter (200 pts)
- **[Issue #28](https://github.com/SorobanAgents/agentrail/issues/28):** `[MEDIUM/INFRA]` Prometheus & OpenTelemetry Metrics Exporter for Agent Settlement Latency (150 pts)
- **[Issue #29](https://github.com/SorobanAgents/agentrail/issues/29):** `[MEDIUM/INFRA]` Local Standalone Mock Soroban RPC Server for Offline Unit Testing (150 pts)
- **[Issue #31](https://github.com/SorobanAgents/agentrail/issues/31):** `[MEDIUM/DEVEX]` Interactive Web Playground & Visual Transaction Flow Simulator (150 pts)
- **[Issue #32](https://github.com/SorobanAgents/agentrail/issues/32):** `[MEDIUM/DEVEX]` Comprehensive API Reference Documentation Generator with TypeDoc (150 pts)

---

## 🛡️ Autonomous CI Quality & Anti-Drainer Security Guard

All contributions are automatically audited by the **AgentRail CI Guard**:
- **Strict TypeScript:** `npm run lint` (`tsc --noEmit`)
- **Anti-Drainer Static Analysis:** `npm run security:check` (0 dynamic code execution, 0 shell injections, 0 webhook exfiltration)
- **Unit & Invariant Verification:** `npm test` (100% Vitest passing)
- **Production Build:** `npm run build`
