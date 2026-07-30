import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";

import { prisma } from "./lib/prisma";

export default {
  pages: {
    signIn: "/login",
  },

  session: {
    strategy: "jwt",
  },

  providers: [
    Credentials({
      name: "Credentials",

      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },

        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          const user = await prisma.user.findUnique({
            where: {
              email: String(credentials.email),
            },
            include: {
              memberships: {
                where: {
                  active: true,
                },
                include: {
                  company: true,
                  roles: {
                    include: {
                      role: true,
                    },
                  },
                },
                orderBy: {
                  isDefault: "desc",
                },
              },
            },
          });

        if (!user) return null;

        if (!user.active) return null;

        const validPassword = await bcrypt.compare(
          String(credentials.password),
          user.password
        );

          if (!validPassword) return null;

          const membership = user.memberships[0];

          if (!membership) return null;

          return {
            id: user.id,
            name: `${user.firstName} ${user.lastName}`.trim(),
            email: user.email,
            membershipId: membership.id,
            companyId: membership.companyId,
            companyName: membership.company.name,
            roles: membership.roles.map(({ role }) => role.code),
          };
        },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
        token.membershipId = user.membershipId;
        token.companyId = user.companyId;
        token.companyName = user.companyName;
        token.roles = user.roles;
      }

      return token;
  },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId;
        session.user.membershipId = token.membershipId;
        session.user.companyId = token.companyId;
        session.user.companyName = token.companyName;
        session.user.roles = token.roles;
      }

    return session;
  },
},
} satisfies NextAuthConfig;
