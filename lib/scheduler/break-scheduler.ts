import type { DealerWithTables, ScheduleData, TimeSlot, SchedulePreferences } from "../scheduler-types"

/**
 * Планира почивките за всички дилъри с напълно преработен алгоритъм
 * Гарантира, че няма последователни почивки и осигурява равномерно разпределение
 */
export function scheduleBreaks(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
  preferences?: SchedulePreferences,
): void {
  const R = timeSlots.length
  const D = eligibleDealers.length
  // const dealerToTableRatio = D / Object.keys(dealerAssignments[eligibleDealers[0].id].assignedTables).length; // This needs re-evaluation if used

  // Създаваме масив от всички времеви слотове
  const allTimeSlots = timeSlots.map((_, index) => index)
  const MIN_SLOTS_SAME_TABLE_BEFORE_BREAK = 3 // Configurable X, hardcoded to 3

  // Първо обработваме предпочитанията за първа и последна почивка
  if (preferences) {
    // Първа почивка
    if (preferences.firstBreakDealers && preferences.firstBreakDealers.length > 0) {
      preferences.firstBreakDealers.forEach((dealerId) => {
        const dealer = eligibleDealers.find((d) => d.id === dealerId)
        if (dealer && dealerAssignments[dealerId].breaks < dealerAssignments[dealerId].targetBreaks) {
          const position = 0
          // Проверка дали вече има почивка в този слот (може да е сложено от друг preference)
          if (schedule[timeSlots[position].time][dealerId] === "BREAK") return

          // Проверка дали може да се сложи почивка според новите правила (за слот 0)
          const assignment = dealerAssignments[dealerId]
          const canPlaceBreak =
            position === 0 || // Start of shift
            (assignment.slotsWorkedSinceLastBreak === 1 && assignment.tablesWorkedSinceLastBreak.size === 1) ||
            (assignment.slotsWorkedSinceLastBreak >= 2 && assignment.tablesWorkedSinceLastBreak.size >= 2) ||
            assignment.slotsWorkedSinceLastBreak >= MIN_SLOTS_SAME_TABLE_BEFORE_BREAK

          if (canPlaceBreak && !assignment.isFreshOffBreak) {
            const timeSlot = timeSlots[position].time
            schedule[timeSlot][dealerId] = "BREAK"
            dealerAssignments[dealerId].breaks++
            dealerAssignments[dealerId].breakPositions.push(position)
            console.log(`[BS_PREF_START_BREAK] Dealer ${dealer.name || dealerId} takes PREFERRED break at slot 0. DA State Update: slots=0, tables=0, isFresh=true`);
            dealerAssignments[dealerId].slotsWorkedSinceLastBreak = 0
            dealerAssignments[dealer.id].tablesWorkedSinceLastBreak.clear()
            dealerAssignments[dealerId].isFreshOffBreak = true
          }
        }
      })
    }

    // Последна почивка
    if (preferences.lastBreakDealers && preferences.lastBreakDealers.length > 0) {
      preferences.lastBreakDealers.forEach((dealerId) => {
        const dealer = eligibleDealers.find((d) => d.id === dealerId)
        if (dealer && dealerAssignments[dealerId].breaks < dealerAssignments[dealerId].targetBreaks) {
          const position = timeSlots.length - 1
          // Проверка дали вече има почивка в този слот
          if (schedule[timeSlots[position].time][dealerId] === "BREAK") return

          const assignment = dealerAssignments[dealerId]
          // Hard Rule: Cannot place break if isFreshOffBreak is true
          if (assignment.isFreshOffBreak) return

          // Main Rule Check
          const canPlaceBreak =
            (assignment.slotsWorkedSinceLastBreak === 1 && assignment.tablesWorkedSinceLastBreak.size === 1) ||
            (assignment.slotsWorkedSinceLastBreak >= 2 && assignment.tablesWorkedSinceLastBreak.size >= 2) ||
            assignment.slotsWorkedSinceLastBreak >= MIN_SLOTS_SAME_TABLE_BEFORE_BREAK

          if (canPlaceBreak) {
            const timeSlot = timeSlots[position].time
            schedule[timeSlot][dealerId] = "BREAK"
            dealerAssignments[dealerId].breaks++
            dealerAssignments[dealerId].breakPositions.push(position)
            console.log(`[BS_PREF_END_BREAK] Dealer ${dealer.name || dealerId} takes PREFERRED break at END slot ${position}. DA State Update: slots=0, tables=0, isFresh=true`);
            // Update state for last break (though it's end of shift)
            dealerAssignments[dealerId].slotsWorkedSinceLastBreak = 0
            dealerAssignments[dealerId].tablesWorkedSinceLastBreak.clear()
            dealerAssignments[dealerId].isFreshOffBreak = true
          }
        }
      })
    }
  }

  // Създаваме масив от всички дилъри, сортирани по целеви брой почивки (низходящо)
  const sortedDealers = [...eligibleDealers].sort(
    (a, b) => dealerAssignments[b.id].targetBreaks - dealerAssignments[a.id].targetBreaks,
  )

  // За всеки дилър, планираме почивките му с равномерно разпределение
  for (const dealer of sortedDealers) {
    const dealerData = dealerAssignments[dealer.id]
    const remainingBreaks = dealerData.targetBreaks - dealerData.breaks

    if (remainingBreaks <= 0) continue

    // Получаваме всички заети слотове (където дилърът вече има почивка или не може да има)
    const occupiedOrInvalidSlots = new Set<number>()
    dealerData.breakPositions.forEach((pos: number) => {
      occupiedOrInvalidSlots.add(pos)
      occupiedOrInvalidSlots.add(pos - 1) // Prevent consecutive breaks
      occupiedOrInvalidSlots.add(pos + 1) // Prevent consecutive breaks
    })

    // Simulate work to determine valid break slots
    // This is a simplified simulation for break placement.
    // Actual work assignment in slot-filler will update these fields definitively.
    let tempSlotsWorked = dealerData.slotsWorkedSinceLastBreak
    let tempTablesWorked = new Set(dealerData.tablesWorkedSinceLastBreak)
    let tempIsFreshOffBreak = dealerData.isFreshOffBreak

    const potentialBreakSlots: number[] = []

    for (let i = 0; i < R; i++) {
      if (occupiedOrInvalidSlots.has(i) || dealerData.breakPositions.includes(i)) {
        if (dealerData.breakPositions.includes(i)) { // Actual break for this dealer
          tempSlotsWorked = 0
          tempTablesWorked.clear()
          tempIsFreshOffBreak = true
        }
        continue
      }

      // If slot 'i' is a work slot (or potential work slot)
      // For this simulation, we assume if it's not a break, it's work.
      // A more accurate simulation would look at schedule[timeSlots[i].time][dealer.id]
      // but that might not be filled yet for future slots.

      // Check if a break can be placed at slot 'i'
      // Hard Rule Check:
      if (tempIsFreshOffBreak) {
        // Cannot place break here. Simulate work for this slot.
        // console.log(`[BS_Simulate_BreakPlacement] Dealer ${dealer.name} slot ${i}: tempIsFreshOffBreak=true. Simulating work.`);
        tempSlotsWorked++
        // We don't know the table here, so add a placeholder or handle size check carefully.
        // For simplicity, let's assume a new table is worked if variety is needed.
        tempTablesWorked.add(`simulatedTable${i}`)
        tempIsFreshOffBreak = false
        continue
      }

      // Main Rule Check (for placing a break at slot 'i'):
      const canPlaceBreak =
        i === 0 || // Start of shift (already handled by preferences, but good for general logic)
        (tempSlotsWorked === 1 && tempTablesWorked.size === 1) ||
        (tempSlotsWorked >= 2 && tempTablesWorked.size >= 2) ||
        tempSlotsWorked >= MIN_SLOTS_SAME_TABLE_BEFORE_BREAK

      if (canPlaceBreak) {
        potentialBreakSlots.push(i)
      }

      // Simulate working at slot 'i' if no break is placed there for the next iteration
      tempSlotsWorked++
      tempTablesWorked.add(`simulatedTable${i}`) // Placeholder
      tempIsFreshOffBreak = false
    }

    const availableAndValidSlots = allTimeSlots.filter(
      (slot) => !occupiedOrInvalidSlots.has(slot) && potentialBreakSlots.includes(slot),
    )

    if (availableAndValidSlots.length < remainingBreaks) {
      console.warn(
        `Not enough valid slots for dealer ${dealer.name} for ${remainingBreaks} breaks. Have ${availableAndValidSlots.length} after rule check. Potential: ${potentialBreakSlots.length}, Occupied/Invalid: ${occupiedOrInvalidSlots.size}`,
      )
      // Attempt to place with fewer slots if some are available
      if (availableAndValidSlots.length === 0) continue
    }

    const breaksToPlace = Math.min(remainingBreaks, availableAndValidSlots.length)
    if (breaksToPlace <= 0) continue

    // The old breakInterval logic is removed. distributeBreaksEvenly will try to pick best spots.
    // Consider a more sophisticated interval calculation if needed, or let distributeBreaksEvenly handle it.
    const selectedSlots = distributeBreaksEvenly(availableAndValidSlots, breaksToPlace, R)

    for (const position of selectedSlots) {
      if (dealerAssignments[dealer.id].breaks >= dealerAssignments[dealer.id].targetBreaks) break

      // Double check rules just before placing, using the current state from dealerAssignments
      // This is important because previously placed breaks for the *same dealer* in this loop iteration
      // would have updated dealerAssignments.
      const assignment = dealerAssignments[dealer.id]

      // If this position was determined based on a simulation, the actual current state
      // might be different if a break was placed earlier in this loop for the same dealer.
      // Re-evaluate based on last actual break or start of shift.
      let slotsSinceActualLastBreak = 0
      let tablesSinceActualLastBreak = new Set<string>()
      let isActuallyFreshOffBreak = false
      let lastBreakPos = -1
      for(const bp of assignment.breakPositions) {
        if (bp < position) lastBreakPos = Math.max(lastBreakPos, bp);
      }

      if (lastBreakPos !== -1) {
        isActuallyFreshOffBreak = false; // Will be set to true *if* this position becomes a break
        for (let k = lastBreakPos + 1; k < position; k++) {
          const slotTime = timeSlots[k].time
          const workAssignment = schedule[slotTime][dealer.id]
          if (workAssignment && workAssignment !== "BREAK" && workAssignment !== "-") {
            slotsSinceActualLastBreak++
            tablesSinceActualLastBreak.add(workAssignment)
            isActuallyFreshOffBreak = false;
          } else if (workAssignment === "BREAK") { // Should not happen if occupiedSlots is correct
            slotsSinceActualLastBreak = 0;
            tablesSinceActualLastBreak.clear();
            isActuallyFreshOffBreak = true;
          }
        }
      } else { // No breaks before this position, count from start
        isActuallyFreshOffBreak = false; // If first slot is break, it's fine.
        for (let k = 0; k < position; k++) {
          const slotTime = timeSlots[k].time
          const workAssignment = schedule[slotTime][dealer.id]
          if (workAssignment && workAssignment !== "BREAK" && workAssignment !== "-") {
            slotsSinceActualLastBreak++
            tablesSinceActualLastBreak.add(workAssignment)
            isActuallyFreshOffBreak = false;
          } else if (workAssignment === "BREAK") {
             slotsSinceActualLastBreak = 0;
             tablesSinceActualLastBreak.clear();
             isActuallyFreshOffBreak = true;
          }
        }
      }
      // If current slot is 0, it's a valid start for a break.
      if (position === 0) isActuallyFreshOffBreak = false;


      // Hard Rule Check:
      if (isActuallyFreshOffBreak && schedule[timeSlots[position -1].time][dealer.id] === "BREAK") { // Check if previous slot was a break for this dealer
         // This implies B -> B, which should be caught by occupiedSlots.
         // More relevant: if isFreshOffBreak from dealerAssignment is true due to a *previous* slot in the schedule.
         // The `isFreshOffBreak` in `dealerAssignment` should reflect the state *after* the previous slot.
         // The re-evaluation above handles this by checking work between last actual break and `position`.
         // If `isActuallyFreshOffBreak` is true, it means `position-1` was a break.
         // So, `schedule[timeSlots[position-1].time][dealer.id] === 'BREAK'` would make this `B->B`
         // The primary concern for `isFreshOffBreak` is `B -> W1 -> B`.
         // If `dealerAssignments[dealer.id].isFreshOffBreak` is true, means slot `position-1` was WORK and `position-2` was BREAK.
         // This is the `B->W1->B` scenario.
         // The re-calculated `slotsSinceActualLastBreak` would be 1.
      }


      // Main Rule Check (for placing a break at `position`):
      const canPlaceThisBreak =
        position === 0 || // Start of shift
        (slotsSinceActualLastBreak === 1 && tablesSinceActualLastBreak.size === 1 && !isActuallyFreshOffBreak) || // Allow B->W1 if W1 is first work after initial break, or start of shift. Not B->W1->B
        (slotsSinceActualLastBreak >= 2 && tablesSinceActualLastBreak.size >= 2) ||
        (slotsSinceActualLastBreak >= MIN_SLOTS_SAME_TABLE_BEFORE_BREAK);

      const da = dealerAssignments[dealer.id]; // shorthand

      if (da.isFreshOffBreak && slotsSinceActualLastBreak === 1 && position > 0) {
        // This is the B -> W1 -> B case. W1 is at position-1. Current position is candidate for B.
        console.log(`[BS_PREVENT_BWB] Dealer ${dealer.name} at slot ${position}. DA State: slotsSinceLast=${da.slotsWorkedSinceLastBreak}, tablesSinceLast=${da.tablesWorkedSinceLastBreak.size}, isFresh=${da.isFreshOffBreak}. Recalculated for this slot: slotsActual=${slotsSinceActualLastBreak}, tablesActual=${tablesSinceActualLastBreak.size}, isActualFresh=${isActuallyFreshOffBreak}. PREVENTING BREAK.`);
        continue;
      }

      if (canPlaceThisBreak) {
        const timeSlot = timeSlots[position].time
        if (schedule[timeSlot][dealer.id] === "BREAK") { // Already a break (e.g. from preferences)
            // console.log(`[BS_DEBUG] Dealer ${dealer.name} slot ${position} already a break (pref?). Skipping.`);
            continue;
        }

        schedule[timeSlot][dealer.id] = "BREAK"
        da.breaks++
        da.breakPositions.push(position)
        da.breakPositions.sort((a,b) => a-b); // Keep sorted

        console.log(`[BS_BREAK_PLACED] Dealer ${dealer.name} takes break at ${timeSlot} (slot ${position}). Prev state for this decision: slotsWorked=${slotsSinceActualLastBreak}, tablesWorked=${tablesSinceActualLastBreak.size}, isFresh(recalc)=${isActuallyFreshOffBreak}. New DA state: slots=0, tables=0, isFresh=true. Total breaks: ${da.breaks}`);
        da.slotsWorkedSinceLastBreak = 0
        da.tablesWorkedSinceLastBreak.clear()
        da.isFreshOffBreak = true
      } else {
         console.log(
          `[BS_SKIP_PLACEMENT] Dealer ${dealer.name} at slot ${position}. Rule fail. Slots since last (recalc): ${slotsSinceActualLastBreak}, Tables (recalc): ${tablesSinceActualLastBreak.size}, Is Fresh (recalc): ${isActuallyFreshOffBreak}. Current DA State: fresh=${da.isFreshOffBreak}, slotsWorked=${da.slotsWorkedSinceLastBreak}`
        );
      }
    }
  }
}

