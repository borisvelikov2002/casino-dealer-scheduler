"use client"
import type { Dealer, Schedule } from "@/lib/types"
import { generateTimeSlots } from "@/lib/utils"

interface ScheduleTableProps {
  schedule: Schedule
  dealers: Dealer[]
  isEditable?: boolean
  onAssignmentChange?: (timeSlot: string, dealerId: string, value: string) => void
}

export function ScheduleTable({ schedule, dealers, isEditable = false, onAssignmentChange }: ScheduleTableProps) {
  // Handle case where schedule data is missing or incomplete
  if (!schedule || !schedule.schedule_data) {
    return (
      <div className="p-4 border rounded bg-red-50 text-red-800">
        Schedule data is missing or incomplete. Please try refreshing the page.
      </div>
    )
  }

  const timeSlots = generateTimeSlots(schedule.shift_type as "day" | "night")

  // Filter dealers who are included in the schedule
  const dealersInSchedule = dealers.filter((dealer) => {
    return Object.values(schedule.schedule_data).some((timeSlot) => Object.keys(timeSlot).includes(dealer.id))
  })

  // If no dealers are found in the schedule, show a message
  if (dealersInSchedule.length === 0) {
    return (
      <div className="p-4 border rounded bg-yellow-50 text-yellow-800">
        No dealers found in this schedule. The schedule may be empty or corrupted.
      </div>
    )
  }

  // Функция для определения цвета клетки согласно типу стола
  const getCellClass = (assignment: string) => {
    const isBreak = assignment === "BREAK"
    let cellClass = "border p-2 text-center font-medium"

    if (isBreak) {
      cellClass += " bg-yellow-100 text-yellow-800"
    } else if (assignment.startsWith("BJ")) {
      cellClass += " bg-blue-100 text-blue-800"
    } else if (assignment.startsWith("ROU")) {
      cellClass += " bg-green-100 text-green-800"
    }

    return cellClass
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-muted">
            <th className="border p-2 text-left">Dealer</th>
            {timeSlots.map((slot) => (
              <th key={slot.time} className="border p-2 text-center">
                {slot.formattedTime}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dealersInSchedule.map((dealer) => (
            <tr key={dealer.id} className="hover:bg-muted/50">
              <td className="border p-2 font-medium">{dealer.nickname || dealer.name}</td>
              {timeSlots.map((slot) => {
                const assignment = schedule.schedule_data[slot.time]?.[dealer.id] || "-"
                return (
                  <td key={`${dealer.id}-${slot.time}`} className={getCellClass(assignment)}>
                    {assignment}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
