# STAYLink MBSP — AI coding agent operating rules

This repository supports the STAYLink MBSP (Smart Temporary Accommodation Link) development portal.

## Allowed scope
- Work only on a new task branch based on `staylink-mbsp-phase1`.
- Make the smallest changes needed for the explicitly assigned GitHub issue or task.
- Run `npm ci`, `npm run db:generate`, `npm run typecheck`, `npx vitest run --exclude tests/api.test.ts`, `npm run lint`, and `npm run build` where available.
- Open a **draft pull request** against `staylink-mbsp-phase1` describing changed files, test results, risks, and any unverified assumptions.
- Do not claim tests passed unless they were executed and passed.

## Hard stops — human approval required
- Never merge to `main` or `staylink-mbsp-phase1` autonomously.
- Never deploy, publish, modify Cloudflare production resources, or touch the Cloudflare Worker `dashboard-bangunan-mbsp`.
- Never alter production data, payments, credentials, secrets, access controls, or database schema/migrations without explicit task-specific approval.
- Never weaken malware scanning, quarantine, file integrity validation, authentication, authorization, MFA, audit logging, or segregation of duties to make tests pass.
- Never upload applicant documents or personal information to third-party AI services.

## Product requirements
- Display name: **STAYLink MBSP**, not SIPINTAR or STAYLink PPTT.
- Tagline: **Digital Services, Practical Solutions**.
- Preserve the existing cinematic navy-and-gold portal, gold bed/roof STAYLink logo, and current functionality.
- Officer validation remains mandatory after AI pre-check.
- Accommodation details and decisions may vary by unit and floor; preserve parent-application consistency.
- Fees and MBSPPay integration must not be simulated as real transactions.

## Agent readiness
These rules are a policy, **not** an autonomous agent. Do not claim unattended coding is enabled until a runner, credentials, task intake, branch protection, draft-PR workflow, and end-to-end validation have been configured and verified.
