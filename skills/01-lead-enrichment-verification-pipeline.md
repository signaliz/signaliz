# Skill: Lead Enrichment & Verification Pipeline

**ID:** `signaliz-enrich-verify-pipeline`
**Version:** 1.0.0
**Max Batch:** 5,000 leads
**MCP Dependencies:** Signaliz, Octave

---

## Description

End-to-end pipeline that takes raw lead data (CSV, JSON, Google Sheet, or inline), enriches companies via Signaliz signals and Octave intelligence, finds and verifies email addresses through Signaliz, and outputs a clean, enriched lead list ready for campaign loading. Handles up to 5,000 leads with zero-error batching.

---

## Trigger

User says any of:
- "Enrich and verify these leads"
- "Find emails and enrich this list"
- "Run the enrichment pipeline"
- "Clean and enrich my leads"
- Uploads a CSV/Sheet with columns like `first_name`, `last_name`, `company`, `domain`

---

## Input Schema

The pipeline accepts leads with **any combination** of these fields:

| Field | Required | Description |
|---|---|---|
| `first_name` | Yes* | Contact first name |
| `last_name` | Yes* | Contact last name |
| `company_domain` | Yes** | Company website domain (e.g., acme.com) |
| `company_name` | No | Company name (fallback if no domain) |
| `email` | No | Existing email (skip finding, go straight to verify) |
| `linkedin_url` | No | LinkedIn profile URL (improves email finding accuracy) |
| `job_title` | No | Job title (passed to Octave for qualification) |

\* `full_name` accepted as alternative to `first_name` + `last_name`
\** `domain` or `website` accepted as aliases — auto-mapped via field_mappings

---

## Execution Steps

### Step 1: Ingest & Validate (all records)

```
ACTION: Upload data to Signaliz workspace list
TOOL:   mcp__Signaliz__upload_data
CONFIG:
  - list_name: "Enrich Pipeline — {timestamp}"
  - entity_type: "person"
  - Auto-detect format (CSV or JSON)
OUTPUT: list_id, row_count, column_names
```

**Validation rules:**
- Reject records missing both `company_domain` AND `company_name`
- Reject records missing both `full_name` AND (`first_name` + `last_name`)
- Log rejected records with reason — report count to user before proceeding

### Step 2: Create Enrichment System

```
ACTION: Build Signaliz automation pipeline
TOOL:   mcp__Signaliz__create_system
CONFIG:
  name: "Enrich + Verify Pipeline — {timestamp}"
  capabilities:
    - "mcp_input"
    - "enrich_company_signals"
    - "find_emails_with_verification"
    - "verify_emails"
    - "mcp_output"
  field_mappings:
    website: "company_domain"
    domain: "company_domain"
    companyName: "company_name"
    fullName: "full_name"
    firstName: "first_name"
    lastName: "last_name"
  contract:
    required_fields:
      - name: "email"
        type: "string"
      - name: "verification_status"
        type: "string"
      - name: "company_domain"
        type: "string"
OUTPUT: system_id
```

### Step 3: Execute Pipeline (batched for 5,000)

```
ACTION: Run the system against the uploaded list
TOOL:   mcp__Signaliz__run_system
CONFIG:
  system_id: {from step 2}
  list_id: {from step 1}
OUTPUT: run_id
```

**Batch handling for >1,000 records:**
- Signaliz `run_system` handles concurrency internally (500 parallel workers)
- For lists >1,000 rows, use `list_limit: 1000` and run in sequential waves:
  - Wave 1: rows 1–1,000
  - Wave 2: rows 1,001–2,000
  - Wave 3: rows 2,001–3,000
  - Wave 4: rows 3,001–4,000
  - Wave 5: rows 4,001–5,000
- Track each wave's `run_id` independently

### Step 4: Poll for Completion

```
ACTION: Monitor run progress
TOOL:   mcp__Signaliz__get_run (per wave run_id)
LOOP:   Poll every 15 seconds until status = "completed" or "failed"
TIMEOUT: 10 minutes per wave, then flag as stalled
```

### Step 5: Octave Deep Enrichment (top-tier leads only)

For leads where Signaliz returned a **verified** email AND a company domain, enrich the top companies through Octave for deeper intelligence:

```
ACTION: Enrich companies via Octave
TOOL:   mcp__Octave__enrich_company
BATCH:  Process up to 50 unique company domains
        (deduplicate — multiple contacts at same company = 1 enrichment call)
CONFIG:
  companyDomain: {each unique domain}
OUTPUT: Firmographics, funding, hiring signals, tech stack
```

**Rate limiting:** Octave enrichment is per-call. Process sequentially with 1-second gaps between calls to avoid rate limits. Cap at 50 companies per run.

### Step 6: Merge & Output

```
ACTION: Retrieve final results
TOOL:   mcp__Signaliz__get_run_results (per wave)
CONFIG: page_size: 500, paginate through all pages
```

**Merge logic:**
1. Join Signaliz verification results with Octave enrichment on `company_domain`
2. Classify each lead:
   - **Tier 1 — Ready:** verified email + company enriched
   - **Tier 2 — Usable:** verified email, no deep enrichment
   - **Tier 3 — Risky:** catch-all email
   - **Tier 4 — Dead:** invalid/unknown email
3. Output as structured CSV with columns:
   `first_name, last_name, email, verification_status, company_domain, company_name, job_title, tier, company_industry, company_size, funding_stage, hiring_signals`

---

## Output

| Deliverable | Format | Description |
|---|---|---|
| `enriched_leads_verified.csv` | CSV | Tier 1 + Tier 2 leads (safe to campaign) |
| `enriched_leads_catchall.csv` | CSV | Tier 3 leads (catch-all, use with caution) |
| `enriched_leads_removed.csv` | CSV | Tier 4 leads (invalid, do not send) |
| **Summary stats** | Inline | Total processed, verified %, catch-all %, invalid %, enrichment coverage |

---

## Error Handling

| Error | Recovery |
|---|---|
| Signaliz 502/503 | Wait 5s, retry up to 3 times |
| `run_system` timeout | Check `get_run` — if partial results, collect them and re-run remaining |
| Octave rate limit | Back off 10s, reduce concurrent calls |
| Upload fails | Validate data format, retry with explicit `format: "csv"` |
| Partial wave failure | Collect successful rows, isolate failed rows, retry failed subset |

---

## Cost Estimation

Before executing, estimate and confirm with user:
```
TOOL: mcp__Signaliz__estimate_system_cost
  system_id: {from step 2}
  record_count: {total leads}
```

Report: "This will process {N} leads. Estimated cost: {X} credits. Proceed?"
