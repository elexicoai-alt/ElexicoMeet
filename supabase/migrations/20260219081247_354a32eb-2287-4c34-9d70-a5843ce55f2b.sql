
CREATE TABLE public.meeting_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL,
  host_id TEXT NOT NULL,
  host_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL REFERENCES public.meeting_rooms(room_code) ON DELETE CASCADE,
  peer_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_host BOOLEAN DEFAULT false,
  is_mic_locked BOOLEAN DEFAULT false,
  is_camera_locked BOOLEAN DEFAULT false,
  is_muted BOOLEAN DEFAULT false,
  is_camera_off BOOLEAN DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(room_code, peer_id)
);

CREATE TABLE public.meeting_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL REFERENCES public.meeting_rooms(room_code) ON DELETE CASCADE,
  peer_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.meeting_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL,
  from_peer TEXT NOT NULL,
  to_peer TEXT,
  signal_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.meeting_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_rooms" ON public.meeting_rooms FOR SELECT USING (true);
CREATE POLICY "anyone_insert_rooms" ON public.meeting_rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone_update_rooms" ON public.meeting_rooms FOR UPDATE USING (true);

CREATE POLICY "anyone_read_participants" ON public.meeting_participants FOR SELECT USING (true);
CREATE POLICY "anyone_insert_participants" ON public.meeting_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone_update_participants" ON public.meeting_participants FOR UPDATE USING (true);
CREATE POLICY "anyone_delete_participants" ON public.meeting_participants FOR DELETE USING (true);

CREATE POLICY "anyone_read_messages" ON public.meeting_messages FOR SELECT USING (true);
CREATE POLICY "anyone_insert_messages" ON public.meeting_messages FOR INSERT WITH CHECK (true);

CREATE POLICY "anyone_read_signals" ON public.meeting_signals FOR SELECT USING (true);
CREATE POLICY "anyone_insert_signals" ON public.meeting_signals FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone_delete_signals" ON public.meeting_signals FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_signals;
