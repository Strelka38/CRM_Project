import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[var(--line)]/70",
        className,
      )}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 border-t border-[var(--line)] px-4 py-3 first:border-t-0"
        >
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              className={cn("h-4 flex-1", j === 0 && "max-w-[12rem]")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4" aria-busy="true" aria-label="Загрузка календаря">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 px-0.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`dow-${i}`} className="mx-auto h-3 w-8" />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, week) => (
        <div key={week} className="grid grid-cols-7 gap-1" style={{ minHeight: "4.5rem" }}>
          {Array.from({ length: 7 }).map((_, day) => (
            <div key={day} className="flex flex-col items-center gap-2 pt-1">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-2 w-10" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
