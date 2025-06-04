import type { DealerWithTables, ScheduleData, TimeSlot } from "../scheduler-types"

/**
 * Валидира и коригира почивките в графика
 * Гарантира, че няма последователни почивки и че почивките са равномерно разпределени
 */
export function validateAndFixBreaks(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  console.log("Starting break validation and fixing...")

  // Първо коригираме последователните почивки
  fixConsecutiveBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments)

  // След това коригираме нарушенията на правилото за минимална работа
  fixMinimalWorkRuleViolations(eligibleDealers, timeSlots, schedule, dealerAssignments)

  // Накрая проверяваме дали всички проблеми са коригирани
  const remainingIssues = findRemainingBreakIssues(eligibleDealers, timeSlots, schedule)

  if (remainingIssues.length > 0) {
    console.warn(`Found ${remainingIssues.length} remaining break issues that could not be fixed automatically.`)

    // Опитваме се да коригираме оставащите проблеми с по-агресивен подход
    fixRemainingBreakIssuesAggressively(eligibleDealers, timeSlots, schedule, dealerAssignments, remainingIssues)
  } else {
    console.log("All break issues have been fixed successfully!")
  }
}

/**
 * Намира оставащите проблеми с почивките
 */
function findRemainingBreakIssues(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
): Array<{
  dealerId: string
  type: "consecutive" | "minimal_work_violation" // Updated type
  index: number
}> {
  const issues: Array<{
    dealerId: string
    type: "consecutive" | "minimal_work_violation" // Updated type
    index: number
  }> = []
  const MIN_SLOTS_FOR_SINGLE_TABLE_BREAK = 3 // Ensure this matches other usages

  for (const dealer of eligibleDealers) {
    let slotsWorkedSinceLastBreak = 0
    const tablesWorkedSinceLastBreak = new Set<string>()
    // isFreshOffBreak means the *immediately* preceding slot was a break.
    // We need to track this to correctly identify consecutive breaks.
    let previousSlotWasBreak = false
    let lastActualWorkTime = -1

    for (let i = 0; i < timeSlots.length; i++) {
      const currentSlotTime = timeSlots[i].time
      const assignment = schedule[currentSlotTime][dealer.id]

      if (assignment === "BREAK") {
        // Check for consecutive breaks
        if (previousSlotWasBreak) {
          issues.push({
            dealerId: dealer.id,
            type: "consecutive",
            index: i,
          })
        }

        // Check for minimal work rule violation
        // A break is problematic if it's not the start of the shift (i > 0) AND
        // none of the allowed conditions for a break are met.
        // Also, a break right after another break (consecutive) is not a min work violation in itself.
        if (i > 0 && !previousSlotWasBreak) {
          // B -> W1 -> B pattern:
          // Current break is at 'i'. W1 is at 'i-1'. Previous break is at 'i-2'.
          const isBWBViolation =
            i >= 2 &&
            schedule[timeSlots[i - 2]?.time]?.[dealer.id] === "BREAK" &&
            schedule[timeSlots[i - 1]?.time]?.[dealer.id] !== "BREAK" &&
            schedule[timeSlots[i - 1]?.time]?.[dealer.id] !== "-";

          // General minimal work rule check
          // Violated if not start, not BWB, and conditions not met
          const violatedMinWork = !(
            // (slotsWorkedSinceLastBreak === 1 && tablesWorkedSinceLastBreak.size === 1 && schedule[timeSlots[i-1].time]?.[dealer.id] !== undefined && i - 1 === lastActualWorkTime ) || // B -> W1 -> B (W1 must be the only work)
            (slotsWorkedSinceLastBreak >= 2 && tablesWorkedSinceLastBreak.size >= 2) ||
            slotsWorkedSinceLastBreak >= MIN_SLOTS_FOR_SINGLE_TABLE_BREAK
          );

          // Special handling for the B->W1->B (slot 1 case is tricky)
          // If slotsWorkedSinceLastBreak is 1, it implies previous was work.
          // If that work was preceded by a break, it's BWB.
          if (isBWBViolation) {
            issues.push({
              dealerId: dealer.id,
              type: "minimal_work_violation", // Specifically BWB
              index: i,
            });
          } else if (slotsWorkedSinceLastBreak === 1 && tablesWorkedSinceLastBreak.size === 1 && !isBWBViolation) {
            // This is B -> W1 -> B, but W1 is the first work slot of the shift, or first after an initial break.
            // This is only a violation if it's NOT the very start of their work sequence after a break.
            // The isBWBViolation should catch the problematic ones.
            // If it's truly just one slot of work (e.g. B W B at very start of shift for dealer), it's an issue.
            // The `scheduleBreaks` tries to prevent this.
            // If `lastActualWorkTime` was `i-1`, and `slotsWorkedSinceLastBreak` is 1, it's a candidate.
            // Need to ensure that the W1 was not preceded by another W.
            // The `isBWBViolation` is more direct for the B->W1->B.
            // A simple `slotsWorkedSinceLastBreak === 1` is problematic if not part of BWB and not the allowed exception.
            // The allowed exception is: (dealer has worked 1 slot since last break AND tablesWorkedSinceLastBreak.size === 1)
            // This is an issue if it's not the start of shift (i>0), and not the specific BWB pattern.
            // This means it's W...W -> B -> W1 -> B. The first B is fine. The W1->B is the issue.
            // This condition is covered by `violatedMinWork` if we correctly consider the "start of work segment"
            if (violatedMinWork) {
               issues.push({
                dealerId: dealer.id,
                type: "minimal_work_violation",
                index: i,
              });
            }

          } else if (violatedMinWork && slotsWorkedSinceLastBreak > 0) {
            // Catch other min work violations (e.g. 0 slots, or 1 slot on 1 table when not allowed)
            issues.push({
              dealerId: dealer.id,
              type: "minimal_work_violation",
              index: i,
            })
          }
        }

        slotsWorkedSinceLastBreak = 0
        tablesWorkedSinceLastBreak.clear()
        previousSlotWasBreak = true
      } else if (assignment && assignment !== "-") { // Work slot
        slotsWorkedSinceLastBreak++
        tablesWorkedSinceLastBreak.add(assignment)
        previousSlotWasBreak = false
        lastActualWorkTime = i;
      } else { // Empty slot or "-"
        previousSlotWasBreak = false
      }
    }
  }
  return issues
}

