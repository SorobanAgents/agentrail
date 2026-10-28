# 📖 AgentRail Production Operational Runbook

This document defines standard operating procedures (SOP), emergency protocols, and monitoring guidelines for maintainers and infrastructure operators running the **AgentRail Protocol** on Stellar and Soroban.

---

## 🏛️ Core Protocol Reference

| Parameter | Production Value | Network |
| :--- | :--- | :--- |
| **Contract ID** | `CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6` | Stellar Testnet |
| **Admin Key** | `GDQZK73NVQCDJTTUMOOLF7IZ55IY4GS2TF6SNE7P7DVJ7XWICYAGJJA5` | Soroban Core |
| **Treasury Address** | `GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT` | Trust Wallet (Self-Custody) |
| **Monetization Fee** | `20 basis points` (0.20%) | Automatic On-Chain Routing |
| **Settlement Token** | `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` | Circle Native Testnet |

---

## 🚨 Incident Response & Severity Matrix

| Severity | Definition | Target SLA | Immediate Action |
| :--- | :--- | :--- | :--- |
| **P0 (Critical)** | Exploit attempt, unauthorized allowance drain, or abnormal velocity anomaly. | **< 15 minutes** | Trip Emergency Circuit Breaker (`pause()`). Freeze all outgoing spends. |
| **P1 (High)** | RPC provider outage, Horizon rate limiting, or persistent transaction backlog. | **< 1 hour** | Failover to secondary Soroban RPC node. Inspect mempool health. |
| **P2 (Medium)** | Contract Storage TTL lease approaching minimum retention threshold (< 10,000 ledgers). | **< 24 hours** | Invoke `env.storage().instance().extend_ttl()` via automated keeper. |

---

## 🔒 Emergency Circuit Breaker Procedures

### 1. Activating the Emergency Freeze (`pause`)
If any anomalous behavior, price oracle divergence, or unauthorized drain pattern is detected:

```bash
# Execute using Stellar CLI with Admin credentials:
stellar contract invoke \
  --id CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6 \
  --source-account <ADMIN_SECRET_KEY> \
  --network testnet \
  -- pause
```

* **Effect:** All agent spend calls immediately revert with `Error::ContractPaused (code: 4)`.
* **Funds Safety:** Locked in vault. Zero stroops can move until explicit unpause.

### 2. Resuming Operations (`unpause`)
Once the root cause is resolved and verified:

```bash
stellar contract invoke \
  --id CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6 \
  --source-account <ADMIN_SECRET_KEY> \
  --network testnet \
  -- unpause
```

---

## 💰 Treasury & Royalty Monitoring

1. **Protocol Fee Capture:**  
   Every spend emits a topic event `(FEE_EVENT, symbol_short!("route"))` with `(treasury, fee_amount)`.
2. **Ledger Invariant Verification:**  
   Confirm gross spend equals `net_amount + fee_amount`. Treasury balance in Trust Wallet (`GDDJH...`) must increase monotonically with every transaction.
3. **Fee Adjustment:**  
   If protocol governance votes to adjust fee bps:
   ```bash
   stellar contract invoke \
     --id CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6 \
     --source-account <ADMIN_SECRET_KEY> \
     --network testnet \
     -- set_protocol_fee \
     --treasury GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT \
     --fee_bps 20
   ```
   *(Note: Contract strictly bounds fee to `<= 1000 bps` / 10% maximum to protect agent users).*

---

## 🛠️ Health & Diagnostic Checks

### Automated Test Suite Execution:
```bash
# Run Vitest SDK and CLI integration tests
npm test

# Run offline deep Rust invariant contract tests
cd contracts/agentrail && cargo test --offline
```

### Quick Diagnostic Inspection:
```bash
# Run interactive agent sandbox session
npm run demo
```
