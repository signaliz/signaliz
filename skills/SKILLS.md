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
  +-- Skill 00: Sourcing --------+
  |  Octave find_person/company  |
  |  Blitz API company search    |
  |  Blitz API employee finder   |
  |  Blitz API email enrichment  |
  |  -> Supabase (store leads)   |
  +------------------------------+
        |
  +-- Skill 01: Enrich & Verify -+
  |  Signaliz: signals, email    |
  |    find/verify               |
  |  Blitz API: email/company    |
  |    enrichment (backfill)     |
  |  Octave: deep company/person |
  |    intelligence              |
  |  -> Supabase (update leads)  |
  +------------------------------+
        |
  +-- Skill 03: Score & Rank ----+
  |  Signaliz: signal enrichment |
  |    + AI scoring              |
  |  Blitz API: company backfill |
  |  Octave: person qualification|
  |  -> Supabase (update scores) |
  +------------------------------+
        |
  +-- Skill 05: Personalize -----+
  |  Signaliz: signals for hooks |
  |  Octave: email generation    |
  |  Instantly: campaign create, |
  |    lead load, activate       |
  |  -> Supabase (track campaigns|
  +------------------------------+
        |
  +-- Skill 04: Hygiene ----------+
  |  Signaliz: verify, blocklist  |
  |  Instantly: sync clean leads  |
  |  -> Supabase (update status)  |
  +-------------------------------+
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
| **Octave** | Company/person find, enrich, qualify, email generation | Skills 00, 01, 02, 03, 05 | 100/query find, 1/sec enrich |
| **Instantly** | Campaign creation, lead loading, campaign activation, email verify | Skills 02, 04, 05 | 1,000 leads/bulk batch |
| **Blitz API** | Company search, employee finder, email/company enrichment | Skills 00, 01, 03 | 5 RPS, 5 concurrent |
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
| Blitz email enrichment | `Blitz API /v2/enrichment/email` | 1/call | 5 RPS | Sequential, 200ms gap |
| Blitz company enrichment | `Blitz API /v2/enrichment/company` | 1/call | 5 RPS | Sequential, 200ms gap |
| Octave find_person | `Octave find_person` | 100/query | 1/sec | Sequential with city/title fan-out |
| Octave enrichment | `Octave enrich_company` | 1/call | 1/sec | Sequential, cap at 50 |
| Octave email gen | `Octave generate_email` | 1/call | 1/sec | Sequential, cap at 200 |
| Instantly lead load | `Instantly add_leads_bulk` | 1,000/batch | 2s gap | 5 sequential batches |
| Instantly campaign | `Instantly create_campaign` | 1/call | — | 2-step process |
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