/**
 * Коригира последователните почивки
 */
function fixConsecutiveBreaks(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  const R = timeSlots.length

  // Първи проход: идентифицираме последователните почивки
  const dealersWithConsecutiveBreaks: Map<string, number[]> = new Map()

  for (const dealer of eligibleDealers) {
    const consecutiveBreakIndices: number[] = []

    for (let i = 1; i < R; i++) {
      const prevSlot = timeSlots[i - 1].time
      const currentSlot = timeSlots[i].time

      if (schedule[prevSlot][dealer.id] === "BREAK" && schedule[currentSlot][dealer.id] === "BREAK") {
        consecutiveBreakIndices.push(i)
      }
    }

    if (consecutiveBreakIndices.length > 0) {
      dealersWithConsecutiveBreaks.set(dealer.id, consecutiveBreakIndices)
    }
  }

  // Ако няма последователни почивки, приключваме
  if (dealersWithConsecutiveBreaks.size === 0) {
    return
  }

  console.log(`Found ${dealersWithConsecutiveBreaks.size} dealers with consecutive breaks`)

  // Втори проход: коригираме последователните почивки с по-агресивен подход
  for (const [dealerId, indices] of dealersWithConsecutiveBreaks.entries()) {
    const dealer = eligibleDealers.find((d) => d.id === dealerId)
    if (!dealer) continue

    console.log(`Fixing consecutive breaks for dealer ${dealer.name}: ${indices.length} consecutive breaks`)

    for (const index of indices) {
      const currentSlot = timeSlots[index].time

      // Стратегия 1: Опитваме се да намерим достъпна маса
      const availableTables = dealer.available_tables.filter(
        (table) => !Object.values(schedule[currentSlot]).includes(table),
      )

      if (availableTables.length > 0) {
        // Назначаваме маса вместо почивка
        const selectedTable = availableTables[0]
        schedule[currentSlot][dealer.id] = selectedTable

        // Обновяваме проследяването
        dealerAssignments[dealer.id].rotations++
        dealerAssignments[dealer.id].breaks--
        dealerAssignments[dealer.id].assignedTables.add(selectedTable)

        // Премахваме от позициите на почивките
        const breakIndex = dealerAssignments[dealer.id].breakPositions.indexOf(index)
        if (breakIndex !== -1) {
          dealerAssignments[dealer.id].breakPositions.splice(breakIndex, 1)
        }

        console.log(`  Fixed by assigning table ${selectedTable} at ${timeSlots[index].formattedTime}`)
        continue
      }

      // Стратегия 2: Опитваме се да разменим с друг дилър
      const otherDealers = eligibleDealers.filter((d) => {
        if (d.id === dealer.id) return false

        const assignment = schedule[currentSlot][d.id]
        if (!assignment || assignment === "BREAK") return false

        return dealer.available_tables.includes(assignment)
      })

      let swapSuccessful = false
      for (const otherDealer of otherDealers) {
        const tableId = schedule[currentSlot][otherDealer.id]

        // Проверяваме дали размяната би създала последователни почивки за другия дилър
        let wouldCreateConsecutiveBreaks = false
        if (index > 0) {
          const prevSlot = timeSlots[index - 1].time
          if (schedule[prevSlot][otherDealer.id] === "BREAK") {
            wouldCreateConsecutiveBreaks = true
          }
        }
        if (index < R - 1) {
          const nextSlot = timeSlots[index + 1].time
          if (schedule[nextSlot][otherDealer.id] === "BREAK") {
            wouldCreateConsecutiveBreaks = true
          }
        }

        if (!wouldCreateConsecutiveBreaks) {
          // Извършваме размяна
          schedule[currentSlot][dealer.id] = tableId
          schedule[currentSlot][otherDealer.id] = "BREAK"

          // Обновяваме проследяването за двата дилъра
          dealerAssignments[dealer.id].rotations++
          dealerAssignments[dealer.id].breaks--
          dealerAssignments[dealer.id].assignedTables.add(tableId)

          dealerAssignments[otherDealer.id].rotations--
          dealerAssignments[otherDealer.id].breaks++
          dealerAssignments[otherDealer.id].breakPositions.push(index)

          // Премахваме от позициите на почивките
          const breakIndex = dealerAssignments[dealer.id].breakPositions.indexOf(index)
          if (breakIndex !== -1) {
            dealerAssignments[dealer.id].breakPositions.splice(breakIndex, 1)
          }

          console.log(`  Fixed by swapping with dealer ${otherDealer.name} at ${timeSlots[index].formattedTime}`)
          swapSuccessful = true
          break
        }
      }

      // Стратегия 3: Опитваме се да преместим почивката
      if (!swapSuccessful) {
        // Намираме всички слотове, където дилърът няма назначение
        const emptySlots = []
        for (let i = 0; i < R; i++) {
          if (i === index) continue // Пропускаме текущия слот

          const slot = timeSlots[i].time
          if (!schedule[slot][dealer.id]) {
            // Проверяваме дали това би създало последователни почивки
            let wouldCreateConsecutiveBreaks = false
            if (i > 0) {
              const prevSlot = timeSlots[i - 1].time
              if (schedule[prevSlot][dealer.id] === "BREAK") {
                wouldCreateConsecutiveBreaks = true
              }
            }
            if (i < R - 1) {
              const nextSlot = timeSlots[i + 1].time
              if (schedule[nextSlot][dealer.id] === "BREAK") {
                wouldCreateConsecutiveBreaks = true
              }
            }

            if (!wouldCreateConsecutiveBreaks) {
              emptySlots.push(i)
            }
          }
        }

        if (emptySlots.length > 0) {
          // Избираме произволен празен слот
          const randomIndex = Math.floor(Math.random() * emptySlots.length)
          const newBreakSlot = emptySlots[randomIndex]
          const newBreakTime = timeSlots[newBreakSlot].time

          // Премахваме почивката от текущия слот
          delete schedule[currentSlot][dealer.id]

          // Добавяме почивка в новия слот
          schedule[newBreakTime][dealer.id] = "BREAK"

          // Обновяваме позициите на почивките
          const breakIndex = dealerAssignments[dealer.id].breakPositions.indexOf(index)
          if (breakIndex !== -1) {
            dealerAssignments[dealer.id].breakPositions[breakIndex] = newBreakSlot
          }

          console.log(
            `  Fixed by moving break from ${timeSlots[index].formattedTime} to ${timeSlots[newBreakSlot].formattedTime}`,
          )
        } else {
          console.log(`  Could not fix consecutive break at ${timeSlots[index].formattedTime}`)
        }
      }
    }
  }
}

