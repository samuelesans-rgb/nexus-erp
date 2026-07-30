"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export async function loginAction(formData: FormData): Promise<void> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      throw new Error("Email o password non valide");
    }

    throw error;
  }
}