import { logger } from "./logger.js";

export interface CoachContext {
  role: string;
  facts: Record<string, unknown>;
}

/**
 * Provider-independent AI client.
 * Supports any OpenAI-compatible endpoint (/v1/chat/completions):
 *  - opencode zen (https://opencode.ai/zen/v1)
 *  - groq, openai, or any self-hosted gateway
 * Returns null on any failure so callers can fall back to deterministic text.
 * NEVER logs the API key or full request payloads.
 */
export class AiClient {
  private baseUrl = "";
  private apiKey = "";
  private model = "";
  enabled: boolean;

  constructor() {
    const provider = (process.env.AI_PROVIDER || "deterministic").toLowerCase();
    this.enabled = provider !== "" && provider !== "deterministic";
    if (!this.enabled) return;

    let base = process.env.AI_BASE_URL || "";
    let key = process.env.AI_API_KEY || "";
    let model = process.env.AI_MODEL || "";

    if (provider === "groq") {
      base = "https://api.groq.com/openai/v1";
      key = process.env.GROQ_API_KEY || "";
      model = model || "llama-3.3-70b-versatile";
    }

    if (!base || !key || !model) {
      logger.warn("AI provider misconfigured — falling back to deterministic engine");
      this.enabled = false;
    }
    this.baseUrl = base.replace(/\/+$/, "");
    this.apiKey = key;
    this.model = model;
  }

  async chat(
    system: string,
    user: string,
    opts: { maxTokens?: number; temperature?: number; json?: boolean } = {}
  ): Promise<string | null> {
    if (!this.enabled) return null;
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: opts.maxTokens ?? 700,
      temperature: opts.temperature ?? 0.7,
    };
    if (opts.json) body.response_format = { type: "json_object" };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300);
        logger.warn(`AI provider ${res.status}: ${text}`);
        return null;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return null;
      return content;
    } catch (e) {
      logger.warn("AI provider request failed:", (e as Error).message);
      return null;
    }
  }

  /** JSON-mode call; returns parsed object or null. */
  async chatJson<T>(system: string, user: string): Promise<T | null> {
    const raw = await this.chat(system, user, { json: true, maxTokens: 1200 });
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      logger.warn("AI returned invalid JSON; using deterministic fallback");
      return null;
    }
  }
}

export const ai = new AiClient();

export function coachSystemPrompt(role: string): string {
  return `You are the AI study coach inside LOCKEDIN, a strict accountability system for a JEE student.

Your role: ${role}

TONE RULES (hard requirements):
- Strict older sibling + serious coach. Direct, blunt, zero fluff.
- NEVER insult, threaten, shame, humiliate, or manipulate emotionally.
- Never mention being an AI. Never fake knowledge you lack.
- No emojis except a maximum of one relevant symbol. Use plain text, short lines, telegram-friendly.
- Firm + direct + constructive. End with exactly one concrete next action.
- If data is missing, say what's missing plainly. Do not invent numbers.

Respond in under 90 words. No markdown headers, no asterisks.`;
}