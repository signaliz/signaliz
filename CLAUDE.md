# Signaliz Workflow Skills — Claude Code Integration

## Overview

This repo contains 5 advanced workflow skills that orchestrate **Signaliz**, **Instantly**, and **Octave** MCP tools for B2B lead operations at scale (up to 5,000 leads per run).

## Skills Directory

All skills are in `skills/`. See `skills/SKILLS.md` for the full index.

| Skill | Trigger Phrases |
|---|---|
| **01 — Enrich & Verify** | "enrich and verify", "find emails", "enrichment pipeline" |
| **02 — Campaign Launcher** | "launch campaign", "load into Instantly", "create campaign" |
| **03 — Lead Scoring** | "score leads", "prioritize", "qualify", "rank by fit" |
| **04 — List Hygiene** | "clean list", "deduplicate", "verify my campaign", "remove bad emails" |
| **05 — Personalized Outreach** | "personalized outreach", "custom emails", "signal-based campaign" |

## How to Use

1. Ensure Signaliz, Instantly, and Octave MCP servers are connected
2. Upload or reference your lead data (CSV, Google Sheet URL, or inline)
3. Ask for a specific workflow using the trigger phrases above
4. The skill will guide you through each step with confirmation prompts

## Key Constraints

- **Max 5,000 leads per skill run** — larger lists should be split
- **Instantly bulk load: 1,000 per batch** — skills auto-batch with 2s gaps
- **Signaliz run_system: 1,000 rows per wave** — skills auto-wave with polling
- **Octave enrichment: 1 call/second** — skills cap at 50 companies or 200 persons
- **Always verify before sending** — no skill will load unverified emails into Instantly
- **Never activate without confirmation** — campaign launch always requires user approval

## Error Recovery

All skills implement retry with exponential backoff (5s → 10s → 20s, max 3 retries). Rate limit errors (429) wait 30 seconds. Partial failures are collected and retried separately. Failed records are reported, never silently dropped.
