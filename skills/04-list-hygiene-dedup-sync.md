# Skill: List Hygiene & Dedup Sync

**ID:** `signaliz-list-hygiene`
**Version:** 1.0.0
**Max Batch:** 5,000 leads
**MCP Dependencies:** Signaliz, Instantly (×3), Blitz API, Supabase

---

## Description

Cleans existing lead lists by deduplicating, verifying emails, checking against blocklists, normalizing data, and syncing clean results back to Instantly campaigns or lists. Handles stale lists, bounced domains, catch-all detection, and produces a full audit trail. Designed to run as maintenance on existing Instantly campaigns before activation or as periodic list hygiene.

---

## Trigger

User says any of:
- "Clean this list"
- "Verify my Instantly leads"
- "Deduplicate and clean my campaign"
- "Run list hygiene"
- "Remove bad emails from my campaign"
- "Audit this lead list"
- Provides a CSV with emails that need cleaning

---

## Input Sources

The skill accepts leads from **four entry points**:

1. **Supabase table** (preferred) — Pull leads from central lead table
2. **CSV/JSON upload** — User provides file directly
3. **Instantly campaign** — Pull leads from an existing campaign by ID
4. **Instantly lead list** — Pull leads from a saved list by ID

---

## Execution Steps

### Step 1: Ingest Leads

**From Supabase (preferred):**
```
ACTION: Pull leads from Supabase table
TOOL:   mcp__Supabase__execute_sql
CONFIG:
  SELECT * FROM {supabase_table}
  WHERE {filter_criteria}
  ORDER BY created_at DESC
  LIMIT 5000
OUTPUT: all_leads[]
```

**From CSV/JSON:**
```
ACTION: Upload to Signaliz for processing
TOOL:   mcp__Signaliz__ai_clean_upload_data
CONFIG:
  data: "{CSV or JSON content}"
  session_name: "List Hygiene — {timestamp}"
OUTPUT: session_id, row_count, column_profile
```

**From Instantly campaign:**
```
ACTION: Pull leads from campaign
TOOL:   mcp__Instantly__list_leads
CONFIG:
  params:
    campaign_id: "{campaign_id}"
    limit: 100  # paginate through all
LOOP: Paginate until all leads retrieved (use starting_after cursor)
OUTPUT: all_leads[] (up to 5,000)
```

**From Instantly list:**
```
ACTION: Pull leads from list
TOOL:   mcp__Instantly__list_leads
CONFIG:
  params:
    list_id: "{list_id}"
    limit: 100
LOOP: Paginate until all leads retrieved
OUTPUT: all_leads[]
```

### Step 2: Deduplication

```
LOGIC (in-memory):
  1. Normalize all emails to lowercase, trim whitespace
  2. Identify exact duplicates (same email)
  3. Identify near-duplicates:
     - Same name + same company but different email variants
     - firstname.lastname vs f.lastname vs firstname_lastname
  4. Keep the most complete record (most fields populated)
  5. Log all removed duplicates with reason

REPORT:
  - Original count: {N}
  - Unique emails: {M}
  - Duplicates removed: {N - M}
  - Near-duplicates flagged: {count}
```

### Step 3: Data Normalization (via Signaliz AI Clean)

```
ACTION: Match destination and configure cleaning
TOOL:   mcp__Signaliz__ai_clean_match_destination
CONFIG:
  session_id: {from step 1}
  destination: "instantly"  # or "hubspot", "salesforce", etc.

ACTION: Review field mapping
TOOL:   mcp__Signaliz__ai_clean_review_mapping
CONFIG:
  session_id: {from step 1}

ACTION: Suggest data contracts
TOOL:   mcp__Signaliz__ai_clean_suggest_contracts
CONFIG:
  session_id: {from step 1}

ACTION: Execute cleaning
TOOL:   mcp__Signaliz__ai_clean_execute_cleaning
CONFIG:
  session_id: {from step 1}
```

