/**
 * profile.js — helpers for the player's local profile.
 */
import { avatars } from "../constants/constants";

// Default names are two words + a number ("SwiftOtter42"): 50 × 50 × 100 =
// 250,000 combinations, so two players rarely share one (the old "Player###"
// had only 900). Each word is at most 8 letters, so a name fits the 20-char
// limit. Names are only labels — players are identified by device id — so a
// rare repeat is harmless. Existing players keep whatever name they have.
export const NAME_ADJECTIVES = [
  "Swift", "Lucky", "Clever", "Brave", "Sunny", "Quiet", "Bold", "Witty",
  "Jolly", "Calm", "Rapid", "Sly", "Bright", "Cosmic", "Fuzzy", "Gentle",
  "Happy", "Keen", "Lively", "Mighty", "Nimble", "Plucky", "Quirky", "Royal",
  "Snappy", "Spry", "Steady", "Sneaky", "Tiny", "Vivid", "Wild", "Zesty",
  "Amber", "Breezy", "Crisp", "Dashing", "Electric", "Fancy", "Golden", "Hidden",
  "Icy", "Jazzy", "Mellow", "Noble", "Peppy", "Rusty", "Silver", "Smooth",
  "Stellar", "Turbo",
];

export const NAME_NOUNS = [
  "Otter", "Comet", "Falcon", "Panda", "Tiger", "Fox", "Owl", "Koala",
  "Badger", "Dolphin", "Lynx", "Raven", "Gecko", "Moose", "Bison", "Heron",
  "Mango", "Pickle", "Waffle", "Muffin", "Nugget", "Pebble", "Rocket", "Meteor",
  "Nova", "Pixel", "Quasar", "Wizard", "Ninja", "Pirate", "Knight", "Ranger",
  "Wombat", "Yak", "Zebra", "Puffin", "Walrus", "Narwhal", "Beetle", "Cricket",
  "Maple", "Cactus", "Acorn", "Thunder", "Breeze", "Glacier", "Canyon", "Ember",
  "Sparrow", "Jaguar",
];

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** A random default name, e.g. "SwiftOtter42". */
export function randomName(rng = Math.random) {
  return `${pick(NAME_ADJECTIVES, rng)}${pick(NAME_NOUNS, rng)}${Math.floor(rng() * 100)}`;
}

/** A throwaway profile for players who haven't picked a name yet. */
export function randomProfile(rng = Math.random) {
  return {
    name: randomName(rng),
    avatar: avatars[Math.floor(rng() * avatars.length)],
  };
}

// Lets any screen open the top-right profile menu (e.g. "change name" hints)
export const OPEN_PROFILE_EVENT = "numwit:open-profile";

export function openProfileMenu() {
  window.dispatchEvent(new Event(OPEN_PROFILE_EVENT));
}
