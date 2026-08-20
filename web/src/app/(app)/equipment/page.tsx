import { redirect } from "next/navigation";

/** Бывший «Склад» объединён с редактором каталога. */
export default function EquipmentRedirectPage() {
  redirect("/catalog");
}
