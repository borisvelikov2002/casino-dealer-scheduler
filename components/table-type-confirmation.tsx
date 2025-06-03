"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CheckCircle, Info, Plus, X, Database } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase-singleton"
import type { CasinoTable, TableTypeEntity } from "@/lib/types"
import Link from "next/link"

interface TableTypeConfirmationProps {
  newTableType: {
    label: string
    value: string
  }
  onClose: () => void
}

export function TableTypeConfirmation({ newTableType, onClose }: TableTypeConfirmationProps) {
  const [relatedTables, setRelatedTables] = useState<CasinoTable[]>([])
  const [allTableTypes, setAllTableTypes] = useState<TableTypeEntity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Trigger animation after component mounts
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const fetchRelatedData = async () => {
      try {
        // Get all table types for statistics
        const { data: typesData, error: typesError } = await supabase.from("table_types").select("*").order("label")

        if (typesError) throw typesError
        setAllTableTypes(typesData || [])

        // Get tables that use this type
        const { data: tablesData, error: tablesError } = await supabase
          .from("casino_tables")
          .select("*")
          .eq("type", newTableType.value)
          .order("name")

        if (tablesError) throw tablesError
        setRelatedTables(tablesData || [])
      } catch (error: any) {
        toast.error(`Error fetching related data: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchRelatedData()
  }, [newTableType])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(() => onClose(), 300) // Wait for animation to complete
  }

  const similarTypes = allTableTypes.filter(
    (type) =>
      type.label.toLowerCase().includes(newTableType.label.toLowerCase().split(" ")[0]) ||
      type.value.includes(newTableType.value.split("_")[0]),
  )

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 transition-all duration-300 ease-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      onClick={handleClose}
    >
      <div
        className={`bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto transition-all duration-300 ease-out transform ${
          isVisible ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="border-0 shadow-2xl">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 h-8 w-8 p-0 hover:bg-purple-100"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="flex items-center space-x-3">
              <div className="bg-purple-100 p-3 rounded-full animate-pulse">
                <CheckCircle className="h-8 w-8 text-purple-600" />
              </div>
              <div>
                <CardTitle className="text-purple-800 text-xl">🎯 Table Type Added Successfully!</CardTitle>
                <p className="text-purple-600 text-sm mt-1">Your new table type is now available for use.</p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* New Table Type Information */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-200 transform transition-all duration-500 hover:shadow-lg">
              <h3 className="font-semibold text-purple-800 mb-4 flex items-center text-lg">
                <Database className="h-6 w-6 mr-2" />
                New Table Type Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="text-center md:text-left">
                  <p className="text-sm text-gray-600 mb-1">Display Name</p>
                  <p className="font-bold text-2xl text-purple-800">{newTableType.label}</p>
                </div>
                <div className="text-center md:text-left">
                  <p className="text-sm text-gray-600 mb-1">System Value</p>
                  <p className="font-mono text-lg text-gray-800 bg-gray-100 px-3 py-1 rounded">{newTableType.value}</p>
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border transform transition-all duration-300 hover:shadow-md hover:scale-105">
                <h4 className="font-medium text-blue-800 mb-2">Total Types</h4>
                <p className="text-3xl font-bold text-blue-600 mb-1">{allTableTypes.length}</p>
                <p className="text-sm text-blue-600">Available table types</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border transform transition-all duration-300 hover:shadow-md hover:scale-105">
                <h4 className="font-medium text-green-800 mb-2">Related Tables</h4>
                <p className="text-3xl font-bold text-green-600 mb-1">{relatedTables.length}</p>
                <p className="text-sm text-green-600">Tables using this type</p>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-xl border transform transition-all duration-300 hover:shadow-md hover:scale-105">
                <h4 className="font-medium text-orange-800 mb-2">Similar Types</h4>
                <p className="text-3xl font-bold text-orange-600 mb-1">{similarTypes.length}</p>
                <p className="text-sm text-orange-600">Types with similar names</p>
              </div>
            </div>

            {/* Similar Table Types */}
            {similarTypes.length > 1 && (
              <div className="transform transition-all duration-500">
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center text-lg">
                  <Info className="h-6 w-6 mr-2" />
                  Similar Table Types ({similarTypes.length})
                </h3>
                <div className="border rounded-xl overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gradient-to-r from-gray-50 to-gray-100">
                        <TableHead className="font-semibold">Display Name</TableHead>
                        <TableHead className="font-semibold">System Value</TableHead>
                        <TableHead className="font-semibold">Created</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {similarTypes.slice(0, 5).map((type, index) => (
                        <TableRow
                          key={type.id}
                          className={`transition-all duration-200 hover:bg-gray-50 ${
                            type.value === newTableType.value ? "bg-purple-50 border-l-4 border-purple-400" : ""
                          }`}
                          style={{ animationDelay: `${index * 100}ms` }}
                        >
                          <TableCell className="font-medium">
                            {type.label}
                            {type.value === newTableType.value && (
                              <Badge
                                variant="secondary"
                                className="ml-2 text-xs animate-bounce bg-purple-100 text-purple-800"
                              >
                                NEW
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{type.value}</TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {new Date(type.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-green-100 text-green-800">Active</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {similarTypes.length > 5 && (
                    <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 text-center text-sm text-gray-600">
                      ... and {similarTypes.length - 5} more similar types
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Next Steps */}
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 p-6 rounded-xl border border-yellow-200">
              <h3 className="font-semibold text-yellow-800 mb-3 flex items-center">
                <Info className="h-5 w-5 mr-2" />💡 What's Next?
              </h3>
              <ul className="text-yellow-700 space-y-2 text-sm">
                <li>• You can now create tables using this new type</li>
                <li>• Assign dealer permissions for this table type</li>
                <li>• Use it in schedule generation</li>
                <li>• Edit or delete this type if needed</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-center pt-6 border-t space-y-3 sm:space-y-0">
              <Button
                variant="outline"
                asChild
                className="w-full sm:w-auto transition-all duration-200 hover:scale-105"
              >
                <Link href="/table-types/add">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Another Type
                </Link>
              </Button>
              <div className="flex space-x-3 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1 sm:flex-none transition-all duration-200 hover:scale-105"
                >
                  Close
                </Button>
                <Button asChild className="flex-1 sm:flex-none transition-all duration-200 hover:scale-105">
                  <Link href="/tables/add">Create Tables</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
