import type { DealerWithTables, ScheduleData, TimeSlot } from "../scheduler-types"

/**
 * Валидира и коригира ротациите в графика
 * Гарантира минимален брой ротации преди почивка
 */
export function validateAndFixRotations(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  console.log("Starting rotation validation and fixing...")

  // Минимален брой ротации преди почивка
  const MIN_ROTATIONS_BEFORE_BREAK = 3

  // Проверяваме всеки дилър за проблеми с ротациите
  for (const dealer of eligibleDealers) {
    // Проследяваме последователни ротации и почивки
    let rotationCount = 0
    let rotationStartIndex = -1
    let rotationTables: string[] = []

    for (let i = 0; i < timeSlots.length; i++) {
      const currentSlot = timeSlots[i].time
      const assignment = schedule[currentSlot][dealer.id]

      if (assignment && assignment !== "BREAK" && assignment !== "-") {
        // Дилърът работи на маса
        if (rotationCount === 0) {
          rotationStartIndex = i
        }
        rotationCount++
        rotationTables.push(assignment)
      } else if (assignment === "BREAK") {
        // Проверяваме дали имаме твърде малко ротации преди почивка
        if (rotationCount > 0 && rotationCount < MIN_ROTATIONS_BEFORE_BREAK) {
          console.log(
            `Dealer ${dealer.name} has only ${rotationCount} rotations before break at ${timeSlots[i].formattedTime}`,
          )

          // Опитваме се да коригираме проблема
          fixInsufficientRotationsBeforeBreak(
            dealer,
            timeSlots,
            schedule,
            dealerAssignments,
            rotationStartIndex,
            i,
            rotationCount,
            rotationTables,
            eligibleDealers,
          )
        }

        // Нулираме брояча на ротации
        rotationCount = 0
        rotationStartIndex = -1
        rotationTables = []
      }
    }
  }

  // Проверяваме дали всички проблеми са коригирани
  const remainingIssues = findRemainingRotationIssues(eligibleDealers, timeSlots, schedule)

  if (remainingIssues.length > 0) {
    console.warn(`Found ${remainingIssues.length} remaining rotation issues that could not be fixed automatically.`)

    // Опитваме се да коригираме оставащите проблеми с по-агресивен подход
    fixRemainingRotationIssuesAggressively(eligibleDealers, timeSlots, schedule, dealerAssignments, remainingIssues)
  } else {
    console.log("All rotation issues have been fixed successfully!")
  }
}

/**
 * Намира оставащите проблеми с ротациите
 */
function findRemainingRotationIssues(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
): Array<{
  dealerId: string
  breakIndex: number
  rotationCount: number
  rotationStartIndex: number
}> {
  const MIN_ROTATIONS_BEFORE_BREAK = 3
  const issues: Array<{
    dealerId: string
    breakIndex: number
    rotationCount: number
    rotationStartIndex: number
  }> = []

  for (const dealer of eligibleDealers) {
    let rotationCount = 0
    let rotationStartIndex = -1

    for (let i = 0; i < timeSlots.length; i++) {
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
          issues.push({
            dealerId: dealer.id,
            breakIndex: i,
            rotationCount,
            rotationStartIndex,
          })
        }

        // Нулираме брояча на ротации
        rotationCount = 0
        rotationStartIndex = -1
      }
    }
  }

  return issues
}

/**
 * Коригира случаи с недостатъчен брой ротации преди почивка
 */
