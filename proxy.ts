import { withAuth } from "next-auth/middleware";

// Next 16 renombró middleware -> proxy. withAuth sigue sirviendo: solo valida el JWT de la cookie.
export default withAuth({ pages: { signIn: "/login" } });

export const config = { matcher: ["/trade/:path*", "/orders/:path*", "/settings/:path*"] };
