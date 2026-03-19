'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const profileSchema = z.object({
  full_name: z.string().min(3, 'Nome completo é obrigatório'),
  phone: z.string().optional(),
  creci: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfileFormProps {
  initialProfile: {
    id: string;
    email: string;
    full_name: string;
    phone?: string | null;
    creci?: string | null;
  };
}

export function ProfileForm({ initialProfile }: ProfileFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: initialProfile.full_name || '',
      phone: initialProfile.phone || '',
      creci: initialProfile.creci || '',
    },
  });

  const onSubmit = async (data: ProfileFormValues) => {
    try {
      setIsLoading(true);

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: data.full_name,
          phone: data.phone || null,
          creci: data.creci || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', initialProfile.id);

      if (error) throw error;

      toast.success('Perfil atualizado com sucesso!');
      router.refresh();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Erro ao atualizar o perfil. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <input
            type="email"
            value={initialProfile.email}
            disabled
            className="w-full bg-white/5 border border-white/10 text-gray-400 rounded-lg px-4 py-2 opacity-70 cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 mt-1">O email não pode ser alterado por aqui.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Nome Completo <span className="text-red-500">*</span>
          </label>
          <input
            {...register('full_name')}
            placeholder="Seu nome"
            className="w-full bg-[#030816] border border-white/10 text-white placeholder:text-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
          {errors.full_name && (
            <p className="text-sm text-red-400 mt-1">{errors.full_name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Telefone</label>
            <input
              {...register('phone')}
              placeholder="(00) 00000-0000"
              className="w-full bg-[#030816] border border-white/10 text-white placeholder:text-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">CRECI</label>
            <input
              {...register('creci')}
              placeholder="Ex: 12345-F"
              className="w-full bg-[#030816] border border-white/10 text-white placeholder:text-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/10 flex justify-end">
        <button
          type="submit"
          disabled={!isDirty || isLoading}
          className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar Alterações
        </button>
      </div>
    </form>
  );
}
