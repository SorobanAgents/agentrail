import { Keypair, Horizon, TransactionBuilder, Operation, Asset, Networks } from "@stellar/stellar-sdk";
import { anchorReceipt, buildSpendReceipt, ReceiptAnchorProvider, AnchorOutcome } from "../lib/receipts.js";
import { createAuditTrailProvider } from "../lib/audit-trail-provider.js";
import { SpendRequest, SpendResult } from "../types.js";

export const DEFAULT_TREASURY_ADDRESS = "GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT";
export const DEFAULT_CONTRACT_ID = "CBSWWN2CLUPW4VLYTGVJTT4XWXKF6LLJFQXEC7KK2KTAW3A26WIBZIN6";
export const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";
export const DEFAULT_PUBLIC_HORIZON_URL = "https://horizon.stellar.org";

export interface PipelineSpendParams {
  agentKeypair: Keypair;
  destinationAddress: string;
  treasuryAddress?: string;
  contractId?: string;
  allowanceId?: string;
  amountStroops: bigint;
  feeBps?: number;
  anchorReceiptFlag?: boolean;
  tag?: string;
  network?: "testnet" | "public";
  skipTreasury?: boolean;
  horizonUrl?: string;
  horizonServer?: Horizon.Server;
  auditProvider?: ReceiptAnchorProvider;
}

export interface PipelineSpendResult {
  ok: boolean;
  txHash?: string;
  explorerUrl?: string;
  grossStroops: bigint;
  feeStroops: bigint;
  netStroops: bigint;
  receipt?: unknown;
  contentSha256?: string;
  anchorOutcome?: AnchorOutcome;
  error?: string;
}

/**
 * Execute an on-chain autonomous micro-spend pipeline on Stellar Testnet or Public Mainnet,
 * optionally routing protocol fees (20 bps) to the treasury, and anchoring an attested
 * cryptographic receipt to Nirium's Audit Trail.
 */
export async function executeOnChainPipelineSpend(
  params: PipelineSpendParams
): Promise<PipelineSpendResult> {
  const isPublic = params.network === "public";
  const treasuryAddress = params.treasuryAddress ?? DEFAULT_TREASURY_ADDRESS;
  const contractId = params.contractId ?? DEFAULT_CONTRACT_ID;
  const allowanceId = params.allowanceId ?? `alw_pipeline_${Date.now()}`;
  const skipTreasury = params.skipTreasury ?? false;
  const feeBps = skipTreasury ? 0 : (params.feeBps ?? 20); // 20 bps = 0.20%

  const grossStroops = params.amountStroops;
  const feeStroops = (grossStroops * BigInt(feeBps)) / 10000n;
  const netStroops = grossStroops - feeStroops;

  const defaultHorizon = isPublic ? DEFAULT_PUBLIC_HORIZON_URL : DEFAULT_HORIZON_URL;
  const server = params.horizonServer ?? new Horizon.Server(params.horizonUrl ?? defaultHorizon);

  try {
    const account = await server.loadAccount(params.agentKeypair.publicKey());

    // Convert stroops (7 decimals) to string for Stellar payment operation
    const formatAmount = (stroops: bigint) => {
      const whole = stroops / 10000000n;
      const frac = (stroops % 10000000n).toString().padStart(7, "0");
      return `${whole}.${frac}`;
    };

    const netAmountStr = formatAmount(netStroops);
    const feeAmountStr = formatAmount(feeStroops);

    const builder = new TransactionBuilder(account, {
      fee: "1000",
      networkPassphrase: isPublic ? Networks.PUBLIC : Networks.TESTNET,
    }).addOperation(
      Operation.payment({
        destination: params.destinationAddress,
        asset: Asset.native(),
        amount: netAmountStr,
      })
    );

    if (feeStroops > 0n && !skipTreasury) {
      builder.addOperation(
        Operation.payment({
          destination: treasuryAddress,
          asset: Asset.native(),
          amount: feeAmountStr,
        })
      );
    }

    const tx = builder.setTimeout(30).build();
    tx.sign(params.agentKeypair);

    const submission = await server.submitTransaction(tx);
    const txHash = submission.hash;
    const explorerUrl = isPublic
      ? `https://stellar.expert/explorer/public/tx/${txHash}`
      : `https://stellar.expert/explorer/testnet/tx/${txHash}`;

    // Build canonical SpendRequest & SpendResult
    const request: SpendRequest = {
      allowanceId,
      agentPublicKey: params.agentKeypair.publicKey(),
      destination: params.destinationAddress,
      amountStroops: grossStroops,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const result: SpendResult = {
      ok: true,
      code: "SUCCESS",
      message: isPublic
        ? "Pipeline payment settled on Stellar public mainnet"
        : "Pipeline payment settled on Stellar testnet",
      remainingStroops: 0n,
      feeStroops,
      netStroops,
    };

    const receipt = buildSpendReceipt(request, result, {
      contractId,
      txHash,
    });

    let anchorOutcome: AnchorOutcome | undefined;
    if (params.anchorReceiptFlag !== false) {
      const provider = params.auditProvider ?? createAuditTrailProvider();
      anchorOutcome = await anchorReceipt(receipt, provider, {
        tag: params.tag ?? "agentrail-pipeline-spend",
        network: isPublic ? "pubnet" : "testnet",
        signerKeypair: params.agentKeypair,
      });
    }

    return {
      ok: true,
      txHash,
      explorerUrl,
      grossStroops,
      feeStroops,
      netStroops,
      receipt,
      contentSha256: anchorOutcome?.contentSha256,
      anchorOutcome,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      grossStroops,
      feeStroops,
      netStroops,
      error: errorMsg,
    };
  }
}
