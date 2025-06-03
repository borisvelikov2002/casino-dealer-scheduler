"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { TableTypeToggle } from "@/components/table-type-toggle"
import type { Dealer, DealerTableTypePermission, TableType } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"

export default function DealerPermissionsPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [dealer, setDealer] = useState<Dealer | null>(null)
  const [permissions, setPermissions] = useState<DealerTableTypePermission[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const tableTypes: TableType[] = [
    { value: "turkish_roulette_turkish", label: "Turkish Roulette (Turkish)" },
    { value: "turkish_roulette_english", label: "Turkish Roulette (English)" },
    { value: "blackjack_american", label: "Blackjack (American)" },
    { value: "blackjack_turkish", label: "Blackjack (Turkish)" },
    { value: "blackjack_turkish_tables", label: "Blackjack with Turkish Tables" },
  ]

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch dealer
        const { data: dealerData, error: dealerError } = await supabase
          .from("dealers")
          .select("*")
          .eq("id", params.id)
          .single()

        if (dealerError) throw dealerError

        // Fetch permissions
        const { data: permissionsData, error: permissionsError } = await supabase
          .from("dealer_table_types")
          .select("*")
          .eq("dealer_id", params.id)

        if (permissionsError) throw permissionsError

        setDealer(dealerData)
        setPermissions(permissionsData || [])
      } catch (error: any) {
        toast.error(`Error fetching data: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [params.id])

  const hasPermission = (tableType: string) => {
    return permissions.some((permission) => permission.table_type === tableType)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Loading...</p>
      </div>
    )
  }

  if (!dealer) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Dealer not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>
            {dealer.name} ({dealer.nickname}) - Table Type Permissions
          </CardTitle>
          <CardDescription>Manage which table types this dealer can work at</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {tableTypes.map((tableType) => (
              <TableTypeToggle
                key={tableType.value}
                dealerId={dealer.id}
                tableType={tableType}
                initialEnabled={hasPermission(tableType.value)}
              />
            ))}
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={() => router.back()}>
              Back to Dealer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
