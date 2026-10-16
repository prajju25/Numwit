import { randomProfile, openProfileMenu, OPEN_PROFILE_EVENT } from "../profile";
import { avatars } from "../../constants/constants";

describe("profile helpers", () => {
  test("randomProfile makes a PlayerNNN name and a real avatar", () => {
    expect(randomProfile(() => 0)).toEqual({ name: "Player100", avatar: avatars[0] });
    expect(randomProfile(() => 0.999)).toEqual({ name: "Player999", avatar: avatars[avatars.length - 1] });
    const p = randomProfile();
    expect(p.name).toMatch(/^Player\d{3}$/);
    expect(avatars).toContain(p.avatar);
  });

  test("openProfileMenu broadcasts the open event", () => {
    const listener = jest.fn();
    window.addEventListener(OPEN_PROFILE_EVENT, listener);
    openProfileMenu();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_PROFILE_EVENT, listener);
  });
});
