import { Suspense } from "react";
import { CalendarView } from "@/components/CalendarView";

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarView />
    </Suspense>
  );
}
