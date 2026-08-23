import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export type AuthorizationClaims = {
  userId?: string | null;
  membershipId?: string | null;
  companyId?: string | null;
};

export type AuthorizationContext = {
  userId: string;
  membershipId: string;
  companyId: string;
  companyName: string;
  roles: string[];
};

export class AuthorizationDeniedError extends Error {
  constructor(message = "Sessione non più autorizzata.") {
    super(message);
    this.name = "AuthorizationDeniedError";
  }
}

export async function resolveAuthorizationContext(claims: AuthorizationClaims): Promise<AuthorizationContext> {
  if (!claims.userId || !claims.membershipId || !claims.companyId) throw new AuthorizationDeniedError();
  const membership = await prisma.membership.findFirst({
    where: {
      id: claims.membershipId,
      userId: claims.userId,
      companyId: claims.companyId,
      active: true,
      user: { active: true },
      company: { active: true },
    },
    select: {
      id: true,
      userId: true,
      companyId: true,
      company: { select: { name: true } },
      roles: { select: { role: { select: { code: true } } } },
    },
  });
  if (!membership) throw new AuthorizationDeniedError();
  return {
    userId: membership.userId,
    membershipId: membership.id,
    companyId: membership.companyId,
    companyName: membership.company.name,
    roles: membership.roles.map(({ role }) => role.code),
  };
}

export async function getAuthorizationContext() {
  const session = await auth();
  if (!session?.user) throw new AuthorizationDeniedError();
  return resolveAuthorizationContext({
    userId: session.user.id,
    membershipId: session.user.membershipId,
    companyId: session.user.companyId,
  });
}

export async function getAuthorizationSessionUser() {
  const context = await getAuthorizationContext();
  return {
    id: context.userId,
    membershipId: context.membershipId,
    companyId: context.companyId,
    companyName: context.companyName,
    roles: context.roles,
  };
}

export async function requireAuthorizationContext() {
  try {
    return await getAuthorizationContext();
  } catch {
    redirect("/login");
  }
}
