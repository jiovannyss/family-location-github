-- Enum for member status
CREATE TYPE public.member_status AS ENUM ('invited', 'accepted');

-- Profiles table
CREATE TABLE public.profiles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Circles table
CREATE TABLE public.circles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Circle members table
CREATE TABLE public.circle_members (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    circle_id UUID REFERENCES public.circles(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status member_status NOT NULL DEFAULT 'invited',
    joined_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(circle_id, user_id)
);

-- Invites table
CREATE TABLE public.invites (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    circle_id UUID REFERENCES public.circles(id) ON DELETE CASCADE NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days')
);

-- Sharing state table
CREATE TABLE public.sharing_state (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL PRIMARY KEY,
    is_sharing BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Location points table
CREATE TABLE public.location_points (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    accuracy_m DOUBLE PRECISION,
    battery_level INTEGER,
    device_platform TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for faster location queries
CREATE INDEX idx_location_points_user_recorded ON public.location_points(user_id, recorded_at DESC);
CREATE INDEX idx_circle_members_user ON public.circle_members(user_id);
CREATE INDEX idx_circle_members_circle ON public.circle_members(circle_id);
CREATE INDEX idx_invites_code ON public.invites(code);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sharing_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_points ENABLE ROW LEVEL SECURITY;

-- Enable realtime for location_points and sharing_state
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_points;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sharing_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_members;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile"
ON public.profiles FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Circles policies
CREATE POLICY "Users can view circles they are member of"
ON public.circles FOR SELECT
TO authenticated
USING (
    owner_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.circle_members
        WHERE circle_id = circles.id AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can create circles"
ON public.circles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Circle owners can update their circles"
ON public.circles FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Circle owners can delete their circles"
ON public.circles FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

-- Circle members policies
CREATE POLICY "Members can view circle members"
ON public.circle_members FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.circle_members cm
        WHERE cm.circle_id = circle_members.circle_id AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Circle owners can add members"
ON public.circle_members FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.circles
        WHERE id = circle_id AND owner_id = auth.uid()
    ) OR user_id = auth.uid()
);

CREATE POLICY "Users can update own membership"
ON public.circle_members FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Members can leave or owners can remove"
ON public.circle_members FOR DELETE
TO authenticated
USING (
    user_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.circles
        WHERE id = circle_id AND owner_id = auth.uid()
    )
);

-- Invites policies
CREATE POLICY "Anyone authenticated can view valid invites by code"
ON public.invites FOR SELECT
TO authenticated
USING (expires_at > now());

CREATE POLICY "Circle owners can create invites"
ON public.invites FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.circles
        WHERE id = circle_id AND owner_id = auth.uid()
    )
);

CREATE POLICY "Circle owners can delete invites"
ON public.invites FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.circles
        WHERE id = circle_id AND owner_id = auth.uid()
    )
);

-- Sharing state policies
CREATE POLICY "Users can view sharing state of circle members"
ON public.sharing_state FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.circle_members cm1
        JOIN public.circle_members cm2 ON cm1.circle_id = cm2.circle_id
        WHERE cm1.user_id = auth.uid() 
        AND cm2.user_id = sharing_state.user_id
        AND cm1.status = 'accepted'
        AND cm2.status = 'accepted'
    )
);

CREATE POLICY "Users can manage own sharing state"
ON public.sharing_state FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sharing state"
ON public.sharing_state FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Location points policies - CRITICAL for privacy
CREATE POLICY "Users can insert own location"
ON public.location_points FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view locations of accepted circle members who are sharing"
ON public.location_points FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() OR
    (
        EXISTS (
            SELECT 1 FROM public.circle_members cm1
            JOIN public.circle_members cm2 ON cm1.circle_id = cm2.circle_id
            WHERE cm1.user_id = auth.uid() 
            AND cm2.user_id = location_points.user_id
            AND cm1.status = 'accepted'
            AND cm2.status = 'accepted'
        )
        AND
        EXISTS (
            SELECT 1 FROM public.sharing_state
            WHERE user_id = location_points.user_id AND is_sharing = true
        )
    )
);

CREATE POLICY "Users can delete own location history"
ON public.location_points FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sharing_state_updated_at
BEFORE UPDATE ON public.sharing_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate invite code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
    
    INSERT INTO public.sharing_state (user_id, is_sharing)
    VALUES (NEW.id, false);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for auto-creating profile
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Function to clean old location points (keep last 100 per user)
CREATE OR REPLACE FUNCTION public.cleanup_old_location_points()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.location_points
    WHERE user_id = NEW.user_id
    AND id NOT IN (
        SELECT id FROM public.location_points
        WHERE user_id = NEW.user_id
        ORDER BY recorded_at DESC
        LIMIT 100
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER cleanup_location_points_trigger
AFTER INSERT ON public.location_points
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_old_location_points();