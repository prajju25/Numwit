/**
 * db/feedbackService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * In-app user feedback (bug reports / feature requests / general comments).
 */

const { db } = require("./prismaClient");

const VALID_CATEGORIES = ["bug", "feature", "other"];
const VALID_STATUSES = ["open", "in_review", "resolved"];

/**
 * Create a feedback row.
 * @param {object} input
 * @param {string} [input.deviceId]
 * @param {string} [input.name]
 * @param {string} [input.category]  bug | feature | other (default "other")
 * @param {string} input.message
 * @param {string} [input.context]   e.g. roomId or page the user was on
 * @param {string} [input.userAgent]
 * Returns the created row, or null if the DB is unavailable or input invalid.
 */
async function createFeedback(input) {
  input = input || {};
  const message = (input.message || "").trim();
  if (!message) return null;

  const category = VALID_CATEGORIES.includes(input.category) ? input.category : "other";

  return db((p) =>
    p.feedback.create({
      data: {
        deviceId:  input.deviceId  || null,
        name:      input.name      || null,
        category,
        message:   message.slice(0, 2000),
        context:   input.context   || null,
        userAgent: input.userAgent || null,
      },
    })
  );
}

/**
 * List feedback rows, optionally filtered by status/category, newest first.
 * @param {object} [filters]
 * @param {string} [filters.status]
 * @param {string} [filters.category]
 * @param {number} [filters.limit]   default 50
 * @param {number} [filters.offset]  default 0
 */
async function listFeedback(filters) {
  filters = filters || {};
  const where = {};
  if (VALID_STATUSES.includes(filters.status)) where.status = filters.status;
  if (VALID_CATEGORIES.includes(filters.category)) where.category = filters.category;

  const result = await db((p) =>
    p.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    })
  );
  return result || [];
}

/**
 * Update the status of a feedback row.
 * @param {string} id
 * @param {string} status  open | in_review | resolved
 */
async function updateFeedbackStatus(id, status) {
  if (!VALID_STATUSES.includes(status)) return null;
  return db((p) => p.feedback.update({ where: { id }, data: { status } }));
}

/**
 * Counts of feedback rows grouped by status, e.g. { open: 3, in_review: 1, resolved: 12 }.
 */
async function getFeedbackCounts() {
  const rows = await db((p) =>
    p.feedback.groupBy({ by: ["status"], _count: { id: true } })
  );
  const counts = { open: 0, in_review: 0, resolved: 0 };
  if (!rows) return counts;
  rows.forEach((r) => { counts[r.status] = r._count.id; });
  return counts;
}

module.exports = {
  createFeedback,
  listFeedback,
  updateFeedbackStatus,
  getFeedbackCounts,
  VALID_CATEGORIES,
  VALID_STATUSES,
};
