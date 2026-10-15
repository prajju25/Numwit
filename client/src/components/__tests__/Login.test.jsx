import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Login from "../Login";
import { useUser } from "../../contexts/UserContext";
import { avatars } from "../../constants/constants";

jest.mock("../../contexts/UserContext", () => ({
  useUser: jest.fn(),
}));

jest.mock("../RoomTypeOverlay", () => (props) => (
  <div data-testid="room-type-overlay">
    <button onClick={props.onClose}>close-overlay</button>
    {props.onCancel && <button onClick={props.onCancel}>cancel-overlay</button>}
  </div>
));

describe("Login", () => {
  let setUser, setHasStarted, setIsWaitingRoom;

  beforeEach(() => {
    jest.clearAllMocks();
    setUser = jest.fn();
    setHasStarted = jest.fn();
    setIsWaitingRoom = jest.fn();
    useUser.mockReturnValue({
      user: null,
      setUser,
      roomId: null,
      setHasStarted,
      setIsWaitingRoom,
    });
  });

  test("renders the nickname input and avatar picker", () => {
    render(<Login />);

    expect(screen.getByLabelText("Your Nickname")).toBeInTheDocument();
    avatars.forEach((av) => {
      expect(screen.getByRole("button", { name: av })).toBeInTheDocument();
    });
    expect(screen.getByText("Start Game →")).toBeInTheDocument();
  });

  test("shows an error when submitting without a name", () => {
    render(<Login />);

    fireEvent.click(screen.getByText("Start Game →"));

    expect(screen.getByText("Please enter a name.")).toBeInTheDocument();
    expect(setUser).not.toHaveBeenCalled();
  });

  test("clears the error once the user types a name", () => {
    render(<Login />);

    fireEvent.click(screen.getByText("Start Game →"));
    expect(screen.getByText("Please enter a name.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Your Nickname"), { target: { value: "Alice" } });
    expect(screen.queryByText("Please enter a name.")).not.toBeInTheDocument();
  });

  test("selecting an avatar highlights it", () => {
    render(<Login />);
    const secondAvatar = screen.getByRole("button", { name: avatars[1] });

    fireEvent.click(secondAvatar);

    expect(secondAvatar.className).toMatch(/border-violet-500/);
  });

  test("submitting with a name and no roomId shows the room type overlay", () => {
    render(<Login />);

    fireEvent.change(screen.getByLabelText("Your Nickname"), { target: { value: "Alice" } });
    fireEvent.click(screen.getByText("Start Game →"));

    expect(setUser).toHaveBeenCalledWith({ name: "Alice", avatar: avatars[0] });
    expect(screen.getByTestId("room-type-overlay")).toBeInTheDocument();
  });

  test("closing the room type overlay hides it", () => {
    render(<Login />);

    fireEvent.change(screen.getByLabelText("Your Nickname"), { target: { value: "Alice" } });
    fireEvent.click(screen.getByText("Start Game →"));
    expect(screen.getByTestId("room-type-overlay")).toBeInTheDocument();

    fireEvent.click(screen.getByText("close-overlay"));
    expect(screen.queryByTestId("room-type-overlay")).not.toBeInTheDocument();
  });

  test("submitting with a name and an existing roomId starts the game directly", () => {
    useUser.mockReturnValue({
      user: null,
      setUser,
      roomId: "room1",
      setHasStarted,
      setIsWaitingRoom,
    });

    render(<Login />);
    fireEvent.change(screen.getByLabelText("Your Nickname"), { target: { value: "Bob" } });
    fireEvent.click(screen.getByText("Start Game →"));

    expect(setUser).toHaveBeenCalledWith({ name: "Bob", avatar: avatars[0] });
    expect(setHasStarted).toHaveBeenCalledWith(true);
    expect(setIsWaitingRoom).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId("room-type-overlay")).not.toBeInTheDocument();
  });

  test("randomize fills in a name and avatar and clears any error", () => {
    render(<Login />);

    fireEvent.click(screen.getByText("Start Game →")); // trigger error first
    expect(screen.getByText("Please enter a name.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("🎲 Randomize"));

    const input = screen.getByLabelText("Your Nickname");
    expect(input.value).toMatch(/^Player\d{3}$/);
    expect(screen.queryByText("Please enter a name.")).not.toBeInTheDocument();
  });

  test("invite link with a saved profile: shows the form prefilled", () => {
    useUser.mockReturnValue({
      user: { name: "ExistingUser", avatar: avatars[2] },
      setUser,
      roomId: "abc123",
      setHasStarted,
      setIsWaitingRoom,
    });

    render(<Login />);
    expect(screen.getByLabelText("Your Nickname").value).toBe("ExistingUser");
    expect(screen.getByRole("button", { name: avatars[2] }).className).toMatch(/border-violet-500/);
  });

  describe("returning player (saved profile, no invite)", () => {
    beforeEach(() => {
      useUser.mockReturnValue({
        user: { name: "ExistingUser", avatar: avatars[2] },
        setUser,
        roomId: null,
        setHasStarted,
        setIsWaitingRoom,
      });
    });

    test("skips the form and opens the room choice straight away", () => {
      render(<Login />);
      expect(screen.getByTestId("room-type-overlay")).toBeInTheDocument();
      expect(screen.queryByLabelText("Your Nickname")).not.toBeInTheDocument();
    });

    test("Cancel goes back via onCancel", () => {
      const onCancel = jest.fn();
      render(<Login onCancel={onCancel} />);
      fireEvent.click(screen.getByText("cancel-overlay"));
      expect(onCancel).toHaveBeenCalled();
      expect(screen.queryByTestId("room-type-overlay")).not.toBeInTheDocument();
    });

    test("Cancel without onCancel just closes; choosing a room closes too", () => {
      const { unmount } = render(<Login />);
      fireEvent.click(screen.getByText("cancel-overlay"));
      expect(screen.queryByTestId("room-type-overlay")).not.toBeInTheDocument();
      unmount();
      render(<Login />);
      fireEvent.click(screen.getByText("close-overlay"));
      expect(screen.queryByTestId("room-type-overlay")).not.toBeInTheDocument();
    });
  });
});
