import { parse as parseYamlText } from "https://deno.land/std@0.208.0/yaml/mod.ts";

export type SpecCadence = "hourly" | "daily" | "weekly" | "event_driven";
export type RuntimeSinkType = "csv" | "webhook" | "airbyte";

export interface OpSpec {
  slug: string;
  name: string;
  goal: string;
  cadence: SpecCadence;
  budget?: { credits_per_tick?: number };
  sinks?: Array<{ type: RuntimeSinkType; config?: Record<string, unknown> }>;
  learning?: {
    auto_tuning?: "off" | "conservative" | "aggressive";
    judge_threshold?: number;
    experiment_budget_pct?: number;
  };
  icp?: {
    titles?: string[];
    industries?: string[];
    employee_range?: [number, number];
  };
  signals?: string[];
  triggers?: Array<{ event_type: string; match_rules?: Record<string, unknown> }>;
}

export interface SignalizYaml {
  version: "v1";
  ops: OpSpec[];
  delete_if_absent: boolean;
}

export interface ParseResult {
  ok: boolean;
  parsed?: SignalizYaml;
  errors: string[];
  warnings: string[];
}

export type ActionType = "create" | "update" | "no_change" | "delete";

export interface Action {
  type: ActionType;
  slug: string;
  diff?: Record<string, { from: unknown; to: unknown }>;
  warnings?: string[];
  routine_id?: string;
  desired?: OpSpec;
}

export interface ExistingRoutine {
  id: string;
  slug: string;
  spec: OpSpec;
}

const VALID_CADENCE = new Set(["hourly", "daily", "weekly", "event_driven"]);
const VALID_RUNTIME_SINK = new Set(["csv", "webhook", "airbyte"]);
const KNOWN_NOT_RUNTIME_READY = new Set(["instantly"]);
const VALID_TUNING = new Set(["off", "conservative", "aggressive"]);
const EVENT_TYPE_PATTERN = /^[a-zA-Z0-9_.:-]{1,128}$/;

