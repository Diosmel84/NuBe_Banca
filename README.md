# Juan Mecánico P2P Wallet — MVP

Marketplace P2P de **USDT (TRC20) ↔ ARS**. La plataforma **no toca pesos**: los ARS se transfieren directo entre las partes. Juan solo hace **escrow de USDT** (custodia interna, saldo en DB) hasta que el vendedor confirma el cobro y libera.

> ⚠️ **On-chain simulado.** No hay integración con TronGrid ni wallets reales. `escrowTxHash` es un hash aleatorio de 64 hex. Los saldos viven en Postgres.

## Stack

Next.js 14 (App Router) · TypeScript strict · Tailwind + componentes shadcn/ui · Prisma + PostgreSQL · Socket.io (server custom) · NextAuth (Credentials + JWT) con 2FA TOTP · Redis (rate limit, anti-replay TOTP).

## Levantar en local

Requisitos: Node 20+, Docker.

```bash
cp .env.example .env              # completar NEXTAUTH_SECRET y ENCRYPTION_MASTER_KEY
docker compose up -d              # postgres:16 + redis:7
npm install
npm run db:migrate                # aplica migraciones (incluye trigger de inmutabilidad)
npm run db:seed                   # usuarios demo + órdenes
npm run dev                       # http://localhost:3000 (Next + Socket.io en el mismo puerto)
```

Generar los secretos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Usuarios demo (solo dev): `juan@demo.test` (1000 USDT, verificado) y `comprador@demo.test` (50 USDT). Password: `JuanDemo2024!`.
Probá el flujo con dos navegadores (o uno en incógnito).

Producción: `npm run build && npm start`.

## Flujo de un trade

```
Orden SELL (OPEN) ──accept──▶ Trade IN_ESCROW ──mark-paid──▶ PAID ──release──▶ RELEASED
                     │ usdtBalance→lockedBalance    │ comprobante        │ locked → comprador (−0.8%)
                     └──────────── dispute (IN_ESCROW | PAID) ──────────▶ DISPUTED (fondos congelados)
```

- **Quién es vendedor:** en una orden `SELL` el maker vende y el taker compra. En una orden `BUY` es al revés: el taker es el vendedor y sus USDT son los que se bloquean.
- **Tomas parciales:** `P2POrder.amount` es el monto **restante**. Cada `accept` lo decrementa. Cuando llega a 0 la orden pasa a `IN_ESCROW`, y a `RELEASED` cuando todos sus trades se liberaron.
- **Límites** (`minLimit`/`maxLimit`) en USDT por trade. Si el restante es menor al mínimo, se puede tomar el restante completo.
- **Comisión 0.8%:** se calcula en el accept (`P2PTrade.commission`) y se descuenta al comprador al liberar. Queda asentada como `TRADE (+bruto)` y `COMMISSION (−fee)`.

## API

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| POST | `/api/auth/register` | público | `{ email, alias, password }`. Crea usuario + wallet. |
| POST | `/api/auth/2fa/setup` | logueado | Genera secreto TOTP pendiente (Redis, 10 min) y QR. |
| POST | `/api/auth/2fa/enable` | logueado | `{ code }`. Activa 2FA si el código es válido. |
| POST | `/api/p2p/orders` | logueado | `{ type, amount, pricePerUsdt, paymentMethod, minLimit?, maxLimit? }`. Si es SELL valida saldo libre menos órdenes SELL abiertas. |
| POST | `/api/p2p/orders/:id/accept` | logueado (≠ maker) | `{ amount? }`. Bloquea USDT del vendedor, crea `P2PTrade`, emite socket. **10 req/min.** |
| GET | `/api/p2p/trades/:id` | partes | Vista del trade + mensajes descifrados. |
| POST | `/api/p2p/trades/:id/mark-paid` | comprador | `multipart/form-data` con `proof` (PNG/JPG/PDF, ≤5 MB). `IN_ESCROW → PAID`. |
| GET | `/api/p2p/trades/:id/proof` | partes | Sirve el comprobante con control de acceso. |
| POST | `/api/p2p/trades/:id/release` | vendedor | `{ totp? }`. Solo desde `PAID`. Exige TOTP si el vendedor tiene 2FA. **10 req/min.** |
| POST | `/api/p2p/trades/:id/dispute` | partes | `IN_ESCROW | PAID → DISPUTED`. |
| GET | `/api/market?type=SELL\|BUY` | público | Órdenes `OPEN` con reputación del anunciante. |

## Socket.io

Mismo puerto que Next (`server.ts`). El handshake se autentica con la cookie JWT de NextAuth; sin sesión válida no hay conexión.

| Evento | Dirección | Payload |
|---|---|---|
| `join-trade` | cliente → server | `tradeId` (ack `{ ok }`). Solo comprador o vendedor. Room = `tradeId`. |
| `new-message` | cliente → server | `{ tradeId, content }` (≤1000 chars, 30 msg/min). Se re-verifica membresía en cada mensaje. |
| `new-message` | server → room | `{ tradeId, id, senderId, content, createdAt }` |
| `trade-updated` | server → room + rooms personales de ambas partes | `{ tradeId, status, at }` |
| `market-updated` | server → todos | sin payload; el mercado recarga. |

