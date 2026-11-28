import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Standard configuration shape for an MCP server in Claude Desktop.
 */
export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Partial structure of Claude Desktop configuration file (claude_desktop_config.json).
 */
export interface ClaudeDesktopConfig {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

/**
 * Default MCP server definition for AgentRail.
 */
export const DEFAULT_AGENTRAIL_MCP_CONFIG: McpServerConfig = {
  command: "npx",
  args: ["-y", "@sparkysolutions/agentrail"],
};

/**
 * Options for configuring Claude Desktop.
 */
export interface ConfigureClaudeOptions {
  /** Explicit override for the config file path (useful for testing or non-standard paths). */
  configPath?: string;
  /** Platform identifier override (e.g. 'darwin', 'win32', 'linux'). Defaults to process.platform. */
  platform?: NodeJS.Platform;
  /** Environment variables dictionary override. Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Custom home directory override for testing. Defaults to os.homedir(). */
  homeDir?: string;
  /** The server key identifier under mcpServers. Defaults to 'agentrail'. */
  serverName?: string;
  /** Custom MCP server config override. Defaults to DEFAULT_AGENTRAIL_MCP_CONFIG. */
  serverConfig?: McpServerConfig;
  /** If true, returns planned changes without writing to disk. */
  dryRun?: boolean;
}

/**
 * Result returned by configureClaudeDesktop.
 */
export interface ConfigureClaudeResult {
  ok: boolean;
  configPath: string;
  created: boolean;
  merged: boolean;
  serverName: string;
  serverConfig: McpServerConfig;
  existingServers: string[];
  config: ClaudeDesktopConfig;
  backupPath?: string;
  message: string;
}

/**
 * Resolves the platform-specific standard path to `claude_desktop_config.json`.
 *
 * Path mapping:
 * - macOS (`darwin`): `~/Library/Application Support/Claude/claude_desktop_config.json`
 * - Windows (`win32`): `%APPDATA%/Claude/claude_desktop_config.json`
 * - Linux / POSIX: `~/.config/Claude/claude_desktop_config.json` (or `$XDG_CONFIG_HOME/Claude/...`)
 *
 * @param platform Target OS platform (default: process.platform)
 * @param env Environment variables dictionary (default: process.env)
 * @param homeDir Custom home directory (default: os.homedir())
 */
export function getClaudeDesktopConfigPath(
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
  homeDir?: string
): string {
  const home = homeDir || (platform === "win32" ? env.USERPROFILE : env.HOME) || os.homedir();

  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }

  if (platform === "win32") {
    const appData = env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }

  // Linux and other Unix-like platforms
  const configHome = env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(configHome, "Claude", "claude_desktop_config.json");
}

/**
 * Safely parses and validates a JSON string.
 * Throws a descriptive error if parsing fails or result is not an object.
 */
export function validateAndParseConfigJson(content: string, filePath: string): ClaudeDesktopConfig {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err: any) {
    throw new Error(
      `Invalid JSON syntax in Claude Desktop config at '${filePath}': ${err.message}`
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Invalid Claude Desktop config at '${filePath}': Expected a JSON object at root, got ${Array.isArray(parsed) ? "array" : typeof parsed}.`
    );
  }

  return parsed as ClaudeDesktopConfig;
}

/**
 * Configures Anthropic Claude Desktop to register the AgentRail MCP server.
 *
 * Performs a non-destructive merge:
 * - Creates the parent folder and config file if absent.
 * - If present, validates JSON and preserves all existing user-configured MCP servers and options.
 * - Updates or adds the `agentrail` server entry cleanly.
 */
export function configureClaudeDesktop(options: ConfigureClaudeOptions = {}): ConfigureClaudeResult {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = options.homeDir;
  const serverName = options.serverName ?? "agentrail";
  const serverConfig = options.serverConfig ?? { ...DEFAULT_AGENTRAIL_MCP_CONFIG };
  const dryRun = options.dryRun ?? false;

  const targetPath = options.configPath ?? getClaudeDesktopConfigPath(platform, env, homeDir);
  const targetDir = path.dirname(targetPath);

  let existingConfig: ClaudeDesktopConfig = {};
  let created = false;
  let backupPath: string | undefined;

  if (fs.existsSync(targetPath)) {
    const rawContent = fs.readFileSync(targetPath, "utf-8");
    try {
      existingConfig = validateAndParseConfigJson(rawContent, targetPath);
    } catch (parseErr: any) {
      // Create backup of corrupt configuration before throwing or re-initializing
      const corruptBackup = `${targetPath}.corrupt.${Date.now()}`;
      try {
        fs.writeFileSync(corruptBackup, rawContent, "utf-8");
        backupPath = corruptBackup;
      } catch {
        // Ignore backup write failure
      }
      throw new Error(
        `Failed to parse existing Claude Desktop config: ${parseErr.message}${
          backupPath ? ` (Corrupt copy backed up to: ${backupPath})` : ""
        }`
      );
    }
  } else {
    created = true;
  }

  // Preserve existing servers and root fields
  const currentServers =
    existingConfig.mcpServers && typeof existingConfig.mcpServers === "object" && !Array.isArray(existingConfig.mcpServers)
      ? { ...existingConfig.mcpServers }
      : {};

  const existingServerNames = Object.keys(currentServers);
  const merged = !created && existingServerNames.length > 0;

  // Non-destructively set / update the target server
  currentServers[serverName] = serverConfig;

  const updatedConfig: ClaudeDesktopConfig = {
    ...existingConfig,
    mcpServers: currentServers,
  };

  if (!dryRun) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(targetPath, JSON.stringify(updatedConfig, null, 2) + "\n", "utf-8");
  }

  const message = created
    ? `Created Claude Desktop configuration and registered '${serverName}' MCP server at: ${targetPath}`
    : `Non-destructively merged '${serverName}' MCP server into existing configuration (${existingServerNames.length} server(s) preserved) at: ${targetPath}`;

  return {
    ok: true,
    configPath: targetPath,
    created,
    merged,
    serverName,
    serverConfig,
    existingServers: existingServerNames,
    config: updatedConfig,
    backupPath,
    message,
  };
}

/**
 * CLI runner for `agentrail mcp configure-claude` command.
 */
export function runMcpConfigureClaude(args: string[] = []): ConfigureClaudeResult {
  const isDryRun = args.includes("--dry-run");
  const result = configureClaudeDesktop({ dryRun: isDryRun });
  return result;
}
