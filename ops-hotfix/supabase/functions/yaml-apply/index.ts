import {
  errorResponse,
  getServiceClient,
  handleCors,
  json,
  requireAuth,
  requireWorkspaceAdmin,
} from "../_shared/ops-edge-common.ts";
import {
  parseYaml,
  planHash,
  reconcile,
  rowToOpSpec,
  type Action,
  type ExistingRoutine,
  type OpSpec,
} from "../_shared/signaliz-yaml-runtime.ts";

type SupabaseLike = ReturnType<typeof getServiceClient>;

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function stableBridgeToken(workspaceId: string, sinkSlug: string): Promise<string> {
  const secret = Deno.env.get("AIRBYTE_BRIDGE_TOKEN_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) {
    throw new Error("Missing AIRBYTE_BRIDGE_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY");
  }

  return hmacSha256Hex(secret, `airbyte:${workspaceId}:${sinkSlug}`);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function configString(config: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = stringValue(config[key]);
    if (value) return value;
  }

  return "";
}

function redactAirbyteConfig(config: Record<string, unknown>) {
  const redacted = { ...config };
  for (const key of ["api_token", "access_token", "bearer_token", "token", "password", "client_secret"]) {
    if (key in redacted) redacted[key] = "[redacted]";
  }
  return redacted;
}

async function getConnectorToken(supabase: SupabaseLike, connectorId: string | null): Promise<string | null> {
  if (!connectorId) return null;

  const { data, error } = await supabase
    .from("dataplane_connectors")
    .select("credentials")
    .eq("id", connectorId)
    .maybeSingle();

  if (error) throw error;

  const credentials = recordValue(data?.credentials) ?? {};
  const token = configString(credentials, ["api_token", "access_token", "bearer_token", "token"]);
  return token || null;
}

async function getAirbyteApiToken(
  supabase: SupabaseLike,
  config: Record<string, unknown>,
  connectorId: string | null,
): Promise<string | null> {
  return configString(config, ["api_token", "access_token", "bearer_token", "token"])
    || await getConnectorToken(supabase, connectorId)
    || Deno.env.get("AIRBYTE_API_TOKEN")
    || null;
}

function shouldUseExistingAirbyteConnection(
  existing: { airbyte_connection_id?: string | null; config?: unknown } | null,
  sourceId: string,
  destinationId: string,
): string {
  const connectionId = stringValue(existing?.airbyte_connection_id);
  if (!connectionId) return "";

  const existingConfig = recordValue(existing?.config) ?? {};
  const existingSourceId = configString(existingConfig, ["airbyte_source_id", "source_id", "sourceId"]);
  const existingDestinationId = configString(existingConfig, [
    "airbyte_destination_id",
    "destination_id",
    "destinationId",
  ]);

  if (sourceId && destinationId) {
    return existingSourceId === sourceId && existingDestinationId === destinationId
      ? connectionId
      : "";
  }

  return connectionId;
}

function buildAirbyteConnectionPayload(
  config: Record<string, unknown>,
  desired: OpSpec,
  sourceId: string,
  destinationId: string,
) {
  const payload: Record<string, unknown> = {
    sourceId,
    destinationId,
  };

  const name = configString(config, ["connection_name", "airbyte_connection_name", "name"]);
  if (name) payload.name = name;
  else payload.name = `${desired.name} Airbyte`;

  const configurations = recordValue(config.configurations);
  if (configurations) payload.configurations = configurations;

  const schedule = recordValue(config.schedule);
  if (schedule) payload.schedule = schedule;

  for (const key of [
    "dataResidency",
    "namespaceDefinition",
    "namespaceFormat",
    "prefix",
    "nonBreakingSchemaUpdatesBehavior",
    "status",
  ]) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) payload[key] = value.trim();
  }

  const snakeToCamel: Record<string, string> = {
    data_residency: "dataResidency",
    namespace_definition: "namespaceDefinition",
    namespace_format: "namespaceFormat",
    non_breaking_schema_updates_behavior: "nonBreakingSchemaUpdatesBehavior",
  };

  for (const [sourceKey, targetKey] of Object.entries(snakeToCamel)) {
    const value = config[sourceKey];
    if (payload[targetKey] === undefined && typeof value === "string" && value.trim()) {
      payload[targetKey] = value.trim();
    }
  }

  return payload;
}

async function createAirbyteConnection(
  apiBaseUrl: string,
  apiToken: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const base = apiBaseUrl.replace(/\/+$/, "") || "https://api.airbyte.com/v1";
  const response = await fetch(`${base}/connections`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const message = body?.message ?? body?.error ?? body?.raw ?? `Airbyte API error ${response.status}`;
    throw new Error(`Airbyte connection creation failed: ${String(message)}`);
  }

  const connectionId = body?.connectionId ?? body?.connection?.connectionId ?? body?.connection?.id ?? body?.id;
  if (typeof connectionId !== "string" || !connectionId.trim()) {
    throw new Error("Airbyte connection creation succeeded but the response did not include a connection id");
  }

  return connectionId.trim();
}

