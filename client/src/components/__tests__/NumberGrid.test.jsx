import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import NumberGrid from "../NumberGrid";

describe("NumberGrid", () => {
  test("renders buttons for 0 through 100", () => {
    render(<NumberGrid onSelect={() => {}} disabled={false} selectedNumber={null} />);
    expect(screen.getByRole("button", { name: "0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "100" })).toBeInTheDocument();
    // 101 total buttons (0-100)
    expect(screen.getAllByRole("button")).toHaveLength(101);
  });

  test("calls onSelect with the clicked number", () => {
    const onSelect = jest.fn();
    render(<NumberGrid onSelect={onSelect} disabled={false} selectedNumber={null} />);

    fireEvent.click(screen.getByRole("button", { name: "42" }));
    expect(onSelect).toHaveBeenCalledWith(42);

    fireEvent.click(screen.getByRole("button", { name: "0" }));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  test("disables all buttons when disabled is true", () => {
    render(<NumberGrid onSelect={() => {}} disabled={true} selectedNumber={null} />);
    screen.getAllByRole("button").forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  test("highlights the selected number", () => {
    render(<NumberGrid onSelect={() => {}} disabled={false} selectedNumber={42} />);
    const selectedBtn = screen.getByRole("button", { name: "42" });
    expect(selectedBtn.className).toMatch(/scale-110/);
  });

  test("does not call onSelect for a disabled grid even if clicked", () => {
    const onSelect = jest.fn();
    render(<NumberGrid onSelect={onSelect} disabled={true} selectedNumber={null} />);
    fireEvent.click(screen.getByRole("button", { name: "10" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
