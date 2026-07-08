/** Minimal provider-agnostic chat interface. Swap providers behind this. */
export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIProvider {
  /** Returns the assistant's text completion for the given conversation. */
  chat(options: {
    system: string;
    messages: AIMessage[];
    maxTokens?: number;
  }): Promise<string>;
}
