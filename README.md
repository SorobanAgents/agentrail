# AgentRail Protocol 🛰️🤖

[![CI](https://github.com/SorobanAgents/agentrail/actions/workflows/ci.yml/badge.svg)](https://github.com/SorobanAgents/agentrail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stellar Wave: Ready](https://img.shields.io/badge/Stellar%20Wave-Bounty%20Ready-6C4DF6.svg)](DRIPS_WAVE.md)
[![Stellar Testnet: Deployed](https://img.shields.io/badge/Stellar%20Testnet-CA3LFXTR...-00D4B2.svg?logo=stellar)](https://stellar.expert/explorer/testnet/contract/CA3LFXTRQTQBH77W6MWZGLJJUZGCG5GJQOR447ZKM2666LDDUV6JZ5GG)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict-3178C6.svg)](tsconfig.json)

**Autonomous AI Agent Scoped-Allowance & Micro-Settlement Protocol on Stellar & Soroban.**

AgentRail is the missing autonomous economic layer for AI agents. It gives autonomous LLM agents and multi-agent meshes the ability to stream sub-cent payments, pay for inference and data APIs, and contract work via Soroban smart contracts — **without exposing master private keys or requiring human popup clicks**.

---

## 🪐 Live Soroban Testnet Deployment

The AgentRail Core Smart Contract is compiled, optimized (15.6 KB wasm), and live on **Stellar Testnet**:

| Parameter | On-Chain Verification |
| :--- | :--- |
| **Network** | Stellar Testnet (`Test SDF Network ; September 2015`) |
| **Contract ID** | [`CA3LFXTRQTQBH77W6MWZGLJJUZGCG5GJQOR447ZKM2666LDDUV6JZ5GG`](https://stellar.expert/explorer/testnet/contract/CA3LFXTRQTQBH77W6MWZGLJJUZGCG5GJQOR447ZKM2666LDDUV6JZ5GG) |
| **WASM Hash (SHA-256)** | `4f0321beab2695e315f6488b404f8124b081ecbbe69be9ed565a4e78f97f23d6` |
| **WASM Upload Tx** | [`7708234f2ebdee2403f5bd97881d49a7fda5c069e4a728a91ad96e9ce6e537c2`](https://stellar.expert/explorer/testnet/tx/7708234f2ebdee2403f5bd97881d49a7fda5c069e4a728a91ad96e9ce6e537c2) |
| **Contract Creation Tx** | [`5867db529f63a50bf90138e8873e25ad719e57002108adc4e3c0ad10297f4044`](https://stellar.expert/explorer/testnet/tx/5867db529f63a50bf90138e8873e25ad719e57002108adc4e3c0ad10297f4044) |
| **Deployer Address** | `GDQZK73NVQCDJTTUMOOLF7IZ55IY4GS2TF6SNE7P7DVJ7XWICYAGJJA5` |
| **Soroban SDK Version** | `27.0.2` (Target: `wasm32v1-none`) |

---

## ⚡ The Problem: Why Traditional Crypto Wallets Fail for AI

1. **Master Key Vulnerability:** Giving an autonomous agent full custody of a root private key (`S...`) means a single prompt injection or hallucination can drain the entire treasury.
2. **Human Popups Break Autonomy:** Standard browser extensions (Freighter, MetaMask) require manual 2FA clicks, completely breaking 24/7 background AI agents.
3. **Gas Fees Kill Micropayments:** Ethereum ($2–$10 gas) and Solana congestion make $0.0001 per-query inference payments economically impossible.
4. **Soroban State Archival (TTL Rent):** Soroban smart contracts and storage freeze if time-to-live (TTL) ledgers expire without active rent bumping.

---

## 🚀 The Solution: How AgentRail Works

```mermaid
sequenceDiagram
    autonumber
    actor Human as Human Master / Treasury
    participant Vault as AgentRail Soroban Vault
    participant Agent as Autonomous AI Agent
    participant Service as AI API / Data Provider

    Human->>Vault: Provision Scoped Allowance (Max 10 USDC, 24h Epoch)
    Vault-->>Agent: Grant Ephemeral Session Authorization
    Agent->>Service: Query Data / Compute Task
    Service-->>Agent: Return Output + Invoice (0.001 USDC)
    Agent->>Vault: Spend Request (Signed by Session Key)
    Vault->>Vault: Verify Epoch, Limit & Destination
    Vault->>Service: Settle Instant Micro-Payment (3s Finality)
```

---

## 🌟 Key Architecture & Capabilities

- **🔐 Cryptographic Scoped Allowances:** Time-bounded, maximum-spend capped allowances stored in Soroban smart contracts with designated routing rules.
- **⚡ Sub-Cent Real-Time Streaming:** Sub-second payment calculations for pay-as-you-prompt inference fees in native Circle USDC on Stellar.
- **🛡️ Proof-of-Task Escrow:** Decentralized SHA-256 output verification ensuring funds are only released when verifiable outputs are delivered.
- **🔄 Autonomous State TTL Keeper:** Continuous Soroban ledger monitoring and automated rent extension preventing state archival freeze.

---

## ⏱️ 5-Minute Quickstart

Clone the repository and run the test suite locally:

```bash
git clone https://github.com/SorobanAgents/agentrail.git
cd agentrail
npm install
npm test
npm run build
```

---

## 📦 SDK Usage Example

```typescript
import { AgentRailClient, usdcToStroops } from "@soroban-agents/agentrail";

const client = new AgentRailClient();

// 1. Provision a scoped allowance for an autonomous agent
client.registerAllowance({
  id: "agent-session-001",
  ownerPublicKey: "GOWNER...",
  agentPublicKey: "GAGENT...",
  maxStroops: usdcToStroops("10.00"), // 10 USDC ceiling
  spentStroops: 0n,
  validFrom: Math.floor(Date.now() / 1000),
  validUntil: Math.floor(Date.now() / 1000) + 86400, // 24 hours
  active: true,
});

// 2. Autonomous agent authorizes a micro-payment for API inference
const result = client.spend({
  allowanceId: "agent-session-001",
  agentPublicKey: "GAGENT...",
  destination: "GAPIPROVIDER...",
  amountStroops: usdcToStroops("0.0025"), // $0.0025 per query
  timestamp: Math.floor(Date.now() / 1000),
});

console.log("Spend Status:", result.code, "Remaining:", result.remainingStroops);
```

---

## 🌊 Stellar Drips Wave Program

AgentRail participates in the **Stellar Drips Wave Program**.

- **Application Checklist & Bounty Queue:** See [`DRIPS_WAVE.md`](DRIPS_WAVE.md) for initial scoped tasks.
- **Contributor Guidelines:** See [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **On-Chain Claim:** Compliant [`FUNDING.json`](FUNDING.json) at repo root.

---

## 📄 License

Licensed under the [MIT License](LICENSE).
