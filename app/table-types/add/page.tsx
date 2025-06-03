"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase-singleton"
import { TableTypeConfirmation } from "@/components/table-type-confirmation"

export default function AddTableTypePage() {
  const router = useRouter()
  const [label, setLabel] = useState("")
  const [value, setValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [newTableType, setNewTableType] = useState<{ label: string; value: string } | null>(null)

  // Auto-generate value from label
  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel)
    // Generate a value from the label (lowercase, replace spaces with underscores)
    const generatedValue = newLabel
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
    setValue(generatedValue)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!label || !value) {
      toast.error("Please fill in all fields")
      return
    }

    setIsSubmitting(true)

    try {
      // Check if value already exists
      const { data: existingType, error: checkError } = await supabase
        .from("table_types")
        .select("id")
        .eq("value", value)
        .single()

      if (checkError && checkError.code !== "PGRST116") {
        throw checkError
      }

      if (existingType) {
        toast.error("A table type with this value already exists")
        setIsSubmitting(false)
        return
      }

      const { error } = await supabase.from("table_types").insert([{ label, value }])

      if (error) throw error

      // Show confirmation modal instead of redirecting
      setNewTableType({ label, value })
      setShowConfirmation(true)

      // Reset form
      setLabel("")
      setValue("")

      toast.success("Table type added successfully")
    } catch (error: any) {
      toast.error(`Error adding table type: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCloseConfirmation = () => {
    setShowConfirmation(false)
    setNewTableType(null)
  }

  return (
    <>
      <div className="max-w-2xl mx-auto">
        <Card className="transform transition-all duration-300 hover:shadow-lg">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50">
            <CardTitle className="text-purple-800">Add New Table Type</CardTitle>
            <CardDescription className="text-purple-600">Create a new table type for the casino</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="label" className="text-sm font-medium">
                  Display Name
                </Label>
                <Input
                  id="label"
                  value={label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="Enter display name (e.g., Poker Texas Hold'em)"
                  required
                  className="transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="value" className="text-sm font-medium">
                  System Value
                </Label>
                <Input
                  id="value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="System identifier (e.g., poker_texas_holdem)"
                  required
                  className="font-mono transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-sm text-muted-foreground">
                  This is the internal identifier used by the system. It should be unique and contain only lowercase
                  letters, numbers, and underscores.
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isSubmitting}
                  className="transition-all duration-200 hover:scale-105"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="transition-all duration-200 hover:scale-105 bg-purple-600 hover:bg-purple-700"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Adding...
                    </>
                  ) : (
                    "Add Table Type"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && newTableType && (
        <TableTypeConfirmation newTableType={newTableType} onClose={handleCloseConfirmation} />
      )}
    </>
  )
}