async function upsertAirbyteSink(
  supabase: SupabaseLike,
  workspaceId: string,
  desired: OpSpec,
  sink: NonNullable<OpSpec["sinks"]>[number],
  sinkIndex: number,
  routineId?: string,
) {
  const config = sink.config ?? {};
  const airbyteConnectorId = configString(config, ["airbyte_connector_id", "connector_id"]) || null;
  const apiBaseUrl = configString(config, ["api_base_url", "api_base"]) || "https://api.airbyte.com/v1";
  const streamName = stringValue(config.stream_name) || "signaliz_ops_items";
  const sinkSlug = `${desired.slug}:airbyte:${sinkIndex}`;
  const token = await stableBridgeToken(workspaceId, sinkSlug);
  const tokenHash = await sha256Hex(token);

  const { data: existing, error: existingError } = await supabase
    .from("ops_airbyte_sinks")
    .select("id, airbyte_connection_id, config")
    .eq("workspace_id", workspaceId)
    .eq("slug", sinkSlug)
    .maybeSingle();

  if (existingError) throw existingError;

  const sourceId = configString(config, ["airbyte_source_id", "source_id", "sourceId"]);
  const destinationId = configString(config, ["airbyte_destination_id", "destination_id", "destinationId"]);
  let airbyteConnectionId = configString(config, ["airbyte_connection_id", "connection_id", "connectionId"]);

  if (!airbyteConnectionId) {
    airbyteConnectionId = shouldUseExistingAirbyteConnection(existing, sourceId, destinationId);
  }

  if (!airbyteConnectionId && sourceId && destinationId) {
    const apiToken = await getAirbyteApiToken(supabase, config, airbyteConnectorId);
    if (!apiToken) {
      throw new Error(
        "Airbyte connection creation requires an API token. Set sink config.api_token, an Airbyte dataplane connector credential, or AIRBYTE_API_TOKEN.",
      );
    }

    airbyteConnectionId = await createAirbyteConnection(
      apiBaseUrl,
      apiToken,
      buildAirbyteConnectionPayload(config, desired, sourceId, destinationId),
    );
  }

  if (!airbyteConnectionId) {
    throw new Error("Airbyte sinks require config.connection_id or config.source_id plus config.destination_id");
  }

  const redactedConfig = redactAirbyteConfig({
    ...config,
    connection_id: airbyteConnectionId,
    source_id: sourceId || undefined,
    destination_id: destinationId || undefined,
    api_base_url: apiBaseUrl,
    stream_name: streamName,
  });

  const values = {
    workspace_id: workspaceId,
    routine_id: routineId ?? null,
    slug: sinkSlug,
    name: stringValue(config.name) || `${desired.name} Airbyte`,
    airbyte_connection_id: airbyteConnectionId,
    airbyte_connector_id: airbyteConnectorId,
    api_base_url: apiBaseUrl,
    stream_name: streamName,
    config: {
      ...config,
      airbyte_connection_id: airbyteConnectionId,
      source_id: sourceId || undefined,
      destination_id: destinationId || undefined,
      api_base_url: apiBaseUrl,
      stream_name: streamName,
    },
    redacted_config: redactedConfig,
    token_hash: tokenHash,
    status: "active",
    updated_at: new Date().toISOString(),
  };

  const query = existing?.id
    ? supabase.from("ops_airbyte_sinks").update(values).eq("id", existing.id)
    : supabase.from("ops_airbyte_sinks").insert(values);

  const { data, error } = await query.select("id").single();
  if (error) throw error;

  const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  if (!baseUrl) throw new Error("Missing SUPABASE_URL");

  const bridgeUrl = `${baseUrl}/functions/v1/ops-airbyte-delivery?sink_id=${data.id}&token=${token}`;

  return {
    sinkId: data.id as string,
    token,
    webhookSink: {
      type: "webhook",
      enabled: true,
      config: {
        webhook_url: bridgeUrl,
        delivery_mode: "airbyte",
        airbyte_sink_id: data.id,
        airbyte_connection_id: airbyteConnectionId,
        airbyte_config: redactedConfig,
        source_url: bridgeUrl,
      },
    },
  };
}

