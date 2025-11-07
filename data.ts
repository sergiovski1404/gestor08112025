import type { Beneficiary, Educator, Workshop, Frequency, AttendanceStatus } from './types';

// Unchanged data
export const initialEducators: Educator[] = [
    { id: 'edu1', name: 'Ricardo', specialty: 'Karatê', workload: 20 },
    { id: 'edu2', name: 'Fernanda', specialty: 'Jiu-Jitsu', workload: 15 },
    { id: 'edu3', name: 'Carlos', specialty: 'Judô', workload: 25 },
];

// FIX: Add 'category' property to workshop data to conform to the updated Workshop type.
export const initialWorkshops: Workshop[] = [
    { id: 'ws1', name: 'KARATE', ageGroup: '5-7', days: ['Segunda', 'Quarta'], time: '14:00 - 15:00', status: 'Ativo', educatorId: 'edu1', maxCapacity: 20, color: 'blue', category: 'Esporte' },
    { id: 'ws2', name: 'KARATE', ageGroup: '8-10', days: ['Segunda', 'Quarta'], time: '15:00 - 16:00', status: 'Ativo', educatorId: 'edu1', maxCapacity: 15, color: 'blue', category: 'Esporte' },
    { id: 'ws3', name: 'KARATE', ageGroup: 'Adulto', days: ['Segunda', 'Quarta'], time: '16:00 - 17:00', status: 'Ativo', educatorId: 'edu1', maxCapacity: 18, color: 'blue', category: 'Esporte' },
    { id: 'ws4', name: 'JIUJITSU', ageGroup: 'Adulto', days: ['Terça', 'Quinta'], time: '13:30 - 14:30', status: 'Ativo', educatorId: 'edu2', maxCapacity: 25, color: 'green', category: 'Esporte' },
    { id: 'ws5', name: 'KARATE', ageGroup: '5-7', days: ['Terça', 'Quinta'], time: '14:30 - 15:30', status: 'Ativo', educatorId: 'edu1', maxCapacity: 20, color: 'blue', category: 'Esporte' },
    { id: 'ws6', name: 'KARATE', ageGroup: '8-10', days: ['Terça', 'Quinta'], time: '15:30 - 16:30', status: 'Ativo', educatorId: 'edu1', maxCapacity: 15, color: 'blue', category: 'Esporte' },
    { id: 'ws7', name: 'JUDO', ageGroup: '5-7', days: ['Terça', 'Quinta'], time: '16:30 - 17:30', status: 'Ativo', educatorId: 'edu3', maxCapacity: 20, color: 'red', category: 'Esporte' },
    { id: 'ws8', name: 'JUDO', ageGroup: '8-10', days: ['Terça', 'Quinta'], time: '17:30 - 18:30', status: 'Ativo', educatorId: 'edu3', maxCapacity: 15, color: 'red', category: 'Esporte' },
    { id: 'ws9', name: 'JIUJITSU', ageGroup: '5-7', days: ['Terça', 'Quinta'], time: '18:30 - 19:30', status: 'Ativo', educatorId: 'edu2', maxCapacity: 20, color: 'green', category: 'Esporte' },
];

// Helper to convert DD/MM/YYYY to YYYY-MM-DD
const convertDate = (dateStr: string | null): string => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr; // Already correct format
    const parts = dateStr.split('/');
    if (parts.length !== 3) return '';
    const [day, month, year] = parts;
    // Basic validation
    if (isNaN(parseInt(year)) || parseInt(year) < 1900 || parseInt(year) > 2100) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// Helper to calculate age
