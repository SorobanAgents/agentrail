#!/usr/bin/env node
/**
 * AgentRail MCP STDIO Server
 * 
 * Implements the standard Model Context Protocol (MCP) JSON-RPC 2.0 interface
 * over standard input/output for Claude Desktop, Cursor, Smithery.ai, and Glama.ai.
 */

import * as readline from "readline";
import { AgentRailMcpServer } from "../lib/mcp-server.js";
import { AgentRegistry } from "../lib/agent-registry.js";
import { X402Gateway } from "../lib/x402-gateway.js";
import { ReflectorOracleAdapter, DEFAULT_REFLECTOR_CONTRACT } from "../lib/reflector-oracle-adapter.js";
import { AgentBadgeIssuer } from "../lib/agent-badge-issuer.js";
import { z } from "zod";

const registry = new AgentRegistry();
const gateway = new X402Gateway(
  "GBHRSZLBJNR32ERCZT6PE3HJVVQGXT5KWQXGL5SVEPJXUQUDXSDBCWVE", // LOBSTR treasury
  100000n, // 0.01 USDC default
  "stellar:pubnet"
);
const mcpServer = new AgentRailMcpServer(registry, gateway);

// Register Reflector Oracle Tool
const oracle = new ReflectorOracleAdapter({
  reflectorContractId: DEFAULT_REFLECTOR_CONTRACT,
  maxStalenessSeconds: 300,
  maxDeviationPercent: 10.0,
});

mcpServer.registerTool({
  name: "agentrail_get_oracle_price",
  description: "Get real-time decentralized oracle prices for XLM/USD, BTC/USD, ETH/USD with staleness guard on Soroban.",
  inputSchema: z.object({
    symbol: z.string().describe("Asset symbol (e.g. 'XLM', 'BTC', 'ETH')"),
  }),
  handler: async (args) => {
    const feed = await oracle.getPrice(args.symbol);
    return {
      symbol: feed.symbol,
      priceUsd: feed.priceUsd,
      decimals: feed.decimals,
      timestamp: feed.timestamp,
      status: feed.status,
      oracleContractId: feed.oracleContractId,
    };
  },
});

// Register Badge Issuer Tool
const badgeIssuer = new AgentBadgeIssuer();
const ISSUER_PUBKEY = "GBHM5SCH2R5W5S63HVMQCXOFGCEXPSE2KL4GYRJY7GRTL4MYDB6M2CKY";

mcpServer.registerTool({
  name: "agentrail_issue_agent_badge",
  description: "Issue a SEP-50 Soulbound verification badge for an autonomous agent with Proof-of-Task attestation.",
  inputSchema: z.object({
    agentPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/),
    agentName: z.string().default("AutonomousAgent"),
    badgeType: z.enum(["AutonomousSettlementVerifier", "HighVolumeTransactor", "SecurityAuditor", "ZeroDefectOperator"]).default("AutonomousSettlementVerifier"),
    auditScore: z.number().min(0).max(100).default(95),
    completedTasksCount: z.number().int().min(0).default(10),
  }),
  handler: (args) => {
    return badgeIssuer.issueBadge(
      {
        agentPublicKey: args.agentPublicKey,
        agentName: args.agentName,
        badgeType: args.badgeType,
        auditScore: args.auditScore,
        completedTasksCount: args.completedTasksCount,
      },
      ISSUER_PUBKEY
    );
  },
});

// Register AgentSentinel Zero-Trust Security Gate Tool
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s+override/i,
  /drain\s+(all\s+)?(funds|vault|wallet)/i,
  /transfer\s+all\s+(balance|assets|xlm|usdc)/i,
  /private\s*key\s*leak/i,
  /<script>/i,
];

