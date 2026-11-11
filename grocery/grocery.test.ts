import { AppCallError, testApp } from "@hearth/sdk/testing";
import { describe, expect, it } from "vitest";
import server from "./server";

describe("grocery", () => {
  it("is one list for the whole family: what one person adds, the other sees, oldest first", () => {
    const app = testApp(server);
    expect(app.space.kind).toBe("group");
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin" });

    sam.mutation("add", { name: "Milk", aisle: "Dairy" });
    lin.mutation("add", { name: "Bread" });

    const both = [
      { name: "Milk", aisle: "Dairy", done: false, createdBy: sam.user.id },
      { name: "Bread", aisle: "", done: false, createdBy: lin.user.id },
    ];
    expect(sam.query("list")).toMatchObject(both);
    expect(lin.query("list")).toMatchObject(both);
  });

  it("lets someone with view access read the list and change nothing", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin", access: "view" });
    const milk = sam.mutation("add", { name: "Milk" });

    expect(lin.query("list")).toMatchObject([{ id: milk.id, name: "Milk", done: false }]);
    expect(() => lin.mutation("add", { name: "Eggs" })).toThrow("forbidden");
    expect(() => lin.mutation("add", { name: "milk" })).toThrow("forbidden");
    expect(() => lin.mutation("tick", { id: milk.id, done: true })).toThrow("forbidden");
    expect(() => lin.mutation("clearTicked")).toThrow(AppCallError);
    expect(sam.query("list")).toMatchObject([{ id: milk.id, done: false }]);
  });

  it("ticks an item off for everyone, unticks it, and clears what is ticked for everyone", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin" });
    const milk = sam.mutation("add", { name: "Milk" });
    sam.mutation("add", { name: "Bread" });

    expect(lin.mutation("tick", { id: milk.id, done: true })).toMatchObject({ done: true, createdBy: sam.user.id, updatedBy: lin.user.id });
    expect(sam.query("list").map((item) => [item.name, item.done])).toEqual([
      ["Milk", true],
      ["Bread", false],
    ]);
    expect(sam.mutation("tick", { id: milk.id, done: false })).toMatchObject({ done: false, updatedBy: sam.user.id });
    lin.mutation("tick", { id: milk.id, done: true });

    expect(sam.mutation("clearTicked")).toBe(1);
    expect(lin.query("list").map((item) => item.name)).toEqual(["Bread"]);
    expect(lin.mutation("clearTicked")).toBe(0);
  });

  it("keeps one item when two people add the same thing", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin" });
    const milk = sam.mutation("add", { name: "Milk", aisle: "Dairy" });

    // Lin had not seen it yet. Written another way it is still the same item, and with no aisle chosen it stays where it was.
    expect(lin.mutation("add", { name: "  milk " })).toEqual(milk);
    expect(lin.mutation("add", { name: "ＭＩＬＫ" })).toEqual(milk);
    const rice = lin.mutation("add", { name: "大米" });
    expect(sam.mutation("add", { name: " 大米 " })).toEqual(rice);
    expect(sam.query("list").map((item) => item.name)).toEqual(["Milk", "大米"]);

    // Added under another aisle, it moves there.
    expect(lin.mutation("add", { name: "milk", aisle: "Fridge" })).toMatchObject({
      id: milk.id,
      name: "Milk",
      aisle: "Fridge",
      createdBy: sam.user.id,
      updatedBy: lin.user.id,
    });

    // Another name is another item.
    lin.mutation("add", { name: "Oat milk" });
    expect(sam.query("list").map((item) => [item.name, item.aisle])).toEqual([
      ["Milk", "Fridge"],
      ["大米", ""],
      ["Oat milk", ""],
    ]);
  });

  it("puts a ticked item back on the list when it is added again, in its place", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin" });
    const milk = sam.mutation("add", { name: "Milk", aisle: "Dairy" });
    sam.mutation("add", { name: "Bread" });
    sam.mutation("tick", { id: milk.id, done: true });

    expect(lin.mutation("add", { name: "milk" })).toMatchObject({
      id: milk.id,
      name: "Milk",
      aisle: "Dairy",
      done: false,
      updatedBy: lin.user.id,
    });
    expect(sam.query("list").map((item) => [item.name, item.done])).toEqual([
      ["Milk", false],
      ["Bread", false],
    ]);
    expect(sam.mutation("clearTicked")).toBe(0);
  });

  it("says an item is not there when someone else cleared it first", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin" });
    const milk = sam.mutation("add", { name: "Milk" });

    lin.mutation("tick", { id: milk.id, done: true });
    expect(lin.mutation("clearTicked")).toBe(1);
    expect(() => sam.mutation("tick", { id: milk.id, done: false })).toThrow("not_found");
    expect(sam.query("list")).toEqual([]);
  });

  it("turns down an item without a name, and a name or aisle that is too long", () => {
    const sam = testApp(server).as();
    expect(() => sam.mutation("add", { name: "  " })).toThrow("invalid_request");
    expect(() => sam.mutation("add", { name: "x".repeat(81) })).toThrow("invalid_request");
    expect(() => sam.mutation("add", { name: "Milk", aisle: "x".repeat(41) })).toThrow("invalid_request");
    expect(sam.query("list")).toEqual([]);

    // What is kept is the name without the spaces around it.
    expect(sam.mutation("add", { name: "  Milk  " })).toMatchObject({ name: "Milk" });
    // An item that is there already cannot be moved to an aisle that is too long either.
    expect(() => sam.mutation("add", { name: "milk", aisle: "x".repeat(41) })).toThrow("invalid_request");
    expect(sam.query("list")).toMatchObject([{ name: "Milk", aisle: "" }]);
  });

  it("shares the aisles with everyone in the space and keeps each person's own switch for them", () => {
    const app = testApp(server);
    const sam = app.as({ name: "Sam" });
    const lin = app.as({ name: "Lin" });
    const linViewing = app.as({ name: "Lin", access: "view" });

    expect(sam.settings()).toEqual({ aisles: [], hideDone: false });
    expect(sam.saveSettings({ aisles: ["Fruit", "Dairy"], hideDone: true })).toEqual({ aisles: ["Fruit", "Dairy"], hideDone: true });
    expect(lin.settings()).toEqual({ aisles: ["Fruit", "Dairy"], hideDone: false });

    // Edit access includes the aisles; view access only the person's own switch.
    expect(lin.saveSettings({ aisles: ["Dairy", "Fruit", "Bakery"] })).toEqual({ aisles: ["Dairy", "Fruit", "Bakery"], hideDone: false });
    expect(() => linViewing.saveSettings({ aisles: [] })).toThrow("forbidden");
    expect(linViewing.saveSettings({ hideDone: true })).toEqual({ aisles: ["Dairy", "Fruit", "Bakery"], hideDone: true });
    expect(sam.settings()).toEqual({ aisles: ["Dairy", "Fruit", "Bakery"], hideDone: true });
  });

  it("takes at most 20 aisles of at most 40 characters, and every aisle it takes fits an item", () => {
    const sam = testApp(server).as();
    const twenty = Array.from({ length: 20 }, (_, index) => `Aisle ${index + 1}`);

    expect(sam.saveSettings({ aisles: twenty }).aisles).toEqual(twenty);
    expect(() => sam.saveSettings({ aisles: [...twenty, "One more"] })).toThrow("invalid_request");
    expect(() => sam.saveSettings({ aisles: ["x".repeat(41)] })).toThrow("invalid_request");

    const longest = "x".repeat(40);
    expect(sam.saveSettings({ aisles: [longest] }).aisles).toEqual([longest]);
    expect(sam.mutation("add", { name: "Milk", aisle: longest })).toMatchObject({ aisle: longest });
  });

  it("works the same in someone's personal space", () => {
    const app = testApp(server, { space: "personal" });
    expect(app.space.kind).toBe("personal");
    const me = app.as();

    const milk = me.mutation("add", { name: "Milk" });
    me.mutation("tick", { id: milk.id, done: true });
    expect(me.saveSettings({ aisles: ["Dairy"], hideDone: true })).toEqual({ aisles: ["Dairy"], hideDone: true });
    expect(me.mutation("clearTicked")).toBe(1);
    expect(me.query("list")).toEqual([]);
  });
});
