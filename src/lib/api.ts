export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function asObject(value: unknown, label = "request body") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(`${label} must be an object`, 400);
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(`${label} must contain at least one item`, 400);
  }
  return value;
}

export function asString(value: unknown, label: string, required = true) {
  if (typeof value !== "string" || (required && !value.trim())) {
    throw new ApiError(`${label} must be a${required ? " non-empty" : ""} string`, 400);
  }
  return value.trim();
}

export function asPositiveNumber(value: unknown, label: string, allowZero = false) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) {
    throw new ApiError(`${label} must be ${allowZero ? "zero or greater" : "greater than zero"}`, 400);
  }
  return number;
}

export async function readJson(request: Request) {
  try {
    return asObject(await request.json());
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Request body must be valid JSON", 400);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}
