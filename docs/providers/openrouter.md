# OpenRouter Integration

OpenRouter is a unified API aggregator routing requests to dozens of underlying LLM providers through a single endpoint.

## Connection Details

| Item | Value |
|------|-------|
| Base URL | `https://openrouter.ai/api/v1` |
| Format | OpenAI Compatible |
| Token Format | Bearer Token (`sk-or-v1-*`) |
| Models Endpoint | `GET /api/v1/models` (public, no auth required) |
| Credits Endpoint | `GET /api/credits` (requires auth) |

## Models API Response Structure

Returns `data[]` with each model containing:

```json
{
  "id": "google/gemini-2.5-pro",
  "name": "Google: Gemini 2.5 Pro",
  "pricing": {
    "prompt": "0.000002",
    "completion": "0.000012",
    "image": "0.000002",
    "internal_reasoning": "0.000012",
    "input_cache_read": "0.0000002",
    "input_cache_write": "0.000000375"
  },
  "context_length": 1048576,
  "architecture": { "modality": "text+image+file+audio+video->text" }
}
```

- **Pricing values are strings** (not numbers), representing USD per token
- Must `parseFloat()` and multiply by 1,000,000 to normalize to USD/M tokens
- Includes granular pricing for image, audio, cache, and reasoning tokens
- `name` field provides a human-readable display name

## Chat Completion Billing Response (Verified 2026-02-20)

OpenRouter returns **full cost data** in the `usage` field of both streaming and non-streaming responses:

```json
{
  "usage": {
    "prompt_tokens": 16,
    "completion_tokens": 9,
    "total_tokens": 25,
    "cost": 0.00000181,
    "cost_details": {
      "upstream_inference_cost": 0.00000181,
      "upstream_inference_prompt_cost": 6.4e-7,
      "upstream_inference_completions_cost": 0.00000117
    }
  }
}
```

**Key fact**: `usage.cost` provides the actual USD cost charged by OpenRouter, enabling precise billing without needing to calculate from token counts.

## Integration Notes

- **Canonical model catalog**: OpenRouter serves as the single source of truth for the model catalog. Only models present in OpenRouter are synced from other providers. See [ADR-013](../decisions/013-openrouter-first.md).
- **Sort order**: The order of models returned by the `/models` API is preserved as `sort_order` in the database, reflecting OpenRouter's curated ranking by popularity, quality, and recency.
- Requires `stream_options: { include_usage: true }` in the request body to receive token accounting in streaming responses.
