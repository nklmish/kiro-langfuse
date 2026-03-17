/**
 * Hook Handlers Module
 *
 * Contains handlers for all Kiro hook events.
 * Maps Kiro hook types to Langfuse trace operations.
 *
 * Kiro Hook Types:
 *   - prompt_submit     → Captures user prompts
 *   - agent_stop        → Records agent completion
 *   - pre_tool_use      → Logs before tool invocation
 *   - post_tool_use     → Logs after tool invocation with results
 *   - file_create       → Tracks new file creation
 *   - file_save         → Tracks file saves
 *   - file_delete       → Tracks file deletions
 *   - pre_task_execution  → Logs before spec task starts
 *   - post_task_execution → Logs after spec task completes
 *   - manual            → On-demand hook execution
 */

import { getFileExtension, formatDuration, generateTags } from "./utils.js";
import { addCompletionScores, addTagsToTrace } from "./langfuse-client.js";

export function handlePromptSubmit(trace, input) {
  trace.update({
    name: input.prompt?.substring(0, 100) || "User Prompt",
    input: input.prompt,
  });

  trace.generation({
    name: "User Prompt",
    input: input.prompt,
    model: input.model,
    metadata: {
      hook_event: "prompt_submit",
    },
  });

  return null;
}

export function handleAgentStop(trace, input) {
  const status = input.status || "completed";

  trace.event({
    name: "Agent Stopped",
    level: status === "error" ? "ERROR" : status === "aborted" ? "WARNING" : "DEFAULT",
    metadata: {
      status: status,
      hook_event: "agent_stop",
    },
  });

  addCompletionScores(trace, { ...input, status });
  addTagsToTrace(trace, [`status-${status}`]);

  return null;
}

export function handlePreToolUse(trace, input) {
  const toolName = input.tool_name || "unknown-tool";

  trace
    .span({
      name: `Tool: ${toolName}`,
      input: {
        tool_name: toolName,
        tool_input: input.tool_input,
      },
      metadata: {
        hook_event: "pre_tool_use",
      },
    })
    .end();

  addTagsToTrace(trace, generateTags("pre_tool_use", input));
  return null;
}

export function handlePostToolUse(trace, input) {
  const toolName = input.tool_name || "unknown-tool";

  trace
    .span({
      name: `Tool Result: ${toolName}`,
      input: { tool_name: toolName, tool_input: input.tool_input },
      output: input.result,
      metadata: {
        hook_event: "post_tool_use",
        duration_ms: input.duration,
        duration_formatted: formatDuration(input.duration),
      },
    })
    .end();

  return null;
}

export function handleFileCreate(trace, input) {
  const filePath = input.file_path || "unknown";
  const fileName = filePath.split("/").pop() || "file";
  const extension = getFileExtension(filePath);

  trace
    .span({
      name: `Create: ${fileName}`,
      input: { file_path: filePath, extension },
      metadata: {
        hook_event: "file_create",
        file_extension: extension,
      },
    })
    .end();

  addTagsToTrace(trace, generateTags("file_create", input));
  return null;
}

export function handleFileSave(trace, input) {
  const filePath = input.file_path || "unknown";
  const fileName = filePath.split("/").pop() || "file";
  const extension = getFileExtension(filePath);

  trace
    .span({
      name: `Save: ${fileName}`,
      input: { file_path: filePath, extension },
      metadata: {
        hook_event: "file_save",
        file_extension: extension,
      },
    })
    .end();

  addTagsToTrace(trace, generateTags("file_save", input));
  return null;
}

export function handleFileDelete(trace, input) {
  const filePath = input.file_path || "unknown";
  const fileName = filePath.split("/").pop() || "file";
  const extension = getFileExtension(filePath);

  trace
    .span({
      name: `Delete: ${fileName}`,
      input: { file_path: filePath, extension },
      level: "WARNING",
      metadata: {
        hook_event: "file_delete",
        file_extension: extension,
      },
    })
    .end();

  addTagsToTrace(trace, generateTags("file_delete", input));
  return null;
}

export function handlePreTaskExecution(trace, input) {
  const taskName = input.task_name || "spec-task";

  trace
    .span({
      name: `Task Start: ${taskName}`,
      input: { task_name: taskName },
      metadata: {
        hook_event: "pre_task_execution",
        task_status: "in_progress",
      },
    })
    .end();

  addTagsToTrace(trace, generateTags("pre_task_execution", input));
  return null;
}

export function handlePostTaskExecution(trace, input) {
  const taskName = input.task_name || "spec-task";

  trace
    .span({
      name: `Task Done: ${taskName}`,
      input: { task_name: taskName },
      output: input.result,
      metadata: {
        hook_event: "post_task_execution",
        task_status: "completed",
        duration_ms: input.duration,
        duration_formatted: formatDuration(input.duration),
      },
    })
    .end();

  addTagsToTrace(trace, generateTags("post_task_execution", input));
  return null;
}

export function handleManual(trace, input) {
  trace.event({
    name: "Manual Hook Triggered",
    metadata: {
      hook_event: "manual",
      trigger_reason: input.reason || "on-demand",
    },
  });

  return null;
}

/**
 * Route hook events to their appropriate handler
 */
export function routeHookHandler(hookName, trace, input) {
  const handlers = {
    prompt_submit: handlePromptSubmit,
    agent_stop: handleAgentStop,
    pre_tool_use: handlePreToolUse,
    post_tool_use: handlePostToolUse,
    file_create: handleFileCreate,
    file_save: handleFileSave,
    file_delete: handleFileDelete,
    pre_task_execution: handlePreTaskExecution,
    post_task_execution: handlePostTaskExecution,
    manual: handleManual,
  };

  const handler = handlers[hookName];
  if (!handler) {
    console.error(`Unknown hook type: ${hookName}`);
    return null;
  }

  return handler(trace, input);
}
