/**
 * Unit test (no server needed): deleting a user's profile data removes their rows from all three tables,
 * leaves other users alone, and fails loudly instead of claiming a deletion that did not happen.
 */
import { SchemaService } from "../services/schemaService";

type Row = { user_id: string };

/** A tiny in-memory stand-in for D1: prepare/bind/batch with DELETE ... WHERE user_id = ? */
function fakeD1(tables: Record<string, Row[]>, failBatch = false) {
  return {
    prepare(sql: string) {
      const table = /DELETE FROM (\w+) WHERE user_id = \?/.exec(sql)?.[1];
      return {
        bind(userId: string) {
          return { table, userId };
        },
      };
    },
    async batch(stmts: Array<{ table?: string; userId: string }>) {
      if (failBatch) throw new Error("D1 unavailable");
      return stmts.map(({ table, userId }) => {
        const rows = tables[table ?? ""] ?? [];
        const before = rows.length;
        tables[table ?? ""] = rows.filter((r) => r.user_id !== userId);
        return { meta: { changes: before - tables[table ?? ""].length } };
      });
    },
  };
}

describe("SchemaService.deleteUserData", () => {
  it("deletes the user's profile, chat history and audit rows, and nobody else's", async () => {
    const tables = {
      user_schema_definitions: [{ user_id: "u1" }, { user_id: "u2" }],
      onboarding_sessions: [{ user_id: "u1" }, { user_id: "u1" }, { user_id: "u2" }],
      onboarding_audit_log: [{ user_id: "u1" }],
    };
    const deleted = await new SchemaService(fakeD1(tables)).deleteUserData("u1");
    expect(deleted).toEqual({ profile: 1, sessions: 2, audit: 1 });
    expect(tables.user_schema_definitions).toEqual([{ user_id: "u2" }]);
    expect(tables.onboarding_sessions).toEqual([{ user_id: "u2" }]);
    expect(tables.onboarding_audit_log).toEqual([]);
  });

  it("reports zero when there is nothing to delete", async () => {
    const tables = { user_schema_definitions: [], onboarding_sessions: [], onboarding_audit_log: [] };
    expect(await new SchemaService(fakeD1(tables)).deleteUserData("u9")).toEqual({ profile: 0, sessions: 0, audit: 0 });
  });

  it("throws when the database fails, so no deletion is reported", async () => {
    await expect(new SchemaService(fakeD1({}, true)).deleteUserData("u1")).rejects.toThrow("D1 unavailable");
  });
});
