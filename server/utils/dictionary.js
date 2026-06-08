const fs = require("fs");
const path = require("path");

const WORDS = fs
  .readFileSync(require.resolve("word-list"), "utf8")
  .split("\n")
  .map((w) => w.trim().toLowerCase());

const WORD_SET = new Set(WORDS);

function isValidWord(word) {
  return WORD_SET.has(word.toLowerCase());
}

function isValidPrefix(prefix) {
  const lowerPrefix = prefix.toLowerCase();
  return WORDS.some((w) => w.startsWith(lowerPrefix));
}

module.exports = {
  isValidWord,
  isValidPrefix,
};
