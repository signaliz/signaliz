# Signaliz Workflow Skills — Claude Code Integration

## Overview

This repo contains 6 advanced workflow skills that orchestrate **Signaliz**, **Octave**, **Instantly**, **Blitz API**, and **Supabase** MCP tools for B2B lead operations at scale (up to 5,000 leads per run). **Supabase** is the central lead table — all skills read from and write to it, enabling seamless chaining.

## Skills Directory

All skills are in `skills/`. See `skills/SKILLS.md` for the full index.

| Skill | Trigger Phrases |
|---|---|
| **00 — Lead Sourcing** | "find leads", "source leads", "build a lead list", "find SaaS founders" |
| **01 — Enrich & Verify** | "enrich and verify", "find emails", "enrichment pipeline" |
| **02 — Campaign Launcher** | "launch campaign", "load into Instantly", "create campaign" |
| **03 — Lead Scoring** | "score leads", "prioritize", "qualify", "rank by fit" |
| **04 — List Hygiene** | "clean list", "deduplicate", "verify my campaign", "remove bad emails" |
| **05 — Personalized Outreach** | "personalized outreach", "custom emails", "signal-based campaign" |

## MCP Stack

| Server | Instances | Role |
|---|---|---|
| **Signaliz** | 1 | Core pipeline — email verify, signals, AI scoring, governance |
| **Octave** | 2 working (`0e7865d0`, `33b5906b`), 1 broken (`88f4c56e` — avoid) | Person/company find, enrich, qualify, email generation, lookalike lists, persistent agents, call prep, knowledge base |
| **Instantly** | 3 (`26122de2`, `88d6119d`, `b6d3162b`) — use in parallel for 3× throughput | Campaign CRUD, lead loading, activation, email verification, analytics, reply management, warmup monitoring |
| **Blitz API** | 1 (`e78bb534` — docs search only, no direct API calls yet) | Find work emails, company/people search, enrichment, email validation (5 RPS) |
| **Supabase** | 1 (`8f03796f`) | Central lead table — all skills read/write here |
| **Gmail** | 1 (`b18e21ef`) | Search inbox for lead replies, read threads, create draft responses |
| **Google Calendar** | 1 (`c56b192a`) | Schedule follow-up calls, find meeting times, check availability |

## Octave — Full Capability Reference

### Sourcing & Discovery
| Tool | Description |
|---|---|
| `find_person` | Search for people by title, company, location (100 results/query) |
| `find_company` | Search for companies by criteria |
| `find_similar_companies` | **Lookalike lists** — find companies similar to a reference (up to 25 results) |
| `find_similar_people` | **Lookalike lists** — find people similar to a reference contact |

### Enrichment & Qualification
| Tool | Description |
|---|---|
| `enrich_company` | Company intelligence report (firmographics, funding, hiring, tech stack) |
| `enrich_person` | Person intelligence report (profile, career, personas) — **does NOT return emails** |
| `qualify_company` | Score company against ICP |
| `qualify_person` | Score person against ICP |

### Agents (persistent, reusable — prefer over one-off calls)
| Tool | Description |
|---|---|
| `create_agent` | Create EMAIL, CONTENT, CALL_PREP, ENRICH_PERSON/COMPANY, QUALIFY_PERSON/COMPANY agents |
| `run_email_agent` | Run saved email agent — generates personalized sequences with brand voice |
| `run_call_prep_agent` | Run saved call prep agent — discovery questions, briefs, objection handling |
| `run_enrich_company_agent` | Run saved company enrichment agent |
| `run_enrich_person_agent` | Run saved person enrichment agent |
| `run_qualify_company_agent` | Run saved company qualification agent |
| `run_qualify_person_agent` | Run saved person qualification agent |
| `run_content_agent` | Run saved content generation agent |

### Knowledge Base
| Tool | Description |
|---|---|
| `create_entity` | Create personas, products, segments, competitors, proof points, references |
| `create_playbook` | Create sales playbooks (SECTOR, SOLUTION, COMPETITIVE, ACCOUNT) |
| `create_resource` | Add resources to KB (URLs, text, files) |
| `add_value_props` | Add value propositions |
| `list_writing_styles` | List available writing styles for email tone |
| `search_knowledge_base` | Search KB for messaging guidance |
| `generate_email` | One-off email generation (use `run_email_agent` for persistent agents) |
| `generate_content` | One-off content generation |
| `generate_call_prep` | One-off call prep (use `run_call_prep_agent` for saved agents) |

