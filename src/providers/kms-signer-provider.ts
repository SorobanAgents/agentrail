import { Keypair, StrKey } from "@stellar/stellar-sdk";

/**
 * Standard ASN.1 SubjectPublicKeyInfo (SPKI) DER prefix for a 32-byte Ed25519 public key (RFC 8410).
 * 30 2a 30 05 06 03 2b 65 70 03 21 00 (12 bytes) followed by 32 raw public key bytes.
 */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Abstract hardware or cloud KMS signer provider interface for enterprise agent treasury roots.
 * Implementations never expose raw Ed25519 seed material in application memory.
 */
export interface SignerProvider {
  readonly providerName: "aws-kms" | "gcp-kms" | "ledger-hsm";
  /** Return the Stellar Ed25519 StrKey public key (G...). */
  getPublicKey(): Promise<string>;
  /** Produce a 64-byte Ed25519 signature over the given payload bytes. */
  sign(payload: Uint8Array): Promise<Uint8Array>;
  /** Verify a 64-byte Ed25519 signature against the provider's Stellar public key. */
  verify(payload: Uint8Array, signature: Uint8Array): Promise<boolean>;
}

/**
 * Convert a 32-byte raw Ed25519 public key or 44-byte SPKI DER public key into a Stellar G... address.
 */
export function extractStellarPublicKey(publicKeyBytes: Uint8Array): string {
  const buf = Buffer.from(publicKeyBytes);
  if (buf.length === 32) {
    return StrKey.encodeEd25519PublicKey(buf);
  }
  if (
    buf.length === 44 &&
    buf.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    const raw32 = buf.subarray(ED25519_SPKI_PREFIX.length);
    return StrKey.encodeEd25519PublicKey(raw32);
  }
  throw new Error(
    `Unsupported Ed25519 public key length (${buf.length} bytes); expected 32-byte raw or 44-byte RFC 8410 SPKI DER.`
  );
}

/**
 * Encode a 32-byte raw Ed25519 public key into a 44-byte RFC 8410 SPKI DER buffer.
 */
export function encodeSpkiEd25519PublicKey(rawPublicKey32: Uint8Array): Buffer {
  if (rawPublicKey32.length !== 32) {
    throw new Error("Raw Ed25519 public key must be exactly 32 bytes.");
  }
  return Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(rawPublicKey32)]);
}

/**
 * Minimal transport interface for AWS KMS Asymmetric Ed25519 (`ECC_NIST_EDWARDS25519` / `EDDSA`).
 */
export interface AwsKmsClientTransport {
  getPublicKey(params: { KeyId: string }): Promise<{
    PublicKey: Uint8Array;
    SigningAlgorithms?: string[];
  }>;
  sign(params: {
    KeyId: string;
    Message: Uint8Array;
    MessageType: "RAW";
    SigningAlgorithm: "ED25519_SHA_512";
  }): Promise<{
    Signature: Uint8Array;
  }>;
}

/**
 * AWS KMS Ed25519 Signer Provider for enterprise agent treasury roots.
 */
export class AwsKmsSignerProvider implements SignerProvider {
  public readonly providerName = "aws-kms" as const;
  private readonly keyId: string;
  private readonly client: AwsKmsClientTransport;
  private cachedPublicKey?: string;

  constructor(options: { keyId: string; client: AwsKmsClientTransport }) {
    if (!options.keyId || !options.keyId.trim()) {
      throw new Error("AWS KMS keyId must be a non-empty key ARN or alias.");
    }
    this.keyId = options.keyId.trim();
    this.client = options.client;
  }

  public async getPublicKey(): Promise<string> {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }
    const response = await this.client.getPublicKey({ KeyId: this.keyId });
    this.cachedPublicKey = extractStellarPublicKey(response.PublicKey);
    return this.cachedPublicKey;
  }

  public async sign(payload: Uint8Array): Promise<Uint8Array> {
    if (payload.length === 0) {
      throw new Error("Cannot sign an empty payload.");
    }
    const response = await this.client.sign({
      KeyId: this.keyId,
      Message: payload,
      MessageType: "RAW",
      SigningAlgorithm: "ED25519_SHA_512",
    });
    if (response.Signature.length !== 64) {
      throw new Error(
        `Invalid Ed25519 signature length from AWS KMS: expected 64 bytes, got ${response.Signature.length}.`
      );
    }
    return new Uint8Array(response.Signature);
  }

  public async verify(payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
    if (signature.length !== 64) {
      return false;
    }
    const pubKey = await this.getPublicKey();
    return Keypair.fromPublicKey(pubKey).verify(
      Buffer.from(payload),
      Buffer.from(signature)
    );
  }
}

/**
 * Minimal transport interface for Google Cloud KMS (`EC_SIGN_ED25519`).
 */
export interface GcpKmsClientTransport {
  getPublicKey(params: { name: string }): Promise<{
    pem?: string;
    derPublicKey?: Uint8Array;
    algorithm?: string;
  }>;
  asymmetricSign(params: {
    name: string;
    data: Uint8Array;
  }): Promise<{
    signature: Uint8Array;
  }>;
}

