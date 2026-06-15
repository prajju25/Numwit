import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import VoicePanel from "../VoicePanel";
import { useVoice } from "../../contexts/VoiceContext";
import { useGame } from "../../contexts/GameContext";
import { useUser } from "../../contexts/UserContext";

jest.mock("../../contexts/VoiceContext", () => ({ useVoice: jest.fn() }));
jest.mock("../../contexts/GameContext", () => ({ useGame: jest.fn() }));
jest.mock("../../contexts/UserContext", () => ({ useUser: jest.fn() }));

const players = [
  { socketId: "me", name: "Alice", avatar: "🐱" },
  { socketId: "bob", name: "Bob", avatar: "🐶" },
  { socketId: "carl", name: "Carl", avatar: "🦊" },
];

function setup(voiceOverrides = {}) {
  const joinVoice = jest.fn();
  const leaveVoice = jest.fn();
  const toggleMute = jest.fn();

  useGame.mockReturnValue({ players });
  useUser.mockReturnValue({ user: { socketId: "me", name: "Alice", avatar: "🐱" } });
  useVoice.mockReturnValue({
    joined: false,
    isMuted: false,
    localSpeaking: false,
    error: null,
    peers: {},
    joinVoice,
    leaveVoice,
    toggleMute,
    ...voiceOverrides,
  });

  return { joinVoice, leaveVoice, toggleMute };
}

describe("VoicePanel", () => {
  describe("not joined", () => {
    test("renders the join prompt and calls joinVoice on click", () => {
      const { joinVoice } = setup();
      render(<VoicePanel />);
      expect(screen.getByText("🎙️")).toBeInTheDocument();
      expect(screen.getByText("Voice Chat")).toBeInTheDocument();
      expect(screen.getByText("Talk with other players")).toBeInTheDocument();

      const joinBtn = screen.getByRole("button", { name: "Join" });
      fireEvent.click(joinBtn);
      expect(joinVoice).toHaveBeenCalledTimes(1);
    });

    test("shows a permission_denied error message", () => {
      setup({ error: "permission_denied" });
      render(<VoicePanel />);
      expect(screen.getByText(/microphone/i)).toBeInTheDocument();
    });

    test("shows a not_supported error message", () => {
      setup({ error: "not_supported" });
      render(<VoicePanel />);
      expect(screen.getByText(/support/i)).toBeInTheDocument();
    });

    test("shows an unavailable error message", () => {
      setup({ error: "unavailable" });
      render(<VoicePanel />);
      expect(screen.getByText(/unavailable|try again/i)).toBeInTheDocument();
    });

    test("shows a fallback error message for unknown error codes", () => {
      setup({ error: "something_weird" });
      render(<VoicePanel />);
      expect(screen.getByText(/Could not start voice chat\./)).toBeInTheDocument();
    });

    test("does not show an error message when there is no error", () => {
      setup({ error: null });
      render(<VoicePanel />);
      expect(screen.queryByText(/Could not start voice chat\./)).not.toBeInTheDocument();
    });
  });

  describe("joined", () => {
    test("renders the live badge, local peer tile, and empty peer state", () => {
      setup({ joined: true });
      render(<VoicePanel />);
      expect(screen.getByText("Voice Chat")).toBeInTheDocument();
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
      expect(screen.getByText("Waiting for others to join voice…")).toBeInTheDocument();
    });

    test("mute toggle button calls toggleMute and reflects isMuted state", () => {
      const { toggleMute } = setup({ joined: true, isMuted: false });
      render(<VoicePanel />);
      const muteBtn = screen.getByRole("button", { name: "Mute" });
      fireEvent.click(muteBtn);
      expect(toggleMute).toHaveBeenCalledTimes(1);
    });

    test("shows Unmute title and muted banner when isMuted is true", () => {
      setup({ joined: true, isMuted: true });
      render(<VoicePanel />);
      expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
      expect(screen.getByText(/You are muted/)).toBeInTheDocument();
    });

    test("leave button calls leaveVoice", () => {
      const { leaveVoice } = setup({ joined: true });
      render(<VoicePanel />);
      const leaveBtn = screen.getByRole("button", { name: "Leave voice" });
      fireEvent.click(leaveBtn);
      expect(leaveVoice).toHaveBeenCalledTimes(1);
    });

    test("renders remote peer tiles matched against players", () => {
      setup({
        joined: true,
        peers: {
          bob: { speaking: true, muted: false, connected: true },
          carl: { speaking: false, muted: true, connected: false },
        },
      });
      render(<VoicePanel />);
      expect(screen.getByText(/Bob/)).toBeInTheDocument();
      expect(screen.getByText(/Carl/)).toBeInTheDocument();
      expect(screen.queryByText("Waiting for others to join voice…")).not.toBeInTheDocument();
    });

    test("shows 'connecting' status for a peer that is not yet connected", () => {
      setup({
        joined: true,
        peers: {
          carl: { speaking: false, muted: false, connected: false },
        },
      });
      render(<VoicePanel />);
      expect(screen.getByText("connecting")).toBeInTheDocument();
    });

    test("shows 'speaking' status for a connected, unmuted, speaking peer", () => {
      setup({
        joined: true,
        peers: {
          bob: { speaking: true, muted: false, connected: true },
        },
      });
      render(<VoicePanel />);
      expect(screen.getByText("speaking")).toBeInTheDocument();
    });

    test("shows 'listening' status for a connected, unmuted, non-speaking peer", () => {
      setup({
        joined: true,
        peers: {
          bob: { speaking: false, muted: false, connected: true },
        },
      });
      render(<VoicePanel />);
      expect(screen.getAllByText("listening").length).toBeGreaterThanOrEqual(1);
    });

    test("shows muted icon status for a connected muted peer", () => {
      setup({
        joined: true,
        peers: {
          bob: { speaking: false, muted: true, connected: true },
        },
      });
      render(<VoicePanel />);
      expect(screen.getByText("🔇")).toBeInTheDocument();
    });

    test("renders '…' for an unknown peer not found in players", () => {
      setup({
        joined: true,
        peers: {
          ghost: { speaking: false, muted: false, connected: true },
        },
      });
      render(<VoicePanel />);
      expect(screen.getByText("…")).toBeInTheDocument();
    });
  });
});
