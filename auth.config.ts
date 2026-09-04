import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";

import { prisma } from "./lib/prisma";
import { safeWriteAuditLog } from "./lib/audit";

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
              email: String(credentials.email).trim().toLowerCase(),
            },
            include: {
              memberships: {
                where: {
                  active: true,
                  company: { active: true },
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

        if (!user) { await safeWriteAuditLog({ action: "LOGIN_FAILURE", entityType: "Authentication", metadata: { reason: "UNKNOWN_USER" } }); return null; }

        if (!user.active) { await safeWriteAuditLog({ userId: user.id, action: "LOGIN_FAILURE", entityType: "Authentication", entityId: user.id, metadata: { reason: "USER_DISABLED" } }); return null; }

        const validPassword = await bcrypt.compare(
          String(credentials.password),
          user.password
        );

          if (!validPassword) { await safeWriteAuditLog({ userId: user.id, action: "LOGIN_FAILURE", entityType: "Authentication", entityId: user.id, metadata: { reason: "INVALID_CREDENTIALS" } }); return null; }

          const membership = user.memberships[0];

          if (!membership) { await safeWriteAuditLog({ userId: user.id, action: "LOGIN_FAILURE", entityType: "Authentication", entityId: user.id, metadata: { reason: "NO_ACTIVE_MEMBERSHIP" } }); return null; }

          await safeWriteAuditLog({ companyId: membership.companyId, membershipId: membership.id, userId: user.id, locationId: membership.defaultLocationId, action: "LOGIN_SUCCESS", entityType: "Authentication", entityId: user.id });
          await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

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
