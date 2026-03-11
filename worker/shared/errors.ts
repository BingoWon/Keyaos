/**
 * Shared error types
 */

export class ApiError extends Error {
	constructor(
		message: string,
		public statusCode: number = 500,
		public type: string = "server_error",
		public code: string = "internal_error",
	) {
		super(message);
		this.name = "ApiError";
	}

	toJSON() {
		return {
			error: {
				message: this.message,
				type: this.type,
				code: this.code,
			},
		};
	}
}

export class AuthenticationError extends ApiError {
	constructor(message = "Invalid API key") {
		super(message, 401, "authentication_error", "invalid_api_key");
	}
}

export class BadRequestError extends ApiError {
	constructor(message: string, code = "bad_request") {
		super(message, 400, "invalid_request_error", code);
	}
}

export class NoKeyAvailableError extends ApiError {
	constructor(model: string) {
		super(
			`No API key available for model: ${model}`,
			503,
			"service_unavailable",
			"no_key_available",
		);
	}
}

export class CreditsExhaustedNoFallbackError extends ApiError {
	constructor(model: string) {
		super(
			`Insufficient credits and no own credential available for model: ${model}. Please top up credits or add a credential for this provider.`,
			402,
			"billing_error",
			"insufficient_credits_no_fallback",
		);
	}
}

export class KeyExpiredError extends ApiError {
	constructor() {
		super("API key has expired", 401, "authentication_error", "key_expired");
	}
}

export class KeyQuotaExceededError extends ApiError {
	constructor() {
		super("API key quota exceeded", 429, "billing_error", "key_quota_exceeded");
	}
}

export class ModelNotAllowedError extends ApiError {
	constructor(model: string) {
		super(
			`Model "${model}" is not allowed for this API key`,
			403,
			"permission_error",
			"model_not_allowed",
		);
	}
}

export class IpNotAllowedError extends ApiError {
	constructor() {
		super(
			"Request IP is not in the API key's allowlist",
			403,
			"permission_error",
			"ip_not_allowed",
		);
	}
}
