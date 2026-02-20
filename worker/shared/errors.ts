/**
 * Shared error utilities
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

export class InsufficientBalanceError extends ApiError {
	constructor(message = "Insufficient balance") {
		super(message, 402, "billing_error", "insufficient_balance");
	}
}

export class BadRequestError extends ApiError {
	constructor(message: string) {
		super(message, 400, "invalid_request_error", "bad_request");
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

export class UpstreamError extends ApiError {
	constructor(
		message: string,
		statusCode: number,
		public provider: string,
	) {
		super(message, statusCode, "upstream_error", "upstream_request_failed");
	}
}
