import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, name, role, phone } = await req.json()

    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'Email и имя обязательны' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use service role key to create user via Admin API
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    )

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true, // skip email confirmation
      user_metadata: { name },
    })

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userId = authData.user.id

    // Create staff record
    const { error: staffError } = await supabaseAdmin.from('staff').insert({
      user_id: userId,
      name,
      role: role || 'Преподаватель',
      phone: phone || null,
      email,
      is_active: true,
    })

    if (staffError) {
      // Rollback: delete auth user if staff insert failed
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return new Response(JSON.stringify({ error: staffError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Send password reset email so user can set their own password
    await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${req.headers.get('origin') || 'https://panda-crm.vercel.app'}` }
    })

    // Send the actual reset email
    await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://panda-crm.vercel.app',
    })

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
