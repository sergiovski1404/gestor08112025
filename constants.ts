export const ICONS = {
    painel: 'fas fa-gauge-high',
    beneficiarios: 'fas fa-user-graduate',
    educadores: 'fas fa-person-chalkboard',
    oficinas: 'fas fa-screwdriver-wrench',
    relatorios: 'fas fa-chart-pie',
    calendario: 'fas fa-calendar-days',
    integracao: 'fas fa-sync-alt',
    frequencia: 'fas fa-check-square',
    'gerenciador-horarios': 'fas fa-table-list',
    comunicacao: 'fab fa-whatsapp',
};

export const WORKSHOP_COLORS = [
    { name: 'indigo', bg: 'bg-indigo-100', text: 'text-indigo-800', ring: 'ring-indigo-500', border: 'border-indigo-500' },
    { name: 'blue', bg: 'bg-blue-100', text: 'text-blue-800', ring: 'ring-blue-500', border: 'border-blue-500' },
    { name: 'green', bg: 'bg-green-100', text: 'text-green-800', ring: 'ring-green-500', border: 'border-green-500' },
    { name: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-800', ring: 'ring-yellow-500', border: 'border-yellow-500' },
    { name: 'red', bg: 'bg-red-100', text: 'text-red-800', ring: 'ring-red-500', border: 'border-red-500' },
    { name: 'purple', bg: 'bg-purple-100', text: 'text-purple-800', ring: 'ring-purple-500', border: 'border-purple-500' },
    { name: 'pink', bg: 'bg-pink-100', text: 'text-pink-800', ring: 'ring-pink-500', border: 'border-pink-500' },
    { name: 'gray', bg: 'bg-gray-100', text: 'text-gray-800', ring: 'ring-gray-500', border: 'border-gray-500' },
];

export const WORKSHOP_COLOR_MAP = WORKSHOP_COLORS.reduce((acc, color) => {
    acc[color.name] = { bg: color.bg, text: color.text, border: color.border };
    return acc;
}, {} as Record<string, { bg: string; text: string; border: string }>);

export const AGE_CLASSIFICATIONS = [
    { label: '04 a 06 anos e 11 meses', stage: 'Criança' },
    { label: '07 a 11 anos e 11 meses', stage: 'Criança' },
    { label: '12 a 17 anos e 11 meses', stage: 'Adolescente' },
    { label: '18 a 29 anos e 11 meses', stage: 'Jovem Adulto' },
    { label: '30 e 59 anos e 11 meses', stage: 'Adulto' },
    { label: '60 anos ou mais', stage: 'Idoso' },
];

// FIX: Export PHYSICAL_FILE_LOCATIONS constant to resolve import error in App.tsx.
export const PHYSICAL_FILE_LOCATIONS = [
    'CAIXA 1: ARTE E CULTURA - CRIANÇAS (5-11 anos)',
    'CAIXA 1: ARTE E CULTURA - ADOLESCENTES (12-17 anos)',
    'CAIXA 1: ARTE E CULTURA - ADULTO (18-59 anos)',
    'CAIXA 1: ARTE E CULTURA - IDOSO (60+ anos)',
    'CAIXA 1: ESPORTE - CRIANÇAS (5-11 anos)',
    'CAIXA 1: ESPORTE - ADOLESCENTES (12-17 anos)',
    'CAIXA 1: ESPORTE - ADULTO (18-59 anos)',
    'CAIXA 1: ESPORTE - IDOSO (60+ anos)',
];