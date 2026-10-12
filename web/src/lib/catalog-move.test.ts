import assert from "node:assert/strict";
import {
  filterIdsOutsideMovedFolders,
  folderDropZone,
  isFolderDropBlocked,
  planCategoryMoves,
  planSiblingOrder,
  relocatedSelectionPath,
  rewriteDescendantPath,
  topLevelSelectedCategories,
} from "./catalog-move";

const cats = [
  { id: "root", parentId: null, name: "Каталог", path: "Каталог" },
  {
    id: "online",
    parentId: "root",
    name: "Трансляция Online",
    path: "Каталог/Трансляция Online",
  },
  {
    id: "imag",
    parentId: "online",
    name: "IMAG",
    path: "Каталог/Трансляция Online/IMAG",
  },
  {
    id: "cams",
    parentId: "imag",
    name: "Камеры",
    path: "Каталог/Трансляция Online/IMAG/Камеры",
  },
  {
    id: "sound",
    parentId: "root",
    name: "Звук",
    path: "Каталог/Звук",
  },
];

assert.deepEqual(
  topLevelSelectedCategories(cats, ["imag", "cams"]).map((c) => c.id),
  ["imag"],
);

const moved = planCategoryMoves(cats, ["imag"], "sound");
assert.equal(moved.ok, true);
if (moved.ok) {
  assert.equal(moved.moves.length, 1);
  assert.equal(moved.moves[0].parentId, "sound");
  assert.equal(moved.moves[0].newPath, "Каталог/Звук/IMAG");
}

const intoSelf = planCategoryMoves(cats, ["imag"], "imag");
assert.equal(intoSelf.ok, false);

const intoChild = planCategoryMoves(cats, ["imag"], "cams");
assert.equal(intoChild.ok, false);

const already = planCategoryMoves(cats, ["sound"], "root");
assert.equal(already.ok, true);
if (already.ok) assert.equal(already.moves.length, 0);

const toRoot = planCategoryMoves(cats, ["online"], null);
assert.equal(toRoot.ok, true);
if (toRoot.ok) {
  assert.equal(toRoot.moves[0].parentId, null);
  assert.equal(toRoot.moves[0].newPath, "Трансляция Online");
}

const conflict = planCategoryMoves(
  [
    ...cats,
    {
      id: "sound-imag",
      parentId: "sound",
      name: "IMAG",
      path: "Каталог/Звук/IMAG",
    },
  ],
  ["imag"],
  "sound",
);
assert.equal(conflict.ok, false);

assert.equal(
  rewriteDescendantPath(
    "Каталог/Трансляция Online/IMAG",
    "Каталог/Звук/IMAG",
    "Каталог/Трансляция Online/IMAG/Камеры",
  ),
  "Каталог/Звук/IMAG/Камеры",
);

assert.deepEqual(
  filterIdsOutsideMovedFolders(
    [
      { id: "inside", categoryPath: "Каталог/Трансляция Online/IMAG" },
      { id: "nested", categoryPath: "Каталог/Трансляция Online/IMAG/Камеры" },
      { id: "sibling", categoryPath: "Каталог/Трансляция Online" },
    ],
    ["Каталог/Трансляция Online/IMAG"],
  ),
  ["sibling"],
);

assert.equal(folderDropZone(10, 0, 100), "before");
assert.equal(folderDropZone(50, 0, 100), "into");
assert.equal(folderDropZone(90, 0, 100), "after");

assert.equal(
  isFolderDropBlocked(cats, ["imag"], { id: "cams", path: cats[3].path }, "into"),
  true,
);
assert.equal(
  isFolderDropBlocked(cats, ["imag"], { id: "sound", path: cats[4].path }, "into"),
  false,
);
assert.equal(isFolderDropBlocked(cats, ["online"], null, "into"), false);

assert.deepEqual(
  planSiblingOrder(["a", "b", "c", "d"], ["a", "c"], "d", "before"),
  ["b", "a", "c", "d"],
);
assert.deepEqual(
  planSiblingOrder(["a", "b", "c"], ["x"], "b", "after"),
  ["a", "b", "x", "c"],
);

assert.equal(
  relocatedSelectionPath("Каталог/Трансляция Online/IMAG/Камеры", [
    {
      id: "imag",
      parentId: "sound",
      oldPath: "Каталог/Трансляция Online/IMAG",
      newPath: "Каталог/Звук/IMAG",
    },
  ]),
  "Каталог/Звук/IMAG/Камеры",
);
