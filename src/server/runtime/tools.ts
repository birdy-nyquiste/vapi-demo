import Ajv from "ajv";
import { performance } from "node:perf_hooks";
import type { Sql } from "../storage/db.js";
import type { Run, ToolExecution } from "../../shared/types.js";
import { addEvent } from "../storage/store.js";
import { scenarioById } from "./scenarios.js";
const ajv = new Ajv({ allErrors: true, strict: false });
export async function executeTool(
  tx: Sql,
  run: Run,
  id: string,
  name: string,
  args: unknown,
): Promise<ToolExecution> {
  const prior = (
    await tx.query<ToolExecution>(
      'SELECT id,name,args,result,ok,duration_ms AS "durationMs" FROM tool_executions WHERE run_id=$1 AND id=$2',
      [run.id, id],
    )
  ).rows[0];
  if (prior) return prior;
  const started = performance.now();
  const scenario = scenarioById(run.scenarioId);
  let result: unknown;
  let ok = false;
  try {
    if (scenario.version !== run.scenarioVersion)
      throw new Error("场景版本已变化，请使用原版本处理此通话");
    const tool = scenario.tools.find((t) => t.name === name);
    if (!tool) throw new Error("未注册的工具");
    const validate = ajv.compile(tool.parameters);
    if (!validate(args))
      throw new Error(`参数无效: ${ajv.errorsText(validate.errors)}`);
    result = await tool.execute(args as Record<string, unknown>, {
      runId: run.id,
      callId: run.callId!,
      toolCallId: id,
    });
    ok = true;
  } catch (error) {
    result = {
      error: error instanceof Error ? error.message : "工具执行失败",
      saved: false,
    };
  }
  const execution = {
    id,
    name,
    args: args ?? null,
    result,
    ok,
    durationMs: Math.round(performance.now() - started),
  };
  await tx.query(
    "INSERT INTO tool_executions(run_id,id,name,args,result,ok,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      run.id,
      id,
      name,
      JSON.stringify(execution.args),
      JSON.stringify(result),
      ok,
      execution.durationMs,
    ],
  );
  await addEvent(tx, run.id, "tool-result", { ...execution });
  return execution;
}
