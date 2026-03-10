# Skill: Personalized Outreach Pipeline

**ID:** `signaliz-personalized-outreach`
**Version:** 1.0.0
**Max Batch:** 5,000 leads (personalization generated for top 200, template variables for rest)
**MCP Dependencies:** Signaliz, Instantly, Octave

---

## Description

Full-funnel outreach pipeline that enriches leads with company signals, generates AI-personalized email copy per lead (or per company segment), creates multi-step Instantly campaigns with dynamic personalization variables, and loads leads with per-lead custom fields. Combines Signaliz signal intelligence, Octave email generation, and Instantly campaign execution into a single orchestrated workflow.

---

## Trigger

User says any of:
- "Create personalized outreach for these leads"
- "Build a personalized campaign"
- "Generate custom emails for each lead"
- "Run the outreach pipeline"
- "Personalize and launch this list"
- References personalization, custom emails, or signal-based outreach

---

## Input Schema

| Field | Required | Description |
|---|---|---|
| `email` | Yes | Verified email address |
| `first_name` | Yes | Contact first name |
| `last_name` | No | Contact last name |
| `company_domain` | Yes | Company domain |
| `company_name` | No | Company name |
| `job_title` | No | Contact title (improves personalization) |
| `linkedin_url` | No | LinkedIn URL (enables deep Octave enrichment) |

**Optional configuration:**
- `personalization_depth`: `"deep"` (per-lead Octave), `"segment"` (per-company), `"template"` (variable substitution only)
- `sequence_steps`: Number of follow-up emails (1-4, default: 3)
- `tone`: Conversational, professional, casual, direct
- `focus_signals`: Which signals to emphasize in personalization

---

## Execution Steps

### Step 1: Enrich Companies with Signaliz Signals

Deduplicate by domain, then enrich:

```
ACTION: Extract unique company domains
LOGIC:
  unique_domains = deduplicate(leads.map(l => l.company_domain))
  domain_to_leads = group_by(leads, "company_domain")
```

**For ≤25 unique domains:**
```
TOOL:   mcp__Signaliz__execute_primitive
CONFIG:
  capability_id: "enrich_company_signals"
  input_data: [{company_domain: "..."}, ...]
```

**For >25 unique domains:**
```
TOOL:   mcp__Signaliz__create_system
CONFIG:
  name: "Outreach Enrichment — {timestamp}"
  capabilities: ["mcp_input", "enrich_company_signals", "mcp_output"]

TOOL:   mcp__Signaliz__upload_data
CONFIG:
  data: {unique domains as CSV}
  entity_type: "company"

TOOL:   mcp__Signaliz__run_system
CONFIG:
  system_id: {from create}
  list_id: {from upload}
POLL: get_run every 15s
```

Output: Per-company signal data (hiring, funding, product launches, partnerships, leadership changes).

### Step 2: Segment Leads by Signal Profile

```
ACTION: AI-powered segmentation
TOOL:   mcp__Signaliz__execute_primitive (or create_system for >25)
CONFIG:
  capability_id: "custom_ai_prompt"
  input_data: [{company_domain, signals_summary, industry, size}, ...]
  config:
    system_prompt: |
      You are a B2B outreach strategist. Categorize each company into
      one of these outreach segments based on their signals:

      1. GROWTH_SURGE — Recently funded, hiring aggressively, expanding
      2. TECH_ADOPTER — New product launches, tech stack changes, innovation signals
      3. LEADERSHIP_CHANGE — New C-suite, reorgs, strategic shifts
      4. STABLE_FIT — Good ICP fit but no urgent signals — standard outreach
      5. LOW_PRIORITY — Poor fit or no actionable signals

      Also identify the single strongest hook (1 sentence) for outreach.
    user_template: |
      Company: {{company_domain}}
      Industry: {{industry}}
      Signals: {{signals_summary}}
    output_fields:
      - name: "segment"
        type: "string"
        description: "One of: GROWTH_SURGE, TECH_ADOPTER, LEADERSHIP_CHANGE, STABLE_FIT, LOW_PRIORITY"
      - name: "outreach_hook"
        type: "string"
        description: "One-sentence personalized hook based on strongest signal"
      - name: "pain_point"
        type: "string"
        description: "Likely pain point given their signals"
```

### Step 3: Generate Personalized Email Copy

**Tier 1 — Deep personalization (top 200 leads by segment priority):**

Process GROWTH_SURGE and LEADERSHIP_CHANGE leads first via Octave:

```
FOR each lead (up to 200, prioritized by segment):
  ACTION: Generate personalized sequence
  TOOL:   mcp__Octave__generate_email
  CONFIG:
    person:
      firstName: "{first_name}"
      lastName: "{last_name}"
      companyDomain: "{company_domain}"
      companyName: "{company_name}"
      title: "{job_title}"
      email: "{email}"
    sequenceType: "COLD_OUTBOUND"
    numEmails: {sequence_steps}
    allEmailsContext: |
      Company signals: {signals_summary}
      Outreach hook: {outreach_hook}
      Pain point: {pain_point}
      Segment: {segment}
    allEmailsInstructions: |
      - Reference specific company signals naturally (don't be creepy)
      - Keep each email under 80 words
      - No links in email 1
      - Each follow-up should add new value, not just "bumping"
      - Tone: {user_tone or "conversational"}
  OUTPUT: personalized subject + body per step

  RATE: 1 call/second, max 200 leads
  STORE: Map lead.email → {custom_subject, custom_body, personalization_snippet}
```

**Tier 2 — Segment-based templates (remaining leads):**

For leads not in the top 200, generate one template per segment:

