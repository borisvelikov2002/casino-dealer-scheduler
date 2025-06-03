"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { PlusCircle, Calendar } from "lucide-react"
import { format } from "date-fns"
import type { Schedule } from "@/lib/types"

interface SchedulesListProps {
  initialSchedules: Schedule[]
}

export function SchedulesList({ initialSchedules }: SchedulesListProps) {
  const router = useRouter()
  const [schedules] = useState<Schedule[]>(initialSchedules)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Schedules</h1>
        <Button asChild>
          <Link href="/schedules/generate">
            <PlusCircle className="mr-2 h-4 w-4" />
            Generate Schedule
          </Link>
        </Button>
      </div>

      {schedules.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {schedules.map((schedule) => (
            <Card
              key={schedule.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/schedules/${schedule.id}`)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center">
                  <Calendar className="mr-2 h-5 w-5" />
                  {format(new Date(schedule.date), "PPP")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {schedule.shift_type === "day" ? "Day Shift (08:00-20:00)" : "Night Shift (20:00-08:00)"}
                </p>
                <div className="flex justify-end mt-4">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/schedules/${schedule.id}`}>View Details</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              No schedules found. Generate your first schedule to get started.
            </p>
            <Button asChild>
              <Link href="/schedules/generate">
                <PlusCircle className="mr-2 h-4 w-4" />
                Generate Schedule
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
