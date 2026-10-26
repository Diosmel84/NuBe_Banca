"use client";

import { Wrench } from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function Nav() {
  const { data: session, status } = useSession();

  return (
    <header className="border-b border-border bg-card/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-mono text-lg font-black uppercase tracking-tight">
          <Wrench className="h-5 w-5 text-primary" />
          Juan <span className="text-primary">Mecánico</span> P2P
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/" className="px-2 text-muted-foreground hover:text-foreground">Mercado</Link>
          {session ? (
            <>
              <Link href="/orders/new" className="px-2 text-muted-foreground hover:text-foreground">Publicar</Link>
              <Link href="/settings/security" className="px-2 text-muted-foreground hover:text-foreground">Seguridad</Link>
              <span className="hidden font-mono text-primary sm:inline">@{session.user.name}</span>
              <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>Salir</Button>
            </>
          ) : status !== "loading" ? (
            <>
              <Link href="/login"><Button variant="outline" size="sm">Ingresar</Button></Link>
              <Link href="/register"><Button size="sm">Crear cuenta</Button></Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
