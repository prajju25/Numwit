import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ProfileMenu from "../ProfileMenu";
import { useUser } from "../../contexts/UserContext";
import { avatars } from "../../constants/constants";
import socket from "../../socket";
import { openProfileMenu } from "../../services/profile";

jest.mock("../../contexts/UserContext", () => ({
  useUser: jest.fn(),
}));

describe("ProfileMenu", () => {
  let setUser;

  beforeEach(() => {
    setUser = jest.fn();
    useUser.mockReturnValue({ user: { name: "Prajju", avatar: avatars[0] }, setUser });
  });

  test("renders nothing without a profile (or without a provider)", () => {
    useUser.mockReturnValue({ user: null, setUser });
    const { container, unmount } = render(<ProfileMenu />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    useUser.mockReturnValue(undefined);
    expect(render(<ProfileMenu />).container).toBeEmptyDOMElement();
  });

  test("shows the player's chip and opens an edit flyout", () => {
    render(<ProfileMenu />);
    const chip = screen.getByTitle("Edit profile");
    expect(chip).toHaveTextContent("Prajju");
    expect(chip).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Nickname").value).toBe("Prajju");
  });

  test("saves a new name and avatar", () => {
    render(<ProfileMenu />);
    fireEvent.click(screen.getByTitle("Edit profile"));
    fireEvent.change(screen.getByLabelText("Nickname"), { target: { value: "  Ace  " } });
    fireEvent.click(screen.getByRole("button", { name: `Avatar ${avatars[3]}` }));
    fireEvent.click(screen.getByText("Save"));

    expect(setUser).toHaveBeenCalledWith({ name: "Ace", avatar: avatars[3] });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("rejects an empty name", () => {
    render(<ProfileMenu />);
    fireEvent.click(screen.getByTitle("Edit profile"));
    fireEvent.change(screen.getByLabelText("Nickname"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save"));

    expect(setUser).not.toHaveBeenCalled();
    expect(screen.getByText("Please enter a name.")).toBeInTheDocument();
  });

  test("closes on Escape, outside click, or a second click on the chip", () => {
    render(<div><ProfileMenu /><p>outside</p></div>);
    const chip = screen.getByTitle("Edit profile");

    fireEvent.click(chip);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(chip);
    fireEvent.mouseDown(screen.getByRole("dialog"));
    fireEvent.keyDown(document, { key: "a" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("falls back to the first avatar when the profile has none", () => {
    useUser.mockReturnValue({ user: { name: "NoAvatar" }, setUser });
    render(<ProfileMenu />);
    fireEvent.click(screen.getByTitle("Edit profile"));
    fireEvent.click(screen.getByText("Save"));
    expect(setUser).toHaveBeenCalledWith({ name: "NoAvatar", avatar: avatars[0] });
  });
});

describe("ProfileMenu sync and nudges", () => {
  let setUser;
  beforeEach(() => {
    jest.clearAllMocks();
    setUser = jest.fn();
  });

  test("saving tells the server (so the room sees the new name) and clears the auto-name flag", () => {
    useUser.mockReturnValue({ user: { name: "Player482", avatar: avatars[1], autoNamed: true }, setUser });
    render(<ProfileMenu />);
    expect(screen.getByText("Set name")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Edit profile"));
    fireEvent.change(screen.getByLabelText("Nickname"), { target: { value: "Ace" } });
    fireEvent.click(screen.getByText("Save"));

    expect(setUser).toHaveBeenCalledWith({ name: "Ace", avatar: avatars[1] });
    expect(socket.emit).toHaveBeenCalledWith("update_profile", { name: "Ace", avatar: avatars[1] });
  });

  test("other screens can open it, prefilled with the current profile", () => {
    useUser.mockReturnValue({ user: { name: "Player482", avatar: avatars[2] }, setUser });
    render(<ProfileMenu />);
    act(() => openProfileMenu());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Nickname").value).toBe("Player482");
  });

  test("the open event is ignored without a profile", () => {
    useUser.mockReturnValue({ user: null, setUser });
    render(<ProfileMenu />);
    act(() => openProfileMenu());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
