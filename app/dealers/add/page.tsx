"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import type { TableType } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"

export default function AddDealerPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [nickname, setNickname] = useState("")
  const [tableTypes, setTableTypes] = useState<TableType[]>([])
  const [selectedTableTypes, setSelectedTableTypes] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch table types
  useEffect(() => {
    const fetchTableTypes = async () => {
      try {
        // These are the predefined table types
        const types: TableType[] = [
          { value: "turkish_roulette_turkish", label: "Turkish Roulette (Turkish)" },
          { value: "turkish_roulette_english", label: "Turkish Roulette (English)" },
          { value: "blackjack_american", label: "Blackjack (American)" },
          { value: "blackjack_turkish", label: "Blackjack (Turkish)" },
          { value: "blackjack_turkish_tables", label: "Blackjack with Turkish Tables" },
        ]
        setTableTypes(types)
        setIsLoading(false)
      } catch (error: any) {
        toast.error(`Error fetching table types: ${error.message}`)
        setIsLoading(false)
      }
    }

    fetchTableTypes()
  }, [])

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
      // First, insert the dealer
      const { data: dealer, error: dealerError } = await supabase
        .from("dealers")
        .insert([{ name, nickname, available_tables: [] }])
        .select()

      if (dealerError) throw dealerError

      if (!dealer || dealer.length === 0) {
        throw new Error("Failed to create dealer")
      }

      const dealerId = dealer[0].id

      // Then, insert the table type permissions
      if (selectedTableTypes.length > 0) {
        const tableTypePermissions = selectedTableTypes.map((tableType) => ({
          dealer_id: dealerId,
          table_type: tableType,
        }))

        const { error: permissionsError } = await supabase.from("dealer_table_types").insert(tableTypePermissions)

        if (permissionsError) throw permissionsError
      }

      toast.success("Dealer added successfully")
      router.push("/dealers")
      router.refresh()
    } catch (error: any) {
      toast.error(`Error adding dealer: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Add New Dealer</CardTitle>
          <CardDescription>Enter the dealer's information below</CardDescription>
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

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Dealer"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
