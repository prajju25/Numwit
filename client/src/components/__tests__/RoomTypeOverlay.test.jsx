import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import RoomTypeOverlay from "../RoomTypeOverlay";
import { useUser } from "../../contexts/UserContext";
import socket from "../../socket";

jest.mock("../../contexts/UserContext", () => ({
  useUser: jest.fn(),
}));

describe("RoomTypeOverlay", () => {
  let setRoomType, setIsJoiningRoom, onClose;

  beforeEach(() => {
    jest.clearAllMocks();
    setRoomType = jest.fn();
    setIsJoiningRoom = jest.fn();
    onClose = jest.fn();
    useUser.mockReturnValue({
      user: { name: "Alice", avatar: "🐱" },
      deviceId: "dev1",
      setRoomType,
      setIsJoiningRoom,
      roomId: "room1",
    });
  });

  describe("who's around for a public game", () => {
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; });
    const stats = (body) => {
      global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve(body) }));
    };

    test("says how many people are waiting for a public game", async () => {
      stats({ activePlayers: 3, waitingPublic: 2 });
      render(<RoomTypeOverlay onClose={onClose} />);
      expect(await screen.findByText(/2 waiting for a public game — join them/)).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledWith("/api/stats");
    });

    test("otherwise says how many are playing, and that bots fill empty seats", async () => {
      stats({ activePlayers: 4, waitingPublic: 0 });
      render(<RoomTypeOverlay onClose={onClose} />);
      expect(await screen.findByText(/4 playing now · bots fill empty seats/)).toBeInTheDocument();
    });

    test("when nobody is on, says it's quiet", async () => {
      stats({ activePlayers: 0, waitingPublic: 0 });
      render(<RoomTypeOverlay onClose={onClose} />);
      expect(await screen.findByText(/Quiet right now/)).toBeInTheDocument();
    });

    test("shows nothing if the stats can't be loaded", async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
      render(<RoomTypeOverlay onClose={onClose} />);
      await Promise.resolve();
      expect(screen.queryByTestId("public-hint")).not.toBeInTheDocument();
    });
  });

  test("renders all three room type options and a cancel button", () => {
    render(<RoomTypeOverlay onClose={onClose} />);

    expect(screen.getByText(/Public Room/)).toBeInTheDocument();
    expect(screen.getByText(/Private Room/)).toBeInTheDocument();
    expect(screen.getByText(/Play vs Computer/)).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  test("selecting Public Room joins with roomType=public and closes", () => {
    render(<RoomTypeOverlay onClose={onClose} />);

    fireEvent.click(screen.getByText(/Public Room/));

    expect(setRoomType).toHaveBeenCalledWith("public");
    expect(setIsJoiningRoom).toHaveBeenCalledWith(true);
    expect(socket.emit).toHaveBeenCalledWith("join_room", {
      roomId: "room1",
      user: { name: "Alice", avatar: "🐱" },
      roomType: "public",
      deviceId: "dev1",
    });
    expect(onClose).toHaveBeenCalled();
  });

  test("selecting Private Room joins with roomType=private", () => {
    render(<RoomTypeOverlay onClose={onClose} />);

    fireEvent.click(screen.getByText(/Private Room/));

    expect(setRoomType).toHaveBeenCalledWith("private");
    expect(socket.emit).toHaveBeenCalledWith(
      "join_room",
      expect.objectContaining({ roomType: "private" })
    );
  });

  describe("Play vs Computer", () => {
    beforeEach(() => localStorage.clear());

    test("asks for a difficulty first, defaulting to Adaptive", () => {
      render(<RoomTypeOverlay onClose={onClose} />);

      fireEvent.click(screen.getByText(/Play vs Computer/));
      expect(socket.emit).not.toHaveBeenCalled();
      expect(screen.getByText("How tough?")).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /Adaptive/ })).toHaveAttribute("aria-checked", "true");

      fireEvent.click(screen.getByText("Start game"));

      expect(setRoomType).toHaveBeenCalledWith("solo");
      expect(socket.emit).toHaveBeenCalledWith(
        "join_room",
        expect.objectContaining({ roomType: "solo", botDifficulty: "adaptive" })
      );
      expect(onClose).toHaveBeenCalled();
    });

    test("sends the chosen difficulty and remembers it for next time", () => {
      const { unmount } = render(<RoomTypeOverlay onClose={onClose} />);
      fireEvent.click(screen.getByText(/Play vs Computer/));
      fireEvent.click(screen.getByRole("radio", { name: /Ruthless/ }));
      fireEvent.click(screen.getByText("Start game"));

      expect(socket.emit).toHaveBeenCalledWith(
        "join_room",
        expect.objectContaining({ botDifficulty: "ruthless" })
      );
      unmount();

      render(<RoomTypeOverlay onClose={onClose} />);
      fireEvent.click(screen.getByText(/Play vs Computer/));
      expect(screen.getByRole("radio", { name: /Ruthless/ })).toHaveAttribute("aria-checked", "true");
    });

    test("ignores an unknown saved difficulty and survives storage errors", () => {
      localStorage.setItem("numwit_bot_difficulty", "godlike");
      render(<RoomTypeOverlay onClose={onClose} />);
      fireEvent.click(screen.getByText(/Play vs Computer/));
      expect(screen.getByRole("radio", { name: /Adaptive/ })).toHaveAttribute("aria-checked", "true");

      const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
      fireEvent.click(screen.getByText("Start game"));
      expect(socket.emit).toHaveBeenCalled();
      spy.mockRestore();
    });

    test("falls back to Adaptive when storage can't be read", () => {
      const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
      render(<RoomTypeOverlay onClose={onClose} />);
      fireEvent.click(screen.getByText(/Play vs Computer/));
      expect(screen.getByRole("radio", { name: /Adaptive/ })).toHaveAttribute("aria-checked", "true");
      spy.mockRestore();
    });

    test("Back returns to the room types", () => {
      render(<RoomTypeOverlay onClose={onClose} />);
      fireEvent.click(screen.getByText(/Play vs Computer/));
      fireEvent.click(screen.getByText("Back"));
      expect(screen.getByText("Choose Room Type")).toBeInTheDocument();
    });
  });

  test("clicking Cancel calls onClose without emitting join_room", () => {
    render(<RoomTypeOverlay onClose={onClose} />);

    fireEvent.click(screen.getByText("Cancel"));

    expect(onClose).toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  test("renders inline when no #overlay-root portal target exists", () => {
    const { container } = render(<RoomTypeOverlay onClose={onClose} />);
    expect(container.querySelector(".glass-card")).toBeInTheDocument();
  });

  test("renders via portal when #overlay-root exists", () => {
    const portalRoot = document.createElement("div");
    portalRoot.setAttribute("id", "overlay-root");
    document.body.appendChild(portalRoot);

    render(<RoomTypeOverlay onClose={onClose} />);
    expect(portalRoot.querySelector(".glass-card")).toBeInTheDocument();

    document.body.removeChild(portalRoot);
  });
});
