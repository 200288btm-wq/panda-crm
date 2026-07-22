import { createClient } from '@supabase/supabase-js'

// В продакшене используем прокси через nginx на Amvera
// чтобы обойти блокировку supabase.co в России
const isProduction = window.location.hostname !== 'localhost' &&
                     !window.location.hostname.includes('vercel.app')

const SUPABASE_URL = isProduction
  ? window.location.origin + '/supabase'
  : 'https://dmvqiuminxrtcaylfcwg.supabase.co'

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdnFpdW1pbnhydGNheWxmY3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MDc4NTAsImV4cCI6MjA5MjM4Mzg1MH0.oosI4r-Hdtea_pEy-yIRPYZG37fAOPLNdk1Y_yG93k0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Отключаем автообновление токена при возврате фокуса на вкладку —
    // иначе onAuthStateChange триггерит перезагрузку данных и закрывает формы
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
