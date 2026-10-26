"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SecurityPage() {
  const [qr, setQr] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function start() {
    setMsg(null);
    const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Error" });
    setQr(data);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/2fa/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? "Error" });
    setQr(null);
    setMsg({ ok: true, text: "2FA activado. Se te va a pedir al ingresar y al liberar fondos." });
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Seguridad · 2FA TOTP</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Usá Google Authenticator, Aegis o similar. Con 2FA activo, liberar USDT exige el código.
        </p>
        {!qr && <Button onClick={start}>Configurar 2FA</Button>}
        {qr && (
          <form onSubmit={confirm} className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.qr} alt="QR 2FA" className="mx-auto rounded bg-white p-2" width={200} height={200} />
            <p className="break-all text-center font-mono text-xs text-muted-foreground">{qr.secret}</p>
            <div className="space-y-1.5">
              <Label htmlFor="code">Código de 6 dígitos</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} className="font-mono tracking-widest" />
            </div>
            <Button type="submit" className="w-full">Confirmar</Button>
          </form>
        )}
        {msg && <p className={msg.ok ? "text-sm text-emerald-400" : "text-sm text-destructive"}>{msg.text}</p>}
      </CardContent>
    </Card>
  );
}
