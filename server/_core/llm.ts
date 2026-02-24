import { ENV } from "./env";
import {
  initKeyPool,
  acquireKey,
  releaseKey,
  reportRateLimit,
  reportError,
  hasKeys,
  getKeyPoolStatus,
  chatCallStarted,
  chatCallFinished,
  isBackgroundPaused,
  acquireConcurrencySlot,
  releaseConcurrencySlot,
  type PoolName,
  type SystemTag,
} from "./key-pool";
import { createLogger } from "./logger.js";
const log = createLogger("LLM");

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  /** Priority level: "chat" gets immediate access, "background" is queued */
  priority?: "chat" | "background";
  /** Temperature for response generation (0 = deterministic, 1 = creative) */
  temperature?: number;
  /** Model override: "fast" uses gpt-4.1-nano (cheapest), "strong" uses gpt-4.1-mini (best value for code) */
  model?: "fast" | "strong";
  /** User's personal OpenAI API key — bypasses system key pool entirely */
  userApiKey?: string;
  /** Which system is making this call — determines which dedicated API key is used */
  systemTag?: SystemTag;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// ═══════════════════════════════════════════════════════════════════════════
// Priority System — Hard background pause via key-pool + global concurrency
// ═══════════════════════════════════════════════════════════════════════════

/** Re-export for external monitoring */
export { isBackgroundPaused } from "./key-pool";

