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
  type ExistingRoutine,
} from "../_shared/signaliz-yaml-runtime.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await requireAuth(req);
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const yamlText = String(body.yaml_text ?? "");
    const workspaceId = String(body.workspace_id ?? req.headers.get("x-workspace-id") ?? "");

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

    const { data: routines, error } = await supabase
      .from("gtm_routines")
      .select("id, name, goal, cadence, policy, output_sinks, learning_config, status")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived");

    if (error) throw error;

    const existing: ExistingRoutine[] = (routines ?? []).map((routine) => ({
      id: routine.id,
      slug: rowToOpSpec(routine).slug,
      spec: rowToOpSpec(routine),
    }));

    const actions = reconcile(parsed.parsed, existing);
    const hash = await planHash(actions);

    return json({
      success: true,
      actions,
      errors: parsed.errors,
      warnings: parsed.warnings,
      plan_hash: hash,
    });
  } catch (err) {
    console.error("[yaml-plan] error", err);
    return errorResponse(err);
  }
});
