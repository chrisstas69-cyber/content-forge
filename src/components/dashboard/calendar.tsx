'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

export function Calendar() {
  const [current, setCurrent] = useState(new Date())
  const year = current.getFullYear()
  const month = current.getMonth() + 1
  const monthKey = `${year}-${String(month).padStart(2, '0')}`

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', monthKey],
    queryFn: async () => (await fetch(`/api/calendar?month=${monthKey}`)).json(),
    refetchInterval: 30000,
  })

  const byDate: Record<string, any[]> = data?.byDate || {}
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date().toISOString().split('T')[0]

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-500',
    published: 'bg-emerald-500',
    failed: 'bg-red-500',
    uploading: 'bg-amber-500',
    pending: 'bg-neutral-400',
  }

  function prevMonth() {
    setCurrent(new Date(year, month - 2, 1))
  }
  function nextMonth() {
    setCurrent(new Date(year, month, 1))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Content Calendar</h2>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-medium min-w-[140px] text-center">{monthNames[month - 1]} {year}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-neutral-100 dark:border-neutral-800">
            {dayNames.map(d => (
              <div key={d} className="p-2 text-[10px] font-semibold text-neutral-500 uppercase text-center">{d}</div>
            ))}
          </div>
          {/* Days */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[100px] border-r border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const posts = byDate[dateStr] || []
              const isToday = dateStr === today
              return (
                <div key={day} className={`min-h-[100px] border-r border-b border-neutral-100 dark:border-neutral-800 p-1 ${isToday ? 'bg-orange-50 dark:bg-orange-950/20' : ''}`}>
                  <p className={`text-xs mb-1 ${isToday ? 'font-bold text-orange-600' : 'text-neutral-500'}`}>{day}</p>
                  <div className="space-y-1">
                    {posts.slice(0, 3).map(p => (
                      <div key={p.id} className={`text-[10px] px-1.5 py-0.5 rounded text-white truncate ${statusColors[p.status] || 'bg-neutral-400'}`}>
                        <span className="capitalize">{p.platform}</span> · {p.time}
                      </div>
                    ))}
                    {posts.length > 3 && (
                      <p className="text-[10px] text-neutral-500">+{posts.length - 3} more</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-blue-500" /> Scheduled</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> Published</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-500" /> Failed</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" /> Uploading</span>
      </div>
    </div>
  )
}
