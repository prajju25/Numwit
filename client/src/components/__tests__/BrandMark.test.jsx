import React from "react";
import { render } from "@testing-library/react";
import BrandMark from "../BrandMark";

describe("BrandMark", () => {
  test("renders the app icon as a decorative image at the requested size", () => {
    const { container } = render(<BrandMark size={40} />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/icons/icon-192.png");
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("width", "40");
  });

  test("uses the 512px artwork for large sizes", () => {
    const { container } = render(<BrandMark size={128} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/icons/icon-512.png");
  });
});
