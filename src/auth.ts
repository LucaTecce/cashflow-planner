import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = CredentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const res = await pool.query(
          "SELECT id, email, password_hash, name FROM users WHERE email = $1 LIMIT 1",
          [email],
        );
        const user = res.rows[0];
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        (session.user as any).id = token.uid;
      }
      return session;
    },
  },
});