/**
 * Коригира нарушения на правилото за минимална работа преди/между почивки
 */
function fixMinimalWorkRuleViolations(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  const MIN_SLOTS_FOR_SINGLE_TABLE_BREAK = 3 // Renamed constant
  const R = timeSlots.length

  // Първи проход: идентифицираме почивките след единична ротация
  const dealersWithSingleRotationBeforeBreak: Map<string, { breakIndex: number; rotationStartIndex: number }[]> =
    new Map()

  for (const dealer of eligibleDealers) {
    const singleRotationBreaks: { breakIndex: number; rotationStartIndex: number }[] = []
    let rotationCount = 0
    let rotationStartIndex = -1

    for (let i = 0; i < R; i++) {
      const currentSlot = timeSlots[i].time
      const assignment = schedule[currentSlot][dealer.id]

      if (assignment && assignment !== "BREAK" && assignment !== "-") {
        // Дилърът работи на маса
        if (rotationCount === 0) {
          rotationStartIndex = i
        }
        rotationCount++
      } else if (assignment === "BREAK") {
        // Проверяваме дали имаме твърде малко ротации преди почивка
        if (rotationCount > 0 && rotationCount < MIN_ROTATIONS_BEFORE_BREAK) {
          singleRotationBreaks.push({
            breakIndex: i,
            rotationStartIndex,
          })
        }

        // Нулираме брояча на ротации
        rotationCount = 0
        rotationStartIndex = -1
      }
    }

    if (singleRotationBreaks.length > 0) {
      dealersWithSingleRotationBeforeBreak.set(dealer.id, singleRotationBreaks)
    }
  }

  // Identify violations first (similar to findRemainingBreakIssues but specific to this function's scope)
  const violationsToFix: Array<{
    dealerId: string
    breakIndex: number
    currentSlotsWorked: number
    currentTablesWorked: Set<string>
    isBWB: boolean
  }> = []

  for (const dealer of eligibleDealers) {
    let slotsWorked = 0
    let tablesWorked = new Set<string>()
    let prevSlotWasBreak = false // True if the slot just before the current one was a break

    for (let i = 0; i < R; i++) {
      const currentTimeSlot = timeSlots[i].time
      const assignment = schedule[currentTimeSlot][dealer.id]

      if (assignment === "BREAK") {
        if (i > 0 && !prevSlotWasBreak) { // Only check if not start of shift and previous wasn't also a break
          const isBWBPattern =
            i >= 2 &&
            schedule[timeSlots[i - 2]?.time]?.[dealer.id] === "BREAK" &&
            schedule[timeSlots[i - 1]?.time]?.[dealer.id] !== "BREAK" &&
            schedule[timeSlots[i - 1]?.time]?.[dealer.id] !== "-";

          const meetsMinWorkCriteria =
            (slotsWorked === 1 && tablesWorked.size === 1) || // B -> W1 -> B (W1 must be the only work) - this is only ok if it's not a BWB that needs fixing
            (slotsWorked >= 2 && tablesWorked.size >= 2) ||
            slotsWorked >= MIN_SLOTS_FOR_SINGLE_TABLE_BREAK;

          if (isBWBPattern) {
            violationsToFix.push({
              dealerId: dealer.id,
              breakIndex: i,
              currentSlotsWorked: slotsWorked, // Should be 1 for BWB
              currentTablesWorked: new Set(tablesWorked), // Should be 1 table for BWB
              isBWB: true,
            });
          } else if (!meetsMinWorkCriteria && slotsWorked > 0) {
             violationsToFix.push({
              dealerId: dealer.id,
              breakIndex: i,
              currentSlotsWorked: slotsWorked,
              currentTablesWorked: new Set(tablesWorked),
              isBWB: false,
            });
          }
        }
        slotsWorked = 0
        tablesWorked.clear()
        prevSlotWasBreak = true
      } else if (assignment && assignment !== "-") { // Work
        slotsWorked++
        tablesWorked.add(assignment)
        prevSlotWasBreak = false
      } else { // Empty
        prevSlotWasBreak = false
      }
    }
  }

  if (violationsToFix.length === 0) {
    console.log("No minimal work rule violations found to fix in this pass.")
    return
  }

  console.log(`Found ${violationsToFix.length} minimal work rule violations to fix.`)

  for (const { dealerId, breakIndex, currentSlotsWorked, currentTablesWorked, isBWB } of violationsToFix) {
    const dealer = eligibleDealers.find((d) => d.id === dealerId)
    if (!dealer) continue

    const currentSlotTime = timeSlots[breakIndex].time
    console.log(
      `[BV_FIX_ATTEMPT] Dealer ${dealer.name || dealerId} at ${timeSlots[breakIndex].formattedTime} (slot ${breakIndex}). Issue: ${isBWB ? "B->W1->B" : `Insufficient work (S:${currentSlotsWorked}, T:${currentTablesWorked.size})`}`,
    )

    // Strategy 1: Convert problematic break to work
    if (dealerAssignments[dealer.id].rotations < dealerAssignments[dealer.id].targetRotations) {
      const availableTables = dealer.available_tables.filter(
        (table) =>
          !Object.values(schedule[currentSlotTime]).includes(table) &&
          (breakIndex === 0 || schedule[timeSlots[breakIndex - 1].time]?.[dealer.id] !== table) &&
          (breakIndex === R - 1 || schedule[timeSlots[breakIndex + 1].time]?.[dealer.id] !== table)
      );

      if (availableTables.length > 0) {
        const selectedTable = availableTables[0];
        schedule[currentSlotTime][dealer.id] = selectedTable;

        dealerAssignments[dealer.id].rotations++;
        dealerAssignments[dealer.id].breaks--;
        const bPosIdx = dealerAssignments[dealer.id].breakPositions.indexOf(breakIndex);
        if (bPosIdx !== -1) dealerAssignments[dealer.id].breakPositions.splice(bPosIdx, 1);
        dealerAssignments[dealer.id].assignedTables.add(selectedTable);

        dealerAssignments[dealer.id].isFreshOffBreak = false;

        console.log(`    [BV_FIX_APPLIED_S1] Converted break to work (${selectedTable}) for ${dealer.name || dealerId} at ${timeSlots[breakIndex].formattedTime}`);
        continue;
      } else {
        console.log(`    [BV_FIX_FAIL_S1] Dealer ${dealer.name || dealerId}, break at slot ${breakIndex}: No available tables to convert break to work.`);
      }
    } else {
       console.log(`    [BV_FIX_SKIP_S1] Dealer ${dealer.name || dealerId}, break at slot ${breakIndex}: Already at target rotations (${dealerAssignments[dealer.id].rotations}).`);
    }

    // Strategy 2: If B->W1->B, try to convert the *other* break (slot i-2) to work
    if (isBWB) {
      const otherBreakIdx = breakIndex - 2;
      if (otherBreakIdx >=0 && dealerAssignments[dealer.id].rotations < dealerAssignments[dealer.id].targetRotations) {
        const otherBreakSlotTime = timeSlots[otherBreakIdx].time;
        const availableTablesForOtherBreak = dealer.available_tables.filter(
          (table) =>
            !Object.values(schedule[otherBreakSlotTime]).includes(table) &&
            (otherBreakIdx === 0 || schedule[timeSlots[otherBreakIdx - 1].time]?.[dealer.id] !== table) &&
            (otherBreakIdx === R - 1 || schedule[timeSlots[otherBreakIdx + 1].time]?.[dealer.id] !== table)
        );
        if (availableTablesForOtherBreak.length > 0) {
          const selectedTable = availableTablesForOtherBreak[0];
          schedule[otherBreakSlotTime][dealer.id] = selectedTable;

          dealerAssignments[dealer.id].rotations++;
          dealerAssignments[dealer.id].breaks--;
          const bPosIdx = dealerAssignments[dealer.id].breakPositions.indexOf(otherBreakIdx);
          if (bPosIdx !== -1) dealerAssignments[dealer.id].breakPositions.splice(bPosIdx, 1);
          dealerAssignments[dealer.id].assignedTables.add(selectedTable);
          dealerAssignments[dealer.id].isFreshOffBreak = false;

          console.log(`    [BV_FIX_APPLIED_S2_BWB] Converted earlier break at ${timeSlots[otherBreakIdx].formattedTime} to work (${selectedTable}) for ${dealer.name || dealerId} to resolve BWB at slot ${breakIndex}`);
          continue;
        } else {
          console.log(`    [BV_FIX_FAIL_S2_BWB] Dealer ${dealer.name || dealerId}, BWB at slot ${breakIndex}: No available tables for earlier break at ${otherBreakIdx}.`);
        }
      } else if (isBWB && otherBreakIdx < 0) {
         console.log(`    [BV_FIX_SKIP_S2_BWB] Dealer ${dealer.name || dealerId}, BWB at slot ${breakIndex}: Earlier break index ${otherBreakIdx} is out of bounds.`);
      } else if (isBWB) {
         console.log(`    [BV_FIX_SKIP_S2_BWB] Dealer ${dealer.name || dealerId}, BWB at slot ${breakIndex}: Already at target rotations, cannot convert earlier break.`);
      }
    }

    // Log if no fix was applied by this point for the identified problem
    console.log(
      `    [BV_FIX_UNRESOLVED] Violation for ${dealer.name || dealerId} at ${timeSlots[breakIndex].formattedTime} (slot ${breakIndex}). Issue: ${isBWB ? "BWB" : "MinWork"}. Could not be fixed with current strategies.`,
    );
  }
}
      const otherDealers = eligibleDealers.filter((d) => {
        if (d.id === dealer.id) return false

        const otherAssignment = schedule[currentSlot][d.id]
        if (!otherAssignment || otherAssignment === "BREAK") return false

        return dealer.available_tables.includes(otherAssignment)
      })

      let swapSuccessful = false
      for (const otherDealer of otherDealers) {
        const tableId = schedule[currentSlot][otherDealer.id]

        // Проверяваме дали размяната би създала проблем за другия дилър
        let wouldCreateProblem = false

        // Проверяваме дали другият дилър има последователни почивки
        if (breakIndex > 0 && schedule[timeSlots[breakIndex - 1].time][otherDealer.id] === "BREAK") {
          wouldCreateProblem = true
        }
        if (breakIndex < R - 1 && schedule[timeSlots[breakIndex + 1].time][otherDealer.id] === "BREAK") {
          wouldCreateProblem = true
        }

        // Проверяваме дали другият дилър би имал твърде малко ротации преди почивка
        let otherDealerRotationCount = 0
        for (let i = breakIndex - 1; i >= 0; i--) {
          const prevSlot = timeSlots[i].time
          const prevAssignment = schedule[prevSlot][otherDealer.id]

          if (prevAssignment === "BREAK") {
            break
          } else if (prevAssignment && prevAssignment !== "-") {
            otherDealerRotationCount++
          }
        }

        if (otherDealerRotationCount < MIN_ROTATIONS_BEFORE_BREAK) {
          wouldCreateProblem = true
        }

        if (!wouldCreateProblem) {
          // Извършваме размяна
          schedule[currentSlot][dealer.id] = tableId
          schedule[currentSlot][otherDealer.id] = "BREAK"

          // Обновяваме проследяването
          dealerAssignments[dealer.id].rotations++
          dealerAssignments[dealer.id].breaks--
          dealerAssignments[dealer.id].assignedTables.add(tableId)

          dealerAssignments[otherDealer.id].rotations--
          dealerAssignments[otherDealer.id].breaks++
          dealerAssignments[otherDealer.id].breakPositions.push(breakIndex)

          // Премахваме от позициите на почивките
          const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(breakIndex)
          if (breakPosIndex !== -1) {
            dealerAssignments[dealer.id].breakPositions.splice(breakPosIndex, 1)
          }

          console.log(`    Fixed by swapping with dealer ${otherDealer.name} at ${timeSlots[breakIndex].formattedTime}`)
          swapSuccessful = true
          break
        }
      }

      // Стратегия 3: Опитваме се да преместим почивката
      if (!swapSuccessful) {
        // Търсим подходящ слот за почивка след достатъчно ротации
        let foundSuitableSlot = false

        for (let i = breakIndex + 1; i < R; i++) {
          const futureSlot = timeSlots[i].time

          // Проверяваме дали слотът е свободен или е почивка
          if (!schedule[futureSlot][dealer.id] || schedule[futureSlot][dealer.id] === "BREAK") {
            // Проверяваме дали няма да създадем последователни почивки
            let wouldCreateConsecutiveBreaks = false
            if (i > 0 && schedule[timeSlots[i - 1].time][dealer.id] === "BREAK") {
              wouldCreateConsecutiveBreaks = true
            }
            if (i < R - 1 && schedule[timeSlots[i + 1].time][dealer.id] === "BREAK") {
              wouldCreateConsecutiveBreaks = true
            }

            // Проверяваме дали имаме достатъчно ротации преди новата почивка
            let rotationsBeforeNewBreak = 0
            for (let j = i - 1; j >= 0; j--) {
              const prevSlot = timeSlots[j].time
              const prevAssignment = schedule[prevSlot][dealer.id]

              if (prevAssignment === "BREAK") {
                break
              } else if (prevAssignment && prevAssignment !== "-") {
                rotationsBeforeNewBreak++
              }
            }

            if (!wouldCreateConsecutiveBreaks && rotationsBeforeNewBreak >= MIN_ROTATIONS_BEFORE_BREAK) {
              // Запазваме текущия слот
              const currentBreakSlot = schedule[currentSlot][dealer.id]

              // Премахваме почивката от текущия слот
              delete schedule[currentSlot][dealer.id]

              // Добавяме почивка в новия слот
              schedule[futureSlot][dealer.id] = "BREAK"

              // Обновяваме позициите на почивките
              const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(breakIndex)
              if (breakPosIndex !== -1) {
                dealerAssignments[dealer.id].breakPositions[breakPosIndex] = i
              }

              console.log(
                `    Fixed by moving break from ${timeSlots[breakIndex].formattedTime} to ${timeSlots[i].formattedTime}`,
              )
              foundSuitableSlot = true
              break
            }
          }
        }

        if (!foundSuitableSlot) {
          console.log(`    Could not fix break after single rotation at ${timeSlots[breakIndex].formattedTime}`)
        }
      }
    }
  }
}

