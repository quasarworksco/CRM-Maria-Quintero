/* =========================================================
   Configuración de servicios externos
   ---------------------------------------------------------
   - Firebase / Firestore: base de datos compartida en tiempo real.
     Con `enabled: false` (o abriendo la página con ?local=1) el CRM
     guarda todo en el navegador con el mismo modelo de colecciones.
     La configuración web de Firebase es pública por diseño: la
     seguridad la dan las reglas de Firestore (ver firestore.rules).
   - Cloudinary: imágenes de productos y archivos de clientes.
     Requiere un "upload preset" UNSIGNED creado en Cloudinary
     (Settings > Upload > Upload presets).
   ========================================================= */
window.CRM_CONFIG = {
  // Cuenta principal (dueña del CRM): siempre administradora, no se puede desactivar.
  // Con el login, será la cuenta desde la que se crean y administran los usuarios.
  // La contraseña NUNCA se guarda en el código: se escribe solo en la pantalla de inicio de sesión.
  ownerEmail: 'inventusmq@gmail.com',
  firebase: {
    enabled: true,
    apiKey: 'AIzaSyDomnn6WZU799SWznGt1ZN7NFl3c39DEmU',
    authDomain: 'crm-maria-8f7af.firebaseapp.com',
    projectId: 'crm-maria-8f7af',
    storageBucket: 'crm-maria-8f7af.firebasestorage.app',
    messagingSenderId: '334570619622',
    appId: '1:334570619622:web:d40596e789d85a672f3127'
  },
  cloudinary: {
    cloudName: 'bzrjdfnu',
    uploadPreset: 'crmmaria',   // debe ser "Unsigned" en Cloudinary
    folder: 'crm-maria-quintero'
  }
};
