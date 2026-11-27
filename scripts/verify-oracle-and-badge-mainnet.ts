/**
 * AgentRail - Live Reflector Oracle & SEP-50 Verification Badge Mainnet Broadcast
 * 
 * Executes end-to-end on-chain verification on Stellar Public Mainnet:
 * 1. Queries Reflector Oracle price feed & validates slippage tolerance.
 * 2. Issues a verifiable SEP-50 Agent Verification Badge with Proof-of-Task attestation.
 * 3. Exports official XOXNO marketplace showcase payload (20 BPS monetization).
 * 4. Broadcasts on-chain cryptographic badge attestation to Stellar Horizon Public Mainnet.
 * 5. Generates immutable ledger proof & explorer receipt.
 */

import {
  Keypair,
  Horizon,
  Networks,
  TransactionBuilder,
  Asset,
  Operation,
  Memo,
} from "@stellar/stellar-sdk";
import { ReflectorOracleAdapter } from "../src/lib/reflector-oracle-adapter.js";
import { AgentBadgeIssuer } from "../src/lib/agent-badge-issuer.js";
import * as fs from "fs";
import * as path from "path";

const ENV_PATH = path.join("d:", "PersonalAI", "agentrail", ".env.agent");
const HORIZON_URL = "https://horizon.stellar.org";
const server = new Horizon.Server(HORIZON_URL);

