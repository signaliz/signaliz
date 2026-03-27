# Skill: Signal-Based Lead Scoring & Qualification

**ID:** `signaliz-lead-scoring`
**Version:** 1.0.0
**Max Batch:** 5,000 leads
**MCP Dependencies:** Signaliz, Octave, Blitz API, Supabase

---

## Description

Scores and ranks leads using a multi-layer approach: Signaliz company signal enrichment (hiring, funding, product launches, partnerships), Octave ICP qualification, and AI-powered scoring via Signaliz custom_ai_prompt. Produces a prioritized lead list with composite scores, signal breakdowns, and recommended outreach timing. Designed for ABM and signal-based selling motions at scale.

---

## Trigger

User says any of:
- "Score these leads"
- "Prioritize this list by fit"
- "Which of these leads should I reach out to first?"
- "Run lead scoring on this list"
- "Qualify these companies"
- References ICP, lead scoring, or prioritization

---

## Input Schema

### Source: Supabase Table (preferred — chained from Skill 01)
```
ACTION: Read enriched leads from Supabase
TOOL:   mcp__Supabase__execute_sql
CONFIG:
  SELECT * FROM {supabase_table}
  WHERE email_verified = true
  AND lead_score IS NULL
  ORDER BY enriched_at DESC
  LIMIT {batch_size}
```

### Source: Direct Input

| Field | Required | Description |
|---|---|---|
| `company_domain` | Yes* | Company domain (primary identifier) |
| `company_name` | No | Company name (fallback) |
| `first_name` | No | Contact first name |
| `last_name` | No | Contact last name |
| `email` | No | Contact email |
| `job_title` | No | Contact title (improves person-level scoring) |

\* `domain` or `website` accepted as aliases

**Optional configuration:**
- `signal_types`: Array of signal categories to focus on (default: all)
- `icp_criteria`: Custom ICP description for AI scoring
- `scoring_weights`: Custom weights for signal categories

---

## Execution Steps

### Step 1: Deduplicate Companies

Before enriching, deduplicate the lead list by `company_domain`:

```
LOGIC:
  - Extract unique company_domain values from all leads
  - Map: domain → [list of contacts at that domain]
  - Count: unique_companies = deduplicated domain count
  - Report: "{N} leads across {M} unique companies"
```

This prevents redundant enrichment calls (50 leads at 10 companies = 10 enrichment calls, not 50).

### Step 2: Signaliz Company Signal Enrichment

**For ≤25 unique companies (ad-hoc):**
```
ACTION: Quick enrichment
TOOL:   mcp__Signaliz__execute_primitive
CONFIG:
  capability_id: "enrich_company_signals"
  input_data: [{company_domain: "..."}, ...] (up to 25)
```

**For >25 unique companies (system pipeline):**
```
ACTION: Create enrichment system
TOOL:   mcp__Signaliz__create_system
CONFIG:
  name: "Signal Scoring — {timestamp}"
  capabilities:
    - "mcp_input"
    - "enrich_company_signals"
    - "mcp_output"
  field_mappings:
    domain: "company_domain"
    website: "company_domain"

ACTION: Upload unique company list
TOOL:   mcp__Signaliz__upload_data
CONFIG:
  data: {unique companies as CSV}
  list_name: "Scoring Input — {timestamp}"
  entity_type: "company"

ACTION: Run enrichment
TOOL:   mcp__Signaliz__run_system
CONFIG:
  system_id: {from create}
  list_id: {from upload}

POLL: mcp__Signaliz__get_run every 15s until completed
```

**For >1,000 unique companies:** Run in waves of 1,000 (same pattern as Skill 01).

### Step 3: AI-Powered ICP Scoring

Use Signaliz `custom_ai_prompt` to score each company against ICP criteria:

