"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  PERMISSION_ROLES,
  PERMISSION_TREE,
  compactPermissionOverrides,
  permissionCell,
  type PermissionId,
  type PermissionNode,
  type RolePermissionOverrides,
} from "@/lib/permission-tree";
import { roleLabelRuTitle, type AppRole } from "@/lib/roles";

const ROLE_COLS: AppRole[] = [...PERMISSION_ROLES];

function toggleableChildren(node: PermissionNode): PermissionNode[] {
  const out: PermissionNode[] = [];
  function walk(n: PermissionNode) {
    if (n.kind !== "group") out.push(n);
    n.children?.forEach(walk);
  }
  node.children?.forEach(walk);
  return out;
}

function setCell(
  current: RolePermissionOverrides,
  id: PermissionId,
  role: AppRole,
  allowed: boolean,
): RolePermissionOverrides {
  return compactPermissionOverrides({
    ...current,
    [id]: { ...current[id], [role]: allowed },
  });
}

function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
      <path
        d="M2.2 6.2 4.8 8.7 9.8 3.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RoleCell({
  id,
  role,
  overrides,
  onToggle,
}: {
  id: PermissionId;
  role: AppRole;
  overrides: RolePermissionOverrides;
  onToggle: (id: PermissionId, role: AppRole, allowed: boolean) => void;
}) {
  const cell = permissionCell(id, role, overrides);
  if (cell.reason === "per-user") {
    return (
      <td className="px-1 py-2 text-center">
        <span className="text-caption text-[var(--muted)]" title="Персональный флаг">
          —
        </span>
      </td>
    );
  }

  return (
    <td className="px-1 py-2 text-center">
      <button
        type="button"
        role="checkbox"
        aria-checked={cell.allowed}
        aria-label={`${roleLabelRuTitle(role)}`}
        disabled={cell.locked}
        onClick={() => onToggle(id, role, !cell.allowed)}
        className={cn(
          "inline-grid size-4 place-items-center rounded-[3px] border transition-colors",
          cell.allowed
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
            : "border-[var(--line)] bg-[var(--panel)] text-transparent",
          cell.locked
            ? "cursor-default opacity-55"
            : "hover:border-[var(--accent)]",
        )}
      >
        {cell.allowed ? <CheckMark /> : null}
      </button>
    </td>
  );
}

function GroupCell({
  node,
  role,
  overrides,
  onToggleGroup,
}: {
  node: PermissionNode;
  role: AppRole;
  overrides: RolePermissionOverrides;
  onToggleGroup: (node: PermissionNode, role: AppRole, allowed: boolean) => void;
}) {
  const kids = toggleableChildren(node).filter((n) => !n.perUser);
  const cells = kids.map((n) => permissionCell(n.id, role, overrides));
  const unlocked = cells.filter((c) => !c.locked);
  const allOn = unlocked.length > 0 && unlocked.every((c) => c.allowed);
  const someOn = unlocked.some((c) => c.allowed);
  const locked = unlocked.length === 0;

  return (
    <td className="px-1 py-2 text-center">
      <button
        type="button"
        role="checkbox"
        aria-checked={allOn ? true : someOn ? "mixed" : false}
        aria-label={`${node.label}: ${roleLabelRuTitle(role)}`}
        disabled={locked}
        onClick={() => onToggleGroup(node, role, !allOn)}
        className={cn(
          "inline-grid size-4 place-items-center rounded-[3px] border transition-colors",
          allOn
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
            : someOn
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_28%,var(--panel))] text-[var(--accent)]"
              : "border-[var(--line)] bg-[var(--panel)] text-transparent",
          locked
            ? "cursor-default opacity-55"
            : "hover:border-[var(--accent)]",
        )}
      >
        {allOn || someOn ? <CheckMark /> : null}
      </button>
    </td>
  );
}