## Instantly — Full Capability Reference

### Campaign Management
| Tool | Description |
|---|---|
| `create_campaign` | Create new campaign (2-step: create → assign senders) |
| `update_campaign` | Modify live campaign settings (sequences, limits, tracking, senders) |
| `get_campaign` | Get campaign details |
| `activate_campaign` / `pause_campaign` | Start/stop campaigns |
| `delete_campaign` | Delete campaign |

### Lead Management
| Tool | Description |
|---|---|
| `add_leads_to_campaign_or_list_bulk` | Bulk add up to 1,000 leads per call |
| `create_lead` / `update_lead` / `delete_lead` / `get_lead` | Single lead CRUD |
| `move_leads_to_campaign_or_list` | Move/copy leads between campaigns or lists |
| `list_leads` | List leads with pagination |
| `search_campaigns_by_contact` | Find which campaigns a contact is in |

### Analytics & Monitoring
| Tool | Description |
|---|---|
| `get_campaign_analytics` | Campaign metrics: opens, clicks, replies, bounces |
| `get_daily_campaign_analytics` | Day-by-day performance breakdown |
| `get_warmup_analytics` | Sender warmup health: inbox placement, spam rate |
| `get_verification_stats_for_lead_list` | List verification breakdown |

### Email & Reply Management
| Tool | Description |
|---|---|
| `verify_email` | Verify single email address |
| `list_emails` / `get_email` | Read campaign emails |
| `count_unread_emails` | Check for new replies |
| `reply_to_email` | Send reply to lead thread (requires user confirmation) |
| `mark_thread_as_read` | Mark thread as read |

### Account Management
| Tool | Description |
|---|---|
| `list_accounts` / `get_account` / `create_account` / `update_account` | Sender account CRUD |
| `manage_account_state` | Control warmup state |
| `create_lead_list` / `list_lead_lists` | Lead list management |

## Gmail — Capability Reference

| Tool | Description |
|---|---|
| `gmail_search_messages` | Search inbox with Gmail query syntax (from:, subject:, is:unread, etc.) |
| `gmail_read_message` | Read full email content by message ID |
| `gmail_read_thread` | Read entire conversation thread |
| `gmail_create_draft` | Create draft email or draft reply to thread |
| `gmail_list_drafts` | List saved drafts |
| `gmail_get_profile` | Get account info |

**Use cases in pipeline:** Track lead replies, read response content, draft personalized follow-ups.

## Google Calendar — Capability Reference

| Tool | Description |
|---|---|
| `gcal_create_event` | Schedule meetings, calls, follow-ups |
| `gcal_find_meeting_times` | Find mutual availability with attendees |
| `gcal_find_my_free_time` | Check own calendar for free slots |
| `gcal_list_events` | View upcoming schedule |
| `gcal_update_event` / `gcal_delete_event` | Modify/cancel events |
| `gcal_respond_to_event` | Accept/decline invitations |

**Use cases in pipeline:** Schedule discovery calls with HOT leads, block time for follow-ups.

## Blitz API — Full Endpoint Reference

**Base URL:** `https://api.blitz-api.ai`
**Auth:** `x-api-key` header on every request
**Rate Limit:** 5 RPS, 5 concurrent
**Method:** All endpoints use POST (except GET /v2/account/api-key)

### Search Endpoints

| Endpoint | Description | Key Parameters |
|---|---|---|
| `POST /v2/search/waterfall-icp-keyword` | Find best decision-maker at a target company using prioritized cascade hierarchy | `company_linkedin_url`, `cascade` (array of job level/title tiers), `location`, `max_results` |
| `POST /v2/search/companies` | Find companies matching ICP criteria (industry, size, location, keywords) | `company.keyword`, `company.employee_range`, `company.hq.country_code`, cursor pagination |
| `POST /v2/search/employee-finder` | Search all employees at a single company by job level, department, location | `company_linkedin_url`, `job_level`, `department`, `country_code`, page pagination |

