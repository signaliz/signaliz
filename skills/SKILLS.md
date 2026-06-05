# Signaliz Workflow Skills

Reusable workflow skills for agents that run Signaliz MCP plus connected app MCPs such as Instantly, Octave, or customer-owned API routes. Use these when a GTM task should be repeatable, governed, batched, and auditable instead of handled as a one-off prompt.

Each workflow is designed for up to 5,000 leads unless the individual skill sets a smaller safe limit for a specific enrichment or personalization step.

---

## Skills Overview

| # | Skill | File | Primary surfaces | Use case |
| --- | --- | --- | --- | --- |
| 01 | Lead Enrichment and Verification Pipeline | [01-lead-enrichment-verification-pipeline.md](./01-lead-enrichment-verification-pipeline.md) | Signaliz, Octave | Raw contacts to enriched, verified leads. |
| 02 | Campaign Launch Orchestrator | [02-campaign-launch-orchestrator.md](./02-campaign-launch-orchestrator.md) | Signaliz, Instantly, Octave | Verified leads to governed campaign setup. |
| 03 | Signal-Based Lead Scoring | [03-signal-based-lead-scoring.md](./03-signal-based-lead-scoring.md) | Signaliz, Octave | Leads and accounts to scored, ranked priorities. |
| 04 | List Hygiene and Dedup Sync | [04-list-hygiene-dedup-sync.md](./04-list-hygiene-dedup-sync.md) | Signaliz, Instantly | Dirty or stale lists to clean, audited records. |
| 05 | Personalized Outreach Pipeline | [05-personalized-outreach-pipeline.md](./05-personalized-outreach-pipeline.md) | Signaliz, Instantly, Octave | Leads to signal-based copy and campaign launch prep. |
| 06 | Swarm of Agents Research | [swarm-of-agents-SKILL.md](./swarm-of-agents-SKILL.md) | Signaliz, OpenRouter | Multi-perspective research with Signaliz custom AI. |

For packaged `.skill` downloads, also see [signaliz/signaliz-skills](https://github.com/signaliz/signaliz-skills).

## How To Use A Skill

1. Connect Signaliz MCP.

```bash
claude mcp add signaliz -e SIGNALIZ_API_KEY=sk_your_key -- npx -y @signaliz/mcp-server
```

2. Connect any required downstream MCPs or app routes, such as Instantly, Octave, or a customer-owned API route through Signaliz/Nango.
3. Open the relevant skill file and follow its trigger, input schema, execution steps, and validation rules.
4. Keep planning and dry-runs read-only until the skill explicitly asks for spend, delivery, or connected-app write confirmation.

## Shared Execution Pattern

```text
User input
  -> governance preflight
  -> dedupe and data contract checks
  -> Signaliz enrichment, verification, discovery, or custom AI
  -> optional connected-app enrichment or action
  -> approval gate
  -> campaign, CSV, webhook, app action, or audit output
```

## Governance Rules

- Use dry-runs before spendful enrichment or delivery.
- Never load invalid, unknown, suppressed, or blocklisted leads into outbound destinations.
- Keep blocked or rejected records in an audit output instead of hiding them.
- Poll async jobs with `check_job_status` until completion before treating results as final.
- Confirm external writes before creating campaigns, loading leads, activating campaigns, updating app data, or deleting routines.

## Batching Strategy

| Operation | Preferred Signaliz surface | Batch size | Strategy |
| --- | --- | ---: | --- |
| Email verification | `verify_emails` | up to 5,000 | Submit once, poll `check_job_status`. |
| Email finding plus verification | `find_and_verify_emails` | up to 5,000 | Submit once, poll `check_job_status`. |
| Lead generation | `generate_leads` | request scoped | Dry-run or approval-gated launch, then status and rows. |
| Campaign build | `build_campaign` | request scoped | Dry-run first, launch with explicit spend confirmation, then read rows/artifacts. |
| Company signal enrichment | `enrich_company_signals` or pipeline tools | scoped by job | Deduplicate by company domain before enriching. |
| Instantly lead load | Instantly bulk lead tools | up to 1,000 per chunk | Load only verified, non-suppressed records. |

## Required Connections

| Connection | Purpose | Required for |
| --- | --- | --- |
| Signaliz MCP | API, Campaign Builder, Ops, enrichment, verification, governance, memory, and custom AI. | All skills |
| Instantly | Campaign creation, lead loading, hygiene, activation, and campaign feedback. | Skills 02, 04, 05 |
| Octave | Company/person enrichment, ICP qualification, and campaign copy context. | Skills 01, 02, 03, 05 |
| OpenRouter-enabled Signaliz AI | Multi-model custom AI and research workflows. | Skill 06 |

## Composable Workflows

Common chains:

```text
Skill 01 -> Skill 03 -> Skill 05
Raw contacts -> verified leads -> scored priorities -> personalized campaign prep
```

```text
Skill 04 -> Skill 02
Existing campaign/list -> cleaned records -> governed campaign launch
```

```text
Skill 06 -> Campaign Builder
Research brief -> ICP/copy thesis -> approval-gated campaign build
```

## Keep Skills Current

When updating skills:

1. Use current public tool names such as `find_people_signaliz`, `find_companies_signaliz`, `generate_leads`, `build_campaign`, `get_campaign_build_status`, `get_campaign_build_rows`, `ops_plan`, `ops_execute`, `ops_status`, and `ops_results`.
2. Keep old provider-specific or legacy names out of public-facing instructions unless they are required compatibility aliases.
3. Verify package references against [@signaliz/mcp-server](https://www.npmjs.com/package/@signaliz/mcp-server), [@signaliz/cli](https://www.npmjs.com/package/@signaliz/cli), and [@signaliz/sdk](https://www.npmjs.com/package/@signaliz/sdk).
4. Keep every skill explicit about read-only planning, spend confirmation, delivery confirmation, and audit outputs.