/** Get queue status for monitoring */
export function getLLMQueueStatus() {
  const keyPoolStatus = getKeyPoolStatus();
  return {
    backgroundPaused: isBackgroundPaused(),
    keyPool: keyPoolStatus,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Content normalization helpers (unchanged)
// ═══════════════════════════════════════════════════════════════════════════

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // Pass through tool_calls for assistant messages (needed for tool-calling loops)
  const tool_calls = message.tool_calls;

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
      ...(tool_calls ? { tool_calls } : {}),
    };
  }

  return {
    role,
    name,
    content: contentParts,
    ...(tool_calls ? { tool_calls } : {}),
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

// ═══════════════════════════════════════════════════════════════════════════
// API URL resolution — always uses OpenAI direct, or Forge fallback
// ═══════════════════════════════════════════════════════════════════════════

const resolveApiUrl = () => {
  // If any OpenAI keys exist (via key pool), use OpenAI directly
  if (hasKeys()) {
    return "https://api.openai.com/v1/chat/completions";
  }
  // Fall back to Manus Forge API
  if (ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0) {
    return `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`;
  }
  return "https://api.openai.com/v1/chat/completions";
};

/** Legacy single-key getter — only used as fallback when key pool has no keys */
const getLegacyApiKey = () => {
  return process.env.OPENAI_API_KEY || ENV.forgeApiKey || "";
};

const assertApiKey = () => {
  if (!hasKeys() && !getLegacyApiKey()) {
    throw new Error("No OpenAI API keys configured. Set OPENAI_API_KEY and/or OPENAI_API_KEY_2..N");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// Main invokeLLM — Multi-key pool + priority queue + auto-retry on 429
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum retries on 429 rate limit errors */
const MAX_429_RETRIES_CHAT = 4;
const MAX_429_RETRIES_BACKGROUND = 2;


export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  // Initialize key pool on first call (safe to call multiple times)
  initKeyPool();
  assertApiKey();

  const priority = params.priority || "background";
  const isChat = priority === "chat";

  // Track chat calls for monitoring
  if (isChat) chatCallStarted();

  try {
    return await _invokeLLMWithRetry(params, priority);
  } finally {
    if (isChat) chatCallFinished();
  }
}

async function _invokeLLMWithRetry(
  params: InvokeParams,
  priority: "chat" | "background",
  attempt = 0
): Promise<InvokeResult> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    maxTokens,
    max_tokens,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  // Model selection: "fast" = gpt-4.1-nano, "strong" = gpt-4.1-mini
  // Default: gpt-4.1-mini for tool-calling, gpt-4.1-nano for simple text
  // Cost savings: ~84-97% cheaper than previous gpt-4o routing
  const hasToolsDefined = params.tools && params.tools.length > 0;
  const modelPreference = params.model || (hasToolsDefined ? "strong" : "fast");
  const useOpenAI = hasKeys();
  const model = useOpenAI
    ? (modelPreference === "fast" ? "gpt-4.1-nano" : "gpt-4.1-mini")
    : "gemini-2.5-flash";

  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  // gpt-4.1-mini supports up to 32768 output tokens
  const defaultMaxTokens = 16384;
  payload.max_tokens = maxTokens || max_tokens || defaultMaxTokens;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  // Temperature control — 0 for precise code generation, higher for creative responses
  if (typeof params.temperature === 'number') {
    payload.temperature = params.temperature;
  }

  // ── Acquire API key ──
  // If user provided their own API key, use it directly (bypasses system pool)
  const usingUserKey = !!params.userApiKey;
  // Determine system tag: explicit tag > priority-based default
  const systemTag = params.systemTag || (priority === "chat" ? "chat" : "misc");
  const keyHandle = (!usingUserKey && useOpenAI) ? acquireKey(systemTag) : null;
  const apiKey = usingUserKey ? params.userApiKey! : (keyHandle ? keyHandle.key : getLegacyApiKey());

  if (usingUserKey) {
    log.info("Using user's personal API key", { system: systemTag, model });
  }

  // Add fetch timeout to prevent hanging requests (5 minutes for chat, 2 minutes for background)
  const fetchTimeoutMs = priority === "chat" ? 300_000 : 120_000;
  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

  let response: Response;
  try {
    response = await fetch(resolveApiUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(fetchTimeout);
    // Release key on error
    if (keyHandle) reportError(keyHandle.index, keyHandle.envVar);

    if (err.name === 'AbortError') {
      throw new Error(`LLM request timed out after ${fetchTimeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(fetchTimeout);
  }

  // ── Handle 429 Rate Limit ──
  // With dedicated keys per system, we retry on our own key (+ fallback for chat)
  if (response.status === 429) {
    if (keyHandle) reportRateLimit(keyHandle.index, keyHandle.envVar);

    const maxRetries = priority === "chat" ? MAX_429_RETRIES_CHAT : MAX_429_RETRIES_BACKGROUND;

    if (attempt < maxRetries) {
      const retryAfterHeader = response.headers.get("retry-after");
      let waitMs: number;

      if (retryAfterHeader) {
        waitMs = Math.min(parseFloat(retryAfterHeader) * 1000, 30_000);
      } else if (priority === "chat") {
        // Chat: fast backoff — 1s, 2s, 4s, 8s
        waitMs = Math.min(1000 * Math.pow(2, attempt), 15_000);
      } else {
        // Background: longer backoff — 5s, 15s
        waitMs = Math.min(5_000 * Math.pow(3, attempt), 30_000);
      }

      // Fall back to gpt-4.1-nano after 2 retries on gpt-4.1-mini
      if (attempt >= 2 && modelPreference === "strong" && useOpenAI) {
        log.info(`[LLM] ${systemTag}: falling back to gpt-4.1-nano after ${attempt + 1} retries`);
        const fallbackParams = { ...params, model: "fast" as const };
        await new Promise((r) => setTimeout(r, waitMs));
        return _invokeLLMWithRetry(fallbackParams, priority, 0);
      }

      log.info(`[LLM] ${systemTag}: 429 rate limited (attempt ${attempt + 1}/${maxRetries}), ` +
        `waiting ${Math.round(waitMs / 1000)}s`);

      await new Promise((r) => setTimeout(r, waitMs));
      return _invokeLLMWithRetry(params, priority, attempt + 1);
    }

    // All retries exhausted
    const errorText = await response.text();
    throw new Error(
      `LLM rate limited for system "${systemTag}" after ${maxRetries} retries: ${errorText}`
    );
  }

  // ── Handle other errors ──
  if (!response.ok) {
    if (keyHandle) reportError(keyHandle.index, keyHandle.envVar);
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  // ── Success — release key back to pool ──
  if (keyHandle) releaseKey(keyHandle.index, keyHandle.envVar);

  return (await response.json()) as InvokeResult;
}
