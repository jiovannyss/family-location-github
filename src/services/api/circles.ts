/**
 * Centralized API for circles.
 * Components/hooks must call these helpers instead of using `supabase` directly.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Circle } from '@/lib/types';

export async function listCircles(): Promise<Circle[]> {
  const { data, error } = await supabase
    .from('circles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Circle[];
}

export async function createCircleApi(name: string, ownerId: string): Promise<Circle> {
  const { data: circle, error } = await supabase
    .from('circles')
    .insert({ name, owner_id: ownerId })
    .select()
    .single();
  if (error) throw error;

  const { error: memberError } = await supabase.from('circle_members').insert({
    circle_id: circle.id,
    user_id: ownerId,
    role: 'owner',
    status: 'accepted',
    joined_at: new Date().toISOString(),
  });
  if (memberError) throw memberError;
  return circle as Circle;
}

export async function renameCircleApi(circleId: string, name: string): Promise<Circle> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Името не може да бъде празно');

  const { data, error } = await supabase
    .from('circles')
    .update({ name: trimmed })
    .eq('id', circleId)
    .select()
    .single();
  if (error) throw error;
  return data as Circle;
}

export async function deleteCircleApi(circleId: string): Promise<void> {
  const { error } = await supabase.from('circles').delete().eq('id', circleId);
  if (error) throw error;
}
