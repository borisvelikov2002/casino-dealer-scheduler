"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase-singleton"
import type { TableStatus, TableType } from "@/lib/types"
import { TableConfirmation } from "@/components/table-confirmation"

export default function AddTablePage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [type, setType] = useState("")
  const [status, setStatus] = useState<TableStatus>("active")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tableTypes, setTableTypes] = useState<TableType[]>([])
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [addedTable, setAddedTable] = useState<{ name: string; type: string; status: string } | null>(null)

  const tableStatuses = [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "service", label: "In Service" },
  ]

  useEffect(() => {
    const fetchTableTypes = async () => {
      try {
        const { data, error } = await supabase.from("table_types").select("value, label").order("label")

        if (error) throw error

        setTableTypes(data || [])
      } catch (error: any) {
        toast.error(`Error fetching table types: ${error.message}`)
      }
    }

    fetchTableTypes()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name || !type) {
      toast.error("Please fill in all fields")
      return
    }

    setIsSubmitting(true)

    try {
      const { error } = await supabase.from("casino_tables").insert([{ name, type, status }])

      if (error) throw error

      // Вместо:
      // toast.success("Table added successfully")
      // router.push("/tables")
      // router.refresh()

      // Използвай:
      setAddedTable({ name, type, status })
      setShowConfirmation(true)
    } catch (error: any) {
      toast.error(`Error adding table: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Add New Table</CardTitle>
          <CardDescription>Enter the table information below</CardDescription>
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

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Table"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {showConfirmation && addedTable && (
        <TableConfirmation
          newTable={addedTable}
          onClose={() => {
            setShowConfirmation(false)
            setAddedTable(null)
            router.push("/tables")
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