/**
 * Google Cloud KMS Ed25519 Signer Provider for enterprise agent treasury roots.
 */
export class GcpKmsSignerProvider implements SignerProvider {
  public readonly providerName = "gcp-kms" as const;
  private readonly keyVersionName: string;
  private readonly client: GcpKmsClientTransport;
  private cachedPublicKey?: string;

  constructor(options: { keyVersionName: string; client: GcpKmsClientTransport }) {
    if (!options.keyVersionName || !options.keyVersionName.includes("/cryptoKeyVersions/")) {
      throw new Error(
        "GCP KMS keyVersionName must be a full resource path containing '/cryptoKeyVersions/'."
      );
    }
    this.keyVersionName = options.keyVersionName.trim();
    this.client = options.client;
  }

  public async getPublicKey(): Promise<string> {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }
    const response = await this.client.getPublicKey({ name: this.keyVersionName });
    if (response.derPublicKey) {
      this.cachedPublicKey = extractStellarPublicKey(response.derPublicKey);
      return this.cachedPublicKey;
    }
    if (response.pem) {
      const base64Body = response.pem
        .replace(/-----BEGIN PUBLIC KEY-----/g, "")
        .replace(/-----END PUBLIC KEY-----/g, "")
        .replace(/\s+/g, "");
      const derBytes = Buffer.from(base64Body, "base64");
      this.cachedPublicKey = extractStellarPublicKey(derBytes);
      return this.cachedPublicKey;
    }
    throw new Error("GCP KMS getPublicKey response did not contain derPublicKey or pem.");
  }

  public async sign(payload: Uint8Array): Promise<Uint8Array> {
    if (payload.length === 0) {
      throw new Error("Cannot sign an empty payload.");
    }
    const response = await this.client.asymmetricSign({
      name: this.keyVersionName,
      data: payload,
    });
    if (response.signature.length !== 64) {
      throw new Error(
        `Invalid Ed25519 signature length from GCP KMS: expected 64 bytes, got ${response.signature.length}.`
      );
    }
    return new Uint8Array(response.signature);
  }

  public async verify(payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
    if (signature.length !== 64) {
      return false;
    }
    const pubKey = await this.getPublicKey();
    return Keypair.fromPublicKey(pubKey).verify(
      Buffer.from(payload),
      Buffer.from(signature)
    );
  }
}

/**
 * Minimal transport interface for a Ledger Hardware Security Module (BIP-44 `44'/148'/account'`).
 */
export interface LedgerHardwareTransport {
  getAppConfiguration(): Promise<{ version: string; hashSigningEnabled: boolean }>;
  getPublicKey(derivationPath: string): Promise<{ rawPublicKey: Uint8Array }>;
  signHash(derivationPath: string, hash: Uint8Array): Promise<{ signature: Uint8Array }>;
}

/**
 * Ledger Hardware Key Signer Provider for cold-storage treasury root operations.
 */
export class LedgerHardwareSignerProvider implements SignerProvider {
  public readonly providerName = "ledger-hsm" as const;
  private readonly derivationPath: string;
  private readonly transport: LedgerHardwareTransport;
  private cachedPublicKey?: string;

  constructor(options: {
    derivationPath?: string;
    transport: LedgerHardwareTransport;
  }) {
    const path = (options.derivationPath ?? "44'/148'/0'").trim();
    if (!/^44'\/148'\/\d+'$/.test(path)) {
      throw new Error(
        `Invalid SEP-0005 Stellar BIP-44 derivation path '${path}'; expected format 44'/148'/account'.`
      );
    }
    this.derivationPath = path;
    this.transport = options.transport;
  }

  public async getPublicKey(): Promise<string> {
    if (this.cachedPublicKey) {
      return this.cachedPublicKey;
    }
    const { rawPublicKey } = await this.transport.getPublicKey(this.derivationPath);
    this.cachedPublicKey = extractStellarPublicKey(rawPublicKey);
    return this.cachedPublicKey;
  }

  public async sign(payload: Uint8Array): Promise<Uint8Array> {
    if (payload.length === 0) {
      throw new Error("Cannot sign an empty payload.");
    }
    const config = await this.transport.getAppConfiguration();
    if (!config.hashSigningEnabled) {
      throw new Error("Ledger Stellar app hash signing is disabled on the hardware device.");
    }
    const { signature } = await this.transport.signHash(this.derivationPath, payload);
    if (signature.length !== 64) {
      throw new Error(
        `Invalid Ed25519 signature length from Ledger HSM: expected 64 bytes, got ${signature.length}.`
      );
    }
    return new Uint8Array(signature);
  }

  public async verify(payload: Uint8Array, signature: Uint8Array): Promise<boolean> {
    if (signature.length !== 64) {
      return false;
    }
    const pubKey = await this.getPublicKey();
    return Keypair.fromPublicKey(pubKey).verify(
      Buffer.from(payload),
      Buffer.from(signature)
    );
  }
}
