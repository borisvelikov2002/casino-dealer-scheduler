"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { generateTimeSlots } from "@/lib/utils"
import { toast } from "sonner"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import type { Dealer, Schedule } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"

interface ScheduleDetailProps {
  schedule: Schedule
  dealers: Dealer[]
  formattedDate: string
}

export function ScheduleDetail({ schedule, dealers, formattedDate }: ScheduleDetailProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const timeSlots = generateTimeSlots(schedule.shift_type as "day" | "night")

  // Create a map of dealer IDs to dealer objects for easy lookup
  const dealerMap = dealers.reduce(
    (acc, dealer) => {
      acc[dealer.id] = dealer
      return acc
    },
    {} as Record<string, Dealer>,
  )

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const { error } = await supabase.from("schedules").delete().eq("id", schedule.id)

      if (error) throw error

      toast.success("Schedule deleted successfully")
      router.push("/schedules")
      router.refresh()
    } catch (error: any) {
      toast.error(`Error deleting schedule: ${error.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Schedule Details</h1>
          <p className="text-muted-foreground">
            {formattedDate} - {schedule.shift_type === "day" ? "Day Shift (08:00-20:00)" : "Night Shift (20:00-08:00)"}
          </p>
        </div>
        <div className="flex space-x-2">
          <DeleteConfirmationDialog itemName={`schedule for ${formattedDate}`} onConfirm={handleDelete} />
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left">Time</th>
                  {dealers.map((dealer) => (
                    <th key={dealer.id} className="border p-2 text-left">
                      {dealer.nickname || dealer.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((slot) => (
                  <tr key={slot.time} className="hover:bg-muted/50">
                    <td className="border p-2 font-medium">{slot.formattedTime}</td>
                    {dealers.map((dealer) => {
                      const assignment = schedule.schedule_data[slot.time]?.[dealer.id] || "-"
                      const isBreak = assignment === "BREAK"
                      return (
                        <td
                          key={`${slot.time}-${dealer.id}`}
                          className={`border p-2 ${isBreak ? "bg-yellow-100 text-yellow-800" : ""}`}
                        >
                          {assignment}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