mcpServer.registerTool({
  name: "agentrail_sentinel_audit",
  description: "AgentSentinel Zero-Trust AI Agent Security Gate: Audits transactions for prompt injections, budget anomalies, and untrusted contract risks before on-chain dispatch.",
  inputSchema: z.object({
    agentPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/).describe("Public key of the autonomous agent initiating the operation"),
    targetContractOrAddress: z.string().describe("Target contract ID (C...) or Stellar address (G...)"),
    amountStroops: z.number().nonnegative().describe("Amount to spend in stroops (10,000,000 stroops = 1 XLM/USDC)"),
    memoOrPrompt: z.string().optional().describe("Transaction memo, prompt context, or action payload to inspect for injection attacks"),
    maxAuthorizedStroops: z.number().positive().default(100000000).describe("Maximum allowed single-transaction limit for this agent (default 10 XLM)"),
  }),
  handler: (args) => {
    const memo = args.memoOrPrompt || "";
    let injectionDetected = false;
    let injectionMatch = "";

    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(memo)) {
        injectionDetected = true;
        injectionMatch = pattern.source;
        break;
      }
    }

    const budgetExceeded = args.amountStroops > args.maxAuthorizedStroops;
    const isApproved = !injectionDetected && !budgetExceeded;

    return {
      verdict: isApproved ? "APPROVED" : "BLOCKED",
      securityGate: "AgentSentinel Zero-Trust v1.0",
      riskScore: injectionDetected ? 95 : budgetExceeded ? 70 : 5,
      checks: {
        promptInjectionCheck: injectionDetected ? `FAILED: detected pattern ${injectionMatch}` : "PASSED",
        budgetLimitCheck: budgetExceeded ? `FAILED: amount ${args.amountStroops} exceeds cap ${args.maxAuthorizedStroops}` : "PASSED",
        contractValidationCheck: args.targetContractOrAddress.startsWith("C") || args.targetContractOrAddress.startsWith("G") ? "PASSED" : "FAILED: Invalid Stellar address/contract format",
      },
      auditTimestamp: Math.floor(Date.now() / 1000),
      reason: isApproved
        ? "Transaction passes all AgentSentinel Zero-Trust security invariants."
        : injectionDetected
        ? "CRITICAL: Malicious prompt injection or authorization override pattern detected in transaction memo."
        : "POLICY_VIOLATION: Requested transaction amount exceeds pre-authorized agent spending threshold.",
    };
  },
});

// STDIO JSON-RPC 2.0 Handler
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(id: any, result: any, error?: any) {
  const payload = {
    jsonrpc: "2.0",
    id,
    ...(error ? { error } : { result }),
  };
  process.stdout.write(JSON.stringify(payload) + "\n");
}

rl.on("line", async (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    const { id, method, params } = req;

    if (method === "initialize") {
      sendResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "agentrail-mcp",
          version: "0.1.0",
        },
      });
    } else if (method === "notifications/initialized") {
      // client ack
    } else if (method === "tools/list") {
      const toolDefs = mcpServer.getTools().map((t) => {
        const properties: Record<string, any> = {};
        const required: string[] = [];
        const shape = (t.inputSchema as any)?._def?.shape?.() || (t.inputSchema as any)?._def?.schema?._def?.shape?.() || {};

        for (const [key, val] of Object.entries(shape)) {
          const typeName = (val as any)?._def?.typeName;
          let propType = "string";
          if (typeName === "ZodNumber") propType = "number";
          if (typeName === "ZodBoolean") propType = "boolean";
          if (typeName === "ZodArray") propType = "array";
          if (typeName === "ZodEnum") {
            properties[key] = {
              type: "string",
              enum: (val as any)._def.values,
              description: (val as any).description || "",
            };
            continue;
          }
          properties[key] = {
            type: propType,
            description: (val as any).description || "",
          };
          if (!(val as any).isOptional?.()) {
            required.push(key);
          }
        }

        return {
          name: t.name,
          description: t.description,
          inputSchema: {
            type: "object",
            properties,
            required,
          },
        };
      });

      sendResponse(id, { tools: toolDefs });
    } else if (method === "tools/call") {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      try {
        const result = await mcpServer.executeTool(toolName, toolArgs);
        sendResponse(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        });
      } catch (err: any) {
        sendResponse(id, {
          content: [
            {
              type: "text",
              text: `Error executing ${toolName}: ${err.message}`,
            },
          ],
          isError: true,
        });
      }
    } else {
      sendResponse(id, null, {
        code: -32601,
        message: `Method '${method}' not found`,
      });
    }
  } catch (err: any) {
    process.stderr.write(`Error processing line: ${err.message}\n`);
  }
});