function stringConfig(config: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function normalizeAirbyteConfig(config: Record<string, unknown>): Record<string, unknown> {
  const sourceId = stringConfig(config, ["airbyte_source_id", "source_id", "sourceId"]);
  const destinationId = stringConfig(config, ["airbyte_destination_id", "destination_id", "destinationId"]);
  const normalized = { ...config };

  for (const key of ["api_token", "access_token", "bearer_token", "token", "password", "client_secret"]) {
    delete normalized[key];
  }

  if (!sourceId || !destinationId) return normalized;

  delete normalized.airbyte_connection_id;
  delete normalized.connection_id;
  delete normalized.connectionId;
  normalized.source_id = sourceId;
  normalized.destination_id = destinationId;
  return normalized;
}

export function parseYaml(text: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: any;

  try {
    raw = parseYamlText(text ?? "");
  } catch (err: any) {
    return { ok: false, errors: [`YAML parse error: ${err?.message ?? err}`], warnings };
  }

  if (raw == null || typeof raw !== "object") {
    return { ok: false, errors: ["Empty or invalid YAML root"], warnings };
  }

  if (raw.version !== "v1") {
    errors.push(`Unsupported version: expected "v1", got ${JSON.stringify(raw.version)}`);
  }

  const opsRaw = raw.ops;
  if (!Array.isArray(opsRaw)) {
    errors.push("`ops` must be an array");
    return { ok: false, errors, warnings };
  }

  const ops: OpSpec[] = [];
  const seenSlugs = new Set<string>();

  opsRaw.forEach((op: any, idx: number) => {
    const at = `ops[${idx}]`;
    if (!op || typeof op !== "object") {
      errors.push(`${at} must be an object`);
      return;
    }

    if (typeof op.slug !== "string" || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(op.slug)) {
      errors.push(`${at}.slug must be kebab-case (a-z0-9-)`);
      return;
    }

    if (seenSlugs.has(op.slug)) {
      errors.push(`${at}.slug duplicate: ${op.slug}`);
      return;
    }
    seenSlugs.add(op.slug);

    if (typeof op.name !== "string" || !op.name.trim()) {
      errors.push(`${at}.name required`);
    }

    if (typeof op.goal !== "string" || op.goal.length < 20 || op.goal.length > 2000) {
      errors.push(`${at}.goal must be 20-2000 chars`);
    }

    if (!VALID_CADENCE.has(op.cadence)) {
      errors.push(`${at}.cadence must be one of ${[...VALID_CADENCE].join("|")}`);
    }

    const sinks: OpSpec["sinks"] = [];
    if (op.sinks !== undefined) {
      if (!Array.isArray(op.sinks)) {
        errors.push(`${at}.sinks must be an array`);
      } else {
        op.sinks.forEach((sink: any, sinkIdx: number) => {
          const sinkAt = `${at}.sinks[${sinkIdx}]`;
          const type = String(sink?.type ?? "");
          if (KNOWN_NOT_RUNTIME_READY.has(type)) {
            errors.push(
              `${sinkAt}.type "${type}" is not supported by the Ops delivery runtime yet. Use csv/webhook, or route this destination through a webhook until native delivery is deployed.`,
            );
            return;
          }
          if (!VALID_RUNTIME_SINK.has(type)) {
            errors.push(`${sinkAt}.type must be one of ${[...VALID_RUNTIME_SINK].join("|")}`);
            return;
          }

          const config = sink?.config && typeof sink.config === "object" ? sink.config : {};
          if (type === "airbyte") {
            const connectionId = stringConfig(config, ["airbyte_connection_id", "connection_id", "connectionId"]);
            const sourceId = stringConfig(config, ["airbyte_source_id", "source_id", "sourceId"]);
            const destinationId = stringConfig(config, ["airbyte_destination_id", "destination_id", "destinationId"]);
            if (!connectionId && (!sourceId || !destinationId)) {
              errors.push(
                `${sinkAt}.config.connection_id or both source_id and destination_id are required for Airbyte sinks`,
              );
              return;
            }
          }

          sinks.push({
            type: type as RuntimeSinkType,
            config,
          });
        });
      }
    }

    const triggers: OpSpec["triggers"] = [];
    if (op.triggers !== undefined) {
      if (!Array.isArray(op.triggers)) {
        errors.push(`${at}.triggers must be an array`);
      } else {
        op.triggers.forEach((trigger: any, triggerIdx: number) => {
          const triggerAt = `${at}.triggers[${triggerIdx}]`;
          if (!trigger || typeof trigger !== "object") {
            errors.push(`${triggerAt} must be an object`);
            return;
          }
          if (typeof trigger.event_type !== "string" || !EVENT_TYPE_PATTERN.test(trigger.event_type)) {
            errors.push(`${triggerAt}.event_type must match ${EVENT_TYPE_PATTERN}`);
            return;
          }
          triggers.push({
            event_type: trigger.event_type,
            match_rules: trigger.match_rules && typeof trigger.match_rules === "object" ? trigger.match_rules : undefined,
          });
        });
      }
    }

    if (op.cadence === "event_driven" && triggers.length === 0) {
      errors.push(`${at}.cadence event_driven requires at least one trigger.event_type`);
    }

    if (op.learning?.auto_tuning && !VALID_TUNING.has(op.learning.auto_tuning)) {
      errors.push(`${at}.learning.auto_tuning invalid`);
    }

    if (op.learning?.judge_threshold !== undefined) {
      const threshold = Number(op.learning.judge_threshold);
      if (!(threshold >= 0 && threshold <= 1)) {
        errors.push(`${at}.learning.judge_threshold must be 0-1`);
      }
    }

    if (op.learning?.experiment_budget_pct !== undefined) {
      const pct = Number(op.learning.experiment_budget_pct);
      if (!(pct >= 0 && pct <= 100)) {
        errors.push(`${at}.learning.experiment_budget_pct must be 0-100`);
      }
    }

    ops.push({
      slug: op.slug,
      name: op.name,
      goal: op.goal,
      cadence: op.cadence,
      budget: op.budget,
      sinks,
      learning: op.learning,
      icp: op.icp,
      signals: op.signals,
      triggers,
    });
  });

  if (errors.length) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    parsed: {
      version: "v1",
      ops,
      delete_if_absent: Boolean(raw.delete_if_absent),
    },
    errors,
    warnings,
  };
}

