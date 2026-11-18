import { describe, it, expect } from "vitest";
import { StrKey } from "@stellar/stellar-sdk";
import {
  SANDBOX_CONTRACT_ID,
  SANDBOX_RECEIPT_TAG,
  anchorSandboxReceipt,
  executeSandboxSpend,
  provisionSandbox,
} from "../src/cli/sandbox.js";
import { ReceiptAnchorProvider, hashReceipt, buildSpendReceipt } from "../src/lib/receipts.js";

function fakeProvider(): ReceiptAnchorProvider & { calls: { hash: string; tag?: string }[] } {
  const calls: { hash: string; tag?: string }[] = [];
  return {
    calls,
    async anchor(req) {
      calls.push(req);
      return { cid: "QmSandbox", contentSha256: req.hash };
    },
  };
}

describe("Sandbox receipts (opt-in --receipt in the demo)", () => {
  it("uses valid Stellar key formats for the sandbox agent and destination", () => {
    const env = provisionSandbox();
    const { request } = executeSandboxSpend(env, "0.45");
    expect(StrKey.isValidEd25519PublicKey(env.agent.publicKey)).toBe(true);
    expect(StrKey.isValidEd25519PublicKey(request.destination)).toBe(true);
    expect(StrKey.isValidContract(SANDBOX_CONTRACT_ID)).toBe(true);
  });

  it("returns the spend request alongside the result", () => {
    const env = provisionSandbox();
    const spend = executeSandboxSpend(env, "0.45", "inference:test");
    expect(spend.result.ok).toBe(true);
    expect(spend.request.allowanceId).toBe(env.allowance.id);
    expect(spend.request.agentPublicKey).toBe(env.agent.publicKey);
    expect(spend.request.amountStroops).toBe(4_500_000n);
    expect(spend.request.memo).toBe("inference:test");
  });

  it("anchors only the hash, tagged agentrail-sandbox, and returns a verify URL", async () => {
    const env = provisionSandbox();
    const spend = executeSandboxSpend(env, "0.45");
    const provider = fakeProvider();
    const out = await anchorSandboxReceipt(spend, provider);

    const expectedHash = hashReceipt(buildSpendReceipt(spend.request, spend.result, { contractId: SANDBOX_CONTRACT_ID }));
    expect(provider.calls).toEqual([{ hash: expectedHash, tag: SANDBOX_RECEIPT_TAG }]);
    expect(out).toEqual({
      ok: true,
      cid: "QmSandbox",
      contentSha256: expectedHash,
      verifyUrl: "https://nirium.xyz/verify?cid=QmSandbox",
    });
  });

  it("does not anchor anything for a rejected spend", async () => {
    const env = provisionSandbox("Small-Budget", "0.10");
    const spend = executeSandboxSpend(env, "5.00");
    const provider = fakeProvider();
    const out = await anchorSandboxReceipt(spend, provider);

    expect(spend.result.ok).toBe(false);
    expect(out).toEqual({
      ok: false,
      contentSha256: "",
      error: "Spend was rejected (ALLOWANCE_EXCEEDED); no receipt to anchor",
    });
    expect(provider.calls).toHaveLength(0);
  });

  it("returns ok:false instead of throwing on invalid input", async () => {
    const env = provisionSandbox();
    const spend = executeSandboxSpend(env, "0.45");
    const provider = fakeProvider();

    const badContract = await anchorSandboxReceipt(spend, provider, "not-a-contract");
    expect(badContract.ok).toBe(false);

    const badRequest = await anchorSandboxReceipt(
      { result: spend.result, request: { ...spend.request, destination: "nope" } },
      provider
    );
    expect(badRequest.ok).toBe(false);
    expect(provider.calls).toHaveLength(0);
  });

  it("reports a non-Error throw as a string", async () => {
    const env = provisionSandbox();
    const spend = executeSandboxSpend(env, "0.45");
    const throwingRequest = new Proxy(spend.request, {
      get(target, prop) {
        if (prop === "allowanceId") throw "boom";
        return Reflect.get(target, prop);
      },
    });
    const out = await anchorSandboxReceipt({ result: spend.result, request: throwingRequest }, fakeProvider());
    expect(out).toEqual({ ok: false, contentSha256: "", error: "boom" });
  });
});
