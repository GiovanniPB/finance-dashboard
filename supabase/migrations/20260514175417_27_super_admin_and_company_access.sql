-- 1) Add super_admin to user_role enum
alter type public.user_role add value if not exists 'super_admin';

