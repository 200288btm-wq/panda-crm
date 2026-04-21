import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://dmvqiuminxrtcaylfcwg.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdnFpdW1pbnhydGNheWxmY3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MDc4NTAsImV4cCI6MjA5MjM4Mzg1MH0.oosI4r-Hdtea_pEy-yIRPYZG37fAOPLNdk1Y_yG93k0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
