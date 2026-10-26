import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { TradeRoom } from "@/components/trade/trade-room";
import { authOptions } from "@/lib/auth";
import { getTradeView } from "@/lib/trade-view";

export const dynamic = "force-dynamic";

export default async function TradePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(`/login?callbackUrl=/trade/${params.id}`);
  const view = await getTradeView(params.id, session.user.id);
  if (!view) notFound();
  return <TradeRoom initial={view} />;
}
