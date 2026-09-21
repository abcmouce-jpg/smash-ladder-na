import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import { createCharacterGuide, getAllCharacterGuides, getAllGuides } from "@/lib/character-guides";

function addGuide(authorId: string, character: string, content: string) {
  return prisma.characterGuide.create({ data: { character, authorId, content } });
}

describe("getAllCharacterGuides", () => {
  it("files an echo's guides under its base fighter's row", async () => {
    const author = await createTestUser();
    await addGuide(author.id, "Dark Samus", "echo");
    await addGuide(author.id, "Samus", "base");
    await addGuide(author.id, "Mario", "mario");

    const grouped = await getAllCharacterGuides(author.id);

    expect(
      grouped
        .get("Samus")
        ?.map((g) => g.content)
        .sort(),
    ).toEqual(["base", "echo"]);
    expect(grouped.get("Mario")).toHaveLength(1);
    expect(grouped.has("Dark Samus")).toBe(false);
  });

  it("drops guides filed against Random entirely", async () => {
    const author = await createTestUser();
    await addGuide(author.id, "Random", "rng");

    await expect(getAllCharacterGuides(author.id)).resolves.toEqual(new Map());
    await expect(getAllGuides(author.id)).resolves.toEqual([]);
  });

  it("omits hidden guides", async () => {
    const author = await createTestUser();
    await prisma.characterGuide.create({
      data: { character: "Mario", authorId: author.id, content: "flagged", hiddenAt: new Date() },
    });

    await expect(getAllGuides(author.id)).resolves.toEqual([]);
  });
});

describe("getAllGuides", () => {
  it("returns a flat list with the viewer's own vote and flag folded in", async () => {
    const author = await createTestUser();
    const viewer = await createTestUser();
    const other = await createTestUser();
    const guide = await addGuide(author.id, "Mario", "cap them");
    await prisma.characterGuideVote.create({ data: { guideId: guide.id, userId: viewer.id, value: 1 } });
    await prisma.characterGuideVote.create({ data: { guideId: guide.id, userId: other.id, value: -1 } });
    await prisma.characterGuideFlag.create({ data: { guideId: guide.id, userId: viewer.id } });

    const [viewed] = await getAllGuides(viewer.id);
    expect(viewed).toMatchObject({ character: "Mario", content: "cap them", myVote: 1, myFlag: true });

    const [anonymous] = await getAllGuides(null);
    expect(anonymous).toMatchObject({ myVote: 0, myFlag: false });
  });
});

describe("createCharacterGuide", () => {
  it("stores a guide for an echo under the base fighter", async () => {
    const author = await createTestUser();

    const guide = await createCharacterGuide(author.id, "Dark Samus", "diagonal");

    expect(guide.character).toBe("Samus");
  });

  it("still stores Marth and Lucina's guides separately", async () => {
    const author = await createTestUser();

    const marth = await createCharacterGuide(author.id, "Marth", "tipper");
    const lucina = await createCharacterGuide(author.id, "Lucina", "no tipper");

    expect(marth.character).toBe("Marth");
    expect(lucina.character).toBe("Lucina");
  });
});
