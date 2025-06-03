export type Dealer = {
  id: string
  name: string
  nickname: string
  available_tables: string[]
  created_at: string
}

export type CasinoTable = {
  id: string
  name: string
  type: string
  status: "active" | "inactive" | "service"
  created_at: string
}

export type Schedule = {
  id: string
  date: string
  shift_type: "day" | "night"
  schedule_data: ScheduleData
  preferences?: {
    firstBreakDealers?: string[]
    lastBreakDealers?: string[]
  }
  absent_dealers?: {
    dealerId: string
    startTime: string
    reason: string
  }[]
  created_at: string
}

export type ScheduleData = {
  [timeSlot: string]: {
    [dealerId: string]: string // table name or "BREAK"
  }
}

export type TimeSlot = {
  time: string
  formattedTime: string
}

export type ShiftType = "day" | "night"

export type TableType = {
  value: string
  label: string
}

export type TableTypeEntity = {
  id: string
  value: string
  label: string
  created_at: string
}

export type DealerTableTypePermission = {
  id: string
  dealer_id: string
  table_type: string
  created_at: string
}

export type TableStatus = "active" | "inactive" | "service"
