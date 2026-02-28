# DeepInfra Integration

DeepInfra provides a direct OpenAI-compatible API to access open-source LLMs and embedding models.

## Connection Details

| Item | Value |
|------|-------|
| Base URL | `https://api.deepinfra.com/v1/openai` |
| Format | OpenAI Compatible |
| Token Format | Bearer Token (alphanumeric string) |
| Models Endpoint | `GET /v1/openai/models` (public, no auth required) |

## Models API Response Structure

Returns `data[]` with each model containing:

```json
{
  "id": "Qwen/Qwen3-Max",
  "object": "model",
  "owned_by": "deepinfra",
  "metadata": {
    "description": "...",
    "context_length": 131072,
    "pricing": {
      "input_tokens": 0.04,
      "output_tokens": 0.13
    }
  }
}
```

- Pricing is nested under `metadata.pricing`, NOT at the top level
- Values are native numbers representing USD per 1M tokens
- **No `name` or `display_name` field** — only `id` is available
- **Case-sensitive API**: model IDs must use original HuggingFace casing (e.g., `Qwen/Qwen3-Max`, not `qwen/qwen3-max`)

## model_id Normalization

DeepInfra returns HuggingFace-style model IDs with mixed case (e.g., `Qwen/Qwen3-Max`), while Keyaos uses OpenRouter's lowercase format as canonical (`qwen/qwen3-max`). See [ADR-013](../decisions/013-openrouter-first.md).

During sync:
- `model_id` is lowercased for canonical matching, routing, and display
- `upstream_model_id` preserves the original casing for API forwarding

## Chat Completion Billing Response (Verified 2026-02-20)

DeepInfra returns **estimated cost data** in the `usage` field of both streaming and non-streaming responses:

```json
{
  "usage": {
    "prompt_tokens": 16,
    "completion_tokens": 9,
    "total_tokens": 25,
    "estimated_cost": 0.00000181
  }
}
```

**Key fact**: `usage.estimated_cost` provides the USD cost estimate, enabling cost verification without manual calculation.

## Supported Endpoints

- `/v1/chat/completions` (Streaming & Regular)
- `/v1/completions` (Streaming & Regular)
- `/v1/embeddings`
- `/v1/images/generations` (`b64_json` output only)

## Integration Notes

- Only models that also exist on OpenRouter are synced (see [ADR-013](../decisions/013-openrouter-first.md)).
- Works out-of-the-box with the OpenAI Node.js and Python SDKs by setting `baseURL`.
