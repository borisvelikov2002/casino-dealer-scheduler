"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import type { Dealer, TableType } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"

export default function EditDealerPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [dealer, setDealer] = useState<Dealer | null>(null)
  const [name, setName] = useState("")
  const [nickname, setNickname] = useState("")
  const [tableTypes, setTableTypes] = useState<TableType[]>([])
  const [selectedTableTypes, setSelectedTableTypes] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

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

        // Fetch dealer's table type permissions
        const { data: permissionsData, error: permissionsError } = await supabase
          .from("dealer_table_types")
          .select("table_type")
          .eq("dealer_id", params.id)

        if (permissionsError) throw permissionsError

        // Set the predefined table types
        const types: TableType[] = [
          { value: "turkish_roulette_turkish", label: "Turkish Roulette (Turkish)" },
          { value: "turkish_roulette_english", label: "Turkish Roulette (English)" },
          { value: "blackjack_american", label: "Blackjack (American)" },
          { value: "blackjack_turkish", label: "Blackjack (Turkish)" },
          { value: "blackjack_turkish_tables", label: "Blackjack with Turkish Tables" },
        ]

        setDealer(dealerData)
        setName(dealerData.name)
        setNickname(dealerData.nickname || "")
        setTableTypes(types)
        setSelectedTableTypes(permissionsData ? permissionsData.map((p) => p.table_type) : [])
      } catch (error: any) {
        toast.error(`Error fetching dealer: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [params.id])

  const handleTableTypeChange = (tableType: string, checked: boolean) => {
    if (checked) {
      setSelectedTableTypes([...selectedTableTypes, tableType])
    } else {
      setSelectedTableTypes(selectedTableTypes.filter((type) => type !== tableType))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name) {
      toast.error("Please enter a dealer name")
      return
    }

    setIsSubmitting(true)

    try {
      // Update dealer info
      const { error: dealerError } = await supabase.from("dealers").update({ name, nickname }).eq("id", params.id)

      if (dealerError) throw dealerError

      // Delete all existing permissions
      const { error: deleteError } = await supabase.from("dealer_table_types").delete().eq("dealer_id", params.id)

      if (deleteError) throw deleteError

      // Insert new permissions
      if (selectedTableTypes.length > 0) {
        const tableTypePermissions = selectedTableTypes.map((tableType) => ({
          dealer_id: params.id,
          table_type: tableType,
        }))

        const { error: permissionsError } = await supabase.from("dealer_table_types").insert(tableTypePermissions)

        if (permissionsError) throw permissionsError
      }

      toast.success("Dealer updated successfully")
      router.push("/dealers")
      router.refresh()
    } catch (error: any) {
      toast.error(`Error updating dealer: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    try {
      // Delete dealer's permissions first
      const { error: permissionsError } = await supabase.from("dealer_table_types").delete().eq("dealer_id", params.id)

      if (permissionsError) throw permissionsError

      // Then delete the dealer
      const { error: dealerError } = await supabase.from("dealers").delete().eq("id", params.id)

      if (dealerError) throw dealerError

      toast.success("Dealer deleted successfully")
      router.push("/dealers")
      router.refresh()
    } catch (error: any) {
      toast.error(`Error deleting dealer: ${error.message}`)
    }
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
          <CardTitle>Edit Dealer</CardTitle>
          <CardDescription>Update the dealer's information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Dealer Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter dealer name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname">Nickname</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter dealer nickname"
              />
            </div>

            <div className="space-y-3">
              <Label>Table Types</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tableTypes.map((tableType) => (
                  <div key={tableType.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={tableType.value}
                      checked={selectedTableTypes.includes(tableType.value)}
                      onCheckedChange={(checked) => handleTableTypeChange(tableType.value, checked === true)}
                    />
                    <Label htmlFor={tableType.value} className="cursor-pointer">
                      {tableType.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <DeleteConfirmationDialog itemName={dealer.name} onConfirm={handleDelete} />

              <div className="flex space-x-2">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
