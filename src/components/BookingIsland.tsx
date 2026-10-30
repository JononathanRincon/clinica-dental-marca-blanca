import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { SITE_CONFIG } from '../config/site';
import type { AvailabilityResponse, BookingConfirmation, SlotStatus } from '../lib/google';

const MONTHS_ES = [
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

const DAYS_FULL_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const MORNING_DEFAULT = ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM'];
const AFTERNOON_DEFAULT = ['02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'];

function getBogotaTodayString(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

function getInitialValidDate(todayStr: string): string {
  const [y, m, d] = todayStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  // Si hoy es domingo (0), avanzar al lunes
  if (dt.getUTCDay() === 0) {
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatReadableShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayName = DAYS_FULL_ES[dt.getUTCDay()];
  const monthName = MONTHS_ES[m - 1];
  return `${dayName}, ${d} de ${monthName}`;
}

export default function BookingIsland() {
  const [todayStr, setTodayStr] = useState<string>(() => getBogotaTodayString());
  const [selectedDate, setSelectedDate] = useState<string>(() => getInitialValidDate(getBogotaTodayString()));
  const [viewYear, setViewYear] = useState<number>(() => Number(getInitialValidDate(getBogotaTodayString()).split('-')[0]));
  const [viewMonth, setViewMonth] = useState<number>(() => Number(getInitialValidDate(getBogotaTodayString()).split('-')[1]) - 1);

  const [treatment, setTreatment] = useState<string>(SITE_CONFIG.treatments[0].label);
  const [selectedSlot, setSelectedSlot] = useState<string>('09:00 AM');
  const [patientName, setPatientName] = useState<string>('');
  const [patientPhone, setPatientPhone] = useState<string>('');

  const [slotsData, setSlotsData] = useState<SlotStatus[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorAlert, setErrorAlert] = useState<{ type: 'conflict' | 'validation'; message: string } | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<BookingConfirmation | null>(null);

  // Actualizar todayStr en cliente para exactitud con zona horaria America/Bogota
  useEffect(() => {
    const currentToday = getBogotaTodayString();
    setTodayStr(currentToday);
    const validInit = getInitialValidDate(currentToday);
    setSelectedDate(validInit);
    const [y, m] = validInit.split('-').map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
  }, []);

  // Escuchar selección de servicio desde las tarjetas de catálogo
  useEffect(() => {
    const handleSelectService = (e: Event) => {
      const customEvt = e as CustomEvent<{ treatmentLabel?: string }>;
      if (customEvt.detail?.treatmentLabel) {
        setTreatment(customEvt.detail.treatmentLabel);
      }
    };
    window.addEventListener('clinic:select-treatment', handleSelectService);
    return () => window.removeEventListener('clinic:select-treatment', handleSelectService);
  }, []);

  const fetchAvailability = useCallback(
    async (targetDate: string, silent = false) => {
      if (!targetDate) return;
      if (!silent) setIsLoadingSlots(true);

      try {
        const res = await fetch(`/api/availability?date=${encodeURIComponent(targetDate)}&_t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Error consultando disponibilidad');
        const data: AvailabilityResponse = await res.json();
        setSlotsData(data.slots || []);

        // Si el horario actualmente seleccionado ahora está ocupado o deshabilitado, elegir el primer disponible
        setSelectedSlot((prevSlot) => {
          const currentSlotObj = (data.slots || []).find((s) => s.time === prevSlot);
          if (currentSlotObj && currentSlotObj.status === 'available') {
            return prevSlot;
          }
          const firstAvail = (data.slots || []).find((s) => s.status === 'available');
          return firstAvail ? firstAvail.time : '';
        });
      } catch (err) {
        console.error('[CLINICA] Error cargando disponibilidad:', err);
      } finally {
        if (!silent) setIsLoadingSlots(false);
      }
    },
    []
  );

  // Consulta al cambiar de día + Revalidación en tiempo real cada 15s y al recuperar foco
  useEffect(() => {
    fetchAvailability(selectedDate, false);

    const intervalId = window.setInterval(() => {
      fetchAvailability(selectedDate, true);
    }, 15000);

    const handleFocus = () => {
      fetchAvailability(selectedDate, true);
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedDate, fetchAvailability]);

  // Construcción de la matriz del calendario mensual (Lun - Dom)
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1, 12, 0, 0));
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0, 12, 0, 0)).getUTCDate();
    const daysInPrevMonth = new Date(Date.UTC(viewYear, viewMonth, 0, 12, 0, 0)).getUTCDate();

    // Convertir Domingo(0)..Sábado(6) a Lunes(0)..Domingo(6)
    const startOffset = (firstDayOfMonth.getUTCDay() + 6) % 7;

    const cells: Array<{
      day: number;
      dateStr: string;
      inCurrentMonth: boolean;
      isSunday: boolean;
      isSaturday: boolean;
      isPast: boolean;
    }> = [];

    // Días previos de relleno
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        day: d,
        dateStr,
        inCurrentMonth: false,
        isSunday: false,
        isSaturday: false,
        isPast: true,
      });
    }

    // Días del mes actual
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dt = new Date(Date.UTC(viewYear, viewMonth, d, 12, 0, 0));
      const dow = dt.getUTCDay();
      cells.push({
        day: d,
        dateStr,
        inCurrentMonth: true,
        isSunday: dow === 0,
        isSaturday: dow === 6,
        isPast: dateStr < todayStr,
      });
    }

    // Días siguientes de relleno para completar semanas de 7 columnas
    const remainder = cells.length % 7;
    if (remainder !== 0) {
      const needed = 7 - remainder;
      for (let d = 1; d <= needed; d++) {
        const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
        const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
        const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push({
          day: d,
          dateStr,
          inCurrentMonth: false,
          isSunday: false,
          isSaturday: false,
          isPast: true,
        });
      }
    }

    return cells;
  }, [viewYear, viewMonth, todayStr]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDaySelect = (dateStr: string, isDisabled: boolean) => {
    if (isDisabled) return;
    setErrorAlert(null);
    setSelectedDate(dateStr);
  };

  const isSelectedSaturday = useMemo(() => {
    if (!selectedDate) return false;
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return dt.getUTCDay() === 6;
  }, [selectedDate]);

  const getSlotStatus = (time: string): 'available' | 'occupied' | 'disabled' => {
    const found = slotsData.find((s) => s.time === time);
    if (!found) {
      if (isSelectedSaturday && AFTERNOON_DEFAULT.includes(time)) return 'disabled';
      return 'available';
    }
    return found.status;
  };

  const handleBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAlert(null);

    if (!selectedDate) {
      setErrorAlert({ type: 'validation', message: 'Por favor selecciona un día disponible en el calendario.' });
      return;
    }
    if (!selectedSlot) {
      setErrorAlert({ type: 'validation', message: 'Por favor selecciona una hora disponible.' });
      return;
    }
    if (patientName.trim().length < 3) {
      setErrorAlert({ type: 'validation', message: 'Por favor ingresa tu nombre completo.' });
      return;
    }
    if (patientPhone.replace(/\D/g, '').length < 7) {
      setErrorAlert({ type: 'validation', message: 'Por favor ingresa un número de teléfono o WhatsApp válido.' });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: selectedDate,
          timeSlot: selectedSlot,
          patientName: patientName.trim(),
          patientPhone: patientPhone.trim(),
          treatment,
        }),
      });

      const data = await response.json();

      if (response.status === 409) {
        // Colisión detectada: mostrar alerta clara y recargar grilla en tiempo real
        setErrorAlert({
          type: 'conflict',
          message:
            data.error ||
            'Lo sentimos, otro paciente acaba de reservar este horario hace unos segundos. Por favor selecciona otra hora disponible.',
        });
        await fetchAvailability(selectedDate, false);
        return;
      }

      if (!response.ok) {
        setErrorAlert({
          type: 'validation',
          message: data.error || 'No se pudo completar la reserva. Revisa los datos e intenta de nuevo.',
        });
        await fetchAvailability(selectedDate, true);
        return;
      }

      // 200 OK: Mostrar Modal de Confirmación y actualizar disponibilidad
      setConfirmedBooking(data as BookingConfirmation);
      await fetchAvailability(selectedDate, true);
    } catch (err) {
      console.error('[CLINICA] Error al enviar reserva:', err);
      setErrorAlert({
        type: 'validation',
        message: 'Error de conexión al procesar tu cita. Verifica tu conexión e inténtalo de nuevo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generación del Comprobante PDF en cliente con jsPDF
  const handleDownloadPdf = () => {
    if (!confirmedBooking) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const cleanCode = confirmedBooking.bookingId.replace('#', '');

    // Encabezado Institucional Azul (#0f52ba)
    doc.setFillColor(15, 82, 186);
    doc.rect(0, 0, 210, 44, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(SITE_CONFIG.clinicName.toUpperCase(), 20, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.text(`COMPROBANTE OFICIAL DE CITA ODONTOLOGICA • SEDE ${SITE_CONFIG.neighborhood.toUpperCase()}`, 20, 29);
    doc.text(`${SITE_CONFIG.fullAddress} | Tel: ${SITE_CONFIG.phoneDisplay}`, 20, 36);

    // Banda de Estado y Código de Reserva
    doc.setFillColor(217, 226, 255); // #d9e2ff
    doc.roundedRect(20, 54, 170, 22, 3, 3, 'F');

    doc.setTextColor(0, 60, 144); // #003c90
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('ESTADO: CITA CONFIRMADA Y RESERVADA EN AGENDA', 28, 64);
    doc.setFontSize(12);
    doc.text(`CODIGO DE RESERVA: ${confirmedBooking.bookingId}`, 28, 71);

    // Marco de Datos del Paciente y Cita
    doc.setDrawColor(226, 223, 215);
    doc.setFillColor(251, 249, 244);
    doc.roundedRect(20, 84, 170, 108, 3, 3, 'FD');

    const rows: Array<[string, string]> = [
      ['Clinica:', confirmedBooking.clinicName],
      ['Codigo de Cita:', confirmedBooking.bookingId],
      ['Paciente:', confirmedBooking.patientName],
      ['Telefono / WhatsApp:', confirmedBooking.patientPhone],
      ['Especialidad / Tratamiento:', confirmedBooking.treatment],
      ['Dia de la Cita:', confirmedBooking.dateFormatted],
      ['Hora Asignada:', `${confirmedBooking.timeSlot} (Duracion: 60 min)`],
      ['Direccion:', confirmedBooking.address],
      ['Barrio / Sector:', `${confirmedBooking.neighborhood} • ${confirmedBooking.city}`],
      ['Linea de Atencion:', SITE_CONFIG.phoneDisplay],
    ];

    let yPos = 96;
    for (const [label, value] of rows) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(67, 70, 83);
      doc.text(label, 28, yPos);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(27, 28, 25);
      doc.text(String(value), 85, yPos);

      doc.setDrawColor(234, 232, 227);
      doc.line(28, yPos + 3, 182, yPos + 3);
      yPos += 10;
    }

    // Nota importante de asistencia
    doc.setFillColor(245, 243, 238);
    doc.roundedRect(20, 202, 170, 26, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 82, 186);
    doc.text('INDICACIONES PARA TU CONSULTA:', 28, 211);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(67, 70, 83);
    doc.text('• Por favor llegar 10 minutos antes de la hora agendada para registro en recepcion.', 28, 218);
    doc.text(`• Si necesitas reprogramar tu cita, comunicate al WhatsApp ${SITE_CONFIG.phoneDisplay}.`, 28, 224);

    // Pie de página
    doc.setFontSize(9);
    doc.setTextColor(115, 119, 132);
    doc.text(
      `Documento generado electronicamente por ${SITE_CONFIG.clinicName} (${new Date().toLocaleDateString('es-CO')})`,
      20,
      275
    );

    doc.save(`Comprobante_Cita_${cleanCode}.pdf`);
  };

  // Construcción del enlace de WhatsApp dirigido directamente al número del cliente/paciente
  const getWhatsAppConfirmationUrl = () => {
    if (!confirmedBooking) return SITE_CONFIG.links.whatsappDirect;

    const message = [
      `🦷 *CONFIRMACIÓN DE CITA - ${SITE_CONFIG.clinicName.toUpperCase()}*`,
      `✅ *Estado:* Cita Agendada (Código: ${confirmedBooking.bookingId})`,
      '',
      `👤 *Paciente:* ${confirmedBooking.patientName}`,
      `📱 *Teléfono:* ${confirmedBooking.patientPhone}`,
      `🩺 *Tratamiento:* ${confirmedBooking.treatment}`,
      `📅 *Día:* ${confirmedBooking.dateFormatted}`,
      `⏰ *Hora:* ${confirmedBooking.timeSlot}`,
      '',
      `📍 *Clínica:* ${confirmedBooking.clinicName}`,
      `🏥 *Dirección:* ${confirmedBooking.address}`,
      `🏘️ *Barrio / Sector:* ${confirmedBooking.neighborhood}`,
      `📞 *Línea de Atención:* ${SITE_CONFIG.phoneDisplay}`,
    ].join('\n');

    // Limpiar caracteres del teléfono ingresado por el paciente
    let targetPhone = (confirmedBooking.patientPhone || '').replace(/\D/g, '');

    // Si es un número celular de Colombia (10 dígitos que empiezan por 3), agregar código de país 57
    if (targetPhone.length === 10 && targetPhone.startsWith('3')) {
      targetPhone = `57${targetPhone}`;
    } else if (!targetPhone) {
      targetPhone = SITE_CONFIG.whatsappNumber;
    }

    // Usamos https://api.whatsapp.com/send/ directamente para evitar que el redireccionador wa.me corrompa los emojis en UTF-8 (%EF%BF%BD)
    return `https://api.whatsapp.com/send/?phone=${targetPhone}&text=${encodeURIComponent(message)}`;
  };

  // Cerrar modal, limpiar formulario y refrescar calendario con la hora ocupada
  const handleCloseModal = () => {
    setConfirmedBooking(null);
    setPatientName('');
    setPatientPhone('');
    setErrorAlert(null);
    fetchAvailability(selectedDate, false);
  };

  return (
    <>
      <form onSubmit={handleBookSubmit} className="bg-surface-container-lowest rounded-2xl p-5 sm:p-8 shadow-md border border-[#E2DFD7]">
        {/* Top Status Header */}
        <div className="flex items-center justify-between mb-space-md gap-2 flex-wrap">
          <span className="inline-block bg-primary-fixed text-primary px-space-sm py-1 rounded font-label-sm text-label-sm uppercase font-bold whitespace-nowrap">
            RESERVA INMEDIATA
          </span>
          <span className="font-label-sm text-label-sm text-on-surface-variant font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#107C41] animate-pulse"></span>
            Disponibilidad en tiempo real • Paso 1 de 2
          </span>
        </div>

        <h2 className="font-headline-lg-mobile lg:font-headline-lg text-headline-lg-mobile lg:text-headline-lg uppercase text-on-surface mb-1">
          AGENDA TU CITA EN LÍNEA
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-space-md">
          Selecciona el tratamiento, fecha y franja horaria que mejor te convenga.
        </p>

        {/* Treatment Selector */}
        <div className="mb-space-lg">
          <label
            htmlFor="treatment-select"
            className="block font-label-md text-label-md uppercase text-on-surface font-semibold mb-space-xs"
          >
            Tratamiento o Especialidad
          </label>
          <div className="relative">
            <select
              id="treatment-select"
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
              className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md px-4 py-3 rounded-lg border border-[#D4D0C5] focus:outline-none focus:ring-2 focus:ring-primary-container transition-all appearance-none cursor-pointer"
            >
              {SITE_CONFIG.treatments.map((item) => (
                <option key={item.id} value={item.label}>
                  {item.label}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
              expand_more
            </span>
          </div>
        </div>

        {/* FULL MONTH CALENDAR */}
        <div className="mb-space-lg bg-surface-container-low p-4 sm:p-space-md rounded-xl border border-[#E2DFD7]">
          <div className="flex items-center justify-between mb-space-md">
            <div>
              <span className="font-title-md text-body-lg text-on-surface font-bold uppercase tracking-wider block">
                {MONTHS_ES[viewMonth]} {viewYear}
              </span>
              <span className="font-label-sm text-label-sm text-primary-container font-semibold">
                {SITE_CONFIG.neighborhood} (UTC-5)
              </span>
            </div>
            <div className="flex items-center gap-space-xs">
              <button
                aria-label="Mes anterior"
                onClick={handlePrevMonth}
                className="w-9 h-9 rounded-lg bg-surface-container-lowest text-on-surface flex items-center justify-center shadow-sm hover:bg-surface-variant transition-colors"
                type="button"
              >
                <span className="material-symbols-outlined text-body-md">chevron_left</span>
              </button>
              <button
                aria-label="Mes siguiente"
                onClick={handleNextMonth}
                className="w-9 h-9 rounded-lg bg-surface-container-lowest text-on-surface flex items-center justify-center shadow-sm hover:bg-surface-variant transition-colors"
                type="button"
              >
                <span className="material-symbols-outlined text-body-md">chevron_right</span>
              </button>
            </div>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center font-label-md text-label-sm text-secondary font-bold uppercase mb-space-xs">
            <div>Lun</div>
            <div>Mar</div>
            <div>Mié</div>
            <div>Jue</div>
            <div>Vie</div>
            <div className="text-primary-container">Sáb</div>
            <div className="text-outline">Dom</div>
          </div>

          {/* Calendar Days Matrix */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-body-md font-body-md">
            {calendarCells.map((cell, idx) => {
              if (!cell.inCurrentMonth) {
                return (
                  <div
                    key={`${cell.dateStr}-${idx}`}
                    className="py-2 rounded text-outline-variant/60 font-light select-none"
                  >
                    {cell.day}
                  </div>
                );
              }

              const isDisabled = cell.isSunday || cell.isPast;
              const isSelected = cell.dateStr === selectedDate;

              if (isDisabled) {
                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    disabled
                    title={cell.isSunday ? 'Domingos cerrado' : 'Fecha pasada'}
                    className="py-2 rounded text-outline/40 bg-surface-container-high/50 cursor-not-allowed select-none"
                  >
                    {cell.day}
                  </button>
                );
              }

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => handleDaySelect(cell.dateStr, false)}
                  title={cell.isSaturday ? 'Sábados atención de 8:00 AM a 12:00 PM' : `Seleccionar ${cell.dateStr}`}
                  className={`py-2 rounded transition-all relative ${
                    isSelected
                      ? 'bg-primary-container text-on-primary font-bold shadow-md ring-2 ring-primary-container'
                      : 'bg-surface-container-lowest text-on-surface hover:bg-primary-fixed font-semibold'
                  }`}
                >
                  {cell.day}
                  {cell.isSaturday && (
                    <span
                      className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                        isSelected ? 'bg-on-primary' : 'bg-primary-container'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-space-sm pt-space-xs flex flex-wrap items-center justify-between gap-2 text-secondary border-t border-surface-variant/60">
            <span className="font-label-sm text-label-sm">
              Día seleccionado:{' '}
              <strong className="text-primary-container font-semibold">
                {formatReadableShortDate(selectedDate)}
              </strong>
            </span>
            <span className="font-label-sm text-label-sm text-primary-container font-bold whitespace-nowrap">
              Sábados: Hasta 12:00 PM • Domingos: Cerrado
            </span>
          </div>
        </div>

        {/* AVAILABLE HOURS IN 2 CLEAR SECTIONS */}
        <div className="space-y-space-md mb-space-lg">
          {/* Morning Slots */}
          <div>
            <div className="flex items-center justify-between mb-space-xs flex-wrap gap-1">
              <span className="font-label-md text-label-md uppercase text-on-surface font-semibold">
                Horarios en la Mañana
              </span>
              <span className="font-label-sm text-label-sm text-secondary font-medium whitespace-nowrap">
                (Lunes a Sábado - 8:00 AM a 12:00 PM)
              </span>
            </div>
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
              {MORNING_DEFAULT.map((slot) => {
                const status = getSlotStatus(slot);
                const isOccupied = status === 'occupied';
                const isDisabled = status === 'disabled' || isOccupied;
                const isSelected = selectedSlot === slot && status === 'available';

                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      setErrorAlert(null);
                      setSelectedSlot(slot);
                    }}
                    title={
                      isOccupied
                        ? 'Horario ocupado - Reservado por otro paciente'
                        : isDisabled
                        ? 'Horario no disponible'
                        : `Seleccionar ${slot}`
                    }
                    className={`px-3.5 py-2.5 rounded-lg font-body-md text-body-md text-center transition-all whitespace-nowrap ${
                      isOccupied
                        ? 'bg-surface-variant text-outline opacity-50 cursor-not-allowed line-through'
                        : isDisabled
                        ? 'bg-surface-variant/60 text-outline/60 opacity-50 cursor-not-allowed'
                        : isSelected
                        ? 'bg-primary-container text-on-primary font-semibold shadow-sm ring-2 ring-primary-container/40'
                        : 'bg-surface-container-low hover:bg-primary-fixed text-on-surface font-medium'
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Afternoon Slots */}
          <div>
            <div className="flex items-center justify-between mb-space-xs flex-wrap gap-1">
              <span className="font-label-md text-label-md uppercase text-on-surface font-semibold">
                Horarios en la Tarde
              </span>
              <span className="font-label-sm text-label-sm text-secondary font-medium whitespace-nowrap">
                (Lunes a Viernes - 2:00 PM a 5:00 PM)
              </span>
            </div>

            {isSelectedSaturday ? (
              <div className="p-3 rounded-lg bg-surface-container-low border border-surface-variant text-on-surface-variant font-body-md text-body-md flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[20px]">info</span>
                <span>
                  Los días <strong>sábados</strong> nuestra jornada de atención es continua únicamente en la mañana (08:00 AM a 12:00 PM).
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
                {AFTERNOON_DEFAULT.map((slot) => {
                  const status = getSlotStatus(slot);
                  const isOccupied = status === 'occupied';
                  const isDisabled = status === 'disabled' || isOccupied;
                  const isSelected = selectedSlot === slot && status === 'available';

                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        setErrorAlert(null);
                        setSelectedSlot(slot);
                      }}
                      title={
                        isOccupied
                          ? 'Horario ocupado - Reservado por otro paciente'
                          : isDisabled
                          ? 'Horario no disponible'
                          : `Seleccionar ${slot}`
                      }
                      className={`px-3.5 py-2.5 rounded-lg font-body-md text-body-md text-center transition-all whitespace-nowrap ${
                        isOccupied
                          ? 'bg-surface-variant text-outline opacity-50 cursor-not-allowed line-through'
                          : isDisabled
                          ? 'bg-surface-variant/60 text-outline/60 opacity-50 cursor-not-allowed'
                          : isSelected
                          ? 'bg-primary-container text-on-primary font-semibold shadow-sm ring-2 ring-primary-container/40'
                          : 'bg-surface-container-low hover:bg-primary-fixed text-on-surface font-medium'
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Leyenda de estados de horario */}
          <div className="flex flex-wrap items-center gap-4 pt-1 text-label-sm font-label-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-primary-container inline-block"></span>
              Seleccionado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-surface-container-low border border-outline-variant inline-block"></span>
              Disponible
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-surface-variant inline-block"></span>
              <span className="line-through">Ocupado / No disponible</span>
            </span>
            {isLoadingSlots && (
              <span className="text-primary-container font-semibold ml-auto animate-pulse">
                Sincronizando agenda...
              </span>
            )}
          </div>
        </div>

        {/* Alerta de Colisión HTTP 409 o Validación */}
        {errorAlert && (
          <div
            role="alert"
            className={`mb-space-md p-4 rounded-xl border flex items-start gap-3 ${
              errorAlert.type === 'conflict'
                ? 'bg-error-container/90 border-error text-on-error-container'
                : 'bg-tertiary-fixed border-tertiary text-on-tertiary-fixed'
            }`}
          >
            <span className="material-symbols-outlined shrink-0 mt-0.5">
              {errorAlert.type === 'conflict' ? 'warning' : 'error'}
            </span>
            <div className="text-body-md font-body-md">
              <p className="font-bold uppercase text-label-md mb-0.5">
                {errorAlert.type === 'conflict'
                  ? 'Horario recién reservado por otro paciente'
                  : 'Verifica los datos de tu cita'}
              </p>
              <p>{errorAlert.message}</p>
            </div>
          </div>
        )}

        {/* Patient inputs row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md mb-space-lg">
          <div>
            <label
              htmlFor="patient-name"
              className="block font-label-md text-label-md uppercase text-on-surface font-semibold mb-space-xs"
            >
              Nombre Completo
            </label>
            <input
              id="patient-name"
              type="text"
              required
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Ej. Mariana Gómez"
              className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md px-4 py-3 rounded-lg border border-[#D4D0C5] focus:outline-none focus:ring-2 focus:ring-primary-container transition-all"
            />
          </div>
          <div>
            <label
              htmlFor="patient-phone"
              className="block font-label-md text-label-md uppercase text-on-surface font-semibold mb-space-xs"
            >
              Teléfono / WhatsApp
            </label>
            <input
              id="patient-phone"
              type="tel"
              required
              value={patientPhone}
              onChange={(e) => setPatientPhone(e.target.value)}
              placeholder="Ej. 300 000 0000"
              className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md px-4 py-3 rounded-lg border border-[#D4D0C5] focus:outline-none focus:ring-2 focus:ring-primary-container transition-all"
            />
          </div>
        </div>

        {/* Full Width Confirmation CTA Button */}
        <button
          id="btn-submit-agenda"
          type="submit"
          disabled={isSubmitting || !selectedSlot}
          className="w-full bg-primary-container hover:bg-primary disabled:opacity-60 disabled:cursor-not-allowed text-on-primary font-title-md text-label-md py-4 rounded-lg tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-space-sm whitespace-nowrap cursor-pointer"
        >
          <span className="material-symbols-outlined text-title-md">
            {isSubmitting ? 'hourglass_top' : 'check_circle'}
          </span>
          <span>{isSubmitting ? 'VERIFICANDO Y AGENDANDO CITA...' : 'AGENDAR CITA'}</span>
        </button>

        <p className="text-center font-body-md text-body-md text-secondary mt-space-sm">
          ✓ Confirmación inmediata y comprobante PDF + WhatsApp al +57 {SITE_CONFIG.phoneDisplay}
        </p>
      </form>

      {/* ==========================================================================
          MODAL / POP-UP DE CITA AGENDADA CON ÉXITO (z-[1000])
         ========================================================================== */}
      {confirmedBooking && (
        <div
          className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-booking-title"
        >
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl border border-[#E2DFD7] p-6 sm:p-8 my-auto text-on-surface">
            {/* Botón Cerrar (X) en esquina superior derecha */}
            <button
              type="button"
              onClick={handleCloseModal}
              aria-label="Cerrar ventana de confirmación"
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-surface-container hover:bg-surface-variant text-on-surface flex items-center justify-center transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>

            {/* A. Encabezado de Éxito */}
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-16 h-16 rounded-full bg-[#E6F4EA] text-[#107C41] flex items-center justify-center mb-3 shadow-sm">
                <span
                  className="material-symbols-outlined text-[42px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              </div>

              <span className="inline-flex items-center gap-1.5 bg-primary-fixed text-primary px-3.5 py-1 rounded-full font-label-md text-label-md uppercase font-bold tracking-wider mb-2">
                Código de Reserva: {confirmedBooking.bookingId}
              </span>

              <h3
                id="modal-booking-title"
                className="font-headline-lg-mobile sm:font-headline-lg text-headline-lg-mobile sm:text-headline-lg uppercase text-on-surface leading-tight"
              >
                ¡TU CITA HA SIDO AGENDADA CON ÉXITO!
              </h3>
            </div>

            {/* Tarjeta Resumen de la Cita (Datos obligatorios visibles) */}
            <div className="bg-surface-container-low rounded-xl p-4 sm:p-5 border border-[#E2DFD7] space-y-2.5 text-body-md font-body-md mb-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-surface-variant/70">
                <span className="text-secondary font-semibold uppercase text-label-sm">Clínica:</span>
                <span className="font-bold text-primary-container">{confirmedBooking.clinicName}</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-surface-variant/70">
                <span className="text-secondary font-semibold uppercase text-label-sm">Paciente:</span>
                <span className="font-semibold text-on-surface">{confirmedBooking.patientName}</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-surface-variant/70">
                <span className="text-secondary font-semibold uppercase text-label-sm">Teléfono:</span>
                <span className="font-semibold text-on-surface">{confirmedBooking.patientPhone}</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-surface-variant/70">
                <span className="text-secondary font-semibold uppercase text-label-sm">
                  Especialidad / Tratamiento:
                </span>
                <span className="font-semibold text-on-surface sm:text-right">{confirmedBooking.treatment}</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-surface-variant/70">
                <span className="text-secondary font-semibold uppercase text-label-sm">Día de la Cita:</span>
                <span className="font-bold text-on-surface">{confirmedBooking.dateFormatted}</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-surface-variant/70">
                <span className="text-secondary font-semibold uppercase text-label-sm">Hora de la Cita:</span>
                <span className="font-bold text-primary-container">{confirmedBooking.timeSlot}</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-2 border-b border-surface-variant/70">
                <span className="text-secondary font-semibold uppercase text-label-sm">Dirección:</span>
                <span className="font-semibold text-on-surface">{confirmedBooking.address}</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
                <span className="text-secondary font-semibold uppercase text-label-sm">Barrio / Municipio:</span>
                <span className="font-semibold text-on-surface sm:text-right">
                  {confirmedBooking.neighborhood} • {confirmedBooking.city}
                </span>
              </div>
            </div>

            {/* Nota informativa */}
            <div className="flex items-center justify-center gap-2 bg-primary-fixed/50 text-primary px-4 py-2.5 rounded-lg mb-5 text-center">
              <span className="material-symbols-outlined text-[18px] shrink-0">schedule</span>
              <p className="font-body-md text-label-md font-semibold">
                Por favor llegar 10 minutos antes de la hora agendada.
              </p>
            </div>

            {/* B. Los 2 Botones de Acción Principales dentro del Modal */}
            <div className="flex flex-col gap-3">
              {/* Botón 1: IMPRIMIR / DESCARGAR CITA EN PDF */}
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="w-full py-3.5 px-5 rounded-lg border-2 border-primary-container bg-surface-container-lowest hover:bg-primary-fixed/40 text-primary-container font-title-md text-label-md font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                <span>IMPRIMIR / DESCARGAR CITA EN PDF</span>
              </button>

              {/* Botón 2: ENVIAR INFORMACIÓN DE LA CITA A WHATSAPP */}
              <a
                href={getWhatsAppConfirmationUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 px-5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white font-title-md text-label-md font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2.5 shadow-md no-underline"
              >
                <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                </svg>
                <span>ENVIAR INFORMACIÓN DE LA CITA A WHATSAPP</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
