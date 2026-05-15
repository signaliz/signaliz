# Signaliz Ops Hotfix Notes

Date: 2026-05-09

## Shipped

- Added nullable `public.gtm_routine_items.error text` in Supabase project `auaspofivukywwnosmcf`.
  - Purpose: match the live `delivery-monitor` task expectation and prevent failures caused by `column gtm_routine_items.error does not exist`.
- Added RLS-enabled Airbyte bridge tables:
  - `public.ops_airbyte_sinks`
  - `public.ops_airbyte_batches`
  - `public.ops_airbyte_records`
  - `public.ops_airbyte_receipts`
- Deployed `ops-airbyte-delivery` version 1.
  - `POST` accepts Ops webhook payloads, stores batches and records, and triggers Airbyte sync jobs when an API token is configured.
  - `GET` exposes staged records as the `signaliz_ops_items` stream for Airbyte source-style reads.
  - Sink tokens are stored as SHA-256 hashes only.
- Redeployed `yaml-plan` to version 7.
- Redeployed `yaml-apply` to version 7.

## YAML Runtime Contract Changes

- `airbyte` sinks are now supported in `signaliz.yaml`.
- `airbyte` sinks require either an existing `config.connection_id` / `config.airbyte_connection_id`, or both `config.source_id` and `config.destination_id` so `yaml-apply` can create the Airbyte connection.
- `yaml-apply` compiles declarative Airbyte sinks into runtime webhook sinks pointed at `ops-airbyte-delivery`.
- Compiled Airbyte webhook config includes `delivery_mode`, `airbyte_sink_id`, `airbyte_connection_id`, redacted `airbyte_config`, and `source_url`.
- Airbyte bridge tokens are stable per workspace/sink slug and derived from `AIRBYTE_BRIDGE_TOKEN_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`, then stored only as SHA-256 hashes.
- `instantly` sinks are rejected by the YAML parser with an explicit error instead of being accepted and later silently dropped by `gtm-routines`.
- Runtime-supported YAML sinks are currently `csv`, `webhook`, and `airbyte`.
- `event_driven` Ops now require at least one `triggers[].event_type`.
- `yaml-apply` compiles `event_driven` to runtime cadence `manual` and sends `wake_on_events` to `gtm-routines`.
- `yaml-plan`, `yaml-apply`, and `ops-airbyte-delivery` allow `GET`, `POST`, `OPTIONS`, and the `X-Signaliz-Plan-Hash` header through CORS.

## Verified

- Deno type-check passed for `yaml-plan`, `yaml-apply`, and `ops-airbyte-delivery`.
- Local YAML parser test confirmed:
  - `airbyte` with `connection_id` is accepted.
  - `airbyte` with `source_id` and `destination_id` is accepted for connection creation.
  - `airbyte` without either a connection ID or source/destination pair is rejected.
  - `event_driven` with a trigger is accepted.
- Supabase CORS preflight confirmed `x-signaliz-plan-hash` is allowed.
- Airbyte bridge smoke test confirmed:
  - `POST` accepted one Ops record.
  - The batch moved to `pending_configuration` when no Airbyte API token was configured.
  - `GET` returned the staged record through the source endpoint.
  - Temporary smoke-test sink and records were cleaned up.
- SQL inspection confirmed `gtm_routine_items.error` exists.
- Trigger telemetry showed `delivery-monitor` had only completed runs in the last 3 hours at verification time.

## Still Needed

- Mirror these live Supabase changes into the Lovable-connected source repo with migrations, function source, tests, UI, and docs.
- Configure Airbyte credentials in one of the supported places before creating a connection or triggering a sync:
  - Airbyte sink config `api_token`.
  - `dataplane_connectors.credentials`.
  - Edge function environment variable `AIRBYTE_API_TOKEN`.
- Add Ops status UI for Airbyte receipts:
  - sink status
  - last job ID/status
  - last error
  - last delivered at
- Patch Trigger worker source for:
  - `check-provider-credits`: `.insert(...).catch is not a function`.
  - `nightly-weight-recalculator`: `createClient is not a function`.
  - Typed payload schemas for `gtm-routine-*`, `delivery-monitor`, and `dataplane-*`.
- Find or connect the main Lovable/GitHub source repo so the live MCP hotfixes can be committed, reviewed, and deployed through CI.
