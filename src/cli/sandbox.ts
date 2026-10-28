import { AgentRailClient } from "../sdk/agent-client.js";
import { ScopedAllowance, SpendResult } from "../types.js";
import { usdcToStroops, stroopsToUsdc } from "../lib/micro-stream.js";

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
  const agentKey = "GAUTON0M0USAGNT77777777777777777777777777777777777777777";
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
): { result: SpendResult; feeStroops: bigint; netStroops: bigint } {
  const amountStroops = usdcToStroops(amountUsdc);
  const feeStroops = (amountStroops * BigInt(env.protocolFeeBps)) / 10000n;
  const netStroops = amountStroops - feeStroops;

  const result = env.client.spend({
    allowanceId: env.allowance.id,
    agentPublicKey: env.agent.publicKey,
    destination: "GDEST1NAT10NPR0V1DER9999999999999999999999999999999999999",
    amountStroops,
    timestamp: Math.floor(Date.now() / 1000),
    memo,
  });

  return { result, feeStroops, netStroops };
}
