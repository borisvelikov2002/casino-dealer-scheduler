"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { Edit, Printer, RefreshCw, Copy } from "lucide-react"
import type { Dealer, Schedule } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"
import { ScheduleTable } from "../schedule-table"
import { generateTimeSlots } from "@/lib/utils"
import { generateSchedule } from "@/lib/utils"

export default function ScheduleDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [formattedDate, setFormattedDate] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isCopying, setIsCopying] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Ensure supabase client is properly initialized
        if (!supabase) {
          throw new Error("Supabase client not initialized")
        }

        // Fetch schedule data with timeout and retry logic
        const { data: scheduleData, error: scheduleError } = await supabase
          .from("schedules")
          .select("*")
          .eq("id", params.id)
          .single()

        if (scheduleError) throw scheduleError

        // Fetch dealers data
        const { data: dealersData, error: dealersError } = await supabase.from("dealers").select("*").order("name")

        if (dealersError) throw dealersError

        // Format the date for display
        const formattedDateStr = format(new Date(scheduleData.date), "PPPP")

        setSchedule(scheduleData as Schedule)
        setDealers(dealersData || [])
        setFormattedDate(formattedDateStr)
      } catch (error: any) {
        console.error("Error fetching schedule:", error)

        // More detailed error message
        const errorMessage = error.message || "Unknown error"
        const errorDetails = error.details || ""
        toast.error(`Error fetching schedule: ${errorMessage} ${errorDetails}`)

        // Set default values to prevent rendering errors
        setSchedule(null)
        setDealers([])
        setFormattedDate("")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [params.id])

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const { error } = await supabase.from("schedules").delete().eq("id", params.id)

      if (error) throw error

      toast.success("Schedule deleted successfully")
      router.push("/schedules")
    } catch (error: any) {
      toast.error(`Error deleting schedule: ${error.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleRegenerate = async () => {
    if (!confirm("Сигурни ли сте, че искате да регенерирате графика? Това ще презапише текущите назначения.")) {
      return
    }

    setIsRegenerating(true)
    try {
      // Извличаме активните дилъри от текущия график
      const activeDealerIds = new Set<string>()
      Object.values(schedule.schedule_data).forEach((timeSlot) => {
        Object.keys(timeSlot).forEach((dealerId) => {
          activeDealerIds.add(dealerId)
        })
      })

      const activeDealers = dealers.filter((dealer) => activeDealerIds.has(dealer.id))

      // Извличаме предпочитанията от графика
      const preferences = schedule.schedule_data._preferences || {
        firstBreakDealers: [],
        lastBreakDealers: [],
      }

      // Генерираме нов график
      const newScheduleData = await generateSchedule(activeDealers, schedule.shift_type as "day" | "night", supabase, {
        firstBreakDealers: preferences.firstBreakDealers || [],
        lastBreakDealers: preferences.lastBreakDealers || [],
      })

      // Запазваме предпочитанията
      newScheduleData._preferences = preferences

      // Запазваме отсъстващите дилъри, ако има такива
      if (schedule.absent_dealers && schedule.absent_dealers.length > 0) {
        // За всеки отсъстващ дилър, маркираме го като BREAK за всички часове след началото на отсъствието
        const timeSlots = generateTimeSlots(schedule.shift_type as "day" | "night")

        for (const absent of schedule.absent_dealers) {
          const startTimeIndex = timeSlots.findIndex((slot) => slot.time === absent.startTime)

          if (startTimeIndex === -1) continue

          // За всички часове след началния час
          for (let i = startTimeIndex; i < timeSlots.length; i++) {
            const currentSlot = timeSlots[i].time

            if (!newScheduleData[currentSlot]) {
              newScheduleData[currentSlot] = {}
            }

            newScheduleData[currentSlot][absent.dealerId] = "BREAK"
          }
        }
      }

      // Обновяваме графика в базата данни
      const { error } = await supabase.from("schedules").update({ schedule_data: newScheduleData }).eq("id", params.id)

      if (error) throw error

      toast.success("Графикът е регенериран успешно")
      router.refresh()

      // Презареждаме страницата, за да видим новия график
      window.location.reload()
    } catch (error: any) {
      console.error("Error regenerating schedule:", error)
      toast.error(`Грешка при регенериране на графика: ${error.message}`)
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleCopyScheduleStats = () => {
    if (!schedule || !dealers) return

    setIsCopying(true)
    try {
      const timeSlots = generateTimeSlots(schedule.shift_type as "day" | "night")

      // Get dealers in the schedule
      const dealersInSchedule = dealers.filter((dealer) => {
        return Object.values(schedule.schedule_data).some((timeSlot) => Object.keys(timeSlot).includes(dealer.id))
      })

      // Calculate statistics for each dealer
      const dealerStats = dealersInSchedule.map((dealer) => {
        const stats = {
          name: dealer.nickname || dealer.name,
          rotations: 0,
          breaks: 0,
          assignedTables: new Set<string>(),
          breakPositions: [],
        }

        // Go through each time slot
        timeSlots.forEach((slot, index) => {
          const assignment = schedule.schedule_data[slot.time]?.[dealer.id]
          if (assignment === "BREAK") {
            stats.breaks++
            stats.breakPositions.push(index)
          } else if (assignment && assignment !== "-") {
            stats.rotations++
            stats.assignedTables.add(assignment)
          }
        })

        return stats
      })

      // Format the statistics as a table
      let output = "NAME | ROTATIONS | BREAKS | UNIQUE TABLES\n"
      output += "-".repeat(50) + "\n"

      dealerStats.forEach((stats) => {
        output += `${stats.name} | ${stats.rotations} | ${stats.breaks} | ${stats.assignedTables.size}\n`

        // Add table assignments
        output += `  Tables: ${Array.from(stats.assignedTables).join(", ")}\n`

        // Add break positions
        const breakPositionsFormatted = stats.breakPositions
          .sort((a, b) => a - b)
          .map((pos) => timeSlots[pos].formattedTime)
          .join(", ")
        output += `  Breaks at: ${breakPositionsFormatted}\n`
        output += "-".repeat(25) + "\n"
      })

      // Add summary statistics
      const totalRotations = dealerStats.reduce((sum, stats) => sum + stats.rotations, 0)
      const totalBreaks = dealerStats.reduce((sum, stats) => sum + stats.breaks, 0)
      const avgRotations = (totalRotations / dealerStats.length).toFixed(2)
      const avgBreaks = (totalBreaks / dealerStats.length).toFixed(2)

      output += "\nSummary Statistics:\n"
      output += `Total Dealers: ${dealerStats.length}\n`
      output += `Average Rotations: ${avgRotations}\n`
      output += `Average Breaks: ${avgBreaks}\n`
      output += `Total Tables: ${Array.from(new Set(dealerStats.flatMap((s) => Array.from(s.assignedTables)))).length}\n`

      // Copy to clipboard
      navigator.clipboard
        .writeText(output)
        .then(() => toast.success("Schedule statistics copied to clipboard"))
        .catch((err) => toast.error(`Failed to copy: ${err}`))
    } catch (error) {
      console.error("Error copying schedule stats:", error)
      toast.error("Failed to copy schedule statistics")
    } finally {
      setIsCopying(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Loading schedule...</p>
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Schedule not found</p>
      </div>
    )
  }

  // Функция за получаване на името на причината за отсъствие
  const getAbsenceReasonLabel = (reason: string): string => {
    const reasonLabels: Record<string, string> = {
      sick: "Болест",
      injured: "Пострадал",
      unauthorized: "Своеволен",
      voluntary: "Тръгнал си доброволно",
      break: "Освободен за почивка",
    }

    return reasonLabels[reason] || reason
  }

  const generateTimeSlots = (shiftType: "day" | "night") => {
    const startTime = shiftType === "day" ? 8 : 20
    const endTime = shiftType === "day" ? 20 : 8
    const slots = []
    let currentTime = startTime

    while (currentTime !== endTime) {
      const formattedTime = `${String(currentTime).padStart(2, "0")}:00`
      slots.push({ time: formattedTime, formattedTime: formattedTime })
      currentTime = (currentTime + 1) % 24
    }
    return slots
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center no-print">
        <div>
          <h1 className="text-3xl font-bold">Schedule Details</h1>
          <p className="text-muted-foreground">
            {formattedDate} - {schedule.shift_type === "day" ? "Day Shift (08:00-20:00)" : "Night Shift (20:00-08:00)"}
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" onClick={handleCopyScheduleStats} disabled={isCopying}>
            <Copy className="mr-2 h-4 w-4" />
            {isCopying ? "Copying..." : "Copy Stats"}
          </Button>
          <Button variant="outline" onClick={() => router.push(`/schedules/${params.id}/edit`)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="outline" onClick={handleRegenerate} disabled={isRegenerating}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {isRegenerating ? "Regenerating..." : "Regenerate"}
          </Button>
          <DeleteConfirmationDialog itemName={`schedule for ${formattedDate}`} onConfirm={handleDelete} />
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="print:pb-2">
          <CardTitle>
            Schedule for {formattedDate} - {schedule.shift_type === "day" ? "Day Shift" : "Night Shift"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleTable schedule={schedule} dealers={dealers} />

          {schedule.absent_dealers && schedule.absent_dealers.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-2">Absent Dealers</h3>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">Dealer</th>
                      <th className="p-2 text-left">From Time</th>
                      <th className="p-2 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.absent_dealers.map((absent, index) => {
                      const dealer = dealers.find((d) => d.id === absent.dealerId)
                      const timeSlot = generateTimeSlots(schedule.shift_type as "day" | "night").find(
                        (t) => t.time === absent.startTime,
                      )

                      return (
                        <tr key={index} className="border-t">
                          <td className="p-2">{dealer ? dealer.nickname || dealer.name : "Unknown"}</td>
                          <td className="p-2">{timeSlot ? timeSlot.formattedTime : absent.startTime}</td>
                          <td className="p-2">{getAbsenceReasonLabel(absent.reason)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