## Seguridad: qué hay y qué NO

**Implementado**

- **Saldos sin race conditions:** toda mutación usa `updateMany` con condición en el `WHERE` (`usdtBalance >= monto`, `status = 'PAID'`, etc.) dentro de `$transaction`. Dos requests concurrentes no pueden gastar el mismo saldo ni liberar dos veces.
- **Release solo desde `PAID`** y solo por el vendedor del trade: se valida en la misma sentencia que cambia el estado.
- **Log inmutable:** la tabla `Transaction` tiene un trigger de Postgres que rechaza `UPDATE` y `DELETE`. Montos con signo y `balanceAfter` (saldo libre luego del asiento).
- **Rate limit en Redis:** 10/min en accept y release, 5/min login por email, 5/min registro por IP. Si Redis cae, **falla cerrado** (503).
- **2FA TOTP:** secreto cifrado en DB con AES-256-GCM, ventana ±1 paso, anti-replay (un código no se acepta dos veces). Requerido en login y en release si está activo.
- **Chat cifrado en reposo:** AES-256-GCM con clave por trade derivada por HKDF de `ENCRYPTION_MASTER_KEY`, tradeId como AAD.
- **Comprobantes:** validados por magic bytes, nombre generado por el server, guardados fuera de `public/` y servidos solo a las partes.
- Passwords con bcrypt (cost 12), comparación de tiempo constante ante emails inexistentes, montos como `Decimal` (nunca float), validación con zod en todos los endpoints, sin open redirect post-login.

**Honestidad sobre los límites del MVP**

- **El chat NO es end-to-end.** Viaja en claro por el socket (cifrado por TLS en producción) y se cifra al guardarlo. El server puede leerlo, igual que en Binance P2P, porque los operadores lo necesitan para resolver disputas.
- **No hay resolución de disputas** ni panel de admin: un trade `DISPUTED` deja los USDT en `lockedBalance` hasta que alguien lo resuelva a mano en DB.
- **No hay cancelación por timeout:** el timer de 30 min es solo visual. `TradeStatus` no tiene `CANCELLED` (según el spec), así que hace falta agregar ese estado más un job que devuelva el locked al vendedor.
- **No hay depósitos ni retiros reales.** El saldo inicial sale del seed (`DEPOSIT`).
- **Sin cuenta de plataforma:** la comisión se descuenta al comprador y queda en el log, pero no se acredita en ninguna wallet de Juan.
- `avgReleaseMinutes` se mide desde la creación del trade, no desde el `PAID`, porque el modelo no tiene `paidAt`.
- 2FA es opcional. Para producción conviene hacerlo obligatorio para publicar SELL y para liberar.
- Rate limit de ventana fija: permite ráfagas en el borde entre ventanas.

## ⚠️ Next.js 14 tiene advisories sin parche

El spec pide Next 14. Al 2026-10, `npm audit` marca **critical** para toda la línea 14.x (la última es 14.2.35), y la única corrección es pasar a Next 16. Varias no aplican a este proyecto: no usa `next/image`, rewrites, Server Actions ni i18n. Pero hay una que sí: **"Unauthenticated RCE on windows-hosted servers" (GHSA-p293-qw3h-jr36)**.
**No lo pongas en producción con Next 14.** Para dev local alcanza, pero antes de deployar hay que migrar a Next 15/16 (params async en route handlers, `next.config.ts`).
`zod` 3.x también tiene un advisory high (GHSA-mrhx-c7xc-m3w5, memoria con colecciones grandes). Acá no se validan arrays, así que el impacto es bajo, pero se corrige con zod 4.

## Cambios respecto del spec

- `User.passwordHash` y `User.createdAt`: sin hash no hay login seguro con NextAuth Credentials.
- Relaciones Prisma, índices y `@db.Decimal(12,2)` en todos los montos (`totalArs` en `16,2`).
- `P2POrder.amount` = monto restante, para soportar tomas parciales con `minLimit`/`maxLimit`.

## Estructura

```
server.ts                  Next + Socket.io (auth del handshake, chat, rooms)
middleware.ts              protege /trade, /orders, /settings
lib/escrow.ts              lógica de dinero: createOrder, acceptOrder, markPaid, releaseTrade, openDispute
lib/crypto.ts              AES-256-GCM + HKDF, txHash simulado
lib/totp.ts                2FA con anti-replay
lib/rate-limit.ts          Redis fixed window
lib/chat.ts, trade-view.ts chat cifrado y vista del trade
app/api/...                endpoints
app/trade/[id]             pantalla del trade (estado/timer/pago | chat/comprobante)
prisma/migrations          SQL inicial + trigger de inmutabilidad
```
