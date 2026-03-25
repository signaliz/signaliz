# Skill: Lead Sourcing & Prospecting

**ID:** `signaliz-lead-sourcing`
**Version:** 1.0.0
**Max Batch:** 5,000 leads
**MCP Dependencies:** Octave, Blitz API, Supabase

---

## Description

Sources leads at scale by combining Octave person/company search with Blitz API company search and employee finder. Handles the "go find me 5,000 SaaS founders" use case that no other skill covers. Deduplicates, stores results in Supabase as the central lead table, and outputs a sourced list ready for Skill 01 (Enrich & Verify).

---

## Trigger

User says any of:
- "Find me leads", "Source leads", "Build a lead list"
- "Find SaaS founders in the US"
- "Get me 500 CEOs at B2B companies"
- "Prospect companies in [industry]"
- References ICP targeting, lead sourcing, or list building

---

## Input Schema

The user provides **targeting criteria**, not lead data:

| Parameter | Required | Description |
|---|---|---|
| `target_titles` | Yes | Job titles to find (e.g., "CEO", "Founder", "VP Sales") |
| `target_industry` | Yes | Industry or keywords (e.g., "SaaS", "B2B software") |
| `target_locations` | No | Cities, states, or countries to target |
| `company_size` | No | Employee count range (e.g., 10–200) |
| `target_count` | No | Desired number of leads (default: 500, max: 5,000) |
| `supabase_table` | No | Table to write results to (default: `saas_founder_leads`) |

---

## Execution Steps

### Step 0: Confirm Targeting & Estimate

```
PRESENT TO USER:
  "Sourcing {target_count} leads matching:
   Titles: {target_titles}
   Industry: {target_industry}
   Locations: {target_locations}
   Company size: {company_size}

   This will use Octave + Blitz API in batched queries.
   Proceed?"
```

### Step 1: Company Discovery (Blitz API + Octave)

Source target companies from two channels in parallel:

**Channel A — Blitz API Company Search:**
```
ACTION: Search companies matching ICP
TOOL:   Blitz API — POST /v2/search/companies
CONFIG:
  keyword: "{target_industry keywords}" (e.g., "SaaS", "B2B software")
  employee_count_min: {min}
  employee_count_max: {max}
  country: "{country_code}"
  city: "{city}" (if provided)
  limit: 100 per page
PAGINATE: Loop through pages until enough companies collected
RATE: 5 RPS max, use sequential calls with 200ms gaps
TARGET: Collect 2× the number of companies needed (to account for employee finder yield)
```

**Channel B — Octave Company Search:**
```
ACTION: Search companies via Octave
TOOL:   mcp__Octave__find_company
CONFIG:
  keywords: ["{industry keywords}"]
  employeeCount: { min: {min}, max: {max} }
  country: "{country}"
  limit: 100
OUTPUT: company domains, names, firmographics
```

**Merge & Deduplicate Companies:**
```
LOGIC:
  1. Combine results from Channel A + Channel B
  2. Deduplicate by company_domain (normalize: lowercase, strip www.)
  3. Store unique companies in memory with source tag
  4. Report: "{N} unique companies found across {sources}"
```

### Step 2: Contact Discovery (Blitz API Employee Finder + Octave)

For each unique company, find matching contacts:

**Primary — Blitz API Employee Finder (higher volume):**
```
ACTION: Find employees at each company
TOOL:   Blitz API — POST /v2/search/employee-finder
CONFIG:
  domain: "{company_domain}"
  title: "{target_titles}" (OR'd)
  seniority: ["founder", "c_suite", "vp", "director"] (adjust per ICP)
  limit: 10 per company
RATE: 5 RPS — process 5 companies per second
BATCH: Process all companies sequentially, 200ms between calls
```

**Secondary — Octave Person Search (for gaps):**
```
ACTION: Find people via Octave for companies where Blitz returned 0
TOOL:   mcp__Octave__find_person
CONFIG:
  searchMode: "people"
  companyDomain: "{domain}"
  fuzzyTitles: ["{target_titles}"]
  limit: 10
RATE: 1 call/second, cap at 50 companies via Octave
```

**Merge & Deduplicate Contacts:**
```
LOGIC:
  1. Combine all contacts from both channels
  2. Deduplicate by:
     - Exact LinkedIn URL match
     - Exact email match (if already known)
     - Name + company_domain match (fuzzy)
  3. Keep most complete record
  4. Track: source (blitz/octave), company_domain, name, title, linkedin_url
```

### Step 3: Email Enrichment (Blitz API)

For contacts that don't have an email yet:

