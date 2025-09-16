import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useParams } from 'react-router-dom';
import { startOfDay, endOfDay, parseISO, format } from 'date-fns';
import { 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Plus,
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

// Interface para configurações de privacidade
interface PrivacySettings {
  publicProfile: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showSocialMedia: boolean;
}

type WorkingHoursDay = { enabled: boolean; start: string; end: string };
type WorkingHours = {
  sun: WorkingHoursDay; mon: WorkingHoursDay; tue: WorkingHoursDay; wed: WorkingHoursDay;
  thu: WorkingHoursDay; fri: WorkingHoursDay; sat: WorkingHoursDay;
};

const defaultWorkingHours: WorkingHours = {
  sun: { enabled: true, start: '08:00', end: '18:00' },
  mon: { enabled: true, start: '08:00', end: '18:00' },
  tue: { enabled: true, start: '08:00', end: '18:00' },
  wed: { enabled: true, start: '08:00', end: '18:00' },
  thu: { enabled: true, start: '08:00', end: '18:00' },
  fri: { enabled: true, start: '08:00', end: '18:00' },
  sat: { enabled: true, start: '08:00', end: '18:00' },
};

interface Agendamento {
  id: string;
  nome_paciente: string;
  telefone_paciente?: string;
  email_paciente?: string;
  data_hora: string;
  duracao_minutos: number;
  status: string;
  observacoes?: string;
}

const PublicAgendamento = () => {
  const { linkId } = useParams();
  const [profile, setProfile] = useState<ExtendedProfile | null>(null);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
    publicProfile: true,
    showPhone: true,
    showEmail: true,
    showSocialMedia: true
  });
  const [workingHours, setWorkingHours] = useState<WorkingHours | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    nome_paciente: '',
    telefone_paciente: '',
    email_paciente: '',
    data_hora: '',
    duracao_minutos: '60',
    observacoes: ''
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

  const fetchProfile = async () => {
    if (!linkId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('link_publico', linkId)
        .single();

      if (error) {
        console.error('Erro ao carregar perfil:', error);
      } else {
        const extendedProfile = loadExtendedProfile(data);
        setProfile(extendedProfile);
        
        // Carregar configurações de privacidade e horários
        loadPublicSettings(data.user_id);
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
    } finally {
      setLoading(false);
    }
  };

  // Recarrega working_hours sob demanda (usado ao abrir o modal)
  const reloadWorkingHours = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('working_hours')
        .eq('user_id', userId)
        .single();
      if (!error && data?.working_hours && typeof data.working_hours === 'object') {
        setWorkingHours(data.working_hours);
      }
    } catch {}
  };

  // Quando abrir o modal, recarregar working_hours para refletir alterações feitas nas Configurações abertas em outra aba
  useEffect(() => {
    if (modalOpen && profile) {
      reloadWorkingHours(profile.user_id);
    }
  }, [modalOpen, profile]);

  const loadPublicSettings = async (userId: string) => {
    try {
      // Usar o cliente Supabase sem autenticação para acessar configurações públicas
      const { data, error } = await supabase
        .from('user_settings')
        .select('privacy_public_profile, privacy_show_phone, privacy_show_email, privacy_show_social_media, working_hours')
        .eq('user_id', userId)
        .single();

      if (!error && data) {
        setPrivacySettings({
          publicProfile: data.privacy_public_profile ?? true,
          showPhone: data.privacy_show_phone ?? true,
          showEmail: data.privacy_show_email ?? true,
          showSocialMedia: data.privacy_show_social_media ?? true
        });
        // Se não houver working_hours (usuário novo), cai no default sem habilitar fins de semana
        if (data.working_hours && typeof data.working_hours === 'object') {
          setWorkingHours(data.working_hours);
        } else {
          setWorkingHours(defaultWorkingHours);
        }
      } else {
        // Se não conseguir carregar, usar valores padrão
        console.log('Usando configurações padrão de privacidade');
        setPrivacySettings({
          publicProfile: true,
          showPhone: true,
          showEmail: true,
          showSocialMedia: true
        });
        setWorkingHours(defaultWorkingHours);
      }
    } catch (error) {
      console.error('Erro ao carregar configurações de privacidade:', error);
      // Usar valores padrão em caso de erro
      setPrivacySettings({
        publicProfile: true,
        showPhone: true,
        showEmail: true,
        showSocialMedia: true
      });
      setWorkingHours(defaultWorkingHours);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [linkId]);

  // Verifica conflito com base nos agendamentos existentes
  const checkSchedulingConflict = (
    existingAppointments: Agendamento[],
    requestedStart: Date,
    requestedDurationMinutes: number
  ) => {
    const requestedEnd = new Date(
      requestedStart.getTime() + requestedDurationMinutes * 60000
    );

    return existingAppointments.find((appointment) => {
      if (appointment.status === 'cancelado') return false;
      const appointmentStart = parseISO(appointment.data_hora);
      const appointmentEnd = new Date(
        appointmentStart.getTime() + appointment.duracao_minutos * 60000
      );
      // Conflito apenas por sobreposição real (intervalos [start, end))
      return (
        requestedStart < appointmentEnd && requestedEnd > appointmentStart
      );
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    try {
      // Impedir agendamentos em datas/horários passados
      const now = new Date();
      const selected = new Date(form.data_hora);
      if (isNaN(selected.getTime())) {
        alert('Informe uma data e hora válidas.');
        setSaving(false);
        return;
      }
      if (selected < now) {
        alert('Não é permitido agendar em data/horário que já passou.');
        setSaving(false);
        return;
      }
      // Impedir salvar enquanto as configurações de horário não carregarem
      if (!workingHours) {
        alert('As configurações de horário do profissional ainda estão carregando. Tente novamente em alguns segundos.');
        setSaving(false);
        return;
      }
      // Converter a data/hora para o fuso horário local
      const dataHoraLocal = new Date(form.data_hora);

      // Busca mais recente de working_hours imediatamente antes de validar
      let effectiveWH = workingHours;
      try {
        const { data: freshWH } = await supabase
          .from('user_settings')
          .select('working_hours')
          .eq('user_id', profile.user_id)
          .single();
        if (freshWH?.working_hours && typeof freshWH.working_hours === 'object') {
          effectiveWH = freshWH.working_hours as any;
        }
      } catch {}
      if (!effectiveWH) effectiveWH = defaultWorkingHours;

      // Validar horário de atendimento do profissional
      {
        const weekday = dataHoraLocal.getDay(); // 0=Dom, 6=Sáb
        const keys = ['sun','mon','tue','wed','thu','fri','sat'] as const;
        const dayCfg = (effectiveWH as any)[keys[weekday]] as WorkingHoursDay;
        // Se não tiver config, considera desabilitado (seguro para novos usuários)
        if (!dayCfg || dayCfg.enabled === false) {
          alert('O profissional não atende neste dia. Escolha outro dia.');
          setSaving(false);
          return;
        }
        const [sh, sm] = dayCfg.start.split(':').map(Number);
        const [eh, em] = dayCfg.end.split(':').map(Number);
        const startMinutes = sh * 60 + sm;
        const endMinutes = eh * 60 + em;
        const curMinutes = dataHoraLocal.getHours() * 60 + dataHoraLocal.getMinutes();
        if (curMinutes < startMinutes || curMinutes >= endMinutes) {
          alert(`Horário fora do atendimento (${dayCfg.start} - ${dayCfg.end}).`);
          setSaving(false);
          return;
        }
      }
      const dayStart = startOfDay(dataHoraLocal);
      const dayEnd = endOfDay(dataHoraLocal);
      
      // Carrega agendamentos do mesmo dia para verificar conflitos
      const { data: existing, error: fetchError } = await supabase
        .from('agendamentos')
        .select('id, data_hora, duracao_minutos, status')
        .eq('user_id', profile.user_id)
        .gte('data_hora', dayStart.toISOString())
        .lte('data_hora', dayEnd.toISOString());

      if (fetchError) throw fetchError;

      const conflicting = checkSchedulingConflict(
        existing || [],
        dataHoraLocal,
        parseInt(form.duracao_minutos)
      );
      
      if (conflicting) {
        alert('Horário indisponível. Escolha outro horário que não sobreponha nenhum agendamento.');
        setSaving(false);
        return;
      }
      
      const agendamentoData = {
        nome_paciente: form.nome_paciente,
        telefone_paciente: form.telefone_paciente || null,
        email_paciente: form.email_paciente || null,
        data_hora: dataHoraLocal.toISOString(),
        duracao_minutos: parseInt(form.duracao_minutos),
        status: 'agendado',
        observacoes: form.observacoes || null,
        user_id: profile.user_id,
        agendamento_publico: true
      };

      const { error } = await supabase
        .from('agendamentos')
        .insert([agendamentoData]);
      
      if (error) throw error;

      setSuccess(true);
      setModalOpen(false);
      setForm({
        nome_paciente: '',
        telefone_paciente: '',
        email_paciente: '',
        data_hora: '',
        duracao_minutos: '60',
        observacoes: ''
      });
    } catch (error: any) {
      if (error?.code === '23P01') {
        alert('Horário já ocupado. Tente outro horário.');
      } else {
        console.error('Erro ao salvar agendamento:', error);
        alert('Não foi possível salvar o agendamento. Tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Link não encontrado</h2>
            <p className="text-muted-foreground">
              O link de agendamento não foi encontrado ou não está disponível.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verificar se o perfil público está desativado
  if (!privacySettings.publicProfile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Perfil Privado</h2>
            <p className="text-muted-foreground">
              Este perfil está configurado como privado e não está disponível para agendamentos públicos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Agendamento Realizado!</h2>
            <p className="text-muted-foreground mb-4">
              Seu agendamento foi realizado com sucesso. Você receberá uma confirmação em breve.
            </p>
            <Button 
              onClick={() => setSuccess(false)}
              className="w-full"
            >
              Fazer Novo Agendamento
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Agende sua Consulta</h1>
              <p className="text-muted-foreground">Preencha os dados para agendar sua consulta</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Informações do Profissional */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Dr. {profile.nome}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Foto de Perfil */}
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profile.foto_perfil} />
                    <AvatarFallback>
                      {profile.nome ? profile.nome.charAt(0).toUpperCase() : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div>
                    <h3 className="font-medium">{profile.nome}</h3>
                    {profile.especialidade && (
                      <Badge className="bg-primary text-primary-foreground">{profile.especialidade}</Badge>
                    )}
                  </div>
                </div>
                
                <div className="space-y-3">
                  {profile.telefone && privacySettings.showPhone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{profile.telefone}</span>
                    </div>
                  )}
                  
                  {privacySettings.showEmail && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{profile.email}</span>
                    </div>
                  )}
                </div>

                {/* Redes Sociais */}
                {privacySettings.showSocialMedia && (profile.instagram || profile.tiktok || profile.facebook || profile.linkedin) && (
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Redes Sociais</h4>
                    <div className="flex flex-wrap gap-2">
                      {profile.instagram && (
                        <Button variant="outline" size="sm" className="flex items-center gap-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white border-transparent hover:bg-gradient-to-r hover:from-purple-600 hover:to-pink-600">
                          <Instagram className="h-3 w-3" />
                          Instagram
                        </Button>
                      )}
                      {profile.tiktok && (
                        <Button variant="outline" size="sm" className="flex items-center gap-1 bg-black text-white border-transparent hover:bg-gray-900">
                          <Youtube className="h-3 w-3" />
                          TikTok
                        </Button>
                      )}
                      {profile.facebook && (
                        <Button variant="outline" size="sm" className="flex items-center gap-1 bg-blue-600 text-white border-transparent hover:bg-blue-700">
                          <Facebook className="h-3 w-3" />
                          Facebook
                        </Button>
                      )}
                      {profile.linkedin && (
                        <Button variant="outline" size="sm" className="flex items-center gap-1 bg-blue-700 text-white border-transparent hover:bg-blue-800">
                          <Linkedin className="h-3 w-3" />
                          LinkedIn
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Informações da Consulta</h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>Duração: 60 minutos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>Horário flexível</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Formulário de Agendamento */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Novo Agendamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full bg-primary hover:opacity-90">
                      <Calendar className="h-4 w-4 mr-2" />
                      Agendar Consulta
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <form onSubmit={handleSave} className="space-y-4">
                      <DialogHeader>
                        <DialogTitle>Agendar Consulta</DialogTitle>
                      </DialogHeader>
                      
                      <div className="space-y-2">
                        <Label htmlFor="nome_paciente">Nome Completo *</Label>
                        <Input
                          id="nome_paciente"
                          value={form.nome_paciente}
                          onChange={e => setForm(f => ({ ...f, nome_paciente: e.target.value }))}
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label htmlFor="telefone_paciente">Telefone</Label>
                          <Input
                            id="telefone_paciente"
                            value={form.telefone_paciente}
                            onChange={e => setForm(f => ({ ...f, telefone_paciente: e.target.value }))}
                            placeholder="(00) 00000-0000"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email_paciente">Email</Label>
                          <Input
                            id="email_paciente"
                            type="email"
                            value={form.email_paciente}
                            onChange={e => setForm(f => ({ ...f, email_paciente: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label htmlFor="data_hora">Data e Hora *</Label>
                          <Input
                            id="data_hora"
                            type="datetime-local"
                            value={form.data_hora}
                            onChange={e => setForm(f => ({ ...f, data_hora: e.target.value }))}
                          min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="duracao_minutos">Duração (min)</Label>
                          <Input
                            id="duracao_minutos"
                            type="number"
                            min="30"
                            step="30"
                            value={form.duracao_minutos}
                            onChange={e => setForm(f => ({ ...f, duracao_minutos: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="observacoes">Observações</Label>
                        <Textarea
                          id="observacoes"
                          value={form.observacoes}
                          onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                          rows={3}
                          placeholder="Informações adicionais sobre sua consulta..."
                        />
                      </div>

                      <DialogFooter>
                        <DialogClose asChild>
                          <Button type="button" variant="outline">Cancelar</Button>
                        </DialogClose>
                        <Button type="submit" disabled={saving} className="bg-primary hover:opacity-90">
                          {saving ? 'Salvando...' : 'Confirmar Agendamento'}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>

                <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                  <h4 className="font-medium text-purple-800 mb-2">Como funciona</h4>
                  <div className="space-y-2 text-sm text-purple-700">
                    <p>1. Preencha seus dados pessoais</p>
                    <p>2. Escolha a data e horário desejados</p>
                    <p>3. Confirme o agendamento</p>
                    <p>4. Aguarde a confirmação do profissional</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicAgendamento;