import { createClient } from '@supabase/supabase-js'
import { supabaseDebugLogger } from './authLog'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase settings. Check frontend/.env')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Keep a short record of session refreshes/errors on this device (see authLog.ts)
    debug: supabaseDebugLogger,
  },
})