```
ACTION: Enrich emails via Blitz API
TOOL:   Blitz API — POST /v2/enrichment/email
CONFIG:
  linkedin_url: "{contact.linkedin_url}"
OUTPUT: verified email, all_emails[], verification_status
RATE: 5 RPS — batch through all contacts
```

**Fallback for contacts without LinkedIn URL:**
```
LOGIC:
  - Skip email enrichment for contacts without LinkedIn URL
  - Flag as "needs_linkedin" for later manual review
  - These will be caught by Skill 01's Signaliz email finding
```

### Step 4: Company Enrichment (Blitz API, top companies only)

Enrich unique companies for firmographic data:

```
ACTION: Enrich company profiles
TOOL:   Blitz API — POST /v2/enrichment/company
CONFIG:
  domain: "{company_domain}"
OUTPUT: company_name, industry, employee_count, location, description, linkedin_url
RATE: 5 RPS
CAP: Enrich up to 500 unique companies per run
```

### Step 5: Store in Supabase

Write all sourced leads to the central Supabase table:

```
ACTION: Upsert leads into Supabase
TOOL:   mcp__Supabase__execute_sql
CONFIG:
  INSERT INTO {supabase_table} (
    first_name, last_name, full_name, email, job_title,
    company_name, company_domain, linkedin_profile,
    linkedin_company_url, website, company_size,
    company_industry, company_location, company_description,
    location, source, sourced_at
  ) VALUES (...)
  ON CONFLICT (email) DO UPDATE SET
    updated_at = now(),
    source = EXCLUDED.source
BATCH: Insert in chunks of 100 rows per SQL statement
```

**Table schema (auto-create if needed):**
```sql
CREATE TABLE IF NOT EXISTS {supabase_table} (
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
  source text,
  email_verified boolean DEFAULT false,
  verification_status text,
  lead_score integer,
  tier text,
  campaign_id text,
  sourced_at timestamptz DEFAULT now(),
  enriched_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### Step 6: Report & Handoff

```
PRESENT TO USER:
  Lead Sourcing Complete

  Companies found: {unique_companies}
  Contacts sourced: {total_contacts}
  Emails found: {with_email} ({pct}%)
  Missing email: {no_email} ({pct}%)

  Stored in Supabase: {table_name} ({row_count} rows)

  Source Breakdown:
    Blitz API: {blitz_count}
    Octave:    {octave_count}

  Top 5 Leads:
    1. {name} — {title} @ {company} — {email}
    2. ...

  Ready to enrich & verify? (runs Skill 01)
```

---

## Scaling Strategy (hitting 5,000)

To source 5,000 leads reliably, the skill uses a **multi-query fan-out**:

| Strategy | Queries | Yield | Total |
|---|---|---|---|
| Split by city (10 cities × 100/query) | 10 | ~50 usable/query | ~500 |
| Split by title variant (5 titles × 10 cities) | 50 | ~30/query | ~1,500 |
| Blitz company search → employee finder | 500 companies × 5 contacts | ~3/company | ~1,500 |
| Octave backfill (gaps) | 100 queries | ~20/query | ~2,000 |
| **Total potential** | | | **~5,500** |

After dedup, expect **3,000–5,000 unique leads**.

**If under target after first pass:**
```
LOGIC:
  1. Expand location list (add more cities/states)
  2. Broaden title search (add adjacent titles)
  3. Relax company size filters
  4. Run additional Blitz company search pages
  5. Report gap and let user adjust criteria
```

---

## Output

| Deliverable | Format | Description |
|---|---|---|
| **Supabase table** | DB rows | All leads stored with source tracking |
| **Lead count** | Inline | Total sourced, by channel, with/without email |
| **Handoff prompt** | Inline | Ready to chain into Skill 01 |

---

## Error Handling

| Error | Recovery |
|---|---|
| Blitz API 429 rate limit | Back off 1s, reduce to 3 RPS, retry |
| Blitz API 500/502 | Retry up to 3× with exponential backoff (2s, 4s, 8s) |
| Octave find_person returns 0 | Skip company, try next — don't retry |
| Octave rate limit | Back off 2s, reduce to 1 call/2s |
| Supabase insert fails | Retry batch, if still failing reduce batch size to 50 |
| Under target count | Report actual count, offer to expand criteria |
| Duplicate email on insert | ON CONFLICT updates existing record (upsert) |

---

## Constraints

- **Blitz API:** 5 RPS, 5 concurrent requests
- **Octave find_person:** 100 results/query max, 1 call/sec recommended
- **Octave enrich:** 1 call/sec, cap at 50 companies
- **Supabase:** 100 rows per INSERT batch
- **Total cap:** 5,000 leads per skill run
- **Always deduplicate** before storing — email is the unique key
