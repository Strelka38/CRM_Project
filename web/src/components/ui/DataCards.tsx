"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DataCardField = {
  label: string;
  value: ReactNode;
  /** Значение под подписью на всю ширину — для длинного текста и адресов. */
  block?: boolean;
};

export type DataCardItem = {
  id: string;
  /** То, по чему строку узнают: название компании, ФИО, наименование позиции. */
  title: ReactNode;
  /** Вторая строка заголовка: ИНН, артикул, роль. */
  subtitle?: ReactNode;
  /** Ссылка на карточку сущности. Заголовок становится ссылкой. */
  href?: string;
  /** Если карточка открывает модалку, а не страницу: заголовок станет кнопкой. */
  onPress?: () => void;
  /** Статус или сумма справа от заголовка. */
  trailing?: ReactNode;
  fields?: DataCardField[];
  /** Кнопки в подвале карточки. */
  actions?: ReactNode;
};

/**
 * Список карточек вместо таблицы на мобильном.
 *
 * Ставится рядом с таблицей, а не вместо неё: карточки под `md:hidden`,
 * таблица под `hidden md:block`. Ветка выбирается в CSS, а не в JS, чтобы
 * первый кадр после SSR был правильным.
 *
 * Из строки таблицы в карточку переносим заголовок и 2–4 значения, по которым
 * реально принимают решение. Остальные колонки остаются на десктопе и в
 * карточке сущности — попытка уложить все 9 колонок в 390px возвращает нас к
 * горизонтальному скроллу, только с лишней разметкой.
 */
export function DataCards({
  items,
  emptyMessage = "Ничего не найдено",
  selectedIds,
  onToggleSelect,
  className,
}: {
  items: DataCardItem[];
  emptyMessage?: ReactNode;
  /** Выбранные id. Передавайте вместе с onToggleSelect для массовых операций. */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-8 text-center text-sm text-[var(--muted)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {items.map((item) => {
        const selected = selectedIds?.has(item.id) ?? false;
        return (
          <li
            key={item.id}
            className={cn(
              "overflow-hidden rounded-xl border bg-[var(--panel)] transition-colors",
              selected
                ? "border-[var(--accent)] bg-[var(--selected)]"
                : "border-[var(--line)]",
            )}
          >
            {/* Шапка в две строки: название получает почти всю ширину, а
                подпись и статус уходят на вторую. Если втиснуть их в один
                ряд, на 390px название рвётся после первого слова. */}
            <div className="px-3 py-2.5">
              <div className="flex items-start gap-1">
                {onToggleSelect ? (
                  <label className="tap-target -my-1.5 -ml-1 flex cursor-pointer items-center justify-center px-1">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={selected}
                      onChange={() => onToggleSelect(item.id)}
                      aria-label="Выбрать"
                    />
                  </label>
                ) : null}

                {/* Переносим на вторую строку, а не обрезаем: названия юрлиц
                    различаются в конце («…Групп» против «…Групп Плюс»). */}
                {item.href ? (
                  <Link
                    href={item.href}
                    className="line-clamp-2 min-w-0 flex-1 font-medium text-[var(--ink)] hover:text-[var(--accent)]"
                  >
                    {item.title}
                  </Link>
                ) : item.onPress ? (
                  <button
                    type="button"
                    onClick={item.onPress}
                    className="line-clamp-2 min-w-0 flex-1 text-left font-medium text-[var(--ink)] hover:text-[var(--accent)]"
                  >
                    {item.title}
                  </button>
                ) : (
                  <p className="line-clamp-2 min-w-0 flex-1 font-medium">
                    {item.title}
                  </p>
                )}

                {item.href || item.onPress ? (
                  (() => {
                    const chevronClass =
                      "tap-target -my-1.5 -mr-2 flex shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--header-hover)] hover:text-[var(--accent)]";
                    const chevron = (
                      <svg
                        viewBox="0 0 24 24"
                        className="size-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    );
                    return item.href ? (
                      <Link
                        href={item.href}
                        aria-label="Открыть карточку"
                        className={chevronClass}
                      >
                        {chevron}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={item.onPress}
                        aria-label="Открыть карточку"
                        className={chevronClass}
                      >
                        {chevron}
                      </button>
                    );
                  })()
                ) : null}
              </div>

              {item.subtitle || item.trailing ? (
                <div
                  className={cn(
                    "mt-1 flex items-center gap-2",
                    onToggleSelect && "pl-6",
                  )}
                >
                  {item.subtitle ? (
                    <span className="min-w-0 truncate text-caption text-[var(--muted)]">
                      {item.subtitle}
                    </span>
                  ) : null}
                  {item.trailing ? (
                    <span className="ml-auto shrink-0">{item.trailing}</span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {item.fields?.length ? (
              <dl className="border-t border-[var(--line)] px-3 py-1.5">
                {item.fields.map((field) => (
                  <div
                    key={field.label}
                    className={cn(
                      "py-1",
                      field.block
                        ? ""
                        : "flex items-baseline justify-between gap-3",
                    )}
                  >
                    <dt className="shrink-0 text-caption uppercase tracking-[0.04em] text-[var(--muted)]">
                      {field.label}
                    </dt>
                    <dd
                      className={cn(
                        "min-w-0 text-sm",
                        field.block ? "mt-0.5" : "truncate text-right",
                      )}
                    >
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {item.actions ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-3 py-2">
                {item.actions}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
