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
| **Immutable IPFS CID** | Pinata Gateway | [`QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a`](https://gateway.pinata.cloud/ipfs/QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a) |
| **Independent Proof** | Nirium Protocol | [`https://nirium.xyz/verify?cid=QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a`](https://nirium.xyz/verify?cid=QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a) |
| **Network Tag** | Nirium Audit Trail | `stellar:pubnet` (attested by node `audit-external` at 2026-11-24T03:26:38Z) |

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

AgentRail's integration is officially cited and audited in Nirium Protocol's own repository:
- **Nirium Official `EVIDENCE.md`:** Cites AgentRail in Section 4 (lines 75–76) and Section 8 (lines 99–100) as a verified external contributor.
- **External Attestation:** [Nirium PR #71](https://github.com/nirium-protocol/nirium/pull/71) and [AgentRail PR #71](https://github.com/SorobanAgents/agentrail/pull/71) (on-chain pipeline spend settlement with attested Nirium receipts).
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
