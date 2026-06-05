# Signaliz

**The GTM data, Campaign Builder, Ops, and agent execution layer for AI-native teams.**

Signaliz helps teams and agents discover companies and people, verify emails, enrich accounts, build approval-gated campaigns, run Ops workflows, connect customer-owned apps, and preserve GTM memory across every surface: API, MCP, CLI, SDK, and downloadable workflow skills.

This repository is the public GitHub hub for Signaliz. Start here when you need the latest package links, API entrypoints, capability map, skills, or related Signaliz repositories.

Last checked: June 5, 2026.

---

## Start Here

| Need | Best surface | Link or command |
| --- | --- | --- |
| Direct HTTP API calls | REST API | [API docs](https://signaliz.com/api-docs) |
| Current OpenAPI spec | REST API | [https://signaliz.com/openapi.json](https://signaliz.com/openapi.json) |
| Claude Code, Claude Desktop, Cursor, Windsurf, Cline, Codex, and MCP agents | MCP server | `npx -y @signaliz/mcp-server` |
| Terminal operations, health checks, Campaign Builder, and Ops debugging | CLI | `npm install -g @signaliz/cli` |
| TypeScript or JavaScript apps and agent runtimes | SDK | `npm install @signaliz/sdk` |
| Ready-to-run GTM workflows | Skills | [skills/SKILLS.md](./skills/SKILLS.md) |

## Current Packages

| Package | Latest npm version | NPM page | Primary use |
| --- | ---: | --- | --- |
| `@signaliz/mcp-server` | `2.0.11` | [npm](https://www.npmjs.com/package/@signaliz/mcp-server) | Local stdio MCP bridge that proxies to hosted Signaliz MCP. |
| `@signaliz/cli` | `1.0.17` | [npm](https://www.npmjs.com/package/@signaliz/cli) | Operator CLI for Campaign Builder, Ops, MCP setup, health, and debug workflows. |
| `@signaliz/sdk` | `1.0.17` | [npm](https://www.npmjs.com/package/@signaliz/sdk) | Typed JavaScript/TypeScript access to Campaign Builder, Ops, MCP, and enrichment methods. |

The hosted MCP endpoint currently reports `service: signaliz-mcp`, `version: 2.0.0`, and `status: ready`.

## Current API

| Surface | Endpoint |
| --- | --- |
| Public REST API server | `https://api.signaliz.com` |
| Public OpenAPI spec | `https://signaliz.com/openapi.json` |
| Hosted MCP endpoint | `https://api.signaliz.com/functions/v1/signaliz-mcp` |
| SDK/functions base | `https://api.signaliz.com/functions/v1` |
| OAuth token endpoint | `https://api.signaliz.com/token` |

The OpenAPI spec is `openapi: 3.1.0`, `info.version: 2.0.0`. It covers current public API routes including email verification, email finding, contact discovery, company signal enrichment, deep research, auth, and token flows.

## Quick Starts

### MCP

Create a Signaliz API key in **Settings > Developer > API Access**, then add Signaliz to Claude Code:

```bash
claude mcp add signaliz -e SIGNALIZ_API_KEY=sk_your_key -- npx -y @signaliz/mcp-server
```

For Claude Desktop, Cursor, Windsurf, Cline, Codex, or another stdio MCP client:

```json
{
  "mcpServers": {
    "signaliz": {
      "command": "npx",
      "args": ["-y", "@signaliz/mcp-server"],
      "env": {
        "SIGNALIZ_API_KEY": "sk_your_key"
      }
    }
  }
}
```

Optional base URL override:

```bash
SIGNALIZ_API_URL=https://api.signaliz.com/functions/v1
```

### CLI

```bash
npm install -g @signaliz/cli
signaliz auth login
signaliz start
signaliz tools
```

Campaign and Ops examples:

```bash
signaliz campaign build --prompt "VP Sales at B2B SaaS, 50-500 employees" --target-count 100 --dry-run
signaliz ops plan "Build 100 verified VP Sales leads at B2B SaaS companies"
signaliz ops doctor
```

### SDK

```bash
npm install @signaliz/sdk
```

```ts
import { Signaliz } from "@signaliz/sdk";

const signaliz = new Signaliz({ apiKey: process.env.SIGNALIZ_API_KEY });

const build = await signaliz.campaigns.build({
  name: "Q3 SaaS Outbound",
  prompt: "Series A-C SaaS companies in fintech hiring SDRs",
  targetCount: 100,
  confirmSpend: true,
  delivery: { destinationType: "csv" },
});

const final = await signaliz.campaigns.wait(build.campaignBuildId);
const rows = await signaliz.campaigns.rows(build.campaignBuildId, { limit: 100 });
```

## Core Solutions

| Solution | What it does | Main surfaces |
| --- | --- | --- |
| Campaign Builder | Turns a GTM brief into sourced, verified, reviewed campaign rows and artifacts behind spend and delivery gates. | UI, MCP, CLI, SDK, API |
| GTM Kernel and Brain | Maintains workspace campaign context, provider routes, memory, feedback, risk signals, and next-experiment recommendations. | MCP, CLI, SDK |
| Ops | Plans, executes, waits on, approves, and retrieves GTM work from prompt-first or recurring operations. | MCP, CLI, SDK |
| Enrichment and discovery | Finds companies, people, verified emails, company signals, local leads, and custom AI outputs. | API, MCP, CLI, SDK |
| Connected app actions | Uses customer-owned connections and Nango-managed routes to inspect, prepare, and execute destination actions. | MCP, CLI, SDK |
| Skills | Downloadable workflow instructions for enrichment, verification, scoring, campaign launch, hygiene, outreach, and research. | GitHub, MCP clients, Codex/Claude-style agents |

## Campaign Builder Capabilities

Signaliz Campaign Builder now supports:

- Plain-English campaign briefs with dry-run planning before spend.
- Strategy templates, campaign books, ICP context, and private campaign memory.
- Historical campaign learning, feedback pulls, Brain readiness, and next-experiment recommendations.
- B2B and local lead sourcing with company, title, seniority, industry, geography, and account-size targeting.
- Email finding, live verification, company signal enrichment, ICP qualification, copy planning, and delivery readiness.
- Provider routing through workspace connections and Nango-managed customer API destinations.
- Approval gates for spend, writes, sender use, delivery, and connected-app actions.
- Async campaign build status, reviewed rows, CSV/webhook artifacts, and delivery approval flows.

Canonical public tools include:

- `build_campaign`
- `get_campaign_build_status`
- `get_campaign_build_rows`
- `gtm_existing_campaign_audit`
- `gtm_campaign_execution_status`
- `gtm_campaign_learning_status`
- `generate_leads`
- `find_people_signaliz`
- `find_companies_signaliz`
- `find_and_verify_emails`
- `verify_emails`
- `enrich_company_signals`

## Ops Capabilities

Signaliz Ops turns goals into governed work that agents and operators can monitor:

- `ops_plan` - preview the safest execution plan.
- `ops_execute` - create or run an operation when confirmation is supplied.
- `ops_status`, `ops_wait`, and `ops_results` - monitor progress and retrieve outputs.
- `ops_approve` - resolve human-in-the-loop approvals.
- `ops_doctor`, queues, logs, and run-status helpers - debug delivery and execution state.
- Routines, ticks, wake events, output sinks, replay, and chained workflows.
- Nango route preparation, connector sessions, tool discovery, action calls, and audit results.

Use Ops when work should be repeatable, monitorable, approval-aware, or connected to downstream destinations.

## Downloadable Skills

Signaliz ships reusable skills that agents can download, adapt, and run with Signaliz MCP plus connected app MCPs.

| Skill | File | Use it for |
| --- | --- | --- |
| Lead Enrichment and Verification Pipeline | [skills/01-lead-enrichment-verification-pipeline.md](./skills/01-lead-enrichment-verification-pipeline.md) | Raw contacts to enriched, verified leads. |
| Campaign Launch Orchestrator | [skills/02-campaign-launch-orchestrator.md](./skills/02-campaign-launch-orchestrator.md) | Verified leads to governed Instantly campaign setup. |
| Signal-Based Lead Scoring | [skills/03-signal-based-lead-scoring.md](./skills/03-signal-based-lead-scoring.md) | Company and contact lists to prioritized outreach order. |
| List Hygiene and Dedup Sync | [skills/04-list-hygiene-dedup-sync.md](./skills/04-list-hygiene-dedup-sync.md) | Dirty or stale lists to clean, audited records. |
| Personalized Outreach Pipeline | [skills/05-personalized-outreach-pipeline.md](./skills/05-personalized-outreach-pipeline.md) | Verified leads to signal-based campaign copy and launch prep. |
| Swarm of Agents Research | [skills/swarm-of-agents-SKILL.md](./skills/swarm-of-agents-SKILL.md) | Multi-perspective research using Signaliz custom AI and web context. |

See [skills/SKILLS.md](./skills/SKILLS.md) for the full skills index, execution pattern, batching rules, prerequisites, and governance model. Also see the dedicated [signaliz-skills](https://github.com/signaliz/signaliz-skills) repository for packaged `.skill` files.

## GitHub Organization Map

| Repository | Purpose |
| --- | --- |
| [signaliz/signaliz](https://github.com/signaliz/signaliz) | Public GitHub hub for packages, API, solutions, and skills. |
| [signaliz/signaliz-mcp](https://github.com/signaliz/signaliz-mcp) | Public MCP registry metadata, schemas, hosted endpoint docs, and manifest files. |
| [signaliz/signaliz-skills](https://github.com/signaliz/signaliz-skills) | Packaged Signaliz skills for download and agent use. |
| [signaliz/claude-code-plugin](https://github.com/signaliz/claude-code-plugin) | Claude Code plugin resources. |
| [signaliz/advanced-signaliz-workflows](https://github.com/signaliz/advanced-signaliz-workflows) | Advanced Signaliz workflow examples. |

Admin handoff for org profile setup, repo metadata, and cross-repo PRs: [docs/org-admin-handoff.md](./docs/org-admin-handoff.md).

## Safety Model

Signaliz separates read-only planning from spendful or mutating work. Discovery, enrichment reads, dry-runs, tool discovery, status checks, and result reads are safe to run before approval. Spendful enrichment, campaign launch, external delivery, connected-app writes, blocklist updates, and destructive routine actions require explicit confirmation in the relevant surface.

## Keep This Hub Current

When updating the public GitHub hub:

1. Verify npm package versions with `npm view @signaliz/mcp-server version`, `npm view @signaliz/cli version`, and `npm view @signaliz/sdk version`.
2. Verify API docs with `curl -I https://signaliz.com/openapi.json`.
3. Verify hosted MCP readiness with `curl https://api.signaliz.com/functions/v1/signaliz-mcp`.
4. Keep package links, API URLs, Campaign Builder tools, Ops tools, and skills in this README aligned with the current public product surface.
5. Keep detailed implementation docs in their dedicated repos or package READMEs; keep this repo as the organized entrypoint.

---

Website: [signaliz.com](https://signaliz.com)

Built in Phoenix, AZ by [Signaliz](https://signaliz.com).
