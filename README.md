# Demi

Demi is a personal trainer assistant that helps people get started with practical
workout and nutrition habits.

## Stack

- Next.js + TypeScript
- Tailwind CSS
- Bun

## Run locally

```sh
bun install
bun run dev
```

Then visit [http://localhost:3000](http://localhost:3000).

## Checks

```sh
bun test
bun run lint
bun run build
```

The initial assistant behavior and coaching guardrails live in
`src/lib/trainer.ts`. The chat endpoint is intentionally provider-agnostic for
now; the next milestone is connecting that system prompt and conversation state
to a model and Supabase.