export function normalizeForDiff(op: OpSpec): Record<string, unknown> {
  return {
    slug: op.slug,
    name: op.name,
    goal: op.goal,
    cadence: op.cadence,
    budget: { credits_per_tick: op.budget?.credits_per_tick ?? null },
    sinks: (op.sinks ?? [])
      .map((sink) => ({
        type: sink.type,
        config: sink.type === "airbyte" ? normalizeAirbyteConfig(sink.config ?? {}) : sink.config ?? {},
      }))
      .sort((a, b) => (a.type + JSON.stringify(a.config)).localeCompare(b.type + JSON.stringify(b.config))),
    learning: {
      auto_tuning: op.learning?.auto_tuning ?? "off",
      judge_threshold: op.learning?.judge_threshold ?? 0.6,
      experiment_budget_pct: op.learning?.experiment_budget_pct ?? 0,
    },
    icp: {
      titles: [...(op.icp?.titles ?? [])].sort(),
      industries: [...(op.icp?.industries ?? [])].sort(),
      employee_range: op.icp?.employee_range ?? [0, 0],
    },
    signals: [...(op.signals ?? [])].sort(),
    triggers: [...(op.triggers ?? [])].sort((a, b) => a.event_type.localeCompare(b.event_type)),
  };
}

function shallowDiff(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);

  for (const key of keys) {
    if (key === "slug") continue;
    if (JSON.stringify(from[key]) !== JSON.stringify(to[key])) {
      diff[key] = { from: from[key], to: to[key] };
    }
  }

  return diff;
}

export function reconcile(desired: SignalizYaml, existing: ExistingRoutine[]): Action[] {
  const actions: Action[] = [];
  const desiredBySlug = new Map(desired.ops.map((op) => [op.slug, op]));
  const existingBySlug = new Map(existing.map((routine) => [routine.slug, routine]));

  for (const op of desired.ops) {
    const current = existingBySlug.get(op.slug);
    if (!current) {
      actions.push({ type: "create", slug: op.slug, desired: op });
      continue;
    }

    const diff = shallowDiff(normalizeForDiff(current.spec), normalizeForDiff(op));
    if (Object.keys(diff).length === 0) {
      actions.push({ type: "no_change", slug: op.slug, routine_id: current.id });
    } else {
      actions.push({ type: "update", slug: op.slug, routine_id: current.id, diff, desired: op });
    }
  }

  if (desired.delete_if_absent) {
    for (const routine of existing) {
      if (!desiredBySlug.has(routine.slug)) {
        actions.push({ type: "delete", slug: routine.slug, routine_id: routine.id });
      }
    }
  }

  return actions;
}

export async function planHash(actions: Action[]): Promise<string> {
  const canonical = actions
    .map((action) => ({
      type: action.type,
      slug: action.slug,
      diffKeys: Object.keys(action.diff ?? {}).sort(),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const buffer = new TextEncoder().encode(JSON.stringify(canonical));
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function rowToOpSpec(row: any): OpSpec {
  const policy = row.policy && typeof row.policy === "object" ? row.policy : {};
  const triggers = Array.isArray(policy.triggers) ? policy.triggers : [];
  const rowCadence = String(row.cadence ?? "daily");
  const cadence = rowCadence === "manual" && triggers.length > 0
    ? "event_driven"
    : VALID_CADENCE.has(rowCadence)
    ? (rowCadence as SpecCadence)
    : "daily";

  const outputSinks = Array.isArray(row.output_sinks)
    ? row.output_sinks.map((sink: any) => {
      const config = sink?.config && typeof sink.config === "object" ? sink.config : {};
      if (sink?.type === "webhook" && config.delivery_mode === "airbyte") {
        return {
          type: "airbyte",
          config: config.airbyte_config ?? {
            connection_id: config.airbyte_connection_id,
          },
        };
      }

      return {
        type: sink?.type,
        config,
      };
    })
    : Array.isArray(policy.sinks)
    ? policy.sinks
    : [];

  return {
    slug: String(policy.slug ?? row.id),
    name: String(row.name ?? ""),
    goal: String(row.goal ?? ""),
    cadence,
    budget: { credits_per_tick: policy.budget?.credits_per_tick },
    sinks: outputSinks,
    learning: row.learning_config ?? policy.learning ?? {},
    icp: policy.icp_config ?? policy.icp ?? {},
    signals: Array.isArray(policy.signals) ? policy.signals : [],
    triggers,
  };
}
