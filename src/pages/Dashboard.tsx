import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Calendar, Users, Clock, CheckCircle, Plus, Eye, EyeOff, Edit, Phone, Mail, MapPin, ArrowRight, Trash2, CalendarDays } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO, isToday, isTomorrow, isThisWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Stats {
  totalPacientes: number;
  agendamentosHoje: number;
  agendamentosProximos: number;
  agendamentosConcluidos: number;
}

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

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalPacientes: 0,
    agendamentosHoje: 0,
    agendamentosProximos: 0,
    agendamentosConcluidos: 0,
  });
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [filterPeriod, setFilterPeriod] = useState<string>('mes');
  const [showAgendamentos, setShowAgendamentos] = useState(true);
  const [selectedAgendamento, setSelectedAgendamento] = useState<Agendamento | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadStats();
      loadAgendamentos();
      // Verificar e atualizar agendamentos passados
      updatePastAgendamentos();
    }
  }, [user]);
  
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
        loadStats();
        loadAgendamentos();
      }
    } catch (error) {
      console.error('Erro ao processar agendamentos passados:', error);
    }
  };

  const loadStats = async () => {
    try {
      const hoje = new Date();
      const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      const fimHoje = new Date(inicioHoje.getTime() + 24 * 60 * 60 * 1000);

      // Total de pacientes
      const { count: totalPacientes } = await supabase
        .from('pacientes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id);

      // Agendamentos de hoje
      const { count: agendamentosHoje } = await supabase
        .from('agendamentos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .gte('data_hora', inicioHoje.toISOString())
        .lt('data_hora', fimHoje.toISOString())
        .neq('status', 'concluido')
        .neq('status', 'cancelado');

      // Agendamentos próximos (próximos 7 dias)
      const proximosSete = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
      const { count: agendamentosProximos } = await supabase
        .from('agendamentos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .gte('data_hora', hoje.toISOString())
        .lt('data_hora', proximosSete.toISOString())
        .neq('status', 'concluido')
        .neq('status', 'cancelado');

      // Agendamentos concluídos este mês
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const { count: agendamentosConcluidos } = await supabase
        .from('agendamentos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .eq('status', 'concluido')
        .gte('data_hora', inicioMes.toISOString());

      setStats({
        totalPacientes: totalPacientes || 0,
        agendamentosHoje: agendamentosHoje || 0,
        agendamentosProximos: agendamentosProximos || 0,
        agendamentosConcluidos: agendamentosConcluidos || 0,
      });
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    }
  };

  const loadAgendamentos = async () => {
    try {
      const hoje = new Date();
      let query = supabase
        .from('agendamentos')
        .select('*')
        .eq('user_id', user?.id)
        .order('data_hora', { ascending: true });

      // Sempre filtrar para mostrar apenas agendamentos futuros ou do dia atual
      query = query.gte('data_hora', hoje.toISOString());

      // Filtrar por período
      if (filterPeriod === 'hoje') {
        const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        const fimHoje = new Date(inicioHoje.getTime() + 24 * 60 * 60 * 1000);
        query = query.lt('data_hora', fimHoje.toISOString());
      } else if (filterPeriod === 'proximos') {
        const proximosSete = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
        query = query.lt('data_hora', proximosSete.toISOString());
      } else if (filterPeriod === 'semana') {
        const proximosSete = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
        query = query.lt('data_hora', proximosSete.toISOString());
      } else if (filterPeriod === 'mes') {
        const fimMes = endOfMonth(hoje);
        const fimMesMaisUmDia = new Date(fimMes.getTime() + 24 * 60 * 60 * 1000);
        query = query.lt('data_hora', fimMesMaisUmDia.toISOString());
      }

      // Filtrar por status
      if (filterStatus !== 'todos') {
        query = query.eq('status', filterStatus as 'agendado' | 'confirmado' | 'cancelado' | 'concluido');
      }
      // Se for 'todos', não aplicar filtro de status (mostrar todos os status)

      const { data, error } = await query;

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
      loadAgendamentos();
    }
  }, [user, filterStatus, filterPeriod]);

  const handleEditAgendamento = (agendamento: Agendamento) => {
    setSelectedAgendamento(agendamento);
    setEditModalOpen(true);
  };

  const handleDeleteAgendamento = async () => {
    if (!selectedAgendamento) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('agendamentos')
        .delete()
        .eq('id', selectedAgendamento.id);

      if (error) {
        console.error('Erro ao deletar agendamento:', error);
        alert('Erro ao deletar agendamento');
      } else {
        setDeleteModalOpen(false);
        setSelectedAgendamento(null);
        loadAgendamentos();
        loadStats();
      }
    } catch (error) {
      console.error('Erro ao deletar agendamento:', error);
      alert('Erro ao deletar agendamento');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: 'agendado' | 'confirmado' | 'cancelado' | 'concluido') => {
    if (!selectedAgendamento) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('agendamentos')
        .update({ status: newStatus })
        .eq('id', selectedAgendamento.id);

      if (error) {
        console.error('Erro ao atualizar status:', error);
        alert('Erro ao atualizar status');
      } else {
        setEditModalOpen(false);
        setSelectedAgendamento(null);
        loadAgendamentos();
        loadStats();
      }
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status');
    } finally {
      setSaving(false);
    }
  };

  const handleReschedule = () => {
    if (!selectedAgendamento) return;
    
    // Redirecionar para a página de agenda com o agendamento selecionado
    window.location.href = `/agenda?edit=${selectedAgendamento.id}`;
  };

  const getStatusColor = (status: 'agendado' | 'confirmado' | 'cancelado' | 'concluido') => {
    switch (status) {
      case 'agendado': return 'bg-green-100 text-green-800';
      case 'confirmado': return 'bg-purple-100 text-purple-800';
      case 'cancelado': return 'bg-red-100 text-red-800';
      case 'concluido': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: 'agendado' | 'confirmado' | 'cancelado' | 'concluido') => {
    switch (status) {
      case 'agendado': return 'Agendado';
      case 'confirmado': return 'Confirmado';
      case 'cancelado': return 'Cancelado';
      case 'concluido': return 'Concluído';
      default: return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = parseISO(dateString);
    if (isToday(date)) {
      return 'Hoje';
    } else if (isTomorrow(date)) {
      return 'Amanhã';
    } else if (isThisWeek(date)) {
      return format(date, 'EEEE', { locale: ptBR });
    } else {
      return format(date, 'dd/MM/yyyy', { locale: ptBR });
    }
  };

  const formatTime = (dateString: string) => {
    return format(parseISO(dateString), 'HH:mm');
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}min` : ''}` : `${mins}min`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-muted rounded animate-pulse"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded animate-pulse"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral do seu consultório
        </p>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Pacientes
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPacientes}</div>
            <p className="text-xs text-muted-foreground">
              Pacientes cadastrados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Agendamentos Hoje
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.agendamentosHoje}</div>
            <p className="text-xs text-muted-foreground">
              Consultas programadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Próximos 7 Dias
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.agendamentosProximos}</div>
            <p className="text-xs text-muted-foreground">
              Agendamentos futuros
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Concluídos (Mês)
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.agendamentosConcluidos}</div>
            <p className="text-xs text-muted-foreground">
              Consultas realizadas
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Próximos Agendamentos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Agendamentos</CardTitle>
                <CardDescription>
                  Suas consultas programadas
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setShowAgendamentos(!showAgendamentos)}
                >
                  {showAgendamentos ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.location.href = '/agenda'}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filtros */}
            <div className="flex gap-2 mb-4">
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="proximos">Próximos 7 dias</SelectItem>
                  <SelectItem value="semana">Esta semana</SelectItem>
                  <SelectItem value="mes">Este mês</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="confirmado">Confirmado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Lista de Agendamentos */}
            {showAgendamentos && (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {agendamentos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhum agendamento encontrado</p>
                    <p className="text-sm">Clique em "Novo" para criar um agendamento</p>
                  </div>
                ) : (
                  agendamentos.map((agendamento) => (
                    <div 
                      key={agendamento.id} 
                      className="p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => handleEditAgendamento(agendamento)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm">{agendamento.nome_paciente}</h4>
                            <Badge className={`text-xs ${getStatusColor(agendamento.status as 'agendado' | 'confirmado' | 'cancelado' | 'concluido')}`}>
                              {getStatusText(agendamento.status as 'agendado' | 'confirmado' | 'cancelado' | 'concluido')}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(agendamento.data_hora)} às {formatTime(agendamento.data_hora)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(agendamento.duracao_minutos)}
                            </div>
                          </div>

                          {/* Informações de Contato */}
                          {(agendamento.telefone_paciente || agendamento.email_paciente) && (
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
                          )}

                          {agendamento.observacoes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {agendamento.observacoes}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-1 ml-2">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditAgendamento(agendamento);
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {!showAgendamentos && (
              <div className="text-center py-8 text-muted-foreground">
                <EyeOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Agendamentos ocultos</p>
                <p className="text-sm">Clique no ícone do olho para mostrar</p>
              </div>
            )}

            {showAgendamentos && agendamentos.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => window.location.href = '/agenda'}
                >
                  Ver Todos os Agendamentos
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ações Rápidas */}
        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
            <CardDescription>
              Acesso rápido às principais funcionalidades
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-start h-auto p-4"
                onClick={() => window.location.href = '/agenda'}
              >
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">Visualizar Agenda</p>
                    <p className="text-sm text-muted-foreground">Ver todos os agendamentos</p>
                  </div>
                </div>
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start h-auto p-4"
                onClick={() => window.location.href = '/pacientes'}
              >
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">Gerenciar Pacientes</p>
                    <p className="text-sm text-muted-foreground">Cadastrar e editar pacientes</p>
                  </div>
                </div>
              </Button>

              <Button 
                variant="outline" 
                className="w-full justify-start h-auto p-4"
                onClick={() => window.location.href = '/link-publico'}
              >
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">Link Público</p>
                    <p className="text-sm text-muted-foreground">Compartilhar link de agendamento</p>
                  </div>
                </div>
              </Button>

              <Button 
                variant="outline" 
                className="w-full justify-start h-auto p-4"
                onClick={() => window.location.href = '/configuracoes'}
              >
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">Configurações</p>
                    <p className="text-sm text-muted-foreground">Gerenciar preferências</p>
                  </div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Edição */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerenciar Agendamento</DialogTitle>
            <DialogDescription>
              {selectedAgendamento && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Paciente:</span>
                      <span>{selectedAgendamento.nome_paciente}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Data/Hora:</span>
                      <span>{formatDate(selectedAgendamento.data_hora)} às {formatTime(selectedAgendamento.data_hora)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Duração:</span>
                      <span>{formatDuration(selectedAgendamento.duracao_minutos)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Status:</span>
                      <Badge className={getStatusColor(selectedAgendamento.status as 'agendado' | 'confirmado' | 'cancelado' | 'concluido')}>
                        {getStatusText(selectedAgendamento.status as 'agendado' | 'confirmado' | 'cancelado' | 'concluido')}
                      </Badge>
                    </div>
                    {selectedAgendamento.observacoes && (
                      <div className="flex justify-between">
                        <span className="font-medium">Observações:</span>
                        <span className="text-sm text-muted-foreground max-w-xs truncate">
                          {selectedAgendamento.observacoes}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={handleReschedule}
                disabled={saving}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                <CalendarDays className="h-4 w-4" />
                Reagendar
              </Button>
              <Button
                variant="outline"
                onClick={() => handleStatusChange('confirmado')}
                disabled={saving || selectedAgendamento?.status === 'confirmado'}
                className="w-full sm:w-auto"
              >
                Confirmar
              </Button>
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => handleStatusChange('concluido')}
                disabled={saving || selectedAgendamento?.status === 'concluido'}
                className="w-full sm:w-auto"
              >
                Concluir
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setEditModalOpen(false);
                  setDeleteModalOpen(true);
                }}
                disabled={saving}
                className="flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Trash2 className="h-4 w-4" />
                Excluir
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteAgendamento} disabled={saving}>
              {saving ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;