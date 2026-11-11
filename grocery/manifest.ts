import { defineApp } from "@hearth/sdk";

export default defineApp({
  id: "grocery",
  name: { en: "Grocery list", zh: "购物清单" },
  description: {
    en: "A shared shopping list, grouped by aisle.",
    zh: "按货架分组的共享购物清单。",
  },
  icon: "shopping-bag",
  color: "green",
  widget: { size: "tall" },
  settings: {
    aisles: {
      type: "list",
      scope: "space",
      default: [],
      maxItems: 20,
      // An item's aisle is at most 40 characters (server.ts), so an aisle may not be longer.
      maxLength: 40,
      label: { en: "Aisles", zh: "货架" },
      help: { en: "Items are grouped in this order.", zh: "物品按此顺序分组。" },
    },
    hideDone: {
      type: "switch",
      scope: "user",
      default: false,
      label: { en: "Hide ticked items", zh: "隐藏已勾选的物品" },
    },
  },
  messages: {
    en: {
      empty: "Nothing to buy.",
      add: "Add an item",
      submit: "Add",
      aisle: "Aisle",
      other: "Other",
      clear: "Clear ticked",
      left: "{count} left",
    },
    zh: {
      empty: "没有要买的东西。",
      add: "添加物品",
      submit: "添加",
      aisle: "货架",
      other: "其他",
      clear: "清除已勾选",
      left: "还剩 {count} 项",
    },
  },
});
