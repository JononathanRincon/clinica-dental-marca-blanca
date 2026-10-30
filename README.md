# 🦷 Plantilla Web y Sistema de Agendamiento para Clínicas Odontológicas (Marca Blanca)

Solución web moderna, ultra-rápida y de alta conversión diseñada específicamente para **Clínicas Odontológicas, Consultorios Dentales y Especialistas en Salud Oral**. Construida con **Astro 5 + React 18 + Tailwind CSS**, con arquitectura serverless optimizada para despliegue en **Vercel** e integración nativa con **Google Calendar** y **Google Sheets**.

---

## ✨ Características Principales

- 📱 **Mobile-First & Alta Conversión:** Cabecera adaptativa, barra flotante de agendamiento rápido por WhatsApp, CTA directo a llamada telefónica y botón de reserva inmediata.
- 📅 **Motor de Agendamiento Interactivo:** Calendario mensual en tiempo real con selección de turnos (mañana y tarde), bloqueo de domingos y validaciones automáticas en zona horaria `America/Bogota` (UTC-5).
- ⚡ **Respaldo In-Memory Híbrido:** Si no se configuran credenciales de Google Cloud, el sistema activa automáticamente un motor en memoria que simula disponibilidad, colisiones atómicas (HTTP 409) y confirmaciones sin caídas.
- 📄 **Descarga Instantánea de Comprobante PDF:** Generación en cliente con `jsPDF` con código de reserva único, datos del paciente, indicaciones de consulta y dirección de la sede.
- 💬 **Confirmación Oficial por WhatsApp:** Generación de enlaces directos formateados con emojis y datos completos de la cita para confirmación en un clic.
- 🎨 **Marca Blanca 100% Configurable:** Toda la identidad de la clínica (nombre, dirección, teléfono, redes sociales, horarios y servicios) se gestiona de forma centralizada en un único archivo: `src/config/site.ts`.

---

## 🏢 Datos Predeterminados de la Plantilla

| Parámetro | Valor de Demostración |
| :--- | :--- |
| **Nombre de la Clínica** | Clínica Odontológica Santa Rita |
| **Dirección** | Calle 1 # 1 - 11, Santa Rita |
| **Línea Telefónica / WhatsApp** | `300 000 0000` (`+573000000000`) |
| **Horario de Atención** | Lunes a Viernes: 8:00 AM – 6:00 PM \| Sábados: 8:00 AM – 12:00 PM |
| **Logo e Icono** | Icono vectorial estilizado de diente sencillo y moderno |

---

## 🛠️ Stack Tecnológico

- **Framework Web:** [Astro 5](https://astro.build/) (Modo SSR / Serverless Adapter `@astrojs/vercel`)
- **UI & Componentes Interactivos:** [React 18](https://react.dev/) + TypeScript
- **Estilos & Diseño:** [Tailwind CSS 3](https://tailwindcss.com/)
- **Procesamiento Gráfico:** [Sharp](https://sharp.pixelplumbing.com/) (Imágenes WebP ultra-optimizadas)
- **Documentos PDF:** [jsPDF 2.5](https://github.com/parallax/jsPDF)
- **Integraciones Opcionales:** Google Calendar API v3 & Google Sheets API v4

---

## 🚀 Instalación y Desarrollo Local

### 1. Clonar el repositorio
```bash
git clone https://github.com/JononathanRincon/clinica-dental-marca-blanca.git
cd clinica-dental-marca-blanca
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Ejecutar servidor de desarrollo
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:4321`.

### 4. Compilar para producción
```bash
npm run build
```

---

## ⚙️ Personalización de la Marca

Para adaptar esta plantilla a cualquier clínica dental:

1. Abre el archivo [`src/config/site.ts`](src/config/site.ts).
2. Modifica los campos:
   - `clinicName`: Nombre oficial de la clínica.
   - `address`: Dirección física de la sede.
   - `phoneDisplay` / `whatsappNumber`: Número celular o fijo.
   - `treatments`: Catálogo de servicios y precios orientativos.
   - `socialProfiles`: Enlaces a Instagram, TikTok, Facebook y WhatsApp.

---

## ☁️ Despliegue en Vercel

1. Haz push a tu repositorio en GitHub.
2. En tu dashboard de Vercel, selecciona **Add New Project** e importa el repositorio `clinica-dental-marca-blanca`.
3. Vercel detectará Astro automáticamente y configurará el build command `astro build`.
4. (Opcional) Agrega las variables de entorno para sincronizar con Google Calendar y Google Sheets.

---

## 📄 Licencia

Este proyecto es una plantilla de código abierto para desarrollos de salud y clínicas odontológicas.
