
CREATE OR REPLACE FUNCTION public.is_circle_member(_user_id uuid, _circle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE user_id = _user_id AND circle_id = _circle_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_accepted_circle_mate(_user_id uuid, _other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.circle_members cm1
    JOIN public.circle_members cm2 ON cm1.circle_id = cm2.circle_id
    WHERE cm1.user_id = _user_id
      AND cm2.user_id = _other_user_id
      AND cm1.status = 'accepted'
      AND cm2.status = 'accepted'
  )
$$;

DROP POLICY "Members can view circle members" ON public.circle_members;
CREATE POLICY "Members can view circle members" ON public.circle_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_circle_member(auth.uid(), circle_id));

DROP POLICY "Users can view circles they are member of" ON public.circles;
CREATE POLICY "Users can view circles they are member of" ON public.circles
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_circle_member(auth.uid(), id));

DROP POLICY "Users can view sharing state of circle members" ON public.sharing_state;
CREATE POLICY "Users can view sharing state of circle members" ON public.sharing_state
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_accepted_circle_mate(auth.uid(), user_id));

DROP POLICY "Users can view locations of accepted circle members who are sha" ON public.location_points;
CREATE POLICY "Users can view locations of accepted circle members who share" ON public.location_points
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_accepted_circle_mate(auth.uid(), user_id)
      AND EXISTS (
        SELECT 1 FROM public.sharing_state
        WHERE sharing_state.user_id = location_points.user_id
          AND sharing_state.is_sharing = true
      )
    )
  );
