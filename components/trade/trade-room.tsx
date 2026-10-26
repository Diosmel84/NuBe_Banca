"use client";

import { AlertTriangle, BadgeCheck, Copy, FileUp, Send, ShieldCheck, Timer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ChatMessageDTO } from "@/lib/chat";
import { getSocket } from "@/lib/socket-client";
import type { TradeView } from "@/lib/trade-view";
import { cn } from "@/lib/utils";

const STATUS: Record<TradeView["status"], { label: string; variant: BadgeProps["variant"]; help: string }> = {
  IN_ESCROW: { label: "En escrow", variant: "default", help: "USDT bloqueados. El comprador debe transferir los pesos y subir el comprobante." },
  PAID: { label: "Pagado", variant: "secondary", help: "El comprador informó el pago. El vendedor verifica y libera." },
  RELEASED: { label: "Liberado", variant: "success", help: "Operación completada. USDT acreditados al comprador." },
  DISPUTED: { label: "En disputa", variant: "destructive", help: "Fondos congelados. Un operador de Juan revisa el caso." },
};

function useCountdown(deadlineIso: string, active: boolean) {
  const [left, setLeft] = useState(() => new Date(deadlineIso).getTime() - Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setLeft(new Date(deadlineIso).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadlineIso, active]);
  const clamped = Math.max(0, left);
  const mm = String(Math.floor(clamped / 60000)).padStart(2, "0");
  const ss = String(Math.floor((clamped % 60000) / 1000)).padStart(2, "0");
  return { text: `${mm}:${ss}`, expired: left <= 0 };
}

const ars = (v: string) => Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2 });

