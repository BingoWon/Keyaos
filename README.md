# Keyaos

AI API quota aggregation and scheduling gateway. Pools API keys from multiple providers, routes requests to the cheapest available upstream, and returns streams with zero added latency.

Built on Cloudflare Workers + D1 + Cron Triggers. Runs for **$0** on the free tier.

## Quick Start

```bash
pnpm install
npx wrangler login
npx wrangler d1 create keyaos-db
```

Copy `wrangler.example.toml` to `wrangler.toml`, fill in your `database_id` and set a strong `ADMIN_TOKEN`.

```bash
pnpm db:setup:remote
pnpm deploy
```

## Local Development

```bash
pnpm db:setup:local
pnpm dev
```

Open `http://localhost:5173` and log in with your `ADMIN_TOKEN`. Click **Refresh Models** on the Models page to populate the local database (cron does not run locally).

## Usage

Point any OpenAI-compatible client to your worker:

- **Base URL**: `https://keyaos.<you>.workers.dev/v1`
- **API Key**: your `ADMIN_TOKEN`

## License

[BSL 1.1](LICENSE) — free to self-host and use internally. Commercial hosting as a competing service requires a separate license. Converts to Apache 2.0 after four years.