const calculateAge = (birthDateString: string): number => {
    if (!birthDateString) return 0;
    const birthDate = new Date(birthDateString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};


// Raw data to be processed. The 'registration' field is ignored and regenerated.
const unprocessedBeneficiaries: { name: string, cpf: string, phone: string, birthDate: string | null, gender: 'Masculino' | 'Feminino' }[] = [
    { name: 'Paulo Sergio da Silva Lima', cpf: '050.234.473-32', phone: '(85) 99605-5627', birthDate: '14/04/1992', gender: 'Masculino' },
    { name: 'Ana Clara Souza', cpf: '123.456.789-10', phone: '(85) 98845-1234', birthDate: '20/05/2015', gender: 'Feminino' },
    { name: 'Lucas Gabriel Martins', cpf: '234.567.890-12', phone: '(85) 99987-5678', birthDate: '10/02/2013', gender: 'Masculino' },
    { name: 'Mariana Costa Oliveira', cpf: '345.678.901-23', phone: '(85) 98555-4321', birthDate: '05/11/2016', gender: 'Feminino' },
    { name: 'Pedro Henrique Almeida', cpf: '456.789.012-34', phone: '(85) 99123-9876', birthDate: '30/08/2014', gender: 'Masculino' },
    { name: 'Julia Santos Lima', cpf: '567.890.123-45', phone: '(85) 98678-2345', birthDate: '12/01/2017', gender: 'Feminino' },
    { name: 'Guilherme Pereira Rodrigues', cpf: '678.901.234-56', phone: '(85) 99912-7890', birthDate: '18/07/2012', gender: 'Masculino' },
    { name: 'Beatriz Ferreira Alves', cpf: '789.012.345-67', phone: '(85) 98789-3456', birthDate: '25/03/1985', gender: 'Feminino' },
    { name: 'Davi Ribeiro Barbosa', cpf: '890.123.456-78', phone: '(85) 99456-8901', birthDate: '02/09/2015', gender: 'Masculino' },
    { name: 'Laura Carvalho Gomes', cpf: '901.234.567-89', phone: '(85) 98900-4567', birthDate: '19/12/2013', gender: 'Feminino' },
    { name: 'Matheus Mendes Castro', cpf: '012.345.678-90', phone: '(85) 99567-9012', birthDate: '22/06/2016', gender: 'Masculino' },
    { name: 'Isabela Rocha Nunes', cpf: '112.233.445-56', phone: '(85) 98112-3344', birthDate: '08/10/2012', gender: 'Feminino' },
    { name: 'Enzo Araujo Pinto', cpf: '223.344.556-67', phone: '(85) 99233-4455', birthDate: '15/05/1990', gender: 'Masculino' },
    { name: 'Valentina Moreira Dias', cpf: '334.455.667-78', phone: '(85) 98344-5566', birthDate: '03/03/2017', gender: 'Feminino' },
    { name: 'Rafael Cardoso Fernandes', cpf: '445.566.778-89', phone: '(85) 99455-6677', birthDate: '28/01/2014', gender: 'Masculino' },
    { name: 'Sofia Teixeira Correia', cpf: '556.677.889-90', phone: '(85) 98566-7788', birthDate: '11/08/2015', gender: 'Feminino' },
    { name: 'Arthur Azevedo Lopes', cpf: '667.788.990-01', phone: '(85) 99677-8899', birthDate: '01/06/2013', gender: 'Masculino' },
    { name: 'Livia Campos Sales', cpf: '778.899.001-12', phone: '(85) 98788-9900', birthDate: '14/09/1995', gender: 'Feminino' },
    { name: 'Miguel Azevedo', cpf: '889.900.112-23', phone: '(85) 99899-0011', birthDate: '29/11/2018', gender: 'Masculino' },
    { name: 'Helena Farias', cpf: '990.011.223-34', phone: '(85) 98900-1122', birthDate: '07/04/2019', gender: 'Feminino' },
];

/**
 * Processes the raw beneficiary data to generate final structured data.
 * - Generates a new, sequential registration number for every beneficiary.
 * - Assigns beneficiaries to workshops based on their age.
 * - Generates sample frequency data for the last few days.
 */
function processInitialData() {
    const currentYear = new Date().getFullYear();
    const processedBeneficiaries: Beneficiary[] = unprocessedBeneficiaries.map((raw, index) => {
        const id = `ben${index + 1}`;
        const newSequence = (index + 1).toString().padStart(3, '0');
        const registration = `${currentYear}${newSequence}`;
        const birthDate = convertDate(raw.birthDate);
        const age = calculateAge(birthDate);

        // Assign workshops based on age
        const assignedWorkshopIds: string[] = [];
        if (age >= 5 && age <= 7) {
            // Assign to 1 or 2 workshops for this age group
            if (Math.random() > 0.3) assignedWorkshopIds.push('ws1'); // KARATE
            if (Math.random() > 0.6) assignedWorkshopIds.push('ws5'); // KARATE (other day)
            if (Math.random() > 0.5) assignedWorkshopIds.push('ws7'); // JUDO
            if (Math.random() > 0.7) assignedWorkshopIds.push('ws9'); // JIUJITSU
        } else if (age >= 8 && age <= 10) {
            if (Math.random() > 0.3) assignedWorkshopIds.push('ws2'); // KARATE
            if (Math.random() > 0.6) assignedWorkshopIds.push('ws6'); // KARATE (other day)
            if (Math.random() > 0.5) assignedWorkshopIds.push('ws8'); // JUDO
        } else if (age >= 18) {
            if (Math.random() > 0.3) assignedWorkshopIds.push('ws3'); // KARATE Adulto
            if (Math.random() > 0.5) assignedWorkshopIds.push('ws4'); // JIUJITSU Adulto
        }
        
        // Ensure at least one workshop if eligible, for better demo data
        if (assignedWorkshopIds.length === 0 && age >= 5) {
             if (age <= 7) assignedWorkshopIds.push('ws1');
             else if (age <= 10) assignedWorkshopIds.push('ws2');
             else if (age >= 18) assignedWorkshopIds.push('ws3');
        }

        return {
            id,
            name: raw.name,
            registration,
            cpf: raw.cpf,
            phone: raw.phone,
            birthDate,
            gender: raw.gender,
            workshopIds: [...new Set(assignedWorkshopIds)] // Remove duplicates
        };
    });

    // Generate sample frequency data for the last 8 days
    const generatedFrequencies: Frequency[] = [];
    const today = new Date();
    const ptBrDayMap: { [key: number]: string } = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado', 0: 'Domingo' };

    for (let i = 7; i >= 0; i--) { // Iterate over the last 8 days
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        const dayOfWeek = ptBrDayMap[date.getDay()];

        initialWorkshops.forEach(workshop => {
            // Check if the workshop happens on this day of the week
            if (workshop.status === 'Ativo' && workshop.days.includes(dayOfWeek)) {
                const beneficiariesInWorkshop = processedBeneficiaries.filter(b => b.workshopIds.includes(workshop.id));
                
                if (beneficiariesInWorkshop.length > 0) {
                    const attendance: Record<string, AttendanceStatus> = {};
                    beneficiariesInWorkshop.forEach(beneficiary => {
                        const rand = Math.random();
                        let status: AttendanceStatus = 'present';
                        if (rand < 0.15) status = 'absent';
                        else if (rand < 0.20) status = 'justified';
                        attendance[beneficiary.id] = status;
                    });

                    generatedFrequencies.push({
                        workshopId: workshop.id,
                        date: dateString,
                        attendance,
                    });
                }
            }
        });
    }

    return { processedBeneficiaries, generatedFrequencies };
}

// Process data on script load
const { processedBeneficiaries, generatedFrequencies } = processInitialData();

export const initialBeneficiaries: Beneficiary[] = processedBeneficiaries;
export const initialFrequencies: Frequency[] = generatedFrequencies;
