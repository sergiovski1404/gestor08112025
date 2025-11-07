

import React, { useState, useEffect, useMemo, useCallback, useRef, useContext, createContext } from 'react';
import ReactDOMServer from 'react-dom/server';
import { GoogleGenAI } from "@google/genai";
import { 
    initialBeneficiaries, 
    initialEducators, 
    initialWorkshops,
    initialFrequencies
} from './data';
import type { 
    Beneficiary, 
    Educator, 
    Workshop, 
    Frequency, 
    Tab, 
    ReportData,
    AttendanceStatus,
    ScheduledMessage,
    MessageStatus
} from './types';
import { analyzeDataWithGemini } from './services/geminiService';
import { ICONS, WORKSHOP_COLORS, WORKSHOP_COLOR_MAP, AGE_CLASSIFICATIONS, PHYSICAL_FILE_LOCATIONS } from './constants';
import { syncWithMcp } from './services/mcpService';
import type { McpSyncData } from './services/mcpService';


// --- TOAST NOTIFICATION SYSTEM ---
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message: string;
}

interface ToastContextType {
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const useToasts = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToasts must be used within a ToastProvider');
  }
  return context;
};

const Toast: React.FC<{ toast: ToastMessage; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleRemove();
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleRemove = () => {
    setIsFadingOut(true);
    setTimeout(() => onRemove(toast.id), 300);
  };

  const theme = {
    success: { icon: 'fas fa-check-circle', bg: 'bg-green-50', border: 'border-green-400', text: 'text-green-800' },
    error: { icon: 'fas fa-exclamation-triangle', bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-800' },
    warning: { icon: 'fas fa-exclamation-circle', bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-800' },
    info: { icon: 'fas fa-info-circle', bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-800' },
  };

  const { icon, bg, border, text } = theme[toast.type];

  return (
    <div className={`toast ${isFadingOut ? 'toast-fade-out' : 'toast-fade-in'} max-w-sm w-full ${bg} shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden border-l-4 ${border}`}>
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0"><i className={`${icon} ${text} text-xl`}></i></div>
          <div className="ml-3 w-0 flex-1 pt-0.5">
            <p className={`text-sm font-medium ${text}`}>{toast.title}</p>
            <p className="mt-1 text-sm text-gray-700">{toast.message}</p>
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button onClick={handleRemove} className="inline-flex text-gray-400 rounded-md hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              <span className="sr-only">Close</span><i className="fas fa-times text-lg"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ToastContainer: React.FC<{ toasts: ToastMessage[]; onRemove: (id: string) => void }> = ({ toasts, onRemove }) => (
  <div aria-live="assertive" className="fixed inset-0 flex items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-[100]">
    <div className="w-full flex flex-col items-center space-y-4 sm:items-end">
      {toasts.map((toast) => <Toast key={toast.id} toast={toast} onRemove={onRemove} />)}
    </div>
  </div>
);

const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, ...toast }]);
  }, []);
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};


// --- LOCAL STORAGE HOOK ---
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            // Parse stored json or if none return initialValue
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            // If error also return initialValue
            console.error(`Error reading localStorage key "${key}":`, error);
            return initialValue;
        }
    });

    useEffect(() => {
        try {
            // Save state to local storage on value change
            window.localStorage.setItem(key, JSON.stringify(storedValue));
        } catch (error) {
            // A more advanced implementation would handle the error case
            console.error(`Error setting localStorage key "${key}":`, error);
        }
    }, [key, storedValue]);

    return [storedValue, setStoredValue];
}


