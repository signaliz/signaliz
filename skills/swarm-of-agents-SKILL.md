---
name: swarm-of-agents
description: >
  Deep-research any topic using a swarm of AI agents powered by Signaliz MCP
  and the x-ai/grok-4.20-multi-agent model via OpenRouter. Use this skill
  whenever someone asks to: research a topic in depth, run multi-angle
  analysis, get a comprehensive briefing, investigate a market or trend,
  analyze a strategy, do competitive analysis, build a research brief, or
  explore any question from multiple expert perspectives simultaneously.
  Trigger on phrases like "research this topic", "deep dive on", "swarm
  research", "multi-agent research", "analyze this from multiple angles",
  "give me a full briefing on", "investigate", "what's the state of [topic]",
  "comprehensive analysis of", "explore [topic] thoroughly", "use the swarm",
  "agent swarm", "swarm of agents", or any request for thorough, multi-
  perspective research on any subject. Also trigger when someone asks for
  "expert analysis", "think tank analysis", "war room briefing", or wants
  to understand a complex topic from many viewpoints. Always use this skill
  for deep, multi-faceted research — even if the user doesn't mention
  "swarm" or "agents" by name. This skill is NOT limited to company or GTM
  research — it works for any topic: technology, markets, policy, science,
  strategy, industry trends, competitive landscapes, or open-ended questions.
---

# Swarm of Agents: Multi-Perspective Deep Research

Research any topic by dispatching a swarm of specialized AI agents — each
adopting a distinct expert persona — then synthesizing their findings into a
unified intelligence brief. Powered by Signaliz's `custom_ai_prompt`
capability and the **x-ai/grok-4.20-multi-agent** model via OpenRouter.

---

## How It Works

The swarm pattern decomposes a research question into 5-8 specialized
perspectives (agents), runs each through Signaliz `custom_ai_prompt` with
Exa web search enabled, then synthesizes findings into a structured brief.
Each agent gets a unique system prompt that defines its expert lens.

**Model:** `x-ai/grok-4.20-multi-agent` (OpenRouter)
**Web search:** Always enabled (Exa) — each agent gets grounded, real-time context
**Credits per agent:** ~2 credits (1 AI + 1 Exa search)

---

## Prerequisites

- **Signaliz MCP connected.** If tools fail, disconnect/reconnect (cold start fix).
- **Model enabled.** `x-ai/grok-4.20-multi-agent` must be enabled in the
  Signaliz workspace AI settings. Call `list_enabled_models` to verify.
  If not available, fall back to `google/gemini-2.5-flash` or ask the user.
- **Tool loading:** Before any Signaliz calls, use `tool_search` to load
  correct tool definitions. Do not guess parameter names.

---

## CRITICAL: Model Compatibility & Execution Modes

Signaliz `custom_ai_prompt` supports two execution modes. **You must choose
the correct mode based on whether the model supports tool use (function
calling / structured output).**

### Structured Mode (default)

For models that support tool use: Gemini, GPT, Claude, etc. Uses
`output_fields` to get structured JSON back from each agent.

**Compatible models:** `google/gemini-2.5-flash`, `openai/gpt-5.4`,
`anthropic/claude-sonnet-4.6`, `anthropic/claude-haiku-4.5`, and most
major providers.

### Freeform Mode (required for Grok Multi-Agent)

**`x-ai/grok-4.20-multi-agent` does NOT support tool use through
OpenRouter.** If you send `output_fields`, every record will fail with:
`"No endpoints found that support tool use"`

**The fix:** When using Grok (or any model without tool use support):

1. **Do NOT include `output_fields`** in the config
2. **Embed all extraction instructions directly in the system prompt** as
   text formatting requirements
3. **Use the async `Signaliz:custom_ai_prompt` tool** (not `execute_primitive`)
   because Grok multi-agent has longer inference times (30-120s per record)
   and will timeout on the synchronous primitive

This is not a degradation — freeform mode often produces richer, more
natural analysis because the model isn't constrained by JSON field extraction.

### Quick Reference: Which Mode + Tool to Use