**Normalization rules applied:**
- Email: lowercase, trim, validate format (RFC 5322)
- Names: proper case, trim, remove special characters
- Domains: strip protocol (https://), strip www., lowercase
- Phone: standardize format if present
- Company name: trim, normalize common suffixes (Inc., LLC, Ltd.)

### Step 4: Blocklist & Suppression Check

```
ACTION: Check against workspace blocklist
TOOL:   mcp__Signaliz__manage_blocklist
CONFIG:
  action: "check"
  emails: [{all deduplicated emails}]
OUTPUT: blocked_emails[], clean_emails[]
```

### Step 4b: Campaign Performance Check (if cleaning an active campaign)

Before cleaning, check campaign health to inform decisions:

```
ACTION: Get campaign analytics
TOOL:   mcp__Instantly__get_campaign_analytics
CONFIG:
  params:
    campaign_id: "{campaign_id}"
OUTPUT: sent, opens, clicks, replies, bounces, unsubscribes

ACTION: Get verification stats for list
TOOL:   mcp__Instantly__get_verification_stats_for_lead_list
CONFIG:
  params:
    list_id: "{list_id}"
OUTPUT: valid, invalid, risky, unknown counts

ACTION: Check for replies via Instantly
TOOL:   mcp__Instantly__count_unread_emails
CONFIG:
  (no params)
OUTPUT: unread reply count

ACTION: Read reply threads if any
TOOL:   mcp__Instantly__list_emails
CONFIG:
  params:
    campaign_id: "{campaign_id}"
OUTPUT: email threads with reply content
```

**Decision matrix:**
- Bounce rate > 5% → remove bounced leads, check warmup health
- Reply rate > 2% → campaign healthy, focus on removing invalids
- Open rate < 10% → possible deliverability issue, check sender warmup

### Step 5: Email Verification (batch)

```
ACTION: Verify all remaining emails
TOOL:   mcp__Signaliz__verify_emails
CONFIG:
  emails: [{email: "..."}, ...] (up to 5,000 per call)
OUTPUT: job_id

POLL:
  TOOL: mcp__Signaliz__check_job_status
  CONFIG:
    job_id: {from above}
    page_size: 500
  LOOP: Every 15s until status = "completed"
  PAGINATE: Through all result pages
```

### Step 6: Classify Results

```
CLASSIFICATION:
  ✅ CLEAN:    verification_status = "verified" AND NOT blocklisted
  ⚠️ CATCH-ALL: verification_status = "catch_all" AND NOT blocklisted
  ❌ INVALID:  verification_status = "invalid"
  ❓ UNKNOWN:  verification_status = "unknown" (timeout/inconclusive)
  🚫 BLOCKED:  On blocklist/suppression list
  🔄 DUPLICATE: Removed in dedup step
```

### Step 7: Sync Back to Instantly

**Option A: Update existing campaign (remove bad leads)**
```
For each INVALID/BLOCKED lead:
  ACTION: Remove from campaign
  TOOL:   mcp__Instantly__delete_lead
  CONFIG:
    params:
      id: "{lead_id}"
  RATE: Max 5 deletes/second to avoid rate limits
```

**Option B: Move leads between campaigns/lists (preferred for large batches)**
```
ACTION: Move invalid leads to quarantine list
TOOL:   mcp__Instantly__move_leads_to_campaign_or_list
CONFIG:
  params:
    campaign: "{source_campaign_id}"
    filter: "bounced"
    to_list_id: "{quarantine_list_id}"

ACTION: Move clean leads to new campaign
TOOL:   mcp__Instantly__move_leads_to_campaign_or_list
CONFIG:
  params:
    campaign: "{source_campaign_id}"
    filter: "not_yet_contacted"
    to_campaign_id: "{clean_campaign_id}"
    check_duplicates: true
```

**Option C: Create clean list and bulk add**
```
ACTION: Create new clean list
TOOL:   mcp__Instantly__create_lead_list
CONFIG:
  params:
    name: "{original_name} — Cleaned {date}"

ACTION: Bulk add clean leads to new list
TOOL:   mcp__Instantly__add_leads_to_campaign_or_list_bulk
CONFIG: (batches of 1,000)
  params:
    list_id: "{new_list_id}"
    skip_if_in_list: true
    leads: [{clean leads}]
```

**Option C: Move clean leads to a campaign**
```
ACTION: Bulk add to target campaign
TOOL:   mcp__Instantly__add_leads_to_campaign_or_list_bulk
CONFIG: (batches of 1,000)
  params:
    campaign_id: "{target_campaign_id}"
    skip_if_in_campaign: true
    leads: [{clean leads}]
```

### Step 8: Output & Audit Trail

Generate three output files:

```
1. clean_leads.csv — All verified + clean leads (ready to use)
   Columns: email, first_name, last_name, company_name, verification_status, cleaned_at

2. removed_leads.csv — All removed leads with reason
   Columns: email, first_name, last_name, removal_reason, original_status

3. audit_log.csv — Full record of every action taken
   Columns: email, original_values, cleaned_values, dedup_action, blocklist_check,
            verification_result, final_disposition, sync_action
```

### Step 8b: Update Supabase

```
ACTION: Update lead statuses in Supabase
TOOL:   mcp__Supabase__execute_sql
CONFIG:
  -- Mark invalid leads
  UPDATE {supabase_table} SET
    verification_status = '{result}',
    email_verified = false,
    updated_at = now()
  WHERE email IN ({invalid_emails})

  -- Mark clean leads
  UPDATE {supabase_table} SET
    verification_status = 'verified',
    email_verified = true,
    verified_at = now(),
    updated_at = now()
  WHERE email IN ({clean_emails})

  -- Delete duplicates (keep most complete record)
  DELETE FROM {supabase_table}
  WHERE id IN ({duplicate_ids})
```

---

## Output

| Deliverable | Format | Description |
|---|---|---|
| `clean_leads.csv` | CSV | Verified leads ready for use |
| `removed_leads.csv` | CSV | Invalid/blocked leads with reasons |
| `audit_log.csv` | CSV | Full audit trail of all operations |
| **Inline summary** | Text | Hygiene report with stats |

**Summary template:**
```
List Hygiene Complete — {original_count} leads processed

Results:
  ✅ Clean (verified):  {count} ({pct}%)
  ⚠️ Catch-all:         {count} ({pct}%)
  ❌ Invalid:           {count} ({pct}%)
  ❓ Unknown:           {count} ({pct}%)
  🚫 Blocklisted:       {count} ({pct}%)
  🔄 Duplicates:        {count} ({pct}%)

Sync Status:
  {describe what was synced back to Instantly}

Data Quality Score: {clean_count / original_count × 100}%
```

---

## Error Handling

| Error | Recovery |
|---|---|
| Instantly pagination timeout | Retry with smaller page size (50) |
| Verify job stuck >5 min | Re-submit smaller batches (1,000 each) |
| Blocklist check fails | Skip blocklist check, warn user, proceed with verification only |
| Sync-back rate limited | Reduce to 2 operations/second, retry failed operations |
| >50% invalid rate | Warn user — list source may be compromised, recommend not sending |

---

## Safety Guards

1. **Never delete leads from Instantly without user confirmation**
2. **Always preserve original data** — output removed leads separately for review
3. **Default to creating new list** rather than modifying existing campaign in-place
4. **Warn if invalid rate >30%** — suggests list quality issues
5. **Full audit trail** — every action logged for compliance