```
FOR each segment (GROWTH_SURGE, TECH_ADOPTER, LEADERSHIP_CHANGE, STABLE_FIT):
  ACTION: Generate segment template
  TOOL:   mcp__Octave__generate_content
  CONFIG:
    instructions: |
      Write a {sequence_steps}-step cold email sequence for the {segment} segment.
      These are companies showing: {segment_description}.

      Use these personalization variables:
      - {{firstName}} — recipient first name
      - {{companyName}} — company name
      - {{outreach_hook}} — per-company signal-based hook
      - {{pain_point}} — per-company pain point

      Each email should be under 80 words. Conversational tone.
      Email 1: Signal-based opener using {{outreach_hook}}
      Email 2: Pain point expansion using {{pain_point}}
      Email 3: Value prop + soft CTA
    customContext: "Target audience: {user_context}. Product: {user_product}."
  OUTPUT: template subjects + bodies with {{variables}}
```

### Step 4: Prepare Lead Payloads with Custom Variables

```
FOR each lead:
  custom_variables = {
    outreach_hook: "{from step 2}",
    pain_point: "{from step 2}",
    segment: "{from step 2}",
    company_signals: "{summary}",
    custom_subject: "{if deep personalized}",
    custom_body: "{if deep personalized}"
  }

  IF lead has deep personalization (top 200):
    personalization = "{custom_body_step1}"  # Instantly's personalization field
  ELSE:
    personalization = ""  # Uses segment template with variables
```

### Step 5: Create Instantly Campaigns (per segment)

Create separate campaigns per segment for better tracking:

```
FOR each active segment (exclude LOW_PRIORITY):

  ACTION: Create campaign
  TOOL:   mcp__Instantly__create_campaign
  CONFIG:
    params:
      name: "{campaign_name} — {segment} — {date}"
      subject: "{segment_template_subject}"
      body: "{segment_template_body}"
      sequence_steps: {steps}
      sequence_subjects: ["{step2}", "{step3}"]
      sequence_bodies: ["{step2}", "{step3}"]
      step_delay_days: 3
      daily_limit: 30
      stop_on_reply: true

  # Step 2: Assign senders
  TOOL:   mcp__Instantly__create_campaign
  CONFIG:
    params:
      name: "{same}"
      subject: "{same}"
      body: "{same}"
      email_list: ["{senders}"]
```

### Step 6: Load Leads into Segment Campaigns

```
FOR each segment campaign:
  segment_leads = leads.filter(l => l.segment == segment)

  BATCH (chunks of 1,000):
    TOOL: mcp__Instantly__add_leads_to_campaign_or_list_bulk
    CONFIG:
      params:
        campaign_id: "{segment_campaign_id}"
        skip_if_in_campaign: true
        leads: [
          {
            email: "...",
            first_name: "...",
            last_name: "...",
            company_name: "...",
            personalization: "{deep_personalized_body or empty}",
            custom_variables: {
              outreach_hook: "...",
              pain_point: "...",
              company_signals: "..."
            }
          }
        ]
    WAIT: 2s between batches
```

### Step 7: Activate with User Review

```
PRESENT TO USER:
  Campaign Summary:
  ┌─────────────────────────────────────────────┐
  │ Segment          │ Leads │ Personalized │ Campaign ID │
  │ GROWTH_SURGE     │  {n}  │     {n}      │   {id}      │
  │ TECH_ADOPTER     │  {n}  │     {n}      │   {id}      │
  │ LEADERSHIP_CHANGE│  {n}  │     {n}      │   {id}      │
  │ STABLE_FIT       │  {n}  │     {n}      │   {id}      │
  └─────────────────────────────────────────────┘

  Total: {N} leads across {S} segment campaigns
  Deep personalized: {P} leads (top tier)
  Template personalized: {T} leads (with signal variables)
  Excluded (LOW_PRIORITY): {E} leads

  Preview first email for top lead:
  Subject: {preview_subject}
  Body: {preview_body}

  Activate all campaigns? (yes / review each / no)
```

```
IF yes:
  FOR each campaign:
    TOOL: mcp__Instantly__activate_campaign
    CONFIG: params: { id: "{campaign_id}" }
```

---

## Output

| Deliverable | Format | Description |
|---|---|---|
| **Campaign IDs** | List | One per segment |
| `personalization_map.csv` | CSV | email, segment, outreach_hook, pain_point, personalization_type |
| `signal_enrichment.csv` | CSV | Per-company signal data |
| `excluded_leads.csv` | CSV | LOW_PRIORITY leads not loaded |
| **Inline preview** | Text | Sample emails per segment |

---

## Error Handling

| Error | Recovery |
|---|---|
| Octave generation fails for a lead | Fall back to segment template for that lead |
| Octave rate limit | Reduce to 1 call per 3 seconds, cap deep personalization at 100 |
| Signaliz enrichment partial failure | Use available signals, mark un-enriched as STABLE_FIT segment |
| Instantly campaign creation fails | Retry once, then consolidate segments into fewer campaigns |
| >5,000 leads | Process first 5,000, queue remainder for next run |
| Custom variable name mismatch | Validate variable names against campaign schema before loading |

---

## Safety Guards

1. **Never activate without user preview and confirmation**
2. **Always verify emails before loading** — require `verification_status` or run verification
3. **Cap Octave deep personalization at 200** — prevents excessive API usage and cost
4. **Exclude LOW_PRIORITY segment** from campaigns (offer as optional add-on)
5. **Separate campaigns per segment** — enables independent pause/activation
6. **Preview emails before send** — show at least one sample per segment
