# 🐾 PandaCRM — Академия Панды

CRM-система для управления клиентами, расписанием и финансами детского центра развития.

---

## 🚀 Деплой (пошаговая инструкция)

### Шаг 1 — База данных в Supabase

1. Открой [supabase.com](https://supabase.com) → твой проект **Panda-CRM**
2. Перейди в **SQL Editor** → нажми **New query**
3. Скопируй содержимое файла `schema.sql` и вставь в редактор
4. Нажми **Run** (зелёная кнопка)
5. Убедись что появились таблицы: `clients`, `payments`, `expenses`, `directions`, `teachers`, `staff`

### Шаг 2 — Настройка Auth в Supabase

1. Перейди в **Authentication → Providers → Email**
2. Включи **Enable Email provider** ✅
3. Отключи **Confirm email** (чтобы не ждать подтверждения при первом тесте)
4. Перейди в **Authentication → URL Configuration**
5. В поле **Site URL** вставь адрес будущего сайта (например `https://panda-crm.vercel.app`)

### Шаг 3 — Создать первого пользователя (директора)

1. Перейди в **Authentication → Users → Add user → Create new user**
2. Введи свой email и пароль
3. Нажми **Create user** — запомни ID пользователя (строка вида `uuid`)
4. Перейди в **SQL Editor** и выполни:

```sql
INSERT INTO staff (user_id, name, role, is_active)
VALUES ('ВСТАВЬ-СЮДА-UUID', 'Татьяна', 'Директор', true);
```

### Шаг 4 — Загрузить код на GitHub

1. Открой **GitHub Desktop** → File → New Repository
2. Название: `panda-crm`
3. Нажми **Create Repository**
4. Нажми **Open in Explorer** и скопируй все файлы из этой папки в папку репозитория
5. В GitHub Desktop нажми **Commit to main** → **Push origin**

### Шаг 5 — Деплой на Vercel

1. Открой [vercel.com](https://vercel.com) → войди через GitHub
2. Нажми **Add New Project**
3. Выбери репозиторий `panda-crm`
4. Framework preset: **Vite**
5. Нажми **Deploy** — через 1-2 минуты сайт готов!

---

## 🔑 Роли пользователей

| Роль | Доступ |
|------|--------|
| **Директор** | Всё: клиенты, оплаты, расходы, финансы, сотрудники |
| **Администратор** | Клиенты, оплаты, расписание, педагоги |
| **Преподаватель** | Расписание и направления |

---

## 📱 Мобильная версия (PWA)

Сайт работает как приложение на телефоне:
- **iPhone**: открой в Safari → поделиться → «На экран домой»
- **Android**: открой в Chrome → меню → «Установить приложение»

---

## 🛠️ Технологии

- **Frontend**: React + Vite
- **База данных**: Supabase (PostgreSQL)
- **Авторизация**: Supabase Auth
- **Хостинг**: Vercel
