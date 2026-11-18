# STAYLink MBSP — Autonomous coding agent activation checklist

Status: **NOT ACTIVE**. GitHub Actions quality checks and the issue readiness gate are not a coding agent.

## Prerequisites (repository administrator)
1. Select an AI coding provider/runner that supports GitHub issue-to-draft-PR tasks. Confirm the provider, model usage limits, and billing.
2. Connect the provider through GitHub's supported installation/authorization flow. Grant the minimum necessary repository permissions; never use a personal access token in issue text.
3. Configure a task-specific branch policy: new branches from `staylink-mbsp-phase1`, draft PRs targeting that same branch, mandatory human review and CI checks. No automatic merges.
4. Configure spending limits, timeout, concurrency (one task at a time initially), and an emergency disable switch.
5. Enforce `AGENTS.md` and validate the selected task via `STAYLink agent task readiness` before running an agent.
6. Never provide production Cloudflare credentials, MBSPPay credentials, real applicant documents, or production database access to the agent.
7. Perform a supervised dry run on a low-risk documentation/test issue. Verify the draft PR, change scope, CI, cost and audit trail before allowing unattended execution.
8. Enable recurring or event-driven task execution only after a successful supervised dry run. Keep high-risk issues manual.

## Acceptance test for autonomous operation
- A low-risk task is created using the STAYLink task issue template.
- Readiness gate passes; incomplete or high-risk tasks fail closed.
- The agent starts without a new ChatGPT message and creates its own task branch.
- The agent produces a **draft PR** against `staylink-mbsp-phase1`, includes test evidence, and stops.
- The agent does not merge, deploy, change production resources, or access private applicant information.
- A human can disable the agent and revoke its credentials.

## Important GitHub Actions detail
The `workflow_dispatch` readiness workflow is on `staylink-mbsp-phase1`; GitHub may require workflow files to exist on the repository default branch before the UI/API can dispatch them. Do **not** merge development code into `main` just to enable the workflow. Instead, propose a small dedicated default-branch workflow PR for approval, if needed.

## Current implementation boundary
The task template and readiness workflow are implemented. The external AI runner, provider credentials, automatic task trigger and issue-to-draft-PR execution are **not** configured. This document does not activate them.
