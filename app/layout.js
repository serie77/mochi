import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "./wallet.js";

const sans = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const DESC = "yield with a face. deposit USDG into her spark-routed vault on robinhood chain, stake $mochi for the fee stream in real USDG, and dress her every epoch.";

export const metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: { default: "mochi · the girl the chain dresses", template: "%s · mochi" },
  description: DESC,
  icons: { icon: "/favicon.png", apple: "/favicon-180.png" },
  openGraph: { title: "mochi · the girl the chain dresses", description: DESC, images: ["/og-image.png"], siteName: "mochi" },
  twitter: { card: "summary_large_image", title: "mochi · the girl the chain dresses", description: DESC, images: ["/og-image.png"] },
};

export const viewport = { themeColor: "#07040a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
