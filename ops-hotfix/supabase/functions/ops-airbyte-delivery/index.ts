import {
  getServiceClient,
  handleCors,
  json,
} from "../_shared/ops-edge-common.ts";

type JsonRecord = Record<string, unknown>;

const DEFAULT_AIRBYTE_API_BASE = "https://api.airbyte.com/v1";

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeRecords(body: any): JsonRecord[] {
  const candidate = Array.isArray(body)
    ? body
    : Array.isArray(body?.items)
    ? body.items
    : Array.isArray(body?.records)
    ? body.records
    : Array.isArray(body?.rows)
    ? body.rows
    : Array.isArray(body?.data)
    ? body.data
    : body?.item_data
    ? [body]
    : [];

  return candidate
    .filter((item: unknown) => item && typeof item === "object")
    .map((item: any) => {
      if (item.item_data && typeof item.item_data === "object") return item.item_data as JsonRecord;
      if (item.record && typeof item.record === "object") return item.record as JsonRecord;
      return item as JsonRecord;
    });
}

function extractSubjectKey(item: JsonRecord): string | null {
  const subject = item.subject_key ?? item.domain ?? item.email ?? item.company_domain ?? item.id;
  return typeof subject === "string" && subject.trim() ? subject.trim() : null;
}

function extractTickId(body: any): string | null {
  const tickId = body?.tick_id ?? body?.tick?.id ?? body?.metadata?.tick_id;
  return typeof tickId === "string" && tickId ? tickId : null;
}

async function getConnectorToken(connectorId: string | null): Promise<string | null> {
  if (!connectorId) return null;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("dataplane_connectors")
    .select("credentials")
    .eq("id", connectorId)
    .maybeSingle();

  if (error) throw error;

  const credentials = data?.credentials && typeof data.credentials === "object"
    ? data.credentials as JsonRecord
    : {};

  const token = credentials.api_token ?? credentials.access_token ?? credentials.bearer_token ?? credentials.token;
  return typeof token === "string" && token ? token : null;
}

async function triggerAirbyteSync(
  apiBaseUrl: string,
  apiToken: string,
  connectionId: string,
): Promise<{ jobId?: string; status?: string; response: unknown }> {
  const base = apiBaseUrl.replace(/\/+$/, "") || DEFAULT_AIRBYTE_API_BASE;
  const response = await fetch(`${base}/jobs`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      connectionId,
      jobType: "sync",
    }),
  });

  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.message ?? payload?.error ?? `Airbyte API error ${response.status}`;
    throw new Error(String(message));
  }

  const job = payload.job ?? payload;
  const jobId = job?.id ?? payload?.jobId ?? payload?.id;
  const status = job?.status ?? payload?.status ?? "created";

  return {
    jobId: jobId == null ? undefined : String(jobId),
    status: String(status),
    response: payload,
  };
}

