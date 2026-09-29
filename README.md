# Nexo Escolar

Nexo Escolar es una plataforma web adaptable para integrar la gestión de una escuela secundaria común o técnica. Incluye cursos, asistencia, calificaciones, boletines PDF por alumno, calendario escolar, avisos con confirmación de lectura, seguimiento académico, biblioteca, importaciones y registro de actividad. El modelo separa cada institución desde la primera versión.

## Desarrollo local

Se necesita Python 3.10 o posterior. Para un entorno de prueba local se usa SQLite; el despliegue con contenedores usa PostgreSQL 17.

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 0.0.0.0:8014
```

Abrí [http://localhost:8014](http://localhost:8014). `seed_demo` crea dos escuelas ficticias —una común y una técnica con talleres—, usuarios de ejemplo, inscripciones, notas, préstamos y avisos. Solo funciona con `DEBUG=1`. Todas las cuentas ficticias usan `demo123`; cambiá esas contraseñas si reutilizás la base local.

Para probar el envío real de correos desde el servidor local, copiá `.env.local.example` como `.env.local`, completá la dirección de Gmail y una contraseña de aplicación, y reiniciá `runserver`. El archivo `.env.local` queda fuera de Git y de la imagen Docker. Sin ese archivo, Django usa la consola y muestra allí los correos de recuperación.

| Cuenta | Correo | Alcance |
|---|---|---|
| Administración de plataforma | `admin@demo.edu` | Consola de instituciones y acceso de soporte |
| Directiva | `directivo@demo.edu` | Dos escuelas; sirve para probar el selector |
| Administrador escolar | `admin-demo-comun@demo.edu`, `admin-demo-tecnica@demo.edu` | Configuración de una escuela |
| Docente | `docente-demo-comun@demo.edu`, `docente-demo-tecnica@demo.edu` | Materias, talleres y asistencia asignados |
| Secretaría / preceptoría / biblioteca | `secretaria-*`, `preceptor-*`, `biblioteca-*` | Reemplazá `*` por `demo-comun` o `demo-tecnica` |
| Alumno / tutor | `alumno1-demo-comun@demo.edu`, `familia1-demo-comun@demo.edu` | Datos limitados al vínculo de la cuenta |

Sin SMTP configurado, en desarrollo Django imprime los correos en la terminal donde corre `runserver`. Para usar Gmail localmente, completá `.env.local` y reiniciá `runserver` para que tome la configuración; en producción, configurá el SMTP en `.env` (puerto 587 con `EMAIL_USE_TLS=1`, o puerto 465 con `EMAIL_USE_TLS=0` y `EMAIL_USE_SSL=1`). Los enlaces de invitación y recuperación vencen a las 24 horas.

La administración de la plataforma tiene una consola independiente en [http://localhost:8014/plataforma/](http://localhost:8014/plataforma/). Al iniciar sesión con `admin@demo.edu`, la app redirige directamente a ese sitio.

Para volver a cargar datos de ejemplo, ejecutá de nuevo `python manage.py seed_demo`; el comando es idempotente para las entidades de demostración.

## Poner en marcha una escuela

El lanzamiento comercial para secundarias usa dos planes mensuales por escuela: Básico ARS 15.000 y Pro ARS 20.000 durante 12 meses desde la aprobación del alta. Los importes de renovación cotizados son ARS 50.000 y ARS 80.000 respectivamente; cada solicitud conserva su cotización y recibe la fecha exacta antes del primer pago. El alta por autoservicio puede ser gratuita; capacitación y migración asistidas se presupuestan aparte. Las suscripciones anteriores a esta promoción conservan su tarifa hasta un ajuste programado. Ver [oferta comercial piloto](docs/oferta-comercial-piloto.md).

El código preparado no activa por sí solo HTTPS, copias externas ni alta disponibilidad. Para pasar del servidor HTTP actual a producción, seguí [puesta en producción](docs/production-rollout.md).

1. Confirmá el plan de estudios, los talleres, los turnos, períodos, escalas de notas, reglas de asistencia y archivos de carga de la escuela. La jurisdicción queda editable; no hay integración automática con SInIDE.
2. Prepará un servidor con Docker Compose, nombre DNS estable y acceso HTTPS. Copiá `.env.example` a `.env`, configurá el dominio, generá secretos nuevos y completá el SMTP institucional (`EMAIL_HOST`, `EMAIL_PORT`, credenciales y TLS o SSL). Usá contraseñas de base de datos hexadecimales para que funcionen sin codificación adicional en la URL.
3. Abrí los puertos 80/443 hacia Caddy y ejecutá `docker compose up -d --build`. Caddy solicitará y renovará el certificado TLS para el dominio configurado.
4. Creá la primera cuenta administradora de plataforma: `docker compose exec app python manage.py createsuperuser`. En `/plataforma/`, abrí **Cobros** y configurá los abonos Básico y Pro, sus precios de renovación y el cargo de alta (cero para autoservicio). Pro puede quedar sin configurar mientras se ofrecen altas Básicas.
5. Usá las plantillas descargables CSV/XLSX y revisá cada vista previa antes de confirmar una importación. Hacé primero un ensayo con datos ficticios.
6. Definí `NEXO_WHATSAPP_NUMBER` con el número de Nexo en formato internacional, solo dígitos (por ejemplo `5491112345678`), en `.env.local` para desarrollo o `.env` con Docker. El director inicia el registro desde “¿Dirigís una escuela? Registrala”, verifica su correo y conversa el alta por WhatsApp. En **Solicitudes**, revisá la conversación y aprobá el alta; esto crea la escuela pendiente y los cargos cotizados, y comunica el precio y fecha de renovación. Registrá el primer abono y, si corresponde, el cargo de alta en **Cobros**; al confirmar los pagos aplicables, Nexo activa la escuela e invita al director, que queda como `school_admin` y puede administrar la institución e invitar a su equipo.
7. Antes de importar datos reales, completá la lista de decisiones y controles de [preparación del piloto](docs/pilot-readiness.md). El servidor actual conserva HTTP en el puerto 8014; usá datos sintéticos hasta habilitar HTTPS o un canal privado cifrado.

La base PostgreSQL crea un rol de ejecución sin privilegios de propietario. Las migraciones se ejecutan con el rol de administración y las tablas escolares tienen políticas RLS asociadas a la escuela activa guardada en la sesión. core_membership queda fuera de RLS para permitir que una cuenta pertenezca a varias escuelas; sus consultas deben limitarse por usuario y membresía. La app también comprueba escuela, membresía, rol y alcance de cada operación. Las escuelas en alta pendiente no pueden iniciar sesión; los pilotos preexistentes conservan su acceso. Los pagos se registran manualmente por transferencia: el sistema no hace débitos automáticos ni emite facturas fiscales. Los abonos del mes se generan desde la consola, los vencimientos se muestran para seguimiento y la suspensión o cancelación queda en manos de administración de plataforma.

Las escuelas Pro habilitan estadísticas académicas para administración escolar, dirección, secretaría y preceptoría. El tablero presenta medias simples de notas cargadas, aprobación según la escala de la escuela, distribución de calificaciones y evolución por período. Las notas faltantes se excluyen de los promedios.

## Copias y recuperación

Compose genera una copia PostgreSQL diaria en `./backups` y elimina las copias de más de 14 días. Protegé ese directorio con permisos del sistema y una copia fuera del servidor; las variables y credenciales no deben quedar en el repositorio. Probá una restauración en un servidor de ensayo antes de abrir el piloto y después de cada cambio de procedimiento. Ejemplo:

```bash
./deploy/backup-restore-check.sh backups/nexo-AAAAMMDD-HHMMSS.dump
```

El script primero valida el archivo y luego lo restaura en una base temporal. Comprueba tablas, historial de migraciones, claves foráneas, relaciones entre escuelas y registros, y RLS forzada. Ejecutá el simulacro PostgreSQL aislado con ./deploy/test-postgres.sh.

## Comandos útiles

```bash
python manage.py test
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py purge_school_signup_requests
python manage.py generate_monthly_charges
./deploy/test-postgres.sh
```

Programá `purge_school_signup_requests` una vez al día en el servidor para eliminar las solicitudes vencidas. Las solicitudes sin verificar vencen en 24 horas; las verificadas vencen a los 14 días. Las cotizaciones duran 7 días; si vencen, Nexo confirma los nuevos importes por WhatsApp y actualiza la cotización antes de aprobar.

Programá también `generate_monthly_charges` diariamente al comenzar la jornada; el comando es idempotente y genera solo los abonos faltantes del mes actual. No lo actives antes de verificar la migración de precios y el acceso al SMTP y a PostgreSQL.

Las pruebas locales con SQLite cubren permisos por rol, autenticación, recuperación de contraseña, suscripciones, calendarios, boletines, importaciones y biblioteca. ./deploy/test-postgres.sh levanta una base desechable, comprueba las migraciones y permisos RLS con el rol nexo_app, ejecuta la suite y verifica la restauración de registros sintéticos.

## Alcance y siguientes decisiones

La demo SQLite anterior school.db y sus usuarios no se migran. Los datos actuales de demostración se regeneran desde seed_demo. Para habilitar el piloto faltan decisiones institucionales sobre jurisdicción, reglas académicas, responsables, correo, privacidad, conservación, bajas y recuperación. Antes de importar padrones reales, la escuela debe confirmar también con dirección o autoridad provincial qué uso de SInIDE requiere y qué formato o canal oficial autoriza; Nexo no presupone una API disponible. Ver [Preparación de Nexo para un piloto](docs/pilot-readiness.md).
