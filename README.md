# Keyaos (钥枢)

Keyaos is an **AI API Quota Aggregation and Scheduling Gateway**. It pools sparse API quotas scattered across different providers and accounts, exposing them as a single, unified, OpenAI-compatible API.

Instead of running AI inference, Keyaos acts as a pure resource scheduling layer—receiving requests, selecting the most cost-effective upstream API key from your pool, forwarding the request, and returning the stream with zero latency.

> 📖 For a detailed dive into the architecture and vision, read [docs/VISION.md](docs/VISION.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Features

- **Global Optimal Routing**: Always selects the cheapest active key for the requested model.
- **100% Transparent Proxy**: OpenAI-compatible. Streams are piped directly via SSE.
- **Automated Refresh**: Crons pull down fresh model pricing from upstream every 5 mins.
- **Multi-Provider Support**: OpenRouter, DeepInfra, ZenMux, and DeepSeek currently supported out-of-the-box. (Adding new ones takes 10 lines of config!)
- **Currency Agnostic**: Supports providers billing in non-USD natively (e.g., CNY for DeepSeek).

---

## Deployment (Cloudflare Workers)

Keyaos is built exclusively for the Cloudflare ecosystem (Workers + D1 Database + Cron Triggers). It costs **$0** to run under Cloudflare's generous free tier.

**Prerequisites:**
- Node.js (>= 18)
- `pnpm` installed
- A free Cloudflare account

### Step 1: Install Dependencies
```bash
pnpm install
```

### Step 2: Create the D1 Database
Log into Cloudflare via CLI:
```bash
npx wrangler login
```

Create a new D1 database named `keyaos-db`:
```bash
npx wrangler d1 create keyaos-db
```
*The command will output a `database_id`. Save it for the next step.*

### Step 3: Configure `wrangler.toml`
Open `wrangler.toml` and update two things:
1. Replace `YOUR_D1_DATABASE_ID_HERE` with the ID you got from Step 2.
2. Change `ADMIN_TOKEN = "admin"` to a strong, secure secret password. **This will be your universal API Key for accessing Keyaos.**

### Step 4: Initialize the Database (Remote)
Apply the initial SQL migration to your newly created production database:
```bash
pnpm db:setup:remote
```

### Step 5: Deploy!
Ship the code to Cloudflare's edge:
```bash
pnpm deploy
```
*Cloudflare will provide you with a `.workers.dev` URL. This is your API Base URL.*

---

## Local Development & Testing

If you want to run Keyaos locally to test or modify it, you use the local `dev` environment.

1. **Initialize Local Database**:
   ```bash
   pnpm db:setup:local
   ```
2. **Start the local server**:
   ```bash
   pnpm dev
   ```
3. **Open the Dashboard**:
   Visit `http://localhost:5173`. Use the `ADMIN_TOKEN` from your `wrangler.toml` to log in.

### ⚠️ Important Note about Models in Local Dev
In a real Cloudflare deployment, Cron Triggers run every 5 minutes to fetch upstream models and pricing. **In local development (`pnpm dev`), Cron jobs DO NOT run automatically.**

When you first start locally, your **Models page will be empty**. You must go to the **Models** page in the UI and click the **[Refresh Models]** button to manually populate the local database with up-to-date models.

---

## Usage

Once deployed, point your favorite AI client (Cursor, Windsurf, generic OpenAI SDK scripts) to your Keyaos worker url:

* **Base URL**: `https://keyaos.<your-username>.workers.dev/v1`
* **API Key**: `YOUR_ADMIN_TOKEN` (from `wrangler.toml`)
