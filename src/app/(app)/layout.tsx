import { AppLayoutClient } from '@/components/layout/app-layout-client';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      user = data.user;
    }
  } catch {
    // Auth error (e.g. invalid refresh token) — treat as unauthenticated
  }
  
  return (
    <AppLayoutClient user={user}>
      {children}
    </AppLayoutClient>
  );
}
