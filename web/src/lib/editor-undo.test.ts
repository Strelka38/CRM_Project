import assert from "node:assert/strict";
import test from "node:test";
import { createEditorUndo, isUndoHotkey } from "./editor-undo";

test("undo restores the snapshot taken before the change", () => {
  const undo = createEditorUndo<{ n: number }>();
  undo.capture({ n: 1 });
  const prev = undo.undo();
  assert.deepEqual(prev, { n: 1 });
  assert.equal(undo.undo(), null);
});

test("keystrokes of one field collapse into a single step", async () => {
  const undo = createEditorUndo<{ text: string }>();
  undo.capture({ text: "" }, "name", 0);
  await new Promise((resolve) => queueMicrotask(resolve));
  undo.capture({ text: "a" }, "name", 200);
  await new Promise((resolve) => queueMicrotask(resolve));
  undo.capture({ text: "ab" }, "name", 400);
  assert.equal(undo.size, 1);
  assert.deepEqual(undo.undo(), { text: "" });
});

test("a later field starts a new step", async () => {
  const undo = createEditorUndo<{ text: string }>();
  undo.capture({ text: "" }, "name", 0);
  await new Promise((resolve) => queueMicrotask(resolve));
  undo.capture({ text: "ab" }, "qty", 100);
  assert.equal(undo.size, 2);
  assert.deepEqual(undo.undo(), { text: "ab" });
  assert.deepEqual(undo.undo(), { text: "" });
});

test("cmd/ctrl+z is undo, shift+z is not", () => {
  assert.equal(
    isUndoHotkey({
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      code: "KeyZ",
      key: "z",
    }),
    true,
  );
  assert.equal(
    isUndoHotkey({
      metaKey: false,
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      code: "KeyZ",
      key: "z",
    }),
    false,
  );
});
