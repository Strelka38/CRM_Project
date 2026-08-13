import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Карточка оборудования",
  robots: { index: false, follow: false },
};

export default function PublicQrLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
