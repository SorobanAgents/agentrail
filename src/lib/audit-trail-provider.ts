import { z } from "zod";
import { ReceiptAnchorProvider } from "./receipts.js";

/**
 * Network boundary for receipts: anchors a sha-256 hash on a public Audit Trail node
 * (`POST /api/audit/log`). Only the hash is sent. `fetchImpl` is injectable so tests
 * never touch the network.
 */

export const AUDIT_TRAIL_TESTNET_URL = "https://nirium-agent.fly.dev";
export const AUDIT_TRAIL_MAINNET_URL = "https://nirium-agent-mainnet.fly.dev";

type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const ProviderOptionsSchema = z.object({
  baseUrl: z.string().url().startsWith("https://").default(AUDIT_TRAIL_TESTNET_URL),
  timeoutMs: z.number().int().positive().max(60_000).default(10_000),
});

const AnchorResponseSchema = z.object({
  cid: z.string().min(1),
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  gatewayUrl: z.string().optional(),
  anchoredAt: z.string().optional(),
  attestedBy: z.string().optional(),
});

const ErrorBodySchema = z.object({ error: z.string() });

export function createAuditTrailProvider(
  options: { baseUrl?: string; timeoutMs?: number; fetchImpl?: FetchLike } = {}
): ReceiptAnchorProvider {
  const { baseUrl, timeoutMs } = ProviderOptionsSchema.parse({ baseUrl: options.baseUrl, timeoutMs: options.timeoutMs });
  const doFetch: FetchLike = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/audit/log`;

  return {
    async anchor(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        const body: unknown = await res.json().catch(() => undefined);
        if (!res.ok) {
          const parsedError = ErrorBodySchema.safeParse(body);
          const detail = parsedError.success ? parsedError.data.error : "no error message";
          throw new Error(`Audit Trail returned HTTP ${res.status}: ${detail}`);
        }
        const parsed = AnchorResponseSchema.parse(body);
        return {
          cid: parsed.cid,
          contentSha256: parsed.content_sha256,
          ...(parsed.gatewayUrl !== undefined ? { gatewayUrl: parsed.gatewayUrl } : {}),
          ...(parsed.anchoredAt !== undefined ? { anchoredAt: parsed.anchoredAt } : {}),
          ...(parsed.attestedBy !== undefined ? { attestedBy: parsed.attestedBy } : {}),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
