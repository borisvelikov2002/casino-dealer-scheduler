"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { format, parse } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, RefreshCw } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { generateTimeSlots, cn } from "@/lib/utils"
import type { Dealer, Schedule, CasinoTable } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"
import { generateSchedule } from "@/lib/schedule-generator"
import { handleDealerLeaving } from "@/lib/utils"

type AbsenceReason = "sick" | "injured" | "unauthorized" | "voluntary" | "break"

interface AbsenceFormData {
  dealerId: string
  startTime: string
  reason: AbsenceReason
}

interface ScheduleTableProps {
  schedule: Schedule | null
  dealers: Dealer[]
}

function ScheduleTableComponent({ schedule, dealers }: ScheduleTableProps) {
  if (!schedule || !schedule.schedule_data) {
    return <p>No schedule data available.</p>
  }

  const timeSlots = generateTimeSlots(schedule.shift_type)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-muted">
            <th className="border p-2 text-left">Dealer</th>
            {timeSlots.map((slot) => (
              <th key={slot.time} className="border p-2 text-center">
                {slot.formattedTime}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dealers.map((dealer) => (
            <tr key={dealer.id} className="hover:bg-muted/50">
              <td className="border p-2 font-medium">{dealer.nickname || dealer.name}</td>
              {timeSlots.map((slot) => {
                const assignment = schedule.schedule_data[slot.time]?.[dealer.id] || "-"
                const isBreak = assignment === "BREAK"
                let cellClass = "border p-2 text-center"

                if (isBreak) {
                  cellClass += " bg-yellow-100 text-yellow-800"
                } else if (assignment.startsWith("BJ")) {
                  cellClass += " bg-blue-100 text-blue-800"
                } else if (assignment.startsWith("ROU")) {
                  cellClass += " bg-green-100 text-green-800"
                }

                return (
                  <td key={`${dealer.id}-${slot.time}`} className={cellClass}>
                    {assignment}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function EditSchedulePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [tables, setTables] = useState<CasinoTable[]>([])
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [shiftType, setShiftType] = useState<"day" | "night">("day")
  const [scheduleData, setScheduleData] = useState<{ [timeSlot: string]: { [dealerId: string]: string } }>({})
  const [firstBreakDealers, setFirstBreakDealers] = useState<string[]>([])
  const [lastBreakDealers, setLastBreakDealers] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState("schedule")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Состояние для формы отсутствий
  const [absenceForm, setAbsenceForm] = useState<AbsenceFormData>({
    dealerId: "",
    startTime: "",
    reason: "sick",
  })

  // Состояние для отсутствующих дилеров
  const [absentDealers, setAbsentDealers] = useState<
    {
      dealerId: string
      startTime: string
      reason: AbsenceReason
    }[]
  >([])

  // Добавьте новые state переменные в начале компонента
  const [isPreviewingAbsence, setIsPreviewingAbsence] = useState(false)
  const [previewData, setPreviewData] = useState<{
    dealerId: string
    startTime: string
    reason: AbsenceReason
    scheduleData: { [timeSlot: string]: { [dealerId: string]: string } }
  } | null>(null)

  // Меняем способ извлечения предпочтений при загрузке графика

  // В useEffect функции, где загружаем данные:
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch schedule data
        const { data: scheduleData, error: scheduleError } = await supabase
          .from("schedules")
          .select("*")
          .eq("id", params.id)
          .single()

        if (scheduleError) throw scheduleError

        // Fetch dealers data
        const { data: dealersData, error: dealersError } = await supabase.from("dealers").select("*").order("name")

        if (dealersError) throw dealersError

        // Fetch tables data
        const { data: tablesData, error: tablesError } = await supabase.from("casino_tables").select("*").order("name")

        if (tablesError) throw tablesError

        // Parse the date
        const parsedDate = parse(scheduleData.date, "yyyy-MM-dd", new Date())

        // Extract preferences from schedule_data instead of separate column
        const preferences = scheduleData.schedule_data._preferences || { firstBreakDealers: [], lastBreakDealers: [] }

        setSchedule(scheduleData as Schedule)
        setDealers(dealersData || [])
        setTables(tablesData || [])
        setDate(parsedDate)
        setShiftType(scheduleData.shift_type)
        setScheduleData(scheduleData.schedule_data)
        setFirstBreakDealers(preferences.firstBreakDealers || [])
        setLastBreakDealers(preferences.lastBreakDealers || [])

        // Извлекаем информацию об отсутствующих дилерах, если она есть
        if (scheduleData.absent_dealers) {
          setAbsentDealers(scheduleData.absent_dealers)
        }
      } catch (error: any) {
        console.error("Error fetching schedule:", error)
        toast.error(`Error fetching schedule: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [params.id])

  const handleAssignmentChange = (timeSlot: string, dealerId: string, value: string) => {
    setScheduleData((prev) => {
      const newData = { ...prev }
      if (!newData[timeSlot]) {
        newData[timeSlot] = {}
      }
      newData[timeSlot][dealerId] = value
      return newData
    })
  }

  const handleFirstBreakSelect = (dealerId: string, checked: boolean) => {
    if (checked) {
      setFirstBreakDealers([...firstBreakDealers, dealerId])
      // Премахваме от последна почивка, ако е бил там
      setLastBreakDealers(lastBreakDealers.filter((id) => id !== dealerId))
    } else {
      setFirstBreakDealers(firstBreakDealers.filter((id) => id !== dealerId))
    }
  }

  const handleLastBreakSelect = (dealerId: string, checked: boolean) => {
    if (checked) {
      setLastBreakDealers([...lastBreakDealers, dealerId])
      // Премахваме от първа почивка, ако е бил там
      setFirstBreakDealers(firstBreakDealers.filter((id) => id !== dealerId))
    } else {
      setLastBreakDealers(lastBreakDealers.filter((id) => id !== dealerId))
    }
  }

  // Променяме функцията handleSubmit, за да запазва предпочитанията в schedule_data
  const handleSubmit = async () => {
    if (!date) {
      toast.error("Please select a date")
      return
    }

    setIsSubmitting(true)

    try {
      // Добавяме предпочитанията в schedule_data
      const updatedScheduleData = { ...scheduleData }
      updatedScheduleData._preferences = {
        firstBreakDealers,
        lastBreakDealers,
      }

      const { error } = await supabase
        .from("schedules")
        .update({
          date: format(date, "yyyy-MM-dd"),
          shift_type: shiftType,
          schedule_data: updatedScheduleData,
          // Премахваме preferences полето
          absent_dealers: absentDealers,
        })
        .eq("id", params.id)

      if (error) throw error

      toast.success("Schedule updated successfully")
      router.push(`/schedules/${params.id}`)
    } catch (error: any) {
      toast.error(`Error updating schedule: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Намерете функцията handleMarkAbsent и я заменете със следното:

  const handleMarkAbsent = async () => {
    const { dealerId, startTime, reason } = absenceForm

    if (!dealerId || !startTime) {
      toast.error("Please select a dealer and start time")
      return
    }

    // Показваме потвърждение с предварителен преглед
    setIsPreviewingAbsence(true)

    try {
      // Създаваме копие на текущия график за предварителен преглед
      const previewScheduleData = await handleDealerLeaving(
        scheduleData,
        dealerId,
        startTime,
        dealers,
        shiftType,
        supabase,
      )

      // Запазваме предварителния преглед
      setPreviewData({
        dealerId,
        startTime,
        reason,
        scheduleData: previewScheduleData,
      })
    } catch (error: any) {
      console.error("Error generating preview:", error)
      toast.error(`Error generating preview: ${error.message}`)
      setIsPreviewingAbsence(false)
    }
  }

  // Добавете нова функция за потвърждаване на промените след предварителния преглед
  const confirmAbsence = () => {
    if (!previewData) return

    // Добавяме дилъра към списъка с отсъстващи
    setAbsentDealers([
      ...absentDealers,
      {
        dealerId: previewData.dealerId,
        startTime: previewData.startTime,
        reason: previewData.reason,
      },
    ])

    // Прилагаме промените към графика
    setScheduleData(previewData.scheduleData)

    // Нулираме формата и предварителния преглед
    setAbsenceForm({
      dealerId: "",
      startTime: "",
      reason: "sick",
    })

    setPreviewData(null)
    setIsPreviewingAbsence(false)

    toast.success("Dealer marked as absent and schedule updated")
  }

  // Добавете функция за отказ от промените
  const cancelAbsence = () => {
    setPreviewData(null)
    setIsPreviewingAbsence(false)
  }

  // Функция за премахване на дилър от списъка с отсъстващи
  const handleRemoveAbsent = (index: number) => {
    const newAbsentDealers = [...absentDealers]
    newAbsentDealers.splice(index, 1)
    setAbsentDealers(newAbsentDealers)

    toast.success("Dealer removed from absent list")
  }

  // Функция за автоматично преразпределяне на масите след маркиране на дилър като отсъстващ
  const handleRegenerateSchedule = async () => {
    if (!schedule) return

    setIsRegenerating(true)

    try {
      // Получаваме всички дилъри, които не са отсъстващи
      const activeDealers = dealers.filter((dealer) => !absentDealers.some((absent) => absent.dealerId === dealer.id))

      // Ако няма активни дилъри, прекратяваме
      if (activeDealers.length === 0) {
        toast.error("Няма активни дилъри за генериране на график")
        return
      }

      // Създаваме нов график с текущите предпочитания
      const newScheduleData = await generateSchedule(activeDealers, shiftType, supabase, {
        firstBreakDealers,
        lastBreakDealers,
      })

      // Запазваме предпочитанията в schedule_data
      newScheduleData._preferences = {
        firstBreakDealers,
        lastBreakDealers,
      }

      // За всеки отсъстващ дилър, маркираме го като BREAK за всички часове след началото на отсъствието
      for (const absent of absentDealers) {
        const startTimeIndex = timeSlots.findIndex((slot) => slot.time === absent.startTime)

        if (startTimeIndex === -1) continue

        // За всички часове след началния час
        for (let i = startTimeIndex; i < timeSlots.length; i++) {
          const currentSlot = timeSlots[i].time

          if (!newScheduleData[currentSlot]) {
            newScheduleData[currentSlot] = {}
          }

          newScheduleData[currentSlot][absent.dealerId] = "BREAK"
        }
      }

      // Актуализираме графика
      setScheduleData(newScheduleData)

      toast.success("График регенериран успешно")
    } catch (error: any) {
      console.error("Error regenerating schedule:", error)
      toast.error(`Грешка при регенериране на графика: ${error.message}`)
    } finally {
      setIsRegenerating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Loading schedule...</p>
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Schedule not found</p>
      </div>
    )
  }

  const timeSlots = generateTimeSlots(shiftType)

  // Създаваме уникални опции за масите, като добавяме уникален идентификатор към всяка маса
  const tableOptions = [
    { id: "break", value: "BREAK", label: "BREAK" },
    ...tables.map((table) => ({ id: table.id, value: table.name, label: table.name })),
  ]

  // Филтрираме дилърите, които са включени в графика
  const dealersInSchedule = dealers.filter((dealer) => {
    return Object.values(scheduleData).some((timeSlot) => Object.keys(timeSlot).includes(dealer.id))
  })

  // Функция за получаване на името на причината за отсъствие
  const getAbsenceReasonLabel = (reason: AbsenceReason): string => {
    const reasonLabels: Record<AbsenceReason, string> = {
      sick: "Болест",
      injured: "Пострадал",
      unauthorized: "Своеволен",
      voluntary: "Тръгнал си доброволно",
      break: "Освободен за почивка",
    }

    return reasonLabels[reason] || reason
  }

  // Функция за определяне на цвета на клетката според типа на масата
  const getCellClass = (assignment: string) => {
    const isBreak = assignment === "BREAK"
    let cellClass = "border p-2 text-center"

    if (isBreak) {
      cellClass += " bg-yellow-100 text-yellow-800"
    } else if (assignment.startsWith("BJ")) {
      cellClass += " bg-blue-100 text-blue-800"
    } else if (assignment.startsWith("ROU")) {
      cellClass += " bg-green-100 text-green-800"
    }

    return cellClass
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Edit Schedule</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schedule Settings</CardTitle>
          <CardDescription>Update the schedule date and shift type</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : "Select a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Shift Type</Label>
              <RadioGroup value={shiftType} onValueChange={(value) => setShiftType(value as "day" | "night")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="day" id="day" />
                  <Label htmlFor="day">Day Shift (08:00-20:00)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="night" id="night" />
                  <Label htmlFor="night">Night Shift (20:00-08:00)</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="firstBreak">First Break</TabsTrigger>
          <TabsTrigger value="lastBreak">Last Break</TabsTrigger>
          <TabsTrigger value="absent">Absent Dealers</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Schedule Assignments</CardTitle>
              <CardDescription>Edit dealer assignments for each time slot</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-2 text-left">Dealer</th>
                      {timeSlots.map((slot) => (
                        <th key={slot.time} className="border p-2 text-center">
                          {slot.formattedTime}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dealersInSchedule.map((dealer) => (
                      <tr key={dealer.id} className="hover:bg-muted/50">
                        <td className="border p-2 font-medium">{dealer.nickname || dealer.name}</td>
                        {timeSlots.map((slot) => {
                          const assignment = scheduleData[slot.time]?.[dealer.id] || "-"
                          const isBreak = assignment === "BREAK"

                          return (
                            <td key={`${dealer.id}-${slot.time}`} className={getCellClass(assignment)}>
                              <Select
                                value={assignment}
                                onValueChange={(value) => handleAssignmentChange(slot.time, dealer.id, value)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="Select table">
                                    {assignment === "BREAK" ? "BREAK" : assignment}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="-">-</SelectItem>
                                  <SelectItem value="BREAK">BREAK</SelectItem>
                                  {tableOptions
                                    .filter((option) => option.value !== "BREAK")
                                    .map((option) => (
                                      <SelectItem key={`${option.id}-${option.value}`} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="firstBreak" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>First Break Preferences</CardTitle>
              <CardDescription>Select dealers who should have their break early in the shift</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">Select Dealers for First Break</h3>
                  <p className="text-sm text-muted-foreground">These dealers will get their break early in the shift</p>
                </div>

                <div className="p-3 max-h-[300px] overflow-y-auto">
                  {dealers.length > 0 ? (
                    <div className="space-y-2">
                      {dealers.map((dealer) => {
                        // Проверяваме дали дилърът има поне едно назначение в графика
                        const isInSchedule = Object.values(scheduleData).some((timeSlot) =>
                          Object.keys(timeSlot).includes(dealer.id),
                        )

                        return (
                          <div key={dealer.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded-md">
                            <Checkbox
                              id={`first-break-${dealer.id}`}
                              checked={firstBreakDealers.includes(dealer.id)}
                              disabled={!isInSchedule}
                              onCheckedChange={(checked) => handleFirstBreakSelect(dealer.id, checked === true)}
                            />
                            <Label
                              htmlFor={`first-break-${dealer.id}`}
                              className={cn(
                                "flex-1 cursor-pointer",
                                !isInSchedule && "text-muted-foreground line-through",
                              )}
                            >
                              {dealer.name}{" "}
                              {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                              {!isInSchedule && " (not in schedule)"}
                            </Label>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">No dealers found</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lastBreak" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Last Break Preferences</CardTitle>
              <CardDescription>Select dealers who should have their break late in the shift</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">Select Dealers for Last Break</h3>
                  <p className="text-sm text-muted-foreground">These dealers will get their break late in the shift</p>
                </div>

                <div className="p-3 max-h-[300px] overflow-y-auto">
                  {dealers.length > 0 ? (
                    <div className="space-y-2">
                      {dealers.map((dealer) => {
                        // Проверяваме дали дилърът има поне едно назначение в графика
                        const isInSchedule = Object.values(scheduleData).some((timeSlot) =>
                          Object.keys(timeSlot).includes(dealer.id),
                        )

                        return (
                          <div key={dealer.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded-md">
                            <Checkbox
                              id={`last-break-${dealer.id}`}
                              checked={lastBreakDealers.includes(dealer.id)}
                              disabled={!isInSchedule}
                              onCheckedChange={(checked) => handleLastBreakSelect(dealer.id, checked === true)}
                            />
                            <Label
                              htmlFor={`last-break-${dealer.id}`}
                              className={cn(
                                "flex-1 cursor-pointer",
                                !isInSchedule && "text-muted-foreground line-through",
                              )}
                            >
                              {dealer.name}{" "}
                              {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                              {!isInSchedule && " (not in schedule)"}
                            </Label>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">No dealers found</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="absent" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Absent Dealers</CardTitle>
              <CardDescription>Mark dealers as absent from a specific time</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="dealer">Dealer</Label>
                  <Select
                    value={absenceForm.dealerId}
                    onValueChange={(value) => setAbsenceForm({ ...absenceForm, dealerId: value })}
                  >
                    <SelectTrigger id="dealer">
                      <SelectValue placeholder="Select dealer" />
                    </SelectTrigger>
                    <SelectContent>
                      {dealersInSchedule.map((dealer) => (
                        <SelectItem key={dealer.id} value={dealer.id}>
                          {dealer.name} {dealer.nickname && `(${dealer.nickname})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startTime">Start Time</Label>
                  <Select
                    value={absenceForm.startTime}
                    onValueChange={(value) => setAbsenceForm({ ...absenceForm, startTime: value })}
                  >
                    <SelectTrigger id="startTime">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((slot) => (
                        <SelectItem key={slot.time} value={slot.time}>
                          {slot.formattedTime}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Select
                    value={absenceForm.reason}
                    onValueChange={(value) => setAbsenceForm({ ...absenceForm, reason: value as AbsenceReason })}
                  >
                    <SelectTrigger id="reason">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sick">Болест</SelectItem>
                      <SelectItem value="injured">Пострадал</SelectItem>
                      <SelectItem value="unauthorized">Своеволен</SelectItem>
                      <SelectItem value="voluntary">Тръгнал си доброволно</SelectItem>
                      <SelectItem value="break">Освободен за почивка</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={handleMarkAbsent}
                  disabled={!absenceForm.dealerId || !absenceForm.startTime}
                >
                  Mark as Absent
                </Button>
                <Button onClick={handleRegenerateSchedule} disabled={absentDealers.length === 0 || isRegenerating}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {isRegenerating ? "Regenerating..." : "Regenerate Schedule"}
                </Button>
              </div>

              {isPreviewingAbsence && previewData && (
                <div className="mt-6 border rounded-md p-4 bg-muted/20">
                  <h3 className="text-lg font-medium mb-4">Preview of Schedule Changes</h3>
                  <p className="mb-4">
                    <strong>Dealer:</strong> {dealers.find((d) => d.id === previewData.dealerId)?.name || "Unknown"}{" "}
                    will be marked as absent from{" "}
                    {timeSlots.find((t) => t.time === previewData.startTime)?.formattedTime || previewData.startTime}{" "}
                    due to {getAbsenceReasonLabel(previewData.reason)}.
                  </p>

                  <div className="max-h-[400px] overflow-auto mb-4">
                    <ScheduleTableComponent
                      schedule={{ ...schedule, schedule_data: previewData.scheduleData }}
                      dealers={dealers}
                    />
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={cancelAbsence}>
                      Cancel
                    </Button>
                    <Button onClick={confirmAbsence}>Confirm Changes</Button>
                  </div>
                </div>
              )}

              {absentDealers.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-2">Absent Dealers List</h3>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Dealer</th>
                          <th className="p-2 text-left">From Time</th>
                          <th className="p-2 text-left">Reason</th>
                          <th className="p-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absentDealers.map((absent, index) => {
                          const dealer = dealers.find((d) => d.id === absent.dealerId)
                          const timeSlot = timeSlots.find((t) => t.time === absent.startTime)

                          return (
                            <tr key={index} className="border-t">
                              <td className="p-2">{dealer ? dealer.nickname || dealer.name : "Unknown"}</td>
                              <td className="p-2">{timeSlot ? timeSlot.formattedTime : absent.startTime}</td>
                              <td className="p-2">{getAbsenceReasonLabel(absent.reason)}</td>
                              <td className="p-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveAbsent(index)}
                                  className="h-8 px-2 text-destructive hover:text-destructive"
                                >
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end space-x-2 mt-6">
        <Button variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
