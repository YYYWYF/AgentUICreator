interface ThreadDeletePort {
  getActiveId(): string;
  subscribe(listener: () => void): () => void;
  delete(): void | Promise<void>;
  select(id: string): void | Promise<void>;
  isActiveEmpty(): boolean;
}

/** UI recovery through public actions; canonical Runtime still owns deletion. */
export async function deleteThreadWithSelectionRecovery(id: string, port: ThreadDeletePort): Promise<void> {
  const wasActive = port.getActiveId() === id;
  let fallback: string | undefined;
  let changedAgain = false;
  const unsubscribe = port.subscribe(() => {
    const active = port.getActiveId();
    if (active === id && fallback === undefined) return;
    if (fallback === undefined) fallback = active;
    else if (active !== fallback) changedAgain = true;
  });
  try { await port.delete(); }
  catch (error) {
    // Do not interrupt navigation or a draft started while persistence waited.
    if (wasActive && fallback !== undefined && !changedAgain && port.getActiveId() === fallback && port.isActiveEmpty()) {
      try { await port.select(id); } catch { /* Keep the original failure. */ }
    }
    throw error;
  } finally { unsubscribe(); }
}
