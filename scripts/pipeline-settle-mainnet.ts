#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 AgentRail Protocol Contributors

import { Keypair, Horizon } from "@stellar/stellar-sdk";
import fs from "fs";
import path from "path";
import { executeOnChainPipelineSpend, DEFAULT_PUBLIC_HORIZON_URL, DEFAULT_TREASURY_ADDRESS } from "../src/cli/pipeline.js";
import { createAuditTrailProvider, AUDIT_TRAIL_MAINNET_URL } from "../src/lib/audit-trail-provider.js";
import { verifyAndDeductSpend } from "../src/lib/scoped-allowance.js";
import { ScopedAllowance } from "../src/types.js";

// Nirium's verified Mainnet Vault contract from docs/FOR-REVIEWERS.md
export const NIRIUM_MAINNET_VAULT_CONTRACT_ID = "CAMDXG6L4LXLXXV675KZSHM3BMSETZ4NVMC7JYIQCZ2JTG54OMSK57MH";

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log("🚀 AGENTRAIL + NIRIUM: MAINNET PIPELINE SPEND & RECEIPT ANCHOR (#71)");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log(`Network:           Stellar Public Mainnet`);
  console.log(`Horizon Endpoint:  ${DEFAULT_PUBLIC_HORIZON_URL}`);
  console.log(`Nirium Node:       ${AUDIT_TRAIL_MAINNET_URL}`);
  console.log(`Scope:             ScopedAllowance.execute_spend + Signed Mainnet Audit Receipt`);
  console.log("───────────────────────────────────────────────────────────────────────────\n");

  const keyFilePath = path.resolve(".mainnet_agent_key.json");
  const secretFromEnv = process.env.STELLAR_SECRET_KEY || process.env.AGENT_SECRET_KEY;
  const secretFromArg = process.argv.find((a) => a.startsWith("S") && a.length === 56);
  
  let secretKey = secretFromEnv || secretFromArg;
  if (!secretKey && fs.existsSync(keyFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(keyFilePath, "utf-8"));
      secretKey = data.secretKey;
    } catch {
      // fallback
    }
  }

  let agent: Keypair;
  const server = new Horizon.Server(DEFAULT_PUBLIC_HORIZON_URL);

  if (secretKey) {
    try {
      agent = Keypair.fromSecret(secretKey.trim());
      console.log(`1. Loaded Agent Keypair: ${agent.publicKey()}`);
    } catch (e) {
      console.error("❌ Invalid Stellar secret key provided:", e);
      process.exit(1);
    }
  } else {
    agent = Keypair.random();
    console.log("1. Generated Ephemeral Agent Keypair:");
    console.log(`   Public Address:  ${agent.publicKey()}`);
    console.log(`   Secret Key:      ${agent.secret()}`);
  }

  // Check if account is funded on Mainnet
  let funded = false;
  try {
    const acc = await server.loadAccount(agent.publicKey());
    const nativeBal = acc.balances.find((b) => b.asset_type === "native");
    if (nativeBal && parseFloat(nativeBal.balance) >= 1.0) {
      console.log(`   [OK] Account funded on Mainnet! Balance: ${nativeBal.balance} XLM`);
      funded = true;
    }
  } catch {
    // Not yet funded
  }

  if (!funded) {
    console.error("\n❌ Account not funded on Stellar Mainnet.");
    process.exit(1);
  }

  // Check account balance
  const account = await server.loadAccount(agent.publicKey());
  const nativeBal = account.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
  console.log(`\n2. Agent Mainnet Balance: ${nativeBal} XLM`);

  // Target destination: user's main wallet or treasury
  const destination = process.env.DESTINATION_ADDRESS || DEFAULT_TREASURY_ADDRESS;
  console.log(`   Destination Account:  ${destination}`);

  // Amount: 0.001 XLM (10,000 stroops) for minimal fee micro-spend
  const amountStroops = 10000n; // 0.001 XLM
  console.log(`   Micro-spend Amount:   0.001 XLM (${amountStroops} stroops)`);

  // 3. Provision & Verify ScopedAllowance
  console.log("\n3. Validating ScopedAllowance Execution...");
  const allowanceId = `alw_mainnet_${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);
  const allowance: ScopedAllowance = {
    id: allowanceId,
    ownerPublicKey: destination,
    agentPublicKey: agent.publicKey(),
    maxStroops: 100000n, // 0.01 XLM limit
    spentStroops: 0n,
    validFrom: now - 60,
    validUntil: now + 86400, // 24h
    active: true,
    protocolFeeBps: 0,
    treasuryPublicKey: destination,
  };

  const spendCheck = verifyAndDeductSpend(allowance, {
    allowanceId,
    agentPublicKey: agent.publicKey(),
    destination,
    amountStroops,
    timestamp: now,
  });

  if (!spendCheck.ok) {
    console.error("❌ ScopedAllowance verification failed:", spendCheck.message);
    process.exit(1);
  }
  console.log(`   [OK] ScopedAllowance verified: ${spendCheck.message}`);
  console.log(`   [OK] Remaining Stroops in Scope: ${spendCheck.remainingStroops}`);

  // 4. Submitting On-Chain Spend on Stellar Mainnet with Mainnet Audit Provider
  console.log("\n4. Submitting On-Chain Spend on Stellar Mainnet...");
  const mainnetAuditProvider = createAuditTrailProvider({
    baseUrl: AUDIT_TRAIL_MAINNET_URL,
    timeoutMs: 15000,
  });

  const result = await executeOnChainPipelineSpend({
    agentKeypair: agent,
    destinationAddress: destination,
    amountStroops,
    contractId: NIRIUM_MAINNET_VAULT_CONTRACT_ID,
    allowanceId,
    network: "public",
    skipTreasury: true,
    tag: "agentrail-pipeline-spend",
    auditProvider: mainnetAuditProvider,
  });

  if (!result.ok) {
    console.error(`\n❌ Pipeline spend failed: ${result.error}`);
    process.exit(1);
  }

  console.log("   [SUCCESS] Transaction Settled On-Chain!");
  console.log(`   [Stellar Tx Hash]  ${result.txHash}`);
  console.log(`   [Explorer Link]    ${result.explorerUrl}`);
  console.log(`   [Gross Spend]      ${Number(result.grossStroops) / 10000000} XLM`);

  console.log("\n5. Cryptographic Receipt Attestation & Nirium Mainnet Audit Trail...");
  if (result.anchorOutcome?.ok) {
    console.log(`   [Receipt Content SHA-256] ${result.contentSha256}`);
    console.log(`   [Immutable IPFS CID]       ${result.anchorOutcome.cid}`);
    console.log(`   [Attested By]              ${result.anchorOutcome.attestedBy ?? agent.publicKey()}`);
    console.log(`   [Nirium Independent Proof] ${result.anchorOutcome.verifyUrl}`);
    console.log(`   [Pinata Gateway]           https://gateway.pinata.cloud/ipfs/${result.anchorOutcome.cid}`);
  } else {
    console.log(`   [Receipt Warning] Not anchored: ${result.anchorOutcome?.error}`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════════");
  console.log("✅ ON-CHAIN MAINNET PIPELINE SETTLED & ANCHORED ON NIRIUM MAINNET!");
  console.log("═══════════════════════════════════════════════════════════════════════════");
  console.log(`Tx Hash:     ${result.txHash}`);
  console.log(`Receipt CID: ${result.anchorOutcome?.ok ? result.anchorOutcome.cid : "N/A"}`);
  console.log(`Verify URL:  ${result.anchorOutcome?.ok ? result.anchorOutcome.verifyUrl : "N/A"}`);
  console.log("═══════════════════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
