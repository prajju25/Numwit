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

  test("selecting Play vs Computer joins with roomType=solo", () => {
    render(<RoomTypeOverlay onClose={onClose} />);

    fireEvent.click(screen.getByText(/Play vs Computer/));

    expect(setRoomType).toHaveBeenCalledWith("solo");
    expect(socket.emit).toHaveBeenCalledWith(
      "join_room",
      expect.objectContaining({ roomType: "solo" })
    );
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
