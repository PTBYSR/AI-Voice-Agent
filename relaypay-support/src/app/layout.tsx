import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RelayPay Support",
  description: "Voice-based customer support for RelayPay",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans bg-rp-bg text-rp-primary">{children}</body>
    </html>
  );
}
