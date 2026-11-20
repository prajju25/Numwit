import { pathKind, roomCodeFrom } from "../roomLink";

describe("roomLink", () => {
  test("knows the game's real addresses", () => {
    expect(pathKind("/")).toBe("home");
    expect(pathKind("")).toBe("home");
    expect(pathKind("/leaderboard")).toBe("leaderboard");
    expect(pathKind("/leaderboard/")).toBe("leaderboard");
    expect(pathKind("/34ue85")).toBe("room");
    expect(pathKind("/abcdef")).toBe("room");
  });

  test("anything else is unknown, including crawler paths", () => {
    for (const p of ["/contact", "/careers", "/wp-login.php", "/about", "/ABCDEF", "/abc-12", "/34ue85/x"]) {
      expect(pathKind(p)).toBe("unknown");
    }
  });

  test("roomCodeFrom returns the code only for invite paths", () => {
    expect(roomCodeFrom("/34ue85")).toBe("34ue85");
    expect(roomCodeFrom("/contact")).toBeNull();
    expect(roomCodeFrom("/")).toBeNull();
  });
});
