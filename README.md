# CRM Maria Quintero

CRM de ventas para un negocio de filtros de aire, purificadores y productos para el hogar, con un equipo de agentes que llaman y prospectan todo el día.

Está hecho en HTML, CSS y JavaScript puro, sin instalar nada. Abre `index.html` en el navegador y listo. Trae datos de demostración para explorarlo.

## En línea

- CRM (demo): https://crmsystempb.dgp-link.com/
- Propuesta: https://crmsystempb.dgp-link.com/propuesta/
- Guía de uso: https://crmsystempb.dgp-link.com/guia/

Se publica con GitHub Pages desde la rama `main` (carpeta raíz). El archivo `CNAME` fija el dominio personalizado.

## Propuesta comercial

`propuesta/index.html` (se abre como `/propuesta` al publicar) es la cotización para la clienta: plan base de **$445 USD** con lo que incluye, el cronograma, los costos de servicios externos, preguntas frecuentes y los adicionales opcionales. El total se recalcula al marcar adicionales y la página se puede guardar como PDF.

## Guía de uso

`guia/index.html` explica cada sección del CRM de forma didáctica, con capturas reales (`guia/img/`), pasos numerados, consejos, glosario de conceptos, rutinas por rol, atajos y preguntas frecuentes. Si cambias una pantalla, conviene volver a tomar su captura.

## Módulos

| Módulo | Qué hace |
|---|---|
| **Inicio** | Tablero con ventas, recaudo, cartera, llamadas, meta del mes, embudo, temperatura de prospectos, seguimientos del día, prospectos calientes y ranking del equipo. La agente ve sus propios números. |
| **Modo llamadas** | Cola de marcación priorizada (vencidos → hoy → calientes → nuevos → olvidados), guion con el nombre del cliente, cronómetro, resultados con atajos de teclado 1–8, "Guardar y siguiente", meta diaria. |
| **Agenda y tareas** | Seguimientos y tareas agrupados en vencidos / hoy / mañana / semana. |
| **Clientes y prospectos** | Lista con búsqueda, filtros rápidos (sin contactar, vencidos, olvidados, con saldo…), acciones masivas (asignar, cambiar etapa o temperatura, exportar, eliminar), importación desde Excel/CSV con reparto automático entre agentes y detección de duplicados. |
| **Ficha del cliente** | Barra de etapas, temperatura frío/tibio/caliente, puntaje del prospecto, registro de llamadas, WhatsApp, email, visitas y notas con reglas automáticas, historial completo, ventas, saldo, tareas y archivos (Cloudinary). |
| **Embudo de ventas** | Tablero Kanban: se arrastran las tarjetas entre etapas. Muestra valor y pronóstico por etapa. |
| **Ventas y pedidos** | Pedidos con varios productos, descuento, envío, impuesto, condiciones de pago, estado de entrega, abono inicial y recibo imprimible. Descuenta el inventario. |
| **Recaudo / Cartera** | Saldos pendientes con antigüedad (al día, 1–15, 16–30, 31–60, 60+ días), abonos, recordatorio de cobro por WhatsApp e historial de pagos por método. |
| **Productos** | Catálogo con imagen, SKU, precio, costo y margen (solo lo ve la admin), stock y alertas de stock bajo. |
| **Reportes** | Rendimiento por vendedor (llamadas, tasa de contacto, tiempo al teléfono, cotizaciones, ventas, recaudo, cierre, meta), llamadas por día, resultados, fuentes que más venden, productos más vendidos y motivos de pérdida. |
| **Panel de administración** | Usuarios y roles, metas por persona, "ver como" otro usuario, transferir cartera, repartir prospectos, configuración del negocio (moneda, fuentes, motivos de pérdida, categorías, guion), respaldo y restauración, borrar datos demo. |

## Roles

- **Administrador**: acceso total.
- **Supervisor**: ve todo el equipo, reasigna clientes y ve reportes.
- **Agente / Vendedor**: solo ve y trabaja sus propios clientes.

Mientras no exista el login, el usuario activo se elige en el selector de arriba a la derecha.

## Estructura

```
index.html
propuesta/index.html  ← cotización para la clienta
guia/index.html       ← guía de uso con capturas
css/styles.css
js/config.js          ← configuración de Firebase y Cloudinary
firestore.rules       ← reglas de seguridad de Firestore
js/utils.js           ← formatos, constantes (etapas, resultados de llamada…), íconos
js/store.js           ← capa de datos, permisos, lógica de negocio y datos demo
js/ui.js              ← modales, avisos, gráficos, subida a Cloudinary
js/metrics.js         ← cálculos de indicadores
js/app.js             ← menú, búsqueda global y navegación
js/views/*.js         ← una sección por archivo
```

## Base de datos (Firestore)

El CRM guarda todo en **Firebase Firestore** (proyecto `crm-maria-8f7af`) y escucha los cambios en tiempo real: lo que registra una agente le aparece al resto del equipo al instante. También guarda una copia local, así que sigue funcionando si se cae el internet y sincroniza al volver.

- La primera vez que se abre, carga los datos de ejemplo en la nube (una sola vez). Para empezar a usarlo de verdad: Panel admin → Datos → **Borrar todo y empezar de cero**.
- Colecciones: `users`, `clients`, `activities`, `tasks`, `products`, `orders`, `payments` y el documento `meta/settings`.
- Con `?local=1` en la dirección se abre la demo sin conexión, que guarda solo en el navegador.
- `firestore.rules` tiene las reglas **temporales** (abiertas solo para las colecciones del CRM y con fecha de vencimiento), que se usan mientras no haya login. Se copian en la consola de Firebase → Firestore → Reglas.

## Cuenta principal

`CRM_CONFIG.ownerEmail` (en `js/config.js`) es la cuenta dueña del CRM: siempre es administradora, no se puede desactivar ni cambiar de rol, y se conserva al borrar todo. Con el login será la cuenta desde la que se crean los usuarios. **La contraseña nunca se guarda en el repositorio.**

## Próximos pasos

1. **Login**: Firebase Authentication con email y contraseña. `Store.currentUser()` pasa a leer el usuario autenticado, y las reglas de Firestore se cambian por reglas por usuario y rol que repliquen `Store.can()`.
