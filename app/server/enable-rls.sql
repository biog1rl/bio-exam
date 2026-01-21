-- Включаем RLS на всех таблицах
-- Без политик = Data API заблокирован, но Drizzle работает через прямое соединение

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_page_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_user_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sidebar_items ENABLE ROW LEVEL SECURITY;

-- Проверка: эти таблицы должны показать relrowsecurity = true
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'roles', 'user_roles', 'invites', 'rbac_role_grants', 'rbac_page_rules', 'rbac_user_grants', 'sidebar_items');
