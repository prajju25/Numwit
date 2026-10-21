import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "../ErrorBoundary";
import { reportError } from "../../services/errorReporting";

jest.mock("../../services/errorReporting", () => ({ reportError: jest.fn() }));

function Boom() {
  throw new Error("render failed");
}

describe("ErrorBoundary", () => {
  let consoleError;
  beforeEach(() => {
    jest.clearAllMocks();
    // React logs caught render errors itself — keep the test output clean
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  test("renders its children when nothing goes wrong", () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText("fine")).toBeInTheDocument();
  });

  test("on a crash, reports it and shows a Reload screen instead of a blank page", () => {
    const reload = jest.fn();
    const original = window.location;
    delete window.location;
    window.location = { reload };

    render(<ErrorBoundary><Boom /></ErrorBoundary>);

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(reportError).toHaveBeenCalledWith("render", expect.objectContaining({ message: "render failed" }));
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalled();

    window.location = original;
  });
});