| Model | Mode | Tool | Notes |
|-------|------|------|-------|
| `x-ai/grok-4.20-multi-agent` | Freeform | `Signaliz:custom_ai_prompt` (async) | No output_fields. Longer inference. |
| `google/gemini-2.5-flash` | Structured | `execute_primitive` (sync) | Fast. Supports output_fields. |
| `openai/gpt-5.4` | Structured | Either | Supports both modes. |
| `anthropic/claude-sonnet-4.6` | Structured | Either | Supports both modes. |
| Any unknown model | Freeform | `Signaliz:custom_ai_prompt` (async) | Safe default. |

---

## Workflow

### Step 1: Understand the Research Question

Parse the user's request and identify:

1. **Topic** — What are we researching?
2. **Context** — Why do they need this? (sales prep, investment thesis,
   strategic planning, curiosity, content creation, etc.)
3. **Depth** — Quick scan (3-4 agents) or full swarm (6-8 agents)?
4. **Constraints** — Any specific angles they want covered or excluded?

If the request is vague, ask one clarifying question. If it's clear enough
to decompose, proceed immediately — don't over-interview.

### Step 2: Design the Agent Swarm

Based on the topic, select 5-8 specialized agent personas. Each agent is
defined by:

- **Role name** — e.g., "Market Analyst", "Technical Architect"
- **System prompt** — Expert persona + what to analyze
- **Exa search query** — Tailored web search to ground the agent's research

#### Agent Selection Framework

Pick agents from the relevant pool below, or create custom ones for the topic.
The goal is **maximum coverage with minimum overlap**.

**Business / GTM Topics:**
| Agent | Lens |
|-------|------|
| Market Analyst | Market size, growth, trends, TAM/SAM |
| Competitive Intel | Key players, positioning, differentiation |
| Buyer Persona Analyst | Who buys, why, what triggers purchase |
| Technology Analyst | Tech stack, architecture, build vs. buy |
| Financial Analyst | Revenue models, unit economics, funding |
| GTM Strategist | Go-to-market channels, motions, playbooks |
| Risk Analyst | Threats, headwinds, regulatory, disruption |
| Talent & Org Analyst | Hiring trends, org structure, culture signals |

**Technology / Product Topics:**
| Agent | Lens |
|-------|------|
| Technical Architect | Architecture, stack, scalability |
| Developer Experience | DX, docs, community, adoption friction |
| Security Analyst | Vulnerabilities, compliance, threat model |
| Performance Engineer | Benchmarks, latency, reliability |
| Integration Specialist | API ecosystem, interop, migration paths |
| Product Strategist | Roadmap, feature gaps, user feedback |
| Open Source Analyst | License, community health, fork risk |

**Industry / Market Topics:**
| Agent | Lens |
|-------|------|
| Industry Historian | Origins, evolution, key inflection points |
| Regulatory Analyst | Policy landscape, compliance requirements |
| Supply Chain Analyst | Upstream/downstream dynamics |
| Innovation Scout | Emerging tech, startups, patents, R&D |
| Customer Voice | User sentiment, reviews, community chatter |
| Macro Economist | Economic forces, interest rates, cycles |
| Geopolitical Analyst | Trade policy, sanctions, regional dynamics |

**Strategy / General Topics:**
| Agent | Lens |
|-------|------|
| Devil's Advocate | Counter-arguments, blind spots, failure modes |
| First Principles Thinker | Core assumptions, fundamentals |
| Futurist | 3-5 year projections, scenario planning |
| Practitioner | Hands-on experience, real-world constraints |
| Academic Researcher | Published literature, frameworks, evidence |

**Always include a Devil's Advocate agent** when researching strategy,
investment, or any decision-oriented topic.

### Step 3: Build the Swarm Input Records

Each agent becomes a record passed to Signaliz `custom_ai_prompt`. The
trick: every record contains the same `topic` field, but each has a unique
`agent_role` and `agent_instructions` field that shapes its perspective.

Build the records array:

