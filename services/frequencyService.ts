import supabase, { isSupabaseConfigured } from './supabaseClient';
import type { Frequency, AttendanceStatus } from '../types';

export const supabaseEnabled = isSupabaseConfigured;

export async function getFrequencies(): Promise<Frequency[]> {
  if (!supabaseEnabled) return [];
  const { data, error } = await supabase!
    .from('frequencies')
    .select('workshopId, date, attendance')
    .order('date', { ascending: true });
  if (error) {
    console.warn('Supabase getFrequencies error:', error.message);
    return [];
  }
  return (data ?? []) as Frequency[];
}

export async function upsertFrequency(
  workshopId: string,
  date: string,
  attendance: Record<string, AttendanceStatus>
): Promise<void> {
  if (!supabaseEnabled) return;
  const { error } = await supabase!
    .from('frequencies')
    .upsert({ workshopId, date, attendance }, { ignoreDuplicates: false });
  if (error) {
    console.warn('Supabase upsertFrequency error:', error.message);
  }
}
