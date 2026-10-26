import { MarketBoard } from "@/components/market-board";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-3xl font-black uppercase">
          Mercado <span className="text-primary">USDT / ARS</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los pesos van directo entre las partes. Juan solo custodia los USDT en escrow hasta que el vendedor libera.
        </p>
      </div>
      <MarketBoard />
    </div>
  );
}
