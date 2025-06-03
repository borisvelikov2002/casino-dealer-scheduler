"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import type { TableTypeEntity } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"

export default function EditTableTypePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [tableType, setTableType] = useState<TableTypeEntity | null>(null)
  const [label, setLabel] = useState("")
  const [value, setValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchTableType = async () => {
      try {
        const { data, error } = await supabase.from("table_types").select("*").eq("id", params.id).single()

        if (error) throw error

        setTableType(data)
        setLabel(data.label)
        setValue(data.value)
      } catch (error: any) {
        toast.error(`Error fetching table type: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTableType()
  }, [params.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!label || !value) {
      toast.error("Please fill in all fields")
      return
    }

    setIsSubmitting(true)

    try {
      // Check if value already exists (excluding current record)
      const { data: existingType, error: checkError } = await supabase
        .from("table_types")
        .select("id")
        .eq("value", value)
        .neq("id", params.id)
        .single()

      if (checkError && checkError.code !== "PGRST116") {
        throw checkError
      }

      if (existingType) {
        toast.error("A table type with this value already exists")
        setIsSubmitting(false)
        return
      }

      const { error } = await supabase.from("table_types").update({ label, value }).eq("id", params.id)

      if (error) throw error

      toast.success("Table type updated successfully")
      router.push("/table-types")
      router.refresh()
    } catch (error: any) {
      toast.error(`Error updating table type: ${error.message}`)
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

  if (!tableType) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Table type not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Edit Table Type</CardTitle>
          <CardDescription>Update the table type information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Display Name</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Enter display name (e.g., Poker Texas Hold'em)"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="value">System Value</Label>
              <Input
                id="value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="System identifier (e.g., poker_texas_holdem)"
                required
                className="font-mono"
              />
              <p className="text-sm text-muted-foreground">
                Warning: Changing the system value may affect existing tables and dealer permissions that use this type.
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
