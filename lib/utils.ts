import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Dealer } from "./types"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ShiftType } from "./scheduler-types"
import { generateSchedule as generateScheduleImpl } from "./scheduler/scheduler"
import { handleDealerLeaving as handleDealerLeavingImpl } from "./scheduler/absence-handler"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Функция за генериране на времеви слотове с интервал от 30 минути
export function generateTimeSlots(shiftType: ShiftType) {
  const slots = []

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

export async function generateSchedule(
  dealers: Dealer[],
  shiftType: "day" | "night",
  supabaseClient: SupabaseClient,
  preferences?: {
    firstBreakDealers?: string[]
    lastBreakDealers?: string[]
  },
) {
  return generateScheduleImpl(dealers, shiftType, supabaseClient, preferences)
}

export async function handleDealerLeaving(
  schedule: { [timeSlot: string]: { [dealerId: string]: string } },
  leavingDealerId: string,
  leaveAtTime: string,
  dealers: Dealer[],
  shiftType: "day" | "night",
  supabaseClient: SupabaseClient,
) {
  return handleDealerLeavingImpl(schedule, leavingDealerId, leaveAtTime, dealers, shiftType, supabaseClient)
}
