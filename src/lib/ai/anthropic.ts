import "server-only";

import { recordUsage } from "./meter";
import type { AIMessage, AIProvider } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/**
 * Server-only Claude client. Uses raw fetch to keep dependencies minimal.
 * The key never leaves the server: importing this module from a client
 * component fails the build via the "server-only" package guard.
 */
export class AnthropicProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local and Vercel env settings.");
    }
    this.apiKey = key;
    this.model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async chat({ system, messages, maxTokens = 1024 }: {
    system: string;
    messages: AIMessage[];
    maxTokens?: number;
  }): Promise<string> {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    // Spend visibility: report token usage to the ambient request meter
    // (no-op when a route didn't attach one).
    recordUsage(this.model, {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    });
    return data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
  }
}

let provider: AIProvider | null = null;

/** Lazily construct the provider so builds without the key still succeed. */
export function getAIProvider(): AIProvider {
  if (!provider) provider = new AnthropicProvider();
  return provider;
}
