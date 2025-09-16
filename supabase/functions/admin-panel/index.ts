import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req: Request) => {
  console.log("=== FUNCAO ADMIN-PANEL CHAMADA ===");
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(supabaseUrl, serviceKey);

    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...corsHeaders } 
      });
    }

    const { data: prof } = await userClient
      .from("profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .single();
    
    if (!prof?.is_admin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { 
        status: 403, 
        headers: { ...corsHeaders } 
      });
    }

    const body = await req.json();
    const action = body?.action;

    if (action === "list") {
      const { data, error } = await service
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      
      console.log("PERFIS ENCONTRADOS:", data?.length);
      console.log("DADOS:", data);
      
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { ...corsHeaders },
      });
    }

    if (action === "create") {
      try {
        const { email, password, nome } = body ?? {};
        if (!email || !password) {
          return new Response(JSON.stringify({ 
            error: "Missing email/password", 
            success: false 
          }), { 
            status: 200, // Alterado para 200 para evitar erro de non-2xx status code
            headers: { ...corsHeaders } 
          });
        }
        
        // Verificar se o email é válido
        if (!email.includes('@') || !email.includes('.')) {
          return new Response(JSON.stringify({ 
            error: "Email inválido", 
            success: false 
          }), { 
            status: 200,
            headers: { ...corsHeaders } 
          });
        }
        
        console.log("Tentando criar usuário:", { email, nome });
        
        // Verificar se o usuário já existe
        try {
          const { data: existingUser } = await service.auth.admin.getUserByEmail(email);
          if (existingUser) {
            console.log("Usuário já existe:", existingUser);
            return new Response(JSON.stringify({ 
              error: "Este email já está em uso", 
              success: false
            }), { 
              status: 200, 
              headers: { ...corsHeaders } 
            });
          }
        } catch (checkError) {
          console.error("Erro ao verificar usuário existente:", checkError);
          // Continuar mesmo com erro na verificação
        }
        
        // Criar o usuário
        console.log("Criando usuário...");
        let data, error;
        try {
          const result = await service.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { nome },
          } as any);
          data = result.data;
          error = result.error;
        } catch (createError) {
          console.error("Exceção ao criar usuário:", createError);
          error = { message: createError instanceof Error ? createError.message : "Erro desconhecido ao criar usuário" };
        }
        
        if (error) {
          console.error("Erro ao criar usuário:", error);
          
          // Tratamento específico para erros de banco de dados
          if (error.message.includes("Database error")) {
            console.error("Possível erro de trigger on_auth_user_created_settings");
            
            // Tentar novamente a operação após um pequeno delay
            try {
              console.log("Tentando recuperar o usuário recém-criado...");
              // Verificar se o usuário foi criado apesar do erro
              const { data: existingUser } = await service.auth.admin.getUserByEmail(email);
              
              if (existingUser) {
                console.log("Usuário foi criado apesar do erro de banco de dados:", existingUser);
                
                // Tentar criar o perfil para o usuário
                const { error: profileError } = await service.from("profiles").insert({ 
                  user_id: existingUser.id, 
                  nome: nome || email 
                });
                
                if (!profileError) {
                  return new Response(JSON.stringify({
                    success: true,
                    message: "Usuário criado com sucesso (recuperado de erro de banco de dados)"
                  }), {
                    status: 200,
                    headers: { ...corsHeaders }
                  });
                }
              }
            } catch (recoveryError) {
              console.error("Erro ao tentar recuperar de erro de banco de dados:", recoveryError);
            }
          }
          
          return new Response(JSON.stringify({ 
            error: error.message, 
            success: false,
            details: error
          }), { 
            status: 200, // Alterado para 200 para evitar erro de non-2xx status code
            headers: { ...corsHeaders } 
          });
        }

        console.log("Usuário criado, inserindo perfil");
        let profileError;
        try {
          if (!data?.user?.id) {
            throw new Error("ID do usuário não disponível para criar perfil");
          }
          
          const result = await service.from("profiles").insert({ 
            user_id: data.user.id, 
            nome: nome || email,
            email: email
          });
          profileError = result.error;
        } catch (insertError) {
          console.error("Exceção ao inserir perfil:", insertError);
          profileError = { message: insertError instanceof Error ? insertError.message : "Erro desconhecido ao criar perfil" };
        }
        
        if (profileError) {
          console.error("Erro ao criar perfil:", profileError);
          return new Response(JSON.stringify({ 
            error: "Usuário criado, mas houve erro ao criar perfil", 
            success: false,
            details: profileError
          }), { 
            status: 200, 
            headers: { ...corsHeaders } 
          });
        }
        
        return new Response(JSON.stringify({ ok: true, success: true, user_id: data.user!.id }), { 
          status: 200, 
          headers: { ...corsHeaders } 
        });
      } catch (err) {
        console.error("Exceção ao criar usuário:", err);
        return new Response(JSON.stringify({ 
          error: err instanceof Error ? err.message : "Erro desconhecido", 
          success: false 
        }), { 
          status: 200, // Sempre retorna 200 mesmo em caso de erro
          headers: { ...corsHeaders } 
        });
      }
    }

    if (action === "setActive") {
      const { user_id, active } = body ?? {};
      if (!user_id || typeof active !== "boolean") {
        return new Response(JSON.stringify({ error: "Missing user_id/active" }), { status: 400, headers: { ...corsHeaders } });
      }
      const { error } = await service.from("profiles").update({ active }).eq("user_id", user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders } });
    }

    if (action === "setAdmin") {
      const { user_id, is_admin } = body ?? {};
      if (!user_id || typeof is_admin !== "boolean") {
        return new Response(JSON.stringify({ error: "Missing user_id/is_admin" }), { status: 400, headers: { ...corsHeaders } });
      }
      const { error } = await service.from("profiles").update({ is_admin }).eq("user_id", user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders } });
    }

    if (action === "delete") {
      const { user_id } = body ?? {};
      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: { ...corsHeaders } });
      }
      const { error } = await service.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { 
      status: 400, 
      headers: { ...corsHeaders } 
    });
    
  } catch (e: any) {
    console.error("Erro não tratado na função admin-panel:", e);
    
    // Garantir que sempre retornamos um status 200 para evitar erros de CORS
    return new Response(JSON.stringify({ 
      error: String(e?.message || e), 
      success: false,
      details: e?.stack || "Sem detalhes disponíveis"
    }), { 
      status: 200, // Alterado para 200 para evitar erro de non-2xx status code
      headers: { ...corsHeaders } 
    });
  }
});
