import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Circle, Invite, MemberWithLocation } from '@/lib/types';
import {
  createCircleApi,
  deleteCircleApi,
  listCircles,
  renameCircleApi,
} from '@/services/api/circles';

export function useCircles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: circles, isLoading } = useQuery({
    queryKey: ['circles', user?.id],
    queryFn: () => (user ? listCircles() : Promise.resolve([])),
    enabled: !!user,
  });

  const createCircle = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not authenticated');
      return createCircleApi(name, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles', user?.id] });
    },
  });

  const renameCircle = useMutation({
    mutationFn: ({ circleId, name }: { circleId: string; name: string }) =>
      renameCircleApi(circleId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles', user?.id] });
    },
  });

  const deleteCircle = useMutation({
    mutationFn: (circleId: string) => deleteCircleApi(circleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles', user?.id] });
    },
  });

  return {
    circles,
    isLoading,
    createCircle: createCircle.mutate,
    renameCircle: renameCircle.mutate,
    isRenaming: renameCircle.isPending,
    deleteCircle: deleteCircle.mutate,
    isCreating: createCircle.isPending,
  };
}

export function useCircleMembers(circleId: string | null) {
  const { user } = useAuth();

  const { data: members, isLoading, refetch } = useQuery({
    queryKey: ['circle-members', circleId],
    queryFn: async () => {
      if (!circleId) return [];
      
      // Get members
      const { data: membersData, error: membersError } = await supabase
        .from('circle_members')
        .select('*')
        .eq('circle_id', circleId);

      if (membersError) throw membersError;

      // Get profiles for all members
      const userIds = membersData.map(m => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      // Get sharing states (one row per device — pick the active one per user)
      const { data: sharingStates, error: sharingError } = await supabase
        .from('sharing_state')
        .select('*')
        .in('user_id', userIds);

      if (sharingError) throw sharingError;

      // Aggregate: a user is "sharing" if ANY of their devices has is_sharing = true.
      // Keep the most recently updated active row (or the most recent inactive one as fallback).
      const activeByUser = new Map<string, typeof sharingStates[number]>();
      const latestByUser = new Map<string, typeof sharingStates[number]>();
      for (const s of sharingStates || []) {
        const latest = latestByUser.get(s.user_id);
        if (!latest || new Date(s.updated_at) > new Date(latest.updated_at)) {
          latestByUser.set(s.user_id, s);
        }
        if (s.is_sharing) {
          const active = activeByUser.get(s.user_id);
          if (!active || new Date(s.updated_at) > new Date(active.updated_at)) {
            activeByUser.set(s.user_id, s);
          }
        }
      }

      // Get last locations for users who have at least one sharing device
      const sharingUserIds = Array.from(activeByUser.keys());
      let locations: any[] = [];

      if (sharingUserIds.length > 0) {
        const { data: locationsData, error: locationsError } = await supabase
          .from('location_points')
          .select('*')
          .in('user_id', sharingUserIds)
          .order('recorded_at', { ascending: false });

        if (locationsError) throw locationsError;
        locations = locationsData || [];
      }

      // Combine data
      const membersWithData: MemberWithLocation[] = membersData.map(member => {
        const profile = profiles?.find(p => p.user_id === member.user_id);
        const sharingState =
          activeByUser.get(member.user_id) ||
          latestByUser.get(member.user_id) ||
          null;
        // Prefer location from the active device when known
        const activeDeviceId = activeByUser.get(member.user_id)?.device_id;
        const lastLocation =
          (activeDeviceId
            ? locations.find(l => l.user_id === member.user_id && l.device_id === activeDeviceId)
            : null) ||
          locations.find(l => l.user_id === member.user_id) ||
          null;

        return {
          ...member,
          status: member.status as 'invited' | 'accepted',
          profile: profile!,
          sharing_state: sharingState,
          last_location: lastLocation,
        };
      });

      return membersWithData;
    },
    enabled: !!circleId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  return {
    members,
    isLoading,
    refetch,
    currentMember: members?.find(m => m.user_id === user?.id),
  };
}

export function useInvites(circleId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: invites, isLoading } = useQuery({
    queryKey: ['invites', circleId],
    queryFn: async () => {
      if (!circleId) return [];
      
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('circle_id', circleId)
        .gt('expires_at', new Date().toISOString());

      if (error) throw error;
      return data as Invite[];
    },
    enabled: !!circleId,
  });

  const createInvite = useMutation({
    mutationFn: async (circleId: string) => {
      if (!user) throw new Error('Not authenticated');
      
      // Generate random code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      const { data, error } = await supabase
        .from('invites')
        .insert({
          circle_id: circleId,
          code,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites', circleId] });
    },
  });

  return {
    invites,
    isLoading,
    createInvite: createInvite.mutate,
    isCreating: createInvite.isPending,
  };
}

export function useJoinCircle() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      if (!user) throw new Error('Not authenticated');
      
      // Find invite via SECURITY DEFINER function (RLS hides invites from non-creators)
      const { data: inviteRows, error: inviteError } = await supabase
        .rpc('find_invite_by_code', { _code: code.toUpperCase() });

      if (inviteError) throw inviteError;
      const inviteRow = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;
      if (!inviteRow) throw new Error('Невалиден или изтекъл код за покана');

      // Fetch circle info (visible after we add membership; for now use minimal data)
      const { data: circleData } = await supabase
        .from('circles')
        .select('*')
        .eq('id', inviteRow.circle_id)
        .maybeSingle();

      const invite = { circle_id: inviteRow.circle_id, circle: circleData ?? { id: inviteRow.circle_id, name: 'Кръг' } };

      // Check if already a member
      const { data: existingMember } = await supabase
        .from('circle_members')
        .select('*')
        .eq('circle_id', invite.circle_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingMember) {
        if (existingMember.status === 'accepted') {
          throw new Error('Вече сте член на този кръг');
        }
        // Update to accepted
        const { error: updateError } = await supabase
          .from('circle_members')
          .update({ 
            status: 'accepted', 
            joined_at: new Date().toISOString() 
          })
          .eq('id', existingMember.id);

        if (updateError) throw updateError;
      } else {
        // Add as new member
        const { error: memberError } = await supabase
          .from('circle_members')
          .insert({
            circle_id: invite.circle_id,
            user_id: user.id,
            role: 'member',
            status: 'accepted',
            joined_at: new Date().toISOString(),
          });

        if (memberError) throw memberError;
      }

      return invite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles'] });
    },
  });
}
