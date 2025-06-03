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
  const dealerToTableRatio = D / Object.keys(dealerAssignments[eligibleDealers[0].id].assignedTables).length

  // Създаваме проследяване на последователни ротации за всеки дилър
  const consecutiveRotations: Record<string, number> = {}
  eligibleDealers.forEach((dealer) => {
    consecutiveRotations[dealer.id] = 0
  })

  // Създаваме масив от всички времеви слотове
  const allTimeSlots = timeSlots.map((_, index) => index)

  // Първо обработваме предпочитанията за първа и последна почивка
  if (preferences) {
    // Първа почивка
    if (preferences.firstBreakDealers && preferences.firstBreakDealers.length > 0) {
      preferences.firstBreakDealers.forEach((dealerId) => {
        const dealer = eligibleDealers.find((d) => d.id === dealerId)
        if (dealer) {
          const timeSlot = timeSlots[0].time
          schedule[timeSlot][dealerId] = "BREAK"
          dealerAssignments[dealerId].breaks++
          dealerAssignments[dealerId].breakPositions.push(0)
        }
      })
    }

    // Последна почивка
    if (preferences.lastBreakDealers && preferences.lastBreakDealers.length > 0) {
      preferences.lastBreakDealers.forEach((dealerId) => {
        const dealer = eligibleDealers.find((d) => d.id === dealerId)
        if (dealer) {
          const timeSlot = timeSlots[timeSlots.length - 1].time
          schedule[timeSlot][dealerId] = "BREAK"
          dealerAssignments[dealerId].breaks++
          dealerAssignments[dealerId].breakPositions.push(timeSlots.length - 1)
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
    // Колко почивки вече са назначени от предпочитанията
    const existingBreaks = dealerAssignments[dealer.id].breakPositions.length
    const targetBreaks = dealerAssignments[dealer.id].targetBreaks
    const remainingBreaks = targetBreaks - existingBreaks

    if (remainingBreaks <= 0) continue

    // Получаваме всички заети слотове (където вече има почивки)
    const occupiedSlots = new Set<number>()

    // Добавяме всички слотове, където дилърът вече има почивка
    dealerAssignments[dealer.id].breakPositions.forEach((pos) => {
      occupiedSlots.add(pos)
      // Добавяме и съседните слотове, за да избегнем последователни почивки
      occupiedSlots.add(pos - 1)
      occupiedSlots.add(pos + 1)
    })

    // Намираме всички свободни слотове
    const availableSlots = allTimeSlots.filter((slot) => !occupiedSlots.has(slot))

    // Ако няма достатъчно свободни слотове, продължаваме със следващия дилър
    if (availableSlots.length < remainingBreaks) {
      console.warn(
        `Not enough available slots for dealer ${dealer.name}. Need ${remainingBreaks}, have ${availableSlots.length}`,
      )
      continue
    }

    // Определяме минималния брой ротации преди почивка (поне 2-3 маси преди почивка)
    const minRotationsBeforeBreak = 3

    // Определяме оптималния интервал между почивките според съотношението дилъри/маси
    let breakInterval = 0

    if (dealerToTableRatio <= 1.2) {
      // Ако имаме малко дилъри спрямо масите, почивките са по-редки
      breakInterval = Math.floor(R / (remainingBreaks + 1))
    } else if (dealerToTableRatio <= 1.4) {
      // За съотношение около 1.36 (19 дилъри на 14 маси)
      // Целим 3 маси и почивка (интервал от 6-8 слота)
      breakInterval = Math.floor(R / (remainingBreaks + 2))
    } else {
      // За съотношение над 1.4 (20+ дилъри на 14 маси)
      // Целим 2 маси и почивка (интервал от 4-6 слота)
      breakInterval = Math.floor(R / (remainingBreaks + 3))
    }

    // Гарантираме, че интервалът е поне minRotationsBeforeBreak
    breakInterval = Math.max(breakInterval, minRotationsBeforeBreak + 1)

    // Разпределяме почивките равномерно през смяната с оптимален интервал
    const selectedSlots = distributeBreaksEvenly(availableSlots, remainingBreaks, R, breakInterval)

    // Прилагаме почивките към графика
    for (const position of selectedSlots) {
      // Проверяваме колко последователни ротации има преди тази позиция
      let rotationCount = 0
      for (let i = position - 1; i >= 0; i--) {
        const prevSlot = timeSlots[i].time
        const prevAssignment = schedule[prevSlot][dealer.id]

        if (prevAssignment === "BREAK") {
          break // Спираме при предишна почивка
        } else if (prevAssignment && prevAssignment !== "-") {
          rotationCount++
        }
      }

      // Ако имаме твърде малко ротации преди почивка, пропускаме тази позиция
      if (rotationCount > 0 && rotationCount < minRotationsBeforeBreak) {
        console.log(
          `Skipping break position ${position} for dealer ${dealer.name} due to insufficient rotations (${rotationCount})`,
        )
        continue
      }

      const timeSlot = timeSlots[position].time
      schedule[timeSlot][dealer.id] = "BREAK"
      dealerAssignments[dealer.id].breaks++
      dealerAssignments[dealer.id].breakPositions.push(position)
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