**For ≤25 companies:**
```
ACTION: AI scoring
TOOL:   mcp__Signaliz__execute_primitive
CONFIG:
  capability_id: "custom_ai_prompt"
  input_data: [
    {
      company_domain: "acme.com",
      signals: "{serialized signal data from step 2}",
      company_industry: "...",
      company_size: "...",
      funding: "..."
    }
  ]
  config:
    system_prompt: |
      You are an expert B2B lead scoring analyst. Score each company
      against the provided ICP criteria on a scale of 0-100.

      Consider these signal categories with the following weights:
      - Hiring signals (25%): Active hiring in relevant roles indicates growth and budget
      - Funding signals (25%): Recent funding indicates available budget
      - Technology signals (20%): Tech stack fit with our product
      - Growth signals (15%): Revenue growth, expansion, new offices
      - Timing signals (15%): Recent changes, leadership hires, product launches

      ICP Criteria: {user_icp_criteria OR default}
    user_template: |
      Company: {{company_domain}}
      Industry: {{company_industry}}
      Size: {{company_size}}
      Signals: {{signals}}

      Score this company and explain your reasoning.
    model: "google/gemini-2.5-flash"
    temperature: 0.2
    output_fields:
      - name: "icp_score"
        type: "number"
        description: "ICP fit score 0-100"
      - name: "score_reasoning"
        type: "string"
        description: "2-3 sentence explanation of the score"
      - name: "top_signals"
        type: "string"
        description: "Comma-separated list of strongest buying signals"
      - name: "recommended_timing"
        type: "string"
        description: "Urgency: immediate, this_week, this_month, nurture"
```

**For >25 companies:** Create a system with `custom_ai_prompt` node and run via `run_system`.

### Step 3b: Blitz API Company Enrichment (backfill gaps)

For companies where Signaliz signals are sparse, backfill with Blitz API:

```
ACTION: Get Company LinkedIn URL (if missing)
TOOL:   Blitz API — POST /v2/enrichment/domain-to-linkedin
CONFIG:
  domain: "{company_domain}"
OUTPUT: found (bool), company_linkedin_url
RATE: 5 RPS

ACTION: Enrich companies missing signal data
TOOL:   Blitz API — POST /v2/enrichment/company
CONFIG:
  company_linkedin_url: "{company_linkedin_url}"
OUTPUT: name, industry, employee_count, headquarters, website, description
RATE: 5 RPS
CAP: Up to 200 companies with missing data

ACTION: Find additional decision-makers (optional, for multi-threaded outreach)
TOOL:   Blitz API — POST /v2/search/waterfall-icp-keyword
CONFIG:
  company_linkedin_url: "{company_linkedin_url}"
  cascade: [
    { "job_titles": ["CEO", "Founder", "Owner"], "seniority": "c_level" },
    { "job_titles": ["VP Sales", "VP Marketing"], "seniority": "vp" },
    { "job_titles": ["Director of Sales"], "seniority": "director" }
  ]
  location: "WORLD"
  max_results: 3
OUTPUT: matched person with linkedin_url, title, company
RATE: 5 RPS
```

**Blitz API enrichment chain for scoring:**
1. `domain-to-linkedin` → get `company_linkedin_url`
2. `enrichment/company` → get firmographics (industry, size, HQ)
3. `waterfall-icp-keyword` → find decision-makers for multi-threading
4. `enrichment/email` → get verified work emails for found contacts

### Step 3c: Lookalike Expansion (optional — find more companies like top scorers)

After initial scoring, use top companies as seeds for lookalike discovery:

```
ACTION: Find similar companies to highest-scoring accounts
TOOL:   mcp__Octave__find_similar_companies
CONFIG:
  referenceCompany: { domain: "{top_scored_domain}" }
  numResults: 25
  similarityTraits: ["industry", "size", "business_model", "target_market"]
  previousResults: ["{all_existing_domains}"]
OUTPUT: similar companies — feed back into scoring pipeline
```

- Run for top 5-10 highest-scoring companies
- New companies go through Steps 2-3 for scoring
- Great for ABM list expansion from proven ICP fits

### Step 4: Octave Person-Level Qualification (top 50 contacts)

For the top 50 contacts (by company ICP score) that have job titles:

**Option A: Use saved qualification agent (preferred):**
```
ACTION: Run saved qualify person agent
TOOL:   mcp__Octave__run_qualify_person_agent
CONFIG:
  agent: "{qualify_agent_name_or_oId}"  # Use list_agents type=QUALIFY_PERSON
  person:
    firstName: "..."
    lastName: "..."
    companyDomain: "..."
    jobTitle: "..."
    email: "..."
OUTPUT: qualification_score, fit_summary, recommended_approach
```

