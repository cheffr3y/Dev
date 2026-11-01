"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";
import { safeReturnTo } from "@/lib/login-return";

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeReturnTo(formData.get("returnTo")),
    });
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === "service_unavailable") {
      return "Sign-in is temporarily unavailable. Please try again shortly.";
    }
    if (error instanceof AuthError) {
      return "Invalid email or password.";
    }
    // signIn throws a redirect on success — let it propagate.
    throw error;
  }
  return undefined;
}
