import { Suspense } from "react";
import { RosterView } from "@/components/RosterView";

export default function RosterPage() {
  return (
    <Suspense fallback={null}>
      <RosterView />
    </Suspense>
  );
}
