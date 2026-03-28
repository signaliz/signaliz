# Signaliz Workflow Skills

6 advanced orchestration skills for the Signaliz + Octave + Instantly + Blitz API + Supabase MCP stack. Each skill handles up to **5,000 leads** with batched execution, error recovery, and governance enforcement.

---

## Skills Overview

| # | Skill | MCP Tools | Max Leads | Use Case |
|---|---|---|---|---|
| 00 | [Lead Sourcing & Prospecting](./00-lead-sourcing-prospecting.md) | Octave, Blitz API, Supabase | 5,000 | ICP criteria → sourced lead list in Supabase |
| 01 | [Lead Enrichment & Verification Pipeline](./01-lead-enrichment-verification-pipeline.md) | Signaliz, Octave, Blitz API, Supabase | 5,000 | Raw contacts → enriched, verified leads |
| 02 | [Campaign Launch Orchestrator](./02-campaign-launch-orchestrator.md) | Signaliz, Instantly, Octave, Supabase | 5,000 | Verified leads → live Instantly campaign |
| 03 | [Signal-Based Lead Scoring](./03-signal-based-lead-scoring.md) | Signaliz, Octave, Blitz API, Supabase | 5,000 | Leads → scored, ranked, prioritized |
| 04 | [List Hygiene & Dedup Sync](./04-list-hygiene-dedup-sync.md) | Signaliz, Instantly, Supabase | 5,000 | Dirty list → clean, synced, audit-trailed |
| 05 | [Personalized Outreach Pipeline](./05-personalized-outreach-pipeline.md) | Signaliz, Instantly, Octave, Blitz API, Supabase | 5,000 | Leads → segmented, personalized campaigns |

---

## Architecture

All skills follow the same orchestration pattern with **Supabase as the central lead table**:

```
User Input (ICP criteria / CSV / Instantly list / Supabase query)
        |
  +-- Skill 00: Sourcing -------------------+
  |  Octave: find_person, find_similar       |
  |  Blitz API: company search, employee     |
  |    finder, waterfall ICP, find_work_email|
  |  Instantly: verify_email (×3 parallel)   |
  |  -> Supabase (store leads)              |
  +------------------------------------------+
        |
  +-- Skill 01: Enrich & Verify ------------+
  |  Blitz API: find_work_email (primary),   |
  |    company enrichment, domain lookups    |
  |  Instantly: verify_email (pattern guess)  |
  |  Octave: enrich_company (deep intel)     |
  |  Signaliz: signals, AI scoring           |
  |  -> Supabase (update leads)             |
  +------------------------------------------+
        |
  +-- Skill 03: Score & Rank ---------------+
  |  Signaliz: signal enrichment + AI score  |
  |  Blitz API: company backfill, waterfall  |
  |  Octave: qualify_person/company,         |
  |    find_similar (lookalike expansion)     |
  |  -> Supabase (update scores)            |
  +------------------------------------------+
        |
  +-- Skill 05: Personalize + Launch -------+
  |  Signaliz: signals for hooks             |
  |  Octave: email agents, call prep         |
  |  Blitz API: employee finder, enrichment  |
  |  Instantly: campaign create/update,      |
  |    lead load, activate, analytics,       |
  |    reply management                      |
  |  -> Supabase (track campaigns)          |
  +------------------------------------------+
        |
  +-- Skill 02: Campaign Launch -------------+
  |  Instantly: warmup check, create, load,  |
  |    activate, analytics, reply management |
  |  Octave: email agents, call prep         |
  |  Signaliz: governance pre-flight         |
  |  -> Supabase (track campaigns)          |
  +------------------------------------------+
        |
  +-- Skill 04: Hygiene (periodic) ---------+
  |  Signaliz: verify, blocklist, governance |
  |  Instantly: analytics, move_leads, sync  |
  |  Blitz API: email validation (SMTP)      |
  |  -> Supabase (update status)            |
  +------------------------------------------+
```

---

## Supabase: Central Lead Table

