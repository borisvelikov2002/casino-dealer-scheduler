import type { DealerWithTables, ScheduleData, TimeSlot } from "../scheduler-types"

/**
 * Запълва работните слотове с подобрен алгоритъм за ротация
 * Осигурява равномерно разпределение на ротациите
 */
export function fillWorkSlots(
  eligibleDealers: DealerWithTables[],
  uniqueTables: string[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  const R = timeSlots.length
  const T = uniqueTables.length
  const D = eligibleDealers.length
  const dealerToTableRatio = D / T

  // Създаваме проследяване на последните назначения за всяка маса
  const tableLastAssignedDealer: Record<string, { dealerId: string; timeIndex: number }> = {}
  uniqueTables.forEach((table) => {
    tableLastAssignedDealer[table] = { dealerId: "", timeIndex: -1 }
  })

  // Създаваме проследяване на последните назначения за всеки дилър
  const dealerLastAssignedTable: Record<string, { table: string; timeIndex: number }> = {}
  eligibleDealers.forEach((dealer) => {
    dealerLastAssignedTable[dealer.id] = { table: "", timeIndex: -1 }
  })

  // Определяме оптималния интервал между ротациите според съотношението дилъри/маси
  let optimalRotationInterval = 0

  if (dealerToTableRatio <= 1.2) {
    // Ако имаме малко дилъри спрямо масите, ротациите са по-чести
    optimalRotationInterval = 2 // Кратък интервал между ротациите
  } else if (dealerToTableRatio <= 1.4) {
    // За съотношение около 1.36 (19 дилъри на 14 маси)
    // Целим 3 маси и почивка
    optimalRotationInterval = 3 // Среден интервал между ротациите
  } else {
    // За съотношение над 1.4 (20+ дилъри на 14 маси)
    // Целим 2 маси и почивка
    optimalRotationInterval = 4 // По-дълъг интервал между ротациите
  }

  // За всяка ротация
  for (let rotationIndex = 0; rotationIndex < R; rotationIndex++) {
    const currentSlot = timeSlots[rotationIndex].time

    // За всяка маса в тази ротация
    for (const table of uniqueTables) {
      // Пропускаме, ако масата вече е назначена
      if (Object.values(schedule[currentSlot]).includes(table)) continue

      // Намираме подходящи дилъри за тази маса
      const eligibleDealersForTable = eligibleDealers.filter((dealer) => {
        // Трябва да може да работи на тази маса
        if (!dealer.available_tables.includes(table)) return false

        // Трябва да няма вече назначение в този слот
        if (schedule[currentSlot][dealer.id]) return false

        // Трябва да не е достигнал целевите ротации
        if (dealerAssignments[dealer.id].rotations >= dealerAssignments[dealer.id].targetRotations) return false

        // СТРОГА ПРОВЕРКА: Трябва да не е работил на същата маса в предишната ротация
        if (rotationIndex > 0) {
          const prevSlot = timeSlots[rotationIndex - 1].time
          if (schedule[prevSlot][dealer.id] === table) return false
        }

        // СТРОГА ПРОВЕРКА: Трябва да не работи на същата маса в следващата ротация (ако вече е назначен)
        if (rotationIndex < R - 1) {
          const nextSlot = timeSlots[rotationIndex + 1].time
          if (schedule[nextSlot] && schedule[nextSlot][dealer.id] === table) return false
        }

        // Проверяваме дали дилърът е бил последно назначен на тази маса
        if (dealerLastAssignedTable[dealer.id].table === table) {
          // Използваме оптималния интервал между ротациите
          const timeSinceLastAssignment = rotationIndex - dealerLastAssignedTable[dealer.id].timeIndex
          if (timeSinceLastAssignment < optimalRotationInterval) return false
        }

        return true
      })

      if (eligibleDealersForTable.length > 0) {
        // Сортираме по брой ротации (възходящо) и разнообразие на масите (низходящо)
        eligibleDealersForTable.sort((a, b) => {
          // Приоритизираме дилъри с по-малко ротации
          const rotationDiff = dealerAssignments[a.id].rotations - dealerAssignments[b.id].rotations
          if (rotationDiff !== 0) return rotationDiff

          // При равен брой ротации, приоритизираме дилъри с по-малко разнообразие
          return dealerAssignments[a.id].assignedTables.size - dealerAssignments[b.id].assignedTables.size
        })

        // Назначаваме масата на избрания дилър
        const selectedDealer = eligibleDealersForTable[0]
        schedule[currentSlot][selectedDealer.id] = table

        // Обновяваме проследяването
        dealerAssignments[selectedDealer.id].rotations++
        dealerAssignments[selectedDealer.id].lastTable = table
        dealerAssignments[selectedDealer.id].lastTableIndex = rotationIndex
        dealerAssignments[selectedDealer.id].assignedTables.add(table)

        const da = dealerAssignments[selectedDealer.id];
        const prevSlots = da.slotsWorkedSinceLastBreak; // For logging
        da.slotsWorkedSinceLastBreak++
        da.tablesWorkedSinceLastBreak.add(table)
        da.isFreshOffBreak = false
        console.log(`[SF_FILL_WORK_SLOT] Dealer ${selectedDealer.name || selectedDealer.id} assigned to ${table} at slot ${rotationIndex}. Prev Slots: ${prevSlots}, New DA State: slotsWorked=${da.slotsWorkedSinceLastBreak}, tablesWorked=${da.tablesWorkedSinceLastBreak.size}, isFresh=${da.isFreshOffBreak}`);

        // Обновяваме последното назначение за масата
        tableLastAssignedDealer[table] = { dealerId: selectedDealer.id, timeIndex: rotationIndex }

        // Обновяваме последното назначение за дилъра
        dealerLastAssignedTable[selectedDealer.id] = { table, timeIndex: rotationIndex }
      }
    }
  }
}

/**
 * Запълва останалите неназначени слотове с подобрен алгоритъм
 */
export function fillRemainingSlots(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  const R = timeSlots.length

  // Създаваме проследяване на последните назначения за всеки дилър
  const dealerLastAssignedTable: Record<string, { table: string; timeIndex: number }> = {}
  eligibleDealers.forEach((dealer) => {
    dealerLastAssignedTable[dealer.id] = { table: "", timeIndex: -1 }
  })

  // Първо актуализираме проследяването с текущите назначения
  for (let i = 0; i < R; i++) {
    const slot = timeSlots[i].time
    for (const dealer of eligibleDealers) {
      const assignment = schedule[slot][dealer.id]
      if (assignment && assignment !== "BREAK") {
        dealerLastAssignedTable[dealer.id] = { table: assignment, timeIndex: i }
      }
    }
  }

  // Сортираме дилърите по брой ротации (възходящо)
  const sortedDealers = [...eligibleDealers].sort(
    (a, b) => dealerAssignments[a.id].rotations - dealerAssignments[b.id].rotations,
  )

  // За всеки дилър, запълваме неназначените слотове
  for (const dealer of sortedDealers) {
    // Ако дилърът е достигнал целевите ротации, пропускаме го
    if (dealerAssignments[dealer.id].rotations >= dealerAssignments[dealer.id].targetRotations) {
      continue
    }

    // Намираме всички неназначени слотове за този дилър
    const unassignedSlots: number[] = []
    for (let i = 0; i < R; i++) {
      const slot = timeSlots[i].time
      if (!schedule[slot][dealer.id]) {
        unassignedSlots.push(i)
      }
    }

    // Сортираме неназначените слотове по приоритет
    unassignedSlots.sort((a, b) => {
      // Приоритизираме слотове, които не са съседни на почивки
      const aAdjacentToBreak =
        (a > 0 && schedule[timeSlots[a - 1].time][dealer.id] === "BREAK") ||
        (a < R - 1 && schedule[timeSlots[a + 1].time][dealer.id] === "BREAK")

      const bAdjacentToBreak =
        (b > 0 && schedule[timeSlots[b - 1].time][dealer.id] === "BREAK") ||
        (b < R - 1 && schedule[timeSlots[b + 1].time][dealer.id] === "BREAK")

      if (aAdjacentToBreak && !bAdjacentToBreak) return 1
      if (!aAdjacentToBreak && bAdjacentToBreak) return -1

      // Приоритизираме слотове в средата на смяната
      const aMidShiftDistance = Math.abs(a - R / 2)
      const bMidShiftDistance = Math.abs(b - R / 2)

      return aMidShiftDistance - bMidShiftDistance
    })

    // Запълваме неназначените слотове до достигане на целевите ротации
    for (const slotIndex of unassignedSlots) {
      // Ако дилърът е достигнал целевите ротации, прекратяваме
      if (dealerAssignments[dealer.id].rotations >= dealerAssignments[dealer.id].targetRotations) {
        break
      }

      const currentSlot = timeSlots[slotIndex].time

      // Опитваме се да намерим достъпна маса
      let availableTables = dealer.available_tables.filter(
        (table) => !Object.values(schedule[currentSlot]).includes(table),
      )

      // СТРОГА ПРОВЕРКА: Филтрираме масите, на които дилърът е работил в съседни слотове
      if (slotIndex > 0) {
        const prevSlot = timeSlots[slotIndex - 1].time
        const prevTable = schedule[prevSlot][dealer.id]
        if (prevTable && prevTable !== "BREAK") {
          availableTables = availableTables.filter((table) => table !== prevTable)
        }
      }

      if (slotIndex < R - 1) {
        const nextSlot = timeSlots[slotIndex + 1].time
        if (schedule[nextSlot]) {
          const nextTable = schedule[nextSlot][dealer.id]
          if (nextTable && nextTable !== "BREAK") {
            availableTables = availableTables.filter((table) => table !== nextTable)
          }
        }
      }

      if (availableTables.length > 0) {
        // Избягваме масата от предишната ротация и търсим разнообразие
        const lastAssignment = dealerLastAssignedTable[dealer.id]

        // Филтрираме масите, които дилърът не е работил скоро
        const preferredTables = availableTables.filter((table) => {
          if (table === lastAssignment.table) {
            const timeSinceLastAssignment = slotIndex - lastAssignment.timeIndex
            return timeSinceLastAssignment >= 4 // Увеличаваме минималното разстояние
          }
          return true
        })

        // Предпочитаме маси, на които дилърът не е работил още
        const unworkedTables = preferredTables.filter(
          (table) => !dealerAssignments[dealer.id].assignedTables.has(table),
        )

        let selectedTable
        if (unworkedTables.length > 0) {
          selectedTable = unworkedTables[0]
        } else if (preferredTables.length > 0) {
          selectedTable = preferredTables[0]
        } else {
          selectedTable = availableTables[0]
        }

        // Назначаваме маса
        schedule[currentSlot][dealer.id] = selectedTable
        dealerAssignments[dealer.id].rotations++
        dealerAssignments[dealer.id].lastTable = selectedTable
        dealerAssignments[dealer.id].lastTableIndex = slotIndex
        dealerAssignments[dealer.id].assignedTables.add(selectedTable)

        const daFill = dealerAssignments[dealer.id];
        const prevSlotsFill = daFill.slotsWorkedSinceLastBreak; // For logging
        daFill.slotsWorkedSinceLastBreak++
        daFill.tablesWorkedSinceLastBreak.add(selectedTable)
        daFill.isFreshOffBreak = false
        console.log(`[SF_REMAINING_WORK] Dealer ${dealer.name || dealer.id} assigned to ${selectedTable} at slot ${slotIndex}. Prev Slots: ${prevSlotsFill}, New DA State: slotsWorked=${daFill.slotsWorkedSinceLastBreak}, tablesWorked=${daFill.tablesWorkedSinceLastBreak.size}, isFresh=${daFill.isFreshOffBreak}`);

        // Обновяваме последното назначение
        dealerLastAssignedTable[dealer.id] = { table: selectedTable, timeIndex: slotIndex }
      } else {
        // Ако няма достъпна маса, даваме почивка
        schedule[currentSlot][dealer.id] = "BREAK"
        const daBreak = dealerAssignments[dealer.id];
        daBreak.breaks++
        daBreak.breakPositions.push(slotIndex)
        console.log(`[SF_REMAINING_BREAK] Dealer ${dealer.name || dealer.id} takes BREAK at slot ${slotIndex} (no table). Prev DA state: slotsWorked=${daBreak.slotsWorkedSinceLastBreak}, tables=${daBreak.tablesWorkedSinceLastBreak.size}, isFresh=${daBreak.isFreshOffBreak}. New DA state: slots=0, tables=0, isFresh=true`);
        daBreak.slotsWorkedSinceLastBreak = 0
        daBreak.tablesWorkedSinceLastBreak.clear()
        daBreak.isFreshOffBreak = true
      }
    }
  }

  // Запълваме останалите неназначени слотове с почивки
  for (const dealer of eligibleDealers) {
    for (let i = 0; i < R; i++) {
      const slot = timeSlots[i].time
      if (!schedule[slot][dealer.id]) {
        schedule[slot][dealer.id] = "BREAK"
        const daEnsureEmpty = dealerAssignments[dealer.id];
        daEnsureEmpty.breaks++
        daEnsureEmpty.breakPositions.push(i)
        console.log(`[SF_ENSURE_EMPTY_BREAK] Dealer ${dealer.name || dealer.id} takes BREAK at slot ${i} (empty). Prev DA state: slotsWorked=${daEnsureEmpty.slotsWorkedSinceLastBreak}, tables=${daEnsureEmpty.tablesWorkedSinceLastBreak.size}, isFresh=${daEnsureEmpty.isFreshOffBreak}. New DA state: slots=0, tables=0, isFresh=true`);
        daEnsureEmpty.slotsWorkedSinceLastBreak = 0
        daEnsureEmpty.tablesWorkedSinceLastBreak.clear()
        daEnsureEmpty.isFreshOffBreak = true
      }
    }
  }
}

/**
 * Гарантира, че всички дилъри имат точно R назначени слота
 */
export function ensureCompleteAssignments(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  const R = timeSlots.length

  for (const dealer of eligibleDealers) {
    const totalSlots = dealerAssignments[dealer.id].rotations + dealerAssignments[dealer.id].breaks

    if (totalSlots < R) {
      console.log(`Dealer ${dealer.name} has only ${totalSlots}/${R} slots assigned. Adding ${R - totalSlots} breaks.`)

      // Добавяме почивки, за да запълним останалите слотове
      for (let rotationIndex = 0; rotationIndex < R; rotationIndex++) {
        const currentSlot = timeSlots[rotationIndex].time

        if (!schedule[currentSlot][dealer.id]) {
          // Проверяваме дали това би създало последователни почивки
          let wouldCreateConsecutiveBreaks = false
          if (rotationIndex > 0) {
            const prevSlot = timeSlots[rotationIndex - 1].time
            if (schedule[prevSlot][dealer.id] === "BREAK") {
              wouldCreateConsecutiveBreaks = true
            }
          }
          if (rotationIndex < R - 1) {
            const nextSlot = timeSlots[rotationIndex + 1].time
            if (schedule[nextSlot] && schedule[nextSlot][dealer.id] === "BREAK") {
              wouldCreateConsecutiveBreaks = true
            }
          }

          // Ако не би създало последователни почивки или нямаме избор, даваме почивка
          if (!wouldCreateConsecutiveBreaks || totalSlots + dealerAssignments[dealer.id].breaks >= R - 1) {
            schedule[currentSlot][dealer.id] = "BREAK"
            dealerAssignments[dealer.id].breaks++
            dealerAssignments[dealer.id].breakPositions.push(rotationIndex)

            const daEnsureComplete = dealerAssignments[dealer.id];
            console.log(`[SF_ENSURE_COMPLETE_BREAK] Dealer ${dealer.name || dealer.id} takes BREAK at slot ${rotationIndex} (incomplete). Prev DA state: slotsWorked=${daEnsureComplete.slotsWorkedSinceLastBreak}, tables=${daEnsureComplete.tablesWorkedSinceLastBreak.size}, isFresh=${daEnsureComplete.isFreshOffBreak}. New DA state: slots=0, tables=0, isFresh=true`);
            daEnsureComplete.slotsWorkedSinceLastBreak = 0
            daEnsureComplete.tablesWorkedSinceLastBreak.clear()
            daEnsureComplete.isFreshOffBreak = true

            if (dealerAssignments[dealer.id].rotations + dealerAssignments[dealer.id].breaks >= R) {
              break
            }
          }
        }
      }
    }
  }
}

/**
 * Проверява и коригира последователни назначения на една и съща маса
 */
export function fixConsecutiveTableAssignments(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  const R = timeSlots.length

  // Първи проход: идентифицираме последователните назначения на една и съща маса
  const dealersWithConsecutiveAssignments: Map<string, { timeIndex: number; table: string }[]> = new Map()

  for (const dealer of eligibleDealers) {
    const consecutiveAssignments: { timeIndex: number; table: string }[] = []

    for (let i = 1; i < R; i++) {
      const prevSlot = timeSlots[i - 1].time
      const currentSlot = timeSlots[i].time
      const prevAssignment = schedule[prevSlot][dealer.id]
      const currentAssignment = schedule[currentSlot][dealer.id]

      if (
        prevAssignment &&
        currentAssignment &&
        prevAssignment !== "BREAK" &&
        currentAssignment !== "BREAK" &&
        prevAssignment === currentAssignment
      ) {
        consecutiveAssignments.push({ timeIndex: i, table: currentAssignment })
      }
    }

    if (consecutiveAssignments.length > 0) {
      dealersWithConsecutiveAssignments.set(dealer.id, consecutiveAssignments)
    }
  }

  // Ако няма последователни назначения, приключваме
  if (dealersWithConsecutiveAssignments.size === 0) {
    return
  }

  console.log(`Found ${dealersWithConsecutiveAssignments.size} dealers with consecutive table assignments`)

  // Втори проход: коригираме последователните назначения
  for (const [dealerId, assignments] of dealersWithConsecutiveAssignments.entries()) {
    const dealer = eligibleDealers.find((d) => d.id === dealerId)
    if (!dealer) continue

    console.log(
      `Fixing consecutive assignments for dealer ${dealer.name}: ${assignments.length} consecutive assignments`,
    )

    for (const assignment of assignments) {
      const timeIndex = assignment.timeIndex
      const currentSlot = timeSlots[timeIndex].time
      const table = assignment.table

      // Опитваме се да намерим друга достъпна маса за този времеви слот
      const availableTables = dealer.available_tables.filter(
        (t) => t !== table && !Object.values(schedule[currentSlot]).includes(t),
      )

      if (availableTables.length > 0) {
        // Заменяме с друга маса
        const newTable = availableTables[0]
        schedule[currentSlot][dealer.id] = newTable
        dealerAssignments[dealer.id].assignedTables.add(newTable)
        console.log(`  Fixed by assigning new table ${newTable} at ${timeSlots[timeIndex].formattedTime}`)
        continue
      }

      // Ако няма достъпна маса, опитваме се да разменим с друг дилър
      const otherDealers = eligibleDealers.filter((d) => {
        if (d.id === dealer.id) return false

        const otherAssignment = schedule[currentSlot][d.id]
        if (!otherAssignment || otherAssignment === "BREAK") return false

        // Проверяваме дали текущият дилър може да работи на масата на другия
        if (!dealer.available_tables.includes(otherAssignment)) return false

        // Проверяваме дали другият дилър може да работи на масата на текущия
        return d.available_tables.includes(table)
      })

      let swapSuccessful = false
      for (const otherDealer of otherDealers) {
        const otherTable = schedule[currentSlot][otherDealer.id]

        // Проверяваме дали размяната би създала последователни назначения за другия дилър
        let wouldCreateConsecutiveForOther = false
        if (timeIndex > 0) {
          const prevSlot = timeSlots[timeIndex - 1].time
          if (schedule[prevSlot][otherDealer.id] === table) {
            wouldCreateConsecutiveForOther = true
          }
        }
        if (timeIndex < R - 1) {
          const nextSlot = timeSlots[timeIndex + 1].time
          if (schedule[nextSlot] && schedule[nextSlot][otherDealer.id] === table) {
            wouldCreateConsecutiveForOther = true
          }
        }

        if (!wouldCreateConsecutiveForOther) {
          // Извършваме размяна
          schedule[currentSlot][dealer.id] = otherTable
          schedule[currentSlot][otherDealer.id] = table

          // Обновяваме проследяването
          dealerAssignments[dealer.id].assignedTables.add(otherTable)
          dealerAssignments[otherDealer.id].assignedTables.add(table)

          console.log(`  Fixed by swapping with dealer ${otherDealer.name} at ${timeSlots[timeIndex].formattedTime}`)
          swapSuccessful = true
          break
        }
      }

      if (!swapSuccessful) {
        console.log(`  Could not fix consecutive assignment at ${timeSlots[timeIndex].formattedTime}`)
      }
    }
  }
}

/**
 * Коригира случаите, когато дилър има само 1 ротация преди почивка
 */
export function fixSingleRotationBeforeBreak(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  // Подобряваме функцията fixSingleRotationBeforeBreak

  // Увеличаваме минималния брой ротации преди почивка
  const MIN_ROTATIONS_BEFORE_BREAK = 3

  // Подобряваме логиката за откриване на проблеми
  for (const dealer of eligibleDealers) {
    for (let i = 0; i < timeSlots.length; i++) {
      const currentSlot = timeSlots[i].time
      const assignment = schedule[currentSlot][dealer.id]

      if (assignment === "BREAK") {
        // Проверяваме колко последователни ротации има преди тази почивка
        let rotationCount = 0
        let rotationStartIndex = -1

        for (let j = i - 1; j >= 0; j--) {
          const prevSlot = timeSlots[j].time
          const prevAssignment = schedule[prevSlot][dealer.id]

          if (prevAssignment === "BREAK") {
            break // Спираме при предишна почивка
          } else if (prevAssignment && prevAssignment !== "-") {
            if (rotationCount === 0) {
              rotationStartIndex = j
            }
            rotationCount++
          }
        }

        // Проверяваме дали имаме твърде малко ротации преди почивка
        if (rotationCount > 0 && rotationCount < MIN_ROTATIONS_BEFORE_BREAK) {
          console.log(
            `Dealer ${dealer.name} has only ${rotationCount} rotations before break at ${timeSlots[i].formattedTime}`,
          )

          // Опитваме се да коригираме проблема
          // Стратегия 1: Опитваме се да заменим почивката с работа на маса
          const availableTables = dealer.available_tables.filter(
            (table) => !Object.values(schedule[currentSlot]).includes(table),
          )

          if (availableTables.length > 0) {
            // Заменяме почивката с работа на маса
            const selectedTable = availableTables[0]
            schedule[currentSlot][dealer.id] = selectedTable

            // Обновяваме проследяването
            dealerAssignments[dealer.id].rotations++
            dealerAssignments[dealer.id].breaks--
            dealerAssignments[dealer.id].assignedTables.add(selectedTable)

            // Премахваме от позициите на почивките
            const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(i)
            if (breakPosIndex !== -1) {
              dealerAssignments[dealer.id].breakPositions.splice(breakPosIndex, 1)
            }

            console.log(`  Fixed by assigning table ${selectedTable} at ${timeSlots[i].formattedTime}`)
            continue
          }

          // Стратегия 2: Опитваме се да разменим с друг дилър
          // Търсим дилър, който има поне MIN_ROTATIONS_BEFORE_BREAK ротации преди почивка
          const otherDealers = eligibleDealers.filter((d) => {
            if (d.id === dealer.id) return false

            const otherAssignment = schedule[currentSlot][d.id]
            if (!otherAssignment || otherAssignment === "BREAK") return false

            // Проверяваме дали текущият дилър може да работи на тази маса
            if (!dealer.available_tables.includes(otherAssignment)) return false

            // Проверяваме колко ротации има другият дилър преди този слот
            let otherRotationCount = 0
            for (let j = i - 1; j >= 0; j--) {
              const prevSlot = timeSlots[j].time
              const prevAssignment = schedule[prevSlot][d.id]

              if (prevAssignment === "BREAK") {
                break // Спираме при предишна почивка
              } else if (prevAssignment && prevAssignment !== "-") {
                otherRotationCount++
              }
            }

            // Другият дилър трябва да има поне MIN_ROTATIONS_BEFORE_BREAK ротации
            return otherRotationCount >= MIN_ROTATIONS_BEFORE_BREAK
          })

          let swapSuccessful = false
          for (const otherDealer of otherDealers) {
            const tableId = schedule[currentSlot][otherDealer.id]

            // Проверяваме дали размяната би създала последователни почивки за другия дилър
            let wouldCreateConsecutiveBreaks = false
            if (i > 0 && schedule[timeSlots[i - 1].time][otherDealer.id] === "BREAK") {
              wouldCreateConsecutiveBreaks = true
            }
            if (i < timeSlots.length - 1 && schedule[timeSlots[i + 1].time][otherDealer.id] === "BREAK") {
              wouldCreateConsecutiveBreaks = true
            }

            if (!wouldCreateConsecutiveBreaks) {
              // Извършваме размяна
              schedule[currentSlot][dealer.id] = tableId
              schedule[currentSlot][otherDealer.id] = "BREAK"

              // Обновяваме проследяването
              dealerAssignments[dealer.id].rotations++
              dealerAssignments[dealer.id].breaks--
              dealerAssignments[dealer.id].assignedTables.add(tableId)

              dealerAssignments[otherDealer.id].rotations--
              dealerAssignments[otherDealer.id].breaks++
              dealerAssignments[otherDealer.id].breakPositions.push(i)

              // Премахваме от позициите на почивките
              const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(i)
              if (breakPosIndex !== -1) {
                dealerAssignments[dealer.id].breakPositions.splice(breakPosIndex, 1)
              }

              console.log(`  Fixed by swapping with dealer ${otherDealer.name} at ${timeSlots[i].formattedTime}`)
              swapSuccessful = true
              break
            }
          }

          // Ако не успяхме да разменим, опитваме се да преместим почивката
          if (!swapSuccessful) {
            // Търсим подходящ слот за почивка след достатъчно ротации
            for (let j = i + 1; j < timeSlots.length; j++) {
              const futureSlot = timeSlots[j].time

              // Проверяваме дали слотът е свободен или е почивка
              if (!schedule[futureSlot][dealer.id] || schedule[futureSlot][dealer.id] === "BREAK") {
                // Проверяваме дали няма да създадем последователни почивки
                let wouldCreateConsecutiveBreaks = false
                if (j > 0 && schedule[timeSlots[j - 1].time][dealer.id] === "BREAK") {
                  wouldCreateConsecutiveBreaks = true
                }
                if (j < timeSlots.length - 1 && schedule[timeSlots[j + 1].time][dealer.id] === "BREAK") {
                  wouldCreateConsecutiveBreaks = true
                }

                if (!wouldCreateConsecutiveBreaks) {
                  // Запазваме текущия слот
                  const currentBreakSlot = schedule[currentSlot][dealer.id]

                  // Премахваме почивката от текущия слот
                  delete schedule[currentSlot][dealer.id]

                  // Добавяме почивка в новия слот
                  schedule[futureSlot][dealer.id] = "BREAK"

                  // Обновяваме позициите на почивките
                  const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(i)
                  if (breakPosIndex !== -1) {
                    dealerAssignments[dealer.id].breakPositions[breakPosIndex] = j
                  }

                  console.log(
                    `  Fixed by moving break from ${timeSlots[i].formattedTime} to ${timeSlots[j].formattedTime}`,
                  )
                  break
                }
              }
            }
          }
        }
      }
    }
  }
}
