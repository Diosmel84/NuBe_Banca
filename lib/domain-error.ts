/**
 * Error de negocio con status HTTP. Vive aparte de lib/errors.ts a propósito:
 * no importa nada de Next, así server.ts (y lo que carga: chat, rate limit, job)
 * puede usarlo antes de que Next 16 inicialice su runtime.
 */
export class DomainError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
