# Antigravity

Google DeepMind's advanced AI coding IDE. Uses Google's internal CodeAssist infrastructure with its own OAuth credentials, providing access to an expanded model catalog including Claude models via Google's proxy.

## Key Facts

| Item | Detail |
|------|--------|
| Provider ID | `antigravity` |
| Protocol | Google v1internal (same as Gemini CLI) |
| Auth | Google OAuth 2.0 (refresh token, reusable) |
| Base URL | `daily-cloudcode-pa.sandbox.googleapis.com` (primary) |
| Credential file | `~/.antigravity_tools/accounts/<uuid>.json` |
| Pricing source | Static JSON — no pricing API |
| OpenAI-compatible | No (native protocol with OpenAI conversion) |

## Architecture

Antigravity and Gemini CLI share a unified `GoogleOAuthAdapter` class (`providers/google-oauth-adapter.ts`), parameterized by OAuth credentials, base URLs, and optional request augmentation. Protocol conversion is handled by the shared `protocols/gemini-native.ts`:

```
OpenAI body → toGeminiRequest() → add userAgent/requestType/requestId → v1internal API
v1internal response → toOpenAIResponse() / createGeminiToOpenAIStream() → OpenAI body
```

### Differences from Gemini CLI

| Aspect | Gemini CLI | Antigravity |
|--------|-----------|-------------|
| OAuth Client ID | `681255809395-...` | `1071006060591-...` |
| Base URL | `cloudcode-pa.googleapis.com` | `daily-cloudcode-pa.sandbox.googleapis.com` |
| Extra fields | None | `userAgent`, `requestType`, `requestId` |
| Claude models | No | Yes (claude-sonnet-4-6, claude-opus-4-6-thinking) |
| Gemini 3.x | Limited | Full (high/low variants, 3.1) |

## Models

### Gemini Models (shared model_id with Gemini CLI)

- `google/gemini-2.5-pro` — Gemini 2.5 Pro
- `google/gemini-2.5-flash` — Gemini 2.5 Flash
- `google/gemini-2.5-flash-lite` — Gemini 2.5 Flash Lite
- `google/gemini-2.5-flash-thinking` — Gemini 2.5 Flash Thinking
- `google/gemini-3-flash` — Gemini 3 Flash
- `google/gemini-3-pro-high` — Gemini 3 Pro High
- `google/gemini-3-pro-low` — Gemini 3 Pro Low
- `google/gemini-3.1-pro-high` — Gemini 3.1 Pro High
- `google/gemini-3.1-pro-low` — Gemini 3.1 Pro Low

### Claude Models (unique to Antigravity)

- `anthropic/claude-sonnet-4-6` — Claude Sonnet 4.6 via Google proxy
- `anthropic/claude-opus-4-6-thinking` — Claude Opus 4.6 Thinking via Google proxy

## Credential Format

Users can paste either:

1. **Full account JSON** from `~/.antigravity_tools/accounts/<uuid>.json` — the adapter extracts `token.refresh_token`
2. **Just the refresh token** — starts with `1//`

The adapter auto-discovers the project ID via `loadCodeAssist` and caches it.

## Base URL Fallback

The adapter tries endpoints in order:

1. `daily-cloudcode-pa.sandbox.googleapis.com` (primary, newest features)
2. `daily-cloudcode-pa.googleapis.com` (alternative)
3. `cloudcode-pa.googleapis.com` (Gemini CLI endpoint, most stable)

## Verification

Test script: `scripts/verify/antigravity.mjs`
Results: `scripts/verify/antigravity.json`

Verified capabilities:
- OAuth token refresh with Antigravity client credentials
- Project discovery via loadCodeAssist
- Model listing via fetchAvailableModels (17 models including Claude)
- Non-streaming and streaming chat completion
- Claude model streaming (claude-sonnet-4-6)
- Cross-compatibility: same token works on Gemini CLI base URL
