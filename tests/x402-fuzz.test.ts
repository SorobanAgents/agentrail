import { describe, it, expect, beforeEach } from "vitest";
import {
  X402Gateway,
  PaymentAuthorizationHeader,
  GatewayVerificationResult,
  MAX_FUTURE_TIMESTAMP_SKEW_SECONDS,
} from "../src/lib/x402-gateway.js";

const STELLAR_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const HEX_LOWER = "0123456789abcdef";
const HEX_MIXED = "0123456789abcdefABCDEF";
const DETERMINISTIC_CODES = new Set<GatewayVerificationResult["code"]>([
  "PAYMENT_REQUIRED",
  "INVALID_NONCE",
  "EXPIRED_CHALLENGE",
  "UNDERPAID",
]);

function createSeededPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function randomHex(rng: () => number, length: number, alphabet = HEX_LOWER): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(rng() * alphabet.length)];
  }
  return out;
}

function randomStellarAddress(rng: () => number): string {
  let out = "G";
  for (let i = 0; i < 55; i++) {
    out += STELLAR_BASE32[Math.floor(rng() * STELLAR_BASE32.length)];
  }
  return out;
}

function flipHexCase(hex: string, rng: () => number): string {
  let out = "";
  for (let i = 0; i < hex.length; i++) {
    const ch = hex[i]!;
    out += rng() < 0.5 ? ch.toUpperCase() : ch.toLowerCase();
  }
  return out;
}

type AttackClass =
  | "reused_nonce"
  | "fabricated_nonce"
  | "bad_timestamp"
  | "altered_recipient"
  | "tampered_tx_hash"
  | "reorg_or_underpaid";

