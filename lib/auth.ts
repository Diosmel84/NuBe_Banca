import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyUserTotp } from "@/lib/totp";

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(200),
  totp: z.string().optional(),
});

// Hash dummy para igualar tiempos cuando el email no existe (evita enumeración por timing).
let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("timing-equalizer", 12));

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Código 2FA", type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, totp } = parsed.data;

        await enforceRateLimit(`login:${email}`, 5, 60);

        const user = await prisma.user.findUnique({ where: { email } });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
        if (!user || !ok) return null;

        if (user.twoFASecret) {
          // El mensaje viaja como ?error=... al cliente; la UI muestra el campo TOTP.
          if (!totp) throw new Error("2FA_REQUIRED");
          if (!(await verifyUserTotp(user.id, user.twoFASecret, totp))) throw new Error("2FA_INVALID");
        }
        return { id: user.id, email: user.email, name: user.alias };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
};

/** Para route handlers: devuelve el userId o corta con 401. */
export async function requireUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) throw new DomainError(401, "No autenticado");
  return id;
}
