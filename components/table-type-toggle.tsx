"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { TableType } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"

interface TableTypeToggleProps {
  dealerId: string
  tableType: TableType
  initialEnabled: boolean
  onToggle?: (enabled: boolean) => void
}

export function TableTypeToggle({ dealerId, tableType, initialEnabled, onToggle }: TableTypeToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isLoading, setIsLoading] = useState(false)

  const handleToggle = async () => {
    setIsLoading(true)
    try {
      if (enabled) {
        // Remove permission
        const { error } = await supabase
          .from("dealer_table_types")
          .delete()
          .eq("dealer_id", dealerId)
          .eq("table_type", tableType.value)

        if (error) throw error
      } else {
        // Add permission
        const { error } = await supabase.from("dealer_table_types").insert({
          dealer_id: dealerId,
          table_type: tableType.value,
        })

        if (error) throw error
      }

      // Toggle state
      setEnabled(!enabled)
      if (onToggle) {
        onToggle(!enabled)
      }
    } catch (error: any) {
      toast.error(`Error updating permission: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn(
        "w-full flex items-center justify-between",
        enabled ? "bg-green-100 hover:bg-green-200 border-green-300" : "bg-red-100 hover:bg-red-200 border-red-300",
        isLoading && "opacity-50 cursor-not-allowed",
      )}
      onClick={handleToggle}
      disabled={isLoading}
    >
      <span>{tableType.label}</span>
      {enabled ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-600" />}
    </Button>
  )
}