describe("X402Gateway - Adversarial Fuzzing & Replay Immunity", () => {
  const merchantWallet = "GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT";
  const defaultPayer = "GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY";
  const defaultPrice = 1000000n; // 0.1 USDC
  let gateway: X402Gateway;

  beforeEach(() => {
    gateway = new X402Gateway(merchantWallet, defaultPrice, "stellar:pubnet");
  });

  it("rejects 100% of 1,000 randomized adversarial settlement permutations deterministically in < 3s", () => {
    const rng = createSeededPrng(0xa402f022);
    const totalCases = 1000;
    const attackClasses: AttackClass[] = [
      "reused_nonce",
      "fabricated_nonce",
      "bad_timestamp",
      "altered_recipient",
      "tampered_tx_hash",
      "reorg_or_underpaid",
    ];
    const classCounts: Record<AttackClass, number> = {
      reused_nonce: 0,
      fabricated_nonce: 0,
      bad_timestamp: 0,
      altered_recipient: 0,
      tampered_tx_hash: 0,
      reorg_or_underpaid: 0,
    };

    const settledNonces: string[] = [];
    const settledTxHashes: string[] = [];

    // Seed initial consumed nonce and settled txHash for replay permutations
    const seedChallenge = gateway.createChallenge("Seed Settlement", defaultPrice, 300);
    const seedTxHash = randomHex(rng, 64);
    const seedResult = gateway.verifyPayment({
      txHash: seedTxHash,
      payerPublicKey: defaultPayer,
      destination: merchantWallet,
      amountStroops: defaultPrice.toString(),
      nonce: seedChallenge.nonce,
      timestamp: Math.floor(Date.now() / 1000),
    });
    expect(seedResult.ok).toBe(true);
    settledNonces.push(seedChallenge.nonce);
    settledTxHashes.push(seedTxHash);

    let maliciousAccepted = 0;
    let rejectedCount = 0;

    const startMs = performance.now();

    for (let i = 0; i < totalCases; i++) {
      const now = Math.floor(Date.now() / 1000);
      const attackClass = attackClasses[Math.floor(rng() * attackClasses.length)]!;
      classCounts[attackClass]++;

      let result: GatewayVerificationResult;
      let expectedCodes: ReadonlyArray<GatewayVerificationResult["code"]>;

      switch (attackClass) {
        case "reused_nonce": {
          const consumedNonce = settledNonces[Math.floor(rng() * settledNonces.length)]!;
          const payload: PaymentAuthorizationHeader = {
            txHash: rng() < 0.5 ? randomHex(rng, 64) : settledTxHashes[Math.floor(rng() * settledTxHashes.length)]!,
            payerPublicKey: randomStellarAddress(rng),
            destination: merchantWallet,
            amountStroops: defaultPrice.toString(),
            nonce: consumedNonce,
            timestamp: now,
          };
          result = gateway.verifyPayment(payload);
          expectedCodes = ["INVALID_NONCE"];
          break;
        }

        case "fabricated_nonce": {
          const badNonces = [
            "",
            randomHex(rng, 32),
            randomHex(rng, randInt(rng, 1, 31)),
            "0".repeat(32),
            ` ${randomHex(rng, 31)}`,
          ];
          const nonce = badNonces[Math.floor(rng() * badNonces.length)]!;
          const payload: PaymentAuthorizationHeader = {
            txHash: randomHex(rng, 64),
            payerPublicKey: defaultPayer,
            destination: merchantWallet,
            amountStroops: defaultPrice.toString(),
            nonce,
            timestamp: now,
          };
          result = gateway.verifyPayment(payload);
          expectedCodes = nonce.length === 0 ? ["PAYMENT_REQUIRED"] : ["INVALID_NONCE"];
          break;
        }

        case "bad_timestamp": {
          const variant = randInt(rng, 0, 2);
          if (variant === 0) {
            // Expired challenge TTL
            const expired = gateway.createChallenge("Expired Fuzz Challenge", defaultPrice, -randInt(rng, 1, 600));
            result = gateway.verifyPayment({
              txHash: randomHex(rng, 64),
              payerPublicKey: defaultPayer,
              destination: merchantWallet,
              amountStroops: defaultPrice.toString(),
              nonce: expired.nonce,
              timestamp: now,
            });
            expectedCodes = ["EXPIRED_CHALLENGE"];
          } else if (variant === 1) {
            // Future-dated authorization timestamp beyond skew or challenge expiry
            const fresh = gateway.createChallenge("Future TS Fuzz Challenge", defaultPrice, 300);
            const futureTs = now + MAX_FUTURE_TIMESTAMP_SKEW_SECONDS + randInt(rng, 1, 86400 * 30);
            result = gateway.verifyPayment({
              txHash: randomHex(rng, 64),
              payerPublicKey: defaultPayer,
              destination: merchantWallet,
              amountStroops: defaultPrice.toString(),
              nonce: fresh.nonce,
              timestamp: futureTs,
            });
            expectedCodes = ["EXPIRED_CHALLENGE"];
          } else {
            // Zero or negative timestamp
            const fresh = gateway.createChallenge("Non-positive TS Fuzz Challenge", defaultPrice, 300);
            const badTs = rng() < 0.5 ? 0 : -randInt(rng, 1, 100000);
            result = gateway.verifyPayment({
              txHash: randomHex(rng, 64),
              payerPublicKey: defaultPayer,
              destination: merchantWallet,
              amountStroops: defaultPrice.toString(),
              nonce: fresh.nonce,
              timestamp: badTs,
            });
            expectedCodes = ["PAYMENT_REQUIRED"];
          }
          break;
        }

        case "altered_recipient": {
          const fresh = gateway.createChallenge("Recipient Fuzz Challenge", defaultPrice, 300);
          let attackerDest = randomStellarAddress(rng);
          if (attackerDest === merchantWallet) {
            attackerDest = defaultPayer;
          }
          const malformedDest = rng() < 0.25 ? "INVALID_STELLAR_ADDRESS" : attackerDest;
          result = gateway.verifyPayment({
            txHash: randomHex(rng, 64),
            payerPublicKey: defaultPayer,
            destination: malformedDest,
            amountStroops: defaultPrice.toString(),
            nonce: fresh.nonce,
            timestamp: now,
          });
          expectedCodes = ["PAYMENT_REQUIRED"];
          break;
        }

        case "tampered_tx_hash": {
          const fresh = gateway.createChallenge("TxHash Fuzz Challenge", defaultPrice, 300);
          const badHashes = [
            "",
            randomHex(rng, randInt(rng, 1, 63)),
            randomHex(rng, randInt(rng, 65, 96)),
            `${randomHex(rng, 62)}zz`,
            ` ${randomHex(rng, 63)}`,
            `0x${randomHex(rng, 62)}`,
          ];
          const tamperedHash = badHashes[Math.floor(rng() * badHashes.length)]!;
          result = gateway.verifyPayment({
            txHash: tamperedHash,
            payerPublicKey: defaultPayer,
            destination: merchantWallet,
            amountStroops: defaultPrice.toString(),
            nonce: fresh.nonce,
            timestamp: now,
          });
          expectedCodes = ["PAYMENT_REQUIRED"];
          break;
        }

        case "reorg_or_underpaid": {
          const variant = randInt(rng, 0, 2);
          if (variant === 0) {
            // Simulated re-org: replay an already-settled txHash (including mixed/uppercase) on a fresh challenge
            const fresh = gateway.createChallenge("Reorg Replay Fuzz Challenge", defaultPrice, 300);
            const priorTx = settledTxHashes[Math.floor(rng() * settledTxHashes.length)]!;
            const reorgTx = flipHexCase(priorTx, rng);
            result = gateway.verifyPayment({
              txHash: reorgTx,
              payerPublicKey: defaultPayer,
              destination: merchantWallet,
              amountStroops: defaultPrice.toString(),
              nonce: fresh.nonce,
              timestamp: now,
            });
            expectedCodes = ["INVALID_NONCE"];
          } else if (variant === 1) {
            // Underpaid amountStroops
            const fresh = gateway.createChallenge("Underpaid Fuzz Challenge", defaultPrice, 300);
            const underAmt = BigInt(randInt(rng, 0, Number(defaultPrice) - 1)).toString();
            result = gateway.verifyPayment({
              txHash: randomHex(rng, 64, HEX_MIXED),
              payerPublicKey: defaultPayer,
              destination: merchantWallet,
              amountStroops: underAmt,
              nonce: fresh.nonce,
              timestamp: now,
            });
            expectedCodes = ["UNDERPAID"];
          } else {
            // Tampered non-integer amountStroops (must fail Zod cleanly without BigInt SyntaxError)
            const fresh = gateway.createChallenge("Malformed Amount Fuzz Challenge", defaultPrice, 300);
            const badAmounts = ["-1000000", "1000.5", "not-a-number", "", "1e6"];
            result = gateway.verifyPayment({
              txHash: randomHex(rng, 64),
              payerPublicKey: defaultPayer,
              destination: merchantWallet,
              amountStroops: badAmounts[Math.floor(rng() * badAmounts.length)]!,
              nonce: fresh.nonce,
              timestamp: now,
            });
            expectedCodes = ["PAYMENT_REQUIRED"];
          }
          break;
        }
      }

      if (result.ok) {
        maliciousAccepted++;
      } else {
        rejectedCount++;
      }

      expect(result.ok).toBe(false);
      expect(DETERMINISTIC_CODES.has(result.code)).toBe(true);
      expect(expectedCodes).toContain(result.code);
      expect(typeof result.error).toBe("string");
      expect((result.error ?? "").length).toBeGreaterThan(0);

      // Periodically register a fresh valid settlement so the reorg & consumed-nonce pools stay diverse
      if (i % 50 === 0) {
        const legitChallenge = gateway.createChallenge("Legit Pool Seed", defaultPrice, 300);
        const legitTx = randomHex(rng, 64);
        const legitRes = gateway.verifyPayment({
          txHash: legitTx,
          payerPublicKey: defaultPayer,
          destination: merchantWallet,
          amountStroops: defaultPrice.toString(),
          nonce: legitChallenge.nonce,
          timestamp: now,
        });
        expect(legitRes.ok).toBe(true);
        settledNonces.push(legitChallenge.nonce);
        settledTxHashes.push(legitTx);
      }
    }

    const elapsedMs = performance.now() - startMs;

    expect(maliciousAccepted).toBe(0);
    expect(rejectedCount).toBe(totalCases);
    for (const cls of attackClasses) {
      expect(classCounts[cls]).toBeGreaterThan(100);
    }
    expect(elapsedMs).toBeLessThan(3000);
  });

  it("generates 1,000 collision-free cryptographic nonces under rapid challenge bursts", () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const challenge = gateway.createChallenge(`Burst #${i}`);
      expect(challenge.nonce).toMatch(/^[0-9a-f]{32}$/);
      nonces.add(challenge.nonce);
    }
    expect(nonces.size).toBe(1000);
  });

  it("accepts 100% of legitimate settlements when interleaved with adversarial attacks", () => {
    const rng = createSeededPrng(0x1337c0de);
    const now = Math.floor(Date.now() / 1000);

    for (let i = 0; i < 50; i++) {
      const attackChallenge = gateway.createChallenge(`Attack ${i}`, defaultPrice, 300);
      const attackRes = gateway.verifyPayment({
        txHash: randomHex(rng, 64),
        payerPublicKey: defaultPayer,
        destination: randomStellarAddress(rng),
        amountStroops: defaultPrice.toString(),
        nonce: attackChallenge.nonce,
        timestamp: now,
      });
      expect(attackRes.ok).toBe(false);

      const legitChallenge = gateway.createChallenge(`Legit ${i}`, defaultPrice, 300);
      const legitPayload: PaymentAuthorizationHeader = {
        txHash: randomHex(rng, 64),
        payerPublicKey: randomStellarAddress(rng),
        amountStroops: defaultPrice.toString(),
        nonce: legitChallenge.nonce,
        timestamp: now,
      };
      if (i % 2 === 0) {
        legitPayload.destination = merchantWallet;
      }
      const legitRes = gateway.verifyPayment(legitPayload);
      expect(legitRes.ok).toBe(true);
      expect(legitRes.code).toBe("AUTHORIZED");
      expect(legitRes.receiptHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
