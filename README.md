<p align="center">
  <img src="https://keyaos.com/logo.png" width="80" height="80" alt="Keyaos Logo" />
</p>

<h1 align="center">Keyaos（氪钥枢）</h1>

<p align="center">
  Open-source AI API gateway — pool credentials, auto-route to the cheapest provider, stream with zero latency.
</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/BingoWon/Keyaos">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-supported-providers">Providers</a> ·
  <a href="#-usage">Usage</a> ·
  <a href="LICENSE">License</a>
</p>

---

You subscribe to multiple AI services — OpenRouter, DeepSeek, Google AI Studio, Gemini CLI, Kiro, and more. Each has its own API key, pricing, and quota. **Keyaos unifies them behind a single OpenAI-compatible endpoint**, so every request automatically uses the cheapest option across all your providers.

Built entirely on **Cloudflare Workers + D1 + Cron Triggers**. Runs for $0 on the free tier.

## ✨ Features

- 💰 **Cost-optimized routing** — always picks the cheapest provider + credential combo
- 🔄 **Automatic failover** — quota exhausted or rate limited? Next cheapest option kicks in
- ⚡ **Zero-latency streaming** — SSE responses tee'd and forwarded immediately
- 📊 **Auto-synced catalog** — Cron keeps model availability and pricing up to date
- 🔌 **Multi-protocol** — OpenAI, Anthropic, Google v1internal, AWS Event Stream
- 🏗️ **Two modes** — self-hosted (single user) or platform (multi-tenant with Clerk + Stripe)

## 🚀 Quick Start

### One-Click Deploy

Click the **Deploy to Cloudflare** button above, then set one secret:

```bash
npx wrangler secret put ADMIN_TOKEN
```

Done — D1 database, Cron Triggers, and schema are provisioned automatically.

### Manual Setup

```bash
pnpm install
npx wrangler login
npx wrangler d1 create keyaos-db    # update database_id in wrangler.toml
npx wrangler secret put ADMIN_TOKEN
pnpm deploy                          # applies migrations + deploys
```

### Local Development

```bash
cp .env.example .env.local           # fill in provider keys
cp .dev.vars.example .dev.vars       # fill in secrets (ADMIN_TOKEN, etc.)
pnpm db:setup:local
pnpm dev                             # http://localhost:5173
```

## 🔧 Usage

Point any OpenAI-compatible client at your Worker:

```bash
curl https://keyaos.<you>.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-4o-mini", "messages": [{"role": "user", "content": "Hello"}]}'
```

Works with Cursor, Continue, aider, LiteLLM, and any tool that supports custom OpenAI base URLs.

## ⚙️ How Routing Works

```
Request → Model lookup → Rank credentials by (cost × multiplier) → Cheapest healthy key → Stream response
                                                                    ↳ fail? → next key
```

## 🌐 Supported Providers

| Provider | Protocol | Pricing |
|----------|----------|---------|
| OpenRouter | OpenAI | `usage.cost` from API |
| DeepInfra | OpenAI | `usage.estimated_cost` from API |
| ZenMux | OpenAI | Token × model price |
| DeepSeek | OpenAI | Token × model price |
| Google AI Studio | OpenAI | Token × model price |
| OAIPro | OpenAI | Token × model price |
| OpenAI | OpenAI | Token × model price |
| Qwen Code | OpenAI | Token × model price |
| Gemini CLI | Google v1internal | Token × model price |
| Antigravity | Google v1internal | Token × model price |
| Kiro | AWS Event Stream | Token × model price |

Adding a new OpenAI-compatible provider requires only a JSON model definition and a registry entry.

## 🏛️ Architecture

```
Core (self-hosted)        Platform (multi-tenant)
├── Credential pool       ├── Everything in Core, plus:
├── Cost-optimal routing  ├── Clerk authentication
├── Multi-protocol proxy  ├── Stripe credits & auto top-up
├── Auto-sync catalog     ├── Shared credential marketplace
└── ADMIN_TOKEN auth      └── Admin console & analytics
```

Platform is strictly additive — Core runs independently and never depends on Platform.

<details>
<summary>📋 Platform Secrets</summary>

```bash
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put PLATFORM_OWNER_ID
npx wrangler secret put VITE_CLERK_PUBLISHABLE_KEY
```

See `.dev.vars.example` and `.env.example` for all configuration options.

</details>

## 📄 License

[BSL 1.1](LICENSE) — free to self-host and use. Commercial hosting as a competing service requires a separate license. Converts to Apache 2.0 after four years.
