import { guardDomAgainstTranslators } from "../domGuard";

// A fresh prototype per test, so the real Node.prototype isn't patched
function fakeProto() {
  return {
    removeChild: jest.fn(() => "removed"),
    insertBefore: jest.fn(() => "inserted"),
  };
}

describe("guardDomAgainstTranslators", () => {
  test("skips removeChild when a translator already moved the node", () => {
    const proto = fakeProto();
    const original = proto.removeChild;
    guardDomAgainstTranslators(proto);
    const parent = Object.create(proto);
    const moved = { parentNode: {} };
    expect(proto.removeChild.call(parent, moved)).toBe(moved);
    expect(original).not.toHaveBeenCalled();

    const child = { parentNode: parent };
    expect(proto.removeChild.call(parent, child)).toBe("removed");
    expect(original).toHaveBeenCalledTimes(1);
  });

  test("skips insertBefore when the reference node was moved", () => {
    const proto = fakeProto();
    const original = proto.insertBefore;
    guardDomAgainstTranslators(proto);
    const parent = Object.create(proto);
    const node = {};
    expect(proto.insertBefore.call(parent, node, { parentNode: {} })).toBe(node);
    expect(original).not.toHaveBeenCalled();

    expect(proto.insertBefore.call(parent, node, { parentNode: parent })).toBe("inserted");
    expect(proto.insertBefore.call(parent, node, null)).toBe("inserted");
    expect(original).toHaveBeenCalledTimes(2);
  });

  test("patches only once and is a no-op without a DOM", () => {
    const proto = fakeProto();
    expect(guardDomAgainstTranslators(proto)).toBe(true);
    expect(guardDomAgainstTranslators(proto)).toBe(false);
    expect(guardDomAgainstTranslators(null)).toBe(false);
  });

  test("a real translated text node no longer crashes React-style updates", () => {
    guardDomAgainstTranslators(); // the real Node.prototype (jsdom)
    const div = document.createElement("div");
    const text = document.createTextNode("Hello");
    div.appendChild(text);
    // a translator wraps the text in its own element
    const font = document.createElement("font");
    div.replaceChild(font, text);
    font.appendChild(text);
    expect(() => div.removeChild(text)).not.toThrow();
    expect(() => div.insertBefore(document.createTextNode("x"), text)).not.toThrow();
  });
});
