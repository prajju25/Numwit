import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GameSettingsPanel from "../GameSettingsPanel";

function baseSettings(overrides = {}) {
  return {
    timerDuration: 30,
    eliminationThreshold: 5,
    targetMultiplier: 0.8,
    duplicateRuleEnabled: true,
    ...overrides,
  };
}

describe("GameSettingsPanel", () => {
  test("renders the header and all option rows", () => {
    render(<GameSettingsPanel settings={baseSettings()} onChange={() => {}} />);
    expect(screen.getByText(/Game Settings/)).toBeInTheDocument();
    expect(screen.getByText("(host only)")).toBeInTheDocument();
    expect(screen.getByText("Round timer")).toBeInTheDocument();
    expect(screen.getByText("Elimination at")).toBeInTheDocument();
    expect(screen.getByText("Target =")).toBeInTheDocument();
    expect(screen.getByText("Duplicate rule")).toBeInTheDocument();
  });

  test("highlights the currently selected option for each row", () => {
    render(<GameSettingsPanel settings={baseSettings()} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "30s" }).className).toMatch(/bg-violet-600/);
    expect(screen.getByRole("button", { name: "5 pts" }).className).toMatch(/bg-violet-600/);
    expect(screen.getByRole("button", { name: "80%" }).className).toMatch(/bg-violet-600/);
    expect(screen.getByRole("button", { name: "On" }).className).toMatch(/bg-violet-600/);
  });

  test("clicking a timer option calls onChange with the merged settings", () => {
    const onChange = jest.fn();
    render(<GameSettingsPanel settings={baseSettings()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "60s" }));
    expect(onChange).toHaveBeenCalledWith({ ...baseSettings(), timerDuration: 60 });
  });

  test("clicking an elimination option calls onChange with updated threshold", () => {
    const onChange = jest.fn();
    render(<GameSettingsPanel settings={baseSettings()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "7 pts" }));
    expect(onChange).toHaveBeenCalledWith({ ...baseSettings(), eliminationThreshold: 7 });
  });

  test("clicking a multiplier option calls onChange with updated multiplier", () => {
    const onChange = jest.fn();
    render(<GameSettingsPanel settings={baseSettings()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "90%" }));
    expect(onChange).toHaveBeenCalledWith({ ...baseSettings(), targetMultiplier: 0.9 });
  });

  test("toggling the duplicate rule calls onChange with the new boolean", () => {
    const onChange = jest.fn();
    render(<GameSettingsPanel settings={baseSettings()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(onChange).toHaveBeenCalledWith({ ...baseSettings(), duplicateRuleEnabled: false });
  });

  test("shows the target percentage in the footer text", () => {
    render(<GameSettingsPanel settings={baseSettings({ targetMultiplier: 0.6 })} onChange={() => {}} />);
    expect(screen.getByText(/Target = 60% of the average/)).toBeInTheDocument();
  });

  test("shows classic mode note when duplicate rule is disabled", () => {
    render(<GameSettingsPanel settings={baseSettings({ duplicateRuleEnabled: false })} onChange={() => {}} />);
    expect(screen.getByText(/Duplicate picks are allowed \(Classic mode\)\./)).toBeInTheDocument();
  });

  test("does not show classic mode note when duplicate rule is enabled", () => {
    render(<GameSettingsPanel settings={baseSettings({ duplicateRuleEnabled: true })} onChange={() => {}} />);
    expect(screen.queryByText(/Duplicate picks are allowed/)).not.toBeInTheDocument();
  });
});
