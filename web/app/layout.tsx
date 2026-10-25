import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import { AppShell } from "@/components/ui/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  // URL pública para as imagens de compartilhamento; sem ela, vale o endereço local.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000"),
  title: { default: "Raio-X do Tráfego", template: "%s | Raio-X do Tráfego" },
  description: "Classificação de tráfego cifrado só com tamanho, direção e ritmo dos pacotes, sem abrir o conteúdo.",
  openGraph: { siteName: "Raio-X do Tráfego", locale: "pt_BR", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light", themeColor: "#FFFFFF" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