/**
 * Разпределя почивките равномерно през смяната с оптимален интервал
 */
function distributeBreaksEvenly(
  availableSlots: number[],
  breakCount: number,
  totalSlots: number,
  optimalInterval = 0,
): number[] {
  // Ако имаме точно толкова слотове, колкото са ни нужни
  if (availableSlots.length === breakCount) {
    return availableSlots
  }

  // Сортираме слотовете
  availableSlots.sort((a, b) => a - b)

  // Ако имаме само една почивка, избираме средата на смяната
  if (breakCount === 1) {
    // Намираме слота, който е най-близо до средата на смяната
    const middleSlot = Math.floor(totalSlots / 2)
    const closestToMiddle = availableSlots.reduce((prev, curr) =>
      Math.abs(curr - middleSlot) < Math.abs(prev - middleSlot) ? curr : prev,
    )
    return [closestToMiddle]
  }

  // Разделяме смяната на равни интервали
  const result: number[] = []

  // Използваме оптималния интервал, ако е зададен, иначе изчисляваме стандартен
  const idealInterval = optimalInterval > 0 ? optimalInterval : Math.floor(totalSlots / (breakCount + 1))

  // Създаваме идеални позиции за почивки
  const idealPositions: number[] = []
  for (let i = 1; i <= breakCount; i++) {
    idealPositions.push(i * idealInterval)
  }

  // За всяка идеална позиция, намираме най-близкия наличен слот
  for (const idealPos of idealPositions) {
    if (result.length >= breakCount) break

    // Намираме най-близкия наличен слот до идеалната позиция
    let closestSlot = -1
    let minDistance = totalSlots

    for (const slot of availableSlots) {
      // Пропускаме слотове, които вече са избрани
      if (result.includes(slot)) continue

      // Пропускаме слотове, които са съседни на вече избрани
      if (result.some((s) => Math.abs(s - slot) === 1)) continue

      const distance = Math.abs(slot - idealPos)
      if (distance < minDistance) {
        minDistance = distance
        closestSlot = slot
      }
    }

    if (closestSlot !== -1) {
      result.push(closestSlot)
    }
  }

  // Ако все още нямаме достатъчно почивки, добавяме от останалите налични слотове
  if (result.length < breakCount) {
    const remainingSlots = availableSlots.filter(
      (slot) => !result.includes(slot) && !result.some((s) => Math.abs(s - slot) === 1),
    )

    for (const slot of remainingSlots) {
      if (result.length >= breakCount) break
      result.push(slot)
    }
  }

  return result
}

/**
 * Коригира последователните почивки с по-агресивен подход
 */
export function fixConsecutiveBreaks(
  dealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  const R = timeSlots.length

  // Първи проход: идентифицираме последователните почивки
  const dealersWithConsecutiveBreaks: Map<string, number[]> = new Map()

  for (const dealer of dealers) {
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
    const dealer = dealers.find((d) => d.id === dealerId)
    if (!dealer) continue

    console.log(`Fixing consecutive breaks for dealer ${dealer.name}: ${indices.length} consecutive breaks`)

    for (const index of indices) {
      const currentSlot = timeSlots[index].time

      // Опитваме се да намерим достъпна маса
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

      // Ако няма достъпна маса, опитваме се да разменим с друг дилър
      const otherDealers = dealers.filter((d) => {
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

      // Ако не успяхме да разменим, опитваме се да преместим почивката
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
