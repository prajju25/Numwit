import React from "react";
import { render } from "@testing-library/react";
import BrandMark from "../BrandMark";

describe("BrandMark", () => {
  test("renders a decorative svg at the requested size", () => {
    const { container } = render(<BrandMark size={40} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "40");
  });
});
