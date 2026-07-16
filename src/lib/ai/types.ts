/** Minimal provider-agnostic chat interface. Swap providers behind this. */

/** Anthropic-style content blocks; plain strings stay valid for text-only. */
export type AIContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/jpeg" | "image/png" | "image/webp";
        data: string;
      };
    };

export interface AIMessage {
  role: "user" | "assistant";
  content: string | AIContentBlock[];
}

export interface AIProvider {
  /** Returns the assistant's text completion for the given conversation. */
  chat(options: {
    system: string;
    messages: AIMessage[];
    maxTokens?: number;
  }): Promise<string>;
}