```json
[
  {
    "topic": "The current state of AI-powered code generation tools",
    "agent_role": "Market Analyst",
    "agent_instructions": "Analyze the market size, growth trajectory, key segments, and adoption curves for AI code generation tools. Identify the TAM, current penetration, and projected growth through 2028."
  },
  {
    "topic": "The current state of AI-powered code generation tools",
    "agent_role": "Competitive Intel Analyst",
    "agent_instructions": "Map the competitive landscape: who are the major players, what are their positioning strategies, pricing models, and key differentiators? Identify emerging challengers."
  }
]
```

### Step 4: Execute the Swarm via Signaliz

**Choose your execution path based on the model (see compatibility table above).**

---

#### Path A: Freeform Mode (Grok Multi-Agent & non-tool-use models)

**Use `Signaliz:custom_ai_prompt` (async batch tool).** Do NOT use
`execute_primitive` — Grok's inference time will cause sync timeouts.

**Do NOT include `output_fields`.** Instead, embed structure instructions
directly in the system prompt:

```json
{
  "config": {
    "system_prompt": "You are a world-class research analyst operating as part of a multi-agent swarm. Your specific role is defined in the agent_role and agent_instructions fields. Produce a thorough, structured analysis from your expert perspective. Use concrete data, specific examples, and cite sources where possible. Be opinionated — don't hedge everything. Structure your output with clear headers and prioritize actionable insights. Write 400-800 words.\n\nAt the end of your analysis, include these clearly labeled sections:\n\n## Key Findings\n3-5 bullet points summarizing your most important discoveries.\n\n## Confidence Level\nState High, Medium, or Low with a one-sentence justification.\n\n## Sources Referenced\nList the key sources, data points, or evidence your analysis draws from.",
    "user_template": "## Research Topic\n{{topic}}\n\n## Your Role\n{{agent_role}}\n\n## Your Mission\n{{agent_instructions}}\n\nDeliver your expert analysis now.",
    "model": "x-ai/grok-4.20-multi-agent",
    "temperature": 0.4,
    "enable_exa_search": true,
    "exa_query_template": "{{topic}} {{agent_role}} analysis 2025 2026",
    "exa_num_results": 5
  },
  "records": [<agent records from Step 3>]
}
```

**Polling:** This returns a `job_id`. Poll with `check_job_status`:
- First poll after 15-20 seconds (Grok multi-agent is slower than other models)
- Use `page_size: 500`
- Grok may take 60-120 seconds total for 6 agents
- If still processing after 3 minutes, check `include_partial_results: true`

**Parsing freeform output:** Each result's `data` field will contain the
agent's analysis as a `response` text string (not structured fields). Parse
the `## Key Findings`, `## Confidence Level`, and `## Sources Referenced`
sections from the text. If the model doesn't follow the exact format, just
use the full text as the analysis — the synthesis step handles normalization.

---

#### Path B: Structured Mode (Gemini, GPT, Claude, etc.)

**Use `execute_primitive` for 1-25 agents (sync, fast):**

```json
{
  "capability_id": "custom_ai_prompt",
  "input_data": [<agent records from Step 3>],
  "config": {
    "system_prompt": "You are a world-class research analyst operating as part of a multi-agent swarm. Your specific role is defined in the agent_role and agent_instructions fields. Produce a thorough, structured analysis from your expert perspective. Use concrete data, specific examples, and cite sources where possible. Be opinionated — don't hedge everything. Structure your output with clear headers and prioritize actionable insights. Write 400-800 words.",
    "user_template": "## Research Topic\n{{topic}}\n\n## Your Role\n{{agent_role}}\n\n## Your Mission\n{{agent_instructions}}\n\nDeliver your expert analysis now.",
    "model": "google/gemini-2.5-flash",
    "temperature": 0.4,
    "enable_exa_search": true,
    "exa_query_template": "{{topic}} {{agent_role}} analysis 2025 2026",
    "exa_num_results": 5,
    "output_fields": [
      {"name": "analysis", "type": "text", "description": "The agent's full expert analysis"},
      {"name": "key_findings", "type": "text", "description": "3-5 bullet-point key findings"},
      {"name": "confidence", "type": "text", "description": "High/Medium/Low — how confident the agent is in its analysis"},
      {"name": "sources_referenced", "type": "text", "description": "Key sources or data points the analysis draws from"}
    ]
  }
}
```

