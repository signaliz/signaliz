# Skill 00: Lead Sourcing & Prospecting

**Max Batch:** 5,000 leads
**MCP Tools:** Octave (find_person), Blitz API (employee_finder, find_work_email, company_search), Instantly (verify_email), Supabase

---

## Trigger

User asks to find/source/build a lead list (e.g., "find me 1,000 retail CEOs in the US").

## Workflow

### 1. Confirm & Create Table

- Confirm targeting criteria with user (titles, industry keywords, location, count)
- Create Supabase table if needed (schema below)

### 2. Source Leads via Octave find_person

Run broad searches — **do NOT split by city**. Use industry keywords + exactTitles for targeting.

```
TOOL: mcp__Octave__find_person
CONFIG:
  searchMode: "people"
  keywords: ["{industry keywords}"]  — e.g., ["retail store", "retail business"]
  exactTitles: ["{target titles}"]   — e.g., ["CEO", "Founder", "Owner", "President"]
  country: "{country}"               — e.g., "United States"
  limit: 100
  offset: 0, 100, 200, ...           — paginate until target count reached
```

**Key behaviors:**
- `keywords` + `exactTitles` are OR'd by Octave — expect mixed results
- Post-filter results: only keep records where job_title contains a target title
- Use both working Octave instances in parallel to double throughput
- Paginate aggressively: increment offset by 100 until target reached
- Each query returns ~100 results; after title filtering expect ~20-60 usable leads

### 3. Find & Verify Emails (inline, not separate)

**Priority 1: Blitz API Find Work Email (for leads WITH LinkedIn URLs)**

```
TOOL: Blitz API — POST /v2/enrichment/email
CONFIG:
  linkedin_url: "{linkedin_profile}"
OUTPUT: found (bool), email, first_name, last_name, company_linkedin_url
RATE: 5 RPS, 200ms gap between calls
```

- Process all leads that have a `linkedin_profile` URL first
- Blitz returns verified work emails directly — no pattern guessing needed
- Expected hit rate: ~60-70% of leads with LinkedIn URLs
- Update Supabase immediately with found emails

**Priority 2: Pattern Guessing + Instantly Verify (for leads WITHOUT LinkedIn URLs)**

For remaining leads with `company_domain` but no LinkedIn URL or Blitz miss:

```
APPROACH: Pattern guessing + verification
PATTERNS (try in order):
  1. firstname@domain          — most common for small business owners
  2. firstname.lastname@domain — common for larger companies

TOOL: mcp__Instantly__verify_email (use all 3 instances in parallel)
CONFIG:
  email: "{pattern}"
  max_wait_seconds: 45
OUTPUT: verification_status (verified/invalid/pending), catch_all flag
RATE: 3 parallel (one per Instantly instance), ~2-10s each
```

**Priority 3: Blitz API Email Validation (optional SMTP check)**

For emails found via pattern guessing, optionally validate deliverability:

```
TOOL: Blitz API — POST /v2/utilities/email/validate
CONFIG:
  email: "{verified_pattern_email}"
OUTPUT: valid (bool), deliverable, catch_all, disposable
RATE: 5 RPS
```

**Key behaviors:**
- Always try Blitz API Find Work Email first for leads with LinkedIn URLs
- Fall back to pattern guessing + Instantly verify for leads without LinkedIn
- Use all 3 Instantly instances in parallel to triple throughput
- `catch_all` domains always show "verified" — flag but still use
- Expected combined hit rate: ~40-50% of all leads
- **Note:** Octave `enrich_person` does NOT return email addresses — never use it for email finding

### 4. Store in Supabase

Batch insert enriched leads (100 rows per INSERT):

```sql
INSERT INTO {table} (first_name, last_name, full_name, email, job_title,
  company_name, company_domain, linkedin_profile, location, source, sourced_at)
VALUES (...)
ON CONFLICT (linkedin_profile) DO UPDATE SET
  email = COALESCE(EXCLUDED.email, {table}.email),
  updated_at = now()
```

Deduplicate on `linkedin_profile` (unique key).

### 5. Report & Handoff

```
Sourcing Complete:
  Total sourced: {N}
  With email: {N} ({pct}%)
  Stored in: {table_name}
  Ready for Skill 01 (deep enrichment) or Skill 03 (scoring)?
```

---

## Table Schema

```sql
CREATE TABLE IF NOT EXISTS {table} (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text, last_name text, full_name text,
  email text, job_title text,
  company_name text, company_domain text,
  linkedin_profile text UNIQUE,
  location text, source text DEFAULT 'octave',
  email_verified boolean DEFAULT false, verification_status text,
  lead_score integer, tier text, campaign_id text,
  sourced_at timestamptz DEFAULT now(), enriched_at timestamptz,
  verified_at timestamptz, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

## Constraints

- Octave find_person: 100 results/query, 1 call/sec
- Blitz API: 5 RPS, 5 concurrent — use 200ms gaps between calls
- Blitz API Find Work Email: requires `linkedin_profile` URL
- Instantly verify_email: 3 parallel (one per instance), 0.25 credits each
- Supabase: 100 rows per INSERT
- Max 5,000 leads per run
- **No city-by-city splitting** — use broad country-level searches with keywords
- **Emails found inline** — Blitz API first, then pattern guess + Instantly verify, don't defer to Skill 01
- **Octave enrich_person does NOT return emails** — never use it for email finding

## Error Handling

| Error | Recovery |
|---|---|
| Octave returns 0 | Adjust keywords, broaden search |
| Octave rate limit | Back off 2s, retry |
| Blitz API rate limit (429) | Wait 30s, retry |
| Blitz API Find Work Email returns found: false | Fall back to pattern guessing + Instantly |
| Blitz API connection error | Skip Blitz, use pattern guessing + Instantly for all |
| Supabase insert fails | Retry, reduce batch to 50 |
| Under target | Paginate more, vary keywords |
