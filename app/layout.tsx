import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Navbar } from "@/components/navbar"
import { Toaster } from "sonner"

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: "График CASINO",
  description: "Система за управление на графици на дилъри",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="bg" suppressHydrationWarning className={inter.variable}>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <div className="min-h-screen flex flex-col bg-background">
            <Navbar />
            <main className="flex-1">{children}</main>
            <footer className="border-t py-4 text-center text-sm text-muted-foreground">
              <div className="container mx-auto">
                График CASINO &copy; {new Date().getFullYear()} | Система за управление
              </div>
            </footer>
          </div>
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