export function RoleAccessTree({
  initialOverrides,
}: {
  initialOverrides: RolePermissionOverrides;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState(initialOverrides);
  const [baseline, setBaseline] = useState(initialOverrides);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PERMISSION_TREE.map((n) => [n.id, true])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty = useMemo(
    () =>
      JSON.stringify(compactPermissionOverrides(overrides)) !==
      JSON.stringify(compactPermissionOverrides(baseline)),
    [overrides, baseline],
  );

  function onToggle(id: PermissionId, role: AppRole, allowed: boolean) {
    setOverrides((cur) => setCell(cur, id, role, allowed));
    setSavedAt(null);
  }

  function onToggleGroup(
    node: PermissionNode,
    role: AppRole,
    allowed: boolean,
  ) {
    if (role === "ADMIN") return;
    setOverrides((cur) => {
      let next = cur;
      for (const child of toggleableChildren(node)) {
        const cell = permissionCell(child.id, role, next);
        if (cell.locked) continue;
        next = setCell(next, child.id, role, allowed);
      }
      return next;
    });
    setSavedAt(null);
  }

  function onChevron(id: PermissionId) {
    setOpen((cur) => ({ ...cur, [id]: cur[id] === false }));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const data = (await res.json()) as {
        overrides?: RolePermissionOverrides;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить");
      const next = data.overrides ?? {};
      setOverrides(next);
      setBaseline(next);
      setSavedAt("Сохранено");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function resetDefaults() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: {} }),
      });
      if (!res.ok) throw new Error("Не удалось сбросить");
      setOverrides({});
      setBaseline({});
      setSavedAt("Вернули стандартные права");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сбросить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <PageHeader
        eyebrow="Настройки"
        title="Права ролей"
        subtitle="Какие разделы видны в меню и какие функции доступны менеджеру, бригадиру и сотруднику. Админ всегда со всеми правами — его колонку снять нельзя."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={resetDefaults}
            >
              К стандартным
            </Button>
            <Button size="sm" disabled={busy || !dirty} onClick={save}>
              {busy ? "Сохраняем…" : "Сохранить"}
            </Button>
          </div>
        }
      />

      {error ? (
        <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>
      ) : null}
      {savedAt ? (
        <p className="mb-3 text-sm text-[var(--muted)]">{savedAt}</p>
      ) : null}

      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--panel-muted)]">
              <th className="sticky left-0 z-[2] bg-[var(--panel-muted)] px-3 py-2.5 text-left text-caption font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Раздел / функция
              </th>
              {ROLE_COLS.map((role) => (
                <th
                  key={role}
                  className="min-w-[5.5rem] px-2 py-2.5 text-center text-caption font-medium uppercase tracking-[0.08em] text-[var(--muted)]"
                >
                  {roleLabelRuTitle(role)}
                </th>
              ))}
            </tr>
          </thead>
          {PERMISSION_TREE.map((node) => (
            <GroupBlock
              key={node.id}
              node={node}
              open={open}
              overrides={overrides}
              onToggle={onToggle}
              onToggleGroup={onToggleGroup}
              onChevron={onChevron}
            />
          ))}
        </table>
      </div>
    </div>
  );
}

function GroupBlock({
  node,
  open,
  overrides,
  onToggle,
  onToggleGroup,
  onChevron,
}: {
  node: PermissionNode;
  open: Record<string, boolean>;
  overrides: RolePermissionOverrides;
  onToggle: (id: PermissionId, role: AppRole, allowed: boolean) => void;
  onToggleGroup: (node: PermissionNode, role: AppRole, allowed: boolean) => void;
  onChevron: (id: PermissionId) => void;
}) {
  const expanded = open[node.id] !== false;
  return (
    <tbody className="border-t border-[var(--line)]">
      <tr className="bg-[var(--panel-muted)]">
        <th
          scope="row"
          className="sticky left-0 z-[1] bg-[var(--panel-muted)] px-3 py-2.5 text-left font-normal"
        >
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => onChevron(node.id)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className="text-caption text-[var(--muted)]" aria-hidden>
              {expanded ? "▾" : "▸"}
            </span>
            <span className="text-sm font-medium text-[var(--ink)]">
              {node.label}
            </span>
          </button>
        </th>
        {ROLE_COLS.map((role) => (
          <GroupCell
            key={role}
            node={node}
            role={role}
            overrides={overrides}
            onToggleGroup={onToggleGroup}
          />
        ))}
      </tr>
      {expanded && node.children
        ? node.children.map((child) => (
            <ChildRow
              key={child.id}
              node={child}
              depth={1}
              overrides={overrides}
              onToggle={onToggle}
            />
          ))
        : null}
    </tbody>
  );
}

function ChildRow({
  node,
  depth,
  overrides,
  onToggle,
}: {
  node: PermissionNode;
  depth: number;
  overrides: RolePermissionOverrides;
  onToggle: (id: PermissionId, role: AppRole, allowed: boolean) => void;
}) {
  return (
    <>
      <tr className="border-t border-[var(--line)] bg-[var(--panel)]">
        <th
          scope="row"
          className="sticky left-0 z-[1] bg-[var(--panel)] py-2.5 pr-3 text-left font-normal"
          style={{ paddingLeft: 12 + depth * 18 }}
        >
          <div className="min-w-0">
            <div className="text-sm text-[var(--ink)]">
              {node.label}
              {node.href ? (
                <span className="ml-2 font-mono text-caption text-[var(--muted)]">
                  {node.href}
                </span>
              ) : null}
            </div>
            {node.hint ? (
              <p className="mt-0.5 max-w-xl text-caption leading-snug text-[var(--muted)]">
                {node.hint}
              </p>
            ) : null}
          </div>
        </th>
        {ROLE_COLS.map((role) => (
          <RoleCell
            key={role}
            id={node.id}
            role={role}
            overrides={overrides}
            onToggle={onToggle}
          />
        ))}
      </tr>
      {node.children?.map((child) => (
        <ChildRow
          key={child.id}
          node={child}
          depth={depth + 1}
          overrides={overrides}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}
