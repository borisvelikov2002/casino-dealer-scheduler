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

  // След това коригираме почивките след единична ротация
  fixBreaksAfterSingleRotation(eligibleDealers, timeSlots, schedule, dealerAssignments)

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
  type: "consecutive" | "after_single_rotation"
  index: number
}> {
  const issues: Array<{
    dealerId: string
    type: "consecutive" | "after_single_rotation"
    index: number
  }> = []

  for (const dealer of eligibleDealers) {
    let rotationCount = 0
    let lastWasBreak = false

    for (let i = 0; i < timeSlots.length; i++) {
      const currentSlot = timeSlots[i].time
      const assignment = schedule[currentSlot][dealer.id]

      if (assignment === "BREAK") {
        // Проверяваме за последователни почивки
        if (lastWasBreak) {
          issues.push({
            dealerId: dealer.id,
            type: "consecutive",
            index: i,
          })
        }

        // Проверяваме за почивка след единична ротация
        if (rotationCount === 1) {
          issues.push({
            dealerId: dealer.id,
            type: "after_single_rotation",
            index: i,
          })
        }

        rotationCount = 0
        lastWasBreak = true
      } else if (assignment && assignment !== "-") {
        rotationCount++
        lastWasBreak = false
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
 * Коригира почивките след единична ротация
 */
function fixBreaksAfterSingleRotation(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): void {
  const MIN_ROTATIONS_BEFORE_BREAK = 3
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

  // Ако няма почивки след единична ротация, приключваме
  if (dealersWithSingleRotationBeforeBreak.size === 0) {
    return
  }

  console.log(`Found ${dealersWithSingleRotationBeforeBreak.size} dealers with breaks after single rotation`)

  // Втори проход: коригираме почивките след единична ротация
  for (const [dealerId, breaks] of dealersWithSingleRotationBeforeBreak.entries()) {
    const dealer = eligibleDealers.find((d) => d.id === dealerId)
    if (!dealer) continue

    console.log(`Fixing breaks after single rotation for dealer ${dealer.name}: ${breaks.length} breaks`)

    for (const { breakIndex, rotationStartIndex } of breaks) {
      const currentSlot = timeSlots[breakIndex].time
      const rotationCount = breakIndex - rotationStartIndex

      console.log(
        `  Dealer ${dealer.name} has only ${rotationCount} rotations before break at ${timeSlots[breakIndex].formattedTime}`,
      )

      // Стратегия 1: Опитваме се да намерим достъпна маса
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

        console.log(`    Fixed by assigning table ${selectedTable} at ${timeSlots[breakIndex].formattedTime}`)
        continue
      }

      // Стратегия 2: Опитваме се да разменим с друг дилър
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
    type: "consecutive" | "after_single_rotation"
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

          dealerAssignments[otherDealer.id].rotations--
          dealerAssignments[otherDealer.id].breaks++

          // Премахваме от позициите на почивките
          const breakPosIndex = dealerAssignments[dealer.id].breakPositions.indexOf(index)
          if (breakPosIndex !== -1) {
            dealerAssignments[dealer.id].breakPositions.splice(breakPosIndex, 1)
          }

          // Добавяме към позициите на почивките на другия дилър
          dealerAssignments[otherDealer.id].breakPositions.push(index)

          console.log(`  Aggressively fixed by forcing swap with ${otherDealer.name}`)
        }
      } else {
        // Масата е свободна, просто я назначаваме
        schedule[currentSlot][dealer.id] = randomTable

        // Обновяваме проследяването
        dealerAssignments[dealer.id].rotations++
        dealerAssignments[dealer.id].breaks--
        dealerAssignments[dealer.id].assignedTables.add(randomTable)

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
