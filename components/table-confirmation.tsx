"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CheckCircle, AlertTriangle, Info, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase-singleton"
import type { CasinoTable, TableTypeEntity } from "@/lib/types"
import Link from "next/link"

interface TableConfirmationProps {
  newTable: {
    name: string
    type: string
    status: string
  }
  onClose: () => void
}

export function TableConfirmation({ newTable, onClose }: TableConfirmationProps) {
  const [similarTables, setSimilarTables] = useState<CasinoTable[]>([])
  const [tableTypeInfo, setTableTypeInfo] = useState<TableTypeEntity | null>(null)
  const [totalTablesOfType, setTotalTablesOfType] = useState(0)
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
        // Get table type information
        const { data: typeData, error: typeError } = await supabase
          .from("table_types")
          .select("*")
          .eq("value", newTable.type)
          .single()

        if (typeError) throw typeError
        setTableTypeInfo(typeData)

        // Check for similar table names
        const { data: similarData, error: similarError } = await supabase
          .from("casino_tables")
          .select("*")
          .ilike("name", `%${newTable.name.substring(0, 3)}%`)
          .order("name")

        if (similarError) throw similarError
        setSimilarTables(similarData || [])

        // Count total tables of this type
        const { count, error: countError } = await supabase
          .from("casino_tables")
          .select("*", { count: "exact", head: true })
          .eq("type", newTable.type)

        if (countError) throw countError
        setTotalTablesOfType(count || 0)
      } catch (error: any) {
        toast.error(`Error fetching related data: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchRelatedData()
  }, [newTable])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(() => onClose(), 300) // Wait for animation to complete
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800"
      case "inactive":
        return "bg-gray-100 text-gray-800"
      case "service":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "inactive":
        return <AlertTriangle className="h-4 w-4 text-gray-600" />
      case "service":
        return <Info className="h-4 w-4 text-yellow-600" />
      default:
        return <Info className="h-4 w-4 text-gray-600" />
    }
  }

  const exactMatch = similarTables.find((table) => table.name.toLowerCase() === newTable.name.toLowerCase())

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
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 h-8 w-8 p-0 hover:bg-green-100"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="flex items-center space-x-3">
              <div className="bg-green-100 p-3 rounded-full animate-pulse">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-green-800 text-xl">🎉 Table Added Successfully!</CardTitle>
                <p className="text-green-600 text-sm mt-1">Your new table has been created and is ready to use.</p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* New Table Information */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200 transform transition-all duration-500 hover:shadow-lg">
              <h3 className="font-semibold text-blue-800 mb-4 flex items-center text-lg">
                <Info className="h-6 w-6 mr-2" />
                New Table Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center md:text-left">
                  <p className="text-sm text-gray-600 mb-1">Table Name</p>
                  <p className="font-bold text-2xl text-blue-800">{newTable.name}</p>
                </div>
                <div className="text-center md:text-left">
                  <p className="text-sm text-gray-600 mb-1">Table Type</p>
                  <p className="font-medium text-lg text-gray-800">{tableTypeInfo?.label || newTable.type}</p>
                </div>
                <div className="text-center md:text-left">
                  <p className="text-sm text-gray-600 mb-1">Status</p>
                  <div className="flex items-center justify-center md:justify-start space-x-2">
                    {getStatusIcon(newTable.status)}
                    <Badge className={`${getStatusColor(newTable.status)} text-sm px-3 py-1`}>
                      {newTable.status.charAt(0).toUpperCase() + newTable.status.slice(1)}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border transform transition-all duration-300 hover:shadow-md hover:scale-105">
                <h4 className="font-medium text-gray-800 mb-2">Type Statistics</h4>
                <p className="text-3xl font-bold text-blue-600 mb-1">{totalTablesOfType}</p>
                <p className="text-sm text-gray-600">Total {tableTypeInfo?.label || newTable.type} tables</p>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border transform transition-all duration-300 hover:shadow-md hover:scale-105">
                <h4 className="font-medium text-gray-800 mb-2">Similar Names</h4>
                <p className="text-3xl font-bold text-purple-600 mb-1">{similarTables.length}</p>
                <p className="text-sm text-gray-600">Tables with similar names found</p>
              </div>
            </div>

            {/* Warnings */}
            {exactMatch && (
              <div className="bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 p-6 rounded-xl animate-pulse">
                <div className="flex items-center space-x-3 mb-3">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                  <h4 className="font-semibold text-red-800 text-lg">⚠️ Duplicate Name Warning</h4>
                </div>
                <p className="text-red-700">
                  A table with the exact name <strong>"{exactMatch.name}"</strong> already exists! This might cause
                  confusion during scheduling.
                </p>
              </div>
            )}

            {/* Similar Tables */}
            {similarTables.length > 0 && (
              <div className="transform transition-all duration-500">
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center text-lg">
                  <Table className="h-6 w-6 mr-2" />
                  Related Tables ({similarTables.length})
                </h3>
                <div className="border rounded-xl overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gradient-to-r from-gray-50 to-gray-100">
                        <TableHead className="font-semibold">Name</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {similarTables.slice(0, 5).map((table, index) => (
                        <TableRow
                          key={table.id}
                          className={`transition-all duration-200 hover:bg-gray-50 ${
                            table.name.toLowerCase() === newTable.name.toLowerCase()
                              ? "bg-red-50 border-l-4 border-red-400"
                              : ""
                          }`}
                          style={{ animationDelay: `${index * 100}ms` }}
                        >
                          <TableCell className="font-medium">
                            {table.name}
                            {table.name.toLowerCase() === newTable.name.toLowerCase() && (
                              <Badge variant="destructive" className="ml-2 text-xs animate-bounce">
                                DUPLICATE
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{table.type}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(table.status)}>{table.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {new Date(table.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {similarTables.length > 5 && (
                    <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 text-center text-sm text-gray-600">
                      ... and {similarTables.length - 5} more similar tables
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-center pt-6 border-t space-y-3 sm:space-y-0">
              <Button
                variant="outline"
                asChild
                className="w-full sm:w-auto transition-all duration-200 hover:scale-105"
              >
                <Link href="/tables/add">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Another Table
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
                  <Link href="/tables">View All Tables</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
