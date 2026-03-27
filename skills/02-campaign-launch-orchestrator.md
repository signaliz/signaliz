# Skill: Campaign Launch Orchestrator

**ID:** `signaliz-campaign-launcher`
**Version:** 1.0.0
**Max Batch:** 5,000 leads
**MCP Dependencies:** Signaliz, Instantly (×3), Octave (×2), Gmail, Google Calendar, Supabase

---

## Description

Takes a verified lead list, creates a multi-step email campaign in Instantly with proper sender assignment, loads leads in batched chunks of 1,000 (Instantly's API limit), and optionally activates the campaign. Integrates Signaliz governance checks (blocklist, data contracts) before any lead touches Instantly, and uses Octave knowledge base for email copy generation.

---

## Trigger

User says any of:
- "Launch a campaign with these leads"
- "Load these leads into Instantly and create a campaign"
- "Set up an outreach campaign"
- "Create an Instantly campaign from this list"
- References a previously enriched/verified lead set

---

## Input Schema

| Field | Required | Description |
|---|---|---|
| `email` | Yes | Verified email address |
| `first_name` | Yes | Contact first name |
| `last_name` | No | Contact last name |
| `company_name` | No | Company name (used in personalization) |
| `website` | No | Company website |
| `phone` | No | Phone number |
| `personalization` | No | Custom personalization snippet |
| `custom_variables` | No | Key-value pairs for template variables |

**Also accepts:** Campaign configuration (name, subject, body, sequence steps, timing)

### Source: Supabase Table (preferred — chained from Skill 01)
```
ACTION: Read verified leads from Supabase
TOOL:   mcp__Supabase__execute_sql
CONFIG:
  SELECT * FROM {supabase_table}
  WHERE email_verified = true
  AND verification_status = 'verified'
  AND campaign_id IS NULL
  ORDER BY lead_score DESC NULLS LAST
  LIMIT {batch_size}
```

---

## Execution Steps

### Step 0: Pre-flight Sender Health Check

Before launching, verify sender accounts are warmed and healthy:

```
ACTION: Check warmup analytics for sender accounts
TOOL:   mcp__Instantly__get_warmup_analytics
CONFIG:
  emails: ["{sender1}", "{sender2}", ...]
  start_date: "{7_days_ago}"
OUTPUT: inbox_placement_rate, spam_rate, reply_rate, daily_progress
```

**Health thresholds:**
- Inbox placement > 80% → ready to send
- Inbox placement 60-80% → warn user, suggest reducing daily limit
- Inbox placement < 60% → do NOT activate, recommend continued warmup

```
ACTION: Check account states
TOOL:   mcp__Instantly__manage_account_state
CONFIG:
  Check each sender account warmup status
OUTPUT: warmup active, days warmed, current state
```

### Step 1: Pre-flight Governance Check

```
ACTION: Run blocklist and data contract validation
TOOL:   mcp__Signaliz__governance_preflight_check
CONFIG:
  records: {lead list}
  checks: ["blocklist", "email_format", "domain_suppression"]
OUTPUT: clean_count, blocked_count, blocked_records[]
```

**If blocked records exist:**
- Report: "{N} leads blocked by governance (blocklist/suppression). {M} leads cleared."
- Proceed only with cleared leads
- Output blocked records separately for audit

### Step 2: Verify Emails (if not pre-verified)

If leads don't have `verification_status` field, run verification first:

```
ACTION: Batch verify all emails through Signaliz
TOOL:   mcp__Signaliz__verify_emails
CONFIG:
  emails: [{email: "..."}, ...] (up to 5,000)
OUTPUT: job_id → poll with check_job_status
```

**Post-verification filter:**
- Only load leads with `status: "verified"` into campaign
- Warn user about catch-all leads — ask whether to include
- Never load `invalid` or `unknown` leads

### Step 3: Generate Campaign Copy (via Octave)

If user hasn't provided email copy:

**Option A: Use saved email agent (preferred — consistent brand voice):**
```
ACTION: Run saved email agent
TOOL:   mcp__Octave__run_email_agent
CONFIG:
  agent: "{agent_name_or_oId}"  # Use list_agents to find
  person:
    firstName: "{{firstName}}"
    companyName: "{{companyName}}"
    companyDomain: "{{companyDomain}}"
    jobTitle: "{{jobTitle}}"
OUTPUT: personalized subject + body per step, with brand voice
```

**Option B: One-off email generation (if no agent exists):**
```
ACTION: Search knowledge base for messaging guidance
TOOL:   mcp__Octave__search_knowledge_base
CONFIG:
  query: "outbound email sequence cold outreach"
  entityTypes: ["playbook", "persona", "product"]
```

```
ACTION: Generate email sequence
TOOL:   mcp__Octave__generate_email
CONFIG:
  person:
    firstName: "{{firstName}}"
    companyName: "{{companyName}}"
  sequenceType: "COLD_OUTBOUND"
  numEmails: 3
  allEmailsInstructions: "Keep under 100 words. No links in first email. Conversational tone."
OUTPUT: subject, body for each step
```

**Option C: Create a reusable email agent for future campaigns:**
```
ACTION: Create email agent
TOOL:   mcp__Octave__create_agent
CONFIG:
  name: "{campaign_type} Outbound Agent"
  type: "EMAIL"
  sequenceType: "COLD_OUTBOUND"
  numEmails: 3
  customInstructions: "Keep under 100 words. No links in first email. Conversational tone."
  generateUniqueSubjectLines: true
OUTPUT: agent oId — reuse for all leads in this campaign
```

### Step 4: Create Instantly Campaign (2-step process)

**Step 4a: Discover sender accounts**
```
ACTION: Create campaign to discover available senders
TOOL:   mcp__Instantly__create_campaign
CONFIG:
  params:
    name: "{campaign_name} — {date}"
    subject: "{from step 3 or user input}"
    body: "{from step 3 or user input}"
    sequence_steps: {1-4, based on copy}
    sequence_subjects: ["{step2_subject}", "{step3_subject}"]
    sequence_bodies: ["{step2_body}", "{step3_body}"]
    step_delay_days: 3
    daily_limit: 30
    email_gap: 10
    stop_on_reply: true
    stop_on_auto_reply: true
    track_opens: false
    track_clicks: false
    timing_from: "09:00"
    timing_to: "17:00"
OUTPUT: campaign_id, eligible_accounts[]
```

**Step 4b: Assign sender accounts**
```
ACTION: Update campaign with sender emails
TOOL:   mcp__Instantly__create_campaign
CONFIG:
  params:
    name: "{same name}"
    subject: "{same subject}"
    body: "{same body}"
    email_list: ["{selected_sender_1}", "{selected_sender_2}", ...]
OUTPUT: campaign_id (confirmed)
```

### Step 5: Load Leads in Batches of 1,000

Instantly's bulk API accepts max 1,000 leads per call. For 5,000 leads:

```
BATCH LOOP (5 iterations for 5,000 leads):

  Batch 1: leads[0..999]
  Batch 2: leads[1000..1999]
  Batch 3: leads[2000..2999]
  Batch 4: leads[3000..3999]
  Batch 5: leads[4000..4999]

  PER BATCH:
    ACTION: Bulk add leads
    TOOL:   mcp__Instantly__add_leads_to_campaign_or_list_bulk
    CONFIG:
      params:
        campaign_id: "{from step 4}"
        skip_if_in_campaign: true
        leads: [
          {
            email: "...",
            first_name: "...",
            last_name: "...",
            company_name: "...",
            website: "...",
            phone: "...",
            personalization: "...",
            custom_variables: {...}
          },
          ... (up to 1,000)
        ]
    OUTPUT: uploaded_count, skipped_count

  WAIT: 2 seconds between batches to avoid rate limits
```

**Error handling per batch:**
- If a batch fails with 429 (rate limit): wait 30s, retry
- If a batch fails with 500: retry up to 3 times with exponential backoff (5s, 10s, 20s)
- If a batch partially fails: log failed leads, continue with next batch, retry failed leads at end
- Track cumulative: `total_uploaded`, `total_skipped`, `total_failed`

### Step 6: Verify Load & Report

```
ACTION: Confirm campaign state
TOOL:   mcp__Instantly__get_campaign
CONFIG:
  params:
    id: "{campaign_id}"
OUTPUT: lead_count, status, sender_accounts
```

### Step 7: Activate (with user confirmation)

```
PROMPT USER: "Campaign '{name}' loaded with {N} leads across {S} sender accounts.
              Sequence: {steps} steps, {delay}d delay, {daily_limit}/day/account.
              Estimated send duration: {estimate}.
              Activate now? (yes/no)"

IF yes:
  ACTION: Activate campaign
  TOOL:   mcp__Instantly__activate_campaign
  CONFIG:
    params:
      id: "{campaign_id}"
```

---

## Output

| Deliverable | Description |
|---|---|
| **Campaign ID** | Instantly campaign identifier |
| **Load summary** | Leads loaded / skipped / failed per batch |
| **Governance report** | Leads blocked by Signaliz pre-flight |
| **Sequence preview** | Subject + first line of each step |
| **Send estimate** | Days to complete based on sender count × daily limit |

---

## Error Handling

| Error | Recovery |
|---|---|
| No eligible sender accounts | Alert user — cannot proceed without senders |
| Instantly 429 rate limit | Wait 30s, retry batch |
| Instantly 500 server error | Retry 3× with exponential backoff |
| Duplicate leads (skip) | Log as skipped, not failed |
| Governance blocks >50% | Warn user — list may be low quality |
| Octave email generation fails | Fall back to user-provided copy or basic templates |

---

### Step 8: Update Supabase with Campaign Assignment

```
ACTION: Mark leads as assigned to campaign
TOOL:   mcp__Supabase__execute_sql
CONFIG:
  UPDATE {supabase_table} SET
    campaign_id = '{campaign_id}',
    updated_at = now()
  WHERE email IN ({loaded_emails})
```

---

### Step 9: Post-Launch Monitoring Setup

```
ACTION: Check for replies (run periodically after launch)
TOOL:   mcp__Instantly__count_unread_emails
CONFIG:
  (no params — returns unread count)
OUTPUT: unread_count

ACTION: Get campaign performance
TOOL:   mcp__Instantly__get_campaign_analytics
CONFIG:
  params:
    campaign_id: "{campaign_id}"
OUTPUT: sent, opens, clicks, replies, bounces, unsubscribes

ACTION: Search Gmail for direct replies (outside Instantly)
TOOL:   mcp__Gmail__gmail_search_messages
CONFIG:
  q: "is:unread from:{lead_domain} subject:{campaign_subject}"
  maxResults: 20
OUTPUT: message list with IDs for reading
```

**If lead replies with interest:**
```
ACTION: Generate call prep for hot responder
TOOL:   mcp__Octave__generate_call_prep
CONFIG:
  person:
    firstName: "{lead_first_name}"
    companyDomain: "{company_domain}"
    email: "{lead_email}"
    jobTitle: "{job_title}"
  meetingContext: "Responded to outbound campaign — interested in learning more"
OUTPUT: discovery questions, company brief, objection handling

ACTION: Schedule follow-up call
TOOL:   mcp__GCal__gcal_create_event
CONFIG:
  event:
    summary: "Discovery Call — {lead_name} @ {company}"
    start: { dateTime: "{available_slot}" }
    end: { dateTime: "{30min_later}" }
    attendees: [{ email: "{lead_email}" }]
    description: "{call_prep_summary}"
```

### Step 10: Mid-Campaign Adjustments

```
ACTION: Update campaign settings if needed
TOOL:   mcp__Instantly__update_campaign
CONFIG:
  params:
    campaign_id: "{campaign_id}"
    daily_limit: {adjusted_limit}
    sequences: [{updated_steps}]  # Modify copy based on performance
    open_tracking: false           # Improve deliverability
```

```
ACTION: Move bounced/unresponsive leads to nurture list
TOOL:   mcp__Instantly__move_leads_to_campaign_or_list
CONFIG:
  params:
    campaign: "{campaign_id}"
    filter: "bounced"
    to_list_id: "{nurture_list_id}"
```

---

## Safety Guards

1. **Never activate without user confirmation**
2. **Never load unverified emails** — always verify first or require `verification_status`
3. **Never exceed 50 emails/day/account** — Instantly hard limit
4. **Always enable `skip_if_in_campaign: true`** — prevents duplicate sends
5. **Always run Signaliz governance pre-flight** — blocklist + suppression
6. **Always update Supabase** — track which leads are in which campaigns
7. **Always check sender warmup health** before activating (Step 0)
8. **Never send replies without user confirmation** — `reply_to_email` sends real email
