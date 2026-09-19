import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BaikalStageGroup CRM",
    short_name: "CRM",
    description: "Сметы и каталог проката ивент-оборудования",
    start_url: "/calendar",
    scope: "/",
    display: "standalone",
    background_color: "#0b0c0e",
    theme_color: "#0b0c0e",
    lang: "ru",
  };
}