All skills read from and write to a shared Supabase table. This replaces CSV handoffs and enables:
- **Skill chaining** — Skill 00 sources → Skill 01 enriches → Skill 03 scores → Skill 05 launches
- **State tracking** — Every lead has `email_verified`, `lead_score`, `tier`, `campaign_id`
- **Deduplication** — Email is the unique key across all operations
- **Audit trail** — `sourced_at`, `enriched_at`, `verified_at` timestamps

**Standard schema:**
```sql
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  full_name text,
  email text UNIQUE,
  job_title text,
  company_name text,
  company_domain text,
  linkedin_profile text,
  linkedin_company_url text,
  website text,
  company_size text,
  company_industry text,
  company_location text,
  company_description text,
  location text,
  source text,                    -- 'octave', 'blitz', 'csv', etc.
  email_verified boolean DEFAULT false,
  verification_status text,       -- 'verified', 'catch_all', 'invalid', 'unknown'
  lead_score integer,             -- 0-100 composite score
  tier text,                      -- 'HOT', 'WARM', 'MEDIUM', 'NURTURE', 'LOW'
  campaign_id text,               -- Instantly campaign ID once loaded
  sourced_at timestamptz DEFAULT now(),
  enriched_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

## MCP Stack

| MCP Server | Purpose | Required For | Rate Limits |
|---|---|---|---|
| **Signaliz** | Email verification, signal enrichment, AI scoring, governance, data cleaning | Skills 01, 02, 03, 04, 05 | 1,000 rows/wave, 500 parallel |
| **Octave** (×2) | Company/person find, enrich (no emails), qualify, lookalike lists, persistent agents (email/call prep/enrich/qualify), knowledge base, email generation | Skills 00, 01, 02, 03, 05 | 100/query find, 1/sec enrich |
| **Instantly** (×3) | Campaign CRUD, lead loading/moving, activation, email verification, analytics (campaign/daily/warmup), reply management, sender account management | All skills | 1,000 leads/bulk batch, 3× parallel verify |
| **Blitz API** | Find work emails (LinkedIn→email), company/people search, company enrichment, domain↔LinkedIn lookup, email validation (SMTP) | Skills 00, 01, 03, 05 | 5 RPS, 5 concurrent |
| **Supabase** | Central lead storage, state tracking, audit trail | All skills | 100 rows/INSERT batch |

---

## Batching Strategy (5,000 leads, zero errors)

All skills use consistent batching to prevent API errors:

| Operation | Tool | Batch Size | Rate Limit | Strategy |
|---|---|---|---|---|
| Email verification | `Signaliz verify_emails` | 5,000 (async) | — | Single call, poll job_id |
| Email finding | `Signaliz find_and_verify_emails` | 5,000 (async) | — | Single call, poll job_id |
| Signal enrichment | `Signaliz run_system` | 1,000/wave | 500 parallel | 5 sequential waves |
| AI scoring | `Signaliz run_system` | 1,000/wave | 500 parallel | 5 sequential waves |
| Blitz company search | `Blitz API /v2/search/companies` | 100/page | 5 RPS | Sequential pages, 200ms gap |
| Blitz employee finder | `Blitz API /v2/search/employee-finder` | 10/company | 5 RPS | Sequential, 200ms gap |
| Blitz waterfall ICP | `Blitz API /v2/search/waterfall-icp-keyword` | 1/call | 5 RPS | Sequential, 200ms gap |
| Blitz find work email | `Blitz API /v2/enrichment/email` | 1/call | 5 RPS | Sequential, 200ms gap — **primary email source** |
| Blitz reverse email | `Blitz API /v2/enrichment/email-to-person` | 1/call | 5 RPS | Sequential, 200ms gap |
| Blitz company enrichment | `Blitz API /v2/enrichment/company` | 1/call | 5 RPS | Sequential, 200ms gap |
| Blitz linkedin→domain | `Blitz API /v2/enrichment/linkedin-to-domain` | 1/call | 5 RPS | Sequential, 200ms gap |
| Blitz domain→linkedin | `Blitz API /v2/enrichment/domain-to-linkedin` | 1/call | 5 RPS | Sequential, 200ms gap |
| Blitz email validate | `Blitz API /v2/utilities/email/validate` | 1/call | 5 RPS | Sequential, 200ms gap |
| Octave find_person | `Octave find_person` | 100/query | 1/sec | Sequential with keyword fan-out, 2 instances parallel |
| Octave find_similar | `Octave find_similar_companies/people` | 25/call | 1/sec | Sequential, use as expansion after initial sourcing |
| Octave enrichment | `Octave enrich_company` | 1/call | 1/sec | Sequential, cap at 50 |
| Octave qualify | `Octave qualify_person/company` | 1/call | 1/sec | Sequential, cap at 50 |
| Octave email agent | `Octave run_email_agent` | 1/call | 1/sec | Sequential, cap at 200 — prefer over generate_email |
| Octave call prep | `Octave generate_call_prep` | 1/call | 1/sec | On-demand for HOT leads |
| Octave email gen | `Octave generate_email` | 1/call | 1/sec | Sequential, cap at 200 (fallback if no agent) |
| Instantly lead load | `Instantly add_leads_bulk` | 1,000/batch | 2s gap | 5 sequential batches |
| Instantly move leads | `Instantly move_leads_to_campaign_or_list` | bulk | — | Background job for large ops |
| Instantly campaign create | `Instantly create_campaign` | 1/call | — | 2-step process (create → assign senders) |
| Instantly campaign update | `Instantly update_campaign` | 1/call | — | Partial update (sequences, limits, tracking) |
| Instantly analytics | `Instantly get_campaign_analytics` | 1/call | — | Opens, clicks, replies, bounces |
| Instantly warmup | `Instantly get_warmup_analytics` | 1/call | — | Inbox placement, spam rate |
| Instantly verify stats | `Instantly get_verification_stats` | 1/call | — | List verification breakdown |
| Instantly reply | `Instantly reply_to_email` | 1/call | — | Sends real email — requires confirmation |
| Signaliz blocklist | `Signaliz manage_blocklist` | bulk | — | Check/add/remove blocklist entries |
| Signaliz governance | `Signaliz governance_preflight_check` | bulk | — | Pre-send validation (blocklist + domain suppression) |
| Signaliz AI clean | `Signaliz ai_clean_*` | bulk | — | 5-step pipeline: upload → match → review → contracts → execute |
| Supabase writes | `Supabase execute_sql` | 100 rows/INSERT | — | Sequential batches |

### Error Recovery Pattern

Every batch operation follows this recovery protocol:

```
FOR each batch:
  attempt = 0
  max_retries = 3
  backoff = [5s, 10s, 20s]

  WHILE attempt < max_retries:
    result = execute_batch(batch)
    IF success:
      log_success(batch_id, result)
      BREAK
    IF rate_limited (429):
      WAIT 30s
      attempt += 1
    IF server_error (500/502/503):
      WAIT backoff[attempt]
      attempt += 1
    IF partial_failure:
      collect_successes(result)
      failed_records = extract_failures(result)
      batch = failed_records  # retry only failed records
      attempt += 1

  IF attempt == max_retries:
    log_failure(batch_id, failed_records)
    add_to_retry_queue(failed_records)

AFTER all batches:
  IF retry_queue not empty:
    report_failures(retry_queue)
    offer_manual_retry()
```

---

## Composability

Skills are designed to chain together via Supabase:

```
Skill 00 (Source & Prospect)
    | writes to Supabase
    v
Skill 01 (Enrich + Verify)
    | updates Supabase
    v
Skill 03 (Score + Qualify)
    | updates Supabase
    v
Skill 05 (Personalize + Launch)
    | updates Supabase + creates Instantly campaigns
    v
Skill 04 (Hygiene)  <- run periodically on active campaigns
```

Example full pipeline:
```
"Find me 3,000 SaaS founders, enrich and verify them,
 score by ICP fit, then create personalized campaigns for the
 top 500 and launch in Instantly."

-> Skill 00 -> Skill 01 -> Skill 03 -> Skill 05 (auto-chained via Supabase)
```
