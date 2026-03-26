# Skill 01: Lead Enrichment & Verification Pipeline

**Max Batch:** 5,000 leads
**MCP Tools:** Blitz API (find_work_email, email_validate, company_enrichment, linkedin_to_domain, domain_to_linkedin), Instantly (verify_email), Octave (enrich_company), Supabase

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

### 2. Find Emails (multi-source waterfall)

**Note:** Octave `enrich_person` returns intelligence reports but NOT email addresses. Use Blitz API and Instantly verification instead.

**Step 2a: Blitz API Find Work Email (for leads WITH LinkedIn URLs)**

```
TOOL: Blitz API — POST /v2/enrichment/email
CONFIG:
  linkedin_url: "{linkedin_profile}"
OUTPUT: found (bool), email, first_name, last_name, company_linkedin_url
RATE: 5 RPS, 200ms gap between calls
```

- Process all leads with `linkedin_profile IS NOT NULL AND email IS NULL`
- Blitz returns verified work emails directly — highest hit rate (~60-70%)
- Update Supabase immediately with found emails
- Track `source = 'blitz'` for attribution

**Step 2b: Blitz API Domain Lookup (backfill missing domains)**

For leads with `linkedin_profile` but no `company_domain`:

```
TOOL: Blitz API — POST /v2/enrichment/linkedin-to-domain
CONFIG:
  company_linkedin_url: "{linkedin_company_url}"
OUTPUT: found (bool), email_domain
RATE: 5 RPS
```

For leads with `company_domain` but no `linkedin_company_url`:

```
TOOL: Blitz API — POST /v2/enrichment/domain-to-linkedin
CONFIG:
  domain: "{company_domain}"
OUTPUT: found (bool), company_linkedin_url
RATE: 5 RPS
```

**Step 2c: Pattern Guessing + Instantly Verify (for remaining leads)**

For leads still without email after Blitz:

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

**Step 2d: Blitz API Email Validation (optional SMTP check)**

For pattern-guessed emails that Instantly marked as verified, optionally double-check:

```
TOOL: Blitz API — POST /v2/utilities/email/validate
CONFIG:
  email: "{pattern_verified_email}"
OUTPUT: valid (bool), deliverable, catch_all, disposable
RATE: 5 RPS
```

**Key behaviors:**
- Always try Blitz API Find Work Email first (highest accuracy)
- Fall back to pattern guessing + Instantly for leads without LinkedIn URLs
- Update Supabase with verified emails in batches of 10
- Expected combined hit rate: ~40-50% of all leads

### 3. Enrich Companies (multi-source)

**Step 3a: Blitz API Company Enrichment (up to 200 companies, 5 RPS)**

```
TOOL: Blitz API — POST /v2/enrichment/company
CONFIG:
  company_linkedin_url: "{linkedin_company_url}"
OUTPUT: name, industry, employee_count, headquarters, website, description, linkedin_url
RATE: 5 RPS, 200ms gap
CAP: Up to 200 unique companies
```

- Use for all leads with `linkedin_company_url` — faster and higher volume than Octave
- Returns structured firmographics ideal for scoring

**Step 3b: Octave Company Enrichment (deep intelligence, top 50)**

```
TOOL: mcp__Octave__enrich_company
CONFIG:
  companyDomain: "{domain}"
OUTPUT: firmographics, funding, hiring signals, tech stack, deep intelligence
RATE: 1 call/sec, cap 50 companies
```

- Use for top 50 companies by lead count — provides deeper intel than Blitz
- Complements Blitz with funding, hiring signals, tech stack details

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
| Blitz API rate limit (429) | Wait 30s, retry |
| Blitz API Find Work Email returns found: false | Fall back to pattern guessing + Instantly |
| Blitz API connection error | Skip Blitz, use pattern guessing + Instantly for all |
| Instantly rate limit | Back off 2s, retry |
| Both patterns invalid | Flag as "no_email", skip |
| Verification pending (timeout) | Retry later or skip |
| Blitz company enrichment returns found: false | Fall back to Octave enrich_company |
| Supabase update fails | Retry, reduce batch |
