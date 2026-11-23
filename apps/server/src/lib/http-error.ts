export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFound(entity: string): HttpError {
  return new HttpError(404, "not_found", `${entity} not found`);
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, "bad_request", message);
}

export function unauthorized(message = "Authentication required"): HttpError {
  return new HttpError(401, "unauthorized", message);
}