### People Enrichment Endpoints

| Endpoint | Description | Key Parameters |
|---|---|---|
| `POST /v2/enrichment/email` | **Find Work Email** — retrieve verified work email from a LinkedIn profile URL | `linkedin_url` → returns `found`, `email`, `first_name`, `last_name`, `company_linkedin_url` |
| `POST /v2/enrichment/email-to-person` | **Reverse Email Lookup** — identify a person from their email address | `email` → returns person profile, company, title |
| `POST /v2/enrichment/reverse-phone` | **Reverse Phone Lookup** — identify a person from phone number | `phone` → returns person profile |

### Company Enrichment Endpoints

| Endpoint | Description | Key Parameters |
|---|---|---|
| `POST /v2/enrichment/company` | Full company profile from LinkedIn URL | `company_linkedin_url` → returns name, industry, employee_count, HQ, website |
| `POST /v2/enrichment/linkedin-to-domain` | Get email domain from Company LinkedIn URL | `company_linkedin_url` → returns `email_domain` |
| `POST /v2/enrichment/domain-to-linkedin` | Get Company LinkedIn URL from domain | `domain` → returns `company_linkedin_url` |

### Utilities

| Endpoint | Description | Key Parameters |
|---|---|---|
| `POST /v2/utilities/email/validate` | SMTP-level email validation (deliverability check) | `email` → returns validity, deliverability, catch_all status |

### Account

| Endpoint | Description |
|---|---|
| `GET /v2/account/api-key` | Check API key validity, remaining credits, allowed endpoints |

### Email Finding Priority (use in order)

1. **Blitz API Find Work Email** (`/v2/enrichment/email`) — best for leads with LinkedIn URLs. Returns verified work email directly. ~60-70% hit rate.
2. **Blitz API Email Validation** (`/v2/utilities/email/validate`) — SMTP-level validation for pattern-guessed emails
3. **Instantly verify_email** — verify pattern-guessed emails (firstname@domain, firstname.lastname@domain)
4. **Octave enrich_person** — does NOT return emails. Returns intelligence reports only.

### Key Blitz API Behaviors

- `POST /v2/enrichment/email` requires a LinkedIn profile URL — use `linkedin_profile` from Supabase leads
- Company Search returns `linkedin_url` per company — use as input for Waterfall ICP and Employee Finder
- Employee Finder returns `linkedin_url` per person — chain with `/v2/enrichment/email` to get work emails
- All enrichment endpoints return `found: true/false` — check before using results
- Waterfall ICP `cascade` is an array of priority tiers (e.g., C-Level → VP → Director)

## How to Use

1. Ensure Signaliz, Octave, Instantly, Blitz API, and Supabase MCP servers are connected
2. Start with Skill 00 to source leads, OR upload/reference your lead data
3. Skills chain via Supabase: 00 → 01 → 03 → 05 (with 04 for maintenance)
4. Each skill will guide you through steps with confirmation prompts

## Key Constraints

- **Max 5,000 leads per skill run** — larger lists should be split
- **Instantly bulk load: 1,000 per batch** — skills auto-batch with 2s gaps
- **Signaliz run_system: 1,000 rows per wave** — skills auto-wave with polling
- **Blitz API: 5 RPS, 5 concurrent** — skills use 200ms gaps between calls
- **Blitz API Find Work Email: requires LinkedIn URL** — only works for leads with `linkedin_profile`
- **Octave enrich_person: does NOT return emails** — use Blitz API or pattern guessing + Instantly verify
- **Octave enrichment: 1 call/second** — skills cap at 50 companies or 200 persons
- **Supabase: 100 rows per INSERT** — skills batch SQL writes
- **Always verify before sending** — no skill will load unverified emails into Instantly
- **Never activate without confirmation** — campaign launch always requires user approval

## Error Recovery

All skills implement retry with exponential backoff (5s → 10s → 20s, max 3 retries). Rate limit errors (429) wait 30 seconds. Partial failures are collected and retried separately. Failed records are reported, never silently dropped.
