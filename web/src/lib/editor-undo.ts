const COALESCE_MS = 700;
const MAX_UNDO = 50;

export function createEditorUndo<T>() {
  const stack: T[] = [];
  let gestureKey = "";
  let gestureAt = 0;
  let busy = false;

  return {
    /** Snapshot of the state *before* a change. Same gesture within 700ms stays one step. */
    capture(present: T, gesture?: string, now = Date.now()) {
      if (busy) return;
      if (gesture && gesture === gestureKey && now - gestureAt < COALESCE_MS) {
        gestureAt = now;
        return;
      }
      stack.push(structuredClone(present));
      if (stack.length > MAX_UNDO) stack.shift();
      gestureKey = gesture ?? "";
      gestureAt = now;
      busy = true;
      queueMicrotask(() => {
        busy = false;
      });
    },
    undo(): T | null {
      gestureKey = "";
      gestureAt = 0;
      return stack.pop() ?? null;
    },
    get size() {
      return stack.length;
    },
  };
}

export function isUndoHotkey(e: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  code: string;
  key: string;
}): boolean {
  if (e.shiftKey || e.altKey) return false;
  if (!(e.metaKey || e.ctrlKey)) return false;
  return (
    e.code === "KeyZ" ||
    e.key === "z" ||
    e.key === "Z" ||
    e.key === "я" ||
    e.key === "Я"
  );
}
