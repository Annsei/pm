import { render, screen } from "@testing-library/react";
import { renderCommentBody } from "@/components/CardCommentsPanel";

describe("renderCommentBody (mention highlight)", () => {
  it("highlights @mentions as chips", () => {
    render(<p>{renderCommentBody("hi @alice and @bob!")}</p>);
    const chips = screen.getAllByTestId("mention-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveTextContent("@alice");
    expect(chips[1]).toHaveTextContent("@bob");
  });

  it("does not treat emails as mentions", () => {
    render(<p>{renderCommentBody("write me at bob@example.com anytime")}</p>);
    expect(screen.queryByTestId("mention-chip")).toBeNull();
  });

  it("ignores short handles", () => {
    render(<p>{renderCommentBody("ping @al or @jo")}</p>);
    expect(screen.queryByTestId("mention-chip")).toBeNull();
  });
});
