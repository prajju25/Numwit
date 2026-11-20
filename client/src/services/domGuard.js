/**
 * domGuard.js — keep the game working when the browser translates the page.
 *
 * Chrome's built-in translation (and some extensions) swap the text React
 * rendered for their own nodes. When React later updates that text — a score,
 * the demo round's numbers — it calls removeChild / insertBefore with a node
 * that is no longer where React put it, the browser throws, and the whole app
 * falls back to the error screen (facebook/react#11538; seen in production as
 * client_error "Failed to execute 'removeChild' on 'Node'").
 *
 * The usual workaround: skip those two calls when the node has been moved,
 * instead of throwing. The page stays translated and keeps working; at worst
 * one bit of text isn't updated.
 */
export function guardDomAgainstTranslators(proto = typeof Node === "undefined" ? null : Node.prototype) {
  if (!proto || proto.__numwitTranslateGuard) return false;

  const removeChild = proto.removeChild;
  proto.removeChild = function guardedRemoveChild(child) {
    if (child && child.parentNode !== this) return child;
    return removeChild.apply(this, arguments);
  };

  const insertBefore = proto.insertBefore;
  proto.insertBefore = function guardedInsertBefore(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) return newNode;
    return insertBefore.apply(this, arguments);
  };

  Object.defineProperty(proto, "__numwitTranslateGuard", { value: true });
  return true;
}
