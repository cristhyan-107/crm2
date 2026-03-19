import { createServerSupabase } from '@/lib/supabase/server';
import PipelineBoard from '@/components/pipeline/pipeline-board';

export const metadata = { title: 'Pipeline - Leilão Ágil' };

export default async function PipelinePage() {
  const supabase = await createServerSupabase();
  
  // Fetch leads and their associated property title
  const { data: leads } = await supabase
    .from('leads')
    .select('*, properties(title)')
    .order('created_at', { ascending: false });

  // Fetch all properties for the filter
  const { data: properties } = await supabase
    .from('properties')
    .select('id, title')
    .order('title');

  return (
    <div className="max-w-screen-2xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      <PipelineBoard 
        initialLeads={leads || []} 
        properties={properties || []} 
      />
    </div>
  );
}