**For 26+ agents:** Use `Signaliz:custom_ai_prompt` (async) with the same
config including `output_fields`. Poll with `check_job_status`.

---

### Step 5: Synthesize the Swarm Output

Once all agent results are returned, synthesize into a unified brief.

**Do NOT just concatenate agent outputs.** Instead:

1. **Read all agent analyses** — internalize each perspective
2. **Identify consensus** — where do multiple agents agree?
3. **Surface tensions** — where do agents disagree? These are the most
   valuable insights
4. **Extract actionable insights** — what should the user DO with this info?
5. **Flag blind spots** — what did the swarm NOT cover well?

### Step 6: Present the Research Brief

Use this output structure:

```
# 🐝 Swarm Research Brief: [Topic]

**Agents deployed:** [N] | **Model:** [model used] | **Mode:** [Freeform/Structured]
**Research depth:** [Quick Scan / Full Swarm / Deep Dive]

---

## Executive Summary
[3-5 sentences synthesizing the swarm's collective findings. Lead with the
single most important insight.]

## Key Findings

### 1. [Finding — stated as a declarative sentence]
[2-3 sentences of supporting evidence, citing which agent(s) surfaced this]

### 2. [Finding]
[Evidence]

### 3. [Finding]
[Evidence]

[... up to 5-7 key findings]

## Points of Tension
[Where agents disagreed — these are often the most strategically important
signals. Present both sides.]

## Agent Perspectives

### 🔍 [Agent Role 1]
**Confidence:** [High/Medium/Low]
**Key Findings:**
[Condensed version of agent's analysis — 3-5 sentences max]

### 🔍 [Agent Role 2]
...

[Repeat for each agent]

## Recommended Actions
Based on the swarm's collective analysis:
1. [Action item]
2. [Action item]
3. [Action item]

## Blind Spots & Limitations
- [What the swarm didn't cover well]
- [Areas that need human judgment or additional research]

## Sources
[Deduplicated list of key sources referenced across all agents]
```

### Step 7: Offer Follow-Up Paths

After presenting the brief, offer:

- **"Go deeper on any agent's perspective"** — re-run a single agent with
  a more specific prompt and more Exa results
- **"Add more agents"** — deploy additional specialist agents
- **"Turn this into a document"** — export as a `.docx` or `.md` file
- **"Research a related topic"** — pivot the swarm to an adjacent question

---

## Swarm Sizing Guide

| Depth Level | Agents | Credits | Best For |
|-------------|--------|---------|----------|
| Quick Scan | 3-4 | ~6-8 | Fast directional read |
| Standard | 5-6 | ~10-12 | Most research questions |
| Full Swarm | 7-8 | ~14-16 | Strategic decisions, investment thesis |
| Deep Dive | 8+ (multi-round) | ~20+ | Board-level briefings, major bets |

Default to **Standard (5-6 agents)** unless the user requests more depth
or the topic clearly warrants it.

---

## Credit Disclosure

Before executing, always tell the user the estimated cost:

```
🐝 Swarm Configuration
━━━━━━━━━━━━━━━━━━━━━
Topic:     [topic]
Agents:    [N] specialists
Model:     [model name]
Mode:      [Freeform / Structured]
Web search: Enabled (Exa)
Est. cost: ~[N × 2] credits

Ready to deploy the swarm? (y/n)
```

Wait for confirmation before executing.

---

## Error Handling

