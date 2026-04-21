-- =====================================================
-- PandaCRM — Schema for Supabase
-- Запусти этот SQL в Supabase → SQL Editor → New query
-- =====================================================

-- Направления (кружки/программы)
CREATE TABLE directions (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name text NOT NULL,
  teacher_name text,
  schedule text,
  launched date,
  cost_abo integer DEFAULT 0,
  cost_single integer DEFAULT 0,
  groups text[] DEFAULT ARRAY['Группа 1'],
  created_at timestamptz DEFAULT now()
);

-- Педагоги
CREATE TABLE teachers (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name text NOT NULL,
  phone text,
  direction_ids bigint[] DEFAULT '{}',
  status text DEFAULT 'Активен',
  rate integer DEFAULT 0,
  hired date,
  birthday date,
  lessons_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Клиенты
CREATE TABLE clients (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  child_name text NOT NULL,
  adult_name text,
  status text DEFAULT 'Новый',
  contacts jsonb DEFAULT '[]',
  start_date date,
  source text,
  age integer,
  sex text DEFAULT 'М',
  direction_ids bigint[] DEFAULT '{}',
  paid_lessons integer DEFAULT 0,
  visited_lessons integer DEFAULT 0,
  balance integer DEFAULT 0,
  discount integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Оплаты
CREATE TABLE payments (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  client_id bigint REFERENCES clients(id) ON DELETE SET NULL,
  payment_type text NOT NULL,
  amount integer DEFAULT 0,
  direction_id bigint REFERENCES directions(id) ON DELETE SET NULL,
  group_name text,
  payment_date date DEFAULT CURRENT_DATE,
  check_number text,
  created_at timestamptz DEFAULT now()
);

-- Расходы
CREATE TABLE expenses (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  expense_type text NOT NULL,
  amount integer DEFAULT 0,
  category text DEFAULT 'Разовый',
  direction_id bigint REFERENCES directions(id) ON DELETE SET NULL,
  expense_date date DEFAULT CURRENT_DATE,
  qty integer DEFAULT 1,
  comment text,
  link text,
  created_at timestamptz DEFAULT now()
);

-- Сотрудники (пользователи CRM)
CREATE TABLE staff (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text DEFAULT 'Преподаватель', -- Директор / Администратор / Преподаватель
  phone text,
  position text,
  teacher_id bigint REFERENCES teachers(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- =====================================================
-- RLS (Row Level Security) — Безопасность
-- =====================================================

ALTER TABLE directions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Вспомогательная функция: получить роль текущего пользователя
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM staff WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Directions: читают все авторизованные, пишут только директор/администратор
CREATE POLICY "directions_read" ON directions FOR SELECT TO authenticated USING (true);
CREATE POLICY "directions_write" ON directions FOR ALL TO authenticated
  USING (get_my_role() IN ('Директор', 'Администратор'))
  WITH CHECK (get_my_role() IN ('Директор', 'Администратор'));

-- Teachers: читают все, пишут директор/администратор
CREATE POLICY "teachers_read" ON teachers FOR SELECT TO authenticated USING (true);
CREATE POLICY "teachers_write" ON teachers FOR ALL TO authenticated
  USING (get_my_role() IN ('Директор', 'Администратор'))
  WITH CHECK (get_my_role() IN ('Директор', 'Администратор'));

-- Clients: читают все, пишут директор/администратор
CREATE POLICY "clients_read" ON clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_write" ON clients FOR ALL TO authenticated
  USING (get_my_role() IN ('Директор', 'Администратор'))
  WITH CHECK (get_my_role() IN ('Директор', 'Администратор'));

-- Payments: читают все, пишут директор/администратор
CREATE POLICY "payments_read" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "payments_write" ON payments FOR ALL TO authenticated
  USING (get_my_role() IN ('Директор', 'Администратор'))
  WITH CHECK (get_my_role() IN ('Директор', 'Администратор'));

-- Expenses: только директор
CREATE POLICY "expenses_read" ON expenses FOR SELECT TO authenticated
  USING (get_my_role() IN ('Директор', 'Администратор'));
CREATE POLICY "expenses_write" ON expenses FOR ALL TO authenticated
  USING (get_my_role() = 'Директор')
  WITH CHECK (get_my_role() = 'Директор');

-- Staff: читают все авторизованные, пишет только директор
CREATE POLICY "staff_read" ON staff FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_write" ON staff FOR ALL TO authenticated
  USING (get_my_role() = 'Директор')
  WITH CHECK (get_my_role() = 'Директор');

-- =====================================================
-- Тестовые данные
-- =====================================================

INSERT INTO directions (name, teacher_name, schedule, launched, cost_abo, cost_single, groups) VALUES
('Смышлёная Панда', 'Иванова М.А.', 'Пн/Ср/Пт 10:00', '2024-09-01', 450, 600, ARRAY['Группа 1','Группа 2']),
('Пушистые художники', 'Семёнова Т.Р.', 'Вт/Чт 15:00', '2024-10-01', 500, 700, ARRAY['Группа 1']),
('Эксплорики', 'Иванова М.А.', 'Пн/Ср 16:30', '2024-10-15', 420, 580, ARRAY['Группа 1']),
('Стратеги', 'Петров К.О.', 'Сб 11:00', '2024-11-01', 480, 650, ARRAY['Группа 1']);

INSERT INTO teachers (name, phone, direction_ids, status, rate, hired, lessons_count) VALUES
('Иванова Мария Алексеевна', '+7 912 345-67-89', ARRAY[1,3]::bigint[], 'Активен', 700, '2024-08-15', 48),
('Семёнова Тамара Романовна', '+7 900 111-22-33', ARRAY[2]::bigint[], 'Активен', 750, '2024-09-01', 32),
('Петров Кирилл Олегович', '+7 922 987-65-43', ARRAY[4]::bigint[], 'Активен', 680, '2024-11-01', 20);

INSERT INTO clients (child_name, adult_name, status, contacts, start_date, source, age, sex, direction_ids, paid_lessons, visited_lessons, balance, discount) VALUES
('Артём Соколов', 'Соколова Анна Павловна', 'Активен', '[{"type":"Телефон","val":"+7 912 000-11-22"}]', '2024-09-10', 'ВКонтакте', 5, 'М', ARRAY[1]::bigint[], 8, 12, 3600, 0),
('Маша Ковалёва', 'Ковалёва Ирина Сергеевна', 'Активен', '[{"type":"Телеграм","val":"@kovaleva_i"}]', '2024-10-01', 'Авито', 7, 'Ж', ARRAY[2]::bigint[], 4, 8, 2000, 5),
('Никита Фёдоров', 'Фёдорова Оксана Юрьевна', 'Новый', '[{"type":"Телефон","val":"+7 922 333-44-55"}]', '2025-01-10', 'Сайт', 4, 'М', ARRAY[1]::bigint[], 0, 1, 0, 0),
('Даша Орлова', 'Орлова Светлана Михайловна', 'Временно отсутствует', '[{"type":"Телефон","val":"+7 900 555-66-77"}]', '2024-09-15', 'Подруга', 6, 'Ж', ARRAY[3]::bigint[], 2, 20, 840, 10),
('Слава Новиков', 'Новикова Екатерина Дмитриевна', 'Активен', '[{"type":"Телеграм","val":"@novikova_ek"}]', '2024-11-01', 'ВКонтакте', 9, 'М', ARRAY[4]::bigint[], 6, 10, 2880, 0);

INSERT INTO expenses (expense_type, amount, category, direction_id, expense_date, qty, comment) VALUES
('Аренда', 25000, 'Периодичный', NULL, '2025-01-01', 1, 'Аренда за январь'),
('Материалы', 3200, 'Разовый', 2, '2025-01-06', 1, 'Краски, кисти'),
('Зарплата сотрудникам', 42000, 'Периодичный', NULL, '2025-01-31', 1, 'Зарплата педагогов январь'),
('Подписки', 890, 'Периодичный', NULL, '2025-01-01', 1, 'Canva, Figma');
