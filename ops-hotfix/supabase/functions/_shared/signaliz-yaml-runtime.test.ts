import {
  normalizeForDiff,
  parseYaml,
  type OpSpec,
} from "./signaliz-yaml-runtime.ts";

Deno.test("accepts Airbyte sinks that create a connection from source and destination ids", () => {
  const result = parseYaml(`
version: v1
ops:
  - slug: airbyte-source-destination
    name: Airbyte source destination
    goal: Send qualified account records into Airbyte for downstream sync testing.
    cadence: daily
    sinks:
      - type: airbyte
        config:
          source_id: 95e66a59-8045-4307-9678-63bc3c9b8c93
          destination_id: e478de0d-a3a0-475c-b019-25f7dd29e281
delete_if_absent: false
`);

  if (!result.ok) {
    throw new Error(`Expected YAML to parse, got: ${result.errors.join("; ")}`);
  }
});

Deno.test("rejects Airbyte sinks without a connection id or source and destination pair", () => {
  const result = parseYaml(`
version: v1
ops:
  - slug: broken-airbyte
    name: Broken Airbyte
    goal: Send qualified account records into Airbyte for downstream sync testing.
    cadence: daily
    sinks:
      - type: airbyte
        config:
          source_id: 95e66a59-8045-4307-9678-63bc3c9b8c93
delete_if_absent: false
`);

  if (result.ok) {
    throw new Error("Expected YAML to be rejected");
  }

  if (!result.errors.some((error) => error.includes("source_id and destination_id"))) {
    throw new Error(`Expected source/destination validation error, got: ${result.errors.join("; ")}`);
  }
});

Deno.test("normalizes generated Airbyte connection ids when source and destination are present", () => {
  const desired: OpSpec = {
    slug: "airbyte-source-destination",
    name: "Airbyte source destination",
    goal: "Send qualified account records into Airbyte for downstream sync testing.",
    cadence: "daily",
    sinks: [{
      type: "airbyte",
      config: {
        source_id: "95e66a59-8045-4307-9678-63bc3c9b8c93",
        destination_id: "e478de0d-a3a0-475c-b019-25f7dd29e281",
      },
    }],
  };

  const existing: OpSpec = {
    ...desired,
    sinks: [{
      type: "airbyte",
      config: {
        connection_id: "created-connection-id",
        source_id: "95e66a59-8045-4307-9678-63bc3c9b8c93",
        destination_id: "e478de0d-a3a0-475c-b019-25f7dd29e281",
      },
    }],
  };

  const desiredDiff = normalizeForDiff(desired);
  const existingDiff = normalizeForDiff(existing);

  if (JSON.stringify(desiredDiff.sinks) !== JSON.stringify(existingDiff.sinks)) {
    throw new Error("Expected generated connection id to be ignored for source/destination Airbyte sinks");
  }
});

Deno.test("normalizes Airbyte secrets out of diffs", () => {
  const op: OpSpec = {
    slug: "airbyte-secret",
    name: "Airbyte secret",
    goal: "Send qualified account records into Airbyte for downstream sync testing.",
    cadence: "daily",
    sinks: [{
      type: "airbyte",
      config: {
        connection_id: "existing-connection-id",
        api_token: "real-token",
      },
    }],
  };

  const diff = normalizeForDiff(op);
  const sinks = diff.sinks as Array<{ config: Record<string, unknown> }>;

  if ("api_token" in sinks[0].config) {
    throw new Error("Expected api_token to be removed from normalized Airbyte config");
  }
});
