"use client";

import { FormEvent, useRef, useState } from "react";

type Message = {
  id: number;
  role: "assistant" | "user";
  text: string;
};

const starterMessage: Message = {
  id: 1,
  role: "assistant",
  text:
    "Hey, I’m Demi—your no-pressure fitness coach. Tell me what you want to feel stronger, healthier, or more confident doing, and we’ll find your next doable step.",
};

const starterPrompts = [
  "I want to start working out",
  "Help me eat better",
  "I want more energy",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([starterMessage]);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState(starterPrompts);
  const [isSending, setIsSending] = useState(false);
  const nextId = useRef(2);

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || isSending) return;

    setInput("");
    setSuggestions([]);
    setIsSending(true);
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: message },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await response.json()) as {
        text?: string;
        prompts?: string[];
        error?: string;
      };

      const replyText = data.text;
      if (!response.ok || !replyText) throw new Error(data.error || "Something went wrong.");

      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", text: replyText },
      ]);
      setSuggestions(data.prompts ?? []);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          text:
            "I hit a small snag. Try sending that again, and we’ll get your next step sorted.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <main className="min-h-screen bg-[#f5f7f3] px-4 py-5 text-[#16201a] sm:px-8 sm:py-8">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-[#dfe7dc] bg-[#fbfcfa] shadow-[0_24px_70px_rgba(48,72,49,0.12)] lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="relative overflow-hidden bg-[#1e3d2a] p-7 text-[#f5f4e9] sm:p-10">
          <div className="absolute -right-20 top-20 h-56 w-56 rounded-full border-[28px] border-[#54715a] opacity-60" />
          <div className="absolute -bottom-16 -left-10 h-52 w-52 rounded-full bg-[#d8ee9a] opacity-90" />

          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#d8ee9a] text-lg font-black text-[#183924]">D</div>
              <span className="text-xl font-semibold tracking-tight">Demi</span>
              <span className="ml-auto rounded-full border border-[#5b7861] px-3 py-1 text-xs font-medium text-[#dce9d7]">Beta</span>
            </div>

            <div className="mt-14 max-w-md lg:mt-24">
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#d8ee9a]">Your starting point</p>
              <h1 className="text-4xl font-semibold leading-[1.06] tracking-[-0.04em] sm:text-5xl">
                Build a routine that feels like yours.
              </h1>
              <p className="mt-6 max-w-sm text-base leading-7 text-[#d4e0d2]">
                Smart training and straightforward nutrition guidance, one conversation at a time.
              </p>
            </div>

            <div className="mt-12 grid gap-3 sm:grid-cols-3 lg:mt-auto lg:grid-cols-1">
              {[
                ["01", "Start small", "Find a first week you can repeat."],
                ["02", "Eat with ease", "Build meals that support your goals."],
                ["03", "Keep going", "Adjust as your life and strength change."],
              ].map(([number, title, detail]) => (
                <div key={number} className="rounded-2xl border border-[#4c6b53] bg-[#244630]/80 p-4 backdrop-blur">
                  <p className="text-xs font-bold tracking-[0.16em] text-[#d8ee9a]">{number}</p>
                  <p className="mt-2 font-semibold">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-[#c9d9c8]">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-[620px] flex-col bg-[#fbfcfa]">
          <header className="flex items-center justify-between border-b border-[#e6ece3] px-6 py-5 sm:px-8">
            <div>
              <p className="text-sm font-medium text-[#66806c]">Conversation</p>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight">Let&apos;s find your rhythm</h2>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-[#e9f3e7] px-3 py-2 text-xs font-semibold text-[#397041]">
              <span className="h-2 w-2 rounded-full bg-[#4fa75b]" /> Coach is here
            </div>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-7 sm:px-8">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && (
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#d8ee9a] text-xs font-black text-[#183924]">D</div>
                )}
                <p
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-[15px] leading-6 shadow-sm ${
                    message.role === "assistant"
                      ? "rounded-tl-sm bg-white text-[#26352a] ring-1 ring-[#e5ebe2]"
                      : "rounded-tr-sm bg-[#264b32] text-white"
                  }`}
                >
                  {message.text}
                </p>
              </div>
            ))}
            {isSending && (
              <div className="flex gap-3">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-[#d8ee9a] text-xs font-black text-[#183924]">D</div>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-white px-4 py-4 ring-1 ring-[#e5ebe2]">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#77917d]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#77917d] [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#77917d] [animation-delay:240ms]" />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-[#e6ece3] px-6 py-5 sm:px-8">
            {suggestions.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    className="rounded-full border border-[#d6e4d2] bg-[#f7faf5] px-3 py-2 text-sm font-medium text-[#36563e] transition hover:border-[#9fbd9f] hover:bg-[#e9f3e7]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex items-end gap-3 rounded-2xl border border-[#d6e1d3] bg-white p-2 pl-4 shadow-sm focus-within:border-[#7ea282] focus-within:ring-4 focus-within:ring-[#dcebd8]">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Tell Demi what you’re working toward..."
                rows={1}
                className="max-h-28 min-h-11 flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 outline-none placeholder:text-[#91a093]"
              />
              <button
                type="submit"
                disabled={!input.trim() || isSending}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#264b32] text-lg text-white transition hover:bg-[#183924] disabled:cursor-not-allowed disabled:bg-[#b8c7b9]"
                aria-label="Send message"
              >
                ↑
              </button>
            </form>
            <p className="mt-3 text-center text-xs leading-5 text-[#829084]">Demi offers general wellness guidance, not medical advice.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
