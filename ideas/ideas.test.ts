import { AppCallError, testApp } from "@hearth/sdk/testing";
import { describe, expect, it } from "vitest";
import server from "./server";

/** The texts of a timeline, in its order. */
const texts = (answer: { ideas: { text: string }[] }) => answer.ideas.map((idea) => idea.text);

describe("ideas", () => {
  it("is one timeline for the whole group: what one writes, the other reads, the newest first", () => {
    const app = testApp(server);
    expect(app.space.kind).toBe("group");
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin" });

    sam.mutation("add", { text: "A bird feeder by the kitchen window" });
    lin.mutation("add", { text: "Paint the shed green" });
    sam.mutation("add", { text: "Learn one song on the ukulele" });

    const timeline = [
      { text: "Learn one song on the ukulele", pinned: false, archived: false, tags: [], createdBy: sam.user.id },
      { text: "Paint the shed green", createdBy: lin.user.id },
      { text: "A bird feeder by the kitchen window", createdBy: sam.user.id },
    ];
    expect(sam.query("list", {})).toMatchObject({ ideas: timeline, more: false, counts: { active: 3, archived: 0 } });
    expect(lin.query("list", {})).toMatchObject({ ideas: timeline });
  });

  it("keeps an idea to its one person in a personal space", () => {
    const app = testApp(server, { space: "personal" });
    const sam = app.as({ name: "Sam" });
    sam.mutation("add", { text: "A quiet week in the mountains" });
    expect(texts(sam.query("list", {}))).toEqual(["A quiet week in the mountains"]);
  });

  it("puts pinned ideas first, then the newest first, and unpins", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin" });
    const first = sam.mutation("add", { text: "first" });
    const second = sam.mutation("add", { text: "second" });
    sam.mutation("add", { text: "third" });
    sam.mutation("add", { text: "fourth" });

    expect(lin.mutation("pin", { id: first.id, pinned: true })).toMatchObject({ pinned: true, updatedBy: lin.user.id });
    sam.mutation("pin", { id: second.id, pinned: true });
    expect(texts(sam.query("list", {}))).toEqual(["second", "first", "fourth", "third"]);

    sam.mutation("pin", { id: second.id, pinned: false });
    expect(texts(lin.query("list", {}))).toEqual(["first", "fourth", "third", "second"]);
  });

  it("shows the card the three written last, pinned or not, and none that is archived", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const one = sam.mutation("add", { text: "one" });
    sam.mutation("add", { text: "two" });
    sam.mutation("add", { text: "three" });
    const four = sam.mutation("add", { text: "four" });
    sam.mutation("pin", { id: one.id, pinned: true });

    expect(sam.query("latest").map((idea) => idea.text)).toEqual(["four", "three", "two"]);
    sam.mutation("archive", { id: four.id, archived: true });
    expect(sam.query("latest").map((idea) => idea.text)).toEqual(["three", "two", "one"]);
  });

  it("edits an idea's text, and its tags with it", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin" });
    const idea = sam.mutation("add", { text: "A herb garden #garden" });
    expect(idea.tags).toEqual(["garden"]);

    const edited = lin.mutation("edit", { id: idea.id, text: "  A herb garden on the balcony\r\n#home #Balcony  " });
    expect(edited).toMatchObject({
      id: idea.id,
      text: "A herb garden on the balcony\n#home #Balcony",
      tags: ["home", "balcony"],
      createdBy: sam.user.id,
      updatedBy: lin.user.id,
    });
    expect(sam.query("list", {}).ideas).toMatchObject([{ id: idea.id, text: "A herb garden on the balcony\n#home #Balcony" }]);
  });

  it("archives an idea, which unpins it and puts it away, and brings it back", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const done = sam.mutation("add", { text: "Fix the garden gate" });
    sam.mutation("add", { text: "Build a kite" });
    sam.mutation("pin", { id: done.id, pinned: true });

    expect(sam.mutation("archive", { id: done.id, archived: true })).toMatchObject({ archived: true, pinned: false });
    expect(sam.query("list", {})).toMatchObject({ ideas: [{ text: "Build a kite" }], counts: { active: 1, archived: 1 } });
    expect(sam.query("list", { view: "archived" })).toMatchObject({
      ideas: [{ id: done.id, text: "Fix the garden gate", archived: true, pinned: false }],
      counts: { active: 1, archived: 1 },
    });
    // What is put away is not at the top of anything.
    expect(() => sam.mutation("pin", { id: done.id, pinned: true })).toThrow("conflict");

    expect(sam.mutation("archive", { id: done.id, archived: false })).toMatchObject({ archived: false, pinned: false });
    expect(texts(sam.query("list", {}))).toEqual(["Build a kite", "Fix the garden gate"]);
    expect(sam.query("list", { view: "archived" })).toMatchObject({ ideas: [], counts: { active: 2, archived: 0 } });
  });

  it("deletes an idea for good, and answers not found for one that is gone", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin" });
    const idea = sam.mutation("add", { text: "A paper boat race" });
    sam.mutation("add", { text: "A picnic by the river" });

    lin.mutation("remove", { id: idea.id });
    expect(texts(sam.query("list", {}))).toEqual(["A picnic by the river"]);

    // Sam's page still showed it: each of its buttons is told that it is gone.
    expect(() => sam.mutation("remove", { id: idea.id })).toThrow("not_found");
    expect(() => sam.mutation("edit", { id: idea.id, text: "A paper boat" })).toThrow("not_found");
    expect(() => sam.mutation("pin", { id: idea.id, pinned: true })).toThrow("not_found");
    expect(() => sam.mutation("archive", { id: idea.id, archived: true })).toThrow("not_found");
    expect(sam.query("list", {})).toMatchObject({ counts: { active: 1, archived: 0 } });
  });

  it("keeps the #tags of a text, in Latin and Chinese letters, whatever their case and width", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });

    const idea = sam.mutation("add", { text: "Plant tomatoes #Garden #spring_2027 and again #garden" });
    expect(idea.tags).toEqual(["garden", "spring_2027"]);
    expect(sam.mutation("add", { text: "给阳台装一个花架 #花园 #周末-计划" }).tags).toEqual(["花园", "周末-计划"]);
    expect(sam.mutation("add", { text: "全角也算 ＃ＧＡＲＤＥＮ" }).tags).toEqual(["garden"]);
    // A "#" inside a web address is part of the address; one after it is a tag again.
    expect(sam.mutation("add", { text: "Read https://example.com/guide#watering before #planting" }).tags).toEqual(["planting"]);
    // 30 characters at most: a longer run is no tag.
    expect(sam.mutation("add", { text: `#${"a".repeat(30)} #${"b".repeat(31)} # alone` }).tags).toEqual(["a".repeat(30)]);
  });

  it("counts the tags of the active ideas, the most used first, and lists the ideas of one", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin", access: "view" });
    sam.mutation("add", { text: "Raised beds #garden" });
    sam.mutation("add", { text: "A reading corner #home" });
    sam.mutation("add", { text: "Compost bin #Garden #home" });
    const put = sam.mutation("add", { text: "A pond #garden #someday" });
    sam.mutation("add", { text: "No tag at all" });

    expect(lin.query("tags")).toEqual([
      { tag: "garden", count: 3 },
      { tag: "home", count: 2 },
      { tag: "someday", count: 1 },
    ]);
    expect(texts(lin.query("list", { tag: "garden" }))).toEqual(["A pond #garden #someday", "Compost bin #Garden #home", "Raised beds #garden"]);
    // With its "#", in capitals or in full-width letters, it is the same tag.
    expect(texts(lin.query("list", { tag: "#Garden" }))).toHaveLength(3);
    expect(texts(lin.query("list", { tag: "ＨＯＭＥ" }))).toEqual(["Compost bin #Garden #home", "A reading corner #home"]);
    expect(lin.query("list", { tag: "nothing" })).toMatchObject({ ideas: [], more: false, counts: { active: 5, archived: 0 } });

    // An archived idea's tags are not counted, and it is found among the archived ones.
    sam.mutation("archive", { id: put.id, archived: true });
    expect(lin.query("tags")).toEqual([
      { tag: "garden", count: 2 },
      { tag: "home", count: 2 },
    ]);
    expect(texts(lin.query("list", { tag: "garden" }))).toEqual(["Compost bin #Garden #home", "Raised beds #garden"]);
    expect(texts(lin.query("list", { view: "archived", tag: "someday" }))).toEqual(["A pond #garden #someday"]);
  });

  it("searches the text for every word typed, whatever their case and width", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    sam.mutation("add", { text: "Bake Sourdough bread on Sunday" });
    sam.mutation("add", { text: "A bread box for the counter #kitchen" });
    sam.mutation("add", { text: "周末去爬山，带上相机" });
    const old = sam.mutation("add", { text: "Sunday market stall" });
    sam.mutation("archive", { id: old.id, archived: true });

    expect(texts(sam.query("list", { search: "bread" }))).toEqual(["A bread box for the counter #kitchen", "Bake Sourdough bread on Sunday"]);
    expect(texts(sam.query("list", { search: "  SUNDAY   bread " }))).toEqual(["Bake Sourdough bread on Sunday"]);
    expect(texts(sam.query("list", { search: "ｓｏｕｒｄｏｕｇｈ" }))).toEqual(["Bake Sourdough bread on Sunday"]);
    expect(texts(sam.query("list", { search: "爬山　相机" }))).toEqual(["周末去爬山，带上相机"]);
    expect(texts(sam.query("list", { search: "#kitchen" }))).toEqual(["A bread box for the counter #kitchen"]);
    expect(sam.query("list", { search: "bread rye" })).toMatchObject({ ideas: [], counts: { active: 3, archived: 1 } });
    // What is typed is looked for as it is, never read as a pattern.
    sam.mutation("add", { text: "abc and c++ (really)" });
    expect(texts(sam.query("list", { search: "a.c" }))).toEqual([]);
    expect(texts(sam.query("list", { search: "c++" }))).toEqual(["abc and c++ (really)"]);
    expect(texts(sam.query("list", { search: "(really)" }))).toEqual(["abc and c++ (really)"]);
    // Nothing typed, or spaces alone, lists everything.
    expect(texts(sam.query("list", { search: "   " }))).toHaveLength(4);
    // A search stays in the view it is asked in, and narrows a tag.
    expect(texts(sam.query("list", { search: "sunday", view: "archived" }))).toEqual(["Sunday market stall"]);
    expect(texts(sam.query("list", { search: "bread", tag: "kitchen" }))).toEqual(["A bread box for the counter #kitchen"]);
    expect(texts(sam.query("list", { search: "sunday", tag: "kitchen" }))).toEqual([]);
  });

  it("lets someone with view access read everything and change nothing", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin", access: "view" });
    const idea = sam.mutation("add", { text: "A treehouse #someday" });

    expect(lin.query("list", {})).toMatchObject({ ideas: [{ id: idea.id, text: "A treehouse #someday" }] });
    expect(lin.query("latest")).toMatchObject([{ id: idea.id }]);
    expect(lin.query("tags")).toEqual([{ tag: "someday", count: 1 }]);
    expect(() => lin.mutation("add", { text: "A slide" })).toThrow("forbidden");
    expect(() => lin.mutation("edit", { id: idea.id, text: "A slide" })).toThrow("forbidden");
    expect(() => lin.mutation("pin", { id: idea.id, pinned: true })).toThrow("forbidden");
    expect(() => lin.mutation("archive", { id: idea.id, archived: true })).toThrow("forbidden");
    expect(() => lin.mutation("remove", { id: idea.id })).toThrow(AppCallError);
    expect(sam.query("list", {})).toMatchObject({ ideas: [{ text: "A treehouse #someday", pinned: false, archived: false }] });
  });

  it("turns down a text that is empty or longer than 4000 characters, when written and when edited", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });

    expect(() => sam.mutation("add", { text: "" })).toThrow("invalid_request");
    expect(() => sam.mutation("add", { text: " \n\t " })).toThrow("invalid_request");
    expect(() => sam.mutation("add", { text: "x".repeat(4001) })).toThrow("invalid_request");
    // The spaces around a text do not count against its length.
    const longest = sam.mutation("add", { text: `  ${"x".repeat(4000)}\n` });
    expect(longest.text).toHaveLength(4000);

    expect(() => sam.mutation("edit", { id: longest.id, text: "   " })).toThrow("invalid_request");
    expect(() => sam.mutation("edit", { id: longest.id, text: "x".repeat(4001) })).toThrow("invalid_request");
    expect(sam.query("list", {})).toMatchObject({ ideas: [{ id: longest.id, text: "x".repeat(4000) }], counts: { active: 1 } });
  });

  it("holds 5000 ideas in a space, archived ones included, and searches all of them", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const first = sam.mutation("add", { text: "idea 1 #first" });
    sam.mutation("archive", { id: first.id, archived: true });
    sam.mutation("add", { text: "the oldest active idea #old" });
    for (let n = 3; n <= 5000; n += 1) sam.mutation("add", { text: `idea ${n}` });

    expect(() => sam.mutation("add", { text: "one too many" })).toThrow("conflict");
    expect(sam.query("list", { limit: 1 })).toMatchObject({ ideas: [{ text: "idea 5000" }], more: true, counts: { active: 4999, archived: 1 } });
    // 200 unless told.
    expect(sam.query("list", {})).toMatchObject({ more: true });
    expect(sam.query("list", {}).ideas).toHaveLength(200);
    // The oldest of them is still within reach of a search, a tag and the count of tags.
    expect(texts(sam.query("list", { search: "oldest" }))).toEqual(["the oldest active idea #old"]);
    expect(texts(sam.query("list", { tag: "old" }))).toEqual(["the oldest active idea #old"]);
    expect(sam.query("tags")).toEqual([{ tag: "old", count: 1 }]);

    sam.mutation("remove", { id: first.id });
    expect(sam.mutation("add", { text: "room again" })).toMatchObject({ text: "room again" });
    // 5000 changes one after the other take a few seconds.
  }, 60_000);

  it("gives as many ideas as asked for, 200 unless told and 500 at most, and says when there are more", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    for (const text of ["one", "two", "three"]) sam.mutation("add", { text });

    expect(sam.query("list", { limit: 2 })).toMatchObject({ ideas: [{ text: "three" }, { text: "two" }], more: true, counts: { active: 3 } });
    expect(sam.query("list", { limit: 3 })).toMatchObject({ more: false });
    expect(sam.query("list", { limit: 500 }).ideas).toHaveLength(3);
    expect(() => sam.query("list", { limit: 501 })).toThrow("invalid_request");
    expect(() => sam.query("list", { limit: 0 })).toThrow("invalid_request");
    expect(() => sam.query("list", { view: "everything" as "active" })).toThrow("invalid_request");
  });
});
