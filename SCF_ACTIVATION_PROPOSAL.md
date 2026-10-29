# Stellar Community Fund (SCF) — Activation Award Proposal 🛰️

## Project Overview

- **Project Name:** AgentRail
- **Tagline:** Autonomous AI Agent Scoped-Allowance & Micro-Settlement Protocol on Soroban
- **Organization / Repository:** [SorobanAgents/agentrail](https://github.com/SorobanAgents/agentrail)
- **Live Testnet Contract:** [`CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6`](https://stellar.expert/explorer/testnet/contract/CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6)
- **Interactive Web Simulator:** [https://sorobanagents.github.io/agentrail/](https://sorobanagents.github.io/agentrail/)
- **Track:** Activation Award ($15,000 in USDC / XLM)
- **Duration:** 60 Days (2 Milestones)
- **Applicant:** Mukesh Biswas (`sparkysolutions10-pixel` / Sparky Solutions)
- **Discord Handle:** `mukesh_sparky` (Stellar Devs Discord: `#scf-general`)

---

## 1. Executive Summary & Problem Statement

As autonomous AI agents (powered by LLM frameworks such as ElizaOS, LangChain, AutoGen, and CrewAI) transition from passive text chatbots into active economic actors, they urgently require the ability to conduct **sub-cent, programmatic micropayments** to purchase data, pay for model inference, trigger compute jobs, and contract peer agents.

However, traditional Web3 infrastructure presents critical security and economic roadblocks for autonomous agents:

1. **Root Key Custody Vulnerability:** Granting an autonomous agent root custody of a private key (`S...`) exposes the entire treasury. A single prompt injection attack, hallucination, or logic flaw can result in total balance drainage.
2. **Interactive Wallet Prompts Break Autonomy:** Standard Web3 browser extensions (e.g. Freighter, MetaMask) rely on interactive user confirmation popups. Fully autonomous, 24/7 background agents cannot click human confirmation modals.
3. **Prohibitive Transaction Fees on Other L1s:** Gas fees on Ethereum ($2–$10) or network congestion on other networks make streaming $0.0005 per-query micro-settlements economically infeasible.
4. **Soroban State Archival Hazards:** Smart contract state on Soroban requires active Time-to-Live (TTL) rent management. Without automated TTL bumping, an agent's allowance state risks archival freeze during critical execution windows.

---

## 2. The Solution: Why Stellar & Soroban?

**AgentRail** solves these challenges by establishing an autonomous economic layer natively on Soroban:

- **Cryptographic Scoped Allowances:** Human treasury managers or smart contracts provision time-bounded, maximum-spend allowances to ephemeral agent session keys. Agents can autonomously sign micro-transactions without ever touching master private keys.
- **Strict Budget & Velocity Caps:** Allowances enforce maximum cumulative spend limits, epoch time windows (validFrom / validUntil), and explicit destination whitelist filters directly inside Soroban contract storage.
- **Circuit Breaker Emergency Freeze:** If an agent encounters anomalous behavior, the allowance owner can instantly pause spending with single-transaction finality.
- **Why Stellar?**
  - **Sub-Second Finality (3-5s):** Enables real-time pay-as-you-go inference streams.
  - **Fraction-of-a-Cent Fees (~0.00001 XLM):** Makes sub-cent machine-to-machine micro-settlements economically viable.
  - **Predictable State Rent Model:** Soroban's TTL architecture allows AgentRail to implement automated rent extension keepers.
  - **Native USDC Liquidity:** Direct settlement in Circle USDC on Stellar without fragile cross-chain bridges.

---

## 3. Current Progress & Proof of Execution

AgentRail is **NOT** a theoretical concept. Prior to requesting grant funding, we have already developed, tested, and deployed a fully working testnet prototype:

- **Soroban Smart Contract (Rust):**
  - Compiled and optimized to **20.7 KB wasm** (`wasm32v1-none`).
  - **27 automated Rust contract unit tests** covering allowance provisioning, balance deduction, epoch validation, unauthorized signer rejection, circuit breaker pause/unpause, 20 bps protocol fee routing, and TTL rent bumping.
  - **100% test pass rate** (`cargo test` -> 27 passed, 0 failed).
- **TypeScript SDK:**
  - Written in strict TypeScript with comprehensive type safety.
  - **29 automated tests** via Vitest covering client allowance registration, spend authorization, velocity limits, and error handling.
- **Live Stellar Testnet Deployment:**
  - Contract ID: [`CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6`](https://stellar.expert/explorer/testnet/contract/CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6)
  - Deployer: `GDQZK73NVQCDJTTUMOOLF7IZ55IY4GS2TF6SNE7P7DVJ7XWICYAGJJA5`
  - Treasury: `GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT`
  - Protocol Fee: 20 bps (0.20% routed automatically to treasury).
- **Interactive Web Simulator Dashboard:**
  - Deployed at [`https://sorobanagents.github.io/agentrail/`](https://sorobanagents.github.io/agentrail/)
  - Features real-time Freighter testnet wallet connection, interactive allowance vault creation, emergency pause toggle, real-time micro-spend triggers, 10x swarm burst simulation, and live Soroban event logging.

---

## 4. Architecture & Technical Design

```
+--------------------------------------------------------------------------+
|                        HUMAN TREASURY / DAPP                             |
|  - Holds Master Account (GDQZ...JJA5)                                    |
|  - Provisions Scoped Allowance via Soroban Contract                      |
+-------------------------------------+------------------------------------+
                                      |
                                      v
+--------------------------------------------------------------------------+
|                     AGENTRAIL SOROBAN SMART CONTRACT                     |
|                   (CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJF...)                 |
|  - Allowance Vault: (Owner, AgentSessionKey, MaxStroops, Spent, Epoch)   |
|  - Security: Only designated agent key can spend within active epoch     |
|  - Circuit Breaker: Emergency pause flag disables unauthorized drains    |
|  - Fee Engine: 20 bps split (99.8% to Service, 0.2% to Protocol Treasury)|
|  - TTL Keeper: Automated ledger extension prevents state archival       |
+-------------------+-----------------------------------+------------------+
                    |                                   |
                    v                                   v
+--------------------------------------+  +--------------------------------+
|        AUTONOMOUS AI AGENT           |  |       API / SERVICE HOST       |
|  - Holds ephemeral session key       |  |  - Receives micro-settlement   |
|  - Autonomous spend(allowance_id,    |  |  - Delivers inference / data   |
|    amount, destination)              |  |    output without human 2FA    |
+--------------------------------------+  +--------------------------------+
```

---

## 5. Milestones & Deliverables

### Milestone 1: Core Protocol Hardening, Testnet Validation & Live Visualizer (Month 1 — $7,500)
- **Status:** Complete & Ready for Verification
- **Deliverables:**
  1. **Rust Soroban Core Contract:** Finalized smart contract implementing scoped allowances, epoch time boundaries, cumulative spend tracking, 20 bps protocol fee split, and emergency circuit breaker.
  2. **Comprehensive Test Suite:** 27 Rust unit tests and 29 TypeScript SDK tests verifying all security boundaries, reentrancy guards, and error codes.
  3. **Stellar Testnet Deployment:** Live verified contract deployed and initialized on Stellar Testnet (`CBSWWN2...`).
  4. **Interactive Web Simulator:** Live browser visualizer on GitHub Pages allowing anyone in the Stellar community to connect Freighter, create an allowance, test micro-spends, and inspect contract events.
  5. **Open Source Documentation & CI:** Complete setup documentation, test instructions, and GitHub Actions CI workflow running on every commit.

### Milestone 2: AI Agent Framework Adapters & Developer Onboarding (Month 2 — $7,500)
- **Status:** In Progress
- **Deliverables:**
  1. **Official npm SDK Package:** Publish `@soroban-agents/agentrail` to npm with full TypeScript definitions, ESM/CJS dual-build, and zero-config RPC clients.
  2. **ElizaOS & LangChain Plugin Adapters:** Ready-to-use tool definitions allowing AI agent developers to plug Stellar micro-payments into ElizaOS or LangChain agents with 3 lines of code.
  3. **Automated Soroban TTL Keeper Daemon:** A lightweight background worker utility that monitors active agent allowances and automatically triggers ledger rent bumping.
  4. **SEP-10 Session Authentication Guide:** Reference implementation showing how web services can verify agent identity and allowance proofs via Stellar SEP-10.
  5. **Public Video Walkthrough & Tutorial:** Step-by-step video demonstration showcasing an autonomous agent buying inference on Stellar Testnet with zero human intervention.

---

## 6. Budget Breakdown ($15,000 USD)

| Item | Allocation | Description |
| :--- | :--- | :--- |
| **Smart Contract Engineering & Security Audit** | $5,000 | Soroban contract development, formal invariant testing, fuzzing, and gas optimization |
| **Agent SDK & Framework Adapters** | $4,500 | TypeScript SDK, ElizaOS plugin, LangChain tool bindings, and npm package packaging |
| **Frontend Visualizer & Tooling** | $3,000 | Interactive testnet simulator, Freighter wallet integration, and live event monitoring |
| **Documentation, Video Tutorials & DevRel** | $2,500 | Developer quickstart guides, architecture runbooks, video tutorial, and community support |
| **Total** | **$15,000** | Paid upon milestone delivery according to SCF Activation guidelines |

---

## 7. Community & Ecosystem Impact

1. **New Use Case on Stellar:** Positions Stellar and Soroban as the go-to layer for the burgeoning Autonomous Agent Economy.
2. **Developer Adoption:** Gives AI developers an out-of-the-box payment rail that eliminates the need to build custom wallet management logic.
3. **Transaction Volume:** Every autonomous agent query drives micro-transactions on the Stellar network, increasing on-chain ledger activity and utility.
4. **100% Open Source:** Licensed under MIT, built transparently under [SorobanAgents](https://github.com/SorobanAgents).
