/**
 * Utility functions for Kiro Langfuse hooks
 */

/**
 * Read and parse JSON input from stdin.
 * Kiro hooks pass data via stdin as JSON for shell command actions.
 * @returns {Promise<object>} Parsed JSON object from stdin
 */
export async function readStdin() {
  // If stdin is a TTY or already ended, no piped data available
  if (process.stdin.isTTY || process.stdin.readableEnded) {
    return {};
  }

  return new Promise((resolve) => {
    let data = "";
    let resolved = false;

    const done = (result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(result);
    };

    // Timeout after 500ms — gives Kiro time to pipe stdin data
    const timer = setTimeout(() => {
      done(data ? tryParse(data) : {});
    }, 500);

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      done(data ? tryParse(data) : {});
    });
    process.stdin.on("error", () => {
      done({});
    });
  });
}

function tryParse(data) {
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Build input context from environment variables.
 * Kiro sets env vars like USER_PROMPT for PromptSubmit hooks.
 * @param {object} stdinData - Data parsed from stdin (if any)
 * @returns {object} Merged input from stdin and env vars
 */
export function buildInputFromEnv(stdinData = {}) {
  const env = process.env;

  return {
    ...stdinData,
    hook_event_name: env.KIRO_HOOK_EVENT || stdinData.hook_event_name || "unknown",
    prompt: env.USER_PROMPT || stdinData.prompt || undefined,
    conversation_id: env.KIRO_CONVERSATION_ID || stdinData.conversation_id || generateConversationId(),
    workspace_roots: env.KIRO_WORKSPACE_ROOT
      ? [env.KIRO_WORKSPACE_ROOT]
      : stdinData.workspace_roots || [process.cwd()],
    model: env.KIRO_MODEL || stdinData.model || "kiro-agent",
    tool_name: env.KIRO_TOOL_NAME || stdinData.tool_name || undefined,
    file_path: env.KIRO_FILE_PATH || stdinData.file_path || undefined,
    user_email: env.KIRO_USER_EMAIL || stdinData.user_email || undefined,
  };
}

/**
 * Generate a unique conversation ID when none is provided
 * @returns {string} A unique conversation ID
 */
function generateConversationId() {
  return `kiro-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Generate a descriptive trace name from the prompt
 * @param {string} prompt - The user's prompt text
 * @param {string} model - The model being used
 * @returns {string} A descriptive trace name
 */
export function generateTraceName(prompt, model) {
  if (!prompt) {
    return `Kiro ${model || "Agent"}`;
  }

  const cleaned = prompt.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  const maxLength = 50;

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const truncated = cleaned.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > 30) {
    return truncated.substring(0, lastSpace) + "...";
  }

  return truncated + "...";
}

/**
 * Generate a session ID from workspace roots.
 * Groups all conversations in the same workspace together.
 * @param {string[]} workspaceRoots - Array of workspace root paths
 * @returns {string} Session ID
 */
export function generateSessionId(workspaceRoots) {
  if (!workspaceRoots || workspaceRoots.length === 0) {
    return "kiro-default-session";
  }

  const root = workspaceRoots[0];
  const folderName = root.split("/").pop() || root;

  return `kiro-${folderName}`;
}

/**
 * Generate dynamic tags based on hook activity
 * @param {string} hookName - The name of the hook being executed
 * @param {object} input - The input data from the hook
 * @returns {string[]} Array of tags
 */
export function generateTags(hookName, input) {
  const tags = new Set();

  tags.add("kiro");

  if (input.model) {
    const modelTag = input.model
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .substring(0, 30);
    tags.add(modelTag);
  }

  switch (hookName) {
    case "prompt_submit":
      tags.add("prompt");
      break;
    case "agent_stop":
      tags.add("agent-stop");
      break;
    case "pre_tool_use":
    case "post_tool_use":
      tags.add("tool-use");
      if (input.tool_name) {
        tags.add(`tool-${input.tool_name.toLowerCase().substring(0, 20)}`);
      }
      break;
    case "file_create":
      tags.add("file-ops");
      tags.add("file-create");
      break;
    case "file_save":
      tags.add("file-ops");
      tags.add("file-save");
      break;
    case "file_delete":
      tags.add("file-ops");
      tags.add("file-delete");
      break;
    case "pre_task_execution":
    case "post_task_execution":
      tags.add("spec-task");
      break;
    case "manual":
      tags.add("manual");
      break;
  }

  return Array.from(tags);
}

/**
 * Determine the observation level based on status
 * @param {string} status - The status (e.g., 'completed', 'error', 'aborted')
 * @returns {string} Level: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR'
 */
export function determineLevel(status) {
  switch (status) {
    case "error":
      return "ERROR";
    case "aborted":
      return "WARNING";
    case "completed":
    default:
      return "DEFAULT";
  }
}

/**
 * Extract file extension from a file path
 * @param {string} filePath - The file path
 * @returns {string} The file extension (without dot) or 'unknown'
 */
export function getFileExtension(filePath) {
  if (!filePath) return "unknown";
  const parts = filePath.split(".");
  if (parts.length < 2) return "unknown";
  return parts.pop().toLowerCase();
}

/**
 * Format duration in milliseconds to a human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(ms) {
  if (!ms || ms < 0) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}
