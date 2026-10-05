import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

supabase.auth.onAuthStateChange((event, session) => {
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
  }
});