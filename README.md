# Keyaos

AI API gateway that pools credentials from multiple providers, automatically routes each request to the cheapest available upstream, and streams responses with zero added latency.

**The problem it solves:** You subscribe to multiple AI services — OpenRouter, DeepSeek, Google AI Studio, Gemini CLI, Kiro, and more. Each has its own API key, pricing, and quota. Keyaos unifies them behind a single OpenAI-compatible endpoint, so every request automatically uses the cheapest option available across all your providers.

Built entirely on Cloudflare Workers + D1 + Cron Triggers. Runs for **$0** on the free tier.

## Features

- **Cost-optimized routing** — Dispatcher ranks all available provider + credential combinations by effective cost and picks the cheapest one for each request.
- **Automatic failover** — If the selected upstream fails (quota exhausted, rate limited, etc.), the next cheapest option is tried automatically.
- **Zero-latency streaming** — SSE responses are tee'd and forwarded immediately; billing runs asynchronously via `waitUntil`.
- **Auto-synced model catalog** — Cron job keeps model availability and pricing up to date from upstream APIs.
- **Multi-protocol support** — OpenAI-compatible, Google v1internal (Gemini CLI / Antigravity), and AWS Event Stream (Kiro) protocols are all handled transparently.
- **11 providers integrated** — OpenRouter, ZenMux, DeepInfra, DeepSeek, Google AI Studio, OAIPro, OpenAI, Qwen Code, Gemini CLI, Antigravity, Kiro.

## Two Modes

Keyaos has a layered architecture with two deployment modes:

### Core (self-hosted)

Single-user mode for personal use. Authenticate with an `ADMIN_TOKEN`, add your own upstream API keys, and use the gateway as your unified AI endpoint. No accounts, no billing, no external dependencies beyond Cloudflare.

### Platform (multi-tenant)

Multi-user mode with Clerk authentication, Stripe-powered credits, and a shared credential pool. Users contribute their upstream credentials and earn credits when others use them; consumers pay credits to access the aggregated pool. Platform features are strictly additive — Core runs independently and never depends on Platform code.

## Quick Start

### 1. Create infrastructure

```bash
pnpm install
npx wrangler login
npx wrangler d1 create keyaos-db
```

### 2. Configure

Copy `wrangler.example.toml` to `wrangler.toml` and fill in:

- `database_id` — from the `d1 create` output
- `ADMIN_TOKEN` — a strong secret for dashboard and API authentication

For Platform mode, additionally configure Clerk and Stripe keys (see `.env.example`).

### 3. Deploy

```bash
pnpm db:setup:remote
pnpm deploy
```

The first time you open the dashboard, models will auto-sync from upstream providers.

## Local Development

```bash
cp .env.example .env.local   # fill in your provider keys
pnpm db:setup:local
pnpm dev
```

Open `http://localhost:5173` and log in with your `ADMIN_TOKEN`.

## Usage

Point any OpenAI-compatible client to your worker:

- **Base URL:** `https://keyaos.<you>.workers.dev/v1`
- **API Key:** your `ADMIN_TOKEN` (Core) or a platform-issued API key (Platform)

```bash
curl https://keyaos.<you>.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-4o-mini", "messages": [{"role": "user", "content": "Hello"}]}'
```

Works with any tool that supports custom OpenAI base URLs — Cursor, Continue, aider, LiteLLM, and more.

## How Routing Works

1. You request a model (e.g. `openai/gpt-4o-mini`)
2. Keyaos looks up which providers offer it and at what price
3. All your active credentials for those providers are ranked by `upstream_cost × price_multiplier`
4. The cheapest healthy credential is selected; if it fails, the next one is tried
5. The response streams back immediately; billing is recorded asynchronously

## Supported Providers

| Provider | Protocol | Pricing Source |
|----------|----------|---------------|
| OpenRouter | OpenAI | API (`usage.cost`) |
| DeepInfra | OpenAI | API (`usage.estimated_cost`) |
| ZenMux | OpenAI | Token calculation |
| DeepSeek | OpenAI | Token calculation |
| Google AI Studio | OpenAI | Token calculation |
| OAIPro | OpenAI | Token calculation |
| OpenAI | OpenAI | Token calculation |
| Qwen Code | OpenAI | Token calculation |
| Gemini CLI | Google v1internal | Token calculation |
| Antigravity | Google v1internal | Token calculation |
| Kiro | AWS Event Stream | Token calculation |

Adding a new OpenAI-compatible provider typically requires only a JSON model definition and a registry entry.

## License

[BSL 1.1](LICENSE) — free to self-host and use internally. Commercial hosting as a competing service requires a separate license. Converts to Apache 2.0 after four years.
