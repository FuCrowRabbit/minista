export class NotFoundError extends Error {
  public readonly fallback404Html: string
  static {
    this.prototype.name = "NotFoundError"
  }
  constructor(fallback404Html: string, message: string = "", options: ErrorOptions = {}) {
    super(message, options);
    this.fallback404Html = fallback404Html;
  }
}

export class MarkupEmpty404PageError extends Error {
  static {
    this.prototype.name = "MarkupEmpty404PageError"
  }
}