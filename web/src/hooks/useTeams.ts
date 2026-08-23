import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type Team = Database['public']['Tables']['teams']['Row'];

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  useEffect(() => {
    supabase.from('teams').select('*').order('name').then(({ data }) => setTeams(data ?? []));
  }, []);
  return teams;
}
