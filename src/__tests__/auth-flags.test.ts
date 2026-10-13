/**
 * ADR-001 Increment 0 — unit tests (no server needed).
 * - authenticate(): identity comes only from a verified Google token issued to our client
 * - resolveFlags(): flags fail closed
 */
import { authenticate, AuthError } from "../lib/auth";
import { resolveFlags } from "../handlers/flags";

const CLIENT_ID = "our-client.apps.googleusercontent.com";

function kv() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    put: jest.fn(async (k: string, v: string, _opts?: unknown) => {
      store.set(k, v);
    }),
  };
}

function req(headers: Record<string, string> = {}) {
  return new Request("https://api.example/api/onboarding/status", { headers });
}

function tokeninfo(body: Record<string, unknown>, status = 200) {
  return jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

const good = { sub: "1234567890", aud: CLIENT_ID, email: "a@example.com", expires_in: "3500" };

describe("authenticate", () => {
  it("rejects a request without a bearer token (401)", async () => {
    const env = { GOOGLE_CLIENT_ID: CLIENT_ID, SESSIONS: kv() };
    await expect(authenticate(req(), env, tokeninfo(good))).rejects.toMatchObject({ status: 401 });
  });

  it("derives the user id from the verified token", async () => {
    const env = { GOOGLE_CLIENT_ID: CLIENT_ID, SESSIONS: kv() };
    const id = await authenticate(req({ Authorization: "Bearer tok" }), env, tokeninfo(good));
    expect(id).toEqual({ userId: "1234567890", email: "a@example.com" });
  });

  it("rejects tokens Google says are invalid or expired (401)", async () => {
    const env = { GOOGLE_CLIENT_ID: CLIENT_ID, SESSIONS: kv() };
    await expect(
      authenticate(req({ Authorization: "Bearer bad" }), env, tokeninfo({ error_description: "Invalid Value" }, 400))
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects tokens issued to another app (confused deputy)", async () => {
    const env = { GOOGLE_CLIENT_ID: CLIENT_ID, SESSIONS: kv() };
    await expect(
      authenticate(req({ Authorization: "Bearer other" }), env, tokeninfo({ ...good, aud: "someone-else" }))
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a mismatching X-User-Id header (403)", async () => {
    const env = { GOOGLE_CLIENT_ID: CLIENT_ID, SESSIONS: kv() };
    await expect(
      authenticate(req({ Authorization: "Bearer tok", "X-User-Id": "attacker" }), env, tokeninfo(good))
    ).rejects.toMatchObject({ status: 403 });
  });

  it("caches by token hash and never stores the raw token", async () => {
    const cache = kv();
    const env = { GOOGLE_CLIENT_ID: CLIENT_ID, SESSIONS: cache };
    const f = tokeninfo(good);
    await authenticate(req({ Authorization: "Bearer secret-token" }), env, f);
    await authenticate(req({ Authorization: "Bearer secret-token" }), env, f);
    expect((f as unknown as jest.Mock).mock.calls.length).toBe(1);
    const [key] = [...cache.store.keys()];
    expect(key).toMatch(/^auth:v1:[0-9a-f]{64}$/);
    expect(key).not.toContain("secret-token");
    expect(cache.put.mock.calls[0][2]).toEqual({ expirationTtl: 3470 });
  });

  it("sends the token in the POST body, not the URL", async () => {
    const env = { GOOGLE_CLIENT_ID: CLIENT_ID, SESSIONS: kv() };
    const f = tokeninfo(good);
    await authenticate(req({ Authorization: "Bearer secret-xyz" }), env, f);
    const [url, init] = (f as unknown as jest.Mock).mock.calls[0];
    expect(String(url)).not.toContain("secret-xyz");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("access_token=secret-xyz");
  });
});

describe("resolveFlags", () => {
  const row = (key: string, enabled: number, allow_users = "[]") => ({ key, enabled, allow_users });

  it("is off unless enabled", () => {
    expect(resolveFlags([row("a", 0)], "u1")).toEqual({ a: false });
  });
  it("is on for everyone when enabled with an empty allow-list", () => {
    expect(resolveFlags([row("a", 1)], "u1")).toEqual({ a: true });
  });
  it("respects the allow-list (owner-only canary)", () => {
    expect(resolveFlags([row("a", 1, '["owner"]')], "u1")).toEqual({ a: false });
    expect(resolveFlags([row("a", 1, '["owner"]')], "owner")).toEqual({ a: true });
  });
  it("fails closed on a malformed allow-list", () => {
    expect(resolveFlags([row("a", 1, "not json")], "u1")).toEqual({ a: false });
  });
});
