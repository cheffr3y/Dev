import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

class SignInServiceUnavailable extends CredentialsSignin {
  code = "service_unavailable";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
          });
        } catch (error) {
          console.error("[auth] Unable to query the user database", error);
          throw new SignInServiceUnavailable();
        }
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          homeVenueId: user.homeVenueId,
        };
      },
    }),
  ],
});
