import { createServerSupabase } from '@/lib/supabase/server';
import { ProfileForm } from '@/components/settings/profile-form';

export const metadata = { title: 'Configurações - Leilão Ágil' };

export default async function SettingsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    profile = data;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="animate-fade-in">
        <h2 className="text-2xl font-bold text-white tracking-tight">Configurações</h2>
        <p className="text-sm text-gray-400 mt-1">Gerencie seu perfil e detalhes da conta</p>
      </div>
      
      <div className="bg-[#080d18] border border-white/10 rounded-xl p-6 sm:p-8 animate-slide-up">
        {profile ? (
          <ProfileForm initialProfile={profile} />
        ) : (
          <div className="text-center text-gray-400">Perfil não encontrado.</div>
        )}
      </div>
    </div>
  );
}
