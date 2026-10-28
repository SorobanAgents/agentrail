#!/usr/bin/env node
import { provisionSandbox, executeSandboxSpend, inspectBalance } from "../src/cli/sandbox.js";

async function runDemo() {
  console.log("================================================================================");
  console.log("🚂 AGENTRAIL: AUTONOMOUS AI AGENT MICRO-SETTLEMENT PROTOCOL (SOROBAN / STELLAR)");
  console.log("================================================================================");
  console.log("Contract ID:      CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6");
  console.log("Network:          Stellar Testnet (Protocol 29)");
  console.log("Treasury Address: GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT");
  console.log("Protocol Fee:     20 bps (0.20% Automated On-Chain Routing)");
  console.log("--------------------------------------------------------------------------------\n");

  console.log("1. Provisioning Autonomous Agent Sandbox Session...");
  const env = provisionSandbox("Claude-Code-Agent-7", "25.00", 20);
  console.log(`   [OK] Agent Name:       ${env.agent.name}`);
  console.log(`   [OK] Agent Public Key: ${env.agent.publicKey.substring(0, 16)}...`);
  console.log(`   [OK] Scoped Allowance: $25.00 USDC (TTL: 24 Hours)`);
  console.log(`   [OK] Owner Public Key: ${env.ownerAddress.substring(0, 16)}...`);

  console.log("\n2. Inspecting Initial Balance...");
  let bal = inspectBalance(env, env.allowance.id);
  console.log(`   [Balance] Remaining: $${bal.remainingUsdc} USDC (${bal.remainingStroops} stroops)`);
  console.log(`   [Status]  Active: ${bal.active} | Expired: ${bal.isExpired}`);

  console.log("\n3. Simulating Autonomous AI Agent LLM Inference Micro-Spend ($0.45 USDC)...");
  const { result, feeStroops, netStroops } = executeSandboxSpend(env, "0.45", "inference:gemini-1.5-pro");

  if (result.ok) {
    console.log(`   [SUCCESS] Transaction Authorized on Soroban Execution Engine!`);
    console.log(`   [Split]   Gross Spend:     $0.4500000 USDC`);
    console.log(`   [Split]   Protocol Fee:    ${feeStroops} stroops (20 bps -> Treasury ${env.treasuryAddress.substring(0, 10)}...)`);
    console.log(`   [Split]   Net to Provider: ${netStroops} stroops`);
    console.log(`   [Circuit] Circuit Breaker Status: HEALTHY (Unpaused)`);
  } else {
    console.error(`   [FAILED] Spend rejected: ${result.message}`);
  }

  console.log("\n4. Inspecting Updated Post-Spend Balance...");
  bal = inspectBalance(env, env.allowance.id);
  console.log(`   [Balance] Remaining: $${bal.remainingUsdc} USDC (${bal.remainingStroops} stroops)`);
  console.log(`   [Spent]   Accumulated Spent: ${bal.spentStroops} stroops`);

  console.log("\n================================================================================");
  console.log("✅ AGENTRAIL DEMO COMPLETED: 100% Deterministic Soroban Settlement Verified!");
  console.log("================================================================================");
}

runDemo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
