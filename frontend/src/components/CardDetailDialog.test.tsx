import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CardDetailDialog } from "@/components/CardDetailDialog";
import type { Card } from "@/lib/kanban";

const card: Card = {
  id: "c1",
  title: "Fix login",
  details: "broken since 4.7",
  labels: ["bug", "auth"],
  priority: "high",
  due_date: "2026-05-01",
};

describe("CardDetailDialog", () => {
  it("hydrates fields from the card", () => {
    render(
      <CardDetailDialog card={card} onClose={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.getByLabelText("Title")).toHaveValue("Fix login");
    expect(screen.getByLabelText("Details")).toHaveValue("broken since 4.7");
    expect(screen.getByLabelText("Priority")).toHaveValue("high");
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-05-01");
    expect(screen.getByLabelText(/labels/i)).toHaveValue("bug, auth");
  });

  it("saves edits including labels normalization", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <CardDetailDialog card={card} onClose={onClose} onSave={onSave} />
    );
    const labels = screen.getByLabelText(/labels/i);
    await userEvent.clear(labels);
    await userEvent.type(labels, " backend ,   urgent ,,");
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "urgent");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "c1",
        priority: "urgent",
        labels: ["backend", "urgent"],
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("clears priority when None is selected", async () => {
    const onSave = vi.fn();
    render(
      <CardDetailDialog card={card} onClose={vi.fn()} onSave={onSave} />
    );
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ priority: null }));
  });

  it("calls onDelete via delete button", async () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(
      <CardDetailDialog
        card={card}
        onClose={onClose}
        onSave={vi.fn()}
        onDelete={onDelete}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /delete card/i }));
    expect(onDelete).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
