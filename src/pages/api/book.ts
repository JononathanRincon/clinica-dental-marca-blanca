import type { APIRoute } from 'astro';
import { createAtomicBooking, SlotConflictError, ValidationError } from '../../lib/google';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();

    const confirmation = await createAtomicBooking({
      date: body.date,
      timeSlot: body.timeSlot,
      patientName: body.patientName,
      patientPhone: body.patientPhone,
      treatment: body.treatment,
    });

    return new Response(JSON.stringify(confirmation), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof SlotConflictError) {
      return new Response(
        JSON.stringify({
          error:
            'Lo sentimos, otro paciente acaba de reservar este horario hace unos segundos. Por favor selecciona otra hora disponible.',
          code: 'SLOT_CONFLICT',
        }),
        {
          status: 409,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );
    }

    if (error instanceof ValidationError) {
      return new Response(
        JSON.stringify({
          error: error.message,
          code: 'VALIDATION_ERROR',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );
    }

    console.error('[CLINICA] Error procesando reserva:', error);
    return new Response(
      JSON.stringify({
        error: 'Ocurrió un error inesperado al procesar la reserva. Por favor intenta nuevamente.',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      }
    );
  }
};