**Option B: One-off qualification:**
```
ACTION: Qualify person against ICP
TOOL:   mcp__Octave__qualify_person
CONFIG:
  person:
    firstName: "..."
    lastName: "..."
    companyDomain: "..."
    jobTitle: "..."
    email: "..."
OUTPUT: qualification_score, fit_summary, recommended_approach
```

**For company-level qualification (complement person scoring):**
```
ACTION: Qualify company against ICP
TOOL:   mcp__Octave__run_qualify_company_agent (or qualify_company)
CONFIG:
  agent: "{qualify_agent_name_or_oId}"
  company: { domain: "{company_domain}" }
OUTPUT: icp_fit_score, reasoning, recommended_approach
```

**Rate limiting:** Process sequentially, 1 call per second, cap at 50 persons.

If no qualify agents exist and enrichment is needed:
```
TOOL:   mcp__Octave__enrich_person
CONFIG:
  person:
    firstName: "..."
    lastName: "..."
    companyDomain: "..."
OUTPUT: profile data for manual scoring (does NOT return emails)
```

### Step 5: Composite Scoring & Ranking

Merge all data sources and compute final scores:

```
SCORING MODEL:
  composite_score = (
    signaliz_icp_score × 0.50 +       # AI company score (0-100)
    signal_density_score × 0.20 +       # Number of active signals (normalized 0-100)
    octave_person_score × 0.20 +        # Person qualification (0-100, or 50 if not qualified)
    email_quality_score × 0.10          # verified=100, catch_all=50, unknown=0
  )

TIER ASSIGNMENT:
  90-100: 🔴 HOT — Immediate outreach
  70-89:  🟠 WARM — Priority this week
  50-69:  🟡 MEDIUM — Standard sequence
  25-49:  🔵 NURTURE — Add to nurture track
  0-24:   ⚪ LOW — Deprioritize
```

### Step 6: Write Scores to Supabase

```
ACTION: Update leads with scores and tiers
TOOL:   mcp__Supabase__execute_sql
CONFIG:
  UPDATE {supabase_table} SET
    lead_score = {composite_score},
    tier = '{tier}',
    updated_at = now()
  WHERE email = '{email}'
BATCH: 100 updates per SQL statement
```

### Step 7: Output Ranked List

Sort all leads by `composite_score` descending and output:

```
OUTPUT FORMAT (Supabase query + optional CSV):
  SELECT rank() OVER (ORDER BY lead_score DESC) as rank,
    lead_score, tier, first_name, last_name, email, job_title,
    company_domain, company_name, company_industry
  FROM {supabase_table}
  WHERE lead_score IS NOT NULL
  ORDER BY lead_score DESC
```

---

## Output

| Deliverable | Format | Description |
|---|---|---|
| `scored_leads_ranked.csv` | CSV | All leads ranked by composite score |
| `hot_leads.csv` | CSV | Tier HOT only — immediate action |
| `signal_summary.csv` | CSV | Per-company signal breakdown |
| **Inline summary** | Text | Score distribution, top 10 preview, signal highlights |

**Summary template:**
```
Lead Scoring Complete — {N} leads across {M} companies

Score Distribution:
  🔴 HOT:     {count} ({pct}%)
  🟠 WARM:    {count} ({pct}%)
  🟡 MEDIUM:  {count} ({pct}%)
  🔵 NURTURE: {count} ({pct}%)
  ⚪ LOW:     {count} ({pct}%)

Top Signals Detected:
  - Hiring: {count} companies actively hiring
  - Funding: {count} companies with recent funding
  - Growth: {count} companies showing expansion signals

Top 5 Leads:
  1. {name} @ {company} — Score: {score} — {top_signal}
  2. ...
```

---

## Error Handling

| Error | Recovery |
|---|---|
| Signaliz enrichment timeout | Collect partial results, re-run failed domains |
| AI scoring returns invalid JSON | Retry with lower temperature (0.1), parse manually |
| Octave qualification unavailable | Skip person-level scoring, weight company score higher (70%) |
| >5,000 unique companies | Warn user, process first 5,000 by alphabetical or random sample |
| Missing company_domain for >20% of leads | Attempt domain inference from company_name via custom_ai_prompt |
