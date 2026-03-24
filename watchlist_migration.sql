-- ============================================================
-- Watchlist Many-to-Many Migration
-- Run this script in Supabase SQL Editor
-- ============================================================

-- 1. Create watchlist_lists table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.watchlist_lists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  position   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 2. Create join table watchlist_list_members
-- ============================================================
CREATE TABLE IF NOT EXISTS public.watchlist_list_members (
  watchlist_id uuid NOT NULL REFERENCES public.watchlist(id)  ON DELETE CASCADE,
  list_id      uuid NOT NULL REFERENCES public.watchlist_lists(id) ON DELETE CASCADE,
  PRIMARY KEY (watchlist_id, list_id)
);

-- 3. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_wll_user_id   ON public.watchlist_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_wllm_wl_id    ON public.watchlist_list_members(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_wllm_list_id  ON public.watchlist_list_members(list_id);

-- 4. Row-Level Security for watchlist_lists
-- ============================================================
ALTER TABLE public.watchlist_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lists"
  ON public.watchlist_lists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own lists"
  ON public.watchlist_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lists"
  ON public.watchlist_lists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lists"
  ON public.watchlist_lists FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Row-Level Security for watchlist_list_members
-- (access controlled via watchlist and watchlist_lists ownership)
-- ============================================================
ALTER TABLE public.watchlist_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memberships"
  ON public.watchlist_list_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlist_lists wll
      WHERE wll.id = list_id AND wll.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own memberships"
  ON public.watchlist_list_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.watchlist_lists wll
      WHERE wll.id = list_id AND wll.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own memberships"
  ON public.watchlist_list_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlist_lists wll
      WHERE wll.id = list_id AND wll.user_id = auth.uid()
    )
  );

-- 6. Migrate existing data from watchlist.list_name
-- ============================================================
-- Step 6a: Create one watchlist_lists row per unique (user_id, list_name)
INSERT INTO public.watchlist_lists (user_id, name, position)
SELECT DISTINCT
  w.user_id,
  COALESCE(NULLIF(TRIM(w.list_name), ''), 'General') AS name,
  ROW_NUMBER() OVER (PARTITION BY w.user_id ORDER BY COALESCE(NULLIF(TRIM(w.list_name), ''), 'General')) - 1 AS position
FROM public.watchlist w
WHERE w.user_id IS NOT NULL
ON CONFLICT (user_id, name) DO NOTHING;

-- Step 6b: Populate watchlist_list_members from watchlist.list_name
INSERT INTO public.watchlist_list_members (watchlist_id, list_id)
SELECT
  w.id AS watchlist_id,
  wll.id AS list_id
FROM public.watchlist w
JOIN public.watchlist_lists wll
  ON wll.user_id = w.user_id
  AND wll.name = COALESCE(NULLIF(TRIM(w.list_name), ''), 'General')
WHERE w.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 7. Verify migration
-- ============================================================
SELECT
  wll.name AS list_name,
  COUNT(wllm.watchlist_id) AS item_count
FROM public.watchlist_lists wll
LEFT JOIN public.watchlist_list_members wllm ON wllm.list_id = wll.id
GROUP BY wll.name
ORDER BY wll.name;
