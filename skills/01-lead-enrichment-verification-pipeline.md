# Skill 01: Lead Enrichment & Verification Pipeline

**Max Batch:** 5,000 leads
**MCP Tools:** Instantly (verify_email), Octave (enrich_company), Supabase

---

## Trigger

User asks to enrich/verify leads, or chains from Skill 00.

## Workflow

### 1. Load Leads from Supabase

```sql
SELECT * FROM {table}
WHERE email IS NULL OR email_verified = false
ORDER BY created_at DESC
LIMIT {batch_size}
```

### 2. Find Emails via Pattern Guessing + Instantly Verify

**Note:** Octave `enrich_person` returns intelligence reports but NOT email addresses. Use pattern guessing + Instantly verification instead.

```
APPROACH: For each lead with company_domain and NULL email:
PATTERNS (try in order):
  1. firstname@domain
  2. firstname.lastname@domain

TOOL: mcp__Instantly__verify_email (use all 3 instances in parallel)
CONFIG:
  email: "{pattern}"
  max_wait_seconds: 45
OUTPUT: verification_status (verified/invalid/pending), catch_all flag
RATE: 3 parallel verifications at once, ~2-10s each
```

- Only process leads that still have NULL email AND have a company_domain
- Try `firstname@domain` first — highest hit rate for small business owners
- If invalid, try `firstname.lastname@domain`
- Update Supabase with verified emails in batches of 10
- Expected hit rate: ~25-30% of leads with domains

### 3. Enrich Companies (top 50 unique domains)

```
TOOL: mcp__Octave__enrich_company
CONFIG:
  companyDomain: "{domain}"
OUTPUT: firmographics, funding, hiring signals, tech stack
RATE: 1 call/sec, cap 50 companies
```

### 4. Update Supabase

```sql
UPDATE {table} SET
  email = '{email}',
  email_verified = true,
  verification_status = 'verified',
  company_industry = '{industry}',
  enriched_at = now(),
  updated_at = now()
WHERE linkedin_profile = '{linkedin}'
```

Batch 100 updates per SQL statement.

### 5. Report

```
Enrichment Complete:
  Processed: {N}
  Emails found: {N} ({pct}%)
  Companies enriched: {N}
  Ready for Skill 03 (scoring) or Skill 05 (outreach)?
```

## Error Handling

| Error | Recovery |
|---|---|
| Instantly rate limit | Back off 2s, retry |
| Both patterns invalid | Flag as "no_email", skip |
| Verification pending (timeout) | Retry later or skip |
| Supabase update fails | Retry, reduce batch |
