import { NextRequest, NextResponse } from "next/server";
import { getAuthorizationContext } from "@/lib/authorization";
import { completeConnectionCallback } from "@/lib/open-banking/service";

export async function GET(request: NextRequest) {
  const base = new URL("/treasury/open-banking", request.url);
  let companyId: string;
  try {
    ({ companyId } = await getAuthorizationContext());
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const state = request.nextUrl.searchParams.get("state") ?? "";
  try {
    await completeConnectionCallback(companyId, state, request.nextUrl.searchParams);
    base.searchParams.set("success", "Banca collegata.");
  } catch (error) {
    base.searchParams.set("error", error instanceof Error ? error.message : "Callback non valida.");
  }
  return NextResponse.redirect(base);
}
