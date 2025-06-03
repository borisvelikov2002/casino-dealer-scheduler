"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Home, Users, Table, Database, Calendar, Menu, X } from "lucide-react"
import { useState } from "react"

export function Navbar() {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const navItems = [
    { href: "/", label: "Начало", icon: Home },
    { href: "/dealers", label: "Дилъри", icon: Users },
    { href: "/tables", label: "Маси", icon: Table },
    { href: "/table-types", label: "Типове маси", icon: Database },
    { href: "/schedules", label: "Графици", icon: Calendar },
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background shadow-sm">
      <div className="container mx-auto flex h-16 items-center px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-3 mr-8">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-xl">График CASINO</h1>
            <p className="text-xs text-muted-foreground">Система за управление</p>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Generate Schedule Button */}
        <div className="hidden md:block ml-auto">
          <Button asChild>
            <Link href="/schedules/generate">
              <Calendar className="h-4 w-4 mr-2" />
              Генерирай график
            </Link>
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden ml-auto"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Navigation */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="container mx-auto px-4 py-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center space-x-3 px-4 py-3 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
            <div className="pt-4 border-t">
              <Button asChild className="w-full">
                <Link href="/schedules/generate" onClick={() => setIsMobileMenuOpen(false)}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Генерирай график
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