function fixInsufficientRotationsBeforeBreak(
  dealer: DealerWithTables,
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
  rotationStartIndex: number,
  breakIndex: number,
  rotationCount: number,
  rotationTables: string[],
  eligibleDealers: DealerWithTables[],
): void {
  const MIN_ROTATIONS_BEFORE_BREAK = 3
  const currentSlot = timeSlots[breakIndex].time

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
    const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(breakIndex)
    if (breakPosIndex !== -1) {
      dealerAssignments[dealer.id].breakPositions.splice(breakPosIndex, 1)
    }

    console.log(`  Fixed by assigning table ${selectedTable} at ${timeSlots[breakIndex].formattedTime}`)
    return
  }

  // Стратегия 2: Опитваме се да разменим с друг дилър
  const otherDealers = eligibleDealers.filter((d) => {
    if (d.id === dealer.id) return false

    const otherAssignment = schedule[currentSlot][d.id]
    if (!otherAssignment || otherAssignment === "BREAK") return false

    return dealer.available_tables.includes(otherAssignment)
  })

  for (const otherDealer of otherDealers) {
    const tableId = schedule[currentSlot][otherDealer.id]

    // Проверяваме дали размяната би създала проблем за другия дилър
    let wouldCreateProblem = false

    // Проверяваме дали другият дилър има последователни почивки
    if (breakIndex > 0 && schedule[timeSlots[breakIndex - 1].time][otherDealer.id] === "BREAK") {
      wouldCreateProblem = true
    }
    if (breakIndex < timeSlots.length - 1 && schedule[timeSlots[breakIndex + 1].time][otherDealer.id] === "BREAK") {
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

      console.log(`  Fixed by swapping with dealer ${otherDealer.name} at ${timeSlots[breakIndex].formattedTime}`)
      return
    }
  }

  // Стратегия 3: Опитваме се да преместим почивката по-напред
  // Търсим подходящ слот за почивка след достатъчно ротации
  for (let i = breakIndex + 1; i < timeSlots.length; i++) {
    const futureSlot = timeSlots[i].time

    // Проверяваме дали слотът е свободен или е почивка
    if (!schedule[futureSlot][dealer.id] || schedule[futureSlot][dealer.id] === "BREAK") {
      // Проверяваме дали няма да създадем последователни почивки
      let wouldCreateConsecutiveBreaks = false
      if (i > 0 && schedule[timeSlots[i - 1].time][dealer.id] === "BREAK") {
        wouldCreateConsecutiveBreaks = true
      }
      if (i < timeSlots.length - 1 && schedule[timeSlots[i + 1].time][dealer.id] === "BREAK") {
        wouldCreateConsecutiveBreaks = true
      }

      if (!wouldCreateConsecutiveBreaks) {
        // Запазваме текущия слот
        const currentBreakSlot = schedule[currentSlot][dealer.id]

        // Премахваме почивката от текущия слот
        schedule[currentSlot][dealer.id] = null

        // Добавяме почивка в новия слот
        schedule[futureSlot][dealer.id] = "BREAK"

        // Обновяваме позициите на почивките
        const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(breakIndex)
        if (breakPosIndex !== -1) {
          dealerAssignments[dealer.id].breakPositions[breakPosIndex] = i
        }

        console.log(
          `  Fixed by moving break from ${timeSlots[breakIndex].formattedTime} to ${timeSlots[i].formattedTime}`,
        )
        return
      }
    }
  }

  console.log(`  Could not fix insufficient rotations before break at ${timeSlots[breakIndex].formattedTime}`)
}

/**
 * Коригира оставащите проблеми с ротациите с агресивен подход
 */
function fixRemainingRotationIssuesAggressively(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
  issues: Array<{
    dealerId: string
    breakIndex: number
    rotationCount: number
    rotationStartIndex: number
  }>,
): void {
  console.log("Applying aggressive fixing for remaining rotation issues...")

  for (const issue of issues) {
    const dealer = eligibleDealers.find((d) => d.id === issue.dealerId)
    if (!dealer) continue

    const breakIndex = issue.breakIndex
    const currentSlot = timeSlots[breakIndex].time

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

          dealerAssignments[otherDealer.id].rotations--
          dealerAssignments[otherDealer.id].breaks++

          // Премахваме от позициите на почивките
          const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(breakIndex)
          if (breakPosIndex !== -1) {
            dealerAssignments[dealer.id].breakPositions.splice(breakPosIndex, 1)
          }

          // Добавяме към позициите на почивките на другия дилър
          dealerAssignments[otherDealer.id].breakPositions.push(breakIndex)

          console.log(
            `  Aggressively fixed insufficient rotations for ${dealer.name} by forcing swap with ${otherDealer.name}`,
          )
        }
      } else {
        // Масата е свободна, просто я назначаваме
        schedule[currentSlot][dealer.id] = randomTable

        // Обновяваме проследяването
        dealerAssignments[dealer.id].rotations++
        dealerAssignments[dealer.id].breaks--
        dealerAssignments[dealer.id].assignedTables.add(randomTable)

        // Премахваме от позициите на почивките
        const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(breakIndex)
        if (breakPosIndex !== -1) {
          dealerAssignments[dealer.id].breakPositions.splice(breakPosIndex, 1)
        }

        console.log(`  Aggressively fixed insufficient rotations for ${dealer.name} by assigning table ${randomTable}`)
      }
    }
  }
}
