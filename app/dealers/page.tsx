"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { PlusCircle, Grid, List } from "lucide-react"
import { toast } from "sonner"
import type { Dealer, TableType } from "@/lib/types"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { supabase } from "@/lib/supabase-singleton"

export default function DealersPage() {
  const router = useRouter()
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [dealerTableTypes, setDealerTableTypes] = useState<Record<string, string[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [isUpdating, setIsUpdating] = useState<Record<string, boolean>>({})

  const tableTypes: TableType[] = [
    { value: "turkish_roulette_turkish", label: "TR (TUR)" },
    { value: "turkish_roulette_english", label: "TR (ENG)" },
    { value: "blackjack_american", label: "BJ (US)" },
    { value: "blackjack_turkish", label: "BJ (TUR)" },
    { value: "blackjack_turkish_tables", label: "BJ (TT)" },
  ]

  const tableTypeLabels: Record<string, string> = {
    turkish_roulette_turkish: "Turkish Roulette (Turkish)",
    turkish_roulette_english: "Turkish Roulette (English)",
    blackjack_american: "Blackjack (American)",
    blackjack_turkish: "Blackjack (Turkish)",
    blackjack_turkish_tables: "Blackjack with Turkish Tables",
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch dealers
        const { data: dealersData, error: dealersError } = await supabase.from("dealers").select("*").order("name")

        if (dealersError) throw dealersError

        // Fetch all dealer table type permissions
        const { data: permissionsData, error: permissionsError } = await supabase
          .from("dealer_table_types")
          .select("dealer_id, table_type")

        if (permissionsError) throw permissionsError

        // Organize permissions by dealer
        const tableTypesByDealer: Record<string, string[]> = {}
        permissionsData?.forEach((permission) => {
          if (!tableTypesByDealer[permission.dealer_id]) {
            tableTypesByDealer[permission.dealer_id] = []
          }
          tableTypesByDealer[permission.dealer_id].push(permission.table_type)
        })

        setDealers(dealersData || [])
        setDealerTableTypes(tableTypesByDealer)
      } catch (error: any) {
        console.error("Error fetching dealers:", error)
        toast.error(`Error fetching dealers: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleDelete = async (id: string, name: string) => {
    try {
      // Delete dealer's permissions first
      const { error: permissionsError } = await supabase.from("dealer_table_types").delete().eq("dealer_id", id)

      if (permissionsError) throw permissionsError

      // Then delete the dealer
      const { error: dealerError } = await supabase.from("dealers").delete().eq("id", id)

      if (dealerError) throw dealerError

      // Update the local state to remove the deleted dealer
      setDealers(dealers.filter((dealer) => dealer.id !== id))
      toast.success(`Dealer "${name}" deleted successfully`)
    } catch (error: any) {
      toast.error(`Error deleting dealer: ${error.message}`)
    }
  }

  const togglePermission = async (dealerId: string, tableType: string, hasPermission: boolean) => {
    // Set updating state for this dealer
    setIsUpdating((prev) => ({ ...prev, [dealerId]: true }))

    try {
      if (hasPermission) {
        // Remove permission
        const { error } = await supabase
          .from("dealer_table_types")
          .delete()
          .eq("dealer_id", dealerId)
          .eq("table_type", tableType)

        if (error) throw error

        // Update local state
        setDealerTableTypes((prev) => ({
          ...prev,
          [dealerId]: (prev[dealerId] || []).filter((type) => type !== tableType),
        }))
      } else {
        // Add permission
        const { error } = await supabase
          .from("dealer_table_types")
          .insert({ dealer_id: dealerId, table_type: tableType })

        if (error) throw error

        // Update local state
        setDealerTableTypes((prev) => ({
          ...prev,
          [dealerId]: [...(prev[dealerId] || []), tableType],
        }))
      }

      toast.success(`Permission updated successfully`)
    } catch (error: any) {
      toast.error(`Error updating permission: ${error.message}`)
    } finally {
      setIsUpdating((prev) => ({ ...prev, [dealerId]: false }))
    }
  }

  // Sort dealers by name for the list view
  const sortedDealers = [...dealers].sort((a, b) => {
    // Extract numbers from names if they exist
    const aMatch = a.name.match(/\d+/)
    const bMatch = b.name.match(/\d+/)

    if (aMatch && bMatch) {
      return Number.parseInt(aMatch[0]) - Number.parseInt(bMatch[0])
    }

    // Fall back to alphabetical sorting
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Dealers</h1>
        <Button asChild>
          <Link href="/dealers/add">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Dealer
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
            <p>Loading dealers...</p>
          </div>
        ) : dealers && dealers.length > 0 ? (
          <>
            <TabsContent value="grid" className="mt-0">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {dealers.map((dealer) => (
                  <Card key={dealer.id}>
                    <CardHeader className="pb-2">
                      <CardTitle>
                        {dealer.name}{" "}
                        {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4">
                        <div className="flex flex-wrap gap-2 mb-3">
                          {tableTypes.map((type) => {
                            const hasPermission = (dealerTableTypes[dealer.id] || []).includes(type.value)
                            return (
                              <Button
                                key={`${dealer.id}-${type.value}`}
                                size="sm"
                                variant={hasPermission ? "default" : "outline"}
                                className="text-xs h-8"
                                onClick={() => togglePermission(dealer.id, type.value, hasPermission)}
                                disabled={isUpdating[dealer.id]}
                              >
                                {type.label}
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <DeleteConfirmationDialog
                          itemName={dealer.name}
                          onConfirm={() => handleDelete(dealer.id, dealer.name)}
                        />
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dealers/${dealer.id}/edit`}>Edit</Link>
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
                        <TableHead className="w-[60px]">№</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Nickname</TableHead>
                        <TableHead>Permissions</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedDealers.map((dealer, index) => (
                        <TableRow key={dealer.id}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell>{dealer.name}</TableCell>
                          <TableCell>{dealer.nickname || "-"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              {tableTypes.map((type) => {
                                const hasPermission = (dealerTableTypes[dealer.id] || []).includes(type.value)
                                return (
                                  <Button
                                    key={`${dealer.id}-${type.value}`}
                                    size="sm"
                                    variant={hasPermission ? "default" : "outline"}
                                    className="text-xs h-8"
                                    onClick={() => togglePermission(dealer.id, type.value, hasPermission)}
                                    disabled={isUpdating[dealer.id]}
                                  >
                                    {type.label}
                                  </Button>
                                )
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end space-x-2">
                              <DeleteConfirmationDialog
                                itemName={dealer.name}
                                onConfirm={() => handleDelete(dealer.id, dealer.name)}
                                size="sm"
                              />
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/dealers/${dealer.id}/edit`}>Edit</Link>
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
              <p className="text-muted-foreground mb-4">No dealers found. Add your first dealer to get started.</p>
              <Button asChild>
                <Link href="/dealers/add">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Dealer
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </Tabs>
    </div>
  )
}
