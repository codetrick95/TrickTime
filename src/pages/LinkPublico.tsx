import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { 
  Link, 
  Copy, 
  Share2, 
  Settings, 
  Calendar, 
  Clock, 
  User, 
  Eye,
  EyeOff,
  QrCode,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Instagram,
  Facebook,
  Linkedin,
  Youtube
} from 'lucide-react';

interface Profile {
  id: string;
  user_id: string;
  nome: string;
  especialidade?: string;
  telefone?: string;
  email: string;
  link_publico: string;
  created_at: string;
  updated_at: string;
}

// Interface estendida para incluir campos adicionais
interface ExtendedProfile extends Profile {
  foto_perfil?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  linkedin?: string;
}

const LinkPublico = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ExtendedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);

  const [form, setForm] = useState({
    nome: '',
    especialidade: '',
    telefone: '',
    email: '',
    link_publico: '',
    foto_perfil: '',
    instagram: '',
    tiktok: '',
    facebook: '',
    linkedin: ''
  });

  // Função para carregar dados adicionais do localStorage
  const loadExtendedProfile = (baseProfile: Profile): ExtendedProfile => {
    const extendedData = localStorage.getItem(`profile_extended_${baseProfile.user_id}`);
    const parsedData = extendedData ? JSON.parse(extendedData) : {};
    
    return {
      ...baseProfile,
      foto_perfil: parsedData.foto_perfil || '',
      instagram: parsedData.instagram || '',
      tiktok: parsedData.tiktok || '',
      facebook: parsedData.facebook || '',
      linkedin: parsedData.linkedin || ''
    };
  };

  // Função para salvar dados adicionais no localStorage
  const saveExtendedProfile = (userId: string, extendedData: any) => {
    localStorage.setItem(`profile_extended_${userId}`, JSON.stringify(extendedData));
  };

  const fetchProfile = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Erro ao carregar perfil:', error);
      } else {
        const extendedProfile = loadExtendedProfile(data);
        setProfile(extendedProfile);
        if (data) {
          setForm({
            nome: data.nome,
            especialidade: data.especialidade || '',
            telefone: data.telefone || '',
            email: data.email,
            link_publico: data.link_publico,
            foto_perfil: extendedProfile.foto_perfil || '',
            instagram: extendedProfile.instagram || '',
            tiktok: extendedProfile.tiktok || '',
            facebook: extendedProfile.facebook || '',
            linkedin: extendedProfile.linkedin || ''
          });
        }
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      // Dados básicos para o Supabase
      const profileData = {
        nome: form.nome,
        especialidade: form.especialidade || null,
        telefone: form.telefone || null,
        email: form.email,
        link_publico: form.link_publico,
        user_id: user.id
      };

      // Dados estendidos para localStorage
      const extendedData = {
        foto_perfil: form.foto_perfil || '',
        instagram: form.instagram || '',
        tiktok: form.tiktok || '',
        facebook: form.facebook || '',
        linkedin: form.linkedin || ''
      };

      if (profile) {
        const { error } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('id', profile.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('profiles')
          .insert([profileData]);
        
        if (error) throw error;
      }

      // Salvar dados estendidos no localStorage
      saveExtendedProfile(user.id, extendedData);

      setModalOpen(false);
      fetchProfile();
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Erro ao copiar:', error);
    }
  };

  const generatePublicLink = () => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/public/${profile?.link_publico || user?.id}`;
    return link;
  };

  const shareLink = async () => {
    const link = generatePublicLink();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Agende sua consulta',
          text: `Agende sua consulta com ${profile?.nome}`,
          url: link
        });
      } catch (error) {
        console.error('Erro ao compartilhar:', error);
      }
    } else {
      copyToClipboard(link);
    }
  };

  const getPublicLinkStatus = () => {
    if (!profile) return 'inactive';
    if (!profile.nome || !profile.email) return 'incomplete';
    return 'active';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'incomplete': return 'bg-yellow-100 text-yellow-800';
      case 'inactive': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Ativo';
      case 'incomplete': return 'Incompleto';
      case 'inactive': return 'Inativo';
      default: return 'Desconhecido';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4" />;
      case 'incomplete': return <AlertCircle className="h-4 w-4" />;
      case 'inactive': return <AlertCircle className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  const status = getPublicLinkStatus();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Link Público</h1>
          <p className="text-muted-foreground">
            Configure e compartilhe seu link de agendamento público
          </p>
        </div>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setModalOpen(true)} className="bg-primary hover:opacity-90">
              <Settings className="h-4 w-4 mr-2" />
              Configurar Perfil
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSave} className="space-y-6">
              <DialogHeader>
                <DialogTitle>Configurar Perfil Público</DialogTitle>
              </DialogHeader>
              
              {/* Foto de Perfil */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Foto de Perfil
                </h3>
                
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={form.foto_perfil} />
                    <AvatarFallback>
                      {form.nome ? form.nome.charAt(0).toUpperCase() : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="space-y-2">
                    <Label htmlFor="foto_perfil" className="text-sm">
                      {form.foto_perfil ? 'Alterar foto' : 'Adicionar foto'}
                    </Label>
                    <Input
                      id="foto_perfil"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (e) => {
                            setForm(f => ({ ...f, foto_perfil: e.target?.result as string }));
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Informações Básicas */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Informações Básicas
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome Completo *</Label>
                    <Input
                      id="nome"
                      value={form.nome}
                      onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="especialidade">Especialidade</Label>
                    <Input
                      id="especialidade"
                      value={form.especialidade}
                      onChange={e => setForm(f => ({ ...f, especialidade: e.target.value }))}
                      placeholder="Ex: Cardiologia, Psicologia..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone</Label>
                    <Input
                      id="telefone"
                      value={form.telefone}
                      onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>
              </div>

              {/* Redes Sociais */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  Redes Sociais
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="instagram" className="flex items-center gap-2">
                      <Instagram className="h-4 w-4" />
                      Instagram
                    </Label>
                    <Input
                      id="instagram"
                      value={form.instagram}
                      onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                      placeholder="@seu_usuario"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tiktok" className="flex items-center gap-2">
                      <Youtube className="h-4 w-4" />
                      TikTok
                    </Label>
                    <Input
                      id="tiktok"
                      value={form.tiktok}
                      onChange={e => setForm(f => ({ ...f, tiktok: e.target.value }))}
                      placeholder="@seu_usuario"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="facebook" className="flex items-center gap-2">
                      <Facebook className="h-4 w-4" />
                      Facebook
                    </Label>
                    <Input
                      id="facebook"
                      value={form.facebook}
                      onChange={e => setForm(f => ({ ...f, facebook: e.target.value }))}
                      placeholder="facebook.com/seu_perfil"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="linkedin" className="flex items-center gap-2">
                      <Linkedin className="h-4 w-4" />
                      LinkedIn
                    </Label>
                    <Input
                      id="linkedin"
                      value={form.linkedin}
                      onChange={e => setForm(f => ({ ...f, linkedin: e.target.value }))}
                      placeholder="linkedin.com/in/seu_perfil"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancelar</Button>
                </DialogClose>
                <Button type="submit" disabled={saving} className="bg-primary hover:opacity-90">
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status do Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Status do Link Público
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Badge className={getStatusColor(status)}>
              {getStatusIcon(status)}
              <span className="ml-1">{getStatusText(status)}</span>
            </Badge>
            {status === 'incomplete' && (
              <p className="text-sm text-muted-foreground">
                Complete seu perfil para ativar o link público
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Seu Link Público */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Seu Link Público
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={showLink ? generatePublicLink() : '••••••••••••••••••••••••••••••••••••••••'}
              readOnly
              className="font-mono text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLink(!showLink)}
            >
              {showLink ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(generatePublicLink())}
              disabled={!profile}
            >
              {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={shareLink}
              disabled={!profile}
              className="bg-primary hover:bg-primary/90"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Compartilhar
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open(generatePublicLink(), '_blank')}
              disabled={!profile}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Visualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Informações do Perfil */}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informações do Perfil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              {/* Foto de Perfil */}
              <Avatar className="h-20 w-20">
                <AvatarImage src={profile.foto_perfil} />
                <AvatarFallback>
                  {profile.nome ? profile.nome.charAt(0).toUpperCase() : 'U'}
                </AvatarFallback>
              </Avatar>
              
              {/* Informações Básicas */}
              <div className="flex-1 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium">Nome</Label>
                    <p className="text-sm text-muted-foreground">{profile.nome}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Especialidade</Label>
                    <p className="text-sm text-muted-foreground">
                      {profile.especialidade || 'Não informada'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Email</Label>
                    <p className="text-sm text-muted-foreground">{profile.email}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Telefone</Label>
                    <p className="text-sm text-muted-foreground">
                      {profile.telefone || 'Não informado'}
                    </p>
                  </div>
                </div>

                {/* Redes Sociais */}
                {(profile.instagram || profile.tiktok || profile.facebook || profile.linkedin) && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Redes Sociais</Label>
                    <div className="flex flex-wrap gap-2">
                      {profile.instagram && (
                        <Badge variant="secondary" className="flex items-center gap-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                          <Instagram className="h-3 w-3" />
                          Instagram
                        </Badge>
                      )}
                      {profile.tiktok && (
                        <Badge variant="secondary" className="flex items-center gap-1 bg-black text-white">
                          <Youtube className="h-3 w-3" />
                          TikTok
                        </Badge>
                      )}
                      {profile.facebook && (
                        <Badge variant="secondary" className="flex items-center gap-1 bg-blue-600 text-white">
                          <Facebook className="h-3 w-3" />
                          Facebook
                        </Badge>
                      )}
                      {profile.linkedin && (
                        <Badge variant="secondary" className="flex items-center gap-1 bg-blue-700 text-white">
                          <Linkedin className="h-3 w-3" />
                          LinkedIn
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Como Funciona */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Como Funciona
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 text-xs font-medium">1</span>
              </div>
              <div>
                <h4 className="font-medium">Configure seu perfil</h4>
                <p className="text-sm text-muted-foreground">
                  Adicione seu nome, especialidade, foto e informações de contato
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 text-xs font-medium">2</span>
              </div>
              <div>
                <h4 className="font-medium">Compartilhe o link</h4>
                <p className="text-sm text-muted-foreground">
                  Copie ou compartilhe o link público com seus pacientes
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 text-xs font-medium">3</span>
              </div>
              <div>
                <h4 className="font-medium">Pacientes agendam</h4>
                <p className="text-sm text-muted-foreground">
                  Os pacientes acessam o link e fazem agendamentos diretamente
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 text-xs font-medium">4</span>
              </div>
              <div>
                <h4 className="font-medium">Gerencie na agenda</h4>
                <p className="text-sm text-muted-foreground">
                  Visualize e gerencie todos os agendamentos na sua agenda
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dicas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Dicas para Melhor Resultado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-sm text-muted-foreground">
                Mantenha seu perfil sempre atualizado com informações precisas
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-sm text-muted-foreground">
                Adicione uma foto profissional para maior credibilidade
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-sm text-muted-foreground">
                Compartilhe o link em suas redes sociais e site profissional
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-sm text-muted-foreground">
                Monitore regularmente os agendamentos na seção Agenda
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-sm text-muted-foreground">
                Configure horários disponíveis para receber agendamentos
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LinkPublico;