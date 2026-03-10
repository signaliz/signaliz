# Signaliz Workflow Skills

5 advanced orchestration skills for the Signaliz + Instantly + Octave MCP stack. Each skill handles up to **5,000 leads** with batched execution, error recovery, and governance enforcement.

---

## Skills Overview

| # | Skill | MCP Tools | Max Leads | Use Case |
|---|---|---|---|---|
| 01 | [Lead Enrichment & Verification Pipeline](./01-lead-enrichment-verification-pipeline.md) | Signaliz, Octave | 5,000 | Raw contacts → enriched, verified leads |
| 02 | [Campaign Launch Orchestrator](./02-campaign-launch-orchestrator.md) | Signaliz, Instantly, Octave | 5,000 | Verified leads → live Instantly campaign |
| 03 | [Signal-Based Lead Scoring](./03-signal-based-lead-scoring.md) | Signaliz, Octave | 5,000 | Leads → scored, ranked, prioritized |
| 04 | [List Hygiene & Dedup Sync](./04-list-hygiene-dedup-sync.md) | Signaliz, Instantly | 5,000 | Dirty list → clean, synced, audit-trailed |
| 05 | [Personalized Outreach Pipeline](./05-personalized-outreach-pipeline.md) | Signaliz, Instantly, Octave | 5,000 | Leads → segmented, personalized campaigns |

---

## Architecture

All skills follow the same orchestration pattern:

```
User Input (CSV / Instantly list / inline data)
        ↓
  ┌─ Signaliz Governance ─┐
  │  Blocklist check       │
  │  Data contract enforce │
  │  Deduplication         │
  └────────────────────────┘
        ↓
  ┌─ Enrichment Layer ─────┐
  │  Signaliz: signals,    │
  │    email find/verify   │
  │  Octave: company/person│
  │    intelligence        │
  └────────────────────────┘
        ↓
  ┌─ AI Processing ────────┐
  │  Scoring / Segmentation│
  │  Personalization       │
  │  Classification        │
  └────────────────────────┘
        ↓
  ┌─ Action Layer ─────────┐
  │  Instantly: campaign   │
  │    create, load, launch│
  │  CSV output            │
  │  Audit trail           │
  └────────────────────────┘
```

---

## Batching Strategy (5,000 leads, zero errors)

All skills use consistent batching to prevent API errors:

| Operation | Tool | Batch Size | Rate Limit | Strategy |
|---|---|---|---|---|
| Email verification | `Signaliz verify_emails` | 5,000 (async) | — | Single call, poll job_id |
| Email finding | `Signaliz find_and_verify_emails` | 5,000 (async) | — | Single call, poll job_id |
| Signal enrichment | `Signaliz run_system` | 1,000/wave | 500 parallel | 5 sequential waves |
| AI scoring | `Signaliz run_system` | 1,000/wave | 500 parallel | 5 sequential waves |
| Octave enrichment | `Octave enrich_company` | 1/call | 1/sec | Sequential, cap at 50 |
| Octave email gen | `Octave generate_email` | 1/call | 1/sec | Sequential, cap at 200 |
| Instantly lead load | `Instantly add_leads_bulk` | 1,000/batch | 2s gap | 5 sequential batches |
| Instantly campaign | `Instantly create_campaign` | 1/call | — | 2-step process |

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

Skills are designed to chain together:

```
Skill 01 (Enrich + Verify)
    ↓ verified leads
Skill 03 (Score + Qualify)
    ↓ scored, ranked leads
Skill 05 (Personalize + Launch)
    ↓ live campaign
Skill 04 (Hygiene)  ← run periodically on active campaigns
```

Example full pipeline:
```
"Take this CSV of 3,000 raw contacts, enrich and verify them,
 score by ICP fit, then create personalized campaigns for the
 top 500 and launch in Instantly."

→ Skill 01 → Skill 03 → Skill 05 (auto-chained)
```

---

## Required MCP Connections

| MCP Server | Purpose | Required For |
|---|---|---|
| **Signaliz** | Email verification, signal enrichment, AI scoring, governance, data cleaning | All skills |
| **Instantly** | Campaign creation, lead loading, campaign activation | Skills 02, 04, 05 |
| **Octave** | Company/person enrichment, email generation, ICP qualification, knowledge base | Skills 01, 02, 03, 05 |
