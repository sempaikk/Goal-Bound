/**
 * Soft per-user rate limit for button/select spam.
 * Returns true if the action should be allowed.
 */
const hits = new Map();

const WINDOW_MS = 2_500;
const MAX_HITS = 8;

function allowInteraction(userId) {
  const id = String(userId || '');
  if (!id) return true;
  const now = Date.now();
  let bucket = hits.get(id);
  if (!bucket || now - bucket.start > WINDOW_MS) {
    bucket = { start: now, count: 0 };
    hits.set(id, bucket);
  }
  bucket.count += 1;
  if (hits.size > 5_000) {
    for (const [k, v] of hits) {
      if (now - v.start > WINDOW_MS * 4) hits.delete(k);
    }
  }
  return bucket.count <= MAX_HITS;
}

module.exports = { allowInteraction, WINDOW_MS, MAX_HITS };