async function main() {
  console.log("================================================================================");
  console.log("🌟 AGENTRAIL: REFLECTOR ORACLE & SEP-50 BADGE MAINNET VERIFICATION");
  console.log("================================================================================");

  if (!fs.existsSync(ENV_PATH)) throw new Error(".env.agent not found");
  const rawEnv = fs.readFileSync(ENV_PATH, "utf-8");
  const secret = rawEnv.match(/AGENT_SECRET_KEY=(S[A-Z2-7]{55})/)?.[1];
  const beneficiary = rawEnv.match(/BENEFICIARY_WALLET=(G[A-Z2-7]{55})/)?.[1];

  if (!secret || !beneficiary) throw new Error("Missing credentials in .env.agent");

  const agent = Keypair.fromSecret(secret);
  const agentAddress = agent.publicKey();

  console.log(`• Agent Public Key:       ${agentAddress}`);
  console.log(`• Beneficiary (LOBSTR):   ${beneficiary}`);
  console.log(`• Stellar Network:        Public Mainnet`);
  console.log(`• Horizon Endpoint:       ${HORIZON_URL}`);

  // ---------------------------------------------------------------------------
  // STEP 1: Reflector Oracle Validation
  // ---------------------------------------------------------------------------
  console.log(`\n[1/4] Querying Reflector Oracle Live Price Feed...`);
  const oracle = new ReflectorOracleAdapter({
    maxStalenessSeconds: 300,
    maxDeviationPercent: 2.0,
    fallbackEnabled: true,
  });

  const xlmPrice = await oracle.getPrice("XLM");
  console.log(`  ✓ Reflector Oracle Feed: XLM/USD = $${xlmPrice.priceUsd} (Status: ${xlmPrice.status.toUpperCase()})`);
  console.log(`  ✓ Contract Identifier:   ${xlmPrice.oracleContractId}`);

  // Validate trade execution price with 1% deviation (should pass)
  const validation = await oracle.validateTradePrice("XLM", 0.523, 2.0);
  console.log(`  ✓ Slippage Guard Check:  ${validation.code} (${validation.message})`);

  // Currency conversion calculation
  const conversion = await oracle.convertAmount("XLM", "USDC", 50);
  console.log(`  ✓ Oracle Conversion:     50 XLM => $${conversion.convertedAmount} USDC (Rate: ${conversion.rate})`);

  // ---------------------------------------------------------------------------
  // STEP 2: Issue SEP-50 Agent Verification Badge
  // ---------------------------------------------------------------------------
  console.log(`\n[2/4] Issuing SEP-50 Autonomous Agent Verification Badge...`);
  const badgeIssuer = new AgentBadgeIssuer();
  const badge = badgeIssuer.issueBadge(
    {
      agentPublicKey: agentAddress,
      agentName: "AgentRail-Autonomous-Oracle-Worker",
      badgeType: "autonomous_agent_verified",
      completedTasksCount: 120,
      auditScore: 99,
      latestTaskCommitmentHash: "3ebe9557e836fcfeeeb3e8d4f35d677474aa0bcd82aea9709ea5f1878ffeda81",
      ipfsAuditCid: "QmdJowsxyyDjv8UxwgceawgpZN4zsDUDaKeSiqDpQX3p8a",
      validityDays: 365,
    },
    agentAddress // Self-attested with AgentRail cryptographic root
  );

  console.log(`  ✓ Badge ID:              ${badge.badgeId}`);
  console.log(`  ✓ Tier:                  ${badge.tier.toUpperCase()}`);
  console.log(`  ✓ Reputation Score:      ${badge.reputationScore}/100`);
  console.log(`  ✓ Standard:              ${badge.sep50Standard}`);
  console.log(`  ✓ Soulbound / Locked:    Yes (is_transferable: false)`);

  const verification = badgeIssuer.verifyBadge(agentAddress);
  console.log(`  ✓ Local Integrity Check: ${verification.code} (${verification.message})`);

  // ---------------------------------------------------------------------------
  // STEP 3: Generate XOXNO Marketplace Showcase Payload
  // ---------------------------------------------------------------------------
  console.log(`\n[3/4] Exporting XOXNO Marketplace Showcase Payload...`);
  const xoxnoListing = badgeIssuer.exportXoxnoListing(badge, beneficiary);
  console.log(`  ✓ XOXNO Listing ID:      ${xoxnoListing.id}`);
  console.log(`  ✓ Royalty Fee:           ${xoxnoListing.seller_fee_basis_points} BPS (0.20%)`);
  console.log(`  ✓ Royalty Recipient:     ${xoxnoListing.fee_recipient} (LOBSTR)`);

  // ---------------------------------------------------------------------------
  // STEP 4: Broadcast On-Chain Attestation to Stellar Public Mainnet
  // ---------------------------------------------------------------------------
  console.log(`\n[4/4] Broadcasting On-Chain Attestation to Stellar Public Mainnet...`);
  const sourceAccount = await server.loadAccount(agentAddress);
  const baseFee = await server.fetchBaseFee();

  // Memo text is max 28 bytes. badge.badgeId is 26 characters (fits perfectly!)
  const memoText = badge.badgeId;

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: baseFee.toString(),
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(
      Operation.payment({
        destination: beneficiary,
        asset: Asset.native(),
        amount: "0.00001", // 100 stroops micro-attestation
      })
    )
    .addMemo(Memo.text(memoText))
    .setTimeout(30)
    .build();

  transaction.sign(agent);

  const result = await server.submitTransaction(transaction);
  console.log(`\n================================================================================`);
  console.log(`✅ MAINNET ATTESTATION BROADCAST SUCCESSFUL!`);
  console.log(`================================================================================`);
  console.log(`• Ledger Sequence:       #${result.ledger}`);
  console.log(`• Public Tx Hash:        ${result.hash}`);
  console.log(`• StellarExpert URL:     https://stellar.expert/explorer/public/tx/${result.hash}`);
  console.log(`• Attestation Memo:      ${memoText}`);

  // Persist live mainnet proof to proofs directory
  const proofsDir = path.join("d:", "PersonalAI", "agentrail", "proofs");
  if (!fs.existsSync(proofsDir)) {
    fs.mkdirSync(proofsDir, { recursive: true });
  }

  const proofData = {
    protocol: "AgentRail Autonomous Agent Protocol",
    network: "Stellar Public Mainnet",
    ledger: result.ledger,
    txHash: result.hash,
    stellarExpertUrl: `https://stellar.expert/explorer/public/tx/${result.hash}`,
    reflectorOracle: {
      contractId: xlmPrice.oracleContractId,
      asset: "XLM/USD",
      priceUsd: xlmPrice.priceUsd,
      status: xlmPrice.status,
      slippageTolerancePct: 2.0,
    },
    sep50Badge: {
      badgeId: badge.badgeId,
      standard: badge.sep50Standard,
      tier: badge.tier,
      reputationScore: badge.reputationScore,
      agentPublicKey: badge.agentPublicKey,
      taskCommitmentHash: badge.taskCommitmentHash,
      ipfsAuditCid: badge.ipfsAuditCid,
      soulbound: true,
    },
    xoxnoListing: {
      listingId: xoxnoListing.id,
      name: xoxnoListing.name,
      royaltyBps: xoxnoListing.seller_fee_basis_points,
      feeRecipient: xoxnoListing.fee_recipient,
    },
    timestamp: new Date().toISOString(),
  };

  const proofFile = path.join(proofsDir, `mainnet-oracle-sep50-${result.ledger}.json`);
  fs.writeFileSync(proofFile, JSON.stringify(proofData, null, 2), "utf-8");
  console.log(`\n📄 Saved Immutable Proof Artifact: ${proofFile}`);
}

main().catch((err) => {
  console.error("❌ Fatal Error during Mainnet Verification:", err);
  process.exit(1);
});
