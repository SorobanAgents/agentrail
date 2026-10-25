# Contributing to AgentRail

Welcome to **AgentRail** — the open-source Autonomous AI Agent Scoped-Allowance & Micro-Settlement Protocol on Stellar & Soroban.

## Coding Standards

- **TypeScript `strict` mode:** The entire codebase compiles with `strict: true`. No implicit any, unchecked index accesses, or unhandled nulls.
- **Pure & Mockable:** All Stellar Horizon and Soroban RPC interactions must reside in dedicated service boundaries and be fully mockable in tests without requiring live network access or funded testnet accounts.
- **Zod Schema Validation:** Every public parameter, payload, and configuration input must be validated via Zod schemas before processing.
- **Security-First Invariants:** Never accept raw private keys. Autonomous agent authorizations must be scoped via session keypairs, expiration epochs, and maximum spending limits.

## Drips Wave Contributors

This repository participates in the **Stellar Drips Wave Program**.

1. **Find an Issue:** Browse open issues tagged `drips-wave` and one of `complexity: trivial | medium | high`.
2. **Claim Publicly:** Comment on the issue requesting assignment before you start work so contributors do not duplicate effort.
3. **Single Issue PRs:** Every pull request must address a single issue and include `Closes #<issue-number>` in the description.
4. **Reward Allocation:** Points are awarded upon maintainer review and merge based on the issue complexity:
   - `complexity: trivial` — 100 Points
   - `complexity: medium` — 150 Points
   - `complexity: high` — 200 Points

## Development Setup

```bash
git clone https://github.com/SorobanAgents/agentrail.git
cd agentrail
npm install
npm test
npm run build
```

## Pull Request Checklist

- [ ] Linked to target issue (`Closes #NN`)
- [ ] `npm run lint` passes with zero TypeScript warnings or errors
- [ ] `npm test` passes with 100% test coverage for new functionality
- [ ] `npm run build` succeeds cleanly
- [ ] Documentation and comments preserved
