import { checkPassword, isConfigured, signIn, signOut } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json(
      { error: "ADMIN_PASSWORD is not set on the server. Add it to .env and restart." },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!password || !checkPassword(password)) {
    // A uniform delay keeps this from being a fast password oracle.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return Response.json({ error: "That password is not right." }, { status: 401 });
  }

  await signIn();
  return Response.json({ ok: true });
}

export async function DELETE(): Promise<Response> {
  await signOut();
  return Response.json({ ok: true });
}
