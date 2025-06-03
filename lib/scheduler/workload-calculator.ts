import type { DealerWithTables, ScheduleParameters } from "../scheduler-types"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Изчислява параметрите на графика с подобрено разпределение на ротациите
 */
export function calculateScheduleParameters(
  uniqueTables: string[],
  eligibleDealers: DealerWithTables[],
): ScheduleParameters {
  const T = uniqueTables.length // Брой маси
  const D = eligibleDealers.length // Брой дилъри
  const R = 24 // Брой ротации (24 часа)

  // Изчисляваме съотношението между дилъри и маси
  const dealerToTableRatio = D / T

  // Определяме базовия брой ротации според съотношението
  let baseRotations = 0

  if (dealerToTableRatio <= 1.2) {
    // Ако имаме малко дилъри спрямо масите, всеки дилър работи повече
    baseRotations = Math.floor(R * 0.75) // Около 18 ротации (75% от времето)
  } else if (dealerToTableRatio <= 1.4) {
    // Ако съотношението е около 1.36 (19 дилъри на 14 маси)
    baseRotations = Math.floor(R * 0.67) // Около 16 ротации (67% от времето)
  } else {
    // Ако съотношението е над 1.4 (20+ дилъри на 14 маси)
    baseRotations = Math.floor(R * 0.58) // Около 14 ротации (58% от времето)
  }

  // Изчисляваме общия брой работни слотове
  const totalWorkSlots = T * R

  // Изчисляваме колко ротации трябва да има всеки дилър
  const workSlotsPerDealer = baseRotations

  // Изчисляваме колко допълнителни ротации трябва да разпределим
  const totalAssignedSlots = workSlotsPerDealer * D
  const extraWorkSlots = totalWorkSlots - totalAssignedSlots

  // Изчисляваме колко почивки трябва да има всеки дилър
  const breakSlotsPerDealer = R - workSlotsPerDealer

  console.log(`Dealer to Table Ratio: ${dealerToTableRatio.toFixed(2)}`)
  console.log(`Base Rotations: ${baseRotations}`)
  console.log(`Total Work Slots: ${totalWorkSlots}`)
  console.log(`Work Slots Per Dealer: ${workSlotsPerDealer}`)
  console.log(`Extra Work Slots: ${extraWorkSlots}`)
  console.log(`Break Slots Per Dealer: ${breakSlotsPerDealer}`)

  return {
    R,
    T,
    D,
    totalWorkSlots,
    workSlotsPerDealer,
    extraWorkSlots,
    breakSlotsPerDealer,
  }
}

/**
 * Получава достъпните маси за дилър
 */
export async function getDealerAvailableTables(
  dealer: DealerWithTables,
  supabaseClient: SupabaseClient,
): Promise<string[]> {
  try {
    // Получаваме разрешенията за типове маси на дилъра
    const { data: permissions, error: permissionsError } = await supabaseClient
      .from("dealer_table_types")
      .select("table_type")
      .eq("dealer_id", dealer.id)

    if (permissionsError) {
      console.error("Error fetching permissions:", permissionsError)
      return dealer.available_tables || []
    }

    if (!permissions || permissions.length === 0) {
      return dealer.available_tables || []
    }

    // Получаваме всички маси, които съответстват на разрешените типове И са активни
    const permittedTypes = permissions.map((p: any) => p.table_type)
    const { data: tables, error: tablesError } = await supabaseClient
      .from("casino_tables")
      .select("name")
      .in("type", permittedTypes)
      .eq("status", "active") // Само активни маси

    if (tablesError) {
      console.error("Error fetching tables:", tablesError)
      return dealer.available_tables || []
    }

    return tables ? tables.map((t: any) => t.name) : dealer.available_tables || []
  } catch (error) {
    console.error("Error in getDealerAvailableTables:", error)
    return dealer.available_tables || []
  }
}

/**
 * Инициализира проследяването на назначенията на дилърите
 */
export function initializeDealerAssignments(
  eligibleDealers: DealerWithTables[],
  params: ScheduleParameters,
): Record<string, any> {
  const dealerAssignments: Record<string, any> = {}

  eligibleDealers.forEach((dealer, index) => {
    const needsExtra = index < params.extraWorkSlots
    const targetRotations = needsExtra ? params.workSlotsPerDealer + 1 : params.workSlotsPerDealer
    const targetBreaks = params.R - targetRotations

    dealerAssignments[dealer.id] = {
      rotations: 0,
      breaks: 0,
      lastTable: "",
      lastTableIndex: -1,
      assignedTables: new Set<string>(),
      breakPositions: [],
      needsExtraRotation: needsExtra,
      targetRotations: targetRotations,
      targetBreaks: targetBreaks,
    }
  })

  return dealerAssignments
}