async function buildRoutinePayload(
  supabase: SupabaseLike,
  workspaceId: string,
  desired: NonNullable<Action["desired"]>,
  routineId?: string,
) {
  const triggerEventTypes = (desired.triggers ?? [])
    .map((trigger) => trigger.event_type)
    .filter((eventType): eventType is string => typeof eventType === "string" && eventType.length > 0);

  const runtimeCadence = desired.cadence === "event_driven" ? "manual" : desired.cadence;
  const outputSinks = [];
  const airbyteSinkIds: string[] = [];

  for (let i = 0; i < (desired.sinks ?? []).length; i++) {
    const sink = desired.sinks![i];
    if (sink.type === "airbyte") {
      const compiled = await upsertAirbyteSink(supabase, workspaceId, desired, sink, i, routineId);
      outputSinks.push(compiled.webhookSink);
      airbyteSinkIds.push(compiled.sinkId);
    } else {
      outputSinks.push(sink);
    }
  }

  return {
    airbyteSinkIds,
    payload: {
    name: desired.name,
    goal: desired.goal,
    cadence: runtimeCadence,
    output_sinks: outputSinks,
    wake_on_events: triggerEventTypes,
    learning_config: desired.learning ?? {},
    policy: {
      slug: desired.slug,
      budget: desired.budget ?? {},
      icp_config: desired.icp ?? {},
      signals: desired.signals ?? [],
      triggers: desired.triggers ?? [],
      sinks: desired.sinks ?? [],
      learning: desired.learning ?? {},
      spec_cadence: desired.cadence,
    },
    },
  };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await requireAuth(req);
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const yamlText = String(body.yaml_text ?? "");
    const workspaceId = String(body.workspace_id ?? req.headers.get("x-workspace-id") ?? "");
    const confirm = Boolean(body.confirm);
    const clientHash = req.headers.get("X-Signaliz-Plan-Hash") ?? req.headers.get("x-signaliz-plan-hash");

    if (!workspaceId) {
      return json({ success: false, error: "workspace_id required" }, 400);
    }

    await requireWorkspaceAdmin(supabase, auth.user.id, workspaceId);

    const parsed = parseYaml(yamlText);
    if (!parsed.ok || !parsed.parsed) {
      return json(
        { success: false, actions: [], errors: parsed.errors, warnings: parsed.warnings },
        400,
      );
    }

    const { data: routines, error: routineError } = await supabase
      .from("gtm_routines")
      .select("id, name, goal, cadence, policy, output_sinks, learning_config, status")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived");

    if (routineError) throw routineError;

    const existing: ExistingRoutine[] = (routines ?? []).map((routine) => ({
      id: routine.id,
      slug: rowToOpSpec(routine).slug,
      spec: rowToOpSpec(routine),
    }));

    const actions = reconcile(parsed.parsed, existing);
    const hash = await planHash(actions);

    if (clientHash && clientHash !== hash) {
      return json({ success: false, error: "drift_detected", server_plan_hash: hash, actions }, 409);
    }

    if (!confirm) {
      return json({
        success: true,
        applied: 0,
        failed: 0,
        actions,
        plan_hash: hash,
        errors: parsed.errors,
        warnings: parsed.warnings,
      });
    }

    const details: Array<{ slug: string; action: string; status: "ok" | "error"; error?: string }> = [];
    let applied = 0;
    let failed = 0;

    for (const action of actions) {
      try {
        if (action.type === "no_change") {
          details.push({ slug: action.slug, action: action.type, status: "ok" });
          continue;
        }

        if (action.type === "create" && action.desired) {
          const built = await buildRoutinePayload(supabase, workspaceId, action.desired);
          const { data, error } = await supabase.functions.invoke("gtm-routines", {
            body: { action: "create", workspace_id: workspaceId, ...built.payload },
            headers: { Authorization: auth.authHeader },
          });
          if (error) throw new Error(error.message ?? String(error));
          if (data?.success === false) throw new Error(data.error ?? "gtm-routines rejected create");

          const routineId = data?.routine?.id;
          if (routineId && built.airbyteSinkIds.length > 0) {
            const { error: linkError } = await supabase
              .from("ops_airbyte_sinks")
              .update({ routine_id: routineId, updated_at: new Date().toISOString() })
              .in("id", built.airbyteSinkIds);
            if (linkError) throw linkError;
          }
        } else if (action.type === "update" && action.desired && action.routine_id) {
          const built = await buildRoutinePayload(supabase, workspaceId, action.desired, action.routine_id);
          const { data, error } = await supabase.functions.invoke("gtm-routines", {
            body: {
              action: "update",
              workspace_id: workspaceId,
              id: action.routine_id,
              ...built.payload,
            },
            headers: { Authorization: auth.authHeader },
          });
          if (error) throw new Error(error.message ?? String(error));
          if (data?.success === false) throw new Error(data.error ?? "gtm-routines rejected update");
        } else if (action.type === "delete" && action.routine_id) {
          const { data, error } = await supabase.functions.invoke("gtm-routines", {
            body: { action: "archive", workspace_id: workspaceId, id: action.routine_id },
            headers: { Authorization: auth.authHeader },
          });
          if (error) throw new Error(error.message ?? String(error));
          if (data?.success === false) throw new Error(data.error ?? "gtm-routines rejected archive");
        }

        details.push({ slug: action.slug, action: action.type, status: "ok" });
        applied++;
      } catch (err: any) {
        failed++;
        details.push({
          slug: action.slug,
          action: action.type,
          status: "error",
          error: err?.message ?? String(err),
        });
      }
    }

    return json({
      success: failed === 0,
      applied,
      failed,
      details,
      plan_hash: hash,
      warnings: parsed.warnings,
    });
  } catch (err) {
    console.error("[yaml-apply] error", err);
    return errorResponse(err);
  }
});