// --- CSV UTILITIES ---
const exportToCsv = (filename: string, data: Record<string, any>[]): boolean => {
    if (data.length === 0) {
        return false;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(';'), // Use semicolon for better Excel compatibility in some regions
        ...data.map(row => 
            headers.map(header => {
                let cell = row[header] === null || row[header] === undefined ? '' : String(row[header]);
                // Escape quotes by doubling them
                cell = cell.replace(/"/g, '""');
                // If the cell contains a semicolon, a quote, or a newline, wrap it in double quotes
                if (/[";\n]/.test(cell)) {
                    cell = `"${cell}"`;
                }
                return cell;
            }).join(';')
        )
    ].join('\n');

    // Add BOM for UTF-8 to ensure Excel opens it correctly
    const blob = new Blob([`\uFEFF${csvRows}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
};


/**
 * Parses a single row of a CSV string, handling quoted fields.
 * @param rowString The string for a single CSV row.
 * @param delimiter The character used to separate columns.
 * @returns An array of strings representing the cells in the row.
 */
function parseCsvRow(rowString: string, delimiter = ';'): string[] {
    const result: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < rowString.length; i++) {
        const char = rowString[i];

        if (char === '"') {
            if (inQuotes && rowString[i + 1] === '"') {
                // This is an escaped quote
                currentCell += '"';
                i++; // Skip the next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            result.push(currentCell.trim());
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    result.push(currentCell.trim());
    return result;
}

const detectDelimiter = (headerLine: string): string => {
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    const tabCount = (headerLine.match(/\t/g) || []).length;
    
    if (tabCount > commaCount && tabCount > semicolonCount) {
        return '\t';
    }
    if (semicolonCount > commaCount) {
        return ';';
    }
    return ',';
};

// --- HELPER FUNCTION FOR ACCENT-INSENSITIVE SEARCH ---
const normalizeText = (text: string) =>
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// --- DATE PARSING UTILITY ---
const parseDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';

    const trimmedDateStr = dateStr.trim();

    // Try YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDateStr)) {
        const d = new Date(`${trimmedDateStr}T00:00:00`); // Avoid timezone issues
        if (!isNaN(d.getTime())) return trimmedDateStr;
    }

    // Try DD/MM/YYYY or DD/MM/YY format
    const parts = trimmedDateStr.split('/');
    if (parts.length === 3) {
        let [day, month, year] = parts.map(p => parseInt(p, 10));
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            if (year < 100) {
                 // Heuristic for 2-digit year: if the year is more than 5 years in the future, assume it's 19xx
                year += (year > (new Date().getFullYear() % 100) + 5) ? 1900 : 2000;
            }
            if (day > 0 && day <= 31 && month > 0 && month <= 12 && year > 1900 && year < 2100) {
                const d = new Date(year, month - 1, day);
                // Final check to ensure date is valid (e.g., handles 31/02/2023)
                if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
                    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                }
            }
        }
    }
    
    // If all else fails, return empty string
    console.warn(`Could not parse date: "${dateStr}"`);
    return '';
};

// --- SCHEDULE CONFLICT UTILITY ---
const parseTime = (timeStr: string): { start: number; end: number } | null => {
    const parts = timeStr.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
    if (!parts || parts.length < 5) return null;
    const start = parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
    const end = parseInt(parts[3], 10) * 60 + parseInt(parts[4], 10);
    if (isNaN(start) || isNaN(end)) return null;
    return { start, end };
};

const findConflictingWorkshops = (selectedWorkshops: Workshop[]): Workshop[][] => {
    const conflicts: Workshop[][] = [];
    if (selectedWorkshops.length < 2) {
        return [];
    }
    for (let i = 0; i < selectedWorkshops.length; i++) {
        for (let j = i + 1; j < selectedWorkshops.length; j++) {
            const w1 = selectedWorkshops[i];
            const w2 = selectedWorkshops[j];
            const time1 = parseTime(w1.time);
            const time2 = parseTime(w2.time);
            if (!time1 || !time2) continue;

            const hasDayConflict = w1.days.some(day => w2.days.includes(day));
            if (!hasDayConflict) continue;

            const hasTimeConflict = (time1.start < time2.end) && (time2.start < time1.end);

            if (hasTimeConflict) {
                conflicts.push([w1, w2]);
            }
        }
    }
    return conflicts;
};


// --- HELPER COMPONENTS ---

const StatCard: React.FC<{ icon: string; label: string; value: number | string; color: string }> = ({ icon, label, value, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm flex items-center border border-gray-200/80">
        <div className={`p-4 rounded-full ${color}`}>
            <i className={`${icon} text-2xl`}></i>
        </div>
        <div className="ml-4">
            <p className="text-gray-700">{label}</p>
            <p className="text-3xl font-bold text-gray-800">{value}</p>
        </div>
    </div>
);

const TabButton: React.FC<{ activeTab: Tab; tab: Tab; onClick: (tab: Tab) => void; children: React.ReactNode }> = ({ activeTab, tab, onClick, children }) => (
    <button
        onClick={() => onClick(tab)}
        className={`whitespace-nowrap py-3 px-4 font-medium text-base transition-colors duration-200 rounded-t-lg -mb-px border-b-4 ${
            activeTab === tab
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent text-gray-600 hover:text-indigo-600 hover:bg-gray-200/50'
        }`}
    >
        {children}
    </button>
);

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' }> = ({ isOpen, onClose, title, children, size = 'xl' }) => {
    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-2xl',
        full: 'max-w-7xl',
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 animate-fade-in" onClick={onClose}>
            <div className={`bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10 shrink-0">
                    <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>
                <div className="overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};


// --- Base Button Component ---
const Button: React.FC<{
  onClick: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost';
  className?: string;
  title?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}> = ({ onClick, children, variant = 'primary', className = '', title, disabled = false, type = 'button' }) => {
  const baseClasses = 'font-semibold px-5 py-2.5 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 ease-in-out transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center';
  
  const variantClasses = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-indigo-500 border border-gray-300',
  };

  return (
    <button onClick={onClick} className={`${baseClasses} ${variantClasses[variant]} ${className}`} title={title} disabled={disabled} type={type}>
      {children}
    </button>
  );
};


const ConfirmationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
}> = ({ isOpen, onClose, onConfirm, title, message }) => {
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
            <div className="p-6">
                <div className="flex items-center">
                    <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:h-10 sm:w-10">
                        <i className="fas fa-exclamation-triangle text-red-600 text-xl" aria-hidden="true"></i>
                    </div>
                    <div className="ml-4">
                        <p className="text-base text-gray-700">{message}</p>
                    </div>
                </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button onClick={onClose} variant="ghost">Cancelar</Button>
                <Button onClick={onConfirm} variant="danger">Confirmar</Button>
            </div>
        </Modal>
    );
};

const WorkshopPopover: React.FC<{
    beneficiary: Beneficiary | null;
    target: HTMLElement | null;
    allWorkshops: Workshop[];
    onClose: () => void;
    currentWorkshopId?: string;
}> = ({ beneficiary, target, allWorkshops, onClose, currentWorkshopId }) => {
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!target) return;

        const handleClickOutside = (event: MouseEvent) => {
            const isTargetClick = target.contains(event.target as Node);
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node) && !isTargetClick) {
                onClose();
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose, target]);

    if (!beneficiary || !target) return null;

    const rect = target.getBoundingClientRect();
    const popoverStyle: React.CSSProperties = {
        position: 'absolute',
        top: `${rect.bottom + window.scrollY + 5}px`,
        left: `${rect.left + window.scrollX}px`,
        zIndex: 60,
    };

    const enrolledWorkshops = allWorkshops.filter(w => beneficiary.workshopIds.includes(w.id));

    return (
        <div
            ref={popoverRef}
            style={popoverStyle}
            className="bg-white rounded-lg shadow-xl border animate-fade-in p-3 max-w-xs w-full"
        >
            <h4 className="font-bold text-gray-800 text-sm mb-2">Oficinas de {beneficiary.name.split(' ')[0]}</h4>
            <ul className="space-y-1">
                {enrolledWorkshops.map((w, index) => {
                    const isCurrent = w.id === currentWorkshopId;
                    const colorClasses = WORKSHOP_COLOR_MAP[w.color] || WORKSHOP_COLOR_MAP.gray;
                    return (
                        <li key={w.id} className={`text-sm p-1.5 rounded flex items-center ${isCurrent ? `${colorClasses.bg} font-semibold ${colorClasses.text}` : 'bg-gray-50'}`}>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${isCurrent ? 'bg-white ' + colorClasses.text : 'bg-gray-200 text-gray-600'}`}>
                                {index + 1}
                            </span>
                            {isCurrent && <i className="fas fa-arrow-right mr-2"></i>}
                            <span className="flex-1">{w.name} ({w.ageGroup})</span>
                        </li>
                    )
                })}
            </ul>
        </div>
    );
};

const MessageSenderModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onComplete: (messageId: string) => void;
    message: ScheduledMessage | null;
    recipients: Beneficiary[];
}> = ({ isOpen, onClose, onComplete, message, recipients }) => {
    // Keep track of which links have been opened
    const [openedLinks, setOpenedLinks] = useState<Set<string>>(new Set());

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setOpenedLinks(new Set());
        }
    }, [isOpen]);

    if (!isOpen || !message || recipients.length === 0) return null;

    const openWhatsApp = (beneficiary: Beneficiary) => {
        if (!beneficiary) return;

        // 1. Sanitize the number, removing all non-numeric characters.
        let phone = beneficiary.phone.replace(/\D/g, '');

        // 2. Handle numbers that might already have the country code.
        // Brazilian numbers with DDD are 10 or 11 digits. With country code, they are 12 or 13.
        if (phone.startsWith('55') && (phone.length === 12 || phone.length === 13)) {
            // Number is already in the correct international format (e.g., 5585999999999)
            // No changes needed.
        } else if (phone.length === 10 || phone.length === 11) {
            // Number is likely in local format (e.g., 85999999999 or 8533333333)
            // Prepend the Brazilian country code.
            phone = `55${phone}`;
        }
        // else, the number format is unknown. We'll try to use it as is.
        
        const personalizedContent = message.content.replace(/{{nome}}/g, beneficiary.name.split(' ')[0]);
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(personalizedContent)}`;
        window.open(url, '_blank', 'noopener,noreferrer');

        // Mark this link as opened
        setOpenedLinks(prev => new Set(prev).add(beneficiary.id));
    };
    
    const handleFinish = () => {
        onComplete(message.id);
        onClose();
    };

    const progress = openedLinks.size;
    const total = recipients.length;

    return (
        <Modal isOpen={isOpen} onClose={handleFinish} title="Envio de Mensagem via WhatsApp" size="lg">
            <div className="p-6">
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                        <p className="text-lg font-medium text-gray-700">
                            Enviando para <span className="font-bold">{total}</span> destinatários
                        </p>
                        <p className="text-sm font-semibold text-indigo-600">{progress} / {total} abertos</p>
                    </div>
                     <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style={{ width: total > 0 ? `${(progress / total) * 100}%` : '0%' }}></div>
                    </div>
                </div>
                
                <div className="bg-green-50 p-4 rounded-md text-left my-4 border border-green-200">
                    <p className="font-semibold text-green-800">Modelo da Mensagem:</p>
                    <p className="whitespace-pre-wrap mt-2 text-gray-800">
                        {message.content.replace(/{{nome}}/g, "[Nome do Beneficiário]")}
                    </p>
                </div>

                <div className="max-h-80 overflow-y-auto border rounded-lg">
                    <ul className="divide-y divide-gray-200">
                        {recipients.map((beneficiary) => {
                            const hasOpened = openedLinks.has(beneficiary.id);
                            return (
                                <li key={beneficiary.id} className="px-4 py-3 flex justify-between items-center">
                                    <span className="font-medium text-gray-800">{beneficiary.name}</span>
                                    <Button 
                                        onClick={() => openWhatsApp(beneficiary)} 
                                        disabled={hasOpened}
                                        variant={hasOpened ? 'ghost' : 'primary'}
                                        className="px-3 py-1 text-sm"
                                    >
                                        {hasOpened ? (
                                            <><i className="fas fa-check mr-2 text-green-500"></i> Aberto</>
                                        ) : (
                                            <><i className="fab fa-whatsapp mr-2"></i> Enviar</>
                                        )}
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">Clique em "Enviar", mande a mensagem na aba do WhatsApp que abrir e volte para continuar com os próximos.</p>
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-end items-center border-t">
                <Button onClick={handleFinish} variant="ghost">Finalizar Envio</Button>
            </div>
        </Modal>
    );
};

const PaginationControls: React.FC<{
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    itemsPerPage: number;
    onItemsPerPageChange: (size: number) => void;
    totalItems: number;
    startIndex: number;
    endIndex: number;
}> = ({ currentPage, totalPages, onPageChange, itemsPerPage, onItemsPerPageChange, totalItems, startIndex, endIndex }) => {
    if (totalPages <= 1) return null;

    return (
        <div className="mt-6 flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border">
            <div className="flex items-center gap-2 text-sm text-gray-700">
                <span>Itens por página:</span>
                <select 
                    value={itemsPerPage} 
                    onChange={e => onItemsPerPageChange(Number(e.target.value))} 
                    className="p-1 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                </select>
                <span className="ml-4">
                    Mostrando {startIndex + 1}-{endIndex} de {totalItems}
                </span>
            </div>
            <div className="flex items-center gap-2">
                <Button onClick={() => onPageChange(1)} disabled={currentPage === 1} variant="ghost" className="px-3 py-1">
                    <i className="fas fa-angle-double-left"></i>
                </Button>
                <Button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} variant="ghost" className="px-3 py-1">
                    <i className="fas fa-angle-left mr-2"></i> Anterior
                </Button>
                <span className="text-sm font-medium text-gray-700">Página {currentPage} de {totalPages || 1}</span>
                <Button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages || totalPages === 0} variant="ghost" className="px-3 py-1">
                    Próximo <i className="fas fa-angle-right ml-2"></i>
                </Button>
                 <Button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages || totalPages === 0} variant="ghost" className="px-3 py-1">
                    <i className="fas fa-angle-double-right"></i>
                </Button>
            </div>
        </div>
    );
}

const IntegrationTab: React.FC<{
    allData: McpSyncData;
    lastSyncDate: string | null;
    onSyncSuccess: (date: string) => void;
    onBackup: () => void;
    onRestoreTrigger: () => void;
    addToast: (toast: Omit<ToastMessage, 'id'>) => void;
    onClearBeneficiaries: () => void;
    onClearEducators: () => void;
    onClearWorkshops: () => void;
}> = ({
    allData,
    lastSyncDate,
    onSyncSuccess,
    onBackup,
    onRestoreTrigger,
    addToast,
    onClearBeneficiaries,
    onClearEducators,
    onClearWorkshops
}) => {
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
    const [syncMessage, setSyncMessage] = useState('');
    const [syncedRecords, setSyncedRecords] = useState(0);

    const handleSync = async () => {
        setSyncStatus('syncing');
        setSyncMessage('Sincronizando dados com a plataforma MCP. Por favor, aguarde...');
        setSyncedRecords(0);

        try {
            const result = await syncWithMcp(allData);
            if (result.success) {
                setSyncStatus('success');
                setSyncMessage(result.message);
                setSyncedRecords(result.syncedRecords);
                onSyncSuccess(new Date().toISOString());
                addToast({ type: 'success', title: 'Sincronização Concluída', message: result.message });
            } else {
                setSyncStatus('error');
                const errorMessage = result.message || 'Ocorreu um erro desconhecido durante a sincronização.';
                setSyncMessage(errorMessage);
                addToast({ type: 'error', title: 'Falha na Sincronização', message: errorMessage });
            }
        } catch (error) {
            setSyncStatus('error');
            const errorMessage = error instanceof Error ? error.message : String(error);
            setSyncMessage(`Falha na sincronização: ${errorMessage}`);
            addToast({ type: 'error', title: 'Falha na Sincronização', message: errorMessage });
            console.error("MCP Sync Error:", error);
        }
    };

    const StatusCard: React.FC<{ title: string, value: string, icon: string, color: string }> = ({ title, value, icon, color }) => (
        <div className="bg-white p-4 rounded-lg shadow-sm flex items-center border">
            <div className={`p-3 rounded-full ${color}`}>
                <i className={`${icon} text-xl`}></i>
            </div>
            <div className="ml-4">
                <p className="text-sm text-gray-600">{title}</p>
                <p className="text-lg font-semibold text-gray-800">{value}</p>
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in space-y-6">
            <div>
                <h2 className="text-xl font-semibold text-gray-700">Sincronização e Backup</h2>
                <p className="mt-1 text-gray-600">
                    Sincronize com a plataforma MCP e gerencie backups dos seus dados locais.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatusCard 
                    title="Status da Conexão" 
                    value="Conectado" 
                    icon="fas fa-check-circle text-green-600" 
                    color="bg-green-100" 
                />
                <StatusCard 
                    title="Última Sincronização" 
                    value={lastSyncDate ? new Date(lastSyncDate).toLocaleString('pt-BR') : 'Nunca'} 
                    icon="fas fa-history text-blue-600" 
                    color="bg-blue-100"
                />
            </div>
            
            <div className="bg-white p-6 rounded-lg border text-center shadow-sm">
                 <h3 className="text-lg font-medium text-gray-800">Sincronização de Dados</h3>
                 <p className="mt-1 text-base text-gray-600 mb-4">Envie os dados mais recentes de beneficiários, oficinas e frequências para o MCP.</p>
                <Button
                    onClick={handleSync} 
                    disabled={syncStatus === 'syncing'}
                    className="flex items-center justify-center mx-auto"
                >
                    {syncStatus === 'syncing' ? <span className="loader"></span> : <i className="fas fa-sync-alt mr-2"></i>}
                    {syncStatus === 'syncing' ? 'Sincronizando...' : 'Sincronizar Dados com MCP'}
                </Button>
            </div>

            {syncStatus !== 'idle' && (
                <div className="mt-6 animate-fade-in">
                    {syncStatus === 'syncing' && (
                        <div className="flex items-center text-blue-700 bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <i className="fas fa-info-circle mr-3 text-xl"></i>
                            <div>
                                <p className="font-semibold">Sincronização em Andamento</p>
                                <p>{syncMessage}</p>
                            </div>
                        </div>
                    )}
                    {syncStatus === 'success' && (
                        <div className="flex items-center text-green-700 bg-green-50 p-4 rounded-lg border border-green-200">
                             <i className="fas fa-check-circle mr-3 text-xl"></i>
                            <div>
                                <p className="font-semibold">Sucesso!</p>
                                <p>{syncMessage}</p>
                                <p className="text-sm">{syncedRecords} registros foram processados.</p>
                            </div>
                        </div>
                    )}
                    {syncStatus === 'error' && (
                         <div className="flex items-center text-red-700 bg-red-50 p-4 rounded-lg border border-red-200">
                            <i className="fas fa-exclamation-triangle mr-3 text-xl"></i>
                            <div>
                                <p className="font-semibold">Erro na Sincronização</p>
                                <p>{syncMessage}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            <div className="bg-white p-6 rounded-lg border shadow-sm">
                <h3 className="text-lg font-medium text-gray-800 text-center">Backup e Portabilidade de Dados</h3>
                <div className="mt-2 text-base text-gray-700 mb-4 text-left bg-gray-50 p-4 rounded-md border max-w-3xl mx-auto">
                    <p className="font-semibold mb-2 text-center">Como acessar seus dados em qualquer computador:</p>
                    <ol className="list-decimal list-inside space-y-2">
                        <li>Clique em <strong><i className="fas fa-download mr-1"></i>Fazer Backup</strong> para salvar todos os seus dados (beneficiários, oficinas, etc.) em um único arquivo no seu computador.</li>
                        <li>Transfira este arquivo para o novo dispositivo (usando um pen drive, e-mail, Google Drive, etc.).</li>
                        <li>No novo computador, abra esta aplicação, navegue até esta aba e clique em <strong><i className="fas fa-upload mr-1"></i>Restaurar Backup</strong> para selecionar e carregar o arquivo.</li>
                    </ol>
                    <p className="mt-3 text-sm text-center text-gray-500">Este método garante a segurança e a portabilidade completa dos seus dados.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center mt-4">
                  <Button onClick={onBackup} variant="secondary" className="bg-green-600 text-white hover:bg-green-700 focus:ring-green-500">
                    <i className="fas fa-download mr-2"></i> Fazer Backup
                  </Button>
                  <Button onClick={onRestoreTrigger} variant="warning">
                    <i className="fas fa-upload mr-2"></i> Restaurar Backup
                  </Button>
                </div>
            </div>

            <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg shadow-sm mt-6">
                <h3 className="text-lg font-bold text-red-900 flex items-center"><i className="fas fa-exclamation-triangle mr-3"></i>Área de Risco: Limpeza de Dados</h3>
                <p className="mt-2 text-base text-red-800">
                    As ações a seguir são permanentes e não podem ser desfeitas. Use com extrema cautela. Recomenda-se fazer um backup antes de prosseguir.
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-start mt-4">
                    <Button onClick={onClearBeneficiaries} variant="danger">
                        <i className="fas fa-users-slash mr-2"></i> Apagar Beneficiários
                    </Button>
                    <Button onClick={onClearWorkshops} variant="danger">
                        <i className="fas fa-dumpster-fire mr-2"></i> Apagar Oficinas
                    </Button>
                    <Button onClick={onClearEducators} variant="danger">
                        <i className="fas fa-user-times mr-2"></i> Apagar Educadores
                    </Button>
                </div>
            </div>

        </div>
    );
};

// --- MAIN UI SECTIONS / TABS ---

const Dashboard: React.FC<{
    beneficiaries: Beneficiary[];
    educators: Educator[];
    workshops: Workshop[];
    frequencies: Frequency[];
    onOpenEnrolledList: (workshop: Workshop) => void;
    calculateAge: (birthDate: string) => number;
}> = ({ beneficiaries, educators, workshops, frequencies, onOpenEnrolledList, calculateAge }) => {
    
    // FIX: Add type definition for age-gender distribution groups to prevent TypeScript errors.
    type AgeGenderGroup = { Masculino: number, Feminino: number, Total: number };

    // Helper to parse time string for sorting
    const parseTimeForSort = (timeStr: string): number => {
        const match = timeStr.match(/(\d{2}):(\d{2})/);
        if (!match) return 9999;
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    };

    const getEndTimeFromRange = (timeRange: string): number => {
        const parts = timeRange.split(' - ');
        if (parts.length < 2) return 9999;
        const endTime = parts[1];
        const match = endTime.match(/(\d{2}):(\d{2})/);
        if (!match) return 9999;
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    };

    const isWorkshopFinished = (timeRange: string): boolean => {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const endTime = getEndTimeFromRange(timeRange);
        return currentTime >= endTime;
    };

    const getEducatorName = useCallback((id: string) => educators.find(e => e.id === id)?.name || 'N/A', [educators]);

    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long' }).split('-')[0];
    
    const todayActivities = useMemo(() => {
        return workshops
            .filter(w => w.status === 'Ativo' && w.days.some(day => day.toLowerCase().startsWith(today.toLowerCase())) && w.category !== 'Administrativo' && !isWorkshopFinished(w.time))
            .map(w => ({
                ...w,
                educatorName: getEducatorName(w.educatorId),
                enrolled: beneficiaries.filter(b => b.workshopIds.includes(w.id)).length,
            }))
            .sort((a, b) => parseTimeForSort(a.time) - parseTimeForSort(b.time));
    }, [workshops, today, getEducatorName, beneficiaries]);

    const activeWorkshops = useMemo(
        () => workshops.filter(
            w => w.status === 'Ativo' && (w.category === 'Esporte' || w.category === 'Arte e Cultura')
        ),
        [workshops]
    );
    const unenrolledBeneficiariesCount = beneficiaries.filter(b => b.workshopIds.length === 0).length;

    const { ageGenderDistribution, maxInGroup } = useMemo(() => {
        const getAgeGroup = (age: number): string => {
            if (age >= 4 && age < 7) return '04-06 anos';
            if (age >= 7 && age < 12) return '07-11 anos';
            if (age >= 12 && age < 18) return '12-17 anos';
            if (age >= 18 && age < 30) return '18-29 anos';
            if (age >= 30 && age < 60) return '30-59 anos';
            if (age >= 60) return '60+ anos';
            return 'Outros';
        };

        const distribution: { [key: string]: AgeGenderGroup } = {
            '04-06 anos': { Masculino: 0, Feminino: 0, Total: 0 },
            '07-11 anos': { Masculino: 0, Feminino: 0, Total: 0 },
            '12-17 anos': { Masculino: 0, Feminino: 0, Total: 0 },
            '18-29 anos': { Masculino: 0, Feminino: 0, Total: 0 },
            '30-59 anos': { Masculino: 0, Feminino: 0, Total: 0 },
            '60+ anos': { Masculino: 0, Feminino: 0, Total: 0 },
            'Outros': { Masculino: 0, Feminino: 0, Total: 0 },
        };
        
        let max = 0;

        beneficiaries.forEach(b => {
            const age = calculateAge(b.birthDate);
            const group = getAgeGroup(age);
            if (distribution[group]) {
                if (b.gender === 'Masculino') {
                    distribution[group].Masculino++;
                } else if (b.gender === 'Feminino') {
                    distribution[group].Feminino++;
                }
                distribution[group].Total++;
            }
        });

        // FIX: Cast Object.values to the correct type to allow property access.
        (Object.values(distribution) as AgeGenderGroup[]).forEach(group => {
            if (group.Total > max) {
                max = group.Total;
            }
        });

        return { ageGenderDistribution: distribution, maxInGroup: max };
    }, [beneficiaries, calculateAge]);
    
    const { keyMetrics, alerts } = useMemo(() => {
        // Metrics
        const enrollableWorkshops = activeWorkshops.filter(w => w.maxCapacity > 0);
        const totalCapacity = enrollableWorkshops.reduce((sum, w) => sum + w.maxCapacity, 0);

        const totalEnrolledUnique = new Set<string>();
        enrollableWorkshops.forEach(w => {
            beneficiaries.forEach(b => {
                if (b.workshopIds.includes(w.id)) {
                    totalEnrolledUnique.add(b.id);
                }
            });
        });

        const totalEnrollments = enrollableWorkshops.reduce((sum, w) => {
            return sum + beneficiaries.filter(b => b.workshopIds.includes(w.id)).length;
        }, 0);

        const averageOccupancy = totalCapacity > 0 ? (totalEnrollments / totalCapacity) * 100 : 0;

        // Attendance in last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentFrequencies = frequencies.filter(f => new Date(f.date) >= sevenDaysAgo);
        
        let totalPresent = 0;
        let totalExpected = 0;
        recentFrequencies.forEach(f => {
            const workshopBeneficiaries = beneficiaries.filter(b => b.workshopIds.includes(f.workshopId));
            totalExpected += workshopBeneficiaries.length;
            Object.values(f.attendance).forEach(status => {
                if (status === 'present') totalPresent++;
            });
        });
        const averageAttendance = totalExpected > 0 ? (totalPresent / totalExpected) * 100 : 0;
        
        // Alerts
        const beneficiariesWithConflicts = new Set();
        beneficiaries.forEach(b => {
             const enrolled = workshops.filter(w => b.workshopIds.includes(w.id));
             if (findConflictingWorkshops(enrolled).length > 0) {
                 beneficiariesWithConflicts.add(b.id);
             }
        });

        const workshopsOverCapacity = activeWorkshops.filter(w => {
            const enrolled = beneficiaries.filter(b => b.workshopIds.includes(w.id)).length;
            return enrolled > w.maxCapacity;
        }).length;
        
        const workshopsUnderCapacity = activeWorkshops.filter(w => {
             const enrolled = beneficiaries.filter(b => b.workshopIds.includes(w.id)).length;
             return w.maxCapacity > 0 && (enrolled / w.maxCapacity) < 0.3; // Less than 30% full
        }).length;

        return {
            keyMetrics: {
                averageOccupancy,
                averageAttendance,
            },
            alerts: {
                conflicts: beneficiariesWithConflicts.size,
                overCapacity: workshopsOverCapacity,
                underCapacity: workshopsUnderCapacity,
            }
        };
    }, [beneficiaries, activeWorkshops, workshops, frequencies]);


    const MetricDisplay: React.FC<{ value: string; label: string; icon: string; }> = ({ value, label, icon }) => (
        <div className="flex items-center">
            <i className={`fas ${icon} text-indigo-500 text-2xl mr-4`}></i>
            <div>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
                <p className="text-sm text-gray-600">{label}</p>
            </div>
        </div>
    );
    
    const AlertDisplay: React.FC<{ value: number; label: string; icon: string; color: string }> = ({ value, label, icon, color }) => (
        <div className="flex items-center p-2 bg-gray-50 rounded-lg">
             <div className={`flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full ${color} text-white`}>
                <i className={`fas ${icon}`}></i>
            </div>
            <div className="ml-3">
                <span className="font-bold text-gray-800">{value}</span>
                <span className="text-gray-600"> {label}</span>
            </div>
        </div>
    );


    return (
        <div id="painel-tab" className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={`${ICONS.beneficiarios} text-indigo-600`} label="Total de Beneficiários" value={beneficiaries.length} color="bg-indigo-100" />
                <StatCard icon={`${ICONS.educadores} text-green-600`} label="Total de Educadores" value={educators.length} color="bg-green-100" />
                <StatCard icon={`${ICONS.oficinas} text-yellow-600`} label="Oficinas Ativas" value={activeWorkshops.length} color="bg-yellow-100" />
                <StatCard icon="fas fa-user-slash text-red-600" label="Não Inscritos" value={unenrolledBeneficiariesCount} color="bg-red-100" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200/80 space-y-6">
                    <h3 className="text-xl font-semibold text-gray-700">Visão Geral do Programa</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <MetricDisplay value={`${keyMetrics.averageOccupancy.toFixed(0)}%`} label="Ocupação Média (Vagas)" icon="fa-users" />
                        <MetricDisplay value={`${keyMetrics.averageAttendance.toFixed(0)}%`} label="Frequência Média (7d)" icon="fa-check-circle" />
                    </div>

                    <div>
                        <h4 className="font-semibold text-gray-600 mb-3">Alertas Atuais</h4>
                        <div className="space-y-3">
                             {alerts.overCapacity > 0 && <AlertDisplay value={alerts.overCapacity} label="Oficinas superlotadas" icon="fa-exclamation-triangle" color="bg-red-500" />}
                             {alerts.conflicts > 0 && <AlertDisplay value={alerts.conflicts} label="Beneficiários com conflitos" icon="fa-clock" color="bg-yellow-500" />}
                             {alerts.underCapacity > 0 && <AlertDisplay value={alerts.underCapacity} label="Oficinas com baixa adesão" icon="fa-arrow-down" color="bg-blue-500" />}
                             {(alerts.overCapacity === 0 && alerts.conflicts === 0 && alerts.underCapacity === 0) && (
                                <p className="text-gray-500 text-center py-2">Nenhum alerta importante no momento.</p>
                             )}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200/80">
                     <h3 className="text-xl font-semibold text-gray-700 mb-4">Distribuição de Beneficiários</h3>
                     <div className="space-y-4">
                        {/* FIX: Cast Object.entries result to correctly typed array to allow property access. */}
                        {(Object.entries(ageGenderDistribution) as [string, AgeGenderGroup][]).filter(([, data]) => data.Total > 0).map(([group, data]) => {
                             const malePercentage = data.Total > 0 ? (data.Masculino / data.Total) * 100 : 0;
                             const femalePercentage = data.Total > 0 ? (data.Feminino / data.Total) * 100 : 0;
                             
                             return (
                                <div key={group}>
                                     <div className="flex justify-between items-center text-sm mb-1">
                                         <span className="font-medium text-gray-600">{group}</span>
                                         <span className="font-bold text-gray-800">{data.Total}</span>
                                     </div>
                                     <div className="w-full bg-gray-200 rounded-full h-4 flex overflow-hidden">
                                         <div className="bg-blue-500 h-full" style={{ width: `${malePercentage}%` }} title={`Masculino: ${data.Masculino}`}></div>
                                         <div className="bg-pink-500 h-full" style={{ width: `${femalePercentage}%` }} title={`Feminino: ${data.Feminino}`}></div>
                                     </div>
                                </div>
                             )
                         })}
                     </div>
                     <div className="flex justify-end items-center gap-4 mt-4 text-sm">
                        <div className="flex items-center"><span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span> Masculino</div>
                        <div className="flex items-center"><span className="w-3 h-3 bg-pink-500 rounded-full mr-2"></span> Feminino</div>
                     </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200/80">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4">Agenda do Dia ({today})</h3>
                    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                        {todayActivities.length > 0 ? todayActivities.map(activity => {
                            const colorClasses = WORKSHOP_COLOR_MAP[activity.color] || WORKSHOP_COLOR_MAP.gray;
                             return (
                                 <div key={activity.id} onClick={() => onOpenEnrolledList(activity)} className={`cursor-pointer flex items-start p-4 rounded-lg bg-white border-l-4 ${colorClasses.border} shadow-sm hover:shadow-md hover:-translate-y-0.5 transform transition-all duration-300`}>
                                     <div className="flex-shrink-0 w-24 text-center">
                                         <p className="text-lg font-bold text-indigo-600">{activity.time.split(' - ')[0]}</p>
                                         <p className="text-sm text-gray-500">às {activity.time.split(' - ')[1]}</p>
                                     </div>
                                     <div className="ml-4 flex-1">
                                         <h4 className="font-bold text-gray-800">{activity.name} <span className="font-normal text-gray-600">({activity.ageGroup})</span></h4>
                                         <p className="text-sm text-gray-500 mt-1"><i className="fas fa-person-chalkboard mr-2 text-gray-400"></i>{activity.educatorName}</p>
                                         <div className="mt-2 text-sm font-semibold text-gray-700">
                                             <i className="fas fa-users mr-2 text-gray-400"></i>
                                             {activity.enrolled} / {activity.maxCapacity} inscritos
                                         </div>
                                     </div>
                                 </div>
                             );
                        }) : <p className="text-gray-600 text-center py-10">Nenhuma atividade agendada para hoje.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const BeneficiaryModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (beneficiary: Beneficiary) => boolean;
    beneficiaryToEdit: Beneficiary | null;
    allWorkshops: Workshop[];
    beneficiaries: Beneficiary[];
    allEducators: Educator[];
}> = ({ isOpen, onClose, onSave, beneficiaryToEdit, allWorkshops, beneficiaries, allEducators }) => {
    const [formData, setFormData] = useState<Omit<Beneficiary, 'id'>>({
        name: '', registration: '', cpf: '', phone: '', workshopIds: [], birthDate: '', gender: 'Feminino', physicalFileLocation: ''
    });
    const [workshopSearch, setWorkshopSearch] = useState('');
    const [conflicts, setConflicts] = useState<Workshop[][]>([]);

    useEffect(() => {
        if (beneficiaryToEdit) {
            setFormData(beneficiaryToEdit);
        } else {
            setFormData({ name: '', registration: '', cpf: '', phone: '', workshopIds: [], birthDate: '', gender: 'Feminino', physicalFileLocation: '' });
        }
        setWorkshopSearch(''); // Reset search on open
        setConflicts([]);
    }, [beneficiaryToEdit, isOpen]);

    useEffect(() => {
        const selectedWorkshops = allWorkshops.filter(w => formData.workshopIds.includes(w.id));
        const detectedConflicts = findConflictingWorkshops(selectedWorkshops);
        setConflicts(detectedConflicts);
    }, [formData.workshopIds, allWorkshops]);

    const formatCPF = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .substring(0, 14);
    };

    const formatPhone = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/^(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d{4})/, '$1-$2')
            .substring(0, 15);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        let formattedValue = value;
        if (name === 'cpf') {
            formattedValue = formatCPF(value);
        } else if (name === 'phone') {
            formattedValue = formatPhone(value);
        }
        setFormData(prev => ({ ...prev, [name]: formattedValue }));
    };
    
    const handleWorkshopChange = (workshopId: string) => {
        setFormData(prev => {
            const newWorkshopIds = prev.workshopIds.includes(workshopId)
                ? prev.workshopIds.filter(id => id !== workshopId)
                : [...prev.workshopIds, workshopId];
            return { ...prev, workshopIds: newWorkshopIds };
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        let registrationNumber = formData.registration;
        if (!beneficiaryToEdit) {
            const currentYear = new Date().getFullYear();
            const beneficiariesThisYear = beneficiaries.filter(b => b.registration.startsWith(currentYear.toString()));
            const lastRegistrationNumber = beneficiariesThisYear.length > 0
                ? Math.max(...beneficiariesThisYear.map(b => parseInt(b.registration.substring(4), 10)))
                : 0;
            const newSequence = (lastRegistrationNumber + 1).toString().padStart(3, '0');
            registrationNumber = `${currentYear}${newSequence}`;
        }

        const finalBeneficiary: Beneficiary = {
            ...formData,
            id: beneficiaryToEdit?.id || `ben${Date.now()}`,
            registration: registrationNumber,
        };
        const success = onSave(finalBeneficiary);
        if (success) {
            onClose();
        }
    };
    
    const getEducatorName = useCallback((id: string) => allEducators.find(e => e.id === id)?.name || 'N/A', [allEducators]);

    const filteredWorkshops = useMemo(() => {
        const activeWorkshops = allWorkshops.filter(w => w.status === 'Ativo');
        if (!workshopSearch.trim()) {
            return activeWorkshops;
        }
        const normalizedSearch = normalizeText(workshopSearch);
        return activeWorkshops.filter(workshop => {
            const educatorName = getEducatorName(workshop.educatorId);
            return (
                normalizeText(workshop.name).includes(normalizedSearch) ||
                normalizeText(workshop.ageGroup).includes(normalizedSearch) ||
                normalizeText(educatorName).includes(normalizedSearch)
            );
        });
    }, [allWorkshops, workshopSearch, getEducatorName]);
    
    const conflictingWorkshopIds = useMemo(() => {
        return new Set(conflicts.flat().map(w => w.id));
    }, [conflicts]);


    return (
        <Modal isOpen={isOpen} onClose={onClose} title={beneficiaryToEdit ? "Editar Beneficiário" : "Adicionar Novo Beneficiário"}>
            <form onSubmit={handleSubmit}>
                <div className="p-6 space-y-4">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome Completo</label>
                        <input type="text" name="name" id="name" value={formData.name} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label htmlFor="cpf" className="block text-sm font-medium text-gray-700">CPF</label>
                            <input type="text" name="cpf" id="cpf" value={formData.cpf} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" maxLength={14} placeholder="000.000.000-00"/>
                        </div>
                        <div>
                            <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700">Data de Nascimento</label>
                            <input type="date" name="birthDate" id="birthDate" value={formData.birthDate} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Telefone</label>
                            <input type="text" name="phone" id="phone" value={formData.phone} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" maxLength={15} placeholder="(00) 00000-0000"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Gênero</label>
                            <div className="mt-2 flex items-center space-x-6">
                                <div className="flex items-center">
                                    <input id="gender-m" name="gender" type="radio" value="Masculino" checked={formData.gender === 'Masculino'} onChange={(e) => setFormData(prev => ({ ...prev, gender: 'Masculino' }))} className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                                    <label htmlFor="gender-m" className="ml-2 block text-base text-gray-900">Masculino</label>
                                </div>
                                <div className="flex items-center">
                                    <input id="gender-f" name="gender" type="radio" value="Feminino" checked={formData.gender === 'Feminino'} onChange={(e) => setFormData(prev => ({ ...prev, gender: 'Feminino' }))} className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                                    <label htmlFor="gender-f" className="ml-2 block text-base text-gray-900">Feminino</label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="physicalFileLocation" className="block text-sm font-medium text-gray-700">Localização do Arquivo Físico</label>
                        <input 
                            type="text" 
                            name="physicalFileLocation" 
                            id="physicalFileLocation" 
                            value={formData.physicalFileLocation || ''} 
                            onChange={handleChange} 
                            className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" 
                            placeholder="Selecione ou digite a localização"
                            list="physical-locations-list" 
                        />
                        <datalist id="physical-locations-list">
                            {PHYSICAL_FILE_LOCATIONS.map(loc => <option key={loc} value={loc} />)}
                        </datalist>
                    </div>
                    <div>
                        <h4 className="text-base font-medium text-gray-700 mb-2">Oficinas Inscritas</h4>
                        {conflicts.length > 0 && (
                            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 my-2 rounded-r-lg shadow-sm">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                         <i className="fas fa-exclamation-triangle text-yellow-500 text-xl"></i>
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm font-bold text-yellow-800">Aviso de Conflito de Horário</p>
                                        <div className="mt-2 text-sm text-yellow-700">
                                            {conflicts.map((pair, index) => (
                                                <p key={index}>- "{pair[0].name}" e "{pair[1].name}" possuem horários conflitantes.</p>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <input
                           type="text"
                           placeholder="Buscar oficina por nome, faixa etária ou educador..."
                           value={workshopSearch}
                           onChange={(e) => setWorkshopSearch(e.target.value)}
                           className="w-full p-2.5 border border-gray-300 rounded-md mb-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-60 overflow-y-auto p-2 bg-gray-50 rounded-md border">
                           {filteredWorkshops.length > 0 ? (
                               filteredWorkshops.map(workshop => {
                                   const educatorName = getEducatorName(workshop.educatorId);
                                   const colorClasses = WORKSHOP_COLOR_MAP[workshop.color] || WORKSHOP_COLOR_MAP.gray;
                                   const isConflicting = conflictingWorkshopIds.has(workshop.id);

                                   return (
                                   <div key={workshop.id} className={`p-3 rounded-lg border flex items-start gap-3 transition-all ${formData.workshopIds.includes(workshop.id) ? `${colorClasses.bg} ${colorClasses.border}` : 'bg-white'} ${isConflicting ? 'ring-2 ring-red-500' : ''}`}>
                                       <input
                                           id={`workshop-${workshop.id}`}
                                           type="checkbox"
                                           checked={formData.workshopIds.includes(workshop.id)}
                                           onChange={() => handleWorkshopChange(workshop.id)}
                                           className="h-5 w-5 mt-1 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 shrink-0"
                                       />
                                       <label htmlFor={`workshop-${workshop.id}`} className="flex-1 cursor-pointer">
                                           <p className={`font-bold ${colorClasses.text}`}>{workshop.name} - {workshop.ageGroup}</p>
                                           <div className="mt-1 space-y-0.5">
                                              <p className="text-sm text-gray-600 flex items-center"><i className="far fa-calendar-alt mr-2 w-4 text-center text-gray-400"></i>{workshop.days.join(', ')}</p>
                                              <p className="text-sm text-gray-600 flex items-center"><i className="far fa-clock mr-2 w-4 text-center text-gray-400"></i>{workshop.time}</p>
                                              <p className="text-sm text-gray-600 flex items-center"><i className="fas fa-person-chalkboard mr-2 w-4 text-center text-gray-400"></i>{educatorName}</p>
                                           </div>
                                       </label>
                                   </div>
                                   )
                               })
                           ) : (
                               <div className="col-span-1 md:col-span-2 text-center text-gray-500 py-4">
                                   Nenhuma oficina encontrada.
                               </div>
                           )}
                        </div>
                    </div>
                </div>
                <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                    <Button onClick={onClose} variant="ghost">Cancelar</Button>
                    <Button onClick={() => {}} type="submit">{beneficiaryToEdit ? "Salvar Alterações" : "Adicionar Beneficiário"}</Button>
                </div>
            </form>
        </Modal>
    );
};


const BeneficiariesTab: React.FC<{
    beneficiaries: Beneficiary[];
    workshops: Workshop[];
    onAdd: () => void;
    onEdit: (beneficiary: Beneficiary) => void;
    onTransfer: (beneficiary: Beneficiary) => void;
    onDelete: (id: string) => void;
    onImport: () => void;
    onRegenerate: () => void;
    onOpenConfirmation: (title: string, message: string, onConfirm: () => void) => void;
    calculateAge: (birthDate: string) => number;
    onPrint: (beneficiariesToPrint: Beneficiary[]) => void;
    onPrintBadge: (beneficiary: Beneficiary) => void;
    onPrintSelectedBadges: (beneficiaryIds: string[]) => void;
    addToast: (toast: Omit<ToastMessage, 'id'>) => void;
}> = ({ beneficiaries, workshops, onAdd, onEdit, onTransfer, onDelete, onImport, onRegenerate, onOpenConfirmation, calculateAge, onPrint, onPrintBadge, onPrintSelectedBadges, addToast }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [minAge, setMinAge] = useState('');
    const [maxAge, setMaxAge] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [sortBy, setSortBy] = useState('name-asc');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);


    const beneficiaryConflicts = useMemo(() => {
        const conflictMap = new Map<string, Workshop[][]>();
        beneficiaries.forEach(b => {
            const enrolledWorkshops = workshops.filter(w => b.workshopIds.includes(w.id));
            if (enrolledWorkshops.length > 1) {
                const conflicts = findConflictingWorkshops(enrolledWorkshops);
                if (conflicts.length > 0) {
                    conflictMap.set(b.id, conflicts);
                }
            }
        });
        return conflictMap;
    }, [beneficiaries, workshops]);

    const sortedAndFilteredBeneficiaries = useMemo(() => {
        const min = minAge ? parseInt(minAge, 10) : null;
        const max = maxAge ? parseInt(maxAge, 10) : null;
        const normalizedFilter = normalizeText(searchTerm);

        let filtered = beneficiaries.filter(b => {
            const age = calculateAge(b.birthDate);
            if (min !== null && age < min) return false;
            if (max !== null && age > max) return false;
            if (searchTerm) {
                const enrolledWorkshopNames = b.workshopIds
                    .map(id => workshops.find(w => w.id === id)?.name)
                    .filter(Boolean) as string[];

                const workshopMatch = enrolledWorkshopNames.some(name => 
                    normalizeText(name).includes(normalizedFilter)
                );

                return (
                    normalizeText(b.name).includes(normalizedFilter) ||
                    b.registration.toLowerCase().includes(normalizedFilter) ||
                    b.cpf.replace(/[.-]/g, '').includes(normalizedFilter) ||
                    (b.physicalFileLocation && normalizeText(b.physicalFileLocation).includes(normalizedFilter)) ||
                    workshopMatch
                );
            }
            return true;
        });

        const [key, direction] = sortBy.split('-');
        filtered.sort((a, b) => {
            let valA: string | number, valB: string | number;

            switch (key) {
                case 'age':
                    valA = calculateAge(a.birthDate) || 0;
                    valB = calculateAge(b.birthDate) || 0;
                    break;
                case 'registration':
                    valA = a.registration;
                    valB = b.registration;
                    break;
                case 'name':
                default:
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
                    break;
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [beneficiaries, workshops, searchTerm, minAge, maxAge, calculateAge, sortBy]);
    
    const { paginatedBeneficiaries, totalPages, startIndex, endIndex } = useMemo(() => {
        const total = sortedAndFilteredBeneficiaries.length;
        const pages = Math.ceil(total / itemsPerPage);
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;

        return {
            paginatedBeneficiaries: sortedAndFilteredBeneficiaries.slice(start, end),
            totalPages: pages,
            startIndex: start,
            endIndex: Math.min(end, total),
        };
    }, [sortedAndFilteredBeneficiaries, currentPage, itemsPerPage]);

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const visibleIds = paginatedBeneficiaries.map(b => b.id);
        if (e.target.checked) {
            setSelectedIds(prev => [...new Set([...prev, ...visibleIds])]);
        } else {
            setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)));
        }
    };
    
    const allOnPageSelected = paginatedBeneficiaries.length > 0 && paginatedBeneficiaries.every(b => selectedIds.includes(b.id));

    
    const getWorkshopDetailsForCsv = (workshopIds: string[]) => {
        return workshopIds.map(id => {
            const w = workshops.find(w => w.id === id);
            return w ? `${w.name} (${w.ageGroup}) - Dias: ${w.days.join('/')}, Horário: ${w.time}` : null;
        }).filter(Boolean).join(' | ') || 'Nenhuma';
    };
    
    const handleExport = () => {
        const dataToExport = sortedAndFilteredBeneficiaries.map(b => ({
            'Nome Completo': b.name,
            'Idade': calculateAge(b.birthDate) || 'N/A',
            'Matrícula': b.registration,
            'CPF': b.cpf,
            'Telefone': b.phone,
            'Data de Nascimento': b.birthDate,
            'Gênero': b.gender,
            'Localização do Arquivo Físico': b.physicalFileLocation || 'N/A',
            'Oficinas': getWorkshopDetailsForCsv(b.workshopIds),
        }));
        const success = exportToCsv('lista_beneficiarios', dataToExport);
        if (success) {
            addToast({ type: 'success', title: 'Exportação Concluída', message: 'Lista de beneficiários exportada para CSV.' });
        } else {
            addToast({ type: 'warning', title: 'Nada para Exportar', message: 'A lista de beneficiários filtrada está vazia.' });
        }
    };
    
    const clearFilters = () => {
        setSearchTerm('');
        setMinAge('');
        setMaxAge('');
        setSortBy('name-asc');
        setCurrentPage(1);
    };

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    const handleItemsPerPageChange = (size: number) => {
        setItemsPerPage(size);
        setCurrentPage(1);
    };

    const QuickStat: React.FC<{ icon: string; value: number; label: string; color: string; }> = ({ icon, value, label, color }) => (
        <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
                <i className={`${icon} text-lg`}></i>
            </div>
            <div>
                <p className="text-xl font-bold text-gray-800">{value}</p>
                <p className="text-sm text-gray-500">{label}</p>
            </div>
        </div>
    );
    
    const summaryStats = useMemo(() => ({
        total: beneficiaries.length,
        conflicts: beneficiaryConflicts.size,
        unenrolled: beneficiaries.filter(b => b.workshopIds.length === 0).length,
    }), [beneficiaries, beneficiaryConflicts]);


    return (
         <div className="animate-fade-in space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Lista de Beneficiários</h2>
                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end">
                    <Button onClick={onAdd}>
                        <i className="fas fa-plus mr-2"></i> Adicionar Beneficiário
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-white p-4 rounded-xl border">
                <QuickStat icon="fas fa-users" value={summaryStats.total} label="Total" color="bg-indigo-100 text-indigo-600" />
                <QuickStat icon="fas fa-exclamation-triangle" value={summaryStats.conflicts} label="Com Conflitos" color="bg-yellow-100 text-yellow-600" />
                <QuickStat icon="fas fa-user-slash" value={summaryStats.unenrolled} label="Não Inscritos" color="bg-red-100 text-red-600" />
            </div>
            
            <div className="bg-white p-4 rounded-xl border">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <div className="lg:col-span-2">
                        <label htmlFor="search-beneficiary" className="block text-sm font-medium text-gray-700">Buscar</label>
                        <input id="search-beneficiary" type="text" placeholder="Nome, matrícula, CPF, oficina..." value={searchTerm} onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1)}} className="mt-1 w-full p-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                    </div>
                    <div className="flex gap-4">
                        <div>
                            <label htmlFor="min-age" className="block text-sm font-medium text-gray-700">Id. Mín.</label>
                            <input id="min-age" type="number" value={minAge} onChange={(e) => {setMinAge(e.target.value); setCurrentPage(1)}} className="mt-1 w-full p-2.5 border border-gray-300 rounded-md" placeholder="Ex: 10"/>
                        </div>
                        <div>
                            <label htmlFor="max-age" className="block text-sm font-medium text-gray-700">Id. Máx.</label>
                            <input id="max-age" type="number" value={maxAge} onChange={(e) => {setMaxAge(e.target.value); setCurrentPage(1)}} className="mt-1 w-full p-2.5 border border-gray-300 rounded-md" placeholder="Ex: 15"/>
                        </div>
                    </div>
                     <div>
                        <label htmlFor="sort-by" className="block text-sm font-medium text-gray-700">Ordenar por</label>
                        <select id="sort-by" value={sortBy} onChange={e => {setSortBy(e.target.value); setCurrentPage(1)}} className="mt-1 w-full p-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
                            <option value="name-asc">Nome (A-Z)</option>
                            <option value="name-desc">Nome (Z-A)</option>
                            <option value="age-asc">Idade (Crescente)</option>
                            <option value="age-desc">Idade (Decrescente)</option>
                            <option value="registration-asc">Matrícula (Crescente)</option>
                            <option value="registration-desc">Matrícula (Decrescente)</option>
                        </select>
                    </div>
                    <div><Button onClick={clearFilters} variant="ghost" className="w-full"><i className="fas fa-times mr-2"></i> Limpar</Button></div>
                </div>
                 <div className="mt-4 pt-4 border-t flex flex-wrap gap-2 items-center">
                    <div className="flex items-center mr-4">
                         <input type="checkbox" id="select-all-filtered" className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-2" checked={allOnPageSelected} onChange={handleToggleSelectAll} aria-label="Selecionar todos os beneficiários na página"/>
                         <label htmlFor="select-all-filtered" className="text-sm font-medium text-gray-700">Selecionar na Página</label>
                    </div>
                    <Button onClick={() => { onPrintSelectedBadges(selectedIds); setSelectedIds([]); }} variant="secondary" disabled={selectedIds.length === 0} title={selectedIds.length > 0 ? `Gerar ${selectedIds.length} crachá(s)` : 'Selecione beneficiários para gerar crachás'}>
                        <i className="fas fa-id-card-clip mr-2"></i> Gerar Crachás ({selectedIds.length})
                    </Button>
                    <Button onClick={() => onPrint(sortedAndFilteredBeneficiaries)} variant="secondary"><i className="fas fa-print mr-2"></i> Imprimir Lista</Button>
                    <Button onClick={handleExport} variant="secondary" className="bg-green-600 text-white hover:bg-green-700"><i className="fas fa-file-csv mr-2"></i> Exportar</Button>
                    <Button onClick={onImport} variant="secondary" className="bg-blue-500 text-white hover:bg-blue-600"><i className="fas fa-file-import mr-2"></i> Importar</Button>
                    <Button onClick={onRegenerate} variant="warning" title="Recria todas as matrículas sequencialmente."><i className="fas fa-bolt mr-2"></i> Regerar Matrículas</Button>
                </div>
            </div>

            {sortedAndFilteredBeneficiaries.length > 0 ? (
                <>
                    <div className="space-y-3">
                        {paginatedBeneficiaries.map(beneficiary => {
                            const conflicts = beneficiaryConflicts.get(beneficiary.id);
                            const isExpanded = expandedId === beneficiary.id;
                            const enrolledWorkshops = workshops.filter(w => beneficiary.workshopIds.includes(w.id));
                            
                            return (
                                <div key={beneficiary.id} className={`bg-white rounded-lg border border-gray-200 shadow-sm transition-all duration-300 ${isExpanded ? 'ring-2 ring-indigo-500' : 'hover:shadow-md'}`}>
                                    {/* Collapsed View */}
                                    <div className="flex items-center p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : beneficiary.id)}>
                                        <input type="checkbox" className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" checked={selectedIds.includes(beneficiary.id)} onChange={() => handleToggleSelect(beneficiary.id)} onClick={e => e.stopPropagation()} aria-label={`Selecionar ${beneficiary.name}`} />
                                        
                                        <div className="ml-4 w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-600 text-xl flex-shrink-0">
                                            {beneficiary.name.charAt(0)}
                                        </div>

                                        <div className="ml-4 flex-1 grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
                                            <div>
                                                <p className="font-bold text-gray-800 truncate">{beneficiary.name}</p>
                                                <p className="text-sm text-gray-500">Matrícula: {beneficiary.registration}</p>
                                            </div>
                                            <div className="text-gray-600"><i className="fas fa-birthday-cake mr-2 text-gray-400"></i> {calculateAge(beneficiary.birthDate) || 'N/A'} anos</div>
                                            <div className="text-gray-600">
                                                 {conflicts ? (
                                                     <span className="flex items-center text-yellow-600 font-semibold" title={`Conflito de horário: ${conflicts.map(p => `"${p[0].name}" e "${p[1].name}"`).join('; ')}`}>
                                                         <i className="fas fa-exclamation-triangle mr-2"></i> Conflito
                                                     </span>
                                                 ) : (
                                                    <span className="flex items-center text-green-600 font-semibold"><i className="fas fa-check-circle mr-2"></i> Sem conflitos</span>
                                                 )}
                                            </div>
                                            <div className="text-gray-600">
                                                <span className={`px-3 py-1 text-sm font-semibold rounded-full ${beneficiary.workshopIds.length > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                                    {beneficiary.workshopIds.length} {beneficiary.workshopIds.length === 1 ? 'Oficina' : 'Oficinas'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="ml-4 flex items-center gap-4 text-gray-500">
                                            <button onClick={(e) => { e.stopPropagation(); onEdit(beneficiary); }} className="hover:text-indigo-600" title="Editar"><i className="fas fa-pencil-alt text-lg"></i></button>
                                            <i className={`fas fa-chevron-down transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}></i>
                                        </div>
                                    </div>
                                    
                                    {/* Expanded View */}
                                    <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[500px]' : 'max-h-0'}`}>
                                        <div className="px-4 pb-4 pt-2 border-t border-gray-200">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
                                                <div><i className="fas fa-id-card w-5 mr-2 text-gray-400"></i><strong>CPF:</strong> {beneficiary.cpf}</div>
                                                <div><i className="fas fa-phone w-5 mr-2 text-gray-400"></i><strong>Telefone:</strong> {beneficiary.phone} <a href={`https://wa.me/55${beneficiary.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2 py-1 text-xs font-medium text-white bg-green-500 rounded-full hover:bg-green-600 ml-2 transition-colors"><i className="fab fa-whatsapp mr-1"></i>WhatsApp</a></div>
                                                <div className="col-span-full"><i className="fas fa-folder-open w-5 mr-2 text-gray-400"></i><strong>Arquivo Físico:</strong> {beneficiary.physicalFileLocation || 'Não informado'}</div>
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-gray-700 mb-2">Oficinas Inscritas:</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {enrolledWorkshops.length > 0 ? enrolledWorkshops.map(w => {
                                                        const color = WORKSHOP_COLOR_MAP[w.color] || WORKSHOP_COLOR_MAP.gray;
                                                        return (
                                                            <div key={w.id} className={`p-2 rounded-lg border w-full sm:w-auto sm:max-w-xs flex-grow ${color.bg} ${color.border}`}>
                                                                <p className={`font-bold text-sm ${color.text}`}>{w.name}</p>
                                                                <p className="text-xs text-gray-600">{w.days.join(', ')} - {w.time}</p>
                                                            </div>
                                                        );
                                                    }) : <p className="text-sm text-gray-500">Nenhuma oficina inscrita.</p>}
                                                </div>
                                            </div>
                                            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
                                                <Button onClick={() => onPrintBadge(beneficiary)} variant="ghost"><i className="fas fa-id-card mr-2"></i> Crachá</Button>
                                                <Button onClick={() => onTransfer(beneficiary)} variant="ghost"><i className="fas fa-exchange-alt mr-2"></i> Gerenciar Oficinas</Button>
                                                <Button onClick={() => onOpenConfirmation('Confirmar Exclusão', `Tem certeza que deseja excluir o beneficiário "${beneficiary.name}"? Esta ação é irreversível.`, () => onDelete(beneficiary.id))} variant="danger"><i className="fas fa-trash-alt mr-2"></i> Excluir</Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                        itemsPerPage={itemsPerPage}
                        onItemsPerPageChange={handleItemsPerPageChange}
                        totalItems={sortedAndFilteredBeneficiaries.length}
                        startIndex={startIndex}
                        endIndex={endIndex}
                    />
                </>
            ) : (
                <div className="text-center py-16 text-gray-500 bg-white rounded-lg border">
                    <p className="text-lg font-semibold">Nenhum beneficiário encontrado.</p>
                    <p className="text-base">Tente ajustar os filtros ou adicione um novo beneficiário.</p>
                </div>
            )}
        </div>
    );
};

const EducatorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (educator: Educator) => void;
    educatorToEdit: Educator | null;
}> = ({ isOpen, onClose, onSave, educatorToEdit }) => {
    const [formData, setFormData] = useState<Omit<Educator, 'id'>>({
        name: '', specialty: '', workload: 0
    });

    useEffect(() => {
        if (educatorToEdit) {
            setFormData(educatorToEdit);
        } else {
            setFormData({ name: '', specialty: '', workload: 0 });
        }
    }, [educatorToEdit, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseInt(value) || 0 : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalEducator: Educator = {
            ...formData,
            id: educatorToEdit?.id || `edu${Date.now()}`
        };
        onSave(finalEducator);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={educatorToEdit ? "Editar Educador" : "Adicionar Novo Educador"}>
            <form onSubmit={handleSubmit}>
                <div className="p-6 space-y-4">
                    <div>
                        <label htmlFor="name-educator" className="block text-sm font-medium text-gray-700">Nome Completo</label>
                        <input type="text" name="name" id="name-educator" value={formData.name} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                        <label htmlFor="specialty" className="block text-sm font-medium text-gray-700">Especialidade</label>
                        <input type="text" name="specialty" id="specialty" value={formData.specialty} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div>
                        <label htmlFor="workload" className="block text-sm font-medium text-gray-700">Carga Horária (horas/semana)</label>
                        <input type="number" name="workload" id="workload" value={formData.workload} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                </div>
                <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                    <Button onClick={onClose} variant="ghost">Cancelar</Button>
                    <Button onClick={() => {}} type="submit">{educatorToEdit ? "Salvar Alterações" : "Adicionar Educador"}</Button>
                </div>
            </form>
        </Modal>
    );
};

const calculateDuration = (timeString: string): number => {
    if (!timeString || !timeString.includes('-')) return 0;
    
    const parts = timeString.split('-').map(s => s.trim());
    if (parts.length !== 2) return 0;

    const [startTime, endTime] = parts;
    
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
        return 0;
    }

    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;

    if (endTotalMinutes < startTotalMinutes) {
        return 0;
    }

    const durationMinutes = endTotalMinutes - startTotalMinutes;
    return durationMinutes / 60;
};


const EducatorWorkloadModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    educator: Educator | null;
    workshops: Workshop[];
}> = ({ isOpen, onClose, educator, workshops }) => {
    if (!isOpen || !educator) return null;

    const assignedWorkshops = useMemo(() => {
        return workshops
            .filter(w => w.educatorId === educator.id)
            .map(w => {
                const duration = calculateDuration(w.time);
                const weeklyHours = duration * w.days.length;
                return { ...w, duration, weeklyHours };
            });
    }, [workshops, educator]);

    const totalAssignedHours = useMemo(() => {
        return assignedWorkshops.reduce((acc, w) => acc + w.weeklyHours, 0);
    }, [assignedWorkshops]);
    
    const difference = totalAssignedHours - educator.workload;

    const WorkloadStat: React.FC<{ label: string; value: string; icon: string; color: string; }> = ({ label, value, icon, color }) => (
        <div className="flex flex-col items-center text-center p-4 bg-gray-50 rounded-lg border h-full">
           <div className={`flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-lg ${color} text-white mb-3`}>
               <i className={`${icon} text-xl`}></i>
           </div>
           <div className="min-w-0">
               <dl>
                   <dt className="text-sm font-medium text-gray-500">{label}</dt>
                   <dd className="mt-1 text-2xl font-semibold text-gray-900">{value}</dd>
               </dl>
           </div>
       </div>
   );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Gerenciamento de Horas - ${educator.name}`} size="lg">
            <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <WorkloadStat label="Carga Horária Contratual" value={`${educator.workload}h`} icon="fas fa-file-contract" color="bg-blue-500" />
                    <WorkloadStat label="Horas Atribuídas (Semanal)" value={`${totalAssignedHours.toFixed(1)}h`} icon="fas fa-tasks" color="bg-indigo-500" />
                    <WorkloadStat 
                        label={difference > 0 ? "Horas Excedentes" : "Horas Disponíveis"} 
                        value={`${Math.abs(difference).toFixed(1)}h`} 
                        icon={difference > 0 ? "fas fa-arrow-up" : "fas fa-arrow-down"}
                        color={difference > 0 ? "bg-red-500" : "bg-green-500"} 
                    />
                </div>
                
                <h4 className="text-lg font-semibold text-gray-700 mb-2">Detalhamento de Oficinas</h4>
                
                <div className="overflow-x-auto border rounded-lg max-h-80">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oficina</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Duração/Sessão</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Sessões/Semana</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Horas/Semana</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {assignedWorkshops.length > 0 ? assignedWorkshops.map(w => (
                                <tr key={w.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{w.name} ({w.ageGroup})</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{w.duration.toFixed(1)}h</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{w.days.length}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-semibold text-center">{w.weeklyHours.toFixed(1)}h</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="text-center py-6 text-gray-500">Nenhuma oficina atribuída a este educador.</td>
                                </tr>
                            )}
                        </tbody>
                         {assignedWorkshops.length > 0 && (
                            <tfoot className="bg-gray-50">
                                <tr>
                                    <td colSpan={3} className="px-6 py-3 text-right font-bold text-gray-700">Total Semanal</td>
                                    <td className="px-6 py-3 text-center font-bold text-lg text-indigo-700">{totalAssignedHours.toFixed(1)}h</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
             <div className="bg-gray-50 px-6 py-4 flex justify-end">
                <Button onClick={onClose} variant="secondary">Fechar</Button>
            </div>
        </Modal>
    );
};

const EducatorsTab: React.FC<{
    educators: Educator[];
    workshops: Workshop[];
    onAdd: () => void;
    onEdit: (educator: Educator) => void;
    onDelete: (id: string) => void;
    onImport: () => void;
    onOpenConfirmation: (title: string, message: string, onConfirm: () => void) => void;
    addToast: (toast: Omit<ToastMessage, 'id'>) => void;
    onOpenWorkload: (educator: Educator) => void;
}> = ({ educators, workshops, onAdd, onEdit, onDelete, onImport, onOpenConfirmation, addToast, onOpenWorkload }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredEducators = useMemo(() => {
        if (!searchTerm) return educators;
        const normalizedFilter = normalizeText(searchTerm);
        return educators.filter(e =>
            normalizeText(e.name).includes(normalizedFilter) ||
            normalizeText(e.specialty).includes(normalizedFilter)
        );
    }, [educators, searchTerm]);

    const educatorWorkloads = useMemo(() => {
        const workloadMap = new Map<string, number>();
        educators.forEach(educator => {
            const assignedWorkshops = workshops
                .filter(w => w.educatorId === educator.id && w.status === 'Ativo')
                .map(w => {
                    const duration = calculateDuration(w.time);
                    const weeklyHours = duration * w.days.length;
                    return { ...w, weeklyHours };
                });
            
            const totalAssignedHours = assignedWorkshops.reduce((acc, w) => acc + w.weeklyHours, 0);
            workloadMap.set(educator.id, totalAssignedHours);
        });
        return workloadMap;
    }, [educators, workshops]);

    const handleExport = () => {
        const dataToExport = filteredEducators.map(e => ({
            'Nome': e.name,
            'Especialidade': e.specialty,
            'Carga Horaria': e.workload,
            'Oficinas Ministradas': workshops.filter(w => w.educatorId === e.id).map(w => w.name).join(', ') || 'Nenhuma'
        }));
        const success = exportToCsv('lista_educadores', dataToExport);
        if (success) {
            addToast({ type: 'success', title: 'Exportação Concluída', message: 'Lista de educadores exportada para CSV.' });
        } else {
            addToast({ type: 'warning', title: 'Nada para Exportar', message: 'A lista de educadores está vazia.' });
        }
    };
    
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm animate-fade-in border border-gray-200/80">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Lista de Educadores</h2>
                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end">
                    <Button onClick={onImport} variant="secondary" className="bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500">
                        <i className="fas fa-file-import mr-2"></i> Importar
                    </Button>
                    <Button onClick={handleExport} variant="secondary" className="bg-green-600 text-white hover:bg-green-700 focus:ring-green-500">
                        <i className="fas fa-file-csv mr-2"></i> Exportar
                    </Button>
                    <Button onClick={onAdd}>
                        <i className="fas fa-plus mr-2"></i> Adicionar Educador
                    </Button>
                </div>
            </div>
            <div className="mt-4">
                <label htmlFor="search-educator" className="block text-sm font-medium text-gray-700">Buscar por nome ou especialidade</label>
                <input
                    id="search-educator"
                    type="text"
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="mt-1 w-full md:w-1/2 p-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
            </div>
            <div className="mt-4 -mx-6 md:mx-0">
                <table className="min-w-full responsive-table">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Nome</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Especialidade</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Carga de Trabalho <i className="fas fa-sort text-gray-400"></i></th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 md:divide-y-0">
                        {filteredEducators.map(educator => {
                            const totalAssignedHours = educatorWorkloads.get(educator.id) || 0;
                            return (
                                <tr key={educator.id}>
                                    <td data-label="Nome" className="px-6 py-4 whitespace-nowrap text-base font-medium text-gray-900">{educator.name}</td>
                                    <td data-label="Especialidade" className="px-6 py-4 whitespace-nowrap text-base text-gray-600">{educator.specialty}</td>
                                    <td data-label="Carga de Trabalho" className="px-6 py-4 whitespace-nowrap text-base text-gray-600">
                                        {(() => {
                                            const percentage = educator.workload > 0 ? (totalAssignedHours / educator.workload) * 100 : 0;
                                            const isOverloaded = percentage > 100;

                                            let progressBarColor = 'bg-green-500';
                                            if (isOverloaded) {
                                                progressBarColor = 'bg-red-500';
                                            } else if (percentage >= 90) {
                                                progressBarColor = 'bg-yellow-500';
                                            }

                                            return (
                                                <div className="flex items-center gap-3 w-full">
                                                    <div className="flex-grow min-w-[80px]" title={`${percentage.toFixed(1)}% da carga horária preenchida.`}>
                                                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                                                            <div 
                                                                className={`${progressBarColor} h-2.5 rounded-full transition-all duration-500 ease-in-out`} 
                                                                style={{ width: `${Math.min(percentage, 100)}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                    <span className={`text-sm font-medium whitespace-nowrap ${isOverloaded ? 'text-red-600' : 'text-gray-700'}`}>
                                                        {totalAssignedHours.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h / {educator.workload}h
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td data-label="Ações" className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <div className="flex items-center space-x-4">
                                            <button onClick={() => onOpenWorkload(educator)} className="text-blue-600 hover:text-blue-900" title="Ver Carga Horária"><i className="fas fa-clock text-lg"></i></button>
                                            <button onClick={() => onEdit(educator)} className="text-indigo-600 hover:text-indigo-900" title="Editar"><i className="fas fa-pencil-alt text-lg"></i></button>
                                            <button onClick={() => onOpenConfirmation(
                                                'Confirmar Exclusão',
                                                `Tem certeza que deseja excluir o educador "${educator.name}"? Oficinas associadas a ele precisarão de um novo educador.`,
                                                () => onDelete(educator.id)
                                            )} className="text-red-600 hover:text-red-900" title="Excluir"><i className="fas fa-trash-alt text-lg"></i></button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                 {filteredEducators.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        <p>Nenhum educador encontrado.</p>
                    </div>
                )}
            </div>
        </div>
    );
};


const WorkshopModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (workshop: Workshop) => void;
    workshopToEdit: Workshop | null;
    allEducators: Educator[];
}> = ({ isOpen, onClose, onSave, workshopToEdit, allEducators }) => {
    const [formData, setFormData] = useState<Omit<Workshop, 'id'>>({
        name: '', ageGroup: '', days: [], time: '', status: 'Ativo', educatorId: '', maxCapacity: 20, color: 'indigo', category: 'Esporte', physicalFileLocation: ''
    });
    const weekDays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

    useEffect(() => {
        if (workshopToEdit) {
            setFormData(workshopToEdit);
        } else {
            setFormData({ name: '', ageGroup: '', days: [], time: '', status: 'Ativo', educatorId: allEducators[0]?.id || '', maxCapacity: 20, color: 'indigo', category: 'Esporte', physicalFileLocation: '' });
        }
    }, [workshopToEdit, isOpen, allEducators]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseInt(value) : value }));
    };

    const handleDayChange = (day: string) => {
        setFormData(prev => {
            const newDays = prev.days.includes(day)
                ? prev.days.filter(d => d !== day)
                : [...prev.days, day];
            return { ...prev, days: newDays };
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalWorkshop: Workshop = {
            ...formData,
            id: workshopToEdit?.id || `ws${Date.now()}`
        };
        onSave(finalWorkshop);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={workshopToEdit ? "Editar Oficina" : "Adicionar Nova Oficina"}>
            <form onSubmit={handleSubmit}>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="name-workshop" className="block text-sm font-medium text-gray-700">Nome da Oficina</label>
                            <input type="text" name="name" id="name-workshop" value={formData.name} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm" />
                        </div>
                        <div>
                             <label htmlFor="ageGroup" className="block text-sm font-medium text-gray-700">Faixa Etária</label>
                             <input type="text" name="ageGroup" id="ageGroup" value={formData.ageGroup} onChange={handleChange} required placeholder="Ex: 07 a 11 anos, Adulto" className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Dias da Semana</label>
                        <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-2">
                            {weekDays.map(day => (
                                <button type="button" key={day} onClick={() => handleDayChange(day)}
                                    className={`px-3 py-2 text-sm rounded-md border transition-colors ${formData.days.includes(day) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
                                    {day}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="time" className="block text-sm font-medium text-gray-700">Horário</label>
                            <input type="text" name="time" id="time" value={formData.time} onChange={handleChange} required placeholder="Ex: 14:00 - 16:00" className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm" />
                        </div>
                        <div>
                            <label htmlFor="category" className="block text-sm font-medium text-gray-700">Categoria</label>
                            <select name="category" id="category" value={formData.category} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm">
                                <option value="Esporte">Esporte</option>
                                <option value="Arte e Cultura">Arte e Cultura</option>
                                <option value="Administrativo">Administrativo</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                           <label htmlFor="educatorId" className="block text-sm font-medium text-gray-700">Educador Responsável</label>
                           <select name="educatorId" id="educatorId" value={formData.educatorId} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm">
                               <option value="" disabled>Selecione um educador</option>
                               {allEducators.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                           </select>
                       </div>
                       <div>
                           <label htmlFor="maxCapacity" className="block text-sm font-medium text-gray-700">Nº Máximo de Vagas</label>
                           <input type="number" name="maxCapacity" id="maxCapacity" value={formData.maxCapacity} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm" />
                       </div>
                    </div>

                    <div>
                        <label htmlFor="physicalFileLocation-workshop" className="block text-sm font-medium text-gray-700">Localização do Arquivo Físico</label>
                        <input 
                            type="text" 
                            name="physicalFileLocation" 
                            id="physicalFileLocation-workshop" 
                            value={formData.physicalFileLocation || ''} 
                            onChange={handleChange} 
                            placeholder="Selecione ou digite a localização" 
                            className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm" 
                            list="physical-locations-list"
                        />
                    </div>
                    
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
                            <select name="status" id="status" value={formData.status} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm">
                                <option value="Ativo">Ativo</option>
                                <option value="Inativo">Inativo</option>
                            </select>
                        </div>
                        <div>
                             <label htmlFor="color" className="block text-sm font-medium text-gray-700">Cor da Etiqueta</label>
                             <select name="color" id="color" value={formData.color} onChange={handleChange} required className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md shadow-sm">
                                {WORKSHOP_COLORS.map(c => <option key={c.name} value={c.name} className="capitalize">{c.name}</option>)}
                             </select>
                        </div>
                    </div>
                </div>
                <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                    <Button onClick={onClose} variant="ghost">Cancelar</Button>
                    <Button onClick={() => {}} type="submit">{workshopToEdit ? "Salvar Alterações" : "Adicionar Oficina"}</Button>
                </div>
            </form>
        </Modal>
    );
};

const WorkshopDetailsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    workshop: Workshop | null;
    educators: Educator[];
    beneficiaries: Beneficiary[];
}> = ({ isOpen, onClose, workshop, educators, beneficiaries }) => {
    if (!workshop) return null;

    const educatorName = educators.find(e => e.id === workshop.educatorId)?.name || 'N/A';
    const enrolledBeneficiaries = beneficiaries.filter(b => b.workshopIds.includes(workshop.id));
    const enrolledCount = enrolledBeneficiaries.length;
    const occupancyPercentage = workshop.maxCapacity > 0 ? (enrolledCount / workshop.maxCapacity) * 100 : 0;
    const isOverCapacity = enrolledCount > workshop.maxCapacity;

    const colorClasses = WORKSHOP_COLOR_MAP[workshop.color] || WORKSHOP_COLOR_MAP.gray;

    const getProgressBarColor = (percentage: number) => {
        if (percentage > 100) return 'bg-red-500';
        if (percentage >= 90) return 'bg-amber-500';
        if (percentage >= 70) return 'bg-yellow-500';
        return 'bg-green-500';
    };
    const progressBarColor = getProgressBarColor(occupancyPercentage);

    const DetailItem: React.FC<{ icon: string, label: string, value: React.ReactNode }> = ({ icon, label, value }) => (
        <div className="flex items-start">
            <i className={`fas ${icon} text-gray-400 w-6 text-center mt-1`}></i>
            <div className="ml-3">
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-base font-semibold text-gray-800">{value}</p>
            </div>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Detalhes da Oficina" size="lg">
            <div className={`p-6 border-b-4 ${colorClasses.border}`}>
                <div className="flex justify-between items-start">
                    <div>
                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${colorClasses.bg} ${colorClasses.text}`}>{workshop.category}</span>
                        <h3 className="text-3xl font-bold text-gray-800 mt-2">{workshop.name}</h3>
                    </div>
                     <span className={`px-3 py-1 text-sm font-semibold rounded-full whitespace-nowrap ${workshop.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {workshop.status}
                    </span>
                </div>
            </div>
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <DetailItem icon="fa-person-chalkboard" label="Educador Responsável" value={educatorName} />
                    <DetailItem icon="fa-users" label="Faixa Etária" value={workshop.ageGroup} />
                    <DetailItem icon="fa-calendar-alt" label="Dias da Semana" value={workshop.days.join(', ')} />
                    <DetailItem icon="fa-clock" label="Horário" value={workshop.time} />
                    {workshop.physicalFileLocation && (
                        <div className="md:col-span-2">
                            <DetailItem icon="fa-folder-open" label="Localização do Arquivo Físico" value={workshop.physicalFileLocation} />
                        </div>
                    )}
                </div>
                <div>
                    <h4 className="text-base font-medium text-gray-700 mb-2">Ocupação de Vagas</h4>
                     <div className="flex justify-between items-center text-sm mb-1">
                        <span className="font-medium text-gray-600">Inscritos</span>
                        <span className={`font-bold ${isOverCapacity ? 'text-red-600' : 'text-gray-800'}`}>{enrolledCount} / {workshop.maxCapacity}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                        <div className={`${progressBarColor} h-3 rounded-full transition-all duration-500`} style={{ width: `${Math.min(occupancyPercentage, 100)}%` }}></div>
                    </div>
                </div>
                
                <div>
                    <h4 className="text-base font-medium text-gray-700 mb-2">Lista de Participantes ({enrolledCount})</h4>
                    {enrolledBeneficiaries.length > 0 ? (
                         <div className="border rounded-md max-h-52 overflow-y-auto">
                            <ul className="divide-y divide-gray-200">
                                {enrolledBeneficiaries.sort((a,b) => a.name.localeCompare(b.name)).map(b => (
                                    <li key={b.id} className="px-4 py-2 text-sm text-gray-800">{b.name}</li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div className="text-center text-gray-500 py-4 border rounded-md">
                            Nenhum participante inscrito nesta oficina.
                        </div>
                    )}
                </div>

            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-end">
                <Button onClick={onClose} variant="secondary">Fechar</Button>
            </div>
        </Modal>
    );
};

const WorkshopsTab: React.FC<{
    workshops: Workshop[];
    educators: Educator[];
    beneficiaries: Beneficiary[];
    onAdd: () => void;
    onEdit: (workshop: Workshop) => void;
    onDelete: (id: string) => void;
    onImport: () => void;
    onOpenConfirmation: (title: string, message: string, onConfirm: () => void) => void;
    onOpenFrequency: (workshop: Workshop) => void;
    onPrintBadges: (workshopId: string) => void;
    onPrintLabel: (workshop: Workshop) => void;
    onPrintList: (workshops: Workshop[]) => void;
    onOpenEnroll: (workshop: Workshop) => void;
    onOpenDetails: (workshop: Workshop) => void;
    addToast: (toast: Omit<ToastMessage, 'id'>) => void;
}> = ({ workshops, educators, beneficiaries, onAdd, onEdit, onDelete, onImport, onOpenConfirmation, onOpenFrequency, onPrintBadges, onPrintLabel, onPrintList, onOpenEnroll, onOpenDetails, addToast }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'Ativo' | 'Inativo'>('Ativo');
    const [categoryFilter, setCategoryFilter] = useState<'all' | 'Esporte' | 'Arte e Cultura' | 'Administrativo'>('all');

    const getEducatorName = useCallback((id: string) => educators.find(e => e.id === id)?.name || 'N/A', [educators]);

    const filteredWorkshops = useMemo(() => {
        return workshops.filter(w => {
            const statusMatch = statusFilter === 'all' || w.status === statusFilter;
            // FIX: Corrected a typo where 'categoryMatch' was used in its own declaration, causing a logical error in filtering.
            const categoryMatch = categoryFilter === 'all' || w.category === categoryFilter;
            const searchMatch = !searchTerm || normalizeText(w.name).includes(normalizeText(searchTerm)) || normalizeText(getEducatorName(w.educatorId)).includes(normalizeText(searchTerm));
            return statusMatch && searchMatch && categoryMatch;
        });
    }, [workshops, searchTerm, statusFilter, categoryFilter, getEducatorName]);

    const handleExport = () => {
        const dataToExport = filteredWorkshops.map(w => ({
            'Nome da Oficina': w.name,
            'Categoria': w.category,
            'Faixa Etaria': w.ageGroup,
            'Dias': w.days.join(', '),
            'Horario': w.time,
            'Educador': getEducatorName(w.educatorId),
            'Status': w.status,
            'Localização do Arquivo Físico': w.physicalFileLocation || 'N/A',
            'Vagas Ocupadas': beneficiaries.filter(b => b.workshopIds.includes(w.id)).length,
            'Capacidade Maxima': w.maxCapacity,
            'Cor': w.color
        }));

        if (exportToCsv('lista_oficinas', dataToExport)) {
            addToast({ type: 'success', title: 'Exportação Concluída', message: 'Lista de oficinas exportada para CSV.' });
        } else {
            addToast({ type: 'warning', title: 'Nada para Exportar', message: 'A lista de oficinas filtrada está vazia.' });
        }
    };
    
    const getProgressBarColor = (percentage: number) => {
        if (percentage > 100) return 'bg-red-500';
        if (percentage >= 90) return 'bg-amber-500';
        if (percentage >= 70) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm animate-fade-in border border-gray-200/80">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Lista de Oficinas</h2>
                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end">
                    <Button onClick={onImport} variant="secondary" className="bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500">
                        <i className="fas fa-file-import mr-2"></i> Importar
                    </Button>
                    <Button onClick={handleExport} variant="secondary" className="bg-green-600 text-white hover:bg-green-700 focus:ring-green-500">
                        <i className="fas fa-file-csv mr-2"></i> Exportar
                    </Button>
                    <Button onClick={() => onPrintList(filteredWorkshops)} variant="secondary">
                        <i className="fas fa-print mr-2"></i> Imprimir Lista
                    </Button>
                    <Button onClick={onAdd}>
                        <i className="fas fa-plus mr-2"></i> Adicionar Oficina
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="mt-6 p-4 bg-gray-50/70 rounded-lg border">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                    <div className="lg:col-span-2">
                        <label htmlFor="search-workshop" className="block text-sm font-medium text-gray-700 mb-1">Buscar por nome ou educador</label>
                        <input id="search-workshop" type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                    </div>
                    <div>
                        <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Status</label>
                        <select id="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
                            <option value="Ativo">Ativas</option>
                            <option value="Inativo">Inativas</option>
                            <option value="all">Todas</option>
                        </select>
                    </div>
                </div>
                 <div className="mt-4 pt-4 border-t">
                     <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por Categoria</label>
                     <div className="flex flex-wrap gap-2">
                         {(['all', 'Esporte', 'Arte e Cultura', 'Administrativo'] as const).map(cat => (
                             <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-4 py-2 text-sm font-semibold rounded-full transition-colors ${categoryFilter === cat ? 'bg-indigo-600 text-white shadow' : 'bg-white text-gray-700 hover:bg-gray-200 border'}`}>
                                 {cat === 'all' ? 'Todas' : cat}
                             </button>
                         ))}
                     </div>
                 </div>
            </div>

            {/* Workshops Grid */}
            <div className="mt-8">
                {filteredWorkshops.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredWorkshops.map(workshop => {
                            const enrolledCount = beneficiaries.filter(b => b.workshopIds.includes(workshop.id)).length;
                            const colorClasses = WORKSHOP_COLOR_MAP[workshop.color] || WORKSHOP_COLOR_MAP.gray;
                            const isOverCapacity = enrolledCount > workshop.maxCapacity;
                            const occupancyPercentage = workshop.maxCapacity > 0 ? (enrolledCount / workshop.maxCapacity) * 100 : 0;
                            const progressBarColor = getProgressBarColor(occupancyPercentage);

                            return (
                                <div 
                                    key={workshop.id} 
                                    className={`bg-white rounded-xl shadow-md overflow-hidden border-t-4 ${colorClasses.border} transition-all duration-300 hover:shadow-xl hover:-translate-y-1 flex flex-col cursor-pointer`}
                                    onClick={() => onOpenDetails(workshop)}
                                >
                                    <div className="p-5">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className={`text-xs font-semibold uppercase tracking-wider ${colorClasses.text}`}>{workshop.category}</p>
                                                <h3 className="text-xl font-bold text-gray-800 mt-1">{workshop.name}</h3>
                                                <p className="text-sm text-gray-500 font-medium">{workshop.ageGroup}</p>
                                            </div>
                                            <span className={`px-3 py-1 text-xs font-bold rounded-full whitespace-nowrap ${workshop.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {workshop.status}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="px-5 pb-5 border-b border-gray-100 space-y-3 text-sm">
                                        <p className="text-gray-600 flex items-center"><i className="fas fa-person-chalkboard mr-3 text-gray-400 w-5 text-center"></i>{getEducatorName(workshop.educatorId)}</p>
                                        <p className="text-gray-600 flex items-center"><i className="far fa-calendar-alt mr-3 text-gray-400 w-5 text-center"></i>{workshop.days.join(', ')}</p>
                                        <p className="text-gray-600 flex items-center"><i className="far fa-clock mr-3 text-gray-400 w-5 text-center"></i>{workshop.time}</p>
                                    </div>
                                    
                                    <div className="px-5 py-4 flex-grow">
                                        <div className="flex justify-between items-center text-sm mb-1">
                                            <span className="font-medium text-gray-600">Ocupação</span>
                                            <span className={`font-bold ${isOverCapacity ? 'text-red-600' : 'text-gray-800'}`}>{enrolledCount} / {workshop.maxCapacity}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                                            <div className={`${progressBarColor} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${Math.min(occupancyPercentage, 100)}%` }}></div>
                                        </div>
                                    </div>

                                    <div 
                                        className="bg-gray-50/70 p-3 flex justify-around items-center mt-auto border-t"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                         <button onClick={() => onPrintLabel(workshop)} className="text-gray-500 hover:text-gray-800 text-lg transition-colors" title="Imprimir Etiqueta da Turma"><i className="fas fa-tag"></i></button>
                                         <button onClick={() => onPrintBadges(workshop.id)} className="text-gray-500 hover:text-gray-800 text-lg transition-colors" title="Imprimir Crachás da Turma"><i className="fas fa-address-card"></i></button>
                                         <button onClick={() => onOpenEnroll(workshop)} className="text-gray-500 hover:text-green-600 text-lg transition-colors" title="Adicionar Participantes"><i className="fas fa-user-plus"></i></button>
                                         <button onClick={() => onEdit(workshop)} className="text-gray-500 hover:text-indigo-600 text-lg transition-colors" title="Editar"><i className="fas fa-pencil-alt"></i></button>
                                         <button onClick={() => onOpenConfirmation(
                                             'Confirmar Exclusão',
                                             `Tem certeza que deseja excluir a oficina "${workshop.name}"? Os beneficiários inscritos serão desvinculados.`,
                                             () => onDelete(workshop.id)
                                         )} className="text-gray-500 hover:text-red-600 text-lg transition-colors" title="Excluir"><i className="fas fa-trash-alt"></i></button>
                                         <button onClick={() => onOpenFrequency(workshop)} className="text-white bg-indigo-600 hover:bg-indigo-700 font-semibold px-4 py-2 rounded-lg text-sm transition-colors shadow-sm" title="Frequência">
                                            Frequência <i className="fas fa-arrow-right ml-2"></i>
                                         </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-16 text-gray-500">
                        <p className="text-lg font-semibold">Nenhuma oficina encontrada.</p>
                        <p className="text-base">Tente ajustar os filtros ou adicione uma nova oficina.</p>
                    </div>
                )}
            </div>
        </div>
    );
};


const FrequencyTab: React.FC<{
    workshops: Workshop[];
    beneficiaries: Beneficiary[];
    frequencies: Frequency[];
    onSave: (workshopId: string, date: string, attendance: Record<string, AttendanceStatus>) => void;
    onOpenWorkshopPopover: (beneficiary: Beneficiary, target: HTMLElement, currentWorkshopId?: string) => void;
}> = ({ workshops, beneficiaries, frequencies, onSave, onOpenWorkshopPopover }) => {
    const [selectedWorkshopId, setSelectedWorkshopId] = useState<string>('');
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('sv-SE'));
    
    const activeWorkshops = useMemo(() => workshops.filter(w => w.status === 'Ativo'), [workshops]);

    useEffect(() => {
        if (!selectedWorkshopId && activeWorkshops.length > 0) {
            setSelectedWorkshopId(activeWorkshops[0].id);
        }
    }, [activeWorkshops, selectedWorkshopId]);

    const beneficiariesInWorkshop = useMemo(() => {
        if (!selectedWorkshopId) return [];
        return beneficiaries
            .filter(b => b.workshopIds.includes(selectedWorkshopId))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [beneficiaries, selectedWorkshopId]);

    const currentAttendance = useMemo(() => {
        const record = frequencies.find(f => f.workshopId === selectedWorkshopId && f.date === selectedDate);
        return record ? record.attendance : {};
    }, [frequencies, selectedWorkshopId, selectedDate]);
    
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(currentAttendance);

    useEffect(() => {
        setAttendance(currentAttendance);
    }, [currentAttendance]);

    const handleStatusChange = (beneficiaryId: string, status: AttendanceStatus) => {
        setAttendance(prev => ({...(prev || {}), [beneficiaryId]: status }));
    };

    const handleSave = () => {
        if (selectedWorkshopId && selectedDate) {
            onSave(selectedWorkshopId, selectedDate, attendance);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm animate-fade-in border border-gray-200/80">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-semibold text-gray-800">Controle de Frequência</h2>
                <Button onClick={handleSave}>
                    <i className="fas fa-save mr-2"></i> Salvar Frequência
                </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                    <label htmlFor="workshop-select" className="block text-sm font-medium text-gray-700">Selecione a Oficina</label>
                    <select id="workshop-select" value={selectedWorkshopId} onChange={e => setSelectedWorkshopId(e.target.value)}
                        className="mt-1 w-full p-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
                        {activeWorkshops.map(w => <option key={w.id} value={w.id}>{w.name} ({w.ageGroup})</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="date-select" className="block text-sm font-medium text-gray-700">Selecione a Data</label>
                    <input type="date" id="date-select" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                        className="mt-1 w-full p-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                </div>
            </div>

            <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">Nº / Beneficiário</th>
                            <th className="px-6 py-3 text-center text-sm font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {beneficiariesInWorkshop.map((b, index) => (
                            <tr key={b.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-gray-900">
                                    <div className="flex items-center gap-2">
                                        <span>{index + 1}. {b.name}</span>
                                        {b.workshopIds.length > 1 && (
                                            <button
                                                onClick={(e) => onOpenWorkshopPopover(b, e.currentTarget, selectedWorkshopId)}
                                                title={`Participa de ${b.workshopIds.length} oficinas. Clique para ver.`}
                                                className="text-indigo-600 hover:text-indigo-800 transition-colors p-1 rounded-full hover:bg-indigo-100"
                                            >
                                                <i className="fas fa-layer-group"></i>
                                            </button>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">
                                    <div className="flex flex-col sm:flex-row justify-center items-center gap-2">
                                        {(['present', 'absent', 'justified'] as AttendanceStatus[]).map(status => (
                                            <button key={status} onClick={() => handleStatusChange(b.id, status)}
                                                className={`px-4 py-2 w-32 text-base font-semibold rounded-md border transition-all duration-200 ${
                                                    (attendance[b.id] || 'absent') === status 
                                                        ? {present: 'bg-green-600 text-white shadow-sm', absent: 'bg-red-600 text-white shadow-sm', justified: 'bg-yellow-500 text-white shadow-sm'}[status]
                                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                            >
                                                {{present: 'Presente', absent: 'Faltou', justified: 'Justificado'}[status]}
                                            </button>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {beneficiariesInWorkshop.length === 0 && (
                    <div className="text-center py-16 text-gray-500">
                         {selectedWorkshopId ? <p>Nenhum beneficiário inscrito nesta oficina.</p> : <p>Selecione uma oficina para iniciar.</p>}
                    </div>
                 )}
            </div>
        </div>
    );
};

const ReportsTab: React.FC<{
    beneficiaries: Beneficiary[];
    workshops: Workshop[];
    educators: Educator[];
    calculateAge: (birthDate: string) => number;
}> = ({ beneficiaries, workshops, educators, calculateAge }) => {
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [analysis, setAnalysis] = useState<string>('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const getAgeGroup = (age: number): string => {
        if (age >= 4 && age < 7) return '04 a 06 anos';
        if (age >= 7 && age < 12) return '07 a 11 anos';
        if (age >= 12 && age < 18) return '12 a 17 anos';
        if (age >= 18 && age < 30) return '18 a 29 anos';
        if (age >= 30 && age < 60) return '30 a 59 anos';
        if (age >= 60) return '60+ anos';
        return 'Idade não informada';
    };

    const generateReport = () => {
        setIsLoading(true);
        // Simulate report generation delay
        setTimeout(() => {
            const overallStats: ReportData['overallStats'] = {};
            const workshopStats: ReportData['workshopStats'] = {};

            beneficiaries.forEach(b => {
                const age = calculateAge(b.birthDate);
                const ageGroup = getAgeGroup(age);
                if (!overallStats[ageGroup]) {
                    overallStats[ageGroup] = { Masculino: 0, Feminino: 0, Total: 0 };
                }
                if (b.gender === 'Masculino') {
                    overallStats[ageGroup].Masculino++;
                } else if (b.gender === 'Feminino') {
                    overallStats[ageGroup].Feminino++;
                }
                overallStats[ageGroup].Total++;
            });

            workshops.forEach(w => {
                const workshopBeneficiaries = beneficiaries.filter(b => b.workshopIds.includes(w.id));
                const stats: ReportData['overallStats'] = {};
                workshopBeneficiaries.forEach(b => {
                    const age = calculateAge(b.birthDate);
                    const ageGroup = getAgeGroup(age);
                    if (!stats[ageGroup]) {
                        stats[ageGroup] = { Masculino: 0, Feminino: 0, Total: 0 };
                    }
                    if (b.gender === 'Masculino') {
                        stats[ageGroup].Masculino++;
                    } else if (b.gender === 'Feminino') {
                        stats[ageGroup].Feminino++;
                    }
                    stats[ageGroup].Total++;
                });

                workshopStats[w.id] = {
                    workshopName: w.name,
                    educatorName: educators.find(e => e.id === w.educatorId)?.name || 'N/A',
                    stats
                };
            });

            const textContent = `
                Relatório Geral
                Total de Beneficiários: ${beneficiaries.length}
                Total de Oficinas: ${workshops.length}
                Total de Educadores: ${educators.length}
            `;

            setReportData({
                title: 'Relatório Geral de Atividades',
                generationDate: new Date().toLocaleString('pt-BR'),
                overallStats,
                workshopStats,
                textContent
            });
            setIsLoading(false);
            setAnalysis(''); // Clear previous analysis
        }, 500);
    };

    const handleAnalyze = async () => {
        if (!reportData) return;
        setIsAnalyzing(true);
        setAnalysis('');
        try {
            const reportString = JSON.stringify(reportData, null, 2);
            const geminiAnalysis = await analyzeDataWithGemini(reportString);
            setAnalysis(geminiAnalysis);
        } catch (error) {
            console.error("Error analyzing data with Gemini:", error);
            setAnalysis("Ocorreu um erro ao tentar analisar os dados. Verifique o console para mais detalhes.");
        } finally {
            setIsAnalyzing(false);
        }
    };
    
    // Simple markdown to HTML renderer
    const renderMarkdown = (text: string) => {
        const html = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\n/g, '<br />'); // Newlines
        return <div dangerouslySetInnerHTML={{ __html: html }} />;
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200/80">
                <h2 className="text-xl font-semibold text-gray-700">Gerador de Relatórios</h2>
                <p className="mt-1 text-gray-600">Gere e analise relatórios sobre os dados do programa.</p>
                <Button onClick={generateReport} disabled={isLoading} className="mt-4 flex items-center">
                    {isLoading && <span className="loader"></span>}
                    {isLoading ? 'Gerando...' : 'Gerar Relatório Atual'}
                </Button>
            </div>

            {reportData && (
                 <div className="bg-white p-6 rounded-xl shadow-sm animate-fade-in space-y-6 border border-gray-200/80">
                    <div>
                        <h3 className="text-xl font-semibold text-gray-800">{reportData.title}</h3>
                        <p className="text-sm text-gray-500">Gerado em: {reportData.generationDate}</p>
                    </div>
                    <div>
                         <Button onClick={handleAnalyze} disabled={isAnalyzing} variant="secondary" className="bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 flex items-center">
                            {isAnalyzing && <span className="loader"></span>}
                            <i className="fas fa-wand-magic-sparkles mr-2"></i>
                            {isAnalyzing ? 'Analisando...' : 'Analisar com IA'}
                        </Button>
                    </div>

                    {analysis && (
                        <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                             <h4 className="font-semibold text-gray-700 mb-2">Análise Inteligente (Gemini AI)</h4>
                             <div className="prose prose-sm max-w-none text-gray-600">{renderMarkdown(analysis)}</div>
                        </div>
                    )}
                    {/* Here you would render the tables for reportData.overallStats and reportData.workshopStats */}
                </div>
            )}
        </div>
    );
};

const CommunicationTab: React.FC<{
    beneficiaries: Beneficiary[];
    workshops: Workshop[];
    scheduledMessages: ScheduledMessage[];
    onScheduleMessage: (message: Omit<ScheduledMessage, 'id' | 'status'>) => void;
    onSendMessageNow: (message: Omit<ScheduledMessage, 'id' | 'status'>) => void;
    onCancelMessage: (id: string) => void;
}> = ({ beneficiaries, workshops, scheduledMessages, onScheduleMessage, onSendMessageNow, onCancelMessage }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [recipientType, setRecipientType] = useState<'all' | 'workshop'>('all');
    const [selectedWorkshops, setSelectedWorkshops] = useState<string[]>([]);
    
    const now = new Date();
    const defaultDate = now.toLocaleDateString('sv-SE');
    const defaultTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const [scheduleDate, setScheduleDate] = useState(defaultDate);
    const [scheduleTime, setScheduleTime] = useState(defaultTime);

    const handleWorkshopSelection = (workshopId: string) => {
        setSelectedWorkshops(prev => 
            prev.includes(workshopId) 
                ? prev.filter(id => id !== workshopId) 
                : [...prev, workshopId]
        );
    };

    const handleSubmit = (isNow: boolean) => {
        if (!title || !content) {
            alert('Por favor, preencha o título e o conteúdo da mensagem.');
            return;
        }
        if (recipientType === 'workshop' && selectedWorkshops.length === 0) {
            alert('Por favor, selecione pelo menos uma oficina para enviar a mensagem.');
            return;
        }

        const scheduledAt = isNow ? new Date().toISOString() : new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
        const messageData = {
            title,
            content,
            recipients: {
                type: recipientType,
                ids: recipientType === 'workshop' ? selectedWorkshops : [],
            },
            scheduledAt,
        };

        if (isNow) {
            onSendMessageNow(messageData);
        } else {
            onScheduleMessage(messageData);
        }
        
        // Reset form
        setTitle('');
        setContent('');
        setRecipientType('all');
        setSelectedWorkshops([]);
        setScheduleDate(defaultDate);
        setScheduleTime(defaultTime);
    };

    const getRecipientDescription = (message: ScheduledMessage): string => {
        if (message.recipients.type === 'all') {
            return 'Todos os Beneficiários';
        }
        if (message.recipients.type === 'workshop') {
            const workshopNames = message.recipients.ids.map(id => workshops.find(w => w.id === id)?.name || id).join(', ');
            return `Oficinas: ${workshopNames}`;
        }
        return 'N/A';
    };

    const statusStyles: Record<MessageStatus, string> = {
        Agendado: 'bg-yellow-100 text-yellow-800',
        Enviando: 'bg-blue-100 text-blue-800',
        Enviado: 'bg-green-100 text-green-800',
        Cancelado: 'bg-gray-100 text-gray-800',
        Falhou: 'bg-red-100 text-red-800',
    };
    
    return (
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
            <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Agendar Nova Mensagem</h2>
                <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                    <div>
                        <label htmlFor="msg-title" className="block text-sm font-medium text-gray-700">Título (para referência)</label>
                        <input type="text" id="msg-title" value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full p-2.5 border rounded-md" />
                    </div>
                    <div>
                        <label htmlFor="msg-content" className="block text-sm font-medium text-gray-700">Conteúdo da Mensagem</label>
                        <textarea id="msg-content" value={content} onChange={e => setContent(e.target.value)} rows={5} className="mt-1 w-full p-2.5 border rounded-md"></textarea>
                        <p className="text-xs text-gray-500 mt-1">Use `{'{{nome}}'}` para personalizar com o nome do beneficiário.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Destinatários</label>
                        <div className="mt-2 flex gap-4">
                             <label className="flex items-center"><input type="radio" name="recipient" value="all" checked={recipientType === 'all'} onChange={() => setRecipientType('all')} className="mr-2"/> Todos</label>
                             <label className="flex items-center"><input type="radio" name="recipient" value="workshop" checked={recipientType === 'workshop'} onChange={() => setRecipientType('workshop')} className="mr-2"/> Por Oficina</label>
                        </div>
                    </div>
                    {recipientType === 'workshop' && (
                        <div className="border p-2 rounded-md max-h-40 overflow-y-auto">
                            {workshops.filter(w => w.status === 'Ativo').map(w => (
                                <label key={w.id} className="flex items-center p-1.5 hover:bg-gray-50 rounded">
                                    <input type="checkbox" checked={selectedWorkshops.includes(w.id)} onChange={() => handleWorkshopSelection(w.id)} className="mr-2" />
                                    {w.name} ({w.ageGroup})
                                </label>
                            ))}
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Agendar para</label>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full p-2.5 border rounded-md" />
                            <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-full p-2.5 border rounded-md" />
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        <Button onClick={() => handleSubmit(true)} variant="secondary" className="w-full bg-green-600 text-white hover:bg-green-700">
                            <i className="fab fa-whatsapp mr-2"></i> Enviar Agora
                        </Button>
                        <Button onClick={() => handleSubmit(false)} variant="primary" className="w-full">
                            <i className="far fa-clock mr-2"></i> Agendar Envio
                        </Button>
                    </div>
                </form>
            </div>
             <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Histórico de Envios</h2>
                <div className="space-y-3">
                    {scheduledMessages.length > 0 ? [...scheduledMessages].reverse().map(msg => (
                        <div key={msg.id} className="p-4 border rounded-lg bg-gray-50/50">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-bold text-gray-800">{msg.title}</p>
                                    <p className="text-sm text-gray-500 italic mt-1">"{msg.content.substring(0, 50)}..."</p>
                                </div>
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusStyles[msg.status]}`}>{msg.status}</span>
                            </div>
                            <div className="mt-3 pt-3 border-t text-sm text-gray-600 flex flex-col sm:flex-row justify-between items-start gap-2">
                                <div>
                                    <p><strong>Destinatários:</strong> {getRecipientDescription(msg)}</p>
                                    <p><strong>Agendado para:</strong> {new Date(msg.scheduledAt).toLocaleString('pt-BR')}</p>
                                </div>
                                {msg.status === 'Agendado' && (
                                     <Button onClick={() => onCancelMessage(msg.id)} variant="danger" className="px-3 py-1 text-sm">
                                         <i className="fas fa-times mr-1"></i> Cancelar
                                    </Button>
                                )}
                            </div>
                        </div>
                    )) : <p className="text-gray-500 text-center py-8">Nenhuma mensagem agendada ou enviada ainda.</p>}
                </div>
            </div>
         </div>
    );
};

const FrequencyPrintView: React.FC<{
    workshop: Workshop;
    beneficiariesInWorkshop: Beneficiary[];
    educatorName: string;
    calendarData: { dates: Date[]; monthLabel: string };
    calculateAge: (birthDate: string) => number;
}> = ({ workshop, beneficiariesInWorkshop, educatorName, calendarData, calculateAge }) => {
    return (
        <div className="bg-white">
            <header className="mb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-800">Folha de Frequência</h1>
                <h2 className="text-xl font-semibold text-gray-700 capitalize mt-1">{calendarData.monthLabel}</h2>
            </header>

            <div className="mb-6 p-4 border rounded-lg grid grid-cols-2 gap-4 text-base">
                <div><span className="font-bold">Oficina:</span> {workshop.name} - {workshop.ageGroup}</div>
                <div><span className="font-bold">Educador(a):</span> {educatorName}</div>
                <div><span className="font-bold">Dias:</span> {workshop.days.join(', ')}</div>
                <div><span className="font-bold">Horário:</span> {workshop.time}</div>
            </div>

            <table className="min-w-full border-collapse border border-gray-400 text-sm">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="border border-gray-300 p-2 text-left">Nº / Nome do Participante</th>
                        <th className="border border-gray-300 p-2 text-center">Sexo</th>
                        <th className="border border-gray-300 p-2 text-center">Idade</th>
                        {calendarData.dates.map(date => (
                            <th key={date.toISOString()} className="border border-gray-300 p-1 text-center">
                                {date.getDate()}/{date.getMonth() + 1}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {beneficiariesInWorkshop.map((b, index) => (
                        <tr key={b.id} className="even:bg-gray-50">
                            <td className="border border-gray-300 p-2 font-medium">
                                <div className="flex items-center justify-between">
                                    <span>{index + 1}. {b.name}</span>
                                    {b.workshopIds.length > 1 && (
                                        <span title={`Inscrito em ${b.workshopIds.length} oficinas`} className="text-indigo-600">
                                            <i className="fas fa-layer-group"></i>
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="border border-gray-300 p-2 text-center">{b.gender.charAt(0)}</td>
                            <td className="border border-gray-300 p-2 text-center">
                                {calculateAge(b.birthDate)} anos
                            </td>
                            {calendarData.dates.map(date => (
                                <td key={`${b.id}-${date.toISOString()}`} className="border border-gray-300 p-2 h-10">
                                    {/* Empty cell for manual marking */}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                    <tr>
                        <td colSpan={3} className="border border-gray-300 p-2 text-right">Total Presentes</td>
                        {calendarData.dates.map(date => (
                            <td key={`${date.toISOString()}-total`} className="border border-gray-300 p-2 h-10">
                                {/* Empty cell for manual marking */}
                            </td>
                        ))}
                    </tr>
                </tfoot>
            </table>
            {beneficiariesInWorkshop.length === 0 && (
                <div className="text-center py-10 text-gray-500 border">
                    <p>Nenhum beneficiário inscrito para esta oficina.</p>
                </div>
            )}
        </div>
    );
};

const WorkshopFrequencyModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (workshopId: string, date: string, attendance: Record<string, AttendanceStatus>) => void;
    workshop: Workshop | null;
    beneficiaries: Beneficiary[];
    frequencies: Frequency[];
    calculateAge: (birthDate: string) => number;
    allEducators: Educator[];
    onOpenWorkshopPopover: (beneficiary: Beneficiary, target: HTMLElement, currentWorkshopId?: string) => void;
}> = ({ isOpen, onClose, onSave, workshop, beneficiaries, frequencies, calculateAge, allEducators, onOpenWorkshopPopover }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [attendanceChanges, setAttendanceChanges] = useState<Record<string, Record<string, AttendanceStatus>>>({});

    const beneficiariesInWorkshop = useMemo(() => {
        if (!workshop) return [];
        return beneficiaries
            .filter(b => b.workshopIds.includes(workshop.id))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [beneficiaries, workshop]);

    const initialFrequenciesMap = useMemo(() => {
        const map: Record<string, Record<string, AttendanceStatus>> = {};
        frequencies
            .filter(f => f.workshopId === workshop?.id)
            .forEach(f => {
                map[f.date] = f.attendance;
            });
        return map;
    }, [frequencies, workshop]);

    useEffect(() => {
        // Reset changes when modal opens or workshop changes
        if (isOpen) {
            setAttendanceChanges({});
            setCurrentMonth(new Date());
        }
    }, [isOpen, workshop]);

    const handleStatusChange = (beneficiaryId: string, date: string) => {
        const initialStatus = initialFrequenciesMap[date]?.[beneficiaryId];
        const currentStatus = attendanceChanges[date]?.[beneficiaryId] ?? initialStatus;

        let nextStatus: AttendanceStatus;
        if (currentStatus === 'present') nextStatus = 'justified';
        else if (currentStatus === 'justified') nextStatus = 'absent';
        else nextStatus = 'present'; // From 'absent' or undefined

        setAttendanceChanges(prev => ({
            ...prev,
            [date]: {
                // FIX: Corrected a spread operator error by providing a fallback empty object to prevent the error "Spread types may only be created from object types".
                ...(prev[date] || {}),
                [beneficiaryId]: nextStatus,
            },
        }));
    };
    
    const handleSave = () => {
        if (!workshop) return;
        Object.entries(attendanceChanges).forEach(([date, attendanceRecord]) => {
            const finalAttendance = { ...(initialFrequenciesMap[date] || {}), ...attendanceRecord };
            onSave(workshop.id, date, finalAttendance);
        });
        onClose();
    };

    const calendarData = useMemo(() => {
        if (!workshop) return { dates: [], monthLabel: '' };
        
        const dayMap: Record<string, number> = { 'Segunda': 1, 'Terça': 2, 'Quarta': 3, 'Quinta': 4, 'Sexta': 5, 'Sábado': 6 };
        const workshopDays = workshop.days.map(d => dayMap[d]).filter(d => d !== undefined);
        
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const dates: Date[] = [];
        const dateIterator = new Date(year, month, 1);
        
        while (dateIterator.getMonth() === month) {
            if (workshopDays.includes(dateIterator.getDay())) {
                dates.push(new Date(dateIterator));
            }
            dateIterator.setDate(dateIterator.getDate() + 1);
        }
        
        const monthLabel = new Date(year, month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return { dates, monthLabel };
    }, [workshop, currentMonth]);
    
    const dailyTotals = useMemo(() => {
        const totals = new Map<string, number>();
        if (!workshop) return totals;

        calendarData.dates.forEach(date => {
            const dateString = date.toISOString().split('T')[0];
            let presentCount = 0;

            beneficiariesInWorkshop.forEach(b => {
                const initialStatus = initialFrequenciesMap[dateString]?.[b.id];
                const currentStatus = attendanceChanges[dateString]?.[b.id] ?? initialStatus;
                
                if (currentStatus === 'present') {
                    presentCount++;
                }
            });
            totals.set(dateString, presentCount);
        });
        return totals;
    }, [calendarData.dates, beneficiariesInWorkshop, initialFrequenciesMap, attendanceChanges, workshop]);


    const getStatusStyles = (status: AttendanceStatus | undefined) => {
        switch (status) {
            case 'present': return { bg: 'bg-green-500', text: 'text-white', label: 'P' };
            case 'justified': return { bg: 'bg-yellow-400', text: 'text-white', label: 'J' };
            case 'absent': return { bg: 'bg-red-500', text: 'text-white', label: 'F' };
            default: return { bg: 'bg-gray-200', text: 'text-gray-600', label: 'F' };
        }
    };

    const handlePrint = () => {
        if (!workshop) return;

        const educatorName = allEducators.find(e => e.id === workshop.educatorId)?.name || 'N/A';

        const printContent = ReactDOMServer.renderToString(
            <FrequencyPrintView
                workshop={workshop}
                beneficiariesInWorkshop={beneficiariesInWorkshop}
                educatorName={educatorName}
                calendarData={calendarData}
                calculateAge={calculateAge}
            />
        );

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Imprimir Frequência - ${workshop.name}</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
                        <style>
                            @media print {
                                body {
                                    -webkit-print-color-adjust: exact;
                                    print-color-adjust: exact;
                                }
                            }
                        </style>
                    </head>
                    <body class="p-4">${printContent}</body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
        }
    };

    if (!workshop) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Frequência - ${workshop.name}`} size="full">
            <div className="p-4 sm:p-6">
                <div className="flex justify-between items-center mb-4 bg-gray-50 p-3 rounded-lg">
                    <Button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} variant="ghost">
                        <i className="fas fa-chevron-left mr-2"></i> Mês Anterior
                    </Button>
                    <h3 className="text-lg font-bold text-gray-800 capitalize">{calendarData.monthLabel}</h3>
                    <Button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} variant="ghost">
                        Mês Seguinte <i className="fas fa-chevron-right ml-2"></i>
                    </Button>
                </div>

                <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0 z-20">
                            <tr>
                                <th scope="col" rowSpan={2} className="px-4 py-3 min-w-[250px] sticky left-0 bg-gray-100 z-10 border-b border-gray-300 align-bottom">Nº / Participante</th>
                                <th scope="col" rowSpan={2} className="px-4 py-3 text-center border-b border-gray-300 align-bottom">Sexo</th>
                                {calendarData.dates.map(date => (
                                    <th key={date.toISOString()} scope="col" className="px-2 py-3 text-center">
                                        {date.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)}<br/>
                                        {date.getDate()}
                                    </th>
                                ))}
                            </tr>
                            <tr>
                                {calendarData.dates.map(date => {
                                    const dateString = date.toISOString().split('T')[0];
                                    const total = dailyTotals.get(dateString) || 0;
                                    return (
                                        <th key={`${date.toISOString()}-total`} scope="col" className="px-2 py-2 text-center bg-gray-200 text-indigo-700 font-bold text-base">
                                            {total}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {beneficiariesInWorkshop.map((b, index) => (
                                <tr key={b.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white hover:bg-gray-50 z-10">
                                        <div className="flex items-center gap-2">
                                            <span>{index + 1}. {b.name}</span>
                                            {b.workshopIds.length > 1 && (
                                                <button
                                                    onClick={(e) => onOpenWorkshopPopover(b, e.currentTarget, workshop.id)}
                                                    title={`Participa de ${b.workshopIds.length} oficinas. Clique para ver.`}
                                                    className="text-indigo-600 hover:text-indigo-800 transition-colors px-2 py-1 rounded-full hover:bg-indigo-100 text-xs font-bold border border-indigo-200 bg-indigo-50"
                                                >
                                                    <i className="fas fa-layer-group mr-1"></i>
                                                    {b.workshopIds.length}
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            {calculateAge(b.birthDate)} anos
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`font-semibold px-2 py-1 rounded-full text-xs ${b.gender === 'Masculino' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'}`}>
                                            {b.gender.charAt(0)}
                                        </span>
                                    </td>
                                    {calendarData.dates.map(date => {
                                        const dateString = date.toISOString().split('T')[0];
                                        const initialStatus = initialFrequenciesMap[dateString]?.[b.id];
                                        const currentStatus = attendanceChanges[dateString]?.[b.id] ?? initialStatus;
                                        const { bg, text, label } = getStatusStyles(currentStatus);

                                        return (
                                            <td key={dateString} className="px-2 py-3 text-center">
                                                <button 
                                                    onClick={() => handleStatusChange(b.id, dateString)}
                                                    className={`w-8 h-8 rounded-full font-bold text-base flex items-center justify-center transition-transform hover:scale-110 ${bg} ${text}`}
                                                    aria-label={`Marcar presença para ${b.name} em ${date.toLocaleDateString()}`}
                                                >
                                                    {label}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                     {beneficiariesInWorkshop.length === 0 && (
                        <div className="text-center py-10 text-gray-500">
                            <p>Nenhum beneficiário inscrito nesta oficina.</p>
                        </div>
                     )}
                </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-between items-center mt-auto border-t">
                <div>
                     <Button onClick={handlePrint} variant="secondary">
                        <i className="fas fa-print mr-2"></i> Imprimir Folha de Frequência
                    </Button>
                </div>
                <div className="flex gap-3">
                    <Button onClick={onClose} variant="ghost">Cancelar</Button>
                    <Button onClick={handleSave}>Salvar Alterações</Button>
                </div>
            </div>
        </Modal>
    );
};


const TransferBeneficiaryModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (beneficiaryId: string, newWorkshopIds: string[]) => void;
    beneficiary: Beneficiary | null;
    allWorkshops: Workshop[];
    allEducators: Educator[];
}> = ({ isOpen, onClose, onSave, beneficiary, allWorkshops, allEducators }) => {
    const [selectedWorkshopIds, setSelectedWorkshopIds] = useState<string[]>([]);
    const [workshopSearch, setWorkshopSearch] = useState('');
    const [conflicts, setConflicts] = useState<Workshop[][]>([]);

    useEffect(() => {
        if (beneficiary) {
            setSelectedWorkshopIds(beneficiary.workshopIds);
        }
        setWorkshopSearch('');
        setConflicts([]);
    }, [beneficiary, isOpen]);

    useEffect(() => {
        const selectedWorkshops = allWorkshops.filter(w => selectedWorkshopIds.includes(w.id));
        const detectedConflicts = findConflictingWorkshops(selectedWorkshops);
        setConflicts(detectedConflicts);
    }, [selectedWorkshopIds, allWorkshops]);

    const handleWorkshopChange = (workshopId: string) => {
        setSelectedWorkshopIds(prev => {
            const newWorkshopIds = prev.includes(workshopId)
                ? prev.filter(id => id !== workshopId)
                : [...prev, workshopId];
            return newWorkshopIds;
        });
    };

    const handleSubmit = () => {
        if (beneficiary) {
            onSave(beneficiary.id, selectedWorkshopIds);
            onClose();
        }
    };

    const getEducatorName = useCallback((id: string) => allEducators.find(e => e.id === id)?.name || 'N/A', [allEducators]);

    const filteredWorkshops = useMemo(() => {
        const activeWorkshops = allWorkshops.filter(w => w.status === 'Ativo');
        if (!workshopSearch.trim()) {
            return activeWorkshops;
        }
        const normalizedSearch = normalizeText(workshopSearch);
        return activeWorkshops.filter(workshop => {
            const educatorName = getEducatorName(workshop.educatorId);
            return (
                normalizeText(workshop.name).includes(normalizedSearch) ||
                normalizeText(workshop.ageGroup).includes(normalizedSearch) ||
                normalizeText(educatorName).includes(normalizedSearch)
            );
        });
    }, [allWorkshops, workshopSearch, getEducatorName]);

    if (!beneficiary) return null;
    
    const conflictingWorkshopIds = new Set(conflicts.flat().map(w => w.id));

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Gerenciar Oficinas de ${beneficiary.name}`}>
            <div className="p-6 space-y-4">
                 <div>
                    <h4 className="text-base font-medium text-gray-700 mb-2">Selecione as oficinas</h4>
                    {conflicts.length > 0 && (
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 my-2 rounded-r-lg">
                             <div className="flex">
                                <div className="flex-shrink-0">
                                     <i className="fas fa-exclamation-triangle text-yellow-500 text-xl"></i>
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm font-bold text-yellow-800">Aviso de Conflito de Horário</p>
                                    <div className="mt-2 text-sm text-yellow-700">
                                        {conflicts.map((pair, index) => (
                                            <p key={index}>- "{pair[0].name}" e "{pair[1].name}" possuem horários conflitantes.</p>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <input
                       type="text"
                       placeholder="Buscar oficina por nome, faixa etária ou educador..."
                       value={workshopSearch}
                       onChange={(e) => setWorkshopSearch(e.target.value)}
                       className="w-full p-2.5 border border-gray-300 rounded-md mb-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto p-2 bg-gray-50 rounded-md border">
                       {filteredWorkshops.length > 0 ? (
                           filteredWorkshops.map(workshop => {
                               const educatorName = getEducatorName(workshop.educatorId);
                               const colorClasses = WORKSHOP_COLOR_MAP[workshop.color] || WORKSHOP_COLOR_MAP.gray;
                               const isConflicting = conflictingWorkshopIds.has(workshop.id);
                               
                               return (
                               <div key={workshop.id} className={`p-3 rounded-lg border flex items-start gap-3 transition-all ${selectedWorkshopIds.includes(workshop.id) ? `${colorClasses.bg} ${colorClasses.border}` : 'bg-white'} ${isConflicting ? 'ring-2 ring-red-500' : ''}`}>
                                   <input
                                       id={`transfer-workshop-${workshop.id}`}
                                       type="checkbox"
                                       checked={selectedWorkshopIds.includes(workshop.id)}
                                       onChange={() => handleWorkshopChange(workshop.id)}
                                       className="h-5 w-5 mt-1 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 shrink-0"
                                   />
                                   <label htmlFor={`transfer-workshop-${workshop.id}`} className="flex-1 cursor-pointer">
                                       <p className={`font-bold ${colorClasses.text}`}>{workshop.name} - {workshop.ageGroup}</p>
                                       <div className="mt-1 space-y-0.5">
                                          <p className="text-sm text-gray-600 flex items-center"><i className="far fa-calendar-alt mr-2 w-4 text-center text-gray-400"></i>{workshop.days.join(', ')}</p>
                                          <p className="text-sm text-gray-600 flex items-center"><i className="far fa-clock mr-2 w-4 text-center text-gray-400"></i>{workshop.time}</p>
                                          <p className="text-sm text-gray-600 flex items-center"><i className="fas fa-person-chalkboard mr-2 w-4 text-center text-gray-400"></i>{educatorName}</p>
                                       </div>
                                   </label>
                               </div>
                               )
                           })
                       ) : (
                           <div className="col-span-1 md:col-span-2 text-center text-gray-500 py-4">
                               Nenhuma oficina encontrada.
                           </div>
                       )}
                    </div>
                </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                <Button onClick={onClose} variant="ghost">Cancelar</Button>
                <Button onClick={handleSubmit}>Salvar Alterações</Button>
            </div>
        </Modal>
    );
};

const EnrolledBeneficiariesModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    workshop: Workshop | null;
    beneficiaries: Beneficiary[];
    calculateAge: (birthDate: string) => number;
}> = ({ isOpen, onClose, workshop, beneficiaries, calculateAge }) => {
    if (!workshop) return null;

    const enrolledBeneficiaries = useMemo(() => {
        return beneficiaries
            .filter(b => b.workshopIds.includes(workshop.id))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [beneficiaries, workshop]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Inscritos na Oficina: ${workshop.name}`} size="lg">
            <div className="p-6">
                {enrolledBeneficiaries.length > 0 ? (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Nome
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Idade
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Matrícula
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {enrolledBeneficiaries.map(b => (
                                <tr key={b.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{b.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{calculateAge(b.birthDate)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{b.registration}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="text-center text-gray-500 py-4">Nenhum beneficiário inscrito nesta oficina.</p>
                )}
            </div>
             <div className="bg-gray-50 px-6 py-4 flex justify-end">
                <Button onClick={onClose} variant="ghost">Fechar</Button>
            </div>
        </Modal>
    );
};

const EnrollBeneficiaryModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (workshopId: string, beneficiaryIdsToAdd: string[]) => void;
    workshop: Workshop | null;
    allBeneficiaries: Beneficiary[];
    calculateAge: (birthDate: string) => number;
}> = ({ isOpen, onClose, onSave, workshop, allBeneficiaries, calculateAge }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            setSelectedIds([]);
            setSearchTerm('');
        }
    }, [isOpen]);

    const availableBeneficiaries = useMemo(() => {
        if (!workshop) return [];
        const normalizedSearch = normalizeText(searchTerm);

        return allBeneficiaries
            .filter(b => !b.workshopIds.includes(workshop.id))
            .filter(b => {
                if (!searchTerm) return true;
                return normalizeText(b.name).includes(normalizedSearch) || b.registration.includes(normalizedSearch);
            });
    }, [workshop, allBeneficiaries, searchTerm]);

    const handleSelectBeneficiary = (beneficiaryId: string) => {
        setSelectedIds(prev =>
            prev.includes(beneficiaryId)
                ? prev.filter(id => id !== beneficiaryId)
                : [...prev, beneficiaryId]
        );
    };
    
    const handleSelectAll = () => {
        if(selectedIds.length === availableBeneficiaries.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(availableBeneficiaries.map(b => b.id));
        }
    }

    const handleSubmit = () => {
        if (workshop && selectedIds.length > 0) {
            onSave(workshop.id, selectedIds);
        }
        onClose();
    };

    if (!workshop) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Adicionar Participantes em: ${workshop.name}`} size="lg">
            <div className="p-6 space-y-4">
                <input
                    type="text"
                    placeholder="Buscar por nome ou matrícula..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
                <div className="border rounded-lg max-h-96 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="p-3 w-10">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                        checked={availableBeneficiaries.length > 0 && selectedIds.length === availableBeneficiaries.length}
                                        onChange={handleSelectAll}
                                        aria-label="Selecionar todos"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Idade</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matrícula</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {availableBeneficiaries.map(b => (
                                <tr key={b.id} className="hover:bg-gray-50">
                                    <td className="p-3">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                            checked={selectedIds.includes(b.id)}
                                            onChange={() => handleSelectBeneficiary(b.id)}
                                            aria-label={`Selecionar ${b.name}`}
                                        />
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{b.name}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{calculateAge(b.birthDate)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{b.registration}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {availableBeneficiaries.length === 0 && (
                        <div className="text-center py-6 text-gray-500">
                            Nenhum participante disponível para inscrição.
                        </div>
                    )}
                </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">{selectedIds.length} selecionado(s)</span>
                <div className="flex gap-3">
                    <Button onClick={onClose} variant="ghost">Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={selectedIds.length === 0}>Adicionar Selecionados</Button>
                </div>
            </div>
        </Modal>
    );
};

// --- Badge Component ---
const BeneficiaryBadge: React.FC<{
    beneficiary: Beneficiary;
    workshops: Workshop[];
}> = ({ beneficiary, workshops }) => {
    // A simplified way to get a single color for the badge theme
    const primaryWorkshopColor = workshops[0]?.color || 'indigo';
    const colorClasses = WORKSHOP_COLOR_MAP[primaryWorkshopColor] || WORKSHOP_COLOR_MAP.gray;

    return (
        <div className="badge-container w-[350px] h-[220px] bg-white rounded-xl shadow-lg border-2 border-gray-200 flex flex-col p-3 font-sans">
            {/* Header */}
            <div className={`flex items-center justify-between pb-2 border-b-2 ${colorClasses.border}`}>
                <div className="text-left">
                    <h1 className="text-sm font-bold text-gray-800">Complexo Social</h1>
                    <h2 className={`text-lg font-extrabold ${colorClasses.text}`}>Mais Infância</h2>
                </div>
                <div className={`p-2 rounded-md ${colorClasses.bg}`}>
                    <i className={`fas fa-child-reaching text-2xl ${colorClasses.text}`}></i>
                </div>
            </div>

            {/* Body */}
            <div className="flex flex-1 mt-3">
                <div className="w-24 h-24 flex-shrink-0 bg-gray-200 rounded-md flex items-center justify-center border border-gray-300">
                    <i className="fas fa-user text-5xl text-gray-400"></i>
                </div>
                <div className="ml-3 flex flex-col justify-center">
                    <p className="text-base font-bold leading-tight text-gray-900">{beneficiary.name}</p>
                    <p className="text-xs text-gray-600 mt-1">
                        <strong>Matrícula:</strong> {beneficiary.registration}
                    </p>
                    <p className="text-xs text-gray-600">
                         <strong>Nascimento:</strong> {new Date(`${beneficiary.birthDate}T00:00:00`).toLocaleDateString('pt-BR')}
                    </p>
                    <p className="text-xs text-gray-600">
                        <strong>Telefone:</strong> {beneficiary.phone}
                    </p>
                </div>
            </div>

            {/* Footer / Workshops */}
            <div className="mt-auto pt-2 border-t border-gray-200">
                 <p className="text-xs font-semibold text-gray-700 mb-1">Oficinas Inscritas:</p>
                 <div className="flex flex-wrap gap-1">
                    {workshops.slice(0, 3).map(w => {
                        const workshopColor = WORKSHOP_COLOR_MAP[w.color] || WORKSHOP_COLOR_MAP.gray;
                        return (
                             <span key={w.id} className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${workshopColor.bg} ${workshopColor.text}`}>
                                {w.name}
                             </span>
                        );
                    })}
                     {workshops.length > 3 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-gray-200 text-gray-700">
                            +{workshops.length - 3}
                        </span>
                    )}
                 </div>
            </div>
        </div>
    );
};

const AllBadgesPrintView: React.FC<{
    beneficiaries: Beneficiary[];
    allWorkshops: Workshop[];
}> = ({ beneficiaries, allWorkshops }) => {
    return (
        <div className="grid grid-cols-2 gap-4 p-4">
            {beneficiaries.map(beneficiary => {
                const enrolledWorkshops = allWorkshops.filter(w => beneficiary.workshopIds.includes(w.id));
                return (
                    <div key={beneficiary.id} className="badge-wrapper">
                        <BeneficiaryBadge beneficiary={beneficiary} workshops={enrolledWorkshops} />
                    </div>
                );
            })}
        </div>
    );
};

const WorkshopLabelPrintView: React.FC<{
    workshop: Workshop;
    educatorName: string;
    enrolledCount: number;
}> = ({ workshop, educatorName, enrolledCount }) => {
    const colorClasses = WORKSHOP_COLOR_MAP[workshop.color] || WORKSHOP_COLOR_MAP.gray;

    return (
        <div className="w-[450px] bg-white rounded-xl shadow-lg border-2 p-4 font-sans flex flex-col" style={{ fontFamily: 'sans-serif' }}>
            {/* Header */}
            <div className={`flex items-center justify-between pb-2 border-b-2 ${colorClasses.border}`}>
                <div>
                    <h1 className="text-sm font-bold text-gray-800">Etiqueta de Identificação de Turma</h1>
                    <h2 className={`text-2xl font-extrabold ${colorClasses.text}`}>{workshop.name}</h2>
                </div>
                 <div className={`p-2 rounded-md ${colorClasses.bg}`}>
                    <i className={`fas fa-person-chalkboard text-3xl ${colorClasses.text}`}></i>
                </div>
            </div>
            {/* Body */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-base">
                <div className="flex items-start col-span-2">
                    <i className="fas fa-user-tie mr-3 text-gray-400 w-5 text-center mt-1"></i>
                    <div>
                        <p className="text-sm text-gray-500">Educador(a) Responsável</p>
                        <p className="font-semibold text-gray-800">{educatorName}</p>
                    </div>
                </div>

                <div className="flex items-start">
                    <i className="fas fa-users mr-3 text-gray-400 w-5 text-center mt-1"></i>
                    <div>
                        <p className="text-sm text-gray-500">Faixa Etária</p>
                        <p className="font-semibold text-gray-800">{workshop.ageGroup}</p>
                    </div>
                </div>

                <div className="flex items-start">
                    <i className="fas fa-users-cog mr-3 text-gray-400 w-5 text-center mt-1"></i>
                    <div>
                        <p className="text-sm text-gray-500">Vagas</p>
                        <p className="font-semibold text-gray-800">{enrolledCount} / {workshop.maxCapacity}</p>
                    </div>
                </div>
                
                <div className="flex items-start">
                    <i className="far fa-calendar-alt mr-3 text-gray-400 w-5 text-center mt-1"></i>
                    <div>
                        <p className="text-sm text-gray-500">Dias da Semana</p>
                        <p className="font-semibold text-gray-800">{workshop.days.join(', ')}</p>
                    </div>
                </div>
                
                <div className="flex items-start">
                    <i className="far fa-clock mr-3 text-gray-400 w-5 text-center mt-1"></i>
                    <div>
                        <p className="text-sm text-gray-500">Horário</p>
                        <p className="font-semibold text-gray-800">{workshop.time}</p>
                    </div>
                </div>
            </div>
            
             {/* Footer */}
            <div className="mt-auto pt-3 border-t border-gray-200 flex justify-between items-center text-sm">
                 <span className={`px-3 py-1 font-semibold rounded-full ${workshop.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    Status: {workshop.status}
                </span>
                <div className="text-right text-xs text-gray-500">
                    <p>Complexo Social Mais Infância</p>
                    <p>Gerado em: {new Date().toLocaleDateString('pt-BR')}</p>
                </div>
            </div>
        </div>
    );
};

const WorkshopsListPrintView: React.FC<{
    workshops: Workshop[];
    getEducatorName: (id: string) => string;
    beneficiaries: Beneficiary[];
}> = ({ workshops, getEducatorName, beneficiaries }) => {
    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4 text-center">Lista de Oficinas</h1>
            <p className="text-center text-sm text-gray-600 mb-6">Gerado em: {new Date().toLocaleDateString('pt-BR')}</p>
            <table className="min-w-full border-collapse border border-gray-400 text-sm">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="border border-gray-300 p-2 text-left">Oficina / Faixa Etária</th>
                        <th className="border border-gray-300 p-2 text-left">Educador(a)</th>
                        <th className="border border-gray-300 p-2 text-left">Dias e Horário</th>
                        <th className="border border-gray-300 p-2 text-center">Ocupação (Inscritos/Vagas)</th>
                    </tr>
                </thead>
                <tbody>
                    {workshops.map(w => {
                        const enrolledCount = beneficiaries.filter(b => b.workshopIds.includes(w.id)).length;
                        return (
                            <tr key={w.id} className="even:bg-gray-50">
                                <td className="border border-gray-300 p-2 font-medium">
                                    {w.name}
                                    <p className="text-xs text-gray-600">{w.ageGroup}</p>
                                </td>
                                <td className="border border-gray-300 p-2">{getEducatorName(w.educatorId)}</td>
                                <td className="border border-gray-300 p-2">
                                    {w.days.join(', ')}
                                    <p className="text-xs text-gray-600">{w.time}</p>
                                </td>
                                <td className="border border-gray-300 p-2 text-center">{enrolledCount} / {w.maxCapacity}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {workshops.length === 0 && (
                <div className="text-center py-10 text-gray-500 border">
                    <p>Nenhuma oficina para exibir nesta lista.</p>
                </div>
            )}
        </div>
    );
};

const BeneficiaryListPrintView: React.FC<{
    beneficiaries: Beneficiary[];
    allWorkshops: Workshop[];
    calculateAge: (birthDate: string) => number;
}> = ({ beneficiaries, allWorkshops, calculateAge }) => {
    const getWorkshopNames = (workshopIds: string[]) => {
        return workshopIds
            .map(id => allWorkshops.find(w => w.id === id)?.name)
            .filter(Boolean)
            .join(', ');
    };

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4 text-center">Lista de Beneficiários</h1>
            <p className="text-center text-sm text-gray-600 mb-6">Gerado em: {new Date().toLocaleDateString('pt-BR')}</p>
            <table className="min-w-full border-collapse border border-gray-400 text-sm">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="border border-gray-300 p-2 text-left">Matrícula</th>
                        <th className="border border-gray-300 p-2 text-left">Nome Completo</th>
                        <th className="border border-gray-300 p-2 text-center">Idade</th>
                        <th className="border border-gray-300 p-2 text-left">Telefone</th>
                        <th className="border border-gray-300 p-2 text-left">Oficinas Inscritas</th>
                    </tr>
                </thead>
                <tbody>
                    {beneficiaries.map(b => (
                        <tr key={b.id} className="even:bg-gray-50">
                            <td className="border border-gray-300 p-2">{b.registration}</td>
                            <td className="border border-gray-300 p-2 font-medium">{b.name}</td>
                            <td className="border border-gray-300 p-2 text-center">{calculateAge(b.birthDate)}</td>
                            <td className="border border-gray-300 p-2">{b.phone}</td>
                            <td className="border border-gray-300 p-2">{getWorkshopNames(b.workshopIds) || 'Nenhuma'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {beneficiaries.length === 0 && (
                <div className="text-center py-10 text-gray-500 border">
                    <p>Nenhum beneficiário para exibir nesta lista.</p>
                </div>
            )}
        </div>
    );
};

// --- MAIN APP COMPONENT ---

const AppContent = () => {
    const [activeTab, setActiveTab] = useLocalStorage<Tab>('activeTab', 'painel');
    const [beneficiaries, setBeneficiaries] = useLocalStorage<Beneficiary[]>('beneficiaries', initialBeneficiaries);
    const [educators, setEducators] = useLocalStorage<Educator[]>('educators', initialEducators);
    const [workshops, setWorkshops] = useLocalStorage<Workshop[]>('workshops', initialWorkshops);
    const [frequencies, setFrequencies] = useLocalStorage<Frequency[]>('frequencies', initialFrequencies);
    const [lastSyncDate, setLastSyncDate] = useLocalStorage<string | null>('lastSyncDate', null);
    const [scheduledMessages, setScheduledMessages] = useLocalStorage<ScheduledMessage[]>('scheduledMessages', []);
    
    // Clock state
    const [currentTime, setCurrentTime] = useState(new Date());

    // Modal states
    const [isBeneficiaryModalOpen, setIsBeneficiaryModalOpen] = useState(false);
    const [beneficiaryToEdit, setBeneficiaryToEdit] = useState<Beneficiary | null>(null);
    const [isEducatorModalOpen, setIsEducatorModalOpen] = useState(false);
    const [educatorToEdit, setEducatorToEdit] = useState<Educator | null>(null);
    const [isWorkshopModalOpen, setIsWorkshopModalOpen] = useState(false);
    const [workshopToEdit, setWorkshopToEdit] = useState<Workshop | null>(null);
    const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
    const [confirmationModalProps, setConfirmationModalProps] = useState({ title: '', message: '', onConfirm: () => {} });
    const [workshopForFrequency, setWorkshopForFrequency] = useState<Workshop | null>(null);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [beneficiaryToTransfer, setBeneficiaryToTransfer] = useState<Beneficiary | null>(null);
    const [educatorForWorkload, setEducatorForWorkload] = useState<Educator | null>(null);
    const [workshopForEnrolledList, setWorkshopForEnrolledList] = useState<Workshop | null>(null);
    const [workshopToEnroll, setWorkshopToEnroll] = useState<Workshop | null>(null);
    const [workshopForDetails, setWorkshopForDetails] = useState<Workshop | null>(null);
    const [popoverState, setPopoverState] = useState<{ beneficiary: Beneficiary | null, target: HTMLElement | null, currentWorkshopId?: string }>({ beneficiary: null, target: null });
    const [messageToSend, setMessageToSend] = useState<ScheduledMessage | null>(null);
    const [messageRecipients, setMessageRecipients] = useState<Beneficiary[]>([]);

    const { addToast } = useToasts();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [restoreFileType, setRestoreFileType] = useState<'beneficiaries' | 'educators' | 'workshops' | 'full'>('beneficiaries');

    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    const calculateAge = useCallback((birthDate: string): number => {
        if (!birthDate) return 0;
        try {
            // Use local date parsing to avoid timezone issues with YYYY-MM-DD
            const [year, month, day] = birthDate.split('-').map(Number);
            const today = new Date();
            const birth = new Date(today.getFullYear(), month - 1, day);
            let age = today.getFullYear() - year;
            if (today < birth) {
                age--;
            }
            return age;
        } catch (e) {
            console.error("Error calculating age for:", birthDate, e);
            return 0;
        }
    }, []);

    // --- CRUD Handlers ---

    const handleSaveBeneficiary = (beneficiary: Beneficiary): boolean => {
        // Check for duplicate CPF, ignoring the beneficiary being edited
        const duplicate = beneficiaries.find(b => b.cpf === beneficiary.cpf && b.id !== beneficiary.id);
        if (duplicate) {
            addToast({ type: 'error', title: 'Erro de Validação', message: `O CPF ${beneficiary.cpf} já está cadastrado para ${duplicate.name}.` });
            return false;
        }

        if (beneficiaryToEdit) {
            setBeneficiaries(prev => prev.map(b => b.id === beneficiary.id ? beneficiary : b));
            addToast({ type: 'success', title: 'Sucesso', message: 'Beneficiário atualizado com sucesso.' });
        } else {
            setBeneficiaries(prev => [...prev, beneficiary]);
            addToast({ type: 'success', title: 'Sucesso', message: 'Beneficiário adicionado com sucesso.' });
        }
        return true;
    };

    const handleDeleteBeneficiary = (id: string) => {
        setBeneficiaries(prev => prev.filter(b => b.id !== id));
        addToast({ type: 'info', title: 'Beneficiário Removido', message: 'O beneficiário foi excluído.' });
    };

    const handleSaveEducator = (educator: Educator) => {
        if (educatorToEdit) {
            setEducators(prev => prev.map(e => e.id === educator.id ? educator : e));
            addToast({ type: 'success', title: 'Sucesso', message: 'Educador atualizado com sucesso.' });
        } else {
            setEducators(prev => [...prev, educator]);
            addToast({ type: 'success', title: 'Sucesso', message: 'Educador adicionado com sucesso.' });
        }
    };

    const handleDeleteEducator = (id: string) => {
        setEducators(prev => prev.filter(e => e.id !== id));
        // Also remove from any workshops
        setWorkshops(prev => prev.map(w => w.educatorId === id ? { ...w, educatorId: '' } : w));
        addToast({ type: 'info', title: 'Educador Removido', message: 'O educador foi excluído.' });
    };

    const handleSaveWorkshop = (workshop: Workshop) => {
        if (workshopToEdit) {
            setWorkshops(prev => prev.map(w => w.id === workshop.id ? workshop : w));
            addToast({ type: 'success', title: 'Sucesso', message: 'Oficina atualizada com sucesso.' });
        } else {
            setWorkshops(prev => [...prev, workshop]);
            addToast({ type: 'success', title: 'Sucesso', message: 'Oficina adicionada com sucesso.' });
        }
    };

    const handleDeleteWorkshop = (id: string) => {
        setWorkshops(prev => prev.filter(w => w.id !== id));
        // Also remove from any beneficiaries
        setBeneficiaries(prev => prev.map(b => ({
            ...b,
            workshopIds: b.workshopIds.filter(wid => wid !== id)
        })));
        addToast({ type: 'info', title: 'Oficina Removida', message: 'A oficina foi excluída.' });
    };
    
    const handleSaveFrequency = (workshopId: string, date: string, attendance: Record<string, AttendanceStatus>) => {
        setFrequencies(prev => {
            const index = prev.findIndex(f => f.workshopId === workshopId && f.date === date);
            if (index > -1) {
                const newFrequencies = [...prev];
                newFrequencies[index] = { workshopId, date, attendance };
                return newFrequencies;
            } else {
                return [...prev, { workshopId, date, attendance }];
            }
        });
        addToast({ type: 'success', title: 'Frequência Salva', message: `Frequência para ${new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')} foi salva.` });
    };
    
    const handleTransferBeneficiary = (beneficiaryId: string, newWorkshopIds: string[]) => {
        setBeneficiaries(prev => 
            prev.map(b => 
                b.id === beneficiaryId ? { ...b, workshopIds: newWorkshopIds } : b
            )
        );
        addToast({ type: 'success', title: 'Transferência Concluída', message: 'As oficinas do beneficiário foram atualizadas.' });
    };

    const handleEnrollBeneficiaries = (workshopId: string, beneficiaryIdsToAdd: string[]) => {
        setBeneficiaries(prev => 
            prev.map(b => 
                beneficiaryIdsToAdd.includes(b.id)
                    ? { ...b, workshopIds: [...b.workshopIds, workshopId] }
                    : b
            )
        );
        addToast({ type: 'success', title: 'Inscrição Concluída', message: `${beneficiaryIdsToAdd.length} participante(s) adicionado(s) à oficina.` });
    };

    // --- Modal Openers ---

    const openConfirmationModal = (title: string, message: string, onConfirm: () => void) => {
        setConfirmationModalProps({ title, message, onConfirm: () => { onConfirm(); setIsConfirmationModalOpen(false); } });
        setIsConfirmationModalOpen(true);
    };

    const openBeneficiaryModal = (beneficiary: Beneficiary | null = null) => {
        setBeneficiaryToEdit(beneficiary);
        setIsBeneficiaryModalOpen(true);
    };

    const openEducatorModal = (educator: Educator | null = null) => {
        setEducatorToEdit(educator);
        setIsEducatorModalOpen(true);
    };

    const openWorkshopModal = (workshop: Workshop | null = null) => {
        setWorkshopToEdit(workshop);
        setIsWorkshopModalOpen(true);
    };

    const openTransferModal = (beneficiary: Beneficiary) => {
        setBeneficiaryToTransfer(beneficiary);
        setIsTransferModalOpen(true);
    };

    const openWorkloadModal = (educator: Educator) => {
        setEducatorForWorkload(educator);
    };

    const openEnrolledListModal = (workshop: Workshop) => {
        setWorkshopForEnrolledList(workshop);
    };

    const openEnrollModal = (workshop: Workshop) => {
        setWorkshopToEnroll(workshop);
    };

    const openDetailsModal = (workshop: Workshop) => {
        setWorkshopForDetails(workshop);
    };

    const openWorkshopPopover = (beneficiary: Beneficiary, target: HTMLElement, currentWorkshopId?: string) => {
        setPopoverState({ beneficiary, target, currentWorkshopId });
    };

    // --- Import/Export and Backup/Restore ---

    const triggerImport = (fileType: 'beneficiaries' | 'educators' | 'workshops') => {
        setRestoreFileType(fileType);
        fileInputRef.current?.click();
    };

    const triggerRestore = () => {
        setRestoreFileType('full');
        fileInputRef.current?.click();
    };
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            addToast({ type: 'warning', title: 'Nenhum arquivo', message: 'Nenhum arquivo foi selecionado.' });
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                if (restoreFileType === 'full') {
                    handleRestoreBackup(text);
                } else {
                    handleImportCsv(text, restoreFileType);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Formato de arquivo inválido.";
                addToast({ type: 'error', title: 'Erro ao Ler Arquivo', message: errorMessage });
            } finally {
                // Reset file input
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };
        reader.readAsText(file);
    };

    const handleRestoreBackup = (jsonString: string) => {
        try {
            const backupData = JSON.parse(jsonString);

            // Basic validation
            if (backupData.beneficiaries && backupData.educators && backupData.workshops && backupData.frequencies) {
                setBeneficiaries(backupData.beneficiaries);
                setEducators(backupData.educators);
                setWorkshops(backupData.workshops);
                setFrequencies(backupData.frequencies);
                setScheduledMessages(backupData.scheduledMessages || []);
                addToast({ type: 'success', title: 'Backup Restaurado', message: 'Todos os dados foram restaurados com sucesso.' });
            } else {
                throw new Error("O arquivo de backup parece estar corrompido ou em um formato inválido.");
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro ao processar o arquivo JSON.';
            addToast({ type: 'error', title: 'Falha na Restauração', message: errorMessage });
        }
    };
    
    const handleBackup = () => {
        try {
            const allData = {
                beneficiaries,
                educators,
                workshops,
                frequencies,
                scheduledMessages
            };
            const jsonString = JSON.stringify(allData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const date = new Date().toLocaleDateString('sv-SE');
            link.href = url;
            link.download = `backup_complexo_social_${date}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            addToast({ type: 'success', title: 'Backup Concluído', message: 'Arquivo de backup gerado com sucesso.' });
        } catch (error) {
             addToast({ type: 'error', title: 'Falha no Backup', message: 'Não foi possível gerar o arquivo de backup.' });
        }
    };

    const handleImportCsv = (csvText: string, type: 'beneficiaries' | 'educators' | 'workshops') => {
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) {
            addToast({ type: 'error', title: 'Arquivo Vazio', message: 'O arquivo CSV não contém dados.' });
            return;
        }

        const delimiter = detectDelimiter(lines[0]);
        const headers = parseCsvRow(lines[0], delimiter).map(h => h.toLowerCase().trim());
        const rows = lines.slice(1);
        
        let successCount = 0;
        let errorCount = 0;

        try {
            if (type === 'beneficiaries') {
                const newBeneficiaries: Beneficiary[] = [];
                rows.forEach(row => {
                    try {
                        const values = parseCsvRow(row, delimiter);
                        const rowData: Record<string, string> = {};
                        headers.forEach((header, index) => {
                            rowData[header] = values[index];
                        });
                        
                        // Heuristics for header names
                        const name = rowData['nome completo'] || rowData['nome'];
                        const cpf = rowData['cpf'];
                        if (!name || !cpf) { throw new Error("Nome ou CPF ausente."); }

                        const birthDate = parseDate(rowData['data de nascimento']);

                        const newBeneficiary: Beneficiary = {
                            id: `ben${Date.now()}-${Math.random()}`,
                            name,
                            cpf,
                            birthDate,
                            phone: rowData['telefone'] || '',
                            gender: (rowData['gênero']?.toLowerCase() === 'masculino') ? 'Masculino' : 'Feminino',
                            workshopIds: [], // Workshops are not imported via CSV
                            registration: '', // Will be regenerated
                            physicalFileLocation: rowData['localização do arquivo físico'] || ''
                        };
                        newBeneficiaries.push(newBeneficiary);
                    } catch (e) {
                        errorCount++;
                    }
                });

                setBeneficiaries(prev => [...prev, ...newBeneficiaries]);
                successCount = newBeneficiaries.length;
            }
            // Similar logic for educators and workshops can be added here
            
            addToast({
                type: 'info',
                title: 'Importação Concluída',
                message: `${successCount} registros importados com sucesso. ${errorCount > 0 ? `${errorCount} linhas com erro.` : ''}`
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Formato de arquivo CSV inválido.';
            addToast({ type: 'error', title: 'Erro na Importação', message: errorMessage });
        }
    };
    
    const handleRegenerateRegistrations = () => {
        openConfirmationModal(
            'Regerar Todas as Matrículas',
            'Esta ação irá criar novos números de matrícula para TODOS os beneficiários, com base no ano atual e em uma nova sequência. Deseja continuar?',
            () => {
                const currentYear = new Date().getFullYear();
                const sortedByName = [...beneficiaries].sort((a,b) => a.name.localeCompare(b.name));

                const updatedBeneficiaries = sortedByName.map((b, index) => {
                    const newSequence = (index + 1).toString().padStart(3, '0');
                    return { ...b, registration: `${currentYear}${newSequence}` };
                });
                
                setBeneficiaries(updatedBeneficiaries);
                addToast({ type: 'success', title: 'Matrículas Regeneradas', message: 'Todos os números de matrícula foram atualizados.' });
            }
        );
    };

    // --- Printing Handlers ---

    const handlePrintBeneficiaryList = (beneficiariesToPrint: Beneficiary[]) => {
        if (beneficiariesToPrint.length === 0) {
            addToast({ type: 'warning', title: 'Nada para Imprimir', message: 'A lista de beneficiários para impressão está vazia.' });
            return;
        }
    
        const printContent = ReactDOMServer.renderToString(
            <BeneficiaryListPrintView 
                beneficiaries={beneficiariesToPrint}
                allWorkshops={workshops}
                calculateAge={calculateAge}
            />
        );
    
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Imprimir Lista de Beneficiários</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                    </head>
                    <body class="p-4">${printContent}</body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
        }
    };

    const handlePrintBadge = (beneficiary: Beneficiary) => {
        const enrolledWorkshops = workshops.filter(w => beneficiary.workshopIds.includes(w.id));
        const printContent = ReactDOMServer.renderToString(
            <BeneficiaryBadge beneficiary={beneficiary} workshops={enrolledWorkshops} />
        );
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head><title>Imprimir Crachá</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
                    </head>
                    <body>${printContent}</body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
        }
    };
    
    const handlePrintSelectedBadges = (beneficiaryIds: string[]) => {
        const beneficiariesToPrint = beneficiaries.filter(b => beneficiaryIds.includes(b.id));
        if (beneficiariesToPrint.length === 0) {
            addToast({ type: 'warning', title: 'Nenhuma seleção', message: 'Nenhum beneficiário selecionado para imprimir crachás.' });
            return;
        }

        const printContent = ReactDOMServer.renderToString(
            <AllBadgesPrintView beneficiaries={beneficiariesToPrint} allWorkshops={workshops} />
        );
         const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head><title>Imprimir Crachás</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
                    </head>
                    <body>${printContent}</body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
        }
    };
    
    const handlePrintWorkshopBadges = (workshopId: string) => {
        const beneficiariesToPrint = beneficiaries.filter(b => b.workshopIds.includes(workshopId));
        if (beneficiariesToPrint.length === 0) {
            addToast({ type: 'warning', title: 'Turma Vazia', message: 'Nenhum beneficiário inscrito nesta oficina para gerar crachás.' });
            return;
        }
        handlePrintSelectedBadges(beneficiariesToPrint.map(b => b.id));
    };

    const handlePrintWorkshopLabel = (workshop: Workshop) => {
        const educatorName = educators.find(e => e.id === workshop.educatorId)?.name || 'N/A';
        const enrolledCount = beneficiaries.filter(b => b.workshopIds.includes(workshop.id)).length;
        const printContent = ReactDOMServer.renderToString(
            <WorkshopLabelPrintView workshop={workshop} educatorName={educatorName} enrolledCount={enrolledCount} />
        );

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                 <html>
                    <head><title>Imprimir Etiqueta</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
                    </head>
                    <body>${printContent}</body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
        }
    };
    
    const handlePrintWorkshopList = (workshopsToPrint: Workshop[]) => {
        const getEducatorName = (id: string) => educators.find(e => e.id === id)?.name || 'N/A';
        const printContent = ReactDOMServer.renderToString(
            <WorkshopsListPrintView workshops={workshopsToPrint} getEducatorName={getEducatorName} beneficiaries={beneficiaries} />
        );

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head><title>Imprimir Lista de Oficinas</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    </head>
                    <body class="p-4">${printContent}</body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
        }
    };

    // --- Communication Handlers ---
    const handleScheduleMessage = (message: Omit<ScheduledMessage, 'id' | 'status'>) => {
        const newMessage: ScheduledMessage = {
            ...message,
            id: `msg-${Date.now()}`,
            status: 'Agendado'
        };
        setScheduledMessages(prev => [...prev, newMessage]);
        addToast({ type: 'success', title: 'Mensagem Agendada', message: 'Sua mensagem foi agendada para envio.' });
    };

    const handleSendMessageNow = (messageData: Omit<ScheduledMessage, 'id' | 'status'>) => {
        const newMessage: ScheduledMessage = {
            ...messageData,
            id: `msg-${Date.now()}`,
            status: 'Enviando',
        };
        
        let recipients: Beneficiary[] = [];
        if (newMessage.recipients.type === 'all') {
            recipients = beneficiaries.filter(b => b.phone);
        } else if (newMessage.recipients.type === 'workshop') {
            const workshopIds = new Set(newMessage.recipients.ids);
            recipients = beneficiaries.filter(b => b.phone && b.workshopIds.some(wid => workshopIds.has(wid)));
        }
        
        // Remove duplicates just in case
        recipients = Array.from(new Map(recipients.map(item => [item.id, item])).values());
        
        if (recipients.length === 0) {
            addToast({ type: 'warning', title: 'Sem Destinatários', message: 'Nenhum beneficiário com telefone válido foi encontrado para os critérios selecionados.' });
            return;
        }

        setScheduledMessages(prev => [...prev, newMessage]);
        setMessageRecipients(recipients);
        setMessageToSend(newMessage);
    };

    const handleCancelMessage = (id: string) => {
        setScheduledMessages(prev => prev.map(msg => msg.id === id ? { ...msg, status: 'Cancelado' } : msg));
        addToast({ type: 'info', title: 'Agendamento Cancelado', message: 'O envio da mensagem foi cancelado.' });
    };

    const handleMessageSendingComplete = (messageId: string) => {
        setScheduledMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, status: 'Enviado' } : msg));
        setMessageToSend(null);
        setMessageRecipients([]);
        addToast({ type: 'success', title: 'Envio Finalizado', message: 'Processo de envio manual de mensagens concluído.' });
    };
    
    // --- Data Clearing ---
    const handleClearData = (setter: React.Dispatch<React.SetStateAction<any[]>>, type: string) => {
        openConfirmationModal(
            `Apagar Todos os ${type}`,
            `Tem certeza que deseja apagar TODOS os ${type}? Esta ação é PERMANENTE e não pode ser desfeita.`,
            () => {
                setter([]);
                addToast({ type: 'warning', title: 'Dados Apagados', message: `Todos os ${type} foram removidos.` });
            }
        );
    };


    const renderTab = () => {
        switch (activeTab) {
            case 'painel':
                return <Dashboard 
                            beneficiaries={beneficiaries} 
                            educators={educators} 
                            workshops={workshops} 
                            frequencies={frequencies}
                            onOpenEnrolledList={openEnrolledListModal}
                            calculateAge={calculateAge}
                       />;
            case 'beneficiarios':
                return <BeneficiariesTab 
                            beneficiaries={beneficiaries}
                            workshops={workshops}
                            onAdd={() => openBeneficiaryModal(null)}
                            onEdit={openBeneficiaryModal}
                            onTransfer={openTransferModal}
                            onDelete={handleDeleteBeneficiary}
                            onImport={() => triggerImport('beneficiaries')}
                            onRegenerate={handleRegenerateRegistrations}
                            onOpenConfirmation={openConfirmationModal}
                            calculateAge={calculateAge}
                            onPrint={handlePrintBeneficiaryList}
                            onPrintBadge={handlePrintBadge}
                            onPrintSelectedBadges={handlePrintSelectedBadges}
                            addToast={addToast}
                       />;
            case 'educadores':
                return <EducatorsTab 
                            educators={educators}
                            workshops={workshops}
                            onAdd={() => openEducatorModal(null)}
                            onEdit={openEducatorModal}
                            onDelete={handleDeleteEducator}
                            onImport={() => triggerImport('educators')}
                            onOpenConfirmation={openConfirmationModal}
                            addToast={addToast}
                            onOpenWorkload={openWorkloadModal}
                        />;
            case 'oficinas':
                return <WorkshopsTab 
                            workshops={workshops}
                            educators={educators}
                            beneficiaries={beneficiaries}
                            onAdd={() => openWorkshopModal(null)}
                            onEdit={openWorkshopModal}
                            onDelete={handleDeleteWorkshop}
                            onImport={() => triggerImport('workshops')}
                            onOpenConfirmation={openConfirmationModal}
                            onOpenFrequency={setWorkshopForFrequency}
                            onPrintBadges={handlePrintWorkshopBadges}
                            onPrintLabel={handlePrintWorkshopLabel}
                            onPrintList={handlePrintWorkshopList}
                            onOpenEnroll={openEnrollModal}
                            onOpenDetails={openDetailsModal}
                            addToast={addToast}
                        />;
            case 'frequencia':
                return <FrequencyTab
                            workshops={workshops}
                            beneficiaries={beneficiaries}
                            frequencies={frequencies}
                            onSave={handleSaveFrequency}
                            onOpenWorkshopPopover={openWorkshopPopover}
                        />;
            case 'relatorios':
                return <ReportsTab
                            beneficiaries={beneficiaries}
                            workshops={workshops}
                            educators={educators}
                            calculateAge={calculateAge}
                        />;
            case 'comunicacao':
                return <CommunicationTab
                            beneficiaries={beneficiaries}
                            workshops={workshops}
                            scheduledMessages={scheduledMessages}
                            onScheduleMessage={handleScheduleMessage}
                            onSendMessageNow={handleSendMessageNow}
                            onCancelMessage={handleCancelMessage}
                        />;
            case 'integracao':
                const allDataForSync: McpSyncData = { beneficiaries, educators, workshops, frequencies };
                return <IntegrationTab
                            allData={allDataForSync}
                            lastSyncDate={lastSyncDate}
                            onSyncSuccess={setLastSyncDate}
                            onBackup={handleBackup}
                            onRestoreTrigger={triggerRestore}
                            addToast={addToast}
                            onClearBeneficiaries={() => handleClearData(setBeneficiaries, 'Beneficiários')}
                            onClearEducators={() => handleClearData(setEducators, 'Educadores')}
                            onClearWorkshops={() => handleClearData(setWorkshops, 'Oficinas')}
                        />;
            default:
                return null;
        }
    };
    
    return (
        <div className="bg-gray-100 min-h-screen text-gray-800 font-sans">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept=".csv,.json" />
            <header className="bg-white shadow-md sticky top-0 z-40">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-3">
                        <div className="flex items-center">
                            <i className="fas fa-child-reaching text-4xl text-indigo-600"></i>
                            <h1 className="ml-3 text-2xl font-bold text-gray-800">
                                Gestor Mais Infância
                            </h1>
                        </div>
                        <div className="text-right">
                            <p className="font-semibold text-lg text-indigo-700">{currentTime.toLocaleTimeString('pt-BR')}</p>
                            <p className="text-sm text-gray-500">{currentTime.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>
                    </div>
                    <div className="border-t border-gray-200">
                        <nav className="-mb-px flex space-x-2 overflow-x-auto" aria-label="Tabs">
                            <TabButton activeTab={activeTab} tab="painel" onClick={setActiveTab}><i className={`${ICONS.painel} mr-2`}></i>Painel</TabButton>
                            <TabButton activeTab={activeTab} tab="beneficiarios" onClick={setActiveTab}><i className={`${ICONS.beneficiarios} mr-2`}></i>Beneficiários</TabButton>
                            <TabButton activeTab={activeTab} tab="educadores" onClick={setActiveTab}><i className={`${ICONS.educadores} mr-2`}></i>Educadores</TabButton>
                            <TabButton activeTab={activeTab} tab="oficinas" onClick={setActiveTab}><i className={`${ICONS.oficinas} mr-2`}></i>Oficinas</TabButton>
                            <TabButton activeTab={activeTab} tab="frequencia" onClick={setActiveTab}><i className={`${ICONS.frequencia} mr-2`}></i>Frequência</TabButton>
                            <TabButton activeTab={activeTab} tab="relatorios" onClick={setActiveTab}><i className={`${ICONS.relatorios} mr-2`}></i>Relatórios</TabButton>
                            <TabButton activeTab={activeTab} tab="comunicacao" onClick={setActiveTab}><i className={`${ICONS.comunicacao} mr-2`}></i>Comunicação</TabButton>
                            <TabButton activeTab={activeTab} tab="integracao" onClick={setActiveTab}><i className={`${ICONS.integracao} mr-2`}></i>Integração</TabButton>
                        </nav>
                    </div>
                </div>
            </header>
    
            <main className="container mx-auto p-4 sm:p-6 lg:p-8">
                {renderTab()}
            </main>
            
            {/* Modals */}
            <BeneficiaryModal 
                isOpen={isBeneficiaryModalOpen} 
                onClose={() => setIsBeneficiaryModalOpen(false)} 
                onSave={handleSaveBeneficiary}
                beneficiaryToEdit={beneficiaryToEdit}
                allWorkshops={workshops}
                beneficiaries={beneficiaries}
                allEducators={educators}
            />
            <EducatorModal 
                isOpen={isEducatorModalOpen} 
                onClose={() => setIsEducatorModalOpen(false)} 
                onSave={handleSaveEducator}
                educatorToEdit={educatorToEdit}
            />
            <WorkshopModal 
                isOpen={isWorkshopModalOpen}
                onClose={() => setIsWorkshopModalOpen(false)}
                onSave={handleSaveWorkshop}
                workshopToEdit={workshopToEdit}
                allEducators={educators}
            />
            <ConfirmationModal 
                isOpen={isConfirmationModalOpen} 
                onClose={() => setIsConfirmationModalOpen(false)}
                title={confirmationModalProps.title}
                message={confirmationModalProps.message}
                onConfirm={confirmationModalProps.onConfirm}
            />
            <WorkshopFrequencyModal
                isOpen={!!workshopForFrequency}
                onClose={() => setWorkshopForFrequency(null)}
                onSave={handleSaveFrequency}
                workshop={workshopForFrequency}
                beneficiaries={beneficiaries}
                frequencies={frequencies}
                calculateAge={calculateAge}
                allEducators={educators}
                onOpenWorkshopPopover={openWorkshopPopover}
            />
            <TransferBeneficiaryModal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                onSave={handleTransferBeneficiary}
                beneficiary={beneficiaryToTransfer}
                allWorkshops={workshops}
                allEducators={educators}
            />
            <EducatorWorkloadModal
                isOpen={!!educatorForWorkload}
                onClose={() => setEducatorForWorkload(null)}
                educator={educatorForWorkload}
                workshops={workshops}
            />
            <EnrolledBeneficiariesModal
                isOpen={!!workshopForEnrolledList}
                onClose={() => setWorkshopForEnrolledList(null)}
                workshop={workshopForEnrolledList}
                beneficiaries={beneficiaries}
                calculateAge={calculateAge}
            />
             <EnrollBeneficiaryModal
                isOpen={!!workshopToEnroll}
                onClose={() => setWorkshopToEnroll(null)}
                onSave={handleEnrollBeneficiaries}
                workshop={workshopToEnroll}
                allBeneficiaries={beneficiaries}
                calculateAge={calculateAge}
            />
            <WorkshopDetailsModal
                isOpen={!!workshopForDetails}
                onClose={() => setWorkshopForDetails(null)}
                workshop={workshopForDetails}
                educators={educators}
                beneficiaries={beneficiaries}
            />
            {popoverState.target && (
                 <WorkshopPopover
                    beneficiary={popoverState.beneficiary}
                    target={popoverState.target}
                    allWorkshops={workshops}
                    onClose={() => setPopoverState({ beneficiary: null, target: null })}
                    currentWorkshopId={popoverState.currentWorkshopId}
                />
            )}
            <MessageSenderModal
                isOpen={!!messageToSend}
                onClose={() => setMessageToSend(null)}
                onComplete={handleMessageSendingComplete}
                message={messageToSend}
                recipients={messageRecipients}
            />
        </div>
    );
};

const App = () => (
    <ToastProvider>
        <AppContent />
    </ToastProvider>
);

export default App;