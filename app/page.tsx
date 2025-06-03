import { createServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Users, Table, Calendar, ArrowRight, Plus } from "lucide-react"

export default async function Home() {
  const supabase = createServerClient()

  // Get counts for dashboard
  const [dealersResponse, tablesResponse, schedulesResponse] = await Promise.all([
    supabase.from("dealers").select("id", { count: "exact", head: true }),
    supabase.from("casino_tables").select("id", { count: "exact", head: true }),
    supabase.from("schedules").select("id", { count: "exact", head: true }),
  ])

  const dealersCount = dealersResponse.count || 0
  const tablesCount = tablesResponse.count || 0
  const schedulesCount = schedulesResponse.count || 0

  return (
    <div className="space-y-8 py-8">
      {/* Header Section */}
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Начало</h1>
            <p className="text-muted-foreground">Система за управление на графици</p>
          </div>
          <Button asChild>
            <Link href="/schedules/generate">
              <Calendar className="h-4 w-4 mr-2" />
              Генерирай нов график
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="container mx-auto px-4">
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-bold">{dealersCount}</CardTitle>
                  <CardDescription>Дилъри</CardDescription>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="ghost" className="mt-2 w-full justify-between" asChild>
                <Link href="/dealers">
                  Виж всички дилъри
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-bold">{tablesCount}</CardTitle>
                  <CardDescription>Маси</CardDescription>
                </div>
                <div className="bg-green-100 p-3 rounded-lg">
                  <Table className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="ghost" className="mt-2 w-full justify-between" asChild>
                <Link href="/tables">
                  Виж всички маси
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-bold">{schedulesCount}</CardTitle>
                  <CardDescription>Графици</CardDescription>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="ghost" className="mt-2 w-full justify-between" asChild>
                <Link href="/schedules">
                  Виж всички графици
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="container mx-auto px-4">
        <h2 className="text-xl font-semibold mb-4">Бързи действия</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <Plus className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold mb-2">Добави дилър</h3>
                <p className="text-sm text-muted-foreground mb-4">Регистрирай нов дилър в системата</p>
                <Button size="sm" asChild>
                  <Link href="/dealers/add">Добави</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <Table className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-semibold mb-2">Добави маса</h3>
                <p className="text-sm text-muted-foreground mb-4">Конфигурирай нова маса</p>
                <Button size="sm" asChild>
                  <Link href="/tables/add">Добави</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold mb-2">Генерирай график</h3>
                <p className="text-sm text-muted-foreground mb-4">Създай нов работен график</p>
                <Button size="sm" asChild>
                  <Link href="/schedules/generate">Генерирай</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="bg-amber-100 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <Table className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="font-semibold mb-2">Типове маси</h3>
                <p className="text-sm text-muted-foreground mb-4">Управлявай типовете маси</p>
                <Button size="sm" asChild>
                  <Link href="/table-types">Управлявай</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Instructions */}
      <div className="container mx-auto px-4">
        <Card>
          <CardHeader>
            <CardTitle>Инструкции за работа</CardTitle>
            <CardDescription>Следвай тези стъпки за генериране на график</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="bg-blue-100 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center mt-0.5 text-sm font-medium">
                  1
                </div>
                <div>
                  <h3 className="font-medium">Добави дилъри и техните разрешения</h3>
                  <p className="text-sm text-muted-foreground">
                    Регистрирай всички дилъри и настрой на кои маси могат да работят
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-blue-100 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center mt-0.5 text-sm font-medium">
                  2
                </div>
                <div>
                  <h3 className="font-medium">Добави маси и техните типове</h3>
                  <p className="text-sm text-muted-foreground">Конфигурирай всички маси в казиното</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-blue-100 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center mt-0.5 text-sm font-medium">
                  3
                </div>
                <div>
                  <h3 className="font-medium">Генерирай график</h3>
                  <p className="text-sm text-muted-foreground">Създай график за дневна или нощна смяна</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-blue-100 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center mt-0.5 text-sm font-medium">
                  4
                </div>
                <div>
                  <h3 className="font-medium">Прегледай и разпечатай</h3>
                  <p className="text-sm text-muted-foreground">Прегледай генерирания график и го разпространи</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
