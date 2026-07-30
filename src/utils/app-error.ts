export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errors?: unknown[];

  constructor(
    message: string,
    statusCode: number,
    errors?: unknown[]
  ) {
    super(message);

    this.statusCode = statusCode;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}