/**
 * Коригира оставащите проблеми с почивките с агресивен подход
 */
function fixRemainingBreakIssuesAggressively(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
  issues: Array<{
    dealerId: string
    type: "consecutive" | "minimal_work_violation" // Updated type
    index: number
  }>,
): void {
  console.log("Applying aggressive fixing for remaining break issues...")

  for (const issue of issues) {
    const dealer = eligibleDealers.find((d) => d.id === issue.dealerId)
    if (!dealer) continue

    const index = issue.index
    const currentSlot = timeSlots[index].time

    console.log(
      `Aggressively fixing ${issue.type} break for dealer ${dealer.name} at ${timeSlots[index].formattedTime}`,
    )

    // Стратегия 1: Принудително назначаване на маса
    // Опитваме се да намерим КОЯТО И ДА Е маса, дори ако е заета
    const allTables = dealer.available_tables

    if (allTables.length > 0) {
      // Избираме произволна маса
      const randomTable = allTables[Math.floor(Math.random() * allTables.length)]

      // Намираме кой дилър работи на тази маса в момента
      let currentDealerOnTable = null
      for (const [dealerId, assignment] of Object.entries(schedule[currentSlot])) {
        if (assignment === randomTable) {
          currentDealerOnTable = dealerId
          break
        }
      }

      if (currentDealerOnTable) {
        // Разменяме дилърите
        const otherDealer = eligibleDealers.find((d) => d.id === currentDealerOnTable)
        if (otherDealer) {
          // Извършваме размяна
          schedule[currentSlot][dealer.id] = randomTable
          schedule[currentSlot][otherDealer.id] = "BREAK"

          // Обновяваме проследяването
          dealerAssignments[dealer.id].rotations++
          dealerAssignments[dealer.id].breaks--
          dealerAssignments[dealer.id].assignedTables.add(randomTable)
          dealerAssignments[dealer.id].isFreshOffBreak = false
          // slotsWorkedSinceLastBreak and tablesWorkedSinceLastBreak for dealer.id are complex here,
          // but isFreshOffBreak is key for future validation passes.

          dealerAssignments[otherDealer.id].rotations--
          dealerAssignments[otherDealer.id].breaks++
          dealerAssignments[otherDealer.id].isFreshOffBreak = true
          dealerAssignments[otherDealer.id].slotsWorkedSinceLastBreak = 0
          dealerAssignments[otherDealer.id].tablesWorkedSinceLastBreak.clear()


          // Премахваме от позициите на почивките
          const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(index)
          if (breakPosIndex !== -1) {
            dealerAssignments[dealer.id].breakPositions.splice(breakPosIndex, 1)
          }

          // Добавяме към позициите на почивките на другия дилър
          dealerAssignments[otherDealer.id].breakPositions.push(index)
          dealerAssignments[otherDealer.id].breakPositions.sort((a,b)=>a-b)


          console.log(`  Aggressively fixed by forcing swap with ${otherDealer.name}`)
        }
      } else {
        // Масата е свободна, просто я назначаваме
        schedule[currentSlot][dealer.id] = randomTable

        // Обновяваме проследяването
        dealerAssignments[dealer.id].rotations++
        dealerAssignments[dealer.id].breaks--
        dealerAssignments[dealer.id].assignedTables.add(randomTable)
        dealerAssignments[dealer.id].isFreshOffBreak = false;

        // Премахваме от позициите на почивките
        const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(index)
        if (breakPosIndex !== -1) {
          dealerAssignments[dealer.id].breakPositions.splice(breakPosIndex, 1)
        }

        console.log(`  Aggressively fixed by assigning table ${randomTable}`)
      }
    } else {
      console.log(`  Could not fix issue aggressively - no available tables for dealer ${dealer.name}`)
    }
  }
}

