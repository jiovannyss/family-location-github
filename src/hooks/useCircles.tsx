import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Circle, CircleMember, Invite, MemberWithLocation } from '@/lib/types';

export function useCircles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: circles, isLoading } = useQuery({
    queryKey: ['circles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('circles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Circle[];
    },
    enabled: !!user,
  });

  const createCircle = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not authenticated');
      
      const { data: circle, error: circleError } = await supabase
        .from('circles')
        .insert({ name, owner_id: user.id })
        .select()
        .single();

      if (circleError) throw circleError;

      // Add owner as accepted member
      const { error: memberError } = await supabase
        .from('circle_members')
        .insert({
          circle_id: circle.id,
          user_id: user.id,
          role: 'owner',
          status: 'accepted',
          joined_at: new Date().toISOString(),
        });

      if (memberError) throw memberError;
      return circle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles', user?.id] });
    },
  });

  const deleteCircle = useMutation({
    mutationFn: async (circleId: string) => {
      const { error } = await supabase
        .from('circles')
        .delete()
        .eq('id', circleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['circles', user?.id] });
    },
  });

  return {
    circles,
    isLoading,
    createCircle: createCircle.mutate,
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

      // Get sharing states
      const { data: sharingStates, error: sharingError } = await supabase
        .from('sharing_state')
        .select('*')
        .in('user_id', userIds);

      if (sharingError) throw sharingError;

      // Get last locations for sharing members
      const sharingUserIds = sharingStates?.filter(s => s.is_sharing).map(s => s.user_id) || [];
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
        const sharingState = sharingStates?.find(s => s.user_id === member.user_id);
        const lastLocation = locations?.find(l => l.user_id === member.user_id);

        return {
          ...member,
          status: member.status as 'invited' | 'accepted',
          profile: profile!,
          sharing_state: sharingState || null,
          last_location: lastLocation || null,
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
      
      // Find invite
      const { data: invite, error: inviteError } = await supabase
        .from('invites')
        .select('*, circle:circles(*)')
        .eq('code', code.toUpperCase())
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (inviteError) throw inviteError;
      if (!invite) throw new Error('Невалиден или изтекъл код за покана');

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
