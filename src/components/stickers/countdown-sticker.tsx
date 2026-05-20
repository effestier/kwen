'use client'

import { useState, useEffect } from 'react'

interface CountdownStickerProps {
  title: string
  endTime: string
  onTitleChange: (t: string) => void
  onEndTimeChange: (t: string) => void
}

export function CountdownSticker({
  title,
  endTime,
  onTitleChange,
  onEndTimeChange,
}: CountdownStickerProps) {
  return (
    <div className="bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl p-4 w-72">
      <p className="text-center text-white/80 text-sm mb-2">Countdown</p>
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="What's the countdown for?"
        className="w-full text-center text-lg font-semibold text-white placeholder:text-white/50 bg-transparent outline-none mb-3"
        maxLength={50}
      />
      <input
        type="datetime-local"
        value={endTime}
        onChange={(e) => onEndTimeChange(e.target.value)}
        className="w-full px-4 py-2 rounded-xl bg-white/20 text-white outline-none focus:bg-white/30"
      />
    </div>
  )
}

// Display version for story viewer
interface CountdownDisplayProps {
  countdown: {
    id: string
    title: string
    end_time: string
  }
}

export function CountdownDisplay({ countdown }: CountdownDisplayProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number
    hours: number
    minutes: number
    seconds: number
    expired: boolean
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: false })

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime()
      const end = new Date(countdown.end_time).getTime()
      const diff = end - now

      if (diff <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
      }

      return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
        expired: false,
      }
    }

    setTimeLeft(calculateTimeLeft())
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft())
    }, 1000)

    return () => clearInterval(timer)
  }, [countdown.end_time])

  if (timeLeft.expired) {
    return (
      <div className="bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl p-4 w-72 text-center">
        <p className="text-white text-lg font-semibold">{countdown.title}</p>
        <p className="text-white/80 text-sm mt-1">Countdown ended</p>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl p-4 w-72">
      <p className="text-center text-white/80 text-sm mb-2">Countdown</p>
      <p className="text-center text-white text-lg font-semibold mb-3">
        {countdown.title}
      </p>

      {/* Time display */}
      <div className="flex justify-center gap-3">
        {timeLeft.days > 0 && (
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{timeLeft.days}</div>
            <div className="text-xs text-white/70">days</div>
          </div>
        )}
        <div className="text-center">
          <div className="text-3xl font-bold text-white">{String(timeLeft.hours).padStart(2, '0')}</div>
          <div className="text-xs text-white/70">hours</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-white">{String(timeLeft.minutes).padStart(2, '0')}</div>
          <div className="text-xs text-white/70">min</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-white">{String(timeLeft.seconds).padStart(2, '0')}</div>
          <div className="text-xs text-white/70">sec</div>
        </div>
      </div>
    </div>
  )
}
