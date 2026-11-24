# AgentRail — 10 Minutes for a Reviewer

Not marketing claims, not high-level slides. Five verifiable proofs, in order of verification ease, that anyone can check in under 10 minutes without trusting our word.

The complete index of transactions, contracts, and IPFS CIDs is in [`EVIDENCE.md`](../EVIDENCE.md).

---

## 1. Verify a Live Mainnet Payment Receipt Without Us (30 Seconds)

Open [nirium.xyz/verify](https://nirium.xyz/verify) and paste this CID:

```text
QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a
```

Or view it directly from Pinata IPFS Gateway:
👉 [https://gateway.pinata.cloud/ipfs/QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a](https://gateway.pinata.cloud/ipfs/QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a)

- **What you will see:** A cryptographically signed audit receipt anchored on `stellar:pubnet` by node `audit-external`.
- **Signed By:** `GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY`
- **Matching On-Chain Tx:** [`1afd4afb9df3857466f70c09b8b5cabc514ac69c9aa1df316cf2168c5c72dcbb`](https://stellar.expert/explorer/public/tx/1afd4afb9df3857466f70c09b8b5cabc514ac69c9aa1df316cf2168c5c72dcbb) on Stellar Public Mainnet (Protocol 30).

---

## 2. Check Nirium Protocol's Independent Citation of AgentRail

You don't need to take our word for our integration: check Nirium Protocol's official repository:
- **Repository:** [`nirium-protocol/nirium`](https://github.com/nirium-protocol/nirium)
- **Document:** [`EVIDENCE.md`](https://github.com/nirium-protocol/nirium/blob/main/EVIDENCE.md)
- **Section 4 & Section 8:** Nirium explicitly lists AgentRail PR #71, PR #68, and PR #70 as verified external implementations of the receipt attestation standard.

---

## 3. Verify the Soroban Smart Contract & Unit Tests

Run the full invariant and test suite locally in 60 seconds:

```bash
git clone https://github.com/SorobanAgents/agentrail.git
cd agentrail
npm install
npm test
```

- **Result:** 23/23 Vitest suites pass across scoped-allowance verification, micro-streaming token calculators, TTL keepers, and audit trail providers.
- **Contract Code:** [`contracts/agentrail/src/lib.rs`](../contracts/agentrail/src/lib.rs) — 28 Rust tests verifying allowance expiry, circuit breakers, multi-agent isolation, and protocol fee deductions.

---

## 4. Run the Sandbox Micro-Spend Demo

Simulate an autonomous AI agent spending against a scoped allowance with zero blockchain configuration needed:

```bash
npm run demo
```

To see receipt anchoring in action:

```bash
npm run demo:receipt
```

---

## 5. Pure Stellar Native Funding

Check [`FUNDING.json`](../FUNDING.json):
- 100% of allocation rewards go directly to Stellar Native Key: `GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT`.
- Zero multi-chain dilution, zero proxy intermediaries.
