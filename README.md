# Signaliz

**The GTM data and Ops layer for AI-native teams.**

Signaliz gives AI agents and GTM teams one place to find verified emails, verify deliverability, discover companies and people, detect company signals, run custom AI prompts, generate leads, build approval-gated campaigns, orchestrate Ops Routines, resolve approvals, execute connected-app actions, manage ICPs and campaign books, enforce budgets and blocklists, and store durable campaign memory.

Paid plans include API/MCP reads, companies, people, standard enrichment, and Ops workflows. Fresh enrichment credits are used only when Signaliz creates, verifies, or fetches new premium data.

---

## What You Can Build

- Find verified work emails for known contacts.
- Verify deliverability for one email or thousands of emails.
- Discover buying signals such as hiring, funding, product launches, partnerships, leadership changes, expansion, acquisitions, awards, regulatory events, and earnings.
- Find B2B professionals, target accounts, local businesses, or outreach-ready leads.
- Run custom AI prompts across records with structured output fields.
- Upload lists and run governed Signaliz systems against them.
- Scope campaign briefs into ICP, copy, provider, approval, and dry-run build plans.
- Build campaigns behind explicit spend and delivery approval gates.
- Create autonomous Ops Routines that work on a GTM goal over time.
- Chain routines, stream results, emit events, and resolve approvals.
- Connect apps, discover available actions, and execute app actions through Signaliz.
- Import Instantly history, query private campaign memory, and recommend the next GTM experiment.
- Manage budgets, blocklists, ICPs, campaign books, and durable agent memory.

---

## Integration Surfaces

| Surface | When to use it | Install |
| --- | --- | --- |
| REST API | Direct HTTP from any language. | Base URL: `https://api.signaliz.com/functions/v1` |
| TypeScript SDK | Node.js and browser apps with typed helpers. | `npm install @signaliz/sdk` |
| MCP Server | Claude Code, Claude Desktop, Cursor, Windsurf, Cline, and MCP-aware agents. | `npx -y @signaliz/mcp-server` |
| CLI | Terminal-first Ops and automation. | `npm install -g @signaliz/cli` |

---

## MCP Quick Start

Create a Signaliz API key from **Settings > Developer > API Access**, then add Signaliz to Claude Code:

```bash
claude mcp add signaliz -e SIGNALIZ_API_KEY=sk_your_key -- npx -y @signaliz/mcp-server
```

For Claude Desktop, Cursor, Windsurf, Cline, or another stdio MCP client:

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

Optional environment override:

```bash
SIGNALIZ_API_URL=https://api.signaliz.com/functions/v1
```

Every MCP tool accepts `output_format` as `markdown` or `json`.

---

## Capability Index

### Email, Contact, and Company Enrichment

| Tool | What it does |
| --- | --- |
| `find_contacts_with_email` | Finds contacts at a company and returns verified work emails. |
| `find_emails_with_verification` | Finds and verifies one professional email address from a name, company domain, or LinkedIn URL. |
| `verify_email` | Verifies one email address for deliverability. |
| `enrich_company_signals` | Researches a company for structured signals and source-backed developments. |
| `company_intelligence` | Runs AI-powered company research from websites, domains, LinkedIn URLs, and extra URLs. |
| `execute_primitive` | Runs small synchronous jobs for email verification, email finding, signal enrichment, custom AI prompts, data cleaning, or HTTP requests. |
| `generic_http_request` | Executes one custom HTTP request with headers, auth, body templates, variables, timeout, and response extraction. |
| `custom_ai_prompt` | Runs a custom AI prompt over records with model selection, structured output, and optional Signaliz AI Search context. |

### Batch Jobs

| Tool | What it does |
| --- | --- |
| `find_and_verify_emails` | Finds and verifies emails for up to 5,000 contacts asynchronously. |
| `verify_emails` | Verifies up to 5,000 emails asynchronously. |
| `enrich_company_signals_batch` | Enriches signals for up to 5,000 companies asynchronously. |
| `batch_http_request` | Executes up to 5,000 HTTP requests asynchronously. |
| `check_job_status` | Polls async jobs, reports progress, and retrieves paginated results. |

### Lead and Account Discovery

| Tool | What it does |
| --- | --- |
| `generate_leads` | Finds B2B professionals with company data and verified emails for outreach-ready lead lists. |
| `generate_local_leads` | Finds local businesses and verified contact emails from local search. |
| `find_people_blitz` | Finds professional profiles without verified emails for research and list building. |
| `find_companies_blitz` | Finds company records for account discovery, market sizing, and TAM research. |

### Campaign Memory and Builder

| Tool | What it does |
| --- | --- |
| `ingest_instantly_history` | Imports historical Instantly campaigns, leads, replies, and outcomes into private campaign memory. |
| `query_campaign_memory` | Searches private workspace memory and the read-only CMM seed corpus for ICP, copy, provider, and outcome lessons. |
| `scope_campaign` | Turns a GTM campaign request into ICP, copy thesis, provider chain, approval policy, and dry-run build arguments. |
| `save_campaign_brief` | Persists a campaign brief or GTM experiment object into private workspace memory. |
| `build_campaign` | Launches an approval-gated campaign build; use dry runs first and require explicit spend confirmation for real work. |
| `get_campaign_build_status` | Polls campaign build progress across acquisition, signals, qualification, copy, and delivery phases. |
| `get_campaign_build_rows` | Retrieves campaign build rows for review, approval, or agent-side routing. |
| `approve_campaign_delivery` | Approves external delivery such as webhook posts or loading approved leads into Instantly. |
| `recommend_next_experiment` | Recommends the next private GTM experiment from campaign memory and outcomes. |

