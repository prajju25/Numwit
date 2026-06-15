import React from "react";
import { render, screen } from "@testing-library/react";
import CountdownTimer from "../CountdownTimer";
import useCountdown from "../../hooks/useCountdown";
import soundManager from "../../services/soundManager";

jest.mock("../../hooks/useCountdown");
jest.mock("../../services/soundManager", () => ({
  playTimerTick: jest.fn(),
}));

describe("CountdownTimer", () => {
  beforeEach(() => {
    soundManager.playTimerTick.mockClear();
  });

  test("renders nothing when timerDuration is falsy", () => {
    useCountdown.mockReturnValue({ timeLeft: 30, isExpired: false });
    const { container } = render(<CountdownTimer timerDuration={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders the time remaining for a normal (non-warning) state", () => {
    useCountdown.mockReturnValue({ timeLeft: 25, isExpired: false });
    render(<CountdownTimer timerDuration={30} />);
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("25s")).toBeInTheDocument();
    expect(screen.getByText("Time Remaining")).toBeInTheDocument();
  });

  test("shows warning styling at <=10s", () => {
    useCountdown.mockReturnValue({ timeLeft: 8, isExpired: false });
    render(<CountdownTimer timerDuration={30} />);
    expect(screen.getByText("8")).toHaveClass("text-amber-400");
  });

  test("shows danger styling at <=5s", () => {
    useCountdown.mockReturnValue({ timeLeft: 3, isExpired: false });
    render(<CountdownTimer timerDuration={30} />);
    expect(screen.getByText("3")).toHaveClass("text-red-400");
  });

  test("shows 'Time's up!' and ✕ when expired", () => {
    useCountdown.mockReturnValue({ timeLeft: 0, isExpired: true });
    render(<CountdownTimer timerDuration={30} />);
    expect(screen.getByText("✕")).toBeInTheDocument();
    expect(screen.getByText("Time's up!")).toBeInTheDocument();
    expect(screen.getByText("✕")).toHaveClass("text-white/30");
  });

  test("plays a tick sound when timeLeft is between 1 and 10", () => {
    useCountdown.mockReturnValue({ timeLeft: 9, isExpired: false });
    render(<CountdownTimer timerDuration={30} />);
    expect(soundManager.playTimerTick).toHaveBeenCalledTimes(1);
  });

  test("does not play a tick sound when timeLeft is above 10 or 0", () => {
    useCountdown.mockReturnValue({ timeLeft: 15, isExpired: false });
    render(<CountdownTimer timerDuration={30} />);
    expect(soundManager.playTimerTick).not.toHaveBeenCalled();

    soundManager.playTimerTick.mockClear();
    useCountdown.mockReturnValue({ timeLeft: 0, isExpired: true });
    render(<CountdownTimer timerDuration={30} />);
    expect(soundManager.playTimerTick).not.toHaveBeenCalled();
  });

  test("passes the paused prop through to useCountdown", () => {
    useCountdown.mockReturnValue({ timeLeft: 25, isExpired: false });
    render(<CountdownTimer timerDuration={30} paused={true} />);
    expect(useCountdown).toHaveBeenCalledWith(30, true);
  });

  test("does not replay the tick sound for the same timeLeft value", () => {
    useCountdown.mockReturnValue({ timeLeft: 5, isExpired: false });
    const { rerender: rr } = render(<CountdownTimer timerDuration={30} />);
    expect(soundManager.playTimerTick).toHaveBeenCalledTimes(1);

    rr(<CountdownTimer timerDuration={30} />);
    expect(soundManager.playTimerTick).toHaveBeenCalledTimes(1);
  });
});
