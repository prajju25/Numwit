import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import LevelBadge from "../LevelBadge";

describe("LevelBadge", () => {
  test("renders nothing when level is missing or less than 1", () => {
    const { container: c1 } = render(<LevelBadge />);
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(<LevelBadge level={0} />);
    expect(c2).toBeEmptyDOMElement();
  });

  test("renders gray badge for low levels", () => {
    render(<LevelBadge level={1} />);
    const badge = screen.getByTitle("Level 1");
    expect(badge).toHaveTextContent("Lv1");
    expect(badge.className).toContain("bg-white/10");
  });

  test("renders green badge for level 3-4", () => {
    render(<LevelBadge level={3} />);
    expect(screen.getByTitle("Level 3").className).toContain("bg-emerald-500/20");
  });

  test("renders blue badge for level 5-6", () => {
    render(<LevelBadge level={5} />);
    expect(screen.getByTitle("Level 5").className).toContain("bg-sky-500/20");
  });

  test("renders purple badge for level 7-8", () => {
    render(<LevelBadge level={7} />);
    expect(screen.getByTitle("Level 7").className).toContain("bg-violet-500/25");
  });

  test("renders gold star badge for level 9+", () => {
    render(<LevelBadge level={9} />);
    const badge = screen.getByTitle("Level 9");
    expect(badge.className).toContain("bg-amber-400/20");
    expect(badge).toHaveTextContent("★9");
  });

  test("merges custom className", () => {
    render(<LevelBadge level={2} className="custom-class" />);
    expect(screen.getByTitle("Level 2").className).toContain("custom-class");
  });
});
