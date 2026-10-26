"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      redirect: false,
      email: form.get("email"),
      password: form.get("password"),
      totp: form.get("totp") ?? "",
    });
    setLoading(false);
    if (res?.error === "2FA_REQUIRED") return setNeedsTotp(true);
    if (res?.error === "2FA_INVALID") return setError("Código 2FA incorrecto o ya usado");
    if (res?.error) return setError("Credenciales inválidas");
    // Solo rutas internas como destino post-login (evita open redirect).
    const cb = params.get("callbackUrl");
    const target = cb && cb.startsWith("/") && !cb.startsWith("//") ? cb : "/";
    router.push(target);
    router.refresh();
  }

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>Ingresar al taller</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {needsTotp && (
            <div className="space-y-1.5">
              <Label htmlFor="totp">Código 2FA</Label>
              <Input id="totp" name="totp" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" autoFocus required className="font-mono tracking-widest" />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Verificando…" : "Ingresar"}</Button>
          <p className="text-center text-xs text-muted-foreground">
            ¿No tenés cuenta? <Link href="/register" className="text-primary hover:underline">Registrate</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
