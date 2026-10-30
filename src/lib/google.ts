import { google } from 'googleapis';
import { SITE_CONFIG } from '../config/site';

export interface SlotStatus {
  time: string;
  period: 'morning' | 'afternoon';
  status: 'available' | 'occupied' | 'disabled';
}

export interface AvailabilityResponse {
  date: string;
  dayOfWeek: number;
  isSunday: boolean;
  isSaturday: boolean;
  isPastDate: boolean;
  mode: 'google_cloud' | 'local_mock';
  slots: SlotStatus[];
  occupiedSlots: string[];
}

export interface BookingInput {
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "09:00 AM"
  patientName: string;
  patientPhone: string;
  treatment: string;
}

export interface BookingConfirmation {
  bookingId: string;
  patientName: string;
  patientPhone: string;
  treatment: string;
  date: string;
  dateFormatted: string;
  timeSlot: string;
  clinicName: string;
  address: string;
  neighborhood: string;
  city: string;
  calendarEventId: string;
  mode: 'google_cloud' | 'local_mock';
}

// ============================================================================
// ALMACÉN EN MEMORIA Y MUTEX ATÓMICO PARA DESARROLLO LOCAL Y ANTI-COLISIÓN
// ============================================================================
interface MockEvent {
  bookingId: string;
  calendarEventId: string;
  date: string;
  timeSlot: string;
  startIso: string;
  endIso: string;
  patientName: string;
  patientPhone: string;
  treatment: string;
  createdAt: string;
}

const globalStore = globalThis as unknown as {
  __clinicMockEvents?: Map<string, MockEvent[]>;
  __clinicActiveLocks?: Set<string>;
};

if (!globalStore.__clinicMockEvents) {
  globalStore.__clinicMockEvents = new Map<string, MockEvent[]>();
}
if (!globalStore.__clinicActiveLocks) {
  globalStore.__clinicActiveLocks = new Set<string>();
}

const mockEventsByDate = globalStore.__clinicMockEvents;
const activeLocks = globalStore.__clinicActiveLocks;

// ============================================================================
// UTILIDADES DE FECHA Y HORA EN ZONA HORARIA AMERICA/BOGOTA (UTC-5)
// ============================================================================
const SLOT_TO_HOUR_24: Record<string, number> = {
  '08:00 AM': 8,
  '09:00 AM': 9,
  '10:00 AM': 10,
  '11:00 AM': 11,
  '12:00 PM': 12,
  '02:00 PM': 14,
  '03:00 PM': 15,
  '04:00 PM': 16,
  '05:00 PM': 17,
};

export const MORNING_SLOTS = ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM'];
export const AFTERNOON_SLOTS = ['02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'];
export const ALL_SLOTS = [...MORNING_SLOTS, ...AFTERNOON_SLOTS];

export function getBogotaNow(): { todayStr: string; currentHour24: number; currentMinute: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  const todayStr = `${map.year}-${map.month}-${map.day}`;
  const currentHour24 = parseInt(map.hour || '0', 10);
  const currentMinute = parseInt(map.minute || '0', 10);
  return { todayStr, currentHour24, currentMinute };
}

export function parseBogotaDate(dateStr: string): Date {
  // Interpret YYYY-MM-DD at 12:00:00 in Bogota (-05:00) to avoid day-of-week shifts
  return new Date(`${dateStr}T12:00:00-05:00`);
}

export function formatSpanishLongDate(dateStr: string): string {
  const dateObj = parseBogotaDate(dateStr);
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const dayName = days[dateObj.getUTCDay()];
  const [, monthStr, dayStr] = dateStr.split('-');
  const year = dateStr.split('-')[0];
  const monthName = months[parseInt(monthStr, 10) - 1];
  const dayNum = parseInt(dayStr, 10);
  return `${dayName}, ${dayNum} de ${monthName} de ${year}`;
}

