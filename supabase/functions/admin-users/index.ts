import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Inicializa Supabase com Service Role
const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
// Headers padrão com CORS liberado
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
serve(async (req)=>{
  console.log("=== Edge Function Admin Users Chamada ===");
  console.log("Method:", req.method);
  // Trata preflight (OPTIONS)
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const { action, email, password, nome, telefone, user_id } = await req.json();
    console.log("Action:", action);
    // ============================================
    // LISTAR USUÁRIOS
    // ============================================
    if (action === "list") {
      console.log("Listando usuários...");
      // Busca usuários da autenticação
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      if (authError) throw authError;
      // Busca profiles correspondentes
      const { data: profiles, error: profileError } = await supabase.from("profiles").select("*").order("created_at", {
        ascending: false
      });
      if (profileError) throw profileError;
      console.log("Usuários encontrados:", authUsers.users.length);
      console.log("Profiles encontrados:", profiles.length);
      return new Response(JSON.stringify({
        ok: true,
        users: authUsers.users,
        profiles: profiles
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // ============================================
    // CRIAR NOVO USUÁRIO
    // ============================================
    if (action === "create") {
      console.log("Criando novo usuário:", email);
      if (!email || !password) {
        return new Response(JSON.stringify({
          error: "Email e senha são obrigatórios"
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      if (!nome) {
        return new Response(JSON.stringify({
          error: "Nome é obrigatório"
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      // Cria o usuário na autenticação
      const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
          nome: nome,
          telefone: telefone || null
        }
      });
      if (authError) {
        console.error("Erro ao criar usuário:", authError);
        throw authError;
      }
      console.log("Usuário criado com sucesso:", newUser.user?.id);
      console.log("Trigger automático criará registros em profiles e user_settings");
      // Aguarda um pouco para o trigger executar
      await new Promise((resolve)=>setTimeout(resolve, 1000));
      // Busca o profile criado pelo trigger
      const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("user_id", newUser.user?.id).single();
      if (profileError) {
        console.warn("Profile ainda não criado:", profileError);
      }
      return new Response(JSON.stringify({
        ok: true,
        user: newUser.user,
        profile: profile,
        message: "Usuário criado com sucesso!"
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // ============================================
    // DELETAR USUÁRIO
    // ============================================
    if (action === "delete") {
      console.log("Deletando usuário:", user_id);
      if (!user_id) {
        return new Response(JSON.stringify({
          error: "user_id é obrigatório"
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      // Deleta registros relacionados primeiro (se necessário)
      // O Supabase pode ter cascade delete configurado
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id);
      if (deleteError) {
        console.error("Erro ao deletar usuário:", deleteError);
        throw deleteError;
      }
      console.log("Usuário deletado com sucesso");
      return new Response(JSON.stringify({
        ok: true,
        message: "Usuário deletado com sucesso"
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // ============================================
    // AÇÃO INVÁLIDA
    // ============================================
    return new Response(JSON.stringify({
      error: "Ação inválida. Use: list, create ou delete"
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("Erro na Edge Function:", err);
    return new Response(JSON.stringify({
      error: err.message || "Erro desconhecido"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
