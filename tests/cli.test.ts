import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { provisionSandbox, inspectBalance, executeSandboxSpend } from "../src/cli/sandbox.js";
import {
  getClaudeDesktopConfigPath,
  configureClaudeDesktop,
  runMcpConfigureClaude,
  DEFAULT_AGENTRAIL_MCP_CONFIG,
} from "../src/cli/claude-config.js";

describe("AgentRail CLI & Sandbox Provisioner", () => {
  it("should provision a sandbox session with active allowance and proper defaults", () => {
    const env = provisionSandbox("Test-Agent-X", "100.00", 25);
    expect(env.agent.name).toBe("Test-Agent-X");
    expect(env.ownerAddress).toBe("GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT");
    expect(env.treasuryAddress).toBe("GDDJH64X5VEXI7UWZMJA3YUG7ANYHKRRRFHLD2SF5OWEETNFBVYMRXZT");
    expect(env.protocolFeeBps).toBe(25);
    expect(env.allowance.active).toBe(true);
    expect(env.allowance.maxStroops).toBe(1000000000n);
    expect(env.allowance.spentStroops).toBe(0n);
  });

  it("should inspect initial balance accurately", () => {
    const env = provisionSandbox("Test-Agent-Y", "50.00", 20);
    const balance = inspectBalance(env, env.allowance.id);

    expect(balance.allowanceId).toBe(env.allowance.id);
    expect(balance.totalLimitStroops).toBe("500000000");
    expect(balance.spentStroops).toBe("0");
    expect(balance.remainingStroops).toBe("500000000");
    expect(balance.remainingUsdc).toBe("50.0000000");
    expect(balance.active).toBe(true);
    expect(balance.isExpired).toBe(false);
  });

  it("should execute micro-spend, deduct balance, and route protocol fee accurately", () => {
    const env = provisionSandbox("Test-Agent-Z", "10.00", 20); // 20 bps = 0.20%
    const { result, feeStroops, netStroops } = executeSandboxSpend(env, "2.00", "test:inference");

    expect(result.ok).toBe(true);
    expect(result.code).toBe("SPEND_AUTHORIZED");

    // 2 USDC = 20,000,000 stroops
    // 20 bps of 20,000,000 = 40,000 stroops
    // Net = 19,960,000 stroops
    expect(feeStroops).toBe(40000n);
    expect(netStroops).toBe(19960000n);
    expect(result.feeStroops).toBe(40000n);
    expect(result.netStroops).toBe(19960000n);

    // Verify post-spend inspection
    const postBalance = inspectBalance(env, env.allowance.id);
    expect(postBalance.spentStroops).toBe("20000000");
    expect(postBalance.remainingStroops).toBe("80000000");
    expect(postBalance.remainingUsdc).toBe("8.0000000");
  });

  it("should reject spend when exceeding remaining allowance balance", () => {
    const env = provisionSandbox("Test-Agent-Limited", "1.00", 20);
    const { result } = executeSandboxSpend(env, "5.00");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("ALLOWANCE_EXCEEDED");
  });

  it("should identify expired allowance during balance inspection", () => {
    const env = provisionSandbox("Test-Agent-Expiring", "10.00", 20);
    // Inspect with future timestamp past validUntil
    const futureTime = env.allowance.validUntil + 1000;
    const balance = inspectBalance(env, env.allowance.id, futureTime);

    expect(balance.isExpired).toBe(true);
    expect(balance.active).toBe(false);
  });
});

