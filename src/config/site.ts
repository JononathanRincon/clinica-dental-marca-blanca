export const SITE_CONFIG = {
  clinicName: 'Clínica Odontológica Santa Rita',
  shortName: 'Clínica Odontológica',
  subtitle: 'ODONTOLOGÍA INTEGRAL',
  tagline: 'Atención Garantizada',
  address: 'Calle 1 # 1 - 11',
  neighborhood: 'Santa Rita',
  city: 'Santa Rita',
  shortCity: 'Santa Rita',
  fullAddress: 'Calle 1 # 1 - 11, Santa Rita',
  phoneDisplay: '300 000 0000',
  phoneRaw: '+573000000000',
  phoneLocal: '3000000000',
  whatsappNumber: '573000000000',
  timezone: 'America/Bogota',
  rating: '4.9',
  reviewsCount: 85,
  links: {
    whatsappDirect:
      'https://api.whatsapp.com/send/?phone=573000000000&text=Hola,%20deseo%20agendar%20una%20cita%20odontol%C3%B3gica',
    phoneCall: 'tel:+573000000000',
    instagram: 'https://www.instagram.com',
    tiktok: 'https://www.tiktok.com',
    facebook: 'https://www.facebook.com',
    googleMaps: 'https://maps.google.com/?q=Calle+1+%23+1+-+11,+Santa+Rita',
  },
  socialProfiles: {
    instagram: {
      name: 'Instagram',
      handle: '@clinicadental',
      url: 'https://www.instagram.com',
    },
    tiktok: {
      name: 'TikTok',
      handle: 'Casos y Sonrisas',
      url: 'https://www.tiktok.com',
    },
    facebook: {
      name: 'Facebook',
      handle: 'Clínica Odontológica',
      url: 'https://www.facebook.com',
    },
    whatsapp: {
      name: 'WhatsApp Directo',
      handle: '300 000 0000',
      url: 'https://api.whatsapp.com/send/?phone=573000000000&text=Hola,%20deseo%20agendar%20una%20cita%20odontol%C3%B3gica',
    },
  },
  schedule: {
    weekdaysLabel: 'Lunes a Viernes: 8:00 AM – 6:00 PM',
    saturdayLabel: 'Sábados: 8:00 AM – 12:00 PM',
    sundayLabel: 'Domingos: Cerrado',
    morningSlots: ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM'],
    afternoonSlots: ['02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'],
  },
  treatments: [
    {
      id: 'general',
      label: 'Odontología General y Diagnóstico Inicial',
      shortTitle: 'Odontología General y Diagnóstico',
      icon: 'medical_services',
      priceTag: 'TARIFA: A COTIZAR / PRESUPUESTO PREVIO',
      description:
        'Atención especializada, valoración integral con cámaras intraorales y profilaxis ultrasónica profesional para mantener dientes y encías sanas.',
    },
    {
      id: 'estetica',
      label: 'Diseño de Sonrisa y Estética Dental',
      shortTitle: 'Diseño de Sonrisa y Estética Dental',
      icon: 'auto_awesome',
      priceTag: 'TARIFA: A COTIZAR / PRESUPUESTO PREVIO',
      description:
        'Blanqueamiento dental de alta potencia, carillas cerámicas y resinas de última generación para una sonrisa armónica, natural y radiante.',
    },
    {
      id: 'rehabilitacion',
      label: 'Rehabilitación Oral y Endodoncia',
      shortTitle: 'Rehabilitación Oral y Endodoncia',
      icon: 'healing',
      priceTag: 'TARIFA: A COTIZAR / PRESUPUESTO PREVIO',
      description:
        'Recuperación funcional y masticatoria de tus piezas dentales mediante prótesis fijas, implantes y tratamientos de conducto indoloros.',
    },
    {
      id: 'urgencia',
      label: 'Urgencia Odontológica Prioritaria',
      shortTitle: 'Urgencias Odontológicas y Control',
      icon: 'e911_emergency',
      priceTag: 'TARIFA: A COTIZAR / PRESUPUESTO PREVIO',
      description:
        'Atención prioritaria y calificada para dolor dental agudo, fracturas coronarias, abscesos o molestias imprevistas con resolución inmediata.',
    },
    {
      id: 'profilaxis',
      label: 'Limpieza y Profilaxis Ultrasónica',
      shortTitle: 'Limpieza y Profilaxis Ultrasónica',
      icon: 'dentistry',
      priceTag: 'TARIFA: A COTIZAR / PRESUPUESTO PREVIO',
      description:
        'Higiene profunda con ultrasonido, eliminación de cálculo dental, desmanchado y pulido coronal sin sensibilidad.',
    },
  ],
} as const;
