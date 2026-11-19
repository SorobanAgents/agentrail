import { createHash } from "node:crypto";
import { z } from "zod";
import { SpendRequest, SpendResult } from "../types.js";

/**
 * Opt-in public receipts for AgentRail spends and proof-of-task results.
 *
 * Build a canonical record, hash it, and anchor only the SHA-256 hash to a public
 * Audit Trail node through an injected provider. The record itself never leaves
 * the caller. Anchoring sits outside the payment path: `anchorReceipt` never throws,
 * so a spend or a proof is unaffected when anchoring fails.
 */

export const RECEIPT_VERSION = "agentrail-receipt-v1";
export const RECEIPT_VERIFY_URL = "https://nirium.xyz/verify";

const HEX64 = /^[0-9a-f]{64}$/;
const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;
const STELLAR_CONTRACT = /^C[A-Z2-7]{55}$/;

const accountOrContract = z
  .string()
  .refine((v) => STELLAR_ACCOUNT.test(v) || STELLAR_CONTRACT.test(v), "must be a Stellar G... account or C... contract id");
const hex64 = z.string().toLowerCase().regex(HEX64, "must be a 64-char sha-256 hex");
const stroops = z.bigint().nonnegative();
const unixSeconds = z.number().int().nonnegative();

export const SpendReceiptSchema = z.object({
  kind: z.literal("spend"),
  version: z.literal(RECEIPT_VERSION),
  contractId: z.string().regex(STELLAR_CONTRACT, "must be a C... contract id"),
  allowanceId: z.string().min(1).max(128),
  agentPublicKey: z.string().regex(STELLAR_ACCOUNT, "must be a G... account"),
  destination: accountOrContract,
  amountStroops: stroops,
  feeStroops: stroops,
  netStroops: stroops,
  timestamp: unixSeconds,
  txHash: hex64.optional(),
});

export const TaskProofReceiptSchema = z.object({
  kind: z.literal("proof-of-task"),
  version: z.literal(RECEIPT_VERSION),
  taskId: z.string().min(1).max(128),
  agentWorkerPublicKey: z.string().regex(STELLAR_ACCOUNT, "must be a G... account"),
  taskCommitmentHash: hex64,
  verified: z.boolean(),
  reason: z.string().max(256).optional(),
  timestamp: unixSeconds,
});

export type SpendReceipt = z.infer<typeof SpendReceiptSchema>;
export type TaskProofReceipt = z.infer<typeof TaskProofReceiptSchema>;
export type Receipt = SpendReceipt | TaskProofReceipt;

const SpendExtrasSchema = z.object({
  contractId: z.string(),
  txHash: z.string().optional(),
});

/**
 * Build a spend receipt from a successful `verifyAndDeductSpend` result.
 * Throws if the spend was rejected (there is nothing to attest) or an input is invalid.
 */
export function buildSpendReceipt(
  request: SpendRequest,
  result: SpendResult,
  extras: { contractId: string; txHash?: string }
): SpendReceipt {
  if (!result.ok) {
    throw new Error(`Cannot build a receipt for a rejected spend (${result.code})`);
  }
  const { contractId, txHash } = SpendExtrasSchema.parse(extras);
  return SpendReceiptSchema.parse({
    kind: "spend",
    version: RECEIPT_VERSION,
    contractId,
    allowanceId: request.allowanceId,
    agentPublicKey: request.agentPublicKey,
    destination: request.destination,
    amountStroops: request.amountStroops,
    feeStroops: result.feeStroops ?? 0n,
    netStroops: result.netStroops ?? request.amountStroops,
    timestamp: request.timestamp,
    ...(txHash !== undefined ? { txHash } : {}),
  });
}

const TaskProofInputSchema = z.object({
  taskId: z.string(),
  agentWorkerPublicKey: z.string(),
  taskCommitmentHash: z.string(),
  verification: z.object({ ok: z.boolean(), reason: z.string().optional() }),
  timestamp: z.number(),
});

/**
 * Build a proof-of-task receipt from the output of `verifyTaskProof`.
 * Records the commitment hash and the verification result, never the raw output or nonce.
 */