async function handleSourceRead(url: URL, sink: any) {
  const supabase = getServiceClient();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "1000") || 1000, 5000);
  const after = url.searchParams.get("after");

  let query = supabase
    .from("ops_airbyte_records")
    .select("id, subject_key, record, created_at")
    .eq("sink_id", sink.id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (after) query = query.gt("created_at", after);

  const { data, error } = await query;
  if (error) throw error;

  const records = (data ?? []).map((row: any) => ({
    _signaliz_record_id: row.id,
    _signaliz_subject_key: row.subject_key,
    _signaliz_created_at: row.created_at,
    ...((row.record && typeof row.record === "object") ? row.record : {}),
  }));

  return json({
    success: true,
    sink_id: sink.id,
    stream: sink.stream_name,
    records,
    next_after: data?.length ? data[data.length - 1].created_at : after,
  });
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const supabase = getServiceClient();
  const url = new URL(req.url);
  const sinkId = url.searchParams.get("sink_id") ?? "";
  const token = url.searchParams.get("token") ?? "";

  try {
    if (!sinkId || !token) {
      return json({ success: false, error: "sink_id and token are required" }, 401);
    }

    const tokenHash = await sha256Hex(token);
    const { data: sink, error: sinkError } = await supabase
      .from("ops_airbyte_sinks")
      .select("*")
      .eq("id", sinkId)
      .eq("token_hash", tokenHash)
      .neq("status", "archived")
      .maybeSingle();

    if (sinkError) throw sinkError;
    if (!sink) return json({ success: false, error: "invalid Airbyte sink token" }, 401);
    if (sink.status !== "active") {
      return json({ success: false, error: "Airbyte sink is not active" }, 409);
    }

    if (req.method === "GET") {
      return await handleSourceRead(url, sink);
    }

    if (req.method !== "POST") {
      return json({ success: false, error: "method not allowed" }, 405);
    }

    const body = await req.json().catch(() => ({}));
    const records = normalizeRecords(body);
    const tickId = extractTickId(body);
    const routineId = typeof body?.routine_id === "string" ? body.routine_id : sink.routine_id;

    const { data: batch, error: batchError } = await supabase
      .from("ops_airbyte_batches")
      .insert({
        sink_id: sink.id,
        workspace_id: sink.workspace_id,
        routine_id: routineId ?? null,
        tick_id: tickId,
        item_count: records.length,
        status: "received",
        payload_snapshot: body && typeof body === "object" ? body : {},
      })
      .select()
      .single();

    if (batchError) throw batchError;

    if (records.length > 0) {
      const rows = records.map((record) => ({
        batch_id: batch.id,
        sink_id: sink.id,
        workspace_id: sink.workspace_id,
        routine_id: routineId ?? null,
        tick_id: tickId,
        subject_key: extractSubjectKey(record),
        record,
      }));
      const { error: recordError } = await supabase.from("ops_airbyte_records").insert(rows);
      if (recordError) throw recordError;
    }

    const config = sink.config && typeof sink.config === "object" ? sink.config as JsonRecord : {};
    const apiToken = typeof config.api_token === "string" && config.api_token
      ? config.api_token
      : await getConnectorToken(sink.airbyte_connector_id)
      ?? Deno.env.get("AIRBYTE_API_TOKEN")
      ?? null;

    if (!apiToken) {
      const error = "Airbyte API token not configured. Set sink config.api_token, an Airbyte dataplane connector credential, or AIRBYTE_API_TOKEN.";
      await supabase
        .from("ops_airbyte_batches")
        .update({ status: "pending_configuration", error, updated_at: new Date().toISOString() })
        .eq("id", batch.id);
      await supabase
        .from("ops_airbyte_sinks")
        .update({ last_error: error, updated_at: new Date().toISOString() })
        .eq("id", sink.id);

      return json({
        success: true,
        accepted: true,
        status: "pending_configuration",
        batch_id: batch.id,
        item_count: records.length,
        error,
      }, 202);
    }

    let receipt: { jobId?: string; status?: string; response: unknown };
    try {
      receipt = await triggerAirbyteSync(
        sink.api_base_url || DEFAULT_AIRBYTE_API_BASE,
        apiToken,
        sink.airbyte_connection_id,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("ops_airbyte_batches")
        .update({ status: "sync_failed", error: message, updated_at: new Date().toISOString() })
        .eq("id", batch.id);
      await supabase.from("ops_airbyte_receipts").insert({
        sink_id: sink.id,
        batch_id: batch.id,
        workspace_id: sink.workspace_id,
        routine_id: routineId ?? null,
        tick_id: tickId,
        airbyte_connection_id: sink.airbyte_connection_id,
        response: {},
        error: message,
      });
      await supabase
        .from("ops_airbyte_sinks")
        .update({ last_error: message, updated_at: new Date().toISOString() })
        .eq("id", sink.id);

      return json({ success: false, error: message, batch_id: batch.id }, 502);
    }

    await supabase
      .from("ops_airbyte_batches")
      .update({
        status: "sync_triggered",
        airbyte_job_id: receipt.jobId ?? null,
        airbyte_job_status: receipt.status ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    await supabase.from("ops_airbyte_receipts").insert({
      sink_id: sink.id,
      batch_id: batch.id,
      workspace_id: sink.workspace_id,
      routine_id: routineId ?? null,
      tick_id: tickId,
      airbyte_connection_id: sink.airbyte_connection_id,
      airbyte_job_id: receipt.jobId ?? null,
      airbyte_job_status: receipt.status ?? null,
      response: receipt.response ?? {},
    });

    await supabase
      .from("ops_airbyte_sinks")
      .update({
        last_job_id: receipt.jobId ?? null,
        last_job_status: receipt.status ?? null,
        last_error: null,
        last_delivered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sink.id);

    return json({
      success: true,
      accepted: true,
      status: "sync_triggered",
      batch_id: batch.id,
      item_count: records.length,
      airbyte_job_id: receipt.jobId,
      airbyte_job_status: receipt.status,
    });
  } catch (err) {
    console.error("[ops-airbyte-delivery] error", err);
    return json({ success: false, error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