### Lists, Systems, and Pipeline Runs

| Tool | What it does |
| --- | --- |
| `list_capabilities` | Lists available Signaliz capabilities, schemas, categories, and billing notes. |
| `upload_data` | Uploads inline records, public CSV URLs, Google Sheets URLs, or Google Drive share URLs as workspace lists. |
| `list_systems` | Lists saved Signaliz automation systems in the workspace. |
| `get_system` | Gets a saved system's phases, required inputs, and configuration. |
| `create_system` | Creates a saved automation system from a plain-English description. |
| `run_system` | Runs a saved system using inline data, a saved list, the latest workspace list, or prior run data. |
| `get_run` | Gets one system run's status and results. |
| `list_runs` | Lists recent system runs with status, timing, and summaries. |

### Ops Routines as Agents

| Tool | What it does |
| --- | --- |
| `create_routine` | Creates a goal-driven Ops Routine with cadence, policy guardrails, wake events, and output sinks. |
| `list_routines` | Lists Ops Routines by status. |
| `get_routine` | Gets full routine details, policy, sinks, recent ticks, and outcomes. |
| `update_routine` | Updates routine name, goal, cadence, status, policy, sinks, or wake events. |
| `run_routine_now` | Triggers an Ops Routine immediately with an optional one-off instruction. |
| `delete_routine` | Soft-archives or permanently deletes a routine after confirmation. |
| `get_routine_ticks` | Lists historical routine ticks with status, record counts, credits, and errors. |
| `get_tick_items` | Fetches records produced by a specific tick. |
| `get_last_tick_items` | Fetches records from the latest successful tick. |
| `get_routine_results` | Agent-friendly helper that combines routine metadata with latest produced items. |
| `agent_workflow` | Creates, activates, triggers, optionally waits for, and optionally cleans up a one-shot Ops Routine. |
| `stream_routine_results` | Returns an SSE endpoint for real-time item events from a running routine tick. |
| `chain_routines` | Chains two routines so upstream output feeds downstream seed items. |
| `get_chain_status` | Shows chained routine execution status and per-stage item counts. |
| `emit_event` | Emits an event that can wake routines subscribed through `wake_on_events`. |

### Approvals, Apps, Books, and Workspace Controls

| Tool group | Tools |
| --- | --- |
| Approvals and feedback | `approvals_list`, `approvals_decide`, `set_item_feedback` |
| App connections and actions | `list_connections`, `list_available_connectors`, `list_connectors`, `connect_app`, `discover_actions`, `execute_connection_action`, `list_connection_audit_log` |
| GTM books and ICPs | `quickstart_gtm_book`, `list_books`, `book_roll_up`, `list_icps`, `get_icp`, `import_icps_from_octave` |
| Workspace controls | `budget_get_status`, `budget_set_limit`, `manage_blocklist`, `write_agent_memory`, `query_agent_memory`, `list_output_sinks` |

---

## Async Pattern

Large jobs are async so MCP clients and API callers do not time out:

1. Submit a batch tool request.
2. Receive a `job_id`.
3. Poll `check_job_status` until the job completes.
4. Read paginated results, or receive a webhook if you supplied callback fields.

---

## Pricing and Billing Model

Paid plans include API/MCP reads, companies, people, standard enrichment, and Ops workflows. Free is for exploration.

Fresh enrichment credits are used only when Signaliz creates, verifies, or fetches new premium data:

- Fresh verified email discovery
- Live email verification
- Fresh premium enrichment
- Signaliz-hosted AI

BYO OpenRouter routes model spend to your key and does not use Signaliz-hosted AI credits.

Fresh enrichment throughput:

| Plan | Fresh enrichments/min | Included monthly fresh enrichment credits |
| --- | ---: | ---: |
| Free | 5 | 500 starter credits |
| Builder | 15 | 25,000 |
| Team | 30 | 50,000 |
| Agency | 60 | 100,000 |

Ordinary API/MCP reads are not throttled by the fresh-enrichment limiter.

---

## Safety Model

Read-only enrichment and discovery tools do not mutate your external systems. Tools that upload data, create or run systems, connect apps, execute app actions, update blocklists, approve work, or delete routines can change Signaliz workspace resources or connected systems and should be used with your normal approval controls.

---

## Links

- Website: https://signaliz.com
- API docs: https://signaliz.com/api-docs
- OpenAPI spec: https://signaliz.com/openapi.json
- MCP docs: https://signaliz.com/mcp-docs
- NPM package: https://www.npmjs.com/package/@signaliz/mcp-server
- Hosted remote MCP endpoint: https://api.signaliz.com/functions/v1/signaliz-mcp
- Public MCP manifest: https://github.com/signaliz/signaliz-mcp

---

**Built in Phoenix, AZ by [Signaliz](https://signaliz.com).**