| Problem | Fix |
|---------|-----|
| All Signaliz tools fail | Disconnect/reconnect MCP (cold start) |
| `"No endpoints found that support tool use"` | **Model doesn't support tool use.** Switch to Freeform Mode: remove `output_fields` and use async `Signaliz:custom_ai_prompt`. See Path A. |
| Model not in `list_enabled_models` | Ask user to enable it in Signaliz workspace AI settings |
| `execute_primitive` times out | Model too slow for sync. Switch to async `Signaliz:custom_ai_prompt`. |
| Agent returns empty analysis | Re-run that single agent with a more specific prompt |
| Exa search returns irrelevant results | Customize `exa_query_template` per agent for better grounding |
| Partial results (some agents fail) | Present what you have, offer to re-run failures |
| Async job stuck at 0% for >60s | Normal for Grok multi-agent. Wait up to 3 min before concern. |
| All agents fail with same error | Model-level issue. Fall back to next model in chain. |

### Fallback Chain

If the preferred model fails, fall back in this order:
1. `x-ai/grok-4.20-multi-agent` (Freeform Mode) — preferred for depth
2. `openai/gpt-5.4` (Structured Mode) — strong alternative
3. `anthropic/claude-sonnet-4.6` (Structured Mode) — reliable fallback
4. `google/gemini-2.5-flash` (Structured Mode) — fast, always works

---

## Example Sessions

### Example 1 — Market Research (Grok Freeform)

**User:** "Research the current state of the AI agent framework market"

1. Design swarm: Market Analyst, Competitive Intel, Developer Experience,
   Technical Architect, Futurist, Devil's Advocate (6 agents)
2. Build records with topic + per-agent instructions
3. Execute via `Signaliz:custom_ai_prompt` (async, freeform, no output_fields)
   with `x-ai/grok-4.20-multi-agent` + Exa
4. Poll `check_job_status` until complete (~60-90s)
5. Parse freeform text responses from each agent
6. Synthesize into brief
7. Present brief + offer follow-ups

### Example 2 — Strategy Analysis (Structured Mode)

**User:** "Should we build our own email infrastructure or keep using Instantly?"

1. Design swarm: Cost Analyst, Technical Architect, Risk Analyst,
   Practitioner, Devil's Advocate, Regulatory Analyst (6 agents)
2. Execute via `execute_primitive` with `google/gemini-2.5-flash` +
   `output_fields` for structured extraction
3. Synthesize: cost projections, technical complexity, deliverability risks
4. Present with clear recommendation + conditions where it flips

### Example 3 — Topic Deep Dive (Grok Freeform)

**User:** "Give me a full briefing on DMARC, DKIM, and SPF"

1. Design swarm: Technical Architect, Security Analyst, Practitioner,
   Industry Historian, Deliverability Expert (5 agents)
2. Execute via async `Signaliz:custom_ai_prompt` with Grok multi-agent
3. Poll for results (Grok may take 60-120s)
4. Synthesize into educational brief
5. Offer to generate a reference doc

### Example 4 — Competitive Intel (Structured Mode, fast)

**User:** "Quick scan on Clay vs. alternatives"

1. Design swarm: Product Analyst, Pricing Analyst, Customer Voice,
   Innovation Scout (4 agents — Quick Scan)
2. Execute via `execute_primitive` with `google/gemini-2.5-flash` for speed
3. Structured output fields for clean extraction
4. Synthesize into comparison brief

---

## Advanced: Multi-Round Swarms

For complex topics, run the swarm in rounds:

**Round 1 — Landscape Scan** (5-6 agents, broad)
Synthesize findings, identify the 2-3 most important sub-questions.

**Round 2 — Deep Dive** (3-4 agents, focused on sub-questions)
Each agent goes deeper on a specific thread from Round 1.

**Round 3 — Synthesis & Recommendation** (1-2 agents: Strategist + Devil's Advocate)
Final synthesis incorporating all prior rounds.

This is expensive (~20+ credits) — only suggest for high-stakes research
or when the user explicitly requests maximum depth.

---

## Signaliz Feature Request (Tracked)

**Freeform fallback for `custom_ai_prompt`:** When a model doesn't support
tool use, Signaliz should automatically drop `output_fields` and embed
field extraction instructions in the system prompt as text, then parse the
response server-side. This would make Grok and other non-tool-use models
work transparently without the caller needing to know about tool use
compatibility. Until this ships, use the Freeform Mode instructions above.
