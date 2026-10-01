# CRM Maria Quintero

CRM de ventas para un negocio de filtros de aire, purificadores y productos para el hogar, con un equipo de agentes que llaman y prospectan todo el día.

Está hecho en HTML, CSS y JavaScript puro, sin instalar nada. La versión en línea empieza vacía; la demo sin conexión (`?local=1`) trae datos de ejemplo para explorarlo.

## En línea

- CRM (en línea, con login): https://crmsystempb.dgp-link.com/
- Demo con datos de ejemplo (sin conexión, sin login): https://crmsystempb.dgp-link.com/?local=1
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
| **Inicio** | Tablero con ventas, recaudo, cartera, llamadas, meta del mes, embudo por etapas, seguimientos del día, próximas citas y ranking del equipo. La agente ve sus propios números. |
| **Modo llamadas** | Cola de marcación priorizada (vencidos → hoy → citas por confirmar → nuevos → reintentos → olvidados), guion con el nombre del cliente, cronómetro, resultados con atajos de teclado 1–9, "Guardar y siguiente", meta diaria. |
| **Agenda y tareas** | "Mis pendientes": cada próximo seguimiento aparece como tarea ("Llamar a…") junto con las tareas, por fecha y hora; y las próximas citas. |
| **Clientes y prospectos** | Lista con búsqueda, filtros rápidos (sin contactar, vencidos, olvidados, con saldo…), acciones masivas (asignar, cambiar etapa, exportar, eliminar), importación desde Excel/CSV con reparto automático entre agentes y detección de duplicados. |
| **Ficha del cliente** | Etapas con color (azul Nuevo/Intentando · verde Contactado · morado Citas · amarillo Demo · fucsia Venta · rojo Perdido), **Historial de contacto** con el contador **Intentos de contacto: X/12** y cada intento con número, fecha, hora, agente, resultado y comentario (automáticos); a los 12 intentos sin contacto pasa sola a Perdido / Sin respuesta y queda archivada. Fuente con **Referido por** o **Nombre del evento**, cita (fecha, hora, dirección y quién hace la demostración), notas, ventas, saldo, tareas y archivos. |
| **Embudo de ventas** | Tablero Kanban por etapas: se arrastran las tarjetas; cada una muestra último resultado, intentos, cita y seguimiento. |
| **Reclutamiento** | Módulo aparte de ventas para candidatos (Indeed, referidos, Facebook, Instagram, Florida Mall, ferias…). Ficha con datos del puesto (idioma, vehículo, experiencia en ventas, fines de semana, fecha para comenzar), fuente con **Referido por** conectado a la persona que refiere (equipo, candidato o cliente), 12 etapas con color (de Nuevo candidato a Contratado), responsable, intentos de contacto X/12, entrevista (fecha, hora, lugar, entrevistador y notas), próximo seguimiento con fecha, hora y comentario, e historial con agente, fecha y hora. Lista, tablero por etapas, pendientes, importación CSV de Indeed y exportación. Los candidatos no se mezclan con clientes, embudo, búsqueda ni reportes de ventas. |
| **Ventas y pedidos** | Pedidos con varios productos, descuento, envío, impuesto, condiciones de pago, estado de entrega, abono inicial y recibo imprimible. Descuenta el inventario. |
| **Recaudo / Cartera** | Saldos pendientes con antigüedad (al día, 1–15, 16–30, 31–60, 60+ días), abonos, recordatorio de cobro por WhatsApp e historial de pagos por método. |
| **Productos** | Catálogo con imagen, SKU, precio, costo y margen (solo lo ve la admin), stock y alertas de stock bajo. |
| **Reportes** | Rendimiento por vendedor (llamadas, tasa de contacto, tiempo al teléfono, cotizaciones, ventas, recaudo, cierre, meta), llamadas por día, resultados, fuentes que más venden, quién trae referidos, productos más vendidos y motivos de pérdida. |
| **Panel de administración** | Usuarios y roles, metas por persona, "ver como" otro usuario, transferir cartera, repartir prospectos, configuración del negocio (moneda, fuentes, motivos de pérdida, categorías, guion), respaldo y restauración, borrar datos demo. |

## Roles

- **Administrador**: acceso total.
- **Supervisor**: ve todo el equipo, reasigna clientes y ve reportes.
- **Agente / Vendedor**: solo ve y trabaja sus propios clientes y los candidatos de reclutamiento que tiene asignados.

Cada persona entra con su correo y contraseña (Firebase Authentication). En la demo sin conexión (`?local=1`) el usuario se elige con el selector de arriba a la derecha.

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
js/recruit.js         ← reclutamiento: etapas, resultados y lógica de candidatos
js/views/*.js         ← una sección por archivo (recruit.js = Reclutamiento)
```

## Base de datos (Firestore)

El CRM guarda todo en **Firebase Firestore** (proyecto `crm-maria-8f7af`) y escucha los cambios en tiempo real: lo que registra una agente le aparece al resto del equipo al instante. También guarda una copia local, así que sigue funcionando si se cae el internet y sincroniza al volver.

- La base en línea empieza vacía (sin datos de ejemplo). Si encuentra datos de ejemplo de versiones anteriores (`demoData: true`), la administración los borra automáticamente una sola vez al entrar, conservando las cuentas y la configuración.
- Colecciones: `users`, `clients`, `activities`, `tasks`, `products`, `orders`, `payments`, `candidates` y `candidateActivities` (reclutamiento) y el documento `meta/settings`.
- Si las reglas publicadas todavía no incluyen `candidates`/`candidateActivities`, el CRM sigue funcionando y Reclutamiento muestra un aviso para publicarlas.
- Con `?local=1` en la dirección se abre la demo sin conexión, que guarda solo en el navegador.

## Ingreso y seguridad

- **Firebase Authentication** (correo y contraseña). La cuenta principal `inventusmq@gmail.com` (`CRM_CONFIG.ownerEmail`) siempre es administradora; su contraseña se creó con "Primer ingreso de la cuenta principal", enlace que ahora solo aparece abriendo el CRM con `?setup=1`. **Ninguna contraseña se guarda en el repositorio.**
- **Primer ingreso**: cada persona escribe una sola vez el nombre y apellido con el que atiende (`profileCompleted`).
- **Usuarios**: la administración los crea en Panel admin → Usuarios con correo y rol; la persona recibe un correo para crear su contraseña o una contraseña temporal. El rol y el estado se guardan en `access/{correo}`, que es lo que leen las reglas.
- **Reglas** (`firestore.rules`): solo entran personas con acceso activo; agentes solo leen y editan sus clientes, ventas y candidatos; supervisores todo el equipo; administración todo. Se copian en Firebase → Firestore → Reglas.
- **Consola de Firebase**: activar Authentication → Sign-in method → Correo/contraseña, y agregar `crmsystempb.dgp-link.com` en Authentication → Settings → Authorized domains.
