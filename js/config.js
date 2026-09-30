/* =========================================================
   Configuración de servicios externos
   ---------------------------------------------------------
   - Firebase / Firestore: base de datos (pendiente de conectar).
     Mientras `enabled` sea false, el CRM guarda todo en el
     navegador (localStorage) con el mismo modelo de colecciones.
   - Cloudinary: imágenes de productos y archivos de clientes.
     Requiere un "upload preset" UNSIGNED creado en Cloudinary
     (Settings > Upload > Upload presets).
   ========================================================= */
window.CRM_CONFIG = {
  firebase: {
    enabled: false,
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  },
  cloudinary: {
    cloudName: 'bzrjdfnu',
    uploadPreset: 'crmmaria',   // debe ser "Unsigned" en Cloudinary
    folder: 'crm-maria-quintero'
  }
};
