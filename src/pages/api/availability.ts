import type { APIRoute } from 'astro';
import { getDayAvailability, getBogotaNow } from '../../lib/google';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date') || getBogotaNow().todayStr;

    const availability = await getDayAvailability(dateParam);

    return new Response(JSON.stringify(availability), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al consultar disponibilidad.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }
};
