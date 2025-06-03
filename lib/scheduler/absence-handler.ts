import type { DealerWithTables, ScheduleData, ShiftType } from "../scheduler-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTimeSlots } from "./utils"

/**
 * Обработва напускане на дилър по време на смяна
 */
export async function handleDealerLeaving(
  schedule: ScheduleData,
  leavingDealerId: string,
  leaveAtTime: string,
  dealers: DealerWithTables[],
  shiftType: ShiftType,
  supabaseClient: SupabaseClient,
): Promise<ScheduleData> {
  try {
    console.log("Starting handleDealerLeaving function")
    console.log(`Dealer ${leavingDealerId} leaving at ${leaveAtTime}`)

    // Получаваме времевите слотове за смяната
    const timeSlots = generateTimeSlots(shiftType)

    // Намираме индекса на времето на напускане във времевите слотове
    const leaveTimeIndex = timeSlots.findIndex((slot) => slot.time === leaveAtTime)

    if (leaveTimeIndex === -1) {
      console.error(`Leave time ${leaveAtTime} not found in time slots`)
      return schedule
    }

    // Създаваме дълбоко копие на графика, с който да работим
    const updatedSchedule = JSON.parse(JSON.stringify(schedule))

    // Записваме оригиналния график за дебъгване
    console.log("Original schedule:", JSON.stringify(schedule))

    // Стъпка 1: Идентифицираме масите, назначени на напускащия дилър след времето на напускане
    const tablesNeedingReassignment = new Map<string, string>() // timeSlot -> table

    for (let i = leaveTimeIndex; i < timeSlots.length; i++) {
      const currentSlot = timeSlots[i].time

      // Проверяваме дали дилърът има назначение на маса (не BREAK)
      if (
        updatedSchedule[currentSlot] &&
        updatedSchedule[currentSlot][leavingDealerId] &&
        updatedSchedule[currentSlot][leavingDealerId] !== "BREAK"
      ) {
        tablesNeedingReassignment.set(currentSlot, updatedSchedule[currentSlot][leavingDealerId])
        console.log(`Table ${updatedSchedule[currentSlot][leavingDealerId]} needs reassignment at ${currentSlot}`)
      }

      // Маркираме напускащия дилър като на BREAK
      if (updatedSchedule[currentSlot]) {
        updatedSchedule[currentSlot][leavingDealerId] = "BREAK"
      }
    }

    // Ако няма маси, които се нуждаят от преназначаване, връщаме обновения график
    if (tablesNeedingReassignment.size === 0) {
      console.log("No tables need reassignment, returning updated schedule")
      return updatedSchedule
    }

    // Стъпка 2: Получаваме останалите активни дилъри (без този, който е напуснал)
    const activeDealers = dealers.filter((dealer) => dealer.id !== leavingDealerId)

    // Стъпка 3: Преназначаваме масите за всеки времеви слот след напускането на дилъра
    for (let i = leaveTimeIndex; i < timeSlots.length; i++) {
      const currentSlot = timeSlots[i].time
      const tableToReassign = tablesNeedingReassignment.get(currentSlot)

      if (!tableToReassign) continue

      // Намираме подходящи дилъри, които могат да работят на тази маса и са в почивка
      const availableDealers = activeDealers.filter(
        (dealer) =>
          dealer.available_tables.includes(tableToReassign) && updatedSchedule[currentSlot][dealer.id] === "BREAK",
      )

      if (availableDealers.length > 0) {
        // Намираме дилъра с най-малко натоварване
        const dealerWorkloads = availableDealers.map((dealer) => {
          let workCount = 0
          for (const slot in updatedSchedule) {
            if (updatedSchedule[slot][dealer.id] && updatedSchedule[slot][dealer.id] !== "BREAK") {
              workCount++
            }
          }
          return { dealer, workCount }
        })

        // Сортираме по натоварване (възходящо)
        dealerWorkloads.sort((a, b) => a.workCount - b.workCount)

        // Назначаваме масата на дилъра с най-малко натоварване
        const selectedDealer = dealerWorkloads[0].dealer
        updatedSchedule[currentSlot][selectedDealer.id] = tableToReassign
        console.log(`Assigned table ${tableToReassign} to dealer ${selectedDealer.name} at ${currentSlot}`)
      } else {
        // Ако няма дилър в почивка, намираме такъв, който може да бъде разменен
        console.warn(`Could not find a dealer for table ${tableToReassign} at time ${currentSlot}`)
      }
    }

    return updatedSchedule
  } catch (error) {
    console.error("Error in handleDealerLeaving:", error)
    return schedule // Връщаме оригиналния график в случай на грешка
  }
}
