import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const c = cookies();

  // TODO: an eure echten Cookie-Namen anpassen
  c.delete("session");
  c.delete("refresh");

  const url = new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  return NextResponse.json({ ok: true, redirectTo: url.pathname });
}
