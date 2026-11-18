import { AgentRailClient } from "../sdk/agent-client.js";
import { ScopedAllowance, SpendRequest, SpendResult } from "../types.js";
import { usdcToStroops, stroopsToUsdc } from "../lib/micro-stream.js";
import { AnchorOutcome, ReceiptAnchorProvider, anchorReceipt, buildSpendReceipt } from "../lib/receipts.js";

/** AgentRail's testnet deployment (deployment.testnet.json). */
export const SANDBOX_CONTRACT_ID = "CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6";

/** Tag on sandbox receipts, so nobody reads them as a real on-chain spend. */
export const SANDBOX_RECEIPT_TAG = "agentrail-sandbox";

export interface SandboxAgent {
  id: string;
  name: string;
  publicKey: string;
  role: string;
}

export interface SandboxEnvironment {
  client: AgentRailClient;
  ownerAddress: string;
  treasuryAddress: string;
  agent: SandboxAgent;
  allowance: ScopedAllowance;
  protocolFeeBps: number;
}

export interface BalanceInspection {
  allowanceId: string;
  totalLimitStroops: string;
  spentStroops: string;
  remainingStroops: string;
  remainingUsdc: string;
  active: boolean;
  isExpired: boolean;
}

/**
 * Provision a sandboxed environment for autonomous AI agent micro-spend simulation.
 */
export function provisionSandbox(
  agentName = "Gemini-Soroban-Worker-01",
  budgetUsdc = "50.00",
  feeBps = 20
): SandboxEnvironment {
  const client = new AgentRailClient();
  const ownerAddress = "GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT";
  const treasuryAddress = "GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT";
  // Placeholder keys in valid Stellar format (no funds, secret discarded) so receipts can validate them.
  const agentKey = "GAA5MW7J4KPUBC6S7T7K72VF6N4M34X4B5WT4QTKNNI7WNU37PG2H2I5";
  const now = Math.floor(Date.now() / 1000);

  const agent: SandboxAgent = {
    id: `agent_${Date.now()}`,
    name: agentName,
    publicKey: agentKey,
    role: "Autonomous Inference & Data Processing",
  };

  const limitStroops = usdcToStroops(budgetUsdc);
  const allowance: ScopedAllowance = {
    id: `allowance_${agent.id}`,
    ownerPublicKey: ownerAddress,
    agentPublicKey: agent.publicKey,
    maxStroops: limitStroops,
    spentStroops: 0n,
    validFrom: now - 60,
    validUntil: now + 86400, // 24h
    active: true,
    protocolFeeBps: feeBps,
    treasuryPublicKey: treasuryAddress,
  };

  client.registerAllowance(allowance);

  return {
    client,
    ownerAddress,
    treasuryAddress,
    agent,
    allowance,
    protocolFeeBps: feeBps,
  };
}

/**
 * Inspect live allowance balance and capacity for an agent.
 */
export function inspectBalance(
  env: SandboxEnvironment,
  allowanceId: string,
  currentTimeSec: number = Math.floor(Date.now() / 1000)
): BalanceInspection {
  const allowance = (env.client as any).allowances.get(allowanceId) as ScopedAllowance | undefined;
  if (!allowance) {
    throw new Error(`Allowance ${allowanceId} does not exist in sandbox.`);
  }

  const remaining = allowance.maxStroops - allowance.spentStroops;
  const isExpired = currentTimeSec > allowance.validUntil;

  return {
    allowanceId: allowance.id,
    totalLimitStroops: allowance.maxStroops.toString(),
    spentStroops: allowance.spentStroops.toString(),
    remainingStroops: remaining.toString(),
    remainingUsdc: stroopsToUsdc(remaining),
    active: allowance.active && !isExpired,
    isExpired,
  };
}

/**
 * Execute an automated micro-spend within the sandbox.
 */
export function executeSandboxSpend(
  env: SandboxEnvironment,
  amountUsdc: string,
  memo = "inference:gemini-pro-1.5"
): { result: SpendResult; feeStroops: bigint; netStroops: bigint; request: SpendRequest } {
  const amountStroops = usdcToStroops(amountUsdc);
  const feeStroops = (amountStroops * BigInt(env.protocolFeeBps)) / 10000n;
  const netStroops = amountStroops - feeStroops;

  const request: SpendRequest = {
    allowanceId: env.allowance.id,
    agentPublicKey: env.agent.publicKey,
    destination: "GDWPTOV25IQE2DFW7UYCBAQ4VF5D6HYSRDBPMNFPHL7S5SSAN7WFCO2X",
    amountStroops,
    timestamp: Math.floor(Date.now() / 1000),
    memo,
  };
  const result = env.client.spend(request);

  return { result, feeStroops, netStroops, request };
}

/**
 * Opt-in: anchor a public receipt for a sandbox spend (only its SHA-256 leaves AgentRail).
 * Tagged `agentrail-sandbox`, since the spend is simulated. Never throws.
 */
export async function anchorSandboxReceipt(
  spend: { result: SpendResult; request: SpendRequest },
  provider: ReceiptAnchorProvider,
  contractId: string = SANDBOX_CONTRACT_ID
): Promise<AnchorOutcome> {
  if (!spend.result.ok) {
    return { ok: false, contentSha256: "", error: `Spend was rejected (${spend.result.code}); no receipt to anchor` };
  }
  try {
    const receipt = buildSpendReceipt(spend.request, spend.result, { contractId });
    return await anchorReceipt(receipt, provider, { tag: SANDBOX_RECEIPT_TAG });
  } catch (err) {
    return { ok: false, contentSha256: "", error: err instanceof Error ? err.message : String(err) };
  }
}
