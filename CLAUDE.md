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

| Server | Role |
|---|---|
| **Signaliz** | Core pipeline — email verify, signals, AI scoring, governance |
| **Octave** | Person/company find, enrich, qualify, email generation |
| **Instantly** | Campaign creation, lead loading, activation, email verification |
| **Blitz API** | Find work emails, company/people search, enrichment, email validation (5 RPS) |
| **Supabase** | Central lead table — all skills read/write here |

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
