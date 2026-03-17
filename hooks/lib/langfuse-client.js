/**
 * Langfuse Client Module
 *
 * Handles Langfuse SDK initialization and trace management
 * with support for sessions, scoring, and dynamic metadata.
 */

import { Langfuse } from "langfuse";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateTraceName, generateSessionId, generateTags } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (3 levels up from lib/)
const projectRoot = resolve(__dirname, "..", "..", "..");
config({ path: resolve(projectRoot, ".env") });

// Fallback: try CWD if keys not found
if (!process.env.LANGFUSE_SECRET_KEY) {
  config({ path: resolve(process.cwd(), ".env") });
}

export const HOOK_HANDLER_VERSION = "1.0.0";

let langfuseInstance = null;

export function getLangfuseClient() {
  if (!langfuseInstance) {
    langfuseInstance = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
      release: HOOK_HANDLER_VERSION,
      requestTimeout: 10000,
      flushAt: 1,
      flushInterval: 100,
    });
  }
  return langfuseInstance;
}

export function getOrCreateTrace(input, customName = null) {
  const langfuse = getLangfuseClient();
  const sessionId = generateSessionId(input.workspace_roots);
  const traceName =
    customName ||
    generateTraceName(input.prompt, input.model) ||
    `${input.hook_event_name || "Kiro"} - ${input.model || "Agent"}`;
  const tags = generateTags(input.hook_event_name, input);

  return langfuse.trace({
    id: input.conversation_id,
    name: traceName,
    sessionId: sessionId,
    userId: input.user_email || undefined,
    release: HOOK_HANDLER_VERSION,
    metadata: {
      model: input.model,
      workspace_roots: input.workspace_roots,
      hook_event: input.hook_event_name,
    },
    tags: tags,
  });
}

export function addTagsToTrace(trace, newTags) {
  if (trace && newTags && newTags.length > 0) {
    trace.update({ tags: newTags });
  }
}

export function addScore(trace, name, value, comment = null, dataType = "NUMERIC") {
  if (trace) {
    trace.score({ name, value, comment, dataType });
  }
}

export function addCompletionScores(trace, input) {
  let statusScore = 0;
  let statusComment = "";

  switch (input.status) {
    case "completed":
      statusScore = 1;
      statusComment = "Agent completed successfully";
      break;
    case "aborted":
      statusScore = 0.5;
      statusComment = "Agent was aborted by user";
      break;
    case "error":
      statusScore = 0;
      statusComment = "Agent encountered an error";
      break;
    default:
      statusScore = 0.5;
      statusComment = `Unknown status: ${input.status}`;
  }

  addScore(trace, "completion_status", statusScore, statusComment);
}

export async function flushLangfuse() {
  const langfuse = getLangfuseClient();
  // shutdownAsync waits for all in-flight requests to complete,
  // then tears down the client so process.exit() is clean.
  // Race against a timeout so we never block Kiro's hook deadline.
  await Promise.race([
    langfuse.shutdownAsync(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

export async function shutdownLangfuse() {
  const langfuse = getLangfuseClient();
  await langfuse.shutdownAsync();
}

/**
 * Reset the singleton Langfuse client.
 * Only intended for testing — allows re-initialization with different config.
 */
export function resetLangfuseClient() {
  langfuseInstance = null;
}
