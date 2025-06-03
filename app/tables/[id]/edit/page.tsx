"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import type { CasinoTable, TableStatus } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"

export default function EditTablePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [table, setTable] = useState<CasinoTable | null>(null)
  const [name, setName] = useState("")
  const [type, setType] = useState("")
  const [status, setStatus] = useState<TableStatus>("active")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const tableTypes = [
    { value: "turkish_roulette_turkish", label: "Turkish Roulette (Turkish)" },
    { value: "turkish_roulette_english", label: "Turkish Roulette (English)" },
    { value: "blackjack_american", label: "Blackjack (American)" },
    { value: "blackjack_turkish", label: "Blackjack (Turkish)" },
    { value: "blackjack_turkish_tables", label: "Blackjack with Turkish Tables" },
  ]

  const tableStatuses = [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "service", label: "In Service" },
  ]

  useEffect(() => {
    const fetchTable = async () => {
      try {
        const { data, error } = await supabase.from("casino_tables").select("*").eq("id", params.id).single()

        if (error) throw error

        setTable(data)
        setName(data.name)
        setType(data.type)
        setStatus(data.status || "active") // Default to active if status is not set
      } catch (error: any) {
        toast.error(`Error fetching table: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTable()
  }, [params.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name || !type) {
      toast.error("Please fill in all fields")
      return
    }

    setIsSubmitting(true)

    try {
      const { error } = await supabase.from("casino_tables").update({ name, type, status }).eq("id", params.id)

      if (error) throw error

      toast.success("Table updated successfully")
      router.push("/tables")
      router.refresh()
    } catch (error: any) {
      toast.error(`Error updating table: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this table?")) {
      return
    }

    try {
      const { error } = await supabase.from("casino_tables").delete().eq("id", params.id)

      if (error) throw error

      toast.success("Table deleted successfully")
      router.push("/tables")
      router.refresh()
    } catch (error: any) {
      toast.error(`Error deleting table: ${error.message}`)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Loading...</p>
      </div>
    )
  }

  if (!table) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Table not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Edit Table</CardTitle>
          <CardDescription>Update the table information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Table Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter table name (e.g., BJ6, ROU7)"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Table Type</Label>
              <Select value={type} onValueChange={setType} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select table type" />
                </SelectTrigger>
                <SelectContent>
                  {tableTypes.map((tableType) => (
                    <SelectItem key={tableType.value} value={tableType.value}>
                      {tableType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Table Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as TableStatus)} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select table status" />
                </SelectTrigger>
                <SelectContent>
                  {tableStatuses.map((tableStatus) => (
                    <SelectItem key={tableStatus.value} value={tableStatus.value}>
                      {tableStatus.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between">
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
                Delete Table
              </Button>

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
