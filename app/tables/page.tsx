"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { PlusCircle, Grid, List } from "lucide-react"
import { toast } from "sonner"
import type { CasinoTable } from "@/lib/types"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase-singleton"

export default function TablesPage() {
  const router = useRouter()
  const [tables, setTables] = useState<CasinoTable[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  // Мапиране на типовете маси към по-четими имена
  const tableTypeLabels: Record<string, string> = {
    turkish_roulette_turkish: "Turkish Roulette (Turkish)",
    turkish_roulette_english: "Turkish Roulette (English)",
    blackjack_american: "Blackjack (American)",
    blackjack_turkish: "Blackjack (Turkish)",
    blackjack_turkish_tables: "Blackjack with Turkish Tables",
  }

  // Мапиране на статусите към цветове и имена
  const tableStatusConfig: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    active: { label: "Active", variant: "default" },
    inactive: { label: "Inactive", variant: "secondary" },
    service: { label: "In Service", variant: "destructive" },
  }

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const { data, error } = await supabase.from("casino_tables").select("*").order("name")

        if (error) throw error

        setTables(data || [])
      } catch (error: any) {
        console.error("Error fetching tables:", error)
        toast.error(`Error fetching tables: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTables()
  }, [])

  const handleDelete = async (id: string, name: string) => {
    try {
      const { error } = await supabase.from("casino_tables").delete().eq("id", id)

      if (error) throw error

      // Update the local state to remove the deleted table
      setTables(tables.filter((table) => table.id !== id))
      toast.success(`Table "${name}" deleted successfully`)
    } catch (error: any) {
      toast.error(`Error deleting table: ${error.message}`)
    }
  }

  // Сортираме масите по име за списъчния изглед
  const sortedTables = [...tables].sort((a, b) => {
    // Извличаме числата от имената, ако съществуват
    const aMatch = a.name.match(/\d+/)
    const bMatch = b.name.match(/\d+/)

    if (aMatch && bMatch) {
      return Number.parseInt(aMatch[0]) - Number.parseInt(bMatch[0])
    }

    // Връщаме се към азбучно сортиране
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Casino Tables</h1>
        <Button asChild>
          <Link href="/tables/add">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Table
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="grid" onValueChange={(value) => setViewMode(value as "grid" | "list")} className="w-full">
        <div className="flex justify-end mb-4">
          <TabsList>
            <TabsTrigger value="grid" className="flex items-center">
              <Grid className="h-4 w-4 mr-2" />
              Grid View
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center">
              <List className="h-4 w-4 mr-2" />
              List View
            </TabsTrigger>
          </TabsList>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <p>Loading tables...</p>
          </div>
        ) : tables && tables.length > 0 ? (
          <>
            <TabsContent value="grid" className="mt-0">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {tables.map((table) => (
                  <Card key={table.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <CardTitle>{table.name}</CardTitle>
                        <Badge variant={tableStatusConfig[table.status || "active"].variant}>
                          {tableStatusConfig[table.status || "active"].label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground mb-4">
                        <strong>Type:</strong> {tableTypeLabels[table.type] || table.type}
                      </div>
                      <div className="flex justify-end space-x-2">
                        <DeleteConfirmationDialog
                          itemName={table.name}
                          onConfirm={() => handleDelete(table.id, table.name)}
                        />
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/tables/${table.id}/edit`}>Edit</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="list" className="mt-0">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">№</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedTables.map((table, index) => (
                        <TableRow key={table.id}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell>{table.name}</TableCell>
                          <TableCell>{tableTypeLabels[table.type] || table.type}</TableCell>
                          <TableCell>
                            <Badge variant={tableStatusConfig[table.status || "active"].variant}>
                              {tableStatusConfig[table.status || "active"].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end space-x-2">
                              <DeleteConfirmationDialog
                                itemName={table.name}
                                onConfirm={() => handleDelete(table.id, table.name)}
                                size="sm"
                              />
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/tables/${table.id}/edit`}>Edit</Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-4">No tables found. Add your first table to get started.</p>
              <Button asChild>
                <Link href="/tables/add">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Table
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </Tabs>
    </div>
  )
}
