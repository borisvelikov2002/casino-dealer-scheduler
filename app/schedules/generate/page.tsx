"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { format } from "date-fns"
import { toast } from "sonner"
import { generateSchedule } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Search, CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { Dealer } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"

export default function GenerateSchedulePage() {
  const router = useRouter()
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [selectedDealers, setSelectedDealers] = useState<string[]>([])
  const [firstBreakDealers, setFirstBreakDealers] = useState<string[]>([])
  const [lastBreakDealers, setLastBreakDealers] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [date, setDate] = useState<Date>(new Date())
  const [shiftType, setShiftType] = useState<"day" | "night">("day")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState("dealers")
  const [calendarOpen, setCalendarOpen] = useState(false)

  useEffect(() => {
    const fetchDealers = async () => {
      try {
        const { data, error } = await supabase.from("dealers").select("*").order("name")

        if (error) throw error

        setDealers(data || [])
      } catch (error: any) {
        console.error("Error fetching dealers:", error)
        toast.error(`Error fetching dealers: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDealers()
  }, [])

  const filteredDealers = dealers.filter(
    (dealer) =>
      dealer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (dealer.nickname && dealer.nickname.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  const handleSelectAll = () => {
    if (selectedDealers.length === filteredDealers.length) {
      setSelectedDealers([])
    } else {
      setSelectedDealers(filteredDealers.map((dealer) => dealer.id))
    }
  }

  const handleDealerSelect = (dealerId: string, checked: boolean) => {
    if (checked) {
      setSelectedDealers([...selectedDealers, dealerId])
    } else {
      setSelectedDealers(selectedDealers.filter((id) => id !== dealerId))
      // Също премахваме дилъра от преференциите, ако е бил избран там
      setFirstBreakDealers(firstBreakDealers.filter((id) => id !== dealerId))
      setLastBreakDealers(lastBreakDealers.filter((id) => id !== dealerId))
    }
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

  const handleDateSelect = (newDate: Date | undefined) => {
    if (newDate) {
      setDate(newDate)
      setCalendarOpen(false)
    }
  }

  const handleGenerate = async () => {
    if (selectedDealers.length === 0) {
      toast.error("Please select at least one dealer")
      return
    }

    setIsSubmitting(true)

    try {
      // Get selected dealers
      const selectedDealersData = dealers.filter((dealer) => selectedDealers.includes(dealer.id))

      // Generate the schedule with preferences
      const scheduleData = await generateSchedule(selectedDealersData, shiftType, supabase, {
        firstBreakDealers,
        lastBreakDealers,
      })

      // Запазваме предпочитанията в schedule_data вместо в отделна колона
      // Добавяме ги като специален ключ в обекта
      scheduleData._preferences = {
        firstBreakDealers,
        lastBreakDealers,
      }

      // Save to database
      const { data, error } = await supabase
        .from("schedules")
        .insert([
          {
            date: format(date, "yyyy-MM-dd"),
            shift_type: shiftType,
            schedule_data: scheduleData,
            // Премахваме preferences полето
          },
        ])
        .select()

      if (error) throw error

      toast.success("Schedule generated successfully")

      // Navigate to the newly created schedule if available
      if (data && data.length > 0) {
        router.push(`/schedules/${data[0].id}`)
      } else {
        router.push("/schedules")
      }
    } catch (error: any) {
      console.error("Error generating schedule:", error)
      toast.error(`Error generating schedule: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Loading dealers...</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Generate New Schedule</CardTitle>
          <CardDescription>Select date, shift type, and dealers for the new schedule</CardDescription>
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
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(newDate) => newDate && setDate(newDate)}
                    initialFocus
                  />
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

          <div className="space-y-2">
            <Label htmlFor="search">Search Dealers</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search by name or nickname..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dealers">Select Dealers</TabsTrigger>
              <TabsTrigger value="firstBreak">First Break</TabsTrigger>
              <TabsTrigger value="lastBreak">Last Break</TabsTrigger>
            </TabsList>

            <TabsContent value="dealers" className="mt-4">
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="select-all"
                      checked={selectedDealers.length > 0 && selectedDealers.length === filteredDealers.length}
                      onCheckedChange={handleSelectAll}
                    />
                    <Label htmlFor="select-all" className="font-medium">
                      Select All Dealers
                    </Label>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedDealers.length} of {filteredDealers.length} selected
                  </div>
                </div>

                <div className="p-3 max-h-[300px] overflow-y-auto">
                  {filteredDealers.length > 0 ? (
                    <div className="space-y-2">
                      {filteredDealers.map((dealer) => (
                        <div key={dealer.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded-md">
                          <Checkbox
                            id={`dealer-${dealer.id}`}
                            checked={selectedDealers.includes(dealer.id)}
                            onCheckedChange={(checked) => handleDealerSelect(dealer.id, checked === true)}
                          />
                          <Label htmlFor={`dealer-${dealer.id}`} className="flex-1 cursor-pointer">
                            {dealer.name}{" "}
                            {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                          </Label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">No dealers found</div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="firstBreak" className="mt-4">
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">Select Dealers for First Break</h3>
                  <p className="text-sm text-muted-foreground">These dealers will get their break early in the shift</p>
                </div>

                <div className="p-3 max-h-[300px] overflow-y-auto">
                  {dealers.length > 0 ? (
                    <div className="space-y-2">
                      {dealers.map((dealer) => (
                        <div key={dealer.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded-md">
                          <Checkbox
                            id={`first-break-${dealer.id}`}
                            checked={firstBreakDealers.includes(dealer.id)}
                            disabled={!selectedDealers.includes(dealer.id)}
                            onCheckedChange={(checked) => handleFirstBreakSelect(dealer.id, checked === true)}
                          />
                          <Label
                            htmlFor={`first-break-${dealer.id}`}
                            className={cn(
                              "flex-1 cursor-pointer",
                              !selectedDealers.includes(dealer.id) && "text-muted-foreground line-through",
                            )}
                          >
                            {dealer.name}{" "}
                            {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                            {!selectedDealers.includes(dealer.id) && " (not in schedule)"}
                          </Label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">No dealers found</div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="lastBreak" className="mt-4">
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">Select Dealers for Last Break</h3>
                  <p className="text-sm text-muted-foreground">These dealers will get their break late in the shift</p>
                </div>

                <div className="p-3 max-h-[300px] overflow-y-auto">
                  {dealers.length > 0 ? (
                    <div className="space-y-2">
                      {dealers.map((dealer) => (
                        <div key={dealer.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded-md">
                          <Checkbox
                            id={`last-break-${dealer.id}`}
                            checked={lastBreakDealers.includes(dealer.id)}
                            disabled={!selectedDealers.includes(dealer.id)}
                            onCheckedChange={(checked) => handleLastBreakSelect(dealer.id, checked === true)}
                          />
                          <Label
                            htmlFor={`last-break-${dealer.id}`}
                            className={cn(
                              "flex-1 cursor-pointer",
                              !selectedDealers.includes(dealer.id) && "text-muted-foreground line-through",
                            )}
                          >
                            {dealer.name}{" "}
                            {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                            {!selectedDealers.includes(dealer.id) && " (not in schedule)"}
                          </Label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">No dealers found</div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button onClick={handleGenerate} disabled={isSubmitting || selectedDealers.length === 0} size="lg">
              {isSubmitting ? "Generating..." : "Generate Schedule"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
