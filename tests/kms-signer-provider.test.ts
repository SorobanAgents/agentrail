import { describe, it, expect, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  AwsKmsSignerProvider,
  GcpKmsSignerProvider,
  LedgerHardwareSignerProvider,
  encodeSpkiEd25519PublicKey,
  extractStellarPublicKey,
} from "../src/providers/kms-signer-provider.js";

describe("Ed25519 HSM & Cloud KMS Signer Providers (#30)", () => {
  const payload = Buffer.from("agentrail:treasury:authorize:10000000", "utf8");

  it("extracts Stellar G... public keys from both 32-byte raw and 44-byte SPKI DER formats", () => {
    const kp = Keypair.random();
    const raw32 = kp.rawPublicKey();
    const spki44 = encodeSpkiEd25519PublicKey(raw32);

    expect(extractStellarPublicKey(raw32)).toBe(kp.publicKey());
    expect(extractStellarPublicKey(spki44)).toBe(kp.publicKey());
    expect(() => extractStellarPublicKey(Buffer.alloc(16))).toThrow(
      /Unsupported Ed25519 public key length/
    );
  });

  it("signs and verifies payloads via AWS KMS Ed25519 provider without exposing private keys", async () => {
    const hsmInternalKey = Keypair.random();
    const spkiDer = encodeSpkiEd25519PublicKey(hsmInternalKey.rawPublicKey());

    const getPublicKeySpy = vi.fn(async () => ({
      PublicKey: spkiDer,
      SigningAlgorithms: ["ED25519_SHA_512"],
    }));

    const signSpy = vi.fn(async ({ Message }: { Message: Uint8Array }) => ({
      Signature: hsmInternalKey.sign(Buffer.from(Message)),
    }));

    const awsSigner = new AwsKmsSignerProvider({
      keyId: "arn:aws:kms:us-east-1:123456789012:key/agentrail-treasury-root",
      client: {
        getPublicKey: getPublicKeySpy,
        sign: signSpy,
      },
    });

    const pubKey1 = await awsSigner.getPublicKey();
    const pubKey2 = await awsSigner.getPublicKey();
    expect(pubKey1).toBe(hsmInternalKey.publicKey());
    expect(pubKey2).toBe(hsmInternalKey.publicKey());
    // Public key is cached after initial KMS fetch
    expect(getPublicKeySpy).toHaveBeenCalledTimes(1);

    const signature = await awsSigner.sign(payload);
    expect(signature.length).toBe(64);
    expect(await awsSigner.verify(payload, signature)).toBe(true);
    expect(await awsSigner.verify(Buffer.from("tampered"), signature)).toBe(false);

    // Ensure provider instance never stores secret seed properties
    const serialized = JSON.stringify(awsSigner);
    expect(serialized).not.toContain(hsmInternalKey.secret());
  });

  it("signs and verifies payloads via GCP Cloud KMS Ed25519 PEM provider", async () => {
    const gcpInternalKey = Keypair.random();
    const spkiDer = encodeSpkiEd25519PublicKey(gcpInternalKey.rawPublicKey());
    const pem = [
      "-----BEGIN PUBLIC KEY-----",
      spkiDer.toString("base64"),
      "-----END PUBLIC KEY-----",
    ].join("\n");

    const gcpSigner = new GcpKmsSignerProvider({
      keyVersionName:
        "projects/soroban-agents/locations/global/keyRings/treasury/cryptoKeys/root/cryptoKeyVersions/1",
      client: {
        getPublicKey: async () => ({ pem, algorithm: "EC_SIGN_ED25519" }),
        asymmetricSign: async ({ data }) => ({
          signature: gcpInternalKey.sign(Buffer.from(data)),
        }),
      },
    });

    const pubKey = await gcpSigner.getPublicKey();
    expect(pubKey).toBe(gcpInternalKey.publicKey());

    const signature = await gcpSigner.sign(payload);
    expect(await gcpSigner.verify(payload, signature)).toBe(true);
  });

  it("enforces SEP-0005 BIP-44 derivation paths and hash-signing check on Ledger HSM provider", async () => {
    const ledgerInternalKey = Keypair.random();

    expect(
      () =>
        new LedgerHardwareSignerProvider({
          derivationPath: "44'/60'/0'", // Ethereum path instead of Stellar 148'
          transport: {
            getAppConfiguration: async () => ({
              version: "5.0.0",
              hashSigningEnabled: true,
            }),
            getPublicKey: async () => ({
              rawPublicKey: ledgerInternalKey.rawPublicKey(),
            }),
            signHash: async () => ({ signature: Buffer.alloc(64) }),
          },
        })
    ).toThrow(/Invalid SEP-0005 Stellar BIP-44 derivation path/);

    const ledgerSigner = new LedgerHardwareSignerProvider({
      derivationPath: "44'/148'/0'",
      transport: {
        getAppConfiguration: async () => ({
          version: "5.0.0",
          hashSigningEnabled: true,
        }),
        getPublicKey: async () => ({
          rawPublicKey: ledgerInternalKey.rawPublicKey(),
        }),
        signHash: async (_path, hash) => ({
          signature: ledgerInternalKey.sign(Buffer.from(hash)),
        }),
      },
    });

    expect(await ledgerSigner.getPublicKey()).toBe(ledgerInternalKey.publicKey());
    const sig = await ledgerSigner.sign(payload);
    expect(await ledgerSigner.verify(payload, sig)).toBe(true);
  });
});
