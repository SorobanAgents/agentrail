import fs from "node:fs";
import path from "node:path";

const FORBIDDEN_PATTERNS = [
  {
    rule: "NO_EVAL_OR_DYNAMIC_EXECUTION",
    severity: "CRITICAL",
    regex: /\b(eval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*["'`]|setInterval\s*\(\s*["'`])/,
    explanation: "Dynamic code evaluation can execute unverified arbitrary bytecode payloads."
  },
  {
    rule: "NO_CHILD_PROCESS_EXEC",
    severity: "CRITICAL",
    regex: /\b(child_process|execSync|spawnSync|execFile|spawn\s*\(|exec\s*\()/,
    explanation: "Executing shell commands or subprocesses is strictly prohibited inside SDK modules."
  },
  {
    rule: "NO_WEBHOOK_OR_C2_EXFILTRATION",
    severity: "CRITICAL",
    regex: /(discord\.com\/api\/webhooks|api\.telegram\.org|pastebin\.com|ngrok\.io|webhook\.site|pipedream\.net|requestbin)/i,
    explanation: "Hardcoded webhook or exfiltration endpoints indicate potential credential/key theft."
  },
  {
    rule: "NO_RAW_IP_ENDPOINT_CALLS",
    severity: "CRITICAL",
    regex: /https?:\/\/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
    explanation: "Direct IP network requests bypass domain reputation and indicate command-and-control communication."
  },
  {
    rule: "NO_OBFUSCATED_CHAR_CODE_CHAINS",
    severity: "HIGH",
    regex: /String\.fromCharCode\s*\((?:\s*\d+\s*,\s*){6,}/,
    explanation: "Obfuscated character code arrays are a common evasion technique for malicious payloads."
  },
  {
    rule: "NO_ENV_CREDENTIAL_SCRAPING",
    severity: "HIGH",
    regex: /process\.env\.(?:PRIVATE_KEY|SECRET_KEY|MNEMONIC|SEED|WALLET_KEY|STELLAR_SECRET)/i,
    explanation: "Accessing sensitive raw private key environment variables directly in library modules is restricted.",
    allowedFiles: /test/i
  },
  {
    rule: "NO_ARBITRARY_FETCH_IN_CORE",
    severity: "HIGH",
    regex: /\b(fetch|axios|http\.request|https\.request)\s*\(/,
    explanation: "Core cryptographic logic must not perform arbitrary external network requests. Network I/O must be isolated to designated RPC providers.",
    allowedFiles: /(rpc|provider|network|test)/i
  }
];

function scanDirectory(dir, baseDir, violations) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
        continue;
      }
      scanDirectory(fullPath, baseDir, violations);
    } else if (entry.isFile()) {
      if (relPath.endsWith("security-audit.test.ts") || relPath.endsWith("security-audit.mjs")) {
        continue;
      }
      if (/\.(ts|js|mjs|cjs)$/.test(entry.name)) {
        scanFile(fullPath, relPath, violations);
      }
    }
  }
}

function scanFile(filePath, relPath, violations) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.allowedFiles && pattern.allowedFiles.test(relPath)) {
        continue;
      }

      if (pattern.regex.test(line)) {
        if (/^\s*\/\//.test(line) && !line.includes("http")) {
          continue;
        }

        violations.push({
          file: relPath,
          line: lineNum,
          rule: pattern.rule,
          severity: pattern.severity,
          snippet: line.trim().slice(0, 120),
          explanation: pattern.explanation
        });
      }
    }
  }
}

export function runSecurityAudit(rootDir) {
  const violations = [];
  const srcDir = path.join(rootDir, "src");
  const testsDir = path.join(rootDir, "tests");

  if (fs.existsSync(srcDir)) {
    scanDirectory(srcDir, rootDir, violations);
  }
  if (fs.existsSync(testsDir)) {
    scanDirectory(testsDir, rootDir, violations);
  }

  const pkgPath = path.join(rootDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const scripts = pkg.scripts || {};
    const dangerousScripts = ["postinstall", "preinstall", "install"];

    for (const s of dangerousScripts) {
      if (scripts[s] && !scripts[s].includes("npm-run-all")) {
        violations.push({
          file: "package.json",
          line: 1,
          rule: "NO_DANGEROUS_LIFECYCLE_SCRIPTS",
          severity: "CRITICAL",
          snippet: `\"${s}\": \"${scripts[s]}\"`,
          explanation: `Automated lifecycle script '${s}' detected. Attackers use postinstall scripts to execute malware during npm install.`
        });
      }
    }
  }

  return violations;
}

// CLI Execution
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("security-audit.mjs")) {
  const root = process.cwd();
  console.log("🛡️ Running AgentRail Autonomous Anti-Drainer Security Audit...");
  const violations = runSecurityAudit(root);

  if (violations.length === 0) {
    console.log("✅ Zero security violations detected. Codebase is clean of drainer & exfiltration patterns.");
    process.exit(0);
  } else {
    console.error(`\n❌ [SECURITY REJECT] Detected ${violations.length} high-risk code pattern(s):\n`);
    for (const v of violations) {
      console.error(`  [${v.severity}] ${v.rule} at ${v.file}:${v.line}`);
      console.error(`    Explanation: ${v.explanation}`);
      console.error(`    Code Snippet: ${v.snippet}\n`);
    }
    console.error("🛑 Pull Request BLOCKED by CI Security Guard. Remove the prohibited code to proceed.");
    process.exit(1);
  }
}
