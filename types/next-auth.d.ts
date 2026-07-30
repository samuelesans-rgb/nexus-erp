import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    membershipId: string;
    companyId: string;
    companyName: string;
    roles: string[];
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      membershipId: string;
      companyId: string;
      companyName: string;
      roles: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    membershipId: string;
    companyId: string;
    companyName: string;
    roles: string[];
  }
}

// next-auth/jwt re-exports this interface from @auth/core in Auth.js v5.
declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    membershipId: string;
    companyId: string;
    companyName: string;
    roles: string[];
  }
}