export function buildTaskProofReceipt(input: {
  taskId: string;
  agentWorkerPublicKey: string;
  taskCommitmentHash: string;
  verification: { ok: boolean; reason?: string };
  timestamp: number;
}): TaskProofReceipt {
  const parsed = TaskProofInputSchema.parse(input);
  return TaskProofReceiptSchema.parse({
    kind: "proof-of-task",
    version: RECEIPT_VERSION,
    taskId: parsed.taskId,
    agentWorkerPublicKey: parsed.agentWorkerPublicKey,
    taskCommitmentHash: parsed.taskCommitmentHash,
    verified: parsed.verification.ok,
    ...(parsed.verification.reason !== undefined ? { reason: parsed.verification.reason } : {}),
    timestamp: parsed.timestamp,
  });
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalValue(v);
    }
    return out;
  }
  return value;
}

/** Deterministic JSON: sorted keys, bigint as a decimal string, undefined fields dropped. */
export function canonicalizeReceipt(receipt: Receipt): string {
  return JSON.stringify(canonicalValue(receipt));
}

/** SHA-256 hex of the canonical receipt. This is the only value that leaves AgentRail. */
export function hashReceipt(receipt: Receipt): string {
  return createHash("sha256").update(canonicalizeReceipt(receipt), "utf8").digest("hex");
}

/** A service that anchors a sha-256 hash and returns a content id (see `createAuditTrailProvider`). */
export interface ReceiptAnchorProvider {
  anchor(request: {
    hash: string;
    tag?: string;
    txHash?: string;
    network?: string;
    agent?: { id?: string; key: string; signature: string };
  }): Promise<{
    cid: string;
    contentSha256: string;
    gatewayUrl?: string;
    anchoredAt?: string;
    attestedBy?: string;
  }>;
}

export type AnchorOutcome =
  | {
      ok: true;
      cid: string;
      contentSha256: string;
      verifyUrl: string;
      gatewayUrl?: string;
      anchoredAt?: string;
      attestedBy?: string;
    }
  | { ok: false; contentSha256: string; error: string };

const TagSchema = z.string().min(1).max(64).optional();

export interface AnchorOptions {
  tag?: string;
  network?: string;
  agentId?: string;
  signerKeypair?: { publicKey(): string; sign(data: Buffer): Buffer };
}

/**
 * Anchor a receipt's hash through `provider`. Never throws: a failure comes back as
 * `{ ok: false }` so callers can log it and carry on.
 */
export async function anchorReceipt(
  receipt: Receipt,
  provider: ReceiptAnchorProvider,
  options: AnchorOptions = {}
): Promise<AnchorOutcome> {
  let contentSha256 = "";
  try {
    const tag = TagSchema.parse(options.tag);
    const valid = receipt.kind === "spend" ? SpendReceiptSchema.parse(receipt) : TaskProofReceiptSchema.parse(receipt);
    contentSha256 = hashReceipt(valid);
    const txHash = valid.kind === "spend" ? valid.txHash : undefined;

    let agentPayload: { id?: string; key: string; signature: string } | undefined;
    if (options.signerKeypair) {
      const statement = Buffer.from(`nirium-audit-v1:${contentSha256}`, "utf8");
      const signature = options.signerKeypair.sign(statement).toString("base64");
      agentPayload = {
        id: options.agentId ?? "agentrail",
        key: options.signerKeypair.publicKey(),
        signature,
      };
    }

    const res = await provider.anchor({
      hash: contentSha256,
      ...(tag !== undefined ? { tag } : {}),
      ...(txHash !== undefined ? { txHash } : {}),
      ...(options.network !== undefined ? { network: options.network } : {}),
      ...(agentPayload !== undefined ? { agent: agentPayload } : {}),
    });
    if (res.contentSha256 !== contentSha256) {
      return { ok: false, contentSha256, error: "Anchor returned a different content hash" };
    }
    return {
      ok: true,
      cid: res.cid,
      contentSha256,
      verifyUrl: `${RECEIPT_VERIFY_URL}?cid=${encodeURIComponent(res.cid)}`,
      ...(res.gatewayUrl !== undefined ? { gatewayUrl: res.gatewayUrl } : {}),
      ...(res.anchoredAt !== undefined ? { anchoredAt: res.anchoredAt } : {}),
      ...(res.attestedBy !== undefined ? { attestedBy: res.attestedBy } : {}),
    };
  } catch (err) {
    return { ok: false, contentSha256, error: err instanceof Error ? err.message : String(err) };
  }
}
