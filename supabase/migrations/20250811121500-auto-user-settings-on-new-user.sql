-- Cria registro padrão em user_settings para cada novo usuário
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Verificar se a tabela existe antes de inserir
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_settings') THEN
    BEGIN
      INSERT INTO public.user_settings (user_id)
      VALUES (NEW.id)
      ON CONFLICT (user_id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        -- Capturar qualquer erro e continuar sem falhar o trigger
        RAISE NOTICE 'Erro ao inserir em user_settings: %', SQLERRM;
        -- Não propagar o erro para não impedir a criação do usuário
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- Garante que o trigger está criado após a criação do usuário no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();


