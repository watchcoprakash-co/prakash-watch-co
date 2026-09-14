/**
 * Admin authentication.
 *
 * Deliberately small: a single shared password, held in the environment, exchanged
 * for a signed httpOnly cookie. The admin panel can spend the shop's OpenRouter
 * credit, so it must not be reachable by anyone who finds the URL — but a boutique
 * with one admin does not need user accounts either.
 *
 * If this is ever exposed to more than the shop's own staff, replace it with a
 * real identity provider.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "pwc_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12;

export function isConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/** Deterministic token for the configured password. */
function expectedToken(): string {
  const password = process.env.ADMIN_PASSWORD ?? "";
  const secret = process.env.ADMIN_SECRET ?? password;
  return createHmac("sha256", secret).update(`pwc-admin-v1:${password}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function checkPassword(candidate: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  return safeEqual(candidate, password);
}

export async function isAuthenticated(): Promise<boolean> {
  if (!isConfigured()) return false;
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return safeEqual(token, expectedToken());
}

export async function signIn(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, expectedToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Guard for admin API routes. Returns a 401 Response when not signed in. */
export async function requireAuth(): Promise<Response | null> {
  if (await isAuthenticated()) return null;
  return Response.json({ error: "Not signed in." }, { status: 401 });
}
