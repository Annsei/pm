import { describe, it, expect } from "vitest";
import { applyFilters, emptyFilters } from "@/components/BoardFilters";
import type { Card } from "@/lib/kanban";

const cards: Card[] = [
  { id: "1", title: "Ship API", details: "bcrypt", labels: ["backend"], priority: "high", due_date: "2026-04-20" },
  { id: "2", title: "Polish UI", details: "", labels: ["frontend"], priority: "low", due_date: null },
  { id: "3", title: "Docs", details: "", labels: [], priority: null, due_date: null },
  { id: "4", title: "Urgent bug", details: "prod", labels: ["backend", "bug"], priority: "urgent", due_date: "2026-04-21" },
];

describe("applyFilters", () => {
  it("returns everything when filters are empty", () => {
    expect(applyFilters(cards, emptyFilters())).toHaveLength(cards.length);
  });

  it("filters by text across title/details/labels", () => {
    const res = applyFilters(cards, { ...emptyFilters(), text: "backend" });
    expect(res.map((c) => c.id).sort()).toEqual(["1", "4"]);
  });

  it("filters by priority", () => {
    const res = applyFilters(cards, {
      ...emptyFilters(),
      priorities: new Set(["urgent", "high"]),
    });
    expect(res.map((c) => c.id).sort()).toEqual(["1", "4"]);
  });

  it("filters by label (any-of)", () => {
    const res = applyFilters(cards, {
      ...emptyFilters(),
      labels: new Set(["bug"]),
    });
    expect(res.map((c) => c.id)).toEqual(["4"]);
  });

  it("dueOnly keeps only cards with a due date", () => {
    const res = applyFilters(cards, { ...emptyFilters(), dueOnly: true });
    expect(res.map((c) => c.id).sort()).toEqual(["1", "4"]);
  });

  it("combines text + priority", () => {
    const res = applyFilters(cards, {
      ...emptyFilters(),
      text: "bug",
      priorities: new Set(["urgent"]),
    });
    expect(res.map((c) => c.id)).toEqual(["4"]);
  });
});
