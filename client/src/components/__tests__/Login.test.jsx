import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Login from "../Login";
import { useUser } from "../../contexts/UserContext";
import { avatars } from "../../constants/constants";
import socket from "../../socket";
import { track, trackView } from "../../services/analytics";

jest.mock("../../contexts/UserContext", () => ({
  useUser: jest.fn(),
}));
jest.mock("../../services/analytics", () => ({ track: jest.fn(), trackView: jest.fn() }));

jest.mock("../RoomTypeOverlay", () => (props) => (
  <div data-testid="room-type-overlay">
    <button onClick={props.onClose}>close-overlay</button>
    {props.onCancel && <button onClick={props.onCancel}>cancel-overlay</button>}
  </div>
));

describe("Login", () => {
  let ctx;

  const mockUser = (overrides) => {
    ctx = {
      user: null,
      setUser: jest.fn(),
      roomId: null,
      deviceId: "dev1",
      setHasStarted: jest.fn(),
      setIsWaitingRoom: jest.fn(),
      setRoomType: jest.fn(),
      setIsJoiningRoom: jest.fn(),
      ...overrides,
    };
    useUser.mockReturnValue(ctx);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser();
  });

  describe("first visit (no profile, no invite) — quick start", () => {
    test("creates a random profile and joins a game against Adaptive bots, once", () => {
      const { rerender } = render(<Login />);
      rerender(<Login />);

      expect(ctx.setUser).toHaveBeenCalledTimes(1);
      const profile = ctx.setUser.mock.calls[0][0];
      expect(profile.name).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{1,2}$/);
      expect(avatars).toContain(profile.avatar);
      expect(profile.autoNamed).toBe(true);

      expect(ctx.setRoomType).toHaveBeenCalledWith("solo");
      expect(ctx.setIsJoiningRoom).toHaveBeenCalledWith(true);
      expect(socket.emit).toHaveBeenCalledTimes(1);
      expect(socket.emit).toHaveBeenCalledWith("join_room", {
        roomId: null,
        user: { name: profile.name, avatar: profile.avatar },
        roomType: "solo",
        deviceId: "dev1",
        botDifficulty: "adaptive",
      });
      expect(track).toHaveBeenCalledWith("profile_done", { viaInvite: false, auto: true });
      expect(track).toHaveBeenCalledWith("room_join", { type: "solo", quickStart: true, botDifficulty: "adaptive" });
    });

    test("renders nothing itself (the app shows 'Joining room…')", () => {
      const { container } = render(<Login />);
      expect(container).toBeEmptyDOMElement();
      expect(trackView).not.toHaveBeenCalled(); // the game reports /play/game itself
    });
  });

  describe("returning player (saved profile, no invite)", () => {
    beforeEach(() => mockUser({ user: { name: "ExistingUser", avatar: avatars[2] } }));

    test("skips the form and opens the room choice straight away", () => {
      render(<Login />);
      expect(screen.getByTestId("room-type-overlay")).toBeInTheDocument();
      expect(screen.queryByLabelText("Your Nickname")).not.toBeInTheDocument();
      expect(socket.emit).not.toHaveBeenCalled();
      expect(trackView).toHaveBeenCalledWith("/play/choose", "Choose room");
    });

    test("a player with an old-style PlayerNNN name keeps it", () => {
      mockUser({ user: { name: "Player230", avatar: avatars[2] } });
      render(<Login />);
      expect(ctx.setUser).not.toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalled();
      expect(screen.getByTestId("room-type-overlay")).toBeInTheDocument();
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

  describe("invite link — profile form", () => {
    beforeEach(() => mockUser({ roomId: "abc123" }));

    test("renders the nickname input and avatar picker", () => {
      render(<Login />);
      expect(screen.getByLabelText("Your Nickname")).toBeInTheDocument();
      expect(screen.getByText(/invited to a room/)).toBeInTheDocument();
      expect(trackView).toHaveBeenCalledWith("/play/invite", "Invite");
      avatars.forEach((av) => {
        expect(screen.getByRole("button", { name: av })).toBeInTheDocument();
      });
    });

    test("shows an error when submitting without a name, cleared once typing", () => {
      render(<Login />);
      fireEvent.click(screen.getByText(/Start Game/));
      expect(screen.getByText("Please enter a name.")).toBeInTheDocument();
      expect(ctx.setUser).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Your Nickname"), { target: { value: "A" } });
      expect(screen.queryByText("Please enter a name.")).not.toBeInTheDocument();
    });

    test("submitting saves the profile and enters the invited room", () => {
      render(<Login />);
      fireEvent.change(screen.getByLabelText("Your Nickname"), { target: { value: "  Alice  " } });
      fireEvent.click(screen.getByRole("button", { name: avatars[3] }));
      fireEvent.click(screen.getByText(/Start Game/));

      expect(ctx.setUser).toHaveBeenCalledWith({ name: "Alice", avatar: avatars[3] });
      expect(ctx.setHasStarted).toHaveBeenCalledWith(true);
      expect(ctx.setIsWaitingRoom).toHaveBeenCalledWith(true);
      expect(track).toHaveBeenCalledWith("room_join", { type: "invite" });
      expect(socket.emit).not.toHaveBeenCalled();
    });

    test("selecting an avatar highlights it", () => {
      render(<Login />);
      fireEvent.click(screen.getByRole("button", { name: avatars[1] }));
      expect(screen.getByRole("button", { name: avatars[1] }).className).toMatch(/border-violet-500/);
    });

    test("randomize fills in a name and avatar and clears any error", () => {
      render(<Login />);
      fireEvent.click(screen.getByText(/Start Game/));
      fireEvent.click(screen.getByText(/Randomize/));
      expect(screen.getByLabelText("Your Nickname").value).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{1,2}$/);
      expect(screen.queryByText("Please enter a name.")).not.toBeInTheDocument();
    });

    test("a saved profile prefills the form", () => {
      mockUser({ roomId: "abc123", user: { name: "ExistingUser", avatar: avatars[2] } });
      render(<Login />);
      expect(screen.getByLabelText("Your Nickname").value).toBe("ExistingUser");
      expect(screen.getByRole("button", { name: avatars[2] }).className).toMatch(/border-violet-500/);
    });

    test("follows profile edits made elsewhere (e.g. the top-right menu)", () => {
      const { rerender } = render(<Login />);
      fireEvent.change(screen.getByLabelText("Your Nickname"), { target: { value: "test" } });

      mockUser({ roomId: "abc123", user: { name: "test123", avatar: avatars[4] } });
      rerender(<Login />);

      expect(screen.getByLabelText("Your Nickname").value).toBe("test123");
      expect(screen.getByRole("button", { name: avatars[4] }).className).toMatch(/border-violet-500/);
    });
  });
});
