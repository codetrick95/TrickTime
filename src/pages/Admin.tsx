import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface AdminProfile {
  id: string;
  user_id: string;
  nome: string;
  is_admin: boolean;
  active: boolean;
  link_publico?: string;
  created_at?: string;
}

export default function Admin() {
  const { user } = useAuth();
  const [isAllowed, setIsAllowed] = useState<boolean>(false);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  
  // Log quando profiles mudar
  useEffect(() => {
    console.log('Profiles state updated:', profiles);
  }, [profiles]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showOnlyActive, setShowOnlyActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [showOnlyAdmins, setShowOnlyAdmins] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        if (!user) return;
        
        console.log('Checking admin status for user:', user.id);
        
        // Verifica se o usuário atual é admin
        const { data, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('user_id', user.id)
          .single();
          
        if (error) {
          console.error('Error fetching admin status:', error);
          setIsAllowed(false);
          setLoading(false);
          return;
        }
        
        console.log('Admin check result:', data);
        const isAdmin = Boolean(data?.is_admin);
        console.log('Is admin:', isAdmin);
        
        setIsAllowed(isAdmin);
        setLoading(false);
        
        if (isAdmin) {
          console.log('Loading profiles for admin...');
          // Chama loadProfiles imediatamente
          loadProfiles();
        }
      } catch (error) {
        console.error('Error in admin check:', error);
        setIsAllowed(false);
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const loadProfiles = async () => {
    try {
      console.log('Loading profiles via admin-panel edge function...');
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;

      // Primeira tentativa: admin-panel (já implantada)
      const { data, error } = await supabase.functions.invoke('admin-panel', {
        body: { action: 'list' },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      } as any);

      if (error) {
        console.error('Error loading profiles from function admin-panel:', error);
        throw error;
      }

      let payload: any = data as any;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch {}
      }
      console.log('Function payload keys:', payload && typeof payload === 'object' ? Object.keys(payload) : typeof payload);
      const rows = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.data) ? payload.data : []);
      console.log('Profiles loaded from function:', rows?.length);

      if (rows && rows.length > 0) {
        const formattedProfiles = rows.map((p: any) => {
          const nome = p.nome ?? p.email ?? p.user_email ?? 'Sem nome';
          const isAdmin = Boolean(p.is_admin ?? p.admin ?? false);
          const active = (p.active ?? p.is_active ?? true) !== false;
          return {
            id: p.id ?? p.profile_id ?? p.user_id,
            user_id: p.user_id ?? p.id,
            nome,
            is_admin: isAdmin,
            active,
            link_publico: p.link_publico ?? p.public_link,
          } as AdminProfile;
        });

        setProfiles(formattedProfiles);
        console.log('SUCCESS: Loaded', formattedProfiles.length, 'profiles');
      } else {
        console.log('No profiles returned by admin-panel, falling back to direct query...');
        const { data: direct } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: true });
        const formattedProfiles = (direct ?? []).map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          nome: p.nome || p.email,
          is_admin: Boolean(p.is_admin),
          active: p.active !== false,
          link_publico: p.link_publico,
        }));
        setProfiles(formattedProfiles);
      }
    } catch (error) {
      console.error('Error loading profiles (admin-panel):', error);
      // Fallback final: tentativa direta para não deixar vazio
      try {
        console.log('Trying direct query fallback due to function error...');
        const { data: direct } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: true });
        const formattedProfiles = (direct ?? []).map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          nome: p.nome || p.email,
          is_admin: Boolean(p.is_admin),
          active: p.active !== false,
          link_publico: p.link_publico,
        }));
        setProfiles(formattedProfiles);
      } catch (e) {
        console.error('Direct query also failed:', e);
        setProfiles([]);
      }
    }
  };

  const createClient = async () => {
    if (!email || !password || !nome) {
      alert('Preencha todos os campos obrigatórios: email, senha e nome.');
      return;
    }
    
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      
      if (!token) {
        console.error('Sessão inválida ou expirada');
        alert('Sua sessão expirou. Por favor, faça login novamente.');
        return;
      }
      
      console.log('Tentando criar novo usuário:', { email, nome });
      
      const { data, error } = await supabase.functions.invoke('admin-panel', {
        body: { action: 'create', email, password, nome },
        headers: { Authorization: `Bearer ${token}` },
      } as any);
      
      if (error) {
        console.error('Erro ao invocar Edge Function:', error);
        
        // Verificar se é um erro de conexão ou timeout
        if (error.message.includes('Failed to fetch') || error.message.includes('timeout')) {
          alert('Erro de conexão com o servidor. Verifique sua internet e tente novamente.');
        } else if (error.message.includes('status code')) {
          alert('Erro no servidor. Por favor, tente novamente mais tarde ou contate o suporte.');
        } else {
          alert('Erro: ' + (error?.message || 'Falha ao criar usuário'));
        }
        return;
      }
      
      console.log('Resposta da criação de usuário:', data);
      
      // Verificar se a operação foi bem-sucedida com base no campo success
      if (data && (data.success === false || data.error)) {
        console.error('Erro retornado pela função Edge:', data.error || 'Erro desconhecido');
        
        // Mensagens de erro mais amigáveis baseadas no tipo de erro
        if (data.error && data.error.includes('already exists')) {
          alert('Este email já está cadastrado. Por favor, use outro email.');
        } else if (data.error && data.error.includes('Database error')) {
          // Tentar carregar os perfis mesmo com erro de banco de dados
          // pois o usuário pode ter sido criado apesar do erro
          console.log('Erro de banco de dados detectado, mas tentando verificar se o usuário foi criado...');
          await loadProfiles();
          
          // Verificar se o perfil foi criado comparando com o email fornecido
          const novoUsuario = profiles.find(p => p.nome.toLowerCase().includes(email.toLowerCase()));
          
          if (novoUsuario) {
            console.log('Usuário parece ter sido criado apesar do erro:', novoUsuario);
            setEmail(''); setPassword(''); setNome('');
            alert('Cliente criado com sucesso! (Recuperado de um erro de banco de dados)');
            return;
          } else {
            alert('Erro no banco de dados. Por favor, tente novamente ou contate o suporte.');
          }
        } else {
          alert('Erro: ' + (data.error || 'Falha ao criar usuário'));
        }
        return;
      }
      
      // Limpar campos e atualizar lista
      setEmail(''); setPassword(''); setNome('');
      await loadProfiles();
      alert('Cliente criado com sucesso!');
    } catch (err: any) {
      console.error('Exceção ao criar usuário:', err);
      alert('Erro inesperado: ' + (err?.message || 'Falha ao criar usuário. Tente novamente.'));
    }
  };

  const toggleActive = async (p: AdminProfile, active: boolean) => {
    const { data: sess2 } = await supabase.auth.getSession();
    const token2 = sess2.session?.access_token;
    const { error } = await supabase.functions.invoke('admin-panel', {
      body: { action: 'setActive', user_id: p.user_id, active },
      headers: token2 ? { Authorization: `Bearer ${token2}` } : undefined,
    } as any);
    if (error) console.error('Failed to setActive:', error);
    await loadProfiles();
  };

  if (loading) {
    console.log('Still loading...');
    return <div>Carregando...</div>;
  }
  
  if (!isAllowed) {
    console.log('Not allowed, redirecting...');
    return <Navigate to="/" replace />;
  }
  
  console.log('Rendering admin panel, profiles count:', profiles.length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Administração</h1>
        <p className="text-muted-foreground">Gerencie acessos dos clientes</p>
        <Button 
          onClick={() => {
            console.log('Force loading profiles...');
            loadProfiles();
          }}
          className="mt-2"
        >
          Forçar Carregamento
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo Cliente</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Senha</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div>
            <Label>Nome</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Button onClick={createClient}>Criar Acesso</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Buscar por e-mail/nome</Label>
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Digite para filtrar" />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button variant={showOnlyActive === 'all' ? 'default' : 'outline'} onClick={() => setShowOnlyActive('all')}>
                Todos
              </Button>
              <Button variant={showOnlyActive === 'active' ? 'default' : 'outline'} onClick={() => setShowOnlyActive('active')}>
                Ativos
              </Button>
              <Button variant={showOnlyActive === 'inactive' ? 'default' : 'outline'} onClick={() => setShowOnlyActive('inactive')}>
                Inativos
              </Button>
              <Button variant={showOnlyAdmins ? 'default' : 'outline'} onClick={() => setShowOnlyAdmins(s => !s)}>
                {showOnlyAdmins ? 'Somente Admins' : 'Todos os Perfis'}
              </Button>
              <Button variant="outline" onClick={() => {
                console.log('Manual refresh clicked');
                loadProfiles();
              }}>Atualizar</Button>
            </div>
          </div>

          {(profiles
            .filter(p => (showOnlyActive === 'active' ? p.active : showOnlyActive === 'inactive' ? !p.active : true))
            .filter(p => (showOnlyAdmins ? p.is_admin : true))
            .filter(p => {
              const q = search.trim().toLowerCase();
              if (!q) return true;
              return p.nome?.toLowerCase()?.includes(q);
            })
          ).map(p => (
            <div key={p.id} className="flex items-center justify-between border rounded p-3 bg-white/50">
              <div>
                <div className="font-medium">{p.nome}</div>
                <div className="text-sm flex gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${p.is_admin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {p.is_admin ? 'Admin' : 'Cliente'}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${p.active ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                    {p.active ? 'Ativo' : 'Inativo'}
                  </span>
                  {p.link_publico && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                      Link: {p.link_publico}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={async () => {
                  const { data: sess } = await supabase.auth.getSession();
                  const token = sess.session?.access_token;
                  await supabase.functions.invoke('admin-panel', {
                    body: { action: 'setAdmin', user_id: p.user_id, is_admin: !p.is_admin },
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                  } as any);
                  await loadProfiles();
                }}>
                  {p.is_admin ? 'Remover admin' : 'Tornar admin'}
                </Button>
                <Button variant="outline" onClick={() => toggleActive(p, !p.active)}>
                  {p.active ? 'Bloquear' : 'Desbloquear'}
                </Button>
                <Button variant="destructive" onClick={async () => {
                  const { data: sess3 } = await supabase.auth.getSession();
                  const token3 = sess3.session?.access_token;
                  await supabase.functions.invoke('admin-panel', {
                    body: { action: 'delete', user_id: p.user_id },
                    headers: token3 ? { Authorization: `Bearer ${token3}` } : undefined,
                  } as any);
                  await loadProfiles();
                }}>Excluir</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}


