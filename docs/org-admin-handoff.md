# Signaliz GitHub Org Admin Handoff

This handoff captures the admin-only GitHub work needed to finish the Signaliz public organization cleanup.

Last checked: June 5, 2026.

## Current State

Completed:

- `signaliz/signaliz` is now the public resource hub for Signaliz API, MCP, CLI, SDK, Campaign Builder, Ops, and skills.
- `signaliz/signaliz` main has current package links, API links, solution map, Campaign Builder tools, Ops tools, skills, and repo navigation.

Open PRs waiting on org merge permission:

| Repository | PR | Purpose |
| --- | --- | --- |
| `signaliz/signaliz-mcp` | https://github.com/signaliz/signaliz-mcp/pull/4 | Refresh MCP docs, npm bridge version, public discovery names, Campaign Builder, Ops, and resource links. |
| `signaliz/signaliz-skills` | https://github.com/signaliz/signaliz-skills/pull/1 | Add a downloadable skills README/index with package, API, governance, and capability references. |
| `signaliz/claude-code-plugin` | https://github.com/signaliz/claude-code-plugin/pull/3 | Refresh Claude Code plugin links and positioning for Signaliz Campaign Builder, Ops, API, MCP, CLI, SDK, and skills. |
| `signaliz/advanced-signaliz-workflows` | https://github.com/signaliz/advanced-signaliz-workflows/pull/1 | Replace placeholder README with an advanced workflow catalog. |

Admin-only blockers:

- Create the org profile repository `signaliz/.github`.
- Add `.github/profile/README.md` content from the template below.
- Update public repo descriptions and homepages.
- Merge the four clean cross-repo PRs above.

## Create The Org Profile Repo

Create a public repository named:

```text
signaliz/.github
```

Inside that repo, create:

```text
profile/README.md
```

Use this content:

````md
# Signaliz

Signaliz is the GTM data, Campaign Builder, Ops, and agent execution layer for AI-native teams.

Use Signaliz to discover companies and people, verify emails, enrich accounts, build approval-gated campaigns, run governed Ops workflows, connect customer-owned apps, and preserve GTM memory across API, MCP, CLI, SDK, and downloadable skills.

## Start Here

| Need | Best resource |
| --- | --- |
| Main public hub | https://github.com/signaliz/signaliz |
| MCP registry and manifest | https://github.com/signaliz/signaliz-mcp |
| Downloadable skills | https://github.com/signaliz/signaliz-skills |
| Claude Code plugin | https://github.com/signaliz/claude-code-plugin |
| Advanced workflow catalog | https://github.com/signaliz/advanced-signaliz-workflows |
| API docs | https://signaliz.com/api-docs |
| OpenAPI spec | https://signaliz.com/openapi.json |

## Packages

| Package | Install |
| --- | --- |
| MCP server | `npx -y @signaliz/mcp-server` |
| CLI | `npm install -g @signaliz/cli` |
| SDK | `npm install @signaliz/sdk` |

## Core Capabilities

- Campaign Builder: approval-gated campaign builds, reviewed rows, CSV/webhook artifacts, and delivery readiness.
- Ops: plan, execute, wait, approve, and retrieve governed GTM work.
- Enrichment: find companies, find people, find verified emails, verify email deliverability, and enrich company signals.
- Connected apps: prepare and execute customer-owned API routes with approvals and audit traces.
- Skills: downloadable workflow instructions for research, lead generation, verification, CRM hygiene, and outbound operations.

## Connect Signaliz MCP

```bash
claude mcp add signaliz -e SIGNALIZ_API_KEY=sk_your_key -- npx -y @signaliz/mcp-server
```

Hosted MCP endpoint:

```text
https://api.signaliz.com/functions/v1/signaliz-mcp
```
````

## Recommended Repo Metadata

Run these from an account with admin rights on the `signaliz` org, or update them in GitHub repo settings.

```bash
gh repo edit signaliz/signaliz \
  --description "Signaliz API, MCP, CLI, SDK, Campaign Builder, Ops, and skills resource hub" \
  --homepage https://signaliz.com

gh repo edit signaliz/signaliz-mcp \
  --description "Signaliz MCP registry metadata, schemas, hosted endpoint docs, and npm bridge setup" \
  --homepage https://www.npmjs.com/package/@signaliz/mcp-server

gh repo edit signaliz/signaliz-skills \
  --description "Downloadable Signaliz skills for GTM research, enrichment, verification, Campaign Builder, and Ops" \
  --homepage https://github.com/signaliz/signaliz

gh repo edit signaliz/claude-code-plugin \
  --description "Claude Code plugin for Signaliz Campaign Builder, Ops, enrichment, outbound workflows, and connected GTM tools" \
  --homepage https://github.com/signaliz/signaliz

gh repo edit signaliz/advanced-signaliz-workflows \
  --description "Advanced Signaliz workflow catalog for Campaign Builder, Ops, connected apps, and GTM automation" \
  --homepage https://github.com/signaliz/signaliz
```

## Merge Order

Recommended merge order:

1. `signaliz/signaliz-mcp#4`
2. `signaliz/signaliz-skills#1`
3. `signaliz/claude-code-plugin#3`
4. `signaliz/advanced-signaliz-workflows#1`

After merging, verify:

```bash
gh pr view 4 --repo signaliz/signaliz-mcp --json state,mergedAt
gh pr view 1 --repo signaliz/signaliz-skills --json state,mergedAt
gh pr view 3 --repo signaliz/claude-code-plugin --json state,mergedAt
gh pr view 1 --repo signaliz/advanced-signaliz-workflows --json state,mergedAt
gh repo view signaliz/.github --json name,url
```

## Maintenance Checklist

When updating Signaliz GitHub:

1. Verify npm package versions with:

```bash
npm view @signaliz/mcp-server version
npm view @signaliz/cli version
npm view @signaliz/sdk version
```

2. Verify API and MCP health:

```bash
curl -I https://signaliz.com/openapi.json
curl https://api.signaliz.com/functions/v1/signaliz-mcp
```

3. Keep these surfaces aligned:

- `signaliz/signaliz` public hub
- `signaliz/.github` org profile
- `signaliz/signaliz-mcp` README and registry metadata
- `signaliz/signaliz-skills` skill index
- `signaliz/claude-code-plugin` README and plugin metadata
- `signaliz/advanced-signaliz-workflows` catalog

4. Keep public tool names current, especially:

- `build_campaign`
- `get_campaign_build_status`
- `get_campaign_build_rows`
- `generate_leads`
- `find_people_signaliz`
- `find_companies_signaliz`
- `ops_plan`
- `ops_execute`
- `ops_status`
- `ops_wait`
- `ops_results`
