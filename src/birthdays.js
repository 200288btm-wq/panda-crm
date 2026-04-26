import { supabase } from './supabase'

// Telegram bot config — берём из env переменных Vercel
const TG_TOKEN = import.meta.env.VITE_TG_TOKEN
const TG_CHAT_IDS = (import.meta.env.VITE_TG_CHAT_IDS || '').split(',').filter(Boolean)

const sendTelegram = async (text) => {
  if (!TG_TOKEN || !TG_CHAT_IDS.length) return
  for (const chatId of TG_CHAT_IDS) {
    try {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId.trim(), text, parse_mode: 'HTML' }),
      })
    } catch (e) {
      console.error('TG send error:', e)
    }
  }
}

const getAge = (birthday) => {
  const b = new Date(birthday)
  const today = new Date()
  let age = today.getFullYear() - b.getFullYear()
  const m = today.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--
  return age
}

const isBirthdayToday = (birthday) => {
  if (!birthday) return false
  const b = new Date(birthday)
  const today = new Date()
  return b.getMonth() === today.getMonth() && b.getDate() === today.getDate()
}

const isBirthdayTomorrow = (birthday) => {
  if (!birthday) return false
  const b = new Date(birthday)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return b.getMonth() === tomorrow.getMonth() && b.getDate() === tomorrow.getDate()
}

export const checkBirthdays = async () => {
  // Проверяем раз в день — запоминаем дату последней проверки
  const lastCheck = localStorage.getItem('birthday_check_date')
  const today = new Date().toISOString().slice(0, 10)
  if (lastCheck === today) return // уже проверяли сегодня

  const { data: clients } = await supabase
    .from('clients')
    .select('child_name, adult_name, birthday, direction_ids, contacts')
    .not('birthday', 'is', null)
    .in('status', ['Активен', 'Временно отсутствует'])

  if (!clients?.length) return

  const todayBirthdays = clients.filter(c => isBirthdayToday(c.birthday))
  const tomorrowBirthdays = clients.filter(c => isBirthdayTomorrow(c.birthday))

  // 🎂 Сегодня день рождения
  for (const c of todayBirthdays) {
    const age = getAge(c.birthday)
    const msg = [
      `🎂 <b>ДЕНЬ РОЖДЕНИЯ СЕГОДНЯ!</b>`,
      ``,
      `👧 <b>${c.child_name}</b> исполняется <b>${age} ${ageWord(age)}</b>`,
      `👩 Родитель: ${c.adult_name}`,
      c.contacts?.[0] ? `📞 ${c.contacts[0].type}: ${c.contacts[0].val}` : '',
      ``,
      `🎉 Не забудьте поздравить ребёнка на занятии!`,
      `Подготовьте маленький сюрприз — это запомнится 🐾`,
    ].filter(Boolean).join('\n')
    await sendTelegram(msg)
  }

  // 🔔 Завтра день рождения
  for (const c of tomorrowBirthdays) {
    const age = getAge(c.birthday) + 1
    const msg = [
      `🔔 <b>Завтра день рождения!</b>`,
      ``,
      `👧 <b>${c.child_name}</b> завтра исполнится <b>${age} ${ageWord(age)}</b>`,
      `👩 Родитель: ${c.adult_name}`,
      c.contacts?.[0] ? `📞 ${c.contacts[0].type}: ${c.contacts[0].val}` : '',
      ``,
      `🎈 Подготовьте поздравление заранее!`,
      `Можно написать родителю или поздравить на занятии 🐾`,
    ].filter(Boolean).join('\n')
    await sendTelegram(msg)
  }

  // Запоминаем дату проверки
  localStorage.setItem('birthday_check_date', today)
}

const ageWord = (n) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return 'лет'
  if (mod10 === 1) return 'год'
  if (mod10 >= 2 && mod10 <= 4) return 'года'
  return 'лет'
}
