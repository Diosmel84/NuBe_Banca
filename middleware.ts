import { withAuth } from "next-auth/middleware";

export default withAuth({ pages: { signIn: "/login" } });

export const config = { matcher: ["/trade/:path*", "/orders/:path*", "/settings/:path*"] };
