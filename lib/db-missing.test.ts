import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import {
  MISSING_RECHECK_MS,
  MISSING_TABLE_MESSAGE,
  friendlyDbError,
  isMissingTable,
  knownMissing,
  noteMissingTable,
  readOrMissing
} from "./db-missing";

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("gagal", { code, clientVersion: "test", meta });

test("isMissingTable: tabel/kolom belum ada (model & raw query), selain itu tidak", () => {
  assert.equal(isMissingTable(prismaError("P2021", { table: "public.NoSpendDay" })), true);
  assert.equal(isMissingTable(prismaError("P2022", { column: "x" })), true);
  assert.equal(isMissingTable(prismaError("P2010", { code: "42P01", message: 'relation "VillageState" does not exist' })), true);
  assert.equal(isMissingTable(prismaError("P2010", { code: "42703" })), true);

  assert.equal(isMissingTable(prismaError("P2010", { code: "23505" })), false);
  assert.equal(isMissingTable(prismaError("P2002")), false);
  assert.equal(isMissingTable(new Error("P2021")), false);
  assert.equal(isMissingTable({ code: "P2021" }), false);
  assert.equal(isMissingTable(null), false);
  assert.equal(isMissingTable("P2021"), false);
});

test("readOrMissing: tabel belum ada → fallback + missing, lalu tidak ditanya lagi sebentar; error lain dilempar", async () => {
  assert.deepEqual(await readOrMissing("Tes A", async () => [1], []), { value: [1], missing: false });
  let calls = 0;
  const missingRead = async (): Promise<number[]> => {
    calls++;
    throw prismaError("P2021");
  };
  assert.deepEqual(await readOrMissing("Tes B", missingRead, []), { value: [], missing: true });
  assert.equal(knownMissing("Tes B"), true);
  assert.deepEqual(await readOrMissing("Tes B", missingRead, []), { value: [], missing: true });
  assert.equal(calls, 1, "query tidak diulang selama MISSING_RECHECK_MS");
  assert.equal(knownMissing("Tes B", Date.now() + MISSING_RECHECK_MS + 1), false, "lewat jedanya dicek lagi");
  assert.equal(knownMissing("Tes A"), false);

  await assert.rejects(
    readOrMissing(
      "Tes C",
      async () => {
        throw prismaError("P2002");
      },
      []
    ),
    (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError
  );
  assert.equal(knownMissing("Tes C"), false);
});

test("noteMissingTable: menandai label sampai MISSING_RECHECK_MS", () => {
  const now = 1_000_000;
  noteMissingTable("Tes D", now);
  assert.equal(knownMissing("Tes D", now + MISSING_RECHECK_MS - 1), true);
  assert.equal(knownMissing("Tes D", now + MISSING_RECHECK_MS), false);
});

test("friendlyDbError: pesan ramah hanya untuk tabel yang belum ada", () => {
  assert.equal((friendlyDbError(prismaError("P2021")) as Error).message, MISSING_TABLE_MESSAGE);
  const other = new Error("lain");
  assert.equal(friendlyDbError(other), other);
});