export function TradeRoom({ initial }: { initial: TradeView }) {
  const [trade, setTrade] = useState(initial);
  const [messages, setMessages] = useState<ChatMessageDTO[]>(initial.messages);
  const [draft, setDraft] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isBuyer = trade.role === "buyer";
  const status = STATUS[trade.status];
  const timer = useCountdown(trade.paymentDeadline, trade.status === "IN_ESCROW");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/p2p/trades/${trade.id}`, { cache: "no-store" });
    if (res.ok) {
      const v: TradeView = await res.json();
      setTrade(v);
      setMessages(v.messages);
    }
  }, [trade.id]);

  useEffect(() => {
    const s = getSocket();
    const join = () => {
      setConnected(true);
      s.emit("join-trade", trade.id, (r: { ok: boolean; error?: string }) => {
        if (!r.ok) setError(r.error ?? "No se pudo unir al chat");
      });
    };
    const onMsg = (m: ChatMessageDTO & { tradeId: string }) => {
      if (m.tradeId !== trade.id) return;
      setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
    };
    const onTrade = (p: { tradeId: string }) => {
      if (p.tradeId === trade.id) void refresh();
    };
    const onDisconnect = () => setConnected(false);

    if (s.connected) join();
    s.on("connect", join);
    s.on("disconnect", onDisconnect);
    s.on("new-message", onMsg);
    s.on("trade-updated", onTrade);
    return () => {
      s.off("connect", join);
      s.off("disconnect", onDisconnect);
      s.off("new-message", onMsg);
      s.off("trade-updated", onTrade);
    };
  }, [trade.id, refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    getSocket().emit("new-message", { tradeId: trade.id, content }, (r: { ok: boolean; error?: string }) => {
      if (r.ok) setDraft("");
      else setError(r.error ?? "No se pudo enviar");
    });
  }

  async function action(path: string, init?: RequestInit) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/p2p/trades/${trade.id}/${path}`, { method: "POST", ...init });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error ?? "Error");
    else await refresh();
  }

  async function uploadProof(file: File) {
    const fd = new FormData();
    fd.append("proof", file);
    await action("mark-paid", { body: fd });
    if (fileRef.current) fileRef.current.value = "";
  }

  const release = () =>
    action("release", { headers: { "Content-Type": "application/json" }, body: JSON.stringify(totp ? { totp } : {}) });

  const dispute = () => {
    if (confirm("¿Abrir disputa? Los fondos quedan congelados hasta que un operador resuelva.")) void action("dispute");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* -------- Izquierda: estado, timer, datos de pago -------- */}
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="hazard-stripe h-1" />
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{isBuyer ? "Comprás" : "Vendés"} {trade.amount} USDT</CardTitle>
            <Badge variant={status.variant}>{status.label}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{status.help}</p>

            {trade.status === "IN_ESCROW" && (
              <div className={cn("flex items-center gap-3 rounded-md border p-3", timer.expired ? "border-destructive" : "border-primary/40")}>
                <Timer className={cn("h-6 w-6", timer.expired ? "text-destructive" : "text-primary")} />
                <div>
                  <div className="text-xs uppercase text-muted-foreground">Tiempo para pagar</div>
                  <div className={cn("font-mono text-2xl font-black", timer.expired ? "text-destructive" : "text-primary")}>{timer.text}</div>
                </div>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Total a transferir</dt>
                <dd className="font-mono text-xl font-bold text-primary">${ars(trade.totalArs)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Precio</dt>
                <dd className="font-mono">${ars(trade.pricePerUsdt)} / USDT</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Medios de pago</dt>
                <dd>{trade.paymentMethod}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Comisión (0.8%)</dt>
                <dd className="font-mono">{trade.commission} USDT</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Vendedor</dt>
                <dd>@{trade.seller.alias}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Comprador</dt>
                <dd>@{trade.buyer.alias}</dd>
              </div>
            </dl>

            <div className="rounded-md border bg-background p-3 text-xs">
              <div className="mb-1 flex items-center gap-1 uppercase text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Escrow tx (simulada)
              </div>
              <button
                className="flex w-full items-center gap-2 break-all text-left font-mono text-muted-foreground hover:text-foreground"
                onClick={() => trade.escrowTxHash && navigator.clipboard.writeText(trade.escrowTxHash)}
              >
                {trade.escrowTxHash} <Copy className="h-3 w-3 shrink-0" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Contraparte:</span>
              <span className="font-semibold">@{trade.counterpart.alias}</span>
              {trade.counterpart.isJuanVerified && <BadgeCheck className="h-4 w-4 text-primary" />}
              <span className="text-xs text-muted-foreground">★ {trade.counterpart.reputation.toFixed(1)} · {trade.counterpart.completedTrades} trades</span>
            </div>

            {trade.hasProof && (
              <a href={`/api/p2p/trades/${trade.id}/proof`} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">
                Ver comprobante de pago →
              </a>
            )}

            {/* Acciones del vendedor */}
            {!isBuyer && trade.status === "PAID" && (
              <div className="space-y-2 rounded-md border border-primary/40 p-3">
                <p className="text-xs text-muted-foreground">Verificá en tu cuenta que entraron los pesos ANTES de liberar. No te guíes solo por el comprobante.</p>
                {trade.me.requires2FA && (
                  <Input placeholder="Código 2FA" value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" maxLength={6} className="font-mono tracking-widest" />
                )}
                <Button className="w-full" disabled={busy || (trade.me.requires2FA && totp.length !== 6)} onClick={release}>
                  Liberar {trade.amount} USDT
                </Button>
              </div>
            )}

            {(trade.status === "IN_ESCROW" || trade.status === "PAID") && (
              <Button variant="outline" className="w-full border-destructive/50 text-destructive" disabled={busy} onClick={dispute}>
                <AlertTriangle className="h-4 w-4" /> Abrir disputa
              </Button>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>

      {/* -------- Derecha: chat en tiempo real + comprobante -------- */}
      <Card className="flex h-[70vh] flex-col">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-3">
          <CardTitle className="text-base">Chat del trade</CardTitle>
          <span className={cn("flex items-center gap-1.5 text-xs", connected ? "text-emerald-400" : "text-muted-foreground")}>
            <span className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-400" : "bg-muted-foreground")} />
            {connected ? "En vivo" : "Reconectando…"}
          </span>
        </CardHeader>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">Sin mensajes. Nunca compartas contraseñas ni códigos 2FA por chat.</p>
          )}
          {messages.map((m) => {
            const mine = m.senderId === trade.me.id;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-secondary")}>
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p className={cn("mt-0.5 text-[10px]", mine ? "text-black/60" : "text-muted-foreground")}>
                    {new Date(m.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="space-y-2 border-t p-3">
          {isBuyer && trade.status === "IN_ESCROW" && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadProof(f);
                }}
              />
              <Button variant="secondary" className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
                <FileUp className="h-4 w-4" /> Subir comprobante y marcar como pagado
              </Button>
            </>
          )}
          <form onSubmit={sendMessage} className="flex gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escribí un mensaje…" maxLength={1000} disabled={!connected} />
            <Button type="submit" size="icon" disabled={!connected || !draft.trim()} aria-label="Enviar">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
