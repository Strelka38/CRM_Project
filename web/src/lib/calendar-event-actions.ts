/** PATCH body: убрать мероприятие из календаря, смета остаётся без дат. */
export function unscheduleQuotePatch() {
  return {
    date: "",
    mountDate: "",
    demountDate: "",
    lifecycle: "CANCELLED" as const,
  };
}
