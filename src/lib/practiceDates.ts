export const isSunday = (date: Date) => date.getDay() === 0

export const formatSvDate = (date: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

export const toDateOnly = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const getNextPracticeDate = (from: Date): Date => {
  const day = from.getDay()
  const practiceDays = [6, 0]

  for (const targetDay of practiceDays) {
    if (day === targetDay) {
      return from
    }
    if (day < targetDay) {
      const next = new Date(from)
      next.setDate(from.getDate() + (targetDay - day))
      return next
    }
  }

  const nextSaturday = new Date(from)
  nextSaturday.setDate(from.getDate() + ((6 - day + 7) % 7))
  return nextSaturday
}
