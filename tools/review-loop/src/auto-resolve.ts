/**
 * Auto-resolve bot-only review threads.
 *
 * After a clean current-head rerun, automatically resolves unresolved
 * threads where **all** comments are from the review bot. Human-
 * participated threads are never auto-resolved.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ThreadComment {
  user: string;
  body: string;
}

export interface ReviewThread {
  id: string;
  isResolved: boolean;
  comments: ThreadComment[];
}

export interface AutoResolveResult {
  resolved: string[];
  skipped: string[];
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Identify threads that are safe to auto-resolve.
 *
 * A thread is safe to resolve when:
 *   - It is currently unresolved.
 *   - Every comment in the thread was authored by the bot user.
 */
export function findAutoResolvableThreads(
  threads: ReviewThread[],
  botUser: string,
): ReviewThread[] {
  return threads.filter(
    (t) =>
      !t.isResolved &&
      t.comments.length > 0 &&
      t.comments.every((c) => c.user === botUser),
  );
}

/**
 * Process threads for auto-resolution after a clean rerun.
 *
 * Returns the list of thread IDs that were resolved and those that
 * were skipped (because they contain human comments).
 *
 * Callers supply a `resolveFn` that performs the actual GraphQL mutation
 * or API call to resolve the thread.
 */
export async function autoResolveBotThreads(opts: {
  threads: ReviewThread[];
  botUser: string;
  resolveFn: (threadId: string) => Promise<void>;
}): Promise<AutoResolveResult> {
  const { threads, botUser, resolveFn } = opts;

  const toResolve = findAutoResolvableThreads(threads, botUser);
  const toSkip = threads.filter(
    (t) => !t.isResolved && !toResolve.includes(t),
  );

  const resolved: string[] = [];
  for (const thread of toResolve) {
    await resolveFn(thread.id);
    resolved.push(thread.id);
  }

  return {
    resolved,
    skipped: toSkip.map((t) => t.id),
  };
}
