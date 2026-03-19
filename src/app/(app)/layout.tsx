import { AppLayoutClient } from '@/components/layout/app-layout-client';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  
  return (
    <AppLayoutClient user={data?.user ?? null}>
      {children}
    </AppLayoutClient>
  );
}
