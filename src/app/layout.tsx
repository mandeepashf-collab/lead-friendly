import type { Metadata } from "next";
import "./globals.css";
import { WhiteLabelLayout } from "@/components/agency/WhiteLabelLayout";
import { BrandProvider } from "@/contexts/BrandContext";

export const metadata: Metadata = {
  title: "AI-Powered Sales CRM",
  description:
    "AI-powered voice sales platform with automated outreach and intelligent CRM.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased">
        <BrandProvider>
          <WhiteLabelLayout>
            {children}
          </WhiteLabelLayout>
        </BrandProvider>
      </body>
    </html>
  );
}
