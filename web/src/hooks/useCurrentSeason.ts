import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type Season = Database['public']['Tables']['seasons']['Row'];

// The "current" season is just the most recent year on record. Admin creates
// next year's season row (Build Week flow) when it's time to roll over.
export function useCurrentSeason() {
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('seasons')
      .select('*')
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setSeason(data);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { season, loading };
}
