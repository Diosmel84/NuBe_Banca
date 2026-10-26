"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function NewOrderPage() {
  const router = useRouter();
  const [type, setType] = useState<"SELL" | "BUY">("SELL");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const body: Record<string, string> = { type };
    for (const [k, v] of form) if (typeof v === "string" && v.trim()) body[k] = v.trim();
    const res = await fetch("/api/p2p/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const firstIssue = data.issues ? Object.entries(data.issues as Record<string, string[]>)[0] : undefined;
      return setError(firstIssue ? `${firstIssue[0]}: ${firstIssue[1][0]}` : data.error ?? "Error");
    }
    router.push("/");
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Publicar orden</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(["SELL", "BUY"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "rounded-md border py-2 font-mono text-sm font-bold uppercase",
                  type === t ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {t === "SELL" ? "Vendo USDT" : "Compro USDT"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Monto USDT</Label>
              <Input id="amount" name="amount" inputMode="decimal" required className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pricePerUsdt">Precio ARS/USDT</Label>
              <Input id="pricePerUsdt" name="pricePerUsdt" inputMode="decimal" required className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minLimit">Mín. por trade</Label>
              <Input id="minLimit" name="minLimit" inputMode="decimal" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxLimit">Máx. por trade</Label>
              <Input id="maxLimit" name="maxLimit" inputMode="decimal" className="font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paymentMethod">Medios de pago</Label>
            <Input id="paymentMethod" name="paymentMethod" placeholder="MercadoPago, Transferencia" required />
          </div>
          {type === "SELL" && (
            <p className="text-xs text-muted-foreground">Validamos que tengas saldo libre. Los USDT se bloquean en escrow cuando alguien toma la orden.</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Publicando…" : "Publicar"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
