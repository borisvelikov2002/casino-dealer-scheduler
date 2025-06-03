"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Грешка при генериране на график:", error)
  }, [error])

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Грешка при генериране на график</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="mb-6">Нещо се обърка при опита за генериране на график.</p>
          <div className="flex justify-center gap-4">
            <Button onClick={reset} variant="outline">
              Опитай отново
            </Button>
            <Button onClick={() => (window.location.href = "/schedules")}>Върни се към графиците</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
