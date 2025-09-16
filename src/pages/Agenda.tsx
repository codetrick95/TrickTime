import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, Calendar, Plus, Edit, Trash2, Clock, User, Phone, Mail, Grid, List, CalendarDays } from 'lucide-react';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, addYears, subYears, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO, isSameDay, isSameWeek, isSameMonth, isSameYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Agendamento {
  id: string;
  nome_paciente: string;
  telefone_paciente?: string;
  email_paciente?: string;
  data_hora: string;
  duracao_minutos: number;
  status: 'agendado' | 'confirmado' | 'cancelado' | 'concluido';
  observacoes?: string;
  created_at: string;
}

type ViewMode = 'daily' | 'weekly' | 'monthly' | 'yearly';

const Agenda = () => {
  const { user } = useAuth();
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editAgendamento, setEditAgendamento] = useState<Agendamento | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [saving, setSaving] = useState(false);
  const [dayAgendamentosModalOpen, setDayAgendamentosModalOpen] = useState(false);
  const [selectedDayAgendamentos, setSelectedDayAgendamentos] = useState<Agendamento[]>([]);
  const [selectedDayForModal, setSelectedDayForModal] = useState<Date | null>(null);

  const [form, setForm] = useState({
    nome_paciente: '',
    telefone_paciente: '',
    email_paciente: '',
    data_hora: '',
    duracao_minutos: '60',
    status: 'agendado' as 'agendado' | 'confirmado' | 'cancelado' | 'concluido',
    observacoes: ''
  });

  // Horários disponíveis
  const horarios = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'
  ];

  const statusColors = {
    agendado: 'bg-green-100 text-green-800',
    confirmado: 'bg-purple-100 text-purple-800',
    cancelado: 'bg-red-100 text-red-800',
    concluido: 'bg-gray-100 text-gray-800'
  };

  // Função para capitalizar a primeira letra do nome
  const capitalizeName = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  };

  // Horários de atendimento do profissional (do próprio usuário)
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
  const [workingHours, setWorkingHours] = useState<WorkingHours | null>(null);

  // Carregar working_hours do Supabase para o usuário logado
  useEffect(() => {
    const loadWorkingHours = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('user_settings')
        .select('working_hours')
        .eq('user_id', user.id)
        .single();
      if (data?.working_hours && typeof data.working_hours === 'object') {
        setWorkingHours(data.working_hours as WorkingHours);
      } else {
        setWorkingHours(defaultWorkingHours);
      }
    };
    loadWorkingHours();
  }, [user]);

  // Função para verificar conflitos de agendamento (apenas sobreposição real)
  const checkSchedulingConflict = (dataHora: Date, duracaoMinutos: number, excludeId?: string) => {
    const startTime = dataHora;
    const endTime = new Date(startTime.getTime() + duracaoMinutos * 60000);
    
    // Verificar se há agendamentos no mesmo horário ou com sobreposição
    const conflictingAppointment = agendamentos.find(agendamento => {
      if (excludeId && agendamento.id === excludeId) return false;
      
      const appointmentStart = parseISO(agendamento.data_hora);
      const appointmentEnd = new Date(appointmentStart.getTime() + agendamento.duracao_minutos * 60000);
      
      // Verificar sobreposição estrita (intervalos [start, end))
      return (startTime < appointmentEnd && endTime > appointmentStart);
    });
    
    return conflictingAppointment;
  };

  // Verificar conflitos contra o banco (mais robusto, cobre visões diferentes)
  const checkConflictFromDatabase = async (
    dataHora: Date,
    duracaoMinutos: number,
    excludeId?: string
  ) => {
    if (!user) return null;
    const dayStart = startOfDay(dataHora);
    const dayEnd = endOfDay(dataHora);

    const { data, error } = await supabase
      .from('agendamentos')
      .select('id, data_hora, duracao_minutos, status')
      .eq('user_id', user.id)
      .gte('data_hora', dayStart.toISOString())
      .lte('data_hora', dayEnd.toISOString());

    if (error) {
      console.error('Erro ao checar conflitos no banco:', error);
      return null;
    }

    const startTime = dataHora;
    const endTime = new Date(startTime.getTime() + duracaoMinutos * 60000);

    return (data || []).find((agendamento) => {
      if (excludeId && agendamento.id === excludeId) return false;
      if (agendamento.status === 'cancelado') return false;
      const appointmentStart = parseISO(agendamento.data_hora);
      const appointmentEnd = new Date(
        appointmentStart.getTime() + agendamento.duracao_minutos * 60000
      );
      return startTime < appointmentEnd && endTime > appointmentStart;
    }) || null;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'agendado': return 'Agendado';
      case 'confirmado': return 'Confirmado';
      case 'cancelado': return 'Cancelado';
      case 'concluido': return 'Concluído';
      default: return status;
    }
  };

  // Verificar se há parâmetro de edição na URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    
    if (editId && user) {
      fetchAgendamentoForEdit(editId);
    }
  }, [user]);

  const fetchAgendamentoForEdit = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('*')
        .eq('id', id)
        .eq('user_id', user?.id)
        .single();

      if (error) {
        console.error('Erro ao carregar agendamento para edição:', error);
        return;
      }

      if (data) {
        setEditAgendamento(data);
        setForm({
          nome_paciente: data.nome_paciente,
          telefone_paciente: data.telefone_paciente || '',
          email_paciente: data.email_paciente || '',
          data_hora: format(parseISO(data.data_hora), "yyyy-MM-dd'T'HH:mm"),
          duracao_minutos: data.duracao_minutos.toString(),
          status: data.status,
          observacoes: data.observacoes || ''
        });
        setModalOpen(true);
        
        // Limpar o parâmetro da URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    } catch (error) {
      console.error('Erro ao carregar agendamento para edição:', error);
    }
  };

  const fetchAgendamentos = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      let startDate: Date;
      let endDate: Date;
      const now = new Date(); // Data atual para filtrar agendamentos passados

      switch (viewMode) {
        case 'daily':
          startDate = startOfDay(selectedDate);
          endDate = endOfDay(selectedDate);
          break;
        case 'weekly':
          startDate = startOfWeek(selectedDate, { locale: ptBR });
          endDate = endOfWeek(selectedDate, { locale: ptBR });
          break;
        case 'monthly':
          startDate = startOfMonth(selectedDate);
          endDate = endOfMonth(selectedDate);
          break;
        case 'yearly':
          startDate = startOfYear(selectedDate);
          endDate = endOfYear(selectedDate);
          break;
        default:
          startDate = startOfDay(selectedDate);
          endDate = endOfDay(selectedDate);
      }
      
      // Garantir que não exibimos agendamentos passados
      // Se a data de início for anterior à data atual, usamos a data atual como início
      if (startDate < now) {
        startDate = now;
      }
      
      const { data, error } = await supabase
        .from('agendamentos')
        .select('*')
        .eq('user_id', user.id)
        .gte('data_hora', startDate.toISOString())
        .lte('data_hora', endDate.toISOString())
        .in('status', ['agendado', 'confirmado'])
        .order('data_hora', { ascending: true });

      if (error) {
        console.error('Erro ao carregar agendamentos:', error);
      } else {
        setAgendamentos(data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      // Verificar e atualizar agendamentos passados
      updatePastAgendamentos();
      fetchAgendamentos();
    }
  }, [user, selectedDate, viewMode]);
  
  // Função para atualizar automaticamente agendamentos passados para concluídos
  const updatePastAgendamentos = async () => {
    try {
      const agora = new Date();
      
      // Buscar agendamentos passados que não estão concluídos ou cancelados
      const { data, error } = await supabase
        .from('agendamentos')
        .select('*')
        .eq('user_id', user?.id)
        .lt('data_hora', agora.toISOString())
        .not('status', 'in', '("concluido","cancelado")');
      
      if (error) {
        console.error('Erro ao buscar agendamentos passados:', error);
        return;
      }
      
      // Atualizar cada agendamento passado para concluído
      if (data && data.length > 0) {
        for (const agendamento of data) {
          const { error: updateError } = await supabase
            .from('agendamentos')
            .update({ status: 'concluido' })
            .eq('id', agendamento.id);
          
          if (updateError) {
            console.error('Erro ao atualizar agendamento passado:', updateError);
          }
        }
        
        // Recarregar dados após as atualizações
        fetchAgendamentos();
      }
    } catch (error) {
      console.error('Erro ao processar agendamentos passados:', error);
    }
  };

  const openNew = () => {
    setEditAgendamento(null);
    setForm({
      nome_paciente: '',
      telefone_paciente: '',
      email_paciente: '',
      data_hora: format(selectedDate, "yyyy-MM-dd'T'HH:mm"),
      duracao_minutos: '60',
      status: 'agendado',
      observacoes: ''
    });
    setModalOpen(true);
  };

  const openEdit = (agendamento: Agendamento) => {
    setEditAgendamento(agendamento);
    setForm({
      nome_paciente: agendamento.nome_paciente,
      telefone_paciente: agendamento.telefone_paciente || '',
      email_paciente: agendamento.email_paciente || '',
      data_hora: format(parseISO(agendamento.data_hora), "yyyy-MM-dd'T'HH:mm"),
      duracao_minutos: String(agendamento.duracao_minutos),
      status: agendamento.status as 'agendado' | 'confirmado' | 'cancelado' | 'concluido',
      observacoes: agendamento.observacoes || ''
    });
    setModalOpen(true);
  };
  
  const openDayAgendamentosModal = (day: Date, agendamentos: Agendamento[]) => {
    setSelectedDayForModal(day);
    setSelectedDayAgendamentos(agendamentos);
    setDayAgendamentosModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      // Converter a data/hora para o fuso horário local
      const dataHoraLocal = new Date(form.data_hora);
      const now = new Date();
      // Impedir criar agendamento no passado
      if (dataHoraLocal < now && !editAgendamento) {
        alert('Não é possível criar agendamentos no passado.');
        setSaving(false);
        return;
      }
      // Impedir mover para o passado quando editando
      if (editAgendamento && dataHoraLocal < now) {
        alert('Não é possível alterar para uma data/horário no passado.');
        setSaving(false);
        return;
      }

      // Validar horário de atendimento do profissional (respeitar Configurações)
      {
        const effectiveWH = workingHours ?? defaultWorkingHours;
        const weekday = dataHoraLocal.getDay(); // 0=Dom, 6=Sáb
        const keys = ['sun','mon','tue','wed','thu','fri','sat'] as const;
        const dayCfg = (effectiveWH as any)[keys[weekday]] as WorkingHoursDay | undefined;
        if (!dayCfg || dayCfg.enabled === false) {
          alert('Seu horário de atendimento indica que você não atende neste dia. Ajuste em Configurações > Horário de Atendimento.');
          setSaving(false);
          return;
        }
        const [sh, sm] = dayCfg.start.split(':').map(Number);
        const [eh, em] = dayCfg.end.split(':').map(Number);
        const startMinutes = sh * 60 + sm;
        const endMinutes = eh * 60 + em;
        const curMinutes = dataHoraLocal.getHours() * 60 + dataHoraLocal.getMinutes();
        if (curMinutes < startMinutes || curMinutes >= endMinutes) {
          alert(`Horário fora do seu atendimento (${dayCfg.start} - ${dayCfg.end}). Ajuste em Configurações > Horário de Atendimento.`);
          setSaving(false);
          return;
        }
      }
      
      // Verificar conflitos de agendamento em memória
      const conflictingAppointment = checkSchedulingConflict(
        dataHoraLocal, 
        parseInt(form.duracao_minutos), 
        editAgendamento?.id
      );
      
      if (conflictingAppointment) {
        alert(`Conflito de agendamento! Já existe um agendamento às ${formatTime(conflictingAppointment.data_hora)}. Escolha outro horário que não sobreponha.`);
        setSaving(false);
        return;
      }

      // Verificar conflitos consultando o banco (robusto contra visão diferente/estado desatualizado)
      const dbConflict = await checkConflictFromDatabase(
        dataHoraLocal,
        parseInt(form.duracao_minutos),
        editAgendamento?.id
      );
      if (dbConflict) {
        alert('Horário indisponível. Escolha outro horário que não sobreponha nenhum agendamento.');
        setSaving(false);
        return;
      }
      
      const agendamentoData = {
        nome_paciente: capitalizeName(form.nome_paciente),
        telefone_paciente: form.telefone_paciente || null,
        email_paciente: form.email_paciente || null,
        data_hora: dataHoraLocal.toISOString(),
        duracao_minutos: parseInt(form.duracao_minutos),
        status: form.status,
        observacoes: form.observacoes || null,
        user_id: user.id
      };

      if (editAgendamento) {
        const { error } = await supabase
          .from('agendamentos')
          .update(agendamentoData)
          .eq('id', editAgendamento.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agendamentos')
          .insert([agendamentoData]);
        
        if (error) throw error;
      }

      setModalOpen(false);
      fetchAgendamentos();
    } catch (error: any) {
      if (error?.code === '23P01') {
        alert('Horário já ocupado. Tente outro horário.');
      } else {
        console.error('Erro ao salvar agendamento:', error);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    try {
      const { error } = await supabase
        .from('agendamentos')
        .delete()
        .eq('id', deleteId);
      
      if (error) throw error;
      
      setDeleteId(null);
      fetchAgendamentos();
    } catch (error) {
      console.error('Erro ao excluir agendamento:', error);
    }
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    switch (viewMode) {
      case 'daily':
        setSelectedDate(prev => 
          direction === 'prev' ? subDays(prev, 1) : addDays(prev, 1)
        );
        break;
      case 'weekly':
        setSelectedDate(prev => 
          direction === 'prev' ? subWeeks(prev, 1) : addWeeks(prev, 1)
        );
        break;
      case 'monthly':
        setSelectedDate(prev => 
          direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)
        );
        break;
      case 'yearly':
        setSelectedDate(prev => 
          direction === 'prev' ? subYears(prev, 1) : addYears(prev, 1)
        );
        break;
    }
  };

  const getAgendamentosForDate = (date: Date) => {
    return agendamentos.filter(agendamento => {
      const agendamentoDate = parseISO(agendamento.data_hora);
      return isSameDay(agendamentoDate, date);
    });
  };

  const getAgendamentosForWeek = (weekStart: Date) => {
    return agendamentos.filter(agendamento => {
      const agendamentoDate = parseISO(agendamento.data_hora);
      return isSameWeek(agendamentoDate, weekStart, { locale: ptBR });
    });
  };

  const getAgendamentosForMonth = (monthStart: Date) => {
    return agendamentos.filter(agendamento => {
      const agendamentoDate = parseISO(agendamento.data_hora);
      return isSameMonth(agendamentoDate, monthStart);
    });
  };

  const getAgendamentosForYear = (yearStart: Date) => {
    return agendamentos.filter(agendamento => {
      const agendamentoDate = parseISO(agendamento.data_hora);
      return isSameYear(agendamentoDate, yearStart);
    });
  };

  const formatTime = (dateString: string) => {
    const date = parseISO(dateString);
    return format(date, 'HH:mm');
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}min` : ''}` : `${mins}min`;
  };

  const getViewTitle = () => {
    switch (viewMode) {
      case 'daily':
        return format(selectedDate, 'EEEE, dd \'de\' MMMM \'de\' yyyy', { locale: ptBR });
      case 'weekly':
        const weekStart = startOfWeek(selectedDate, { locale: ptBR });
        const weekEnd = endOfWeek(selectedDate, { locale: ptBR });
        return `${format(weekStart, 'dd/MM', { locale: ptBR })} - ${format(weekEnd, 'dd/MM/yyyy', { locale: ptBR })}`;
      case 'monthly':
        return format(selectedDate, 'MMMM \'de\' yyyy', { locale: ptBR });
      case 'yearly':
        return format(selectedDate, 'yyyy', { locale: ptBR });
      default:
        return '';
    }
  };

  const renderDailyView = () => {
    const dayAgendamentos = getAgendamentosForDate(selectedDate);
    
    return (
      <div className="space-y-3">
        {horarios.map(horario => {
          const [hora, minuto] = horario.split(':').map(Number);
          const dataHora = new Date(selectedDate);
          dataHora.setHours(hora, minuto, 0, 0);
          
          const agendamento = dayAgendamentos.find(a => {
            const agendamentoHora = parseISO(a.data_hora);
            return agendamentoHora.getHours() === hora && 
                   agendamentoHora.getMinutes() === minuto;
          });

          return (
            <div key={horario} className="flex items-center border-b border-gray-100 py-3">
              <div className="w-20 text-sm font-medium text-gray-600">
                {horario}
              </div>
              <div className="flex-1">
                {agendamento ? (
                  <div className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors ${
                    agendamento.status === 'agendado' 
                      ? 'bg-green-50 border-green-200 hover:bg-green-100' 
                      : agendamento.status === 'confirmado'
                      ? 'bg-purple-50 border-purple-200 hover:bg-purple-100'
                      : agendamento.status === 'cancelado'
                      ? 'bg-red-50 border-red-200 hover:bg-red-100'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                  onClick={() => openEdit(agendamento)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <User className={`h-4 w-4 ${
                          agendamento.status === 'agendado' ? 'text-green-600' :
                          agendamento.status === 'confirmado' ? 'text-purple-600' :
                          agendamento.status === 'cancelado' ? 'text-red-600' :
                          'text-gray-600'
                        }`} />
                        <span className="font-bold text-lg">
                          {agendamento.nome_paciente}
                        </span>
                        <Badge className={statusColors[agendamento.status]}>
                          {getStatusText(agendamento.status)}
                        </Badge>
                      </div>
                      
                      <div className={`flex items-center gap-4 text-sm ${
                        agendamento.status === 'agendado' ? 'text-green-600' :
                        agendamento.status === 'confirmado' ? 'text-purple-600' :
                        agendamento.status === 'cancelado' ? 'text-red-600' :
                        'text-gray-600'
                      }`}>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(agendamento.duracao_minutos)}
                        </div>
                        
                        {agendamento.telefone_paciente && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {agendamento.telefone_paciente}
                          </div>
                        )}
                        
                        {agendamento.email_paciente && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {agendamento.email_paciente}
                          </div>
                        )}
                      </div>
                      
                      {agendamento.observacoes && (
                        <p className="text-sm text-gray-600 mt-2">
                          {agendamento.observacoes}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(agendamento);
                        }}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteId(agendamento.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Excluir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                          </AlertDialogHeader>
                          <div>
                            Tem certeza que deseja excluir o agendamento de{' '}
                            <strong>{agendamento.nome_paciente}</strong>?
                          </div>
                          <AlertDialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setDeleteId(null)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={handleDelete}
                            >
                              Excluir
                            </Button>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm py-4">
                    Horário livre
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderWeeklyView = () => {
    const weekStart = startOfWeek(selectedDate, { locale: ptBR });
    const weekDays = eachDayOfInterval({
      start: weekStart,
      end: endOfWeek(selectedDate, { locale: ptBR })
    });

    return (
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day, index) => {
          const dayAgendamentos = getAgendamentosForDate(day);
          const isToday = isSameDay(day, new Date());
          
          return (
            <div key={index} className={`p-2 border rounded-lg ${isToday ? 'bg-purple-50 border-purple-200' : ''}`}>
              <div className="text-center mb-2">
                <div className="text-xs text-gray-500">
                  {format(day, 'EEE', { locale: ptBR })}
                </div>
                <div className={`font-medium ${isToday ? 'text-purple-600' : ''}`}>
                  {format(day, 'dd')}
                </div>
              </div>
              
              <div className="space-y-1">
                {dayAgendamentos.slice(0, 3).map((agendamento) => (
                  <div 
                    key={agendamento.id} 
                    className={`text-xs p-2 rounded cursor-pointer transition-colors ${
                      agendamento.status === 'agendado' 
                        ? 'bg-green-100 hover:bg-green-200' 
                        : agendamento.status === 'confirmado'
                        ? 'bg-purple-100 hover:bg-purple-200'
                        : agendamento.status === 'cancelado'
                        ? 'bg-red-100 hover:bg-red-200'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                    onClick={() => openEdit(agendamento)}
                  >
                    <div className={`font-bold truncate ${
                      agendamento.status === 'agendado' ? 'text-green-800' :
                      agendamento.status === 'confirmado' ? 'text-purple-800' :
                      agendamento.status === 'cancelado' ? 'text-red-800' :
                      'text-gray-800'
                    }`}>
                      {agendamento.nome_paciente}
                    </div>
                    <div className="text-gray-600 text-xs">
                      {formatTime(agendamento.data_hora)}
                    </div>
                    <div className={`text-xs px-1 py-0.5 rounded mt-1 inline-block ${statusColors[agendamento.status]}`}>
                      {getStatusText(agendamento.status)}
                    </div>
                    {agendamento.observacoes && (
                      <div className="text-xs text-gray-500 mt-1 truncate">
                        {agendamento.observacoes}
                      </div>
                    )}
                  </div>
                ))}
                {dayAgendamentos.length > 3 && (
                  <div 
                    className="text-xs text-gray-500 text-center cursor-pointer hover:text-purple-600 hover:underline"
                    onClick={() => openDayAgendamentosModal(day, dayAgendamentos)}
                  >
                    +{dayAgendamentos.length - 3} mais
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMonthlyView = () => {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    
    // Calcular o início da semana que contém o primeiro dia do mês
    const calendarStart = startOfWeek(monthStart, { locale: ptBR });
    const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });
    
    // Gerar todos os dias do calendário (incluindo dias de outros meses)
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <div className="grid grid-cols-7 gap-1">
        {/* Cabeçalho dos dias da semana */}
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
          <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
            {day}
          </div>
        ))}
        
        {/* Dias do calendário */}
        {calendarDays.map((day, index) => {
          const dayAgendamentos = getAgendamentosForDate(day);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, selectedDate);
          
          return (
            <div 
              key={index} 
              className={`p-2 border rounded-lg min-h-[80px] ${
                isToday ? 'bg-purple-50 border-purple-200' : ''
              } ${!isCurrentMonth ? 'bg-gray-50' : ''}`}
            >
              <div className={`text-right text-sm ${!isCurrentMonth ? 'text-gray-400' : ''}`}>
                {format(day, 'dd')}
              </div>
              
              <div className="space-y-1 mt-1">
                {dayAgendamentos.slice(0, 2).map((agendamento) => (
                  <div 
                    key={agendamento.id} 
                    className={`text-xs p-2 rounded cursor-pointer transition-colors ${
                      agendamento.status === 'agendado' 
                        ? 'bg-green-100 hover:bg-green-200' 
                        : agendamento.status === 'confirmado'
                        ? 'bg-purple-100 hover:bg-purple-200'
                        : agendamento.status === 'cancelado'
                        ? 'bg-red-100 hover:bg-red-200'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                    onClick={() => openEdit(agendamento)}
                  >
                    <div className={`font-bold truncate ${
                      agendamento.status === 'agendado' ? 'text-green-800' :
                      agendamento.status === 'confirmado' ? 'text-purple-800' :
                      agendamento.status === 'cancelado' ? 'text-red-800' :
                      'text-gray-800'
                    }`}>
                      {agendamento.nome_paciente}
                    </div>
                    <div className="text-gray-600 text-xs">
                      {formatTime(agendamento.data_hora)}
                    </div>
                    <div className={`text-xs px-1 py-0.5 rounded mt-1 inline-block ${statusColors[agendamento.status]}`}>
                      {getStatusText(agendamento.status)}
                    </div>
                    {agendamento.observacoes && (
                      <div className="text-xs text-gray-500 mt-1 truncate">
                        {agendamento.observacoes}
                      </div>
                    )}
                  </div>
                ))}
                {dayAgendamentos.length > 2 && (
                  <div 
                    className="text-xs text-gray-500 text-center cursor-pointer hover:text-purple-600 hover:underline"
                    onClick={() => openDayAgendamentosModal(day, dayAgendamentos)}
                  >
                    +{dayAgendamentos.length - 2} mais
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderYearlyView = () => {
    const yearAgendamentos = getAgendamentosForYear(selectedDate);
    const months = eachMonthOfInterval({
      start: startOfYear(selectedDate),
      end: endOfYear(selectedDate)
    });

    return (
      <div className="grid grid-cols-3 gap-4">
        {months.map((month, index) => {
          const monthAgendamentos = yearAgendamentos.filter(agendamento => {
            const agendamentoDate = parseISO(agendamento.data_hora);
            return isSameMonth(agendamentoDate, month);
          });
          
          const isCurrentMonth = isSameMonth(month, new Date());
          
          return (
            <div key={index} className={`p-4 border rounded-lg ${isCurrentMonth ? 'bg-purple-50 border-purple-200' : ''}`}>
              <div className="text-center mb-3">
                <div className="font-medium">{format(month, 'MMMM', { locale: ptBR })}</div>
                <div className="text-sm text-gray-500">{monthAgendamentos.length} agendamentos</div>
              </div>
              
              <div className="space-y-2">
                {monthAgendamentos.slice(0, 3).map((agendamento) => (
                  <div key={agendamento.id} className="text-sm p-2 bg-green-100 rounded">
                    <div className="font-medium">{agendamento.nome_paciente}</div>
                    <div className="text-gray-600">
                      {format(parseISO(agendamento.data_hora), 'dd/MM HH:mm')}
                    </div>
                  </div>
                ))}
                {monthAgendamentos.length > 3 && (
                  <div 
                    className="text-xs text-gray-500 text-center cursor-pointer hover:text-purple-600 hover:underline"
                    onClick={() => openDayAgendamentosModal(month, monthAgendamentos)}
                  >
                    +{monthAgendamentos.length - 3} mais
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground">
            Gerencie seus agendamentos e consultas
          </p>
        </div>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="bg-primary hover:opacity-90">
              <Plus className="h-4 w-4 mr-2" />
              Novo Agendamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <form onSubmit={handleSave} className="space-y-4">
              <DialogHeader>
                <DialogTitle>
                  {editAgendamento ? 'Editar Agendamento' : 'Novo Agendamento'}
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-2">
                <Label htmlFor="nome_paciente">Nome do Paciente *</Label>
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
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duracao_minutos">Duração (min)</Label>
                  <Input
                    id="duracao_minutos"
                    type="number"
                    min="15"
                    step="15"
                    value={form.duracao_minutos}
                    onChange={e => setForm(f => ({ ...f, duracao_minutos: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={form.status} onValueChange={(value: any) => setForm(f => ({ ...f, status: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendado">Agendado</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={form.observacoes}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={3}
                />
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

      {/* Controles de Visualização */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                <TabsList>
                  <TabsTrigger value="daily" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Diário
                  </TabsTrigger>
                  <TabsTrigger value="weekly" className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Semanal
                  </TabsTrigger>
                  <TabsTrigger value="monthly" className="flex items-center gap-2">
                    <Grid className="h-4 w-4" />
                    Mensal
                  </TabsTrigger>
                  <TabsTrigger value="yearly" className="flex items-center gap-2">
                    <List className="h-4 w-4" />
                    Anual
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDate('prev')}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Anterior
              </Button>
              
              <div className="text-center">
                <h2 className="text-xl font-semibold">
                  {getViewTitle()}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {agendamentos.length} agendamento{agendamentos.length !== 1 ? 's' : ''}
                </p>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDate('next')}
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visualização da Agenda */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Agenda
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-muted-foreground">Carregando agendamentos...</p>
            </div>
          ) : (
            <div>
              {viewMode === 'daily' && renderDailyView()}
              {viewMode === 'weekly' && renderWeeklyView()}
              {viewMode === 'monthly' && renderMonthlyView()}
              {viewMode === 'yearly' && renderYearlyView()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal para exibir todos os agendamentos de um dia */}
      <Dialog open={dayAgendamentosModalOpen} onOpenChange={setDayAgendamentosModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {selectedDayForModal && (
                <>Agendamentos de {format(selectedDayForModal, 'dd/MM/yyyy', { locale: ptBR })}</>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="max-h-[60vh] overflow-y-auto space-y-4 py-2">
            {selectedDayAgendamentos.map((agendamento) => (
              <div 
                key={agendamento.id} 
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  agendamento.status === 'agendado' 
                    ? 'bg-green-50 border-green-200 hover:bg-green-100' 
                    : agendamento.status === 'confirmado'
                    ? 'bg-purple-50 border-purple-200 hover:bg-purple-100'
                    : agendamento.status === 'cancelado'
                    ? 'bg-red-50 border-red-200 hover:bg-red-100'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
                onClick={() => {
                  setDayAgendamentosModalOpen(false);
                  openEdit(agendamento);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <User className={`h-4 w-4 ${
                        agendamento.status === 'agendado' ? 'text-green-600' :
                        agendamento.status === 'confirmado' ? 'text-purple-600' :
                        agendamento.status === 'cancelado' ? 'text-red-600' :
                        'text-gray-600'
                      }`} />
                      <span className="font-bold text-lg">
                        {agendamento.nome_paciente}
                      </span>
                      <Badge className={statusColors[agendamento.status]}>
                        {getStatusText(agendamento.status)}
                      </Badge>
                    </div>
                    
                    <div className={`flex items-center gap-4 text-sm ${
                      agendamento.status === 'agendado' ? 'text-green-600' :
                      agendamento.status === 'confirmado' ? 'text-purple-600' :
                      agendamento.status === 'cancelado' ? 'text-red-600' :
                      'text-gray-600'
                    }`}>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(agendamento.data_hora)} - {formatDuration(agendamento.duracao_minutos)}
                      </div>
                      
                      {agendamento.telefone_paciente && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {agendamento.telefone_paciente}
                        </div>
                      )}
                      
                      {agendamento.email_paciente && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {agendamento.email_paciente}
                        </div>
                      )}
                    </div>
                    
                    {agendamento.observacoes && (
                      <p className="text-sm text-gray-600 mt-2">
                        {agendamento.observacoes}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDayAgendamentosModalOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Agenda;