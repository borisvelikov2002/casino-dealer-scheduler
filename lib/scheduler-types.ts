export type ShiftType = "day" | "night"

export interface TimeSlot {
  time: string
  formattedTime: string
}

export interface SchedulePreferences {
  firstBreakDealers?: string[]
  lastBreakDealers?: string[]
}

export interface DealerAssignment {
  rotations: number // Брой работни ротации
  breaks: number // Брой почивки
  lastTable: string // Последната маса, на която е работил дилърът
  lastTableIndex: number // Индекс на последното назначение на маса
  assignedTables: Set<string> // Маси, на които е работил дилърът
  breakPositions: number[] // Позиции на почивките в графика
  needsExtraRotation: boolean // Дали този дилър се нуждае от допълнителна ротация
  targetRotations: number // Целеви брой ротации за този дилър
  targetBreaks: number // Целеви брой почивки за този дилър
}

export interface ScheduleData {
  [timeSlot: string]: {
    [dealerId: string]: string // име на маса или "BREAK"
  }
}

export interface ScheduleParameters {
  R: number // Брой ротации (24)
  T: number // Брой маси
  D: number // Брой дилъри
  totalWorkSlots: number // Общ брой работни слотове
  workSlotsPerDealer: number // Базов брой работни слотове на дилър
  extraWorkSlots: number // Допълнителни работни слотове за разпределение
  breakSlotsPerDealer: number // Базов брой почивки на дилър
}

export interface DealerWithTables {
  id: string
  name: string
  nickname: string
  available_tables: string[]
  created_at: string
}

export interface AbsenceInfo {
  dealerId: string
  startTime: string
  reason: string
}

export type Dealer = {
  id: string
  name: string
  nickname: string
  available_tables: string[]
  created_at: string
}
