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
| **Instantly** | Campaign creation, lead loading, activation |
| **Blitz API** | Company search, employee finder, email/company enrichment (5 RPS) |
| **Supabase** | Central lead table — all skills read/write here |

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
- **Octave enrichment: 1 call/second** — skills cap at 50 companies or 200 persons
- **Supabase: 100 rows per INSERT** — skills batch SQL writes
- **Always verify before sending** — no skill will load unverified emails into Instantly
- **Never activate without confirmation** — campaign launch always requires user approval

## Error Recovery

All skills implement retry with exponential backoff (5s → 10s → 20s, max 3 retries). Rate limit errors (429) wait 30 seconds. Partial failures are collected and retried separately. Failed records are reported, never silently dropped.