/**
 * Равномерно разпределя почивките за всички дилъри
 */
export function redistributeBreaksEvenly(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  const R = timeSlots.length

  // За всеки дилър, изчисляваме идеалните позиции на почивките
  for (const dealer of eligibleDealers) {
    const targetBreaks = dealerAssignments[dealer.id].targetBreaks

    // Ако дилърът няма почивки, пропускаме го
    if (targetBreaks <= 0) continue

    // Изчисляваме идеалния интервал между почивките
    const idealInterval = Math.floor(R / (targetBreaks + 1))

    // Създаваме идеални позиции за почивки
    const idealPositions: number[] = []
    for (let i = 1; i <= targetBreaks; i++) {
      idealPositions.push(i * idealInterval)
    }

    // Намираме текущите позиции на почивките
    const currentBreakPositions = dealerAssignments[dealer.id].breakPositions.sort((a, b) => a - b)

    // Ако броят на почивките съвпада с целевия, проверяваме дали разпределението е равномерно
    if (currentBreakPositions.length === targetBreaks) {
      // Изчисляваме средното отклонение от идеалните позиции
      let totalDeviation = 0
      for (let i = 0; i < targetBreaks; i++) {
        totalDeviation += Math.abs(currentBreakPositions[i] - idealPositions[i])
      }

      const averageDeviation = totalDeviation / targetBreaks

      // Ако средното отклонение е малко, не правим промени
      if (averageDeviation <= 2) {
        continue
      }
    }

    // Опитваме се да преразпределим почивките по-равномерно
    // Това е сложна операция, която може да наруши други ограничения,
    // затова я прилагаме само ако имаме сериозни отклонения

    // Тук можем да добавим допълнителна логика за преразпределение на почивките
  }
}
