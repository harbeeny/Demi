import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// viewport-fit=cover lets the app paint under the notch/home indicator; the
// safe-area padding in globals.css keeps content out of those regions.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#121612" },
  ],
};

// Runs before paint so a chosen theme never flashes the wrong colors.
// 'light'/'dark' pin data-theme; anything else (system, unset) leaves the
// attribute off and the CSS media query decides.
const THEME_BOOT = `try{var t=localStorage.getItem("demi:theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Demi | Results are made in the kitchen",
  description:
    "Nutrition-first health: Demi computes your calories and macros, plans real meals that fit, and explains the why behind every one.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
