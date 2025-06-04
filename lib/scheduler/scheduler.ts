import type { Dealer, SchedulePreferences, DealerWithTables, ScheduleData } from "../scheduler-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTimeSlots } from "./utils"
import {
  getDealerAvailableTables,
  calculateScheduleParameters,
  initializeDealerAssignments,
} from "./workload-calculator"
import { scheduleBreaks, fixConsecutiveBreaks } from "./break-scheduler"
import {
  fillWorkSlots,
  fillRemainingSlots,
  ensureCompleteAssignments,
  fixConsecutiveTableAssignments,
  fixSingleRotationBeforeBreak,
} from "./slot-filler"
import { validateSchedule } from "./utils"
// Добавяме импорт на новия валидатор
import { validateAndFixBreaks, redistributeBreaksEvenly } from "./break-validator"
import { validateAndFixRotations } from "./rotation-validator"
import type { TimeSlot, DealerAssignment } from "../scheduler-types" // Added DealerAssignment
import { calculateScheduleScore } from "./scoring"
import type { ScheduleViolation } from "./scoring-types"

const ITERATIVE_REFINEMENT_ITERATIONS = 30; // Increased from 10

/**
 * Генерира график за дилъри с подобрен алгоритъм за ротация
 */
export async function generateSchedule(
  dealers: Dealer[],
  shiftType: "day" | "night",
  supabaseClient: SupabaseClient,
  preferences?: SchedulePreferences,
): Promise<ScheduleData> {
  try {
    // Генерираме 24 времеви слота
    const timeSlots = generateTimeSlots(shiftType)
    const schedule: ScheduleData = {}

    // Инициализираме графика с празни слотове
    timeSlots.forEach((slot) => {
      schedule[slot.time] = {}
    })

    // Получаваме достъпните маси за всеки дилър
    const dealersWithTables = await Promise.all(
      dealers.map(async (dealer) => {
        const availableTables = await getDealerAvailableTables(dealer as DealerWithTables, supabaseClient)
        return {
          ...dealer,
          available_tables: availableTables.length > 0 ? availableTables : dealer.available_tables || [],
        } as DealerWithTables
      }),
    )

    // Филтрираме дилърите, които имат поне една достъпна маса
    const eligibleDealers = dealersWithTables.filter((dealer) => dealer.available_tables.length > 0)

    // Ако няма подходящи дилъри, връщаме празен график
    if (eligibleDealers.length === 0) {
      return schedule
    }

    // Получаваме всички уникални маси от всички дилъри
    const allTables = new Set<string>()
    eligibleDealers.forEach((dealer) => {
      dealer.available_tables.forEach((table) => {
        allTables.add(table)
      })
    })
    const uniqueTables = Array.from(allTables)

    // Стъпка 1: Изчисляваме параметрите на работа и почивка
    const params = calculateScheduleParameters(uniqueTables, eligibleDealers)

    // Проследяващи структури за назначения
    const dealerAssignments = initializeDealerAssignments(eligibleDealers, params)

    // Стъпка 2: Планираме почивките за всеки дилър с подобрен алгоритъм
    scheduleBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments, preferences)

    // Стъпка 3: Запълваме работните слотове с подобрен алгоритъм за ротация
    fillWorkSlots(eligibleDealers, uniqueTables, timeSlots, schedule, dealerAssignments)

    // Стъпка 4: Запълваме останалите неназначени слотове с подобрен алгоритъм
    fillRemainingSlots(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 5: Коригираме последователните почивки
    fixConsecutiveBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 6: Коригираме последователните назначения на една и съща маса
    fixConsecutiveTableAssignments(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 7: (Премахнато - fixSingleRotationBeforeBreak е заменено от validateAndFixBreaks)

    // Стъпка 8: Финално коригиране на последователните почивки
    fixConsecutiveBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 9: Гарантираме, че всички дилъри имат точно R назначени слота
    ensureCompleteAssignments(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 10: Балансираме ротациите и почивките, за да достигнем целевите стойности
    balanceRotationsAndBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments, params)

    // Стъпка 11: Финално коригиране на последователните назначения
    fixConsecutiveTableAssignments(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 12: Финално коригиране на последователните почивки
    fixConsecutiveBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 13: Агресивно балансиране на ротации и почивки
    aggressiveBalancing(eligibleDealers, timeSlots, schedule, dealerAssignments, params)

    // НОВИ СТЪПКИ: Валидиране и коригиране на графика с новите валидатори

    // Стъпка 14: Валидиране и коригиране на почивките
    validateAndFixBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 15: Равномерно разпределяне на почивките
    redistributeBreaksEvenly(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 16: Финално коригиране на последователните почивки
    fixConsecutiveBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 15: Валидиране и коригиране на ротациите
    validateAndFixRotations(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // --- SCORING AND ITERATIVE REFINEMENT START ---
    console.log("\n--- Initial Score Calculation ---");
    let currentSchedule = JSON.parse(JSON.stringify(schedule));
    let currentDealerAssignments = JSON.parse(JSON.stringify(dealerAssignments));

    let { score: bestScore, violations: bestViolations } = calculateScheduleScore(
      currentSchedule,
      eligibleDealers,
      currentDealerAssignments,
      timeSlots,
      uniqueTables, // Assuming uniqueTables are the activeTables for coverage check
    );

    console.log(`Initial Schedule Score: ${bestScore}`);
    if (bestViolations.length > 0) {
      console.log("Initial Violations:");
      bestViolations.forEach(v => console.log(`  - ${v.description} (Cost: ${v.cost})`));
    }

    console.log("\n--- Starting Iterative Refinement ---");
    for (let iter = 0; iter < ITERATIVE_REFINEMENT_ITERATIONS; iter++) {
      let scheduleChangedInIteration = false;
      console.log(`Iteration ${iter + 1}/${ITERATIVE_REFINEMENT_ITERATIONS}`);

      // Strategy 1: Try Moving a Break
      const randomDealerIndex = Math.floor(Math.random() * eligibleDealers.length);
      const dealerToModify = eligibleDealers[randomDealerIndex];
      const dealerAssignCopy = JSON.parse(JSON.stringify(currentDealerAssignments[dealerToModify.id]));

      if (dealerAssignCopy.breakPositions.length > 0) {
        const breakToMoveIndex = Math.floor(Math.random() * dealerAssignCopy.breakPositions.length);
        const originalBreakSlotIndex = dealerAssignCopy.breakPositions[breakToMoveIndex];

        // Try moving to a few alternative slots (e.g., +/- 1, 2, 3 slots)
        for (let offset = -3; offset <= 3; offset++) {
          if (offset === 0) continue;
          const newBreakSlotIndex = originalBreakSlotIndex + offset;

          if (newBreakSlotIndex >= 0 && newBreakSlotIndex < timeSlots.length) {
            // Create temporary copies for this attempt
            let tempSchedule = JSON.parse(JSON.stringify(currentSchedule));
            let tempDealerAssignments = JSON.parse(JSON.stringify(currentDealerAssignments));
            let tempDealerSpecificAssignment = tempDealerAssignments[dealerToModify.id];

            // Check if the new slot is already a break for this dealer or creates consecutive breaks
            const isNewSlotABreak = tempDealerSpecificAssignment.breakPositions.includes(newBreakSlotIndex);
            const wouldBeConsecutive = tempDealerSpecificAssignment.breakPositions.includes(newBreakSlotIndex - 1) ||
                                       tempDealerSpecificAssignment.breakPositions.includes(newBreakSlotIndex + 1);

            if (tempSchedule[timeSlots[newBreakSlotIndex].time][dealerToModify.id] || isNewSlotABreak || wouldBeConsecutive) {
              // console.log(`  [Refine_MoveBreak] Skipping move for ${dealerToModify.name}: slot ${newBreakSlotIndex} occupied, already a break, or creates consecutive.`);
              continue;
            }

            // Apply the move in the temporary schedule
            // 1. Remove original break
            tempSchedule[timeSlots[originalBreakSlotIndex].time][dealerToModify.id] = "-"; // Mark as empty, to be filled by slot-filler or other logic if needed
            tempDealerSpecificAssignment.breakPositions.splice(breakToMoveIndex, 1);
            // Note: rotations/breaks count not changed yet, as one break is removed and one is added.

            // 2. Add new break
            tempSchedule[timeSlots[newBreakSlotIndex].time][dealerToModify.id] = "BREAK";
            tempDealerSpecificAssignment.breakPositions.push(newBreakSlotIndex);
            tempDealerSpecificAssignment.breakPositions.sort((a: number, b: number) => a - b);

            // **Important Simplification for now**:
            // Re-calculating slotsWorkedSinceLastBreak, tablesWorkedSinceLastBreak, isFreshOffBreak for the temp copy
            // accurately after a move is complex. For this first pass, we rely on the main `calculateScheduleScore`
            // to evaluate the schedule as-is. The `dealerAssignments`'s detailed state for the *copy* might be
            // slightly off for `slotsWorkedSinceLastBreak` etc., but `breakPositions` and `rotations`/`breaks` counts are correct.
            // The primary driver for score change here will be the direct impact of moving the break (e.g., on consecutive breaks, min work if score fn checks it).

            const { score: newScore, violations: newViolations } = calculateScheduleScore(
              tempSchedule,
              eligibleDealers,
              tempDealerAssignments, // Using the modified assignments for the dealer
              timeSlots,
              uniqueTables,
            );

            if (newScore < bestScore) {
              console.log(`  [Refine_MoveBreak] Improvement for ${dealerToModify.name}: Moved break from slot ${originalBreakSlotIndex} to ${newBreakSlotIndex}. Score: ${bestScore} -> ${newScore}`);
              bestScore = newScore;
              bestViolations = newViolations;
              currentSchedule = tempSchedule; // Keep the improved schedule
              currentDealerAssignments = tempDealerAssignments; // Keep the improved assignments
              scheduleChangedInIteration = true;
              // Found a good move for this dealer, break from offset loop to try another dealer/strategy in next iter
              break;
            }
          }
        }
      }
      // End of "Try Moving a Break" strategy for one dealer

      // Strategy 2: Try Swap Break with Work for a Dealer
      if (!scheduleChangedInIteration && eligibleDealers.length > 0) { // Only try if no change yet in this iteration
        const dealerForSwap = eligibleDealers[Math.floor(Math.random() * eligibleDealers.length)];
        const assignmentsForSwap = currentDealerAssignments[dealerForSwap.id];

        const breakSlots = assignmentsForSwap.breakPositions;
        const workSlotsIndices: number[] = [];
        for(let i=0; i<timeSlots.length; i++) {
          const assignment = currentSchedule[timeSlots[i].time]?.[dealerForSwap.id];
          if(assignment && assignment !== "BREAK" && assignment !== "-") {
            workSlotsIndices.push(i);
          }
        }

        if (breakSlots.length > 0 && workSlotsIndices.length > 0) {
          const breakSlotIndexToSwap = breakSlots[Math.floor(Math.random() * breakSlots.length)];
          const workSlotIndexToSwap = workSlotsIndices[Math.floor(Math.random() * workSlotsIndices.length)];
          const tableToMove = currentSchedule[timeSlots[workSlotIndexToSwap].time][dealerForSwap.id];

          // Create temporary copies
          let tempScheduleSwap = JSON.parse(JSON.stringify(currentSchedule));
          let tempDealerAssignmentsSwap = JSON.parse(JSON.stringify(currentDealerAssignments));
          let tempDealerSpecificAssignSwap = tempDealerAssignmentsSwap[dealerForSwap.id];

          // Validity check: ensure swap doesn't create consecutive breaks at new break location (workSlotIndexToSwap)
          let wouldBeConsecutiveSwap = false;
          if (workSlotIndexToSwap > 0 && tempScheduleSwap[timeSlots[workSlotIndexToSwap - 1].time]?.[dealerForSwap.id] === "BREAK") {
            wouldBeConsecutiveSwap = true;
          }
          if (workSlotIndexToSwap < timeSlots.length - 1 && tempScheduleSwap[timeSlots[workSlotIndexToSwap + 1].time]?.[dealerForSwap.id] === "BREAK") {
            wouldBeConsecutiveSwap = true;
          }
          // Also check original break slot is not adjacent to the workslot if they become B-B
          if (Math.abs(breakSlotIndexToSwap - workSlotIndexToSwap) === 1) {
             // If they are adjacent, making the work slot a break effectively makes the original break slot adjacent to a new break.
             // The original break slot (breakSlotIndexToSwap) becomes work.
             // The work slot (workSlotIndexToSwap) becomes break.
             // We need to check if tempScheduleSwap[timeSlots[breakSlotIndexToSwap +/- 1].time]?.[dealerForSwap.id] === "BREAK"
             // This is implicitly covered by the general consecutive check after the swap is made by calculateScheduleScore.
          }


          if (!wouldBeConsecutiveSwap) {
            // Apply swap
            tempScheduleSwap[timeSlots[breakSlotIndexToSwap].time][dealerForSwap.id] = tableToMove;
            tempScheduleSwap[timeSlots[workSlotIndexToSwap].time][dealerForSwap.id] = "BREAK";

            // Update breakPositions in tempDealerSpecificAssignSwap
            const bpIdx = tempDealerSpecificAssignSwap.breakPositions.indexOf(breakSlotIndexToSwap);
            if (bpIdx !== -1) {
              tempDealerSpecificAssignSwap.breakPositions.splice(bpIdx, 1);
            }
            tempDealerSpecificAssignSwap.breakPositions.push(workSlotIndexToSwap);
            tempDealerSpecificAssignSwap.breakPositions.sort((a: number, b: number) => a - b);

            // rotations and breaks counts remain the same.
            // Detailed state (slotsWorkedSinceLastBreak, etc.) is simplified for temp copy.

            const { score: newSwapScore, violations: newSwapViolations } = calculateScheduleScore(
              tempScheduleSwap,
              eligibleDealers,
              tempDealerAssignmentsSwap,
              timeSlots,
              uniqueTables,
            );

            if (newSwapScore < bestScore) {
              console.log(`  [Refine_SwapBkWk] Improvement for ${dealerForSwap.name}: Swapped break at ${breakSlotIndexToSwap} with work at ${workSlotIndexToSwap} (table ${tableToMove}). Score: ${bestScore} -> ${newSwapScore}`);
              bestScore = newSwapScore;
              bestViolations = newSwapViolations;
              currentSchedule = tempScheduleSwap;
              currentDealerAssignments = tempDealerAssignmentsSwap;
              scheduleChangedInIteration = true;
            }
          }
        }
      }
      // End of "Try Swap Break with Work"

      if(scheduleChangedInIteration) {
        // If a change was made, maybe run some quick targeted fixes?
        // For now, just proceed to next iteration or finish.
      }
    }
    console.log(`--- Iterative Refinement Finished. Final Score: ${bestScore} ---`);
    if (bestViolations.length > 0) {
      console.log("Final Violations:");
      bestViolations.forEach(v => console.log(`  - ${v.description} (Cost: ${v.cost})`));
    }
    // --- SCORING AND ITERATIVE REFINEMENT END ---


    // Validate the final refined schedule
    const validation = validateSchedule(currentSchedule, currentDealerAssignments, timeSlots)
    if (!validation.valid) {
      console.warn("Schedule validation failed AFTER refinement:", validation.errors)
    }

    // Извеждаме статистика за проверка (using final refined assignments)
    console.log("Dealer statistics:")
    console.log("NAME | ROTATIONS | BREAKS | UNIQUE TABLES | TOTAL SLOTS")
    console.log("-".repeat(60))

    const dealerNames: Record<string, string> = {}
    eligibleDealers.forEach((dealer) => {
      dealerNames[dealer.id] = dealer.nickname || dealer.name

      const stats = dealerAssignments[dealer.id]
      const name = dealer.nickname || dealer.name
      const rotations = stats.rotations
      const breaks = stats.breaks
      const uniqueTablesCount = stats.assignedTables.size
      const totalSlots = rotations + breaks
      const targetRotations = stats.targetRotations
      const targetBreaks = stats.targetBreaks

      console.log(
        `${name} | ${rotations}/${targetRotations} | ${breaks}/${targetBreaks} | ${uniqueTablesCount} | ${totalSlots}/${params.R}`,
      )

      // Извеждаме детайлни назначения на маси
      const tableAssignments = Array.from(stats.assignedTables).join(", ")
      console.log(`  Tables: ${tableAssignments}`)

      // Извеждаме позиции на почивките
      const breakPositionsFormatted = stats.breakPositions
        .sort((a, b) => a - b)
        .map((pos) => timeSlots[pos].formattedTime)
        .join(", ")
      console.log(`  Breaks at: ${breakPositionsFormatted}`)
      console.log("-".repeat(30))
    })

    // Добавяме обобщение на общата статистика
    const totalRotations = eligibleDealers.reduce((sum, dealer) => sum + dealerAssignments[dealer.id].rotations, 0)
    const totalBreaks = eligibleDealers.reduce((sum, dealer) => sum + dealerAssignments[dealer.id].breaks, 0)
    const totalSlots = totalRotations + totalBreaks // These stats are from original assignments
    const expectedTotalSlots = params.R * params.D

    console.log("\nSummary Statistics (based on original assignments, pre-refinement for overall counts):")
    console.log(`Total Dealers: ${params.D}`)
    console.log(`Total Tables: ${params.T}`)
    console.log(`Total Rotations (original): ${totalRotations} (Expected work slots: ${params.totalWorkSlots})`)
    console.log(`Total Breaks (original): ${totalBreaks}`)
    console.log(`Total Slots Assigned (original): ${totalSlots} (Expected: ${expectedTotalSlots})`)

    // Recalculate final counts from best assignments for accurate final summary
    const finalTotalRotations = eligibleDealers.reduce((sum, dealer) => sum + currentDealerAssignments[dealer.id].rotations, 0)
    const finalTotalBreaks = eligibleDealers.reduce((sum, dealer) => sum + currentDealerAssignments[dealer.id].breaks, 0)
    console.log(`Total Rotations (final refined): ${finalTotalRotations}`)
    console.log(`Total Breaks (final refined): ${finalTotalBreaks}`)
    console.log(`Coverage (final refined): ${((finalTotalRotations / params.totalWorkSlots) * 100).toFixed(2)}%`)


    return currentSchedule // Return the best schedule found
  } catch (error) {
    console.error("Error in generateSchedule:", error)
    return {}
  }
}

/**
 * Балансира ротациите и почивките, за да достигнем целевите стойности
 * Подобрена версия с по-агресивно балансиране
 */
function balanceRotationsAndBreaks(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
  params: any,
): void {
  // Максимален брой опити за балансиране
  const MAX_BALANCE_ATTEMPTS = 5

  // Правим няколко опита за балансиране
  for (let attempt = 0; attempt < MAX_BALANCE_ATTEMPTS; attempt++) {
    let imbalanceFound = false

    // За всеки дилър проверяваме дали има правилния брой ротации и почивки
    for (const dealer of eligibleDealers) {
      const stats = dealerAssignments[dealer.id]
      const rotationDiff = stats.targetRotations - stats.rotations

      // Ако дилърът има твърде малко ротации
      if (rotationDiff > 0) {
        // Опитваме се да конвертираме някои почивки в ротации
        const converted = convertBreaksToRotations(dealer, timeSlots, schedule, dealerAssignments, rotationDiff)
        if (converted > 0) {
          imbalanceFound = true
        }
      }
      // Ако дилърът има твърде много ротации
      else if (rotationDiff < 0) {
        // Опитваме се да конвертираме някои ротации в почивки
        const converted = convertRotationsToBreaks(dealer, timeSlots, schedule, dealerAssignments, -rotationDiff)
        if (converted > 0) {
          imbalanceFound = true
        }
      }
    }

    // Ако не намерим дисбаланс, прекратяваме опитите
    if (!imbalanceFound) {
      break
    }
  }

  // Финално балансиране чрез размяна между дилъри
  balanceBetweenDealers(eligibleDealers, timeSlots, schedule, dealerAssignments)
}

/**
 * Агресивно балансиране на ротации и почивки
 * Този метод се опитва да коригира големи разлики между целевите и действителните стойности
 */
function aggressiveBalancing(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
  params: any,
): void {
  console.log("Starting aggressive balancing...")

  // Намираме дилъри с големи разлики между целевите и действителните стойности
  const dealersWithLargeDeficit = eligibleDealers.filter((dealer) => {
    const stats = dealerAssignments[dealer.id]
    const rotationDiff = stats.targetRotations - stats.rotations
    return rotationDiff > 3 // Голям дефицит на ротации
  })

  const dealersWithLargeExcess = eligibleDealers.filter((dealer) => {
    const stats = dealerAssignments[dealer.id]
    const rotationDiff = stats.targetRotations - stats.rotations
    return rotationDiff < -3 // Голям излишък на ротации
  })

  console.log(`Found ${dealersWithLargeDeficit.length} dealers with large rotation deficit`)
  console.log(`Found ${dealersWithLargeExcess.length} dealers with large rotation excess`)

  // Ако няма дилъри с големи разлики, приключваме
  if (dealersWithLargeDeficit.length === 0 && dealersWithLargeExcess.length === 0) {
    return
  }

  // Сортираме дилърите по големина на разликата
  dealersWithLargeDeficit.sort((a, b) => {
    const diffA = dealerAssignments[a.id].targetRotations - dealerAssignments[a.id].rotations
    const diffB = dealerAssignments[b.id].targetRotations - dealerAssignments[b.id].rotations
    return diffB - diffA // Низходящо сортиране
  })

  dealersWithLargeExcess.sort((a, b) => {
    const diffA = dealerAssignments[a.id].rotations - dealerAssignments[a.id].targetRotations
    const diffB = dealerAssignments[b.id].rotations - dealerAssignments[b.id].targetRotations
    return diffB - diffA // Низходящо сортиране
  })

  // Опитваме се да прехвърлим ротации от дилъри с излишък към дилъри с дефицит
  for (const deficitDealer of dealersWithLargeDeficit) {
    let deficitAmount =
      dealerAssignments[deficitDealer.id].targetRotations - dealerAssignments[deficitDealer.id].rotations
    if (deficitAmount <= 0) continue

    console.log(`Trying to balance dealer ${deficitDealer.name} with deficit of ${deficitAmount} rotations`)

    // Опитваме се да намерим дилъри с излишък, които могат да предоставят ротации
    for (const excessDealer of dealersWithLargeExcess) {
      const excessAmount =
        dealerAssignments[excessDealer.id].rotations - dealerAssignments[excessDealer.id].targetRotations
      if (excessAmount <= 0) continue

      const transferAmount = Math.min(deficitAmount, excessAmount)
      console.log(
        `  Attempting to transfer ${transferAmount} rotations from ${excessDealer.name} to ${deficitDealer.name}`,
      )

      let transferredCount = 0

      // Обхождаме всички времеви слотове
      for (let i = 0; i < timeSlots.length && transferredCount < transferAmount; i++) {
        const slot = timeSlots[i].time

        // Проверяваме дали можем да направим размяна в този слот
        const excessAssignment = schedule[slot][excessDealer.id]
        const deficitAssignment = schedule[slot][deficitDealer.id]

        // Ако дилърът с излишък работи, а дилърът с дефицит е в почивка
        if (excessAssignment && excessAssignment !== "BREAK" && deficitAssignment === "BREAK") {
          // Проверяваме дали дилърът с дефицит може да работи на тази маса
          if (deficitDealer.available_tables.includes(excessAssignment)) {
            // Проверяваме дали размяната би създала последователни почивки за дилъра с излишък
            let wouldCreateConsecutiveBreaks = false
            if (i > 0) {
              const prevSlot = timeSlots[i - 1].time
              if (schedule[prevSlot][excessDealer.id] === "BREAK") {
                wouldCreateConsecutiveBreaks = true
              }
            }
            if (i < timeSlots.length - 1) {
              const nextSlot = timeSlots[i + 1].time
              if (schedule[nextSlot][excessDealer.id] === "BREAK") {
                wouldCreateConsecutiveBreaks = true
              }
            }

            if (!wouldCreateConsecutiveBreaks) {
              // Извършваме размяна
              schedule[slot][deficitDealer.id] = excessAssignment
              schedule[slot][excessDealer.id] = "BREAK"

              // Обновяваме проследяването
              dealerAssignments[deficitDealer.id].rotations++
              dealerAssignments[deficitDealer.id].breaks--
              dealerAssignments[deficitDealer.id].assignedTables.add(excessAssignment)

              dealerAssignments[excessDealer.id].rotations--
              dealerAssignments[excessDealer.id].breaks++
              dealerAssignments[excessDealer.id].breakPositions.push(i)

              // Премахваме от позициите на почивките на дилъра с дефицит
              const breakPosIndex = dealerAssignments[deficitDealer.id].breakPositions.indexOf(i)
              if (breakPosIndex !== -1) {
                dealerAssignments[deficitDealer.id].breakPositions.splice(breakPosIndex, 1)
              }

              transferredCount++
              console.log(`    Transferred rotation at ${timeSlots[i].formattedTime}`)
            }
          }
        }
      }

      if (transferredCount > 0) {
        console.log(`  Successfully transferred ${transferredCount} rotations`)
        deficitAmount -= transferredCount
        if (deficitAmount <= 0) break
      }
    }
  }

  // Финално коригиране на последователни почивки
  fixConsecutiveBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments)
}

/**
 * Конвертира почивки в ротации с подобрен алгоритъм
 * Връща броя на успешно конвертираните почивки
 */
function convertBreaksToRotations(
  dealer: DealerWithTables,
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
  count: number,
): number {
  // Намираме всеички почивки на дилъра
  const breakSlots: number[] = []
  timeSlots.forEach((slot, index) => {
    if (schedule[slot.time][dealer.id] === "BREAK") {
      breakSlots.push(index)
    }
  })

  // Сортираме почивките по приоритет
  breakSlots.sort((a, b) => {
    // Приоритизираме почивки, които не са в последователни слотове
    const aHasConsecutive = breakSlots.includes(a - 1) || breakSlots.includes(a + 1)
    const bHasConsecutive = breakSlots.includes(b - 1) || breakSlots.includes(b + 1)

    if (aHasConsecutive && !bHasConsecutive) return 1
    if (!aHasConsecutive && bHasConsecutive) return -1

    // Приоритизираме почивки в средата на смяната
    const aMidShiftDistance = Math.abs(a - timeSlots.length / 2)
    const bMidShiftDistance = Math.abs(b - timeSlots.length / 2)

    return aMidShiftDistance - bMidShiftDistance
  })

  // Опитваме се да конвертираме почивки в ротации
  let converted = 0
  for (const breakIndex of breakSlots) {
    if (converted >= count) break

    const timeSlot = timeSlots[breakIndex].time

    // Намираме достъпна маса за този времеви слот
    const availableTables = dealer.available_tables.filter(
      (table) => !Object.values(schedule[timeSlot]).includes(table),
    )

    if (availableTables.length > 0) {
      // Избираме маса, на която дилърът не е работил скоро
      const selectedTable = availableTables[0]

      // Проверяваме дали това би създало последователни назначения
      let wouldCreateConsecutive = false
      if (breakIndex > 0) {
        const prevSlot = timeSlots[breakIndex - 1].time
        const prevAssignment = schedule[prevSlot][dealer.id]
        if (prevAssignment && prevAssignment !== "BREAK" && prevAssignment === selectedTable) {
          wouldCreateConsecutive = true
        }
      }
      if (breakIndex < timeSlots.length - 1) {
        const nextSlot = timeSlots[breakIndex + 1].time
        const nextAssignment = schedule[nextSlot][dealer.id]
        if (nextAssignment && nextAssignment !== "BREAK" && nextAssignment === selectedTable) {
          wouldCreateConsecutive = true
        }
      }

      if (!wouldCreateConsecutive) {
        // Конвертираме почивката в ротация
        schedule[timeSlot][dealer.id] = selectedTable
        dealerAssignments[dealer.id].rotations++
        dealerAssignments[dealer.id].breaks--
        dealerAssignments[dealer.id].assignedTables.add(selectedTable)

        // Премахваме от позициите на почивките
        const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(breakIndex)
        if (breakPosIndex !== -1) {
          dealerAssignments[dealer.id].breakPositions.splice(breakPosIndex, 1)
        }

        converted++
      }
    }
  }

  return converted
}

/**
 * Конвертира ротации в почивки с подобрен алгоритъм
 * Връща броя на успешно конвертираните ротации
 */
function convertRotationsToBreaks(
  dealer: DealerWithTables,
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
  count: number,
): number {
  // Намираме всички ротации на дилъра
  const rotationSlots: { index: number; table: string }[] = []
  timeSlots.forEach((slot, index) => {
    const assignment = schedule[slot.time][dealer.id]
    if (assignment && assignment !== "BREAK") {
      rotationSlots.push({ index, table: assignment })
    }
  })

  // Сортираме ротациите по приоритет
  rotationSlots.sort((a, b) => {
    // Проверяваме дали конвертирането би създало последователни почивки
    const aWouldCreateConsecutive =
      (timeSlots[a.index - 1] && schedule[timeSlots[a.index - 1].time][dealer.id] === "BREAK") ||
      (timeSlots[a.index + 1] && schedule[timeSlots[a.index + 1].time][dealer.id] === "BREAK")

    const bWouldCreateConsecutive =
      (timeSlots[b.index - 1] && schedule[timeSlots[b.index - 1].time][dealer.id] === "BREAK") ||
      (timeSlots[b.index + 1] && schedule[timeSlots[b.index + 1].time][dealer.id] === "BREAK")

    if (aWouldCreateConsecutive && !bWouldCreateConsecutive) return 1
    if (!aWouldCreateConsecutive && bWouldCreateConsecutive) return -1

    // Приоритизираме ротации в началото или края на смяната
    const aMidShiftDistance = Math.abs(a.index - timeSlots.length / 2)
    const bMidShiftDistance = Math.abs(b.index - timeSlots.length / 2)

    return bMidShiftDistance - aMidShiftDistance
  })

  // Опитваме се да конвертираме ротации в почивки
  let converted = 0
  for (const rotation of rotationSlots) {
    if (converted >= count) break

    const timeSlot = timeSlots[rotation.index].time

    // Проверяваме дали конвертирането би създало последователни почивки
    let wouldCreateConsecutiveBreaks = false
    if (rotation.index > 0) {
      const prevSlot = timeSlots[rotation.index - 1].time
      if (schedule[prevSlot][dealer.id] === "BREAK") {
        wouldCreateConsecutiveBreaks = true
      }
    }
    if (rotation.index < timeSlots.length - 1) {
      const nextSlot = timeSlots[rotation.index + 1].time
      if (schedule[nextSlot][dealer.id] === "BREAK") {
        wouldCreateConsecutiveBreaks = true
      }
    }

    if (!wouldCreateConsecutiveBreaks) {
      // Конвертираме ротацията в почивка
      schedule[timeSlot][dealer.id] = "BREAK"
      dealerAssignments[dealer.id].rotations--
      dealerAssignments[dealer.id].breaks++
      dealerAssignments[dealer.id].breakPositions.push(rotation.index)

      converted++
    }
  }

  return converted
}

/**
 * Балансира ротации и почивки между дилъри
 */
function balanceBetweenDealers(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  // Намираме дилъри с твърде много и твърде малко ротации
  const dealersWithExcessRotations = eligibleDealers.filter(
    (dealer) => dealerAssignments[dealer.id].rotations > dealerAssignments[dealer.id].targetRotations,
  )

  const dealersWithDeficitRotations = eligibleDealers.filter(
    (dealer) => dealerAssignments[dealer.id].rotations < dealerAssignments[dealer.id].targetRotations,
  )

  // Опитваме се да балансираме чрез размяна
  for (const excessDealer of dealersWithExcessRotations) {
    const excessAmount =
      dealerAssignments[excessDealer.id].rotations - dealerAssignments[excessDealer.id].targetRotations
    if (excessAmount <= 0) continue

    for (const deficitDealer of dealersWithDeficitRotations) {
      const deficitAmount =
        dealerAssignments[deficitDealer.id].targetRotations - dealerAssignments[deficitDealer.id].rotations
      if (deficitAmount <= 0) continue

      const swapsNeeded = Math.min(excessAmount, deficitAmount)
      let swapsMade = 0

      // Намираме подходящи слотове за размяна
      for (let i = 0; i < timeSlots.length && swapsMade < swapsNeeded; i++) {
        const slot = timeSlots[i].time

        // Проверяваме дали можем да разменим в този слот
        const excessAssignment = schedule[slot][excessDealer.id]
        const deficitAssignment = schedule[slot][deficitDealer.id]

        if (excessAssignment && excessAssignment !== "BREAK" && deficitAssignment === "BREAK") {
          // Проверяваме дали дефицитният дилър може да работи на тази маса
          if (deficitDealer.available_tables.includes(excessAssignment)) {
            // Проверяваме дали размяната би създала последователни почивки
            let wouldCreateConsecutiveBreaks = false
            if (i > 0) {
              const prevSlot = timeSlots[i - 1].time
              if (schedule[prevSlot][excessDealer.id] === "BREAK") {
                wouldCreateConsecutiveBreaks = true
              }
            }
            if (i < timeSlots.length - 1) {
              const nextSlot = timeSlots[i + 1].time
              if (schedule[nextSlot][excessDealer.id] === "BREAK") {
                wouldCreateConsecutiveBreaks = true
              }
            }

            if (!wouldCreateConsecutiveBreaks) {
              // Извършваме размяна
              schedule[slot][deficitDealer.id] = excessAssignment
              schedule[slot][excessDealer.id] = "BREAK"

              // Обновяваме проследяването
              dealerAssignments[excessDealer.id].rotations--
              dealerAssignments[excessDealer.id].breaks++
              dealerAssignments[excessDealer.id].breakPositions.push(i)

              dealerAssignments[deficitDealer.id].rotations++
              dealerAssignments[deficitDealer.id].breaks--
              dealerAssignments[deficitDealer.id].assignedTables.add(excessAssignment)

              // Премахваме от позициите на почивките на дефицитния дилър
              const breakPosIndex = dealerAssignments[deficitDealer.id].breakPositions.indexOf(i)
              if (breakPosIndex !== -1) {
                dealerAssignments[deficitDealer.id].breakPositions.splice(breakPosIndex, 1)
              }

              swapsMade++
            }
          }
        }
      }

      // Ако сме направили всички необходими размени, прекратяваме
      if (swapsMade >= excessAmount) break
    }
  }
}
