/**
 * Rerun-comment writer with SHA deduplication.
 *
 * Ensures that exactly one workflow acts as the canonical rerun
 * requester. Comments are deduped by a hidden marker and the head SHA
 * so that duplicate bot comments and race conditions are avoided.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PrComment {
  id: number;
  body: string;
  user: string;
}

export interface RerunWriterOptions {
  /** Hidden HTML marker used to identify rerun-request comments. */
  marker?: string;
  /** Name of the review agent (used in the rerun request body). */
  agentName?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_MARKER = "<!-- risk-policy-rerun-request -->";
const DEFAULT_AGENT = "review-agent";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Build a SHA-tagged rerun-request comment body.
 */
export function buildRerunComment(
  headSha: string,
  options?: RerunWriterOptions,
): string {
  const marker = options?.marker ?? DEFAULT_MARKER;
  const agent = options?.agentName ?? DEFAULT_AGENT;
  return `${marker}\n@${agent} please re-review\nsha:${headSha}`;
}

/**
 * Check whether a rerun request for the given head SHA has already been
 * posted among the supplied comments.
 */
export function hasExistingRerunRequest(
  comments: PrComment[],
  headSha: string,
  options?: RerunWriterOptions,
): boolean {
  const marker = options?.marker ?? DEFAULT_MARKER;
  const trigger = `sha:${headSha}`;
  return comments.some((c) => c.body.includes(marker) && c.body.includes(trigger));
}

/**
 * Determine whether a new rerun-request comment should be posted and,
 * if so, return the comment body. Returns `null` if a request for this
 * SHA already exists.
 */
export function maybeRerunComment(
  comments: PrComment[],
  headSha: string,
  options?: RerunWriterOptions,
): string | null {
  if (hasExistingRerunRequest(comments, headSha, options)) {
    return null;
  }
  return buildRerunComment(headSha, options);
}
