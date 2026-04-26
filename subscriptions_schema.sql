-- =====================================================
-- Абонементы / Виды оплаты
-- Выполни в Supabase → SQL Editor → New query
-- =====================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name text NOT NULL,
  direction_ids bigint[] DEFAULT '{}',
  price integer DEFAULT 0,
  lessons_count integer DEFAULT 1,
  period text DEFAULT 'Пока не закончатся занятия',
  -- period variants: 'Не ограничен' | 'Месяц' | 'Пока не закончатся занятия'
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_read" ON subscriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "subscriptions_write" ON subscriptions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Тестовые данные (опционально)
-- INSERT INTO subscriptions (name, direction_ids, price, lessons_count, period) VALUES
-- ('Абонемент 8 занятий', ARRAY[1]::bigint[], 3600, 8, 'Месяц'),
-- ('Абонемент 4 занятия', ARRAY[1]::bigint[], 2000, 4, 'Пока не закончатся занятия');
