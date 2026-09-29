# Preparación de Nexo para un piloto

Este documento registra controles técnicos y decisiones que debe confirmar cada escuela. No reemplaza una política de privacidad institucional ni una revisión normativa.

## Antes de cargar datos reales

### Transporte y acceso

- [ ] Habilitar HTTPS con un dominio institucional y cookies seguras, o definir un canal privado cifrado aprobado por la escuela.
- [ ] Hasta entonces, usar exclusivamente datos sintéticos. La configuración actual del servidor conserva HTTP en el puerto 8014 por decisión operativa.
- [ ] Identificar a las personas autorizadas para administración, soporte y operación.
- [ ] Acordar cómo se habilita, revisa y revoca cada cuenta cuando cambia el personal.
- [ ] Confirmar un contacto responsable para incidentes de acceso o exposición.

El acceso HTTPS del despliegue habitual está definido en el Caddyfile base. El despliegue actual usa Caddyfile.server y no se modifica automáticamente al editar el repositorio.

### Privacidad, conservación y bajas

La escuela debe acordar y dejar por escrito, antes de importar padrones reales:

- Qué información requiere cada flujo y para qué se usa; evitar campos que la escuela no necesite.
- Quién puede consultar, editar, exportar y corregir cada categoría de información.
- Cómo corregir registros, atender solicitudes de acceso y resolver datos duplicados.
- Cuánto tiempo se conserva la información académica, cuentas, solicitudes de alta, exportaciones y copias.
- Qué ocurre al egreso, traslado, baja de una cuenta o finalización del piloto.
- Quién puede autorizar una exportación o eliminación y cómo se registra su ejecución.
- Cómo se informa y gestiona un incidente de seguridad.

No se establece aquí un plazo legal de conservación: debe definirlo la escuela con su autoridad y asesoramiento correspondiente.

### Respaldo y recuperación

- [ ] Designar a quien recibe alertas por fallos y confirma que cada copia diaria terminó correctamente.
- [ ] Elegir una ubicación externa aprobada, con cifrado, acceso limitado y retención definida.
- [ ] Guardar por separado las instrucciones de recuperación y los responsables de aprobar una restauración.
- [ ] Ejecutar una restauración aislada antes del piloto y después de cambios en el procedimiento.
- [ ] Registrar fecha, resultado, duración y responsable de cada simulacro.

La tarea de respaldo elimina temporales incompletos al iniciar un ciclo, valida el archivo con pg_restore y lo publica mediante renombre atómico. El verificador de recuperación comprueba tablas, historial de migraciones, claves foráneas, relaciones entre escuela y registros y RLS en tablas principales. El arnés deploy/test-postgres.sh ejecuta un simulacro sintético en un proyecto Compose aislado; nunca apunta al proyecto de producción.

La copia externa y las alertas requieren elegir un destino y un canal institucionales; no hay un destino externo configurado por esta implementación.

## Confirmación de SInIDE

Nexo no implementa actualmente una conexión con SInIDE. Antes de diseñarla, consultar con dirección y la autoridad provincial:

1. Qué sistema, módulo y proceso usa la escuela.
2. Si el objetivo es importar, exportar o sincronizar, y en qué dirección.
3. Qué formato, API o canal oficial está habilitado para esa jurisdicción.
4. Qué autorización y ambiente de prueba se requieren, y quién es el contacto técnico.
5. Qué datos son obligatorios, cómo se identifican las personas y cómo se concilian cambios y duplicados.
6. Qué frecuencia, mensajes de error y responsable operativo se esperan.

La descripción nacional de SInIDE Gestión Escolar indica que las jurisdicciones parametrizan su uso. La Base Nacional Homologada contempla datos nominales de estudiantes; no se deben agregar identificadores ni campos por inferencia sin un requerimiento y autorización confirmados.

- [Ficha oficial de SInIDE Gestión Escolar](https://www.argentina.gob.ar/node/406949)
- [Ficha oficial de la Base Nacional Homologada](https://www.argentina.gob.ar/node/277754)

## Controles técnicos incluidos

- Límite de intentos fallidos de inicio de sesión: 60 por IP y 10 por correo normalizado o pareja IP/correo en una ventana de 15 minutos. Se conservan digests HMAC, no las direcciones originales.
- Recuperación de contraseña con respuesta uniforme para correos existentes y desconocidos.
- Caddy establece X-Forwarded-For con la dirección del cliente e ignora valores enviados por el cliente según su comportamiento predeterminado.
- Pruebas con PostgreSQL pueden asumir el rol nexo_app y comprobar que RLS oculte otras escuelas y rechace escrituras cruzadas.
- /healthz incluye una huella de la compilación para identificar la versión desplegada.
- deploy/backup-restore-check.sh verifica el contenido restaurado sin imprimir datos personales.

Las tablas escolares principales están forzadas a usar RLS. core_membership queda fuera de RLS porque un usuario puede pertenecer a varias escuelas y el inicio de sesión construye el selector de escuelas a partir de esas relaciones. Deben mantenerse acotadas por usuario y membresía las consultas que la leen; la prueba RLS actual cubre tablas escolares, no convierte a core_membership en una tabla aislada por escuela.

## Seguimiento de versión y frontend

El hash de compilación aparece en la respuesta de /healthz como release. Puede fijarse un identificador legible mediante NEXO_RELEASE durante la compilación. Este valor facilita comparar el código fuente con la imagen ejecutada, aunque no sustituye un registro de despliegues ni metadatos Git.

Django sirve el frontend desde core/templates/core/index.html y static/. Las copias app.js, styles.css e index.html en la raíz eran duplicados de la demo archivada en nexo-escolar/; se eliminaron para dejar una sola fuente activa. Las declaraciones JavaScript anteriores que estaban sustituidas por definiciones posteriores también se retiraron.


## Estado del servidor de prueba

El 28/09/2026 se activó la migración `0010_launch_pricing` y la nueva imagen de aplicación. El servidor conserva HTTP en el puerto 8014; todavía no cumple el requisito de HTTPS para datos reales. La copia previa a la migración está en `backups/nexo-pre-launch-20260928.dump` y su restauración fue verificada. Las suscripciones anteriores mantienen sus tarifas. La generación mensual de abonos se programó a las 10:15 UTC y la limpieza de solicitudes a las 10:25 UTC mediante el crontab del usuario `escuela`.
