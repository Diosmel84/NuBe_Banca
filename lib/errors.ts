import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class DomainError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Envuelve un handler: errores de dominio y validación salen limpios, el resto es 500 sin filtrar detalles. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Datos inválidos", issues: err.flatten().fieldErrors }, { status: 400 });
    }
    console.error("[api] error no controlado", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
