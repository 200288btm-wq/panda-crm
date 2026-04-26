import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import LoginPage from './pages/LoginPage'
import CRM from './pages/CRM'
import { GlobalStyles } from './styles.jsx'
import { checkBirthdays } from './birthdays.js'

export default function App() {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchStaff(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchStaff(session.user.id)
      else { setStaff(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchStaff = async (userId) => {
    const { data } = await supabase.from('staff').select('*').eq('user_id', userId).single()
    setStaff(data)
    setLoading(false)
    // Check birthdays after login — once per day
    setTimeout(() => checkBirthdays(), 3000)
  }

  if (loading) return (
    <>
      <GlobalStyles />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F0EDD8' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🐾</div>
          <div style={{ fontFamily:'Nunito,sans-serif', fontWeight:800, fontSize:18 }}>PandaCRM</div>
          <div style={{ fontSize:13, color:'#6b7280', marginTop:4 }}>Загрузка...</div>
        </div>
      </div>
    </>
  )

  return (
    <>
      <GlobalStyles />
      {!session ? <LoginPage /> : <CRM session={session} staff={staff} />}
    </>
  )
}
