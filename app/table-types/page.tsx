"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"
import { PlusCircle, Edit } from "lucide-react"
import { toast } from "sonner"
import type { TableTypeEntity } from "@/lib/types"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { supabase } from "@/lib/supabase-singleton"

export default function TableTypesPage() {
  const router = useRouter()
  const [tableTypes, setTableTypes] = useState<TableTypeEntity[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchTableTypes = async () => {
      try {
        const { data, error } = await supabase.from("table_types").select("*").order("label")

        if (error) throw error

        setTableTypes(data || [])
      } catch (error: any) {
        console.error("Error fetching table types:", error)
        toast.error(`Error fetching table types: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTableTypes()
  }, [])

  const handleDelete = async (id: string, label: string) => {
    try {
      // Check if this table type is being used
      const { data: tablesUsingType, error: tablesError } = await supabase
        .from("casino_tables")
        .select("id")
        .eq("type", tableTypes.find((t) => t.id === id)?.value)

      if (tablesError) throw tablesError

      if (tablesUsingType && tablesUsingType.length > 0) {
        toast.error(
          `Cannot delete table type "${label}" because it is being used by ${tablesUsingType.length} table(s)`,
        )
        return
      }

      const { error } = await supabase.from("table_types").delete().eq("id", id)

      if (error) throw error

      // Update the local state to remove the deleted table type
      setTableTypes(tableTypes.filter((type) => type.id !== id))
      toast.success(`Table type "${label}" deleted successfully`)
    } catch (error: any) {
      toast.error(`Error deleting table type: ${error.message}`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Table Types</h1>
        <Button asChild>
          <Link href="/table-types/add">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Table Type
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <p>Loading table types...</p>
        </div>
      ) : tableTypes && tableTypes.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">№</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableTypes.map((tableType, index) => (
                  <TableRow key={tableType.id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>{tableType.label}</TableCell>
                    <TableCell className="font-mono text-sm">{tableType.value}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <DeleteConfirmationDialog
                          itemName={tableType.label}
                          onConfirm={() => handleDelete(tableType.id, tableType.label)}
                          size="sm"
                        />
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/table-types/${tableType.id}/edit`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              No table types found. Add your first table type to get started.
            </p>
            <Button asChild>
              <Link href="/table-types/add">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Table Type
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