describe("Claude Desktop MCP Configuration Generator (Issue #80)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrail-claude-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Platform Path Resolution", () => {
    it("should resolve standard path on macOS (darwin)", () => {
      const resolved = getClaudeDesktopConfigPath("darwin", { HOME: "/Users/testuser" });
      expect(resolved).toBe(
        path.join("/Users/testuser", "Library", "Application Support", "Claude", "claude_desktop_config.json")
      );
    });

    it("should resolve standard path on Windows (win32) using APPDATA", () => {
      const resolved = getClaudeDesktopConfigPath("win32", {
        APPDATA: "C:\\Users\\testuser\\AppData\\Roaming",
      });
      expect(resolved).toBe(
        path.join("C:\\Users\\testuser\\AppData\\Roaming", "Claude", "claude_desktop_config.json")
      );
    });

    it("should resolve standard path on Windows (win32) fallback using USERPROFILE", () => {
      const resolved = getClaudeDesktopConfigPath("win32", {
        USERPROFILE: "C:\\Users\\testuser",
      });
      expect(resolved).toBe(
        path.join("C:\\Users\\testuser", "AppData", "Roaming", "Claude", "claude_desktop_config.json")
      );
    });

    it("should resolve standard path on Linux using XDG_CONFIG_HOME", () => {
      const resolved = getClaudeDesktopConfigPath("linux", {
        XDG_CONFIG_HOME: "/home/testuser/.custom-config",
      });
      expect(resolved).toBe(
        path.join("/home/testuser/.custom-config", "Claude", "claude_desktop_config.json")
      );
    });

    it("should resolve standard path on Linux fallback using HOME", () => {
      const resolved = getClaudeDesktopConfigPath("linux", {
        HOME: "/home/testuser",
      });
      expect(resolved).toBe(
        path.join("/home/testuser", ".config", "Claude", "claude_desktop_config.json")
      );
    });
  });

  describe("Configuration Creation & Non-Destructive Merge", () => {
    it("should create directory and claude_desktop_config.json when missing", () => {
      const targetConfigPath = path.join(tempDir, "Claude", "claude_desktop_config.json");
      const result = configureClaudeDesktop({ configPath: targetConfigPath });

      expect(result.ok).toBe(true);
      expect(result.created).toBe(true);
      expect(result.merged).toBe(false);
      expect(fs.existsSync(targetConfigPath)).toBe(true);

      const written = JSON.parse(fs.readFileSync(targetConfigPath, "utf-8"));
      expect(written.mcpServers).toBeDefined();
      expect(written.mcpServers.agentrail).toEqual(DEFAULT_AGENTRAIL_MCP_CONFIG);
    });

    it("should non-destructively merge agentrail into existing config without overwriting other servers", () => {
      const targetConfigPath = path.join(tempDir, "claude_desktop_config.json");
      const initialConfig = {
        theme: "dark",
        mcpServers: {
          filesystem: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
          },
          sqlite: {
            command: "uvx",
            args: ["mcp-server-sqlite", "--db-path", "test.db"],
          },
        },
      };

      fs.writeFileSync(targetConfigPath, JSON.stringify(initialConfig, null, 2), "utf-8");

      const result = configureClaudeDesktop({ configPath: targetConfigPath });

      expect(result.ok).toBe(true);
      expect(result.created).toBe(false);
      expect(result.merged).toBe(true);
      expect(result.existingServers).toContain("filesystem");
      expect(result.existingServers).toContain("sqlite");

      const updated = JSON.parse(fs.readFileSync(targetConfigPath, "utf-8"));
      // Other settings preserved
      expect(updated.theme).toBe("dark");
      // Other servers intact
      expect(updated.mcpServers.filesystem).toEqual(initialConfig.mcpServers.filesystem);
      expect(updated.mcpServers.sqlite).toEqual(initialConfig.mcpServers.sqlite);
      // AgentRail registered
      expect(updated.mcpServers.agentrail).toEqual(DEFAULT_AGENTRAIL_MCP_CONFIG);
    });

    it("should support custom server configurations and args", () => {
      const targetConfigPath = path.join(tempDir, "claude_desktop_config.json");
      const customConfig = {
        command: "node",
        args: ["/opt/agentrail/dist/index.js"],
        env: { STELLAR_NETWORK: "testnet" },
      };

      const result = configureClaudeDesktop({
        configPath: targetConfigPath,
        serverName: "agentrail-testnet",
        serverConfig: customConfig,
      });

      expect(result.ok).toBe(true);
      const updated = JSON.parse(fs.readFileSync(targetConfigPath, "utf-8"));
      expect(updated.mcpServers["agentrail-testnet"]).toEqual(customConfig);
    });

    it("should respect dryRun mode without modifying disk", () => {
      const targetConfigPath = path.join(tempDir, "non_existent", "claude_desktop_config.json");
      const result = configureClaudeDesktop({
        configPath: targetConfigPath,
        dryRun: true,
      });

      expect(result.ok).toBe(true);
      expect(result.config.mcpServers?.agentrail).toEqual(DEFAULT_AGENTRAIL_MCP_CONFIG);
      expect(fs.existsSync(targetConfigPath)).toBe(false);
    });

    it("should prevent corruption and create backup if existing file contains invalid JSON", () => {
      const targetConfigPath = path.join(tempDir, "claude_desktop_config.json");
      fs.writeFileSync(targetConfigPath, "{ corrupt json ... invalid syntax", "utf-8");

      expect(() => {
        configureClaudeDesktop({ configPath: targetConfigPath });
      }).toThrow(/Invalid JSON syntax in Claude Desktop config/);

      // Verify backup exists
      const files = fs.readdirSync(tempDir);
      const backupFile = files.find((f) => f.includes("corrupt"));
      expect(backupFile).toBeDefined();
    });

    it("should support CLI execution runner", () => {
      const result = runMcpConfigureClaude(["--dry-run"]);
      expect(result.ok).toBe(true);
      expect(result.serverName).toBe("agentrail");
    });
  });
});

