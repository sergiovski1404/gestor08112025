import React from 'react';

export type Tab = 'painel' | 'beneficiarios' | 'educadores' | 'oficinas' | 'relatorios' | 'calendario' | 'integracao' | 'frequencia' | 'gerenciador-horarios' | 'comunicacao';

export type AttendanceStatus = 'present' | 'absent' | 'justified';

export interface Beneficiary {
  id: string;
  name: string;
  registration: string;
  cpf: string;
  phone: string;
  birthDate: string; // YYYY-MM-DD
  gender: 'Masculino' | 'Feminino';
  workshopIds: string[];
  physicalFileLocation?: string;
}

export interface Educator {
  id: string;
  name: string;
  specialty: string;
  workload: number;
}

export interface Workshop {
  id: string;
  name: string;
  ageGroup: string;
  days: string[];
  time: string;
  status: 'Ativo' | 'Inativo';
  educatorId: string;
  maxCapacity: number;
  color: string;
  category: 'Esporte' | 'Arte e Cultura' | 'Administrativo';
  physicalFileLocation?: string;
}

export interface Frequency {
    workshopId: string;
    date: string; // YYYY-MM-DD
    attendance: Record<string, AttendanceStatus>;
}

export interface ReportDataStats {
    [ageGroup: string]: {
        Masculino: number;
        Feminino: number;
        Total: number;
    };
}

export interface ReportData {
    title: string;
    generationDate: string;
    overallStats: ReportDataStats;
    workshopStats: {
        [workshopId: string]: {
            workshopName: string;
            educatorName: string;
            stats: ReportDataStats;
        };
    };
    textContent: string;
}

export type MessageStatus = 'Agendado' | 'Enviando' | 'Enviado' | 'Cancelado' | 'Falhou';

export interface ScheduledMessage {
  id: string;
  title: string;
  content: string;
  recipients: {
    type: 'all' | 'workshop';
    ids: string[];
  };
  scheduledAt: string; // ISO date string
  status: MessageStatus;
}
