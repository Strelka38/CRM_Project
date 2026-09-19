import type { Metadata } from "next";
import { NotificationsPage } from "@/components/NotificationsPage";

export const metadata: Metadata = {
  title: "Уведомления — BaikalStageGroup CRM",
};

export default function NotificationsRoute() {
  return <NotificationsPage />;
}
