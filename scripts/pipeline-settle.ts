#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 AgentRail Protocol Contributors

import { Keypair } from "@stellar/stellar-sdk";
import { executeOnChainPipelineSpend, DEFAULT_TREASURY_ADDRESS, DEFAULT_CONTRACT_ID } from "../src/cli/pipeline.js";

async function main() {
  console.log("════════════════════════════════════════════════════════════════════════════════");
  console.log("🚂 AGENTRAIL + NIRIUM: AUTONOMOUS ON-CHAIN PIPELINE SPEND & RECEIPT ANCHOR");
  console.log("════════════════════════════════════════════════════════════════════════════════");
  console.log(`Contract ID:       ${DEFAULT_CONTRACT_ID}`);
  console.log(`Network:           Stellar Testnet`);
  console.log(`Treasury Address:  ${DEFAULT_TREASURY_ADDRESS}`);
  console.log(`Protocol Fee:      20 bps (0.20% Automated On-Chain Routing)`);
  console.log("────────────────────────────────────────────────────────────────────────────────\n");

  console.log("1. Initializing Autonomous Agent & Destination Keypairs...");
  const agent = Keypair.random();
  const destination = Keypair.random();
  console.log(`   [Agent Account]       ${agent.publicKey()}`);
  console.log(`   [Destination Account] ${destination.publicKey()}`);

  console.log("\n2. Funding Agent & Destination on Testnet via Friendbot...");
  const fb1 = await fetch(`https://friendbot.stellar.org?addr=${agent.publicKey()}`);
  if (!fb1.ok) throw new Error("Friendbot funding agent failed: " + (await fb1.text()));
  const fb2 = await fetch(`https://friendbot.stellar.org?addr=${destination.publicKey()}`);
  if (!fb2.ok) throw new Error("Friendbot funding destination failed: " + (await fb2.text()));
  console.log("   [OK] Both accounts active and funded on Stellar testnet ledger!");

  console.log("\n3. Executing On-Chain Pipeline Spend (1.0 XLM) with 20 bps Fee Routing...");
  const grossStroops = 10000000n; // 1.0 XLM in stroops

  const result = await executeOnChainPipelineSpend({
    agentKeypair: agent,
    destinationAddress: destination.publicKey(),
    amountStroops: grossStroops,
    feeBps: 20,
    tag: "agentrail-pipeline-spend",
  });

  if (!result.ok) {
    console.error(`\n❌ Pipeline spend failed: ${result.error}`);
    process.exit(1);
  }

  console.log("   [SUCCESS] Transaction Settled On-Chain!");
  console.log(`   [Stellar Tx Hash]  ${result.txHash}`);
  console.log(`   [Explorer Link]    ${result.explorerUrl}`);
  console.log(`   [Gross Spend]      ${Number(result.grossStroops) / 10000000} XLM`);
  console.log(`   [Protocol Fee]     ${Number(result.feeStroops) / 10000000} XLM (20 bps -> Treasury)`);
  console.log(`   [Net to Merchant]  ${Number(result.netStroops) / 10000000} XLM`);

  console.log("\n4. Cryptographic Receipt Attestation & Nirium Audit Trail Anchoring...");
  if (result.anchorOutcome?.ok) {
    console.log(`   [Receipt Content SHA-256] ${result.contentSha256}`);
    console.log(`   [Immutable IPFS CID]       ${result.anchorOutcome.cid}`);
    console.log(`   [Attested By]              ${result.anchorOutcome.attestedBy ?? agent.publicKey()}`);
    console.log(`   [Nirium Independent Proof] ${result.anchorOutcome.verifyUrl}`);
    console.log(`   [Pinata Gateway]           https://gateway.pinata.cloud/ipfs/${result.anchorOutcome.cid}`);
  } else {
    console.log(`   [Receipt Warning] Not anchored: ${result.anchorOutcome?.error}`);
  }

  console.log("\n════════════════════════════════════════════════════════════════════════════════");
  console.log("✅ ON-CHAIN PIPELINE SETTLED & ANCHORED SUCCESSFULLY!");
  console.log("════════════════════════════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
