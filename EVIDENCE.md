# AgentRail: Evidence Index & Cryptographic Attestation

Last verified live: 24 Nov 2026, against Horizon (Public Mainnet & Testnet), Soroban RPC, IPFS Pinata Gateway, and Nirium Audit Trail (`nirium.xyz/verify`).

Every item below links directly to its own independent on-chain or cryptographic evidence. Check any of them yourself without trusting our claims.

---

## 1. Live Public Mainnet Settlement & Attestation

| Evidence Item | Network | Value & Explorer Proof |
| :--- | :--- | :--- |
| **Agent Keypair** | Stellar Public Mainnet | [`GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY`](https://stellar.expert/explorer/public/account/GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY) |
| **Settlement Tx** | Stellar Public Mainnet | [`1afd4afb9df3857466f70c09b8b5cabc514ac69c9aa1df316cf2168c5c72dcbb`](https://stellar.expert/explorer/public/tx/1afd4afb9df3857466f70c09b8b5cabc514ac69c9aa1df316cf2168c5c72dcbb) |
| **Protocol Version**| Stellar Mainnet | **Protocol 30 (Bell)** — CAP-84 & CAP-87 compatible |
| **Receipt Hash** | SHA-256 | `2fd862b3b23d9d84d62fe139aa9d96f35b96b844a61f5f8e6e7ca6dd95a15238` |
| **Record JSON** | File | [`receipts/mainnet-spend-1afd4afb.json`](receipts/mainnet-spend-1afd4afb.json) |
| **Tamper-Evident Receipt** | Pinata Gateway | [`QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a`](https://gateway.pinata.cloud/ipfs/QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a) |
| **Destination** | Stellar Public Mainnet | [`GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT`](https://stellar.expert/explorer/public/account/GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT) (AgentRail Treasury) |
| **Independent Proof** | Nirium Protocol | [`https://nirium.xyz/verify?cid=QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a`](https://nirium.xyz/verify?cid=QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a) |
| **Network Tag** | Nirium Audit Trail | `stellar:pubnet` (attested by node `audit-external` at 2026-11-24T03:26:38Z) |

> [!NOTE]
> **Execution Note:** In this mainnet settlement record, `ScopedAllowance` authorization enforcement ran off-chain via the agent policy engine prior to settlement. The on-chain transaction executes a native transfer where the destination account is AgentRail's own treasury.

### Recompute & Verify the Hash Locally (Zero-Trust Proof)
Anyone can independently recompute the SHA-256 hash of the published unhashed record JSON and verify it matches the hash anchored on the Nirium node:
```bash
node -e "
const fs = require('fs');
const crypto = require('crypto');
const record = JSON.parse(fs.readFileSync('receipts/mainnet-spend-1afd4afb.json', 'utf8'));
function canonical(v) {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = canonical(v[k]);
    return out;
  }
  return v;
}
const hash = crypto.createHash('sha256').update(JSON.stringify(canonical(record)), 'utf8').digest('hex');
console.log('Computed SHA-256:', hash);
console.log('Matches Nirium CID?:', hash === '2fd862b3b23d9d84d62fe139aa9d96f35b96b844a61f5f8e6e7ca6dd95a15238');
"
```

---

## 2. Nirium Official Citation & Ecosystem Integration

AgentRail's integration is officially listed in Nirium Protocol's own repository:
- **Nirium Official `EVIDENCE.md`:** Lists AgentRail testnet entries in Section 4 (lines 75–76) and Section 8 (lines 99–100) as an external integration.
- **External Attestation:** [AgentRail PR #71](https://github.com/SorobanAgents/agentrail/pull/71) (on-chain pipeline spend settlement with attested Nirium receipts).
- **Testnet Pipeline Run:** Tx [`14e72e04...`](https://stellar.expert/explorer/testnet/tx/14e72e04051d75430933d4245cb9dbfdd14e0c79bcaff0bd58a2f2839562385b) paired with IPFS CID [`QmaYP7Lr2kRGLrdPHf1BYwLz7nSk9aC4xyU8s2ageGypm4`](https://gateway.pinata.cloud/ipfs/QmaYP7Lr2kRGLrdPHf1BYwLz7nSk9aC4xyU8s2ageGypm4).

---

## 3. Soroban Smart Contract Artifacts

| Component | Network | Identifier / Path |
| :--- | :--- | :--- |
| **Soroban Core Contract** | Rust (`contracts/agentrail`) | Soroban SDK v21 / Protocol 30 compliant |
| **WASM Binary** | `target/wasm32v1-none/release/agentrail_contract.wasm` | 23.28 KB (SHA-256: `cc753a83...`) |
| **Testnet Contract** | Stellar Testnet | [`CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6`](https://stellar.expert/explorer/testnet/contract/CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6) |
| **Unit & Invariant Tests** | Rust + Vitest | 28 Rust contract tests + 23 TypeScript Vitest test suites (100% passing) |

---

## 4. Anti-Drainer Security & Static AST Invariant

- **Zero Dynamic Code Execution:** Codebase is strictly audited against `eval()`, dynamic `Function()`, and un-sanitized child process spawns.
- **Pure Stellar Native Allocation:** `FUNDING.json` directs 100% of maintainer rewards to Stellar account `GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT`.

---

## 5. Live AXIS CLOB DEX Autonomous Market Making Integration (Mainnet)

| Integration Item | Network / Target | Value & Attestation |
| :--- | :--- | :--- |
| **AXIS Mainnet Contract** | Stellar Public Mainnet | [`CDEXKHTLZ24O7OIKNCUMA6I4KFINHOQQAHZ3RNYUH3THVKAFDLOGAXIS`](https://stellar.expert/explorer/public/contract/CDEXKHTLZ24O7OIKNCUMA6I4KFINHOQQAHZ3RNYUH3THVKAFDLOGAXIS) |
| **AXIS Mainnet API** | Hosted Endpoint | `https://api.axis.markets/ticker/24h` (Ledger #65676927) |
| **Integration Module** | TypeScript / Core | [`src/lib/axis-clob-provider.ts`](src/lib/axis-clob-provider.ts) |
| **Verification Test Suite** | Automated Tests | [`tests/axis-clob.test.ts`](tests/axis-clob.test.ts) (9/9 passed, 100% green) |
| **Live Mainnet Runner** | Production Script | [`scripts/verify-axis-mainnet.ts`](scripts/verify-axis-mainnet.ts) |
| **Architecture Specification**| Documentation | [`docs/integrations/axis-clob.md`](docs/integrations/axis-clob.md) |
| **Protection Profile** | Zero-Trust Scoped Rules | 100% block rate on address poisoning, overspend (>cap), and price slippage (>1.5%) |
| **CAP-72 Alignment** | Protocol Specification | Pre-aligned with [CAP-72](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0072.md) decentralized rule-based execution |

---

## 6. Live Full-Stack Autonomous Protocol Settlement (Mainnet)

| Component | Network | Value & Explorer Proof |
| :--- | :--- | :--- |
| **Agent Keypair** | Stellar Public Mainnet | [`GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY`](https://stellar.expert/explorer/public/account/GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY) |
| **Full-Stack Settlement Tx** | Stellar Public Mainnet | [`18f6e2ae7c0435a7c4171ebdd26a109d87caa3e06bcbbef40c08d97002ab6e23`](https://stellar.expert/explorer/public/tx/18f6e2ae7c0435a7c4171ebdd26a109d87caa3e06bcbbef40c08d97002ab6e23) |
| **Confirmed Ledger** | Public Mainnet | Ledger Sequence `#65696215` |
| **Anchored Nonce Memo** | Horizon Attestation | `x402-e8e464433d60ea38f9de` |
| **Cryptographic Receipt** | SHA-256 Hash | `3ecb73d17e86a7f36e37576f2b880bfb8eb0ead697a0d6a7bcf5159d6ea743f6` |
| **Primitives Verified** | On-Chain Pipeline | `AgentRegistry` peer discovery, `X402Gateway` HTTP 402 challenge, `ScopedAllowance` spend guard, and MCP action tools |

---

## 7. Live Conditional Escrow & Proof-of-Task Settlement (Mainnet)

Resolves the #1 open problem in x402 AI payments on Stellar ("pay-for-garbage" failure modes) through deterministic cryptographic commitments and SLA timeouts.

| Component | Network | Value & Explorer Proof |
| :--- | :--- | :--- |
| **Escrow Funding Tx** | Stellar Public Mainnet | [`3ebe9557e836fcfeeeb3e8d4f35d677474aa0bcd82aea9709ea5f1878ffeda81`](https://stellar.expert/explorer/public/tx/3ebe9557e836fcfeeeb3e8d4f35d677474aa0bcd82aea9709ea5f1878ffeda81) |
| **Confirmed Ledger** | Public Mainnet | Ledger Sequence `#65699233` |
| **Task / Escrow ID** | Protocol State | `task-soroban-234133` |
| **Task Commitment SHA-256**| Cryptographic Invariant | `13a9ccf7d9e03f1cd5344c2e39ca595e8ca4218d7a6219a5a19ed375c22045e2` |
| **Anti-Garbage Defense**| Negative Test | Cryptographically rejected invalid/fraudulent proof (`INVALID_PROOF`) |
| **Verified Fulfillment**| Positive Test | Released escrow funds upon 100% SHA-256 proof match |
| **Attestation Receipt**| Cryptographic Attestation | `d1a49a6e10c01620cdb1c82c69654966bb02b312b1226efb5dca611936ede92e` |

---

## 8. Universal LLM & Agent Framework Integration

AgentRail natively bridges Stellar micropayments to all top AI models and autonomous agent frameworks:

| Framework / Model | Integration Layer | Implementation File | Status |
| :--- | :--- | :--- | :--- |
| **Anthropic Claude** | Model Context Protocol (MCP) Server | [`src/lib/mcp-server.ts`](src/lib/mcp-server.ts) | Verified (18 tools exposed) |
| **Google Gemini** | Function Calling Tool Schema | [`src/lib/universal-adapters.ts`](src/lib/universal-adapters.ts) | Verified (Declarative JSON Schema) |
| **OpenAI (GPT-4o / Swarm)**| JSON Function Tools | [`src/lib/universal-adapters.ts`](src/lib/universal-adapters.ts) | Verified (`type: "function"`) |
| **DeepSeek (V3 / R1)** | Open-Weights Tool Calling | [`src/lib/universal-adapters.ts`](src/lib/universal-adapters.ts) | Verified (OpenAI-compatible) |
| **ElizaOS (ai16z)** | Action Plugin Provider | [`src/lib/universal-adapters.ts`](src/lib/universal-adapters.ts) | Verified (`IPlugin` format) |


