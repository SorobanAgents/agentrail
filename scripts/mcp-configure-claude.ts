import { runMcpConfigureClaude } from "../src/cli/claude-config.js";

const args = process.argv.slice(2);
try {
  const result = runMcpConfigureClaude(args);
  console.log(`\x1b[32m✔ ${result.message}\x1b[0m`);
  if (args.includes("--dry-run")) {
    console.log("\n[Dry Run Planned Configuration]:");
    console.log(JSON.stringify(result.config, null, 2));
  }
} catch (error: any) {
  console.error(`\x1b[31m✖ Failed to configure Claude Desktop:\x1b[0m ${error.message}`);
  process.exit(1);
}
