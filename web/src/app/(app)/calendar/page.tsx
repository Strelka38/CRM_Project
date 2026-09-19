import { Suspense } from "react";
import { CalendarView } from "@/components/CalendarView";
import { CalendarSkeleton } from "@/components/ui";

export default function CalendarPage() {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarView />
    </Suspense>
  );
}