export function getSlotIsoRange(dateStr: string, timeSlot: string): { startIso: string; endIso: string } {
  const hour24 = SLOT_TO_HOUR_24[timeSlot];
  if (hour24 === undefined) {
    throw new Error(`Horario inválido: ${timeSlot}`);
  }
  const startHourPad = String(hour24).padStart(2, '0');
  const endHourPad = String(hour24 + 1).padStart(2, '0');
  return {
    startIso: `${dateStr}T${startHourPad}:00:00-05:00`,
    endIso: `${dateStr}T${endHourPad}:00:00-05:00`,
  };
}

// ============================================================================
// CONFIGURACIÓN DE CREDENCIALES GOOGLE SERVICE ACCOUNT JWT
// ============================================================================
function getEnvVar(key: string): string {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const val = metaEnv?.[key] ?? process.env[key] ?? '';
  return val.trim();
}

function normalizePrivateKey(raw: string): string {
  if (!raw) return '';
  let key = raw.trim();
  while ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/\\n/g, '\n').replace(/\r/g, '');

  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}`;
  }
  if (!key.includes('-----END PRIVATE KEY-----')) {
    key = `${key}\n-----END PRIVATE KEY-----`;
  }

  key = key
    .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
    .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');

  key = key.replace(/\n+/g, '\n').trim();

  return key;
}

export function hasGoogleCredentials(): boolean {
  const email = getEnvVar('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = normalizePrivateKey(getEnvVar('GOOGLE_PRIVATE_KEY'));
  const calendarId = getEnvVar('GOOGLE_CALENDAR_ID');
  return Boolean(email && privateKey && calendarId && privateKey.includes('PRIVATE KEY'));
}

function getGoogleAuthClient() {
  const clientEmail = getEnvVar('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = normalizePrivateKey(getEnvVar('GOOGLE_PRIVATE_KEY'));

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });
}

// ============================================================================
// CONSULTA DE DISPONIBILIDAD EN TIEMPO REAL
// ============================================================================
export async function getDayAvailability(dateStr: string): Promise<AvailabilityResponse> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Formato de fecha inválido. Use YYYY-MM-DD.');
  }

  const { todayStr, currentHour24 } = getBogotaNow();
  const dateObj = parseBogotaDate(dateStr);
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Domingo, 6 = Sábado
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;
  const isPastDate = dateStr < todayStr;
  const isToday = dateStr === todayStr;

  const occupiedSet = new Set<string>();
  let mode: 'google_cloud' | 'local_mock' = 'local_mock';

  if (!isSunday && !isPastDate) {
    if (hasGoogleCredentials()) {
      try {
        const auth = getGoogleAuthClient();
        const calendar = google.calendar({ version: 'v3', auth });
        const calendarId = getEnvVar('GOOGLE_CALENDAR_ID');

        const dayStartIso = `${dateStr}T00:00:00-05:00`;
        const dayEndIso = `${dateStr}T23:59:59-05:00`;

        const eventsRes = await calendar.events.list({
          calendarId,
          timeMin: dayStartIso,
          timeMax: dayEndIso,
          singleEvents: true,
          orderBy: 'startTime',
        });

        const items = eventsRes.data.items || [];
        for (const slot of ALL_SLOTS) {
          const { startIso, endIso } = getSlotIsoRange(dateStr, slot);
          const slotStartMs = new Date(startIso).getTime();
          const slotEndMs = new Date(endIso).getTime();

          const hasOverlap = items.some((ev) => {
            if (ev.status === 'cancelled') return false;
            const evStartStr = ev.start?.dateTime || ev.start?.date;
            const evEndStr = ev.end?.dateTime || ev.end?.date;
            if (!evStartStr || !evEndStr) return false;
            const evStartMs = new Date(evStartStr).getTime();
            const evEndMs = new Date(evEndStr).getTime();
            return evStartMs < slotEndMs && evEndMs > slotStartMs;
          });

          if (hasOverlap) {
            occupiedSet.add(slot);
          }
        }
        mode = 'google_cloud';
      } catch (err) {
        console.warn('[CLINICA] Fallback a Mock Local al consultar disponibilidad:', err);
        mode = 'local_mock';
      }
    }

    // Siempre revisar también reservas registradas en el almacén en memoria
    const localEvents = mockEventsByDate.get(dateStr) || [];
    for (const ev of localEvents) {
      occupiedSet.add(ev.timeSlot);
    }
  }

  const slots: SlotStatus[] = ALL_SLOTS.map((time) => {
    const period: 'morning' | 'afternoon' = MORNING_SLOTS.includes(time) ? 'morning' : 'afternoon';
    const slotHour = SLOT_TO_HOUR_24[time];

    if (isSunday || isPastDate) {
      return { time, period, status: 'disabled' };
    }
    if (isSaturday && period === 'afternoon') {
      return { time, period, status: 'disabled' };
    }
    if (isToday && slotHour <= currentHour24) {
      return { time, period, status: 'disabled' };
    }
    if (occupiedSet.has(time)) {
      return { time, period, status: 'occupied' };
    }
    return { time, period, status: 'available' };
  });

  return {
    date: dateStr,
    dayOfWeek,
    isSunday,
    isSaturday,
    isPastDate,
    mode,
    slots,
    occupiedSlots: Array.from(occupiedSet),
  };
}

// ============================================================================
// RESERVA ATÓMICA CON PREVENCIÓN DE COLISIONES (HTTP 409)
// ============================================================================
export class SlotConflictError extends Error {
  public readonly statusCode = 409;
  constructor(
    message = 'Lo sentimos, otro paciente acaba de reservar este horario hace unos segundos. Por favor selecciona otra hora disponible.'
  ) {
    super(message);
    this.name = 'SlotConflictError';
  }
}

export class ValidationError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export async function createAtomicBooking(input: BookingInput): Promise<BookingConfirmation> {
  const dateStr = (input.date || '').trim();
  const timeSlot = (input.timeSlot || '').trim();
  const patientName = (input.patientName || '').trim();
  const patientPhone = (input.patientPhone || '').trim();
  const treatment = (input.treatment || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new ValidationError('Por favor selecciona una fecha válida en el calendario.');
  }
  if (!ALL_SLOTS.includes(timeSlot)) {
    throw new ValidationError('Por favor selecciona un horario válido.');
  }
  if (patientName.length < 3) {
    throw new ValidationError('Por favor ingresa tu nombre completo.');
  }
  if (patientPhone.replace(/\D/g, '').length < 7) {
    throw new ValidationError('Por favor ingresa un número de teléfono o WhatsApp válido.');
  }
  if (!treatment) {
    throw new ValidationError('Por favor selecciona el tratamiento o especialidad.');
  }

  const { todayStr, currentHour24 } = getBogotaNow();
  const dateObj = parseBogotaDate(dateStr);
  const dayOfWeek = dateObj.getUTCDay();

  if (dateStr < todayStr) {
    throw new ValidationError('No es posible agendar citas en fechas pasadas.');
  }
  if (dayOfWeek === 0) {
    throw new ValidationError('Los domingos no hay servicio de consulta. Por favor elige de lunes a sábado.');
  }
  if (dayOfWeek === 6 && AFTERNOON_SLOTS.includes(timeSlot)) {
    throw new ValidationError('Los sábados atendemos únicamente en el bloque de la mañana (08:00 AM a 12:00 PM).');
  }
  if (dateStr === todayStr && SLOT_TO_HOUR_24[timeSlot] <= currentHour24) {
    throw new ValidationError('Este horario del día de hoy ya ha pasado. Selecciona una hora posterior.');
  }

  const lockKey = `${dateStr}__${timeSlot}`;

  // Bloqueo atómico en proceso contra peticiones simultáneas en milisegundos
  if (activeLocks.has(lockKey)) {
    throw new SlotConflictError();
  }

  activeLocks.add(lockKey);

  try {
    const { startIso, endIso } = getSlotIsoRange(dateStr, timeSlot);
    const slotStartMs = new Date(startIso).getTime();
    const slotEndMs = new Date(endIso).getTime();

    // 1. Verificar colisión en almacén local
    const existingLocal = mockEventsByDate.get(dateStr) || [];
    if (existingLocal.some((ev) => ev.timeSlot === timeSlot)) {
      throw new SlotConflictError();
    }

    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const bookingId = `#BIO-${randomDigits}`;
    const createdAtIso = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    const dateFormatted = formatSpanishLongDate(dateStr);

    let calendarEventId = `local-evt-${Date.now()}-${randomDigits}`;
    let mode: 'google_cloud' | 'local_mock' = 'local_mock';

    // 2. Si hay credenciales de Google Cloud configuradas, verificar e insertar en tiempo real
    if (hasGoogleCredentials()) {
      const auth = getGoogleAuthClient();
      const calendar = google.calendar({ version: 'v3', auth });
      const calendarId = getEnvVar('GOOGLE_CALENDAR_ID');

      // Verificación atómica justo antes de insertar en Google Calendar
      const checkRes = await calendar.events.list({
        calendarId,
        timeMin: startIso,
        timeMax: endIso,
        singleEvents: true,
      });

      const conflictingEvents = (checkRes.data.items || []).filter((ev) => {
        if (ev.status === 'cancelled') return false;
        const evStartStr = ev.start?.dateTime || ev.start?.date;
        const evEndStr = ev.end?.dateTime || ev.end?.date;
        if (!evStartStr || !evEndStr) return false;
        const evStartMs = new Date(evStartStr).getTime();
        const evEndMs = new Date(evEndStr).getTime();
        return evStartMs < slotEndMs && evEndMs > slotStartMs;
      });

      if (conflictingEvents.length > 0) {
        throw new SlotConflictError();
      }

      // Insertar evento en Google Calendar
      const eventSummary = `🦷 Cita ${SITE_CONFIG.shortName}: ${treatment} - ${patientName}`;
      const eventDescription = [
        `Código Reserva: ${bookingId}`,
        `Paciente: ${patientName}`,
        `Teléfono/WhatsApp: ${patientPhone}`,
        `Tratamiento: ${treatment}`,
        `Clínica: ${SITE_CONFIG.clinicName}`,
        `Dirección: ${SITE_CONFIG.fullAddress}`,
      ].join('\n');

      const insertRes = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: eventSummary,
          location: SITE_CONFIG.fullAddress,
          description: eventDescription,
          start: {
            dateTime: startIso,
            timeZone: 'America/Bogota',
          },
          end: {
            dateTime: endIso,
            timeZone: 'America/Bogota',
          },
        },
      });

      calendarEventId = insertRes.data.id || calendarEventId;
      mode = 'google_cloud';

      // 3. Registrar fila en Google Sheets (hoja 'Citas')
      const sheetsId = getEnvVar('GOOGLE_SHEETS_ID');
      if (sheetsId) {
        try {
          const sheets = google.sheets({ version: 'v4', auth });
          await sheets.spreadsheets.values.append({
            spreadsheetId: sheetsId,
            range: 'Citas!A:K',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [
                [
                  bookingId,
                  createdAtIso,
                  dateStr,
                  timeSlot,
                  patientName,
                  patientPhone,
                  treatment,
                  SITE_CONFIG.clinicName,
                  SITE_CONFIG.fullAddress,
                  'Confirmada',
                  calendarEventId,
                ],
              ],
            },
          });
        } catch (sheetErr) {
          console.error('[CLINICA] Error registrando cita en Google Sheets:', sheetErr);
        }
      }
    }

    // Guardar también en el almacén en memoria para consistencia inmediata
    const updatedList = mockEventsByDate.get(dateStr) || [];
    updatedList.push({
      bookingId,
      calendarEventId,
      date: dateStr,
      timeSlot,
      startIso,
      endIso,
      patientName,
      patientPhone,
      treatment,
      createdAt: createdAtIso,
    });
    mockEventsByDate.set(dateStr, updatedList);

    return {
      bookingId,
      patientName,
      patientPhone,
      treatment,
      date: dateStr,
      dateFormatted,
      timeSlot,
      clinicName: SITE_CONFIG.clinicName,
      address: SITE_CONFIG.address,
      neighborhood: SITE_CONFIG.neighborhood,
      city: SITE_CONFIG.city,
      calendarEventId,
      mode,
    };
  } finally {
    activeLocks.delete(lockKey);
  }
}
