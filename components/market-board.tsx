"use client";

import { BadgeCheck, Clock, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSocket } from "@/lib/socket-client";
import { cn } from "@/lib/utils";

interface MarketOrder {
  id: string;
  type: "BUY" | "SELL";
  amount: string;
  pricePerUsdt: string;
  paymentMethod: string;
  minLimit: string | null;
  maxLimit: string | null;
  user: { id: string; alias: string; reputation: number; completedTrades: number; avgReleaseMinutes: number; isJuanVerified: boolean };
}

const ars = (v: string) => Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });

export function MarketBoard() {
  const router = useRouter();
  const { data: session } = useSession();
  // "SELL" = órdenes de venta, o sea: yo compro.
  const [side, setSide] = useState<"SELL" | "BUY">("SELL");
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/market?type=${side}`, { cache: "no-store" });
    if (res.ok) setOrders(await res.json());
  }, [side]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!session) return;
    const s = getSocket();
    const onUpdate = () => void load();
    s.on("market-updated", onUpdate);
    return () => {
      s.off("market-updated", onUpdate);
    };
  }, [session, load]);

  async function accept(order: MarketOrder) {
    if (!session) return router.push("/login");
    setBusy(order.id);
    setError(null);
    const amount = amounts[order.id]?.trim();
    const res = await fetch(`/api/p2p/orders/${order.id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(amount ? { amount } : {}),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "No se pudo tomar la orden");
    router.push(`/trade/${data.tradeId}`);
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border p-1">
        {(["SELL", "BUY"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cn(
              "rounded px-4 py-1.5 font-mono text-sm font-bold uppercase",
              side === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "SELL" ? "Comprar USDT" : "Vender USDT"}
          </button>
        ))}
      </div>

      {error && <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Anunciante</th>
              <th className="p-3">Precio</th>
              <th className="p-3">Disponible / Límites</th>
              <th className="p-3">Pago</th>
              <th className="p-3 text-right">Operar</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">No hay órdenes abiertas. El taller está tranquilo.</td>
              </tr>
            )}
            {orders.map((o) => {
              const mine = o.user.id === session?.user.id;
              return (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="p-3">
                    <div className="flex items-center gap-1.5 font-semibold">
                      @{o.user.alias}
                      {o.user.isJuanVerified && <BadgeCheck className="h-4 w-4 text-primary" aria-label="Verificado por Juan" />}
                    </div>
                    <div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Star className="h-3 w-3" />{o.user.reputation.toFixed(1)}</span>
                      <span>{o.user.completedTrades} trades</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />~{o.user.avgReleaseMinutes} min</span>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-lg font-bold text-primary">${ars(o.pricePerUsdt)}</td>
                  <td className="p-3 font-mono">
                    <div>{o.amount} USDT</div>
                    <div className="text-xs text-muted-foreground">
                      {o.minLimit ?? "—"} – {o.maxLimit ?? o.amount} USDT
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {o.paymentMethod.split(",").map((m) => (
                        <Badge key={m} variant="secondary">{m.trim()}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
                      <Input
                        className="h-8 w-24 font-mono"
                        placeholder={o.maxLimit ?? o.amount}
                        inputMode="decimal"
                        value={amounts[o.id] ?? ""}
                        onChange={(e) => setAmounts((a) => ({ ...a, [o.id]: e.target.value }))}
                        disabled={mine}
                      />
                      <Button size="sm" disabled={mine || busy === o.id} onClick={() => accept(o)}>
                        {mine ? "Tuya" : side === "SELL" ? "Comprar" : "Vender"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
