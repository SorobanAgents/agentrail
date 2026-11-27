/**
 * AgentRail - Model Context Protocol (MCP) Action Server
 * 
 * Provides production-ready MCP tools for LLMs (Claude, Gemini, Cursor, LangChain)
 * to autonomously inspect balances, discover peer agents, enforce scoped allowances,
 * and settle x402 micropayments natively on Stellar Soroban.
 */

import { z } from "zod";
import { AgentRegistry, AgentService } from "./agent-registry.js";
import { X402Gateway, PaymentAuthorizationHeader } from "./x402-gateway.js";
import { verifyAndDeductSpend } from "./scoped-allowance.js";
import { ScopedAllowance, SpendRequest } from "../types.js";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (args: any) => Promise<any> | any;
}

export class AgentRailMcpServer {
  private tools: Map<string, McpToolDefinition> = new Map();
  private allowances: Map<string, ScopedAllowance> = new Map();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly defaultGateway?: X402Gateway
  ) {
    this.registerCoreTools();
  }

  public registerAllowance(allowance: ScopedAllowance) {
    this.allowances.set(allowance.id, allowance);
  }

  private registerCoreTools() {
    // Tool 1: Discover Agent Services
    this.registerTool({
      name: "agentrail_discover_services",
      description: "Discover peer AI agents and tools by tag, keyword, or max price on Stellar.",
      inputSchema: z.object({
        tag: z.string().optional().describe("Category tag (e.g., 'ocr', 'finance', 'research')"),
        keyword: z.string().optional().describe("Search term in title or description"),
        maxCostStroops: z.string().optional().describe("Maximum cost in Stroops (1 USDC = 10,000,000 Stroops)"),
      }),
      handler: (args) => {
        const results = this.registry.discover({
          tag: args.tag,
          keyword: args.keyword,
          maxCostStroops: args.maxCostStroops ? BigInt(args.maxCostStroops) : undefined,
        });
        return {
          count: results.length,
          services: results.map(r => ({
            serviceId: r.service.serviceId,
            name: r.service.name,
            costUSDC: (Number(r.service.costStroops) / 1e7).toFixed(4),
            costStroops: r.service.costStroops.toString(),
            agentPublicKey: r.agentPublicKey,
            endpointUrl: r.service.endpointUrl,
            tags: r.service.tags,
            reputation: r.reputationScore,
          })),
        };
      },
    });

    // Tool 2: Register Agent Capability
    this.registerTool({
      name: "agentrail_register_service",
      description: "Register an autonomous service capability to the decentralized AgentRail registry.",
      inputSchema: z.object({
        agentPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/),
        serviceId: z.string().min(3),
        name: z.string().min(2),
        description: z.string(),
        tags: z.array(z.string()),
        endpointUrl: z.string().url(),
        costStroops: z.string().describe("Price per invocation in Stroops (e.g. '100000' = 0.01 USDC)"),
      }),
      handler: (args) => {
        const service: AgentService = {
          serviceId: args.serviceId,
          name: args.name,
          description: args.description,
          tags: args.tags,
          endpointUrl: args.endpointUrl,
          costStroops: BigInt(args.costStroops),
          settlementAsset: "USDC",
          slaLatencyMs: 2000,
        };
        const record = this.registry.registerService(args.agentPublicKey, service);
        return {
          success: true,
          registrationHash: record.registrationHash,
          ttlEpochSeconds: record.ttlEpochSeconds,
        };
      },
    });

    // Tool 3: Check and Enforce Scoped Allowance Spend Guard
    this.registerTool({
      name: "agentrail_evaluate_spend",
      description: "Pre-flight zero-trust security check before spending funds, asserting epoch budget, rate limits, and address-poisoning defense.",
      inputSchema: z.object({
        allowanceId: z.string(),
        agentPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/),
        destinationAddress: z.string().regex(/^G[A-Z2-7]{55}$/),
        spendStroops: z.string(),
      }),
      handler: (args) => {
        const allowance = this.allowances.get(args.allowanceId);
        if (!allowance) {
          return {
            authorized: false,
            code: "ALLOWANCE_NOT_FOUND",
            message: `Allowance '${args.allowanceId}' not registered in MCP context`,
          };
        }
        const request: SpendRequest = {
          allowanceId: args.allowanceId,
          agentPublicKey: args.agentPublicKey,
          destination: args.destinationAddress,
          amountStroops: BigInt(args.spendStroops),
          timestamp: Math.floor(Date.now() / 1000),
        };
        const result = verifyAndDeductSpend(allowance, request);
        return {
          authorized: result.ok,
          code: result.code,
          spentStroops: (result.spentStroops || 0n).toString(),
          remainingBudgetStroops: (result.remainingStroops || 0n).toString(),
          feeStroops: (result.feeStroops || 0n).toString(),
        };
      },
    });

    // Tool 4: Settle x402 Micropayment Challenge
    this.registerTool({
      name: "agentrail_settle_x402_challenge",
      description: "Verify and settle an HTTP 402 challenge with cryptographic proof of payment on Stellar.",
      inputSchema: z.object({
        txHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
        payerPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/),
        amountStroops: z.string(),
        nonce: z.string(),
      }),
      handler: (args) => {
        if (!this.defaultGateway) {
          throw new Error("No default x402 gateway configured on this MCP server");
        }
        const authPayload: PaymentAuthorizationHeader = {
          txHash: args.txHash,
          payerPublicKey: args.payerPublicKey,
          amountStroops: args.amountStroops,
          nonce: args.nonce,
          timestamp: Math.floor(Date.now() / 1000),
        };
        return this.defaultGateway.verifyPayment(authPayload);
      },
    });
  }

  public registerTool(tool: McpToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  public getTools(): McpToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public async executeTool(name: string, args: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found on AgentRail MCP Server`);
    }
    const validatedArgs = tool.inputSchema.parse(args);
    return tool.handler(validatedArgs);
  }
}
