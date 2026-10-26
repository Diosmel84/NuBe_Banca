import { Prisma } from "@prisma/client";
import { z } from "zod";

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export const COMMISSION_RATE = new Decimal(process.env.COMMISSION_RATE ?? "0.008");
export const PAYMENT_WINDOW_MINUTES = Number(process.env.PAYMENT_WINDOW_MINUTES ?? 30);

export const round2 = (d: Decimal): Decimal => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Monto positivo con hasta 2 decimales. Acepta string o number, devuelve Decimal (nunca float). */
export const moneySchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), "Monto inválido (máx. 2 decimales)")
  .transform((v) => new Decimal(v))
  .refine((d) => d.gt(0), "El monto debe ser mayor a 0");
