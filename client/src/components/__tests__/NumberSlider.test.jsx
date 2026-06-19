import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import NumberSlider from "../NumberSlider";

describe("NumberSlider", () => {
  test("renders with a default pending value of 50", () => {
    render(<NumberSlider onSelect={() => {}} disabled={false} selectedNumber={null} />);
    expect(screen.getByLabelText("Enter number directly")).toHaveValue(50);
    expect(screen.getByRole("button", { name: /Lock In 50/ })).toBeInTheDocument();
  });

  test("dragging the slider updates the pending value", () => {
    render(<NumberSlider onSelect={() => {}} disabled={false} selectedNumber={null} />);
    const slider = screen.getByLabelText("Pick a number between 0 and 100");
    fireEvent.change(slider, { target: { value: "42" } });
    expect(screen.getByLabelText("Enter number directly")).toHaveValue(42);
    expect(screen.getByRole("button", { name: /Lock In 42/ })).toBeInTheDocument();
  });

  test("the slider allows non-multiples of 5", () => {
    render(<NumberSlider onSelect={() => {}} disabled={false} selectedNumber={null} />);
    const slider = screen.getByLabelText("Pick a number between 0 and 100");
    fireEvent.change(slider, { target: { value: "43" } });
    expect(screen.getByLabelText("Enter number directly")).toHaveValue(43);
  });

  test("manual input clamps and snaps value", () => {
    render(<NumberSlider onSelect={() => {}} disabled={false} selectedNumber={null} />);
    const input = screen.getByLabelText("Enter number directly");

    fireEvent.change(input, { target: { value: "999" } });
    expect(screen.getByRole("button", { name: /Lock In 100/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "-50" } });
    expect(screen.getByRole("button", { name: /Lock In 0/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "abc" } });
    // NaN input is ignored, value unchanged
    expect(screen.getByRole("button", { name: /Lock In 0/ })).toBeInTheDocument();
  });

  test("clicking Lock In calls onSelect with the pending value", () => {
    const onSelect = jest.fn();
    render(<NumberSlider onSelect={onSelect} disabled={false} selectedNumber={null} />);

    const slider = screen.getByLabelText("Pick a number between 0 and 100");
    fireEvent.change(slider, { target: { value: "20" } });

    fireEvent.click(screen.getByRole("button", { name: /Lock In 20/ }));
    expect(onSelect).toHaveBeenCalledWith(20);
  });

  test("does not call onSelect when disabled and Lock In is clicked", () => {
    const onSelect = jest.fn();
    render(<NumberSlider onSelect={onSelect} disabled={true} selectedNumber={null} />);
    // when disabled but selectedNumber is null/undefined, isLocked is false,
    // so Lock In button is rendered but disabled
    const btn = screen.getByRole("button", { name: /Lock In/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("shows locked state when disabled and a selectedNumber is set", () => {
    render(<NumberSlider onSelect={() => {}} disabled={true} selectedNumber={65} />);
    expect(screen.getByText(/Locked in: 65/)).toBeInTheDocument();
    expect(screen.getByLabelText("Enter number directly")).toHaveValue(65);
    expect(screen.queryByRole("button", { name: /Lock In/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pick a number between 0 and 100")).not.toBeInTheDocument();
  });

  test("renders the footer rule text", () => {
    render(<NumberSlider onSelect={() => {}} disabled={false} selectedNumber={null} />);
    expect(screen.getByText("Unique picks only (3+ players) · Ties = all win")).toBeInTheDocument();
  });
});
