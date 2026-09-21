import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import { getMatchupNote, getMatchupNotes, getNotedCharacters, upsertMatchupNote } from "@/lib/matchup-notes";
import { MATCHUP_CHARACTERS } from "@/lib/characters";

describe("getMatchupNotes", () => {
  it("returns one empty entry per non-echo, non-Random character", async () => {
    const user = await createTestUser();

    const notes = await getMatchupNotes(user.id);

    expect(notes.map((n) => n.character)).toEqual(MATCHUP_CHARACTERS);
    expect(notes.every((n) => n.note === "")).toBe(true);
  });

  it("merges notes written against both halves of an echo pair onto the base fighter", async () => {
    const user = await createTestUser();
    // Inserted directly rather than through upsertMatchupNote — this is the
    // pre-merge layout the read path still has to cope with.
    await prisma.matchupNote.createMany({
      data: [
        { userId: user.id, character: "Samus", note: "Watch the charge shot" },
        { userId: user.id, character: "Dark Samus", note: "Recovery is linear" },
      ],
    });

    const notes = await getMatchupNotes(user.id);
    const darkSamus = notes.find((n) => n.character === "Dark Samus");

    expect(notes.find((n) => n.character === "Samus")?.note).toBe("Watch the charge shot\n\nRecovery is linear");
    expect(darkSamus).toBeUndefined();
  });

  it("leaves a Random note out of the list", async () => {
    const user = await createTestUser();
    await prisma.matchupNote.create({ data: { userId: user.id, character: "Random", note: "???" } });

    const notes = await getMatchupNotes(user.id);

    expect(notes.find((n) => n.character === "Random")).toBeUndefined();
  });
});

describe("getMatchupNote", () => {
  it("surfaces a note written for either half of an echo pair", async () => {
    const user = await createTestUser();
    await prisma.matchupNote.create({ data: { userId: user.id, character: "Dark Samus", note: "diagonal" } });

    await expect(getMatchupNote(user.id, "Samus")).resolves.toBe("diagonal");
    await expect(getMatchupNote(user.id, "Dark Samus")).resolves.toBe("diagonal");
  });

  it("is null for a character with no note, and doesn't borrow a neighbour's", async () => {
    const user = await createTestUser();
    await prisma.matchupNote.create({ data: { userId: user.id, character: "Samus", note: "diagonal" } });

    await expect(getMatchupNote(user.id, "Mario")).resolves.toBeNull();
    await expect(getMatchupNote(user.id, "Marth")).resolves.toBeNull();
  });
});

describe("upsertMatchupNote", () => {
  it("consolidates a pre-merge pair onto the base fighter's row", async () => {
    const user = await createTestUser();
    await prisma.matchupNote.create({ data: { userId: user.id, character: "Dark Samus", note: "stale" } });

    await upsertMatchupNote(user.id, "Dark Samus", "updated");

    const rows = await prisma.matchupNote.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ character: "Samus", note: "updated" });
  });

  it("clears the whole echo group when the note is emptied", async () => {
    const user = await createTestUser();
    await prisma.matchupNote.createMany({
      data: [
        { userId: user.id, character: "Peach", note: "one" },
        { userId: user.id, character: "Daisy", note: "two" },
      ],
    });

    await upsertMatchupNote(user.id, "Daisy", "   ");

    await expect(prisma.matchupNote.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it("keeps Marth and Lucina's notes separate, despite both being echoes", async () => {
    const user = await createTestUser();

    await upsertMatchupNote(user.id, "Marth", "tipper");
    await upsertMatchupNote(user.id, "Lucina", "no tipper");

    const rows = await prisma.matchupNote.findMany({ where: { userId: user.id }, orderBy: { character: "asc" } });
    expect(rows).toEqual([
      expect.objectContaining({ character: "Lucina", note: "no tipper" }),
      expect.objectContaining({ character: "Marth", note: "tipper" }),
    ]);
  });
});

describe("getNotedCharacters", () => {
  it("reports echo groups rather than roster entries, and skips Random", async () => {
    const user = await createTestUser();
    await prisma.matchupNote.createMany({
      data: [
        { userId: user.id, character: "Daisy", note: "a" },
        { userId: user.id, character: "Mario", note: "b" },
        { userId: user.id, character: "Random", note: "c" },
      ],
    });

    const noted = await getNotedCharacters(user.id);

    expect(noted.sort()).toEqual(["Mario", "Peach"]);
  });

  it("is empty for an account that hasn't written any notes", async () => {
    const user = await createTestUser();

    await expect(getNotedCharacters(user.id)).resolves.toEqual([]);
  });
});
