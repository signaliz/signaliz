# Skill 00: Lead Sourcing & Prospecting

**Max Batch:** 5,000 leads
**MCP Tools:** Octave (find_person), Instantly (verify_email), Supabase

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

For leads with `company_domain`, generate email patterns and verify via Instantly:

```
APPROACH: Pattern guessing + verification
PATTERNS (try in order):
  1. firstname@domain          — most common for small business owners
  2. firstname.lastname@domain — common for larger companies
  3. first_initial+lastname@domain — fallback

TOOL: mcp__Instantly__verify_email (use all 3 instances in parallel)
CONFIG:
  email: "{pattern}"
  max_wait_seconds: 45
OUTPUT: verification_status (verified/invalid/pending), catch_all flag
RATE: 3 parallel (one per Instantly instance), ~2-10s each
```

**Key behaviors:**
- Use all 3 Instantly instances in parallel to triple throughput
- Try `firstname@domain` first — highest hit rate for retail owners
- Only try `firstname.lastname@domain` if first pattern fails
- `catch_all` domains always show "verified" — flag but still use
- Expected hit rate: ~25-30% of leads with domains
- **Note:** Octave `enrich_person` does NOT return email addresses — use Instantly verify only

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
- Instantly verify_email: 3 parallel (one per instance), 0.25 credits each
- Supabase: 100 rows per INSERT
- Max 5,000 leads per run
- **No city-by-city splitting** — use broad country-level searches with keywords
- **Emails found inline** — pattern guess + Instantly verify, don't defer to Skill 01

## Error Handling

| Error | Recovery |
|---|---|
| Octave returns 0 | Adjust keywords, broaden search |
| Octave rate limit | Back off 2s, retry |
| Supabase insert fails | Retry, reduce batch to 50 |
| Under target | Paginate more, vary keywords |
