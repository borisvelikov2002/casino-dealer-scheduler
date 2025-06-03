import type { ShiftType, TimeSlot } from "../scheduler-types"

/**
 * Генерира времеви слотове за смяна с интервал от 30 минути
 */
export function generateTimeSlots(shiftType: ShiftType): TimeSlot[] {
  const slots: TimeSlot[] = []

  // За дневна смяна: 8:00 до 20:00 (12 часа)
  // За нощна смяна: 20:00 до 8:00 (12 часа)
  const startHour = shiftType === "day" ? 8 : 20
  let currentHour = startHour
  let currentMinute = 0

  // Генерираме слотове на всеки 30 минути (общо 24 слота за 12 часа)
  for (let i = 0; i < 24; i++) {
    const formattedHour = String(currentHour).padStart(2, "0")
    const formattedMinute = String(currentMinute).padStart(2, "0")
    const timeString = `${formattedHour}:${formattedMinute}`
    const formattedTime = `${formattedHour}:${formattedMinute}`

    slots.push({ time: timeString, formattedTime })

    // Увеличаваме с 30 минути
    currentMinute += 30
    if (currentMinute >= 60) {
      currentMinute = 0
      currentHour = (currentHour + 1) % 24
    }
  }

  return slots
}

/**
 * Проверява дали два слота са последователни
 */
export function areConsecutiveSlots(slot1: string, slot2: string, timeSlots: TimeSlot[]): boolean {
  const index1 = timeSlots.findIndex((slot) => slot.time === slot1)
  const index2 = timeSlots.findIndex((slot) => slot.time === slot2)

  if (index1 === -1 || index2 === -1) return false

  // Проверяваме дали индексите са последователни
  return Math.abs(index1 - index2) === 1
}

/**
 * Форматира статистика за график
 */
export function formatScheduleStatistics(
  dealerAssignments: Record<string, any>,
  dealerNames: Record<string, string>,
  timeSlots: TimeSlot[],
): string {
  let output = "NAME | ROTATIONS | BREAKS | UNIQUE TABLES\n"
  output += "-".repeat(60) + "\n"

  Object.entries(dealerAssignments).forEach(([dealerId, stats]) => {
    const name = dealerNames[dealerId] || dealerId
    const rotations = stats.rotations
    const breaks = stats.breaks
    const uniqueTables = stats.assignedTables.size
    const targetRotations = stats.targetRotations
    const targetBreaks = stats.targetBreaks

    output += `${name} | ${rotations}/${targetRotations} | ${breaks}/${targetBreaks} | ${uniqueTables}\n`

    // Добавяме детайли за масите
    const tableAssignments = Array.from(stats.assignedTables).join(", ")
    output += `  Tables: ${tableAssignments}\n`

    // Добавяме позиции на почивките
    const breakPositionsFormatted = stats.breakPositions
      .sort((a, b) => a - b)
      .map((pos) => timeSlots[pos].formattedTime)
      .join(", ")
    output += `  Breaks at: ${breakPositionsFormatted}\n`
    output += "-".repeat(30) + "\n"
  })

  return output
}

/**
 * Проверява дали график е валиден
 */
export function validateSchedule(
  schedule: Record<string, Record<string, string>>,
  dealerAssignments: Record<string, any>,
  timeSlots: TimeSlot[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Проверка за всеки дилър
  Object.entries(dealerAssignments).forEach(([dealerId, stats]) => {
    // Проверка за брой ротации
    let rotationCount = 0
    let breakCount = 0

    timeSlots.forEach((slot, index) => {
      const assignment = schedule[slot.time]?.[dealerId]

      if (assignment === "BREAK") {
        breakCount++

        // Проверка за последователни почивки
        if (index > 0) {
          const prevSlot = timeSlots[index - 1].time
          const prevAssignment = schedule[prevSlot]?.[dealerId]

          if (prevAssignment === "BREAK") {
            errors.push(`Dealer ${dealerId} has consecutive breaks at ${prevSlot} and ${slot.time}`)
          }
        }
      } else if (assignment && assignment !== "-") {
        rotationCount++

        // Проверка за последователни назначения на същата маса
        if (index > 0) {
          const prevSlot = timeSlots[index - 1].time
          const prevAssignment = schedule[prevSlot]?.[dealerId]

          if (prevAssignment === assignment) {
            errors.push(
              `Dealer ${dealerId} is assigned to the same table ${assignment} at ${prevSlot} and ${slot.time}`,
            )
          }
        }
      }
    })

    // Проверка за общ брой ротации и почивки
    if (rotationCount !== stats.targetRotations) {
      errors.push(`Dealer ${dealerId} has ${rotationCount} rotations, expected ${stats.targetRotations}`)
    }

    if (breakCount !== stats.targetBreaks) {
      errors.push(`Dealer ${dealerId} has ${breakCount} breaks, expected ${stats.targetBreaks}`)
    }
  })

  return {
    valid: errors.length === 0,
    errors,
  }
}
