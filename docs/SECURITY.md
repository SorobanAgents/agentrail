# AgentRail Security Policy & Invariant Verification

AgentRail enforces strict zero-trust security invariants across all Soroban contracts, TypeScript SDKs, and multi-agent settlement tools.

## 🛡️ Automated PR Security Audits via AgentSentinel

Every pull request and commit submitted to the `SorobanAgents/agentrail` repository is automatically audited by the [AgentSentinel AI Security Gate](https://github.com/marketplace/actions/agentsentinel-ai-security-gate).

### Invariant Checks Enforced:
1. **Destructive Shell Command Quarantine:** Prevents unconstrained bash/shell executions.
2. **Adversarial Prompt Injection Interception:** Protects system prompts from exfiltration probes.
3. **High-Entropy Secret Detection:** Blocks accidental commits of API keys, private keys, and PATs.
4. **Smart Contract Invariants:** Clamps infinite allowance drain risks and unbacked token mints.

---
*Maintained by the AgentRail Protocol Core Team.*
