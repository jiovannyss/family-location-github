import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Profile } from '@/lib/types';

/**
 * If `userId` is provided, loads that user's profile (read-only).
 * Otherwise loads (and lets you update) the currently authenticated user's profile.
 */
export function useProfile(userId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const targetId = userId ?? user?.id;
  const isOwn = !userId || userId === user?.id;

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', targetId],
    queryFn: async () => {
      if (!targetId) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', targetId)
        .maybeSingle();

      if (error) throw error;
      return data as Profile | null;
    },
    enabled: !!targetId,
  });

  const updateProfile = useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      if (!user) throw new Error('Not authenticated');
      if (!isOwn) throw new Error("Cannot update another user's profile");

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
  });

  return {
    profile,
    isLoading,
    updateProfile: updateProfile.mutate,
    isUpdating: updateProfile.isPending,
  };
}
