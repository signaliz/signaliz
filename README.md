# Signaliz

**Your GTM Data Layer — Enriched, Verified, Intelligent.**

Signaliz is a B2B data quality and enrichment platform purpose-built for go-to-market teams. It verifies emails, finds professional contacts, and enriches companies with real-time business signals — delivered through MCP, direct API, file upload UI, and Claude Code.

Messy in, clean out. Every record passes through data contracts and governance enforcement before it touches your CRM, sequencer, or system of record.

---

## What Signaliz Does

**Three battle-tested capabilities:**

| Capability | What It Does | Input | Output |
|---|---|---|---|
| **Email Finding + Verification** | Find professional email addresses from name + company domain, verified on delivery | First name, last name, company domain | Verified email + deliverability status |
| **Email Verification** | Check deliverability of existing email addresses at scale | Email addresses (up to 5,000 per batch) | Status per email: valid, catch-all, invalid, unknown |
| **Company Signal Enrichment** | Discover hiring, funding, product launches, partnerships, leadership changes, and more | Company domain or name | Structured signal data with timestamps and sources |

**Data governance built in:** Every record flows through Signaliz's enforcement layer — data contracts validate schema and quality, a dead letter queue catches failures, and blocklists suppress restricted domains automatically.

---

## How to Use Signaliz

Signaliz is available through four integration paths:

### 1. MCP (Model Context Protocol)

Connect Signaliz to Claude.ai, Claude Code, or any MCP-compatible AI agent. This is the primary integration — Signaliz acts as the default data quality checkpoint in your agent workflows.

**Claude.ai MCP endpoint:**
```
https://api.signaliz.com/functions/v1/signaliz-mcp?api_key=YOUR_API_KEY
```

Once connected, Claude can call Signaliz tools like `find_emails_with_verification`, `verify_emails`, `enrich_company_signals`, and `execute_primitive` directly in conversation.

### 2. Claude Code Plugin

Install the Signaliz plugin for Claude Code to use all capabilities from your terminal:

```bash
claude plugin install signaliz@claude-plugin-directory
```

See the [claude-code-plugin](https://github.com/signaliz/claude-code-plugin) repo for setup, commands, and configuration.

### 3. Claude.ai Skills

Install pre-built workflow skills that teach Claude exactly how to run Signaliz operations — including CSV parsing, batch management, error handling, and output formatting.

See the [signaliz-skills](https://github.com/signaliz/signaliz-skills) repo for installable `.skill` files.

### 4. Direct API

Call Signaliz capabilities directly via REST API for production pipelines and custom integrations.

```bash
# Verify an email
curl -X POST https://api.signaliz.com/functions/v1/verify-email \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@acme.com"}'
```

---

## Repositories

| Repo | Description |
|---|---|
| **[signaliz/signaliz](https://github.com/signaliz/signaliz)** | Main repo — documentation, platform overview, and roadmap |
| **[signaliz/signaliz-skills](https://github.com/signaliz/signaliz-skills)** | Claude.ai skills for email finding, email verification, and company signal enrichment |
| **[signaliz/claude-code-plugin](https://github.com/signaliz/claude-code-plugin)** | Claude Code plugin — MCP config, slash commands, and skill definitions for terminal use |

---

## Skills

Signaliz ships three Claude.ai skills that encode proven GTM workflows. Each skill handles CSV uploads and inline/conversational input, manages batching and pagination automatically, and outputs clean files with summary stats.

### signaliz-find-verified-emails

Turn a list of contacts (name + company) into verified email addresses. Accepts CSV uploads or inline data, routes to the optimal tool based on batch size, handles field mapping and domain normalization.

```
"Find emails for the VP Sales at these 20 companies" → researches names, batches through Signaliz, outputs verified CSV
```

### signaliz-verify-emails

Verify deliverability of existing email addresses. Handles deduplication, normalization, async job polling, and outputs three files: clean (safe to send), removed (invalid), and full audit trail.

```
"Verify these 300 emails before I load them into Instantly" → batch verifies, classifies results, outputs sorted CSVs
```

### signaliz-company-signals

Enrich companies with structured business signals — hiring trends, funding activity, product launches, partnerships, leadership changes, and more. Supports signal type filtering and custom research prompts.

```
"What are these 50 companies up to? Focus on hiring and funding signals" → enriches all 50, outputs CSV with signal breakdown
```

**Install a skill:** Download the `.skill` file from [signaliz-skills](https://github.com/signaliz/signaliz-skills) and add it to your Claude.ai skills.

---

## Architecture

Signaliz is built on:

- **Supabase** — Database, auth, and edge functions
- **Trigger.dev** — Async job orchestration with concurrency management
- **Lovable** — Frontend UI
- **MCP Server** — Supabase edge function serving the Model Context Protocol

The platform is designed as an enforcement layer between AI agents and systems of record. Instead of building traditional OAuth push integrations, Signaliz sits at the MCP checkpoint — every agent workflow that touches contact data, email sends, or CRM writes passes through Signaliz's data contracts first.

```
AI Agent / Claude / Workflow
        ↓
   Signaliz MCP
        ↓
  ┌─────────────────────┐
  │  Data Contracts      │  ← Schema validation
  │  Blocklist Check     │  ← Suppression enforcement
  │  Dead Letter Queue   │  ← Failed record capture
  └─────────────────────┘
        ↓
  Enrichment / Verification
        ↓
  CRM · Sequencer · System of Record
```

---

## Quick Start

### 1. Get an API Key

Sign up at [signaliz.com](https://signaliz.com) and generate an API key from your workspace settings.

### 2. Connect to Claude.ai

Go to Claude.ai Settings → Connected Apps → Add MCP Server:

```
URL: https://api.signaliz.com/functions/v1/signaliz-mcp?api_key=YOUR_API_KEY
```

### 3. Try It

Ask Claude:

- *"Verify this email: jane@acme.com"*
- *"Find the email for Sarah Chen at Notion"*
- *"What signals do you see for stripe.com?"*

---

## Key Tools Reference

| Tool | Use For | Max Batch |
|---|---|---|
| `find_emails_with_verification` | Find one email at a time from name + domain | 1 |
| `execute_primitive` | Batch find emails, verify emails, or enrich signals | 25 |
| `verify_emails` | Batch verify existing emails (async) | 5,000 |
| `enrich_company_signals` | Batch company signal enrichment (async) | 5,000 |
| `check_job_status` | Poll async job results | — |
| `create_system` + `run_system` | Build and run multi-step pipelines | 50,000+ |

**Async jobs** (`verify_emails`, `enrich_company_signals`) return a `job_id` immediately. Poll with `check_job_status` until `status: completed`, then paginate results with `page_size: 500`.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| All tools fail at once | Disconnect and reconnect the MCP in Claude settings (Supabase edge function cold start) |
| `execute_primitive` timeout | Reduce batch size to 10-15 records |
| Job stuck at "queued" | Wait 30s and re-poll. If stuck >2min, resubmit |
| `check_job_status` shows max 5 results | Paginate with `page_size=5` through all pages |
| 502/503 errors | Wait 5s and retry — edge function cold start |

---

## License

See individual repository LICENSE files.

---

**Built in Phoenix, AZ by [Signaliz](https://signaliz.com)**
