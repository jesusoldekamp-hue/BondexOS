import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BondexOS",
  description: "Plataforma enterprise para automatizacion de fianzas."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
