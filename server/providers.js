// Multi-provider AI backend for Lemango AI.
//
// Every response is branded as "Lemango AI" and the underlying model/company
// is never disclosed to the caller. Providers are tried in a chain; the first
// one that answers wins. Pollinations is keyless so everything works out of
// the box, while optional API keys unlock faster / stronger providers.

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 45000);

export const BRAND = "Lemango AI";

const PROVIDERS = {
  pollinations: {
    keyless: true,
    baseUrl: "https://text.pollinations.ai/openai",
    model: process.env.POLLINATIONS_MODEL || "openai",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    model: process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
    headers: { "HTTP-Referer": "https://lemango.org", "X-Title": BRAND },
  },
  gemma26: {
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    model: process.env.GEMMA26_MODEL || "google/gemma-4-26b-a4b-it:free",
    headers: { "HTTP-Referer": "https://lemango.org", "X-Title": BRAND },
  },
  nemotron: {
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    model: process.env.NEMOTRON_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    headers: { "HTTP-Referer": "https://lemango.org", "X-Title": BRAND },
  },
  nemotronSuper: {
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    model: process.env.NEMOTRON_SUPER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
    headers: { "HTTP-Referer": "https://lemango.org", "X-Title": BRAND },
  },
  lfm: {
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    model: process.env.LFM_MODEL || "liquid/lfm-2.5-2.6b:free",
    headers: { "HTTP-Referer": "https://lemango.org", "X-Title": BRAND },
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKey: "GEMINI_API_KEY",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  },
  huggingface: {
    baseUrl: "https://router.huggingface.co/v1",
    envKey: "HUGGINGFACE_API_KEY",
    model: process.env.HUGGINGFACE_MODEL || "meta-llama/Llama-3.1-8B-Instruct",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  },
  openai: {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  },
};

// Branded model names shown to users. Each maps to a chain of real providers.
export const MODEL_CATALOG = [
  { name: "Mango-Light", desc: "Fast, everyday answers", color: "#f59e0b", chain: ["nemotron", "gemma26", "openrouter", "pollinations"] },
  { name: "Mango-Flash", desc: "Snappy and efficient", color: "#22c55e", chain: ["lfm", "gemma26", "openrouter", "pollinations"] },
  { name: "Mango-Core", desc: "Balanced for most tasks", color: "#3b82f6", chain: ["openrouter", "gemma26", "nemotron", "nemotronSuper", "pollinations"] },
  { name: "Mango-Pro", desc: "Stronger reasoning", color: "#8b5cf6", chain: ["nemotronSuper", "nemotron", "openrouter", "gemma26", "pollinations"] },
  { name: "Mango-Ultra", desc: "Deep reasoning, free", color: "#ec4899", chain: ["nemotron", "nemotronSuper", "openrouter", "gemma26", "pollinations"] },
];

function liveDisabled() {
  const value = String(process.env.AI_DISABLE_LIVE || "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function providerAvailable(name) {
  const cfg = PROVIDERS[name];
  if (!cfg) return false;
  if (cfg.keyless) return true;
  const keys = Array.isArray(cfg.envKey) ? cfg.envKey : [cfg.envKey];
  return keys.some((k) => Boolean(process.env[k]));
}

export function catalogForClient() {
  return MODEL_CATALOG.map(({ name, desc, color }) => ({ name, desc, color }));
}

export function aiConfigured() {
  if (liveDisabled()) return false;
  return MODEL_CATALOG.some((m) => m.chain.some(providerAvailable));
}

function chainFor(modelName) {
  const entry = MODEL_CATALOG.find((m) => m.name === modelName) || MODEL_CATALOG[0];
  return entry.chain.filter(providerAvailable);
}

async function callProvider(name, messages, opts) {
  const cfg = PROVIDERS[name];
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers = { "Content-Type": "application/json", ...(cfg.headers || {}) };
  const keys = Array.isArray(cfg.envKey) ? cfg.envKey : (cfg.envKey ? [cfg.envKey] : []);
  const apiKey = keys.map((k) => process.env[k]).find(Boolean);
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        ...(opts.reasoning ? { reasoning: opts.reasoning } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${name} responded ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message || {};
    let text = msg.content || "";
    let reasoning = msg.reasoning || msg.reasoning_content || null;
    // Some models inline thinking in <think>...</think> tags.
    const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      reasoning = (reasoning ? reasoning + "\n" : "") + thinkMatch[1].trim();
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    }
    if (!text || !String(text).trim()) throw new Error(`${name} returned an empty response`);
    return { text: String(text).trim(), reasoning: reasoning ? String(reasoning).trim() : null, provider: name };
  } finally {
    clearTimeout(timer);
  }
}

// Try each available provider in the model's chain until one succeeds.
export async function generateReply(messages, modelName, opts = {}) {
  if (liveDisabled()) throw new Error("Live AI is disabled by configuration.");
  const chain = chainFor(modelName);
  if (!chain.length) throw new Error("No AI provider is available.");

  const options = { temperature: opts.temperature ?? 0.7, maxTokens: opts.maxTokens || 2000, reasoning: opts.reasoning };
  let lastError;
  for (const provider of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await callProvider(provider, messages, options);
      } catch (err) {
        lastError = err;
        const msg = String(err && err.message || "");
        const retryable = /429|5\d\d|fetch failed|aborted|timeout/i.test(msg);
        if (!retryable || attempt === 1) {
          console.warn(`[ai] provider '${provider}' failed: ${err.message}`);
          break;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }
  throw lastError || new Error("All AI providers failed.");
}
