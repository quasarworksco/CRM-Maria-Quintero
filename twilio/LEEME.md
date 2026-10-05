# Teléfono integrado con Twilio — cómo activarlo

Con esto las agentes llaman desde la computadora con audífonos, dentro del CRM. Al colgar se guardan solos la **duración**, la **agente**, la **hora** y si **contestaron o no**; el resultado (Interesado, Cita, Venta…) lo elige la agente. Con clientes 787/939 se llama desde el número de **Puerto Rico**; con los demás, desde el **407**. Las agentes solo pueden llamar de **10:30 a. m. a 7:30 p. m. (hora de Miami)**; la administración y la supervisión, a cualquier hora.

Mientras tanto puedes ver todo el flujo en **Panel de administración → Conexiones → Teléfono → Modo: Demostración** (simula las llamadas, no llama de verdad).

> **Nunca** pegues el Auth Token ni el secreto de la API Key en el chat, en el CRM ni en GitHub. Solo van en las variables de entorno de Twilio (paso 5).

---

## 1. Cuenta y registro del negocio
1. Crea la cuenta en **twilio.com** y presiona **Upgrade** (agrega tarjeta y recarga automática).
2. En **Trust Hub** registra el perfil del negocio y activa **SHAKEN/STIR**, **CNAM** y **Voice Integrity**, para que las llamadas no salgan como "posible spam".
3. En **Voice → Settings → Geo permissions** deja activados solo **Estados Unidos y Puerto Rico**.

## 2. Comprar los números
**Phone Numbers → Manage → Buy a number**:
- País **United States**, código de área **407**, con **Voice**.
- País **Puerto Rico**, código **787**, con **Voice**.

Anota ambos en formato `+14071234567` y `+17871234567`.

## 3. Crear la API Key
**Account → API keys & tokens → Create API key** (tipo *Standard*), con el nombre `crm-telefono`.
Copia el **SID** (empieza con `SK…`) y el **Secret**. El secreto se muestra **una sola vez**: pégalo directamente en el paso 5.

## 4. Crear el servicio de funciones
**Functions and Assets → Services → Create Service**, con el nombre `crm-telefono`.

Agrega una función por cada archivo de la carpeta `twilio/functions/` de este proyecto (botón **Add → Add Function**). Pon la ruta y la visibilidad así, pega el código y guarda:

| Ruta | Archivo | Visibilidad |
|---|---|---|
| `/auth` | `auth.private.js` | **Private** |
| `/token` | `token.js` | **Public** |
| `/call-result` | `call-result.js` | **Public** |
| `/voice` | `voice.protected.js` | **Protected** |
| `/voicemail` | `voicemail.protected.js` | **Protected** |
| `/notice` | `notice.protected.js` | **Protected** |

`/token` y `/call-result` son públicas porque las llama el navegador, pero solo responden a personas con sesión activa en el CRM (lo verifican con Firebase). Las *Protected* solo las puede usar Twilio.

En **Settings → Dependencies** no hace falta agregar nada.

## 5. Variables de entorno
En el servicio, abre **Settings → Environment Variables**:
- Marca **"Add my Twilio Credentials (ACCOUNT_SID) and (AUTH_TOKEN) to ENV"**.
- Agrega las variables del archivo `.env.example`:

| Variable | Valor |
|---|---|
| `API_KEY_SID` | el `SK…` del paso 3 |
| `API_KEY_SECRET` | el secreto del paso 3 |
| `TWIML_APP_SID` | se completa en el paso 6 |
| `NUMBER_FL` | el número 407, por ejemplo `+14071234567` |
| `NUMBER_PR` | el número 787 |
| `FIREBASE_PROJECT_ID` | `crm-maria-8f7af` |
| `OWNER_EMAIL` | `inventusmq@gmail.com` |
| `ALLOWED_ORIGIN` | `https://crmsystempb.dgp-link.com` |
| `COMPANY_NAME` | `Maria Quintero` |
| `CALL_HOURS` | `10:30-19:30` |
| `CALL_TZ` | `America/New_York` |
| `RECORD_CALLS` | `false` (o `true` para grabar; se avisa a quien contesta) |
| `INBOUND_IDENTITIES` | quiénes reciben llamadas entrantes (ver paso 9) |

Presiona **Deploy All**. Copia la dirección del servicio, que se ve como `https://crm-telefono-1234.twil.io`.

## 6. Crear la TwiML App
**Voice → Manage → TwiML apps → Create new TwiML App**, con el nombre `CRM`:
- **Voice Request URL**: `https://crm-telefono-1234.twil.io/voice` (método POST).
- Guarda y copia el **SID** (empieza con `AP…`).

Vuelve a las variables de entorno del paso 5, pega el SID en `TWIML_APP_SID` y presiona **Deploy All** otra vez.

## 7. Llamadas entrantes a los números
En **Phone Numbers → Manage → Active numbers**, abre cada número (el 407 y el 787) y en **Voice Configuration → A call comes in** elige **Function → crm-telefono → /voice**. Guarda.

## 8. Conectar el CRM
En el CRM, como administradora: **Panel de administración → Conexiones → Teléfono integrado**:
1. En **Modo**, elige **Twilio**.
2. Pega la dirección del paso 5 (`https://crm-telefono-1234.twil.io`) y presiona **Guardar**.
3. Presiona **Probar conexión**. Debe decir "Conectado como …" y mostrar los dos números.

## 9. (Opcional) Quiénes reciben las llamadas entrantes
Cada persona puede presionar **Probar conexión** (o te lo dice la administración): aparece "Conectado como `us_xxxx.a`". En `INBOUND_IDENTITIES` escribe la parte **antes del punto**, separando a varias personas con comas (por ejemplo `us_abc123,us_def456`), y presiona **Deploy All**. Si nadie contesta en 25 segundos, o es fuera de horario, la llamada va al **buzón de voz**. Los mensajes quedan en **Monitor → Logs → Call recordings**.

## 10. Probar
1. Entra al CRM con una cuenta de agente, en Chrome o Edge, con los audífonos conectados.
2. Ve a **Modo llamadas → Llamar**. La primera vez el navegador pide permiso para usar el micrófono: acepta.
3. Al colgar:
   - Si **no contestaron**, se registra "No contestó" solo y pasa al siguiente cliente.
   - Si **contestaron**, el CRM pide el resultado. La duración ya viene puesta.

### Alternativa con la línea de comandos (para quien sepa usarla)
```bash
npm install -g twilio-cli
twilio plugins:install @twilio-labs/plugin-serverless
cd twilio && cp .env.example .env   # completa los valores
twilio login
twilio serverless:deploy
```
Los nombres de los archivos ya indican la visibilidad (`.private.js`, `.protected.js`).

## Problemas frecuentes
- **"Sesión no válida"**: recarga el CRM y vuelve a entrar.
- **"Tu usuario no tiene permiso para llamar"**: la persona no tiene el permiso de *Prospectos* (Panel de administración → Usuarios → Permisos).
- **"Fuera del horario de llamadas"**: es una agente intentando llamar fuera de 10:30 a. m. – 7:30 p. m. (hora de Miami).
- **No se escucha**: revisa el permiso del micrófono en el candado de la barra de direcciones y que los audífonos estén elegidos como entrada y salida en el sistema.
- **Las llamadas aparecen como spam**: completa el paso 1.2 (Trust Hub).
