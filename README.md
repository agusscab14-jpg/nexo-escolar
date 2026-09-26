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

| Cuenta | Correo | Alcance |
|---|---|---|
| Administración de plataforma | `admin@demo.edu` | Consola de instituciones y acceso de soporte |
| Directiva | `directivo@demo.edu` | Dos escuelas; sirve para probar el selector |
| Administrador escolar | `admin-demo-comun@demo.edu`, `admin-demo-tecnica@demo.edu` | Configuración de una escuela |
| Docente | `docente-demo-comun@demo.edu`, `docente-demo-tecnica@demo.edu` | Materias, talleres y asistencia asignados |
| Secretaría / preceptoría / biblioteca | `secretaria-*`, `preceptor-*`, `biblioteca-*` | Reemplazá `*` por `demo-comun` o `demo-tecnica` |
| Alumno / tutor | `alumno1-demo-comun@demo.edu`, `familia1-demo-comun@demo.edu` | Datos limitados al vínculo de la cuenta |

La administración de la plataforma tiene una consola independiente en [http://localhost:8014/plataforma/](http://localhost:8014/plataforma/). Al iniciar sesión con `admin@demo.edu`, la app redirige directamente a ese sitio.

Para volver a cargar datos de ejemplo, ejecutá de nuevo `python manage.py seed_demo`; el comando es idempotente para las entidades de demostración.

## Poner en marcha una escuela

1. Confirmá el plan de estudios, los talleres, los turnos, períodos, escalas de notas, reglas de asistencia y archivos de carga de la escuela. La jurisdicción queda editable; no hay integración automática con SInIDE.
2. Prepará un servidor con Docker Compose, nombre DNS estable y acceso HTTPS. Copiá `.env.example` a `.env`, configurá el dominio, generá secretos nuevos y completá el SMTP institucional. Usá contraseñas de base de datos hexadecimales para que funcionen sin codificación adicional en la URL.
3. Abrí los puertos 80/443 hacia Caddy y ejecutá `docker compose up -d --build`. Caddy solicitará y renovará el certificado TLS para el dominio configurado.
4. Creá la primera cuenta administradora de plataforma: `docker compose exec app python manage.py createsuperuser`. En `/plataforma/`, abrí **Cobros** y configurá los abonos Básico y Pro y el cargo de alta común antes de registrar escuelas de esos planes. Pro puede quedar sin configurar mientras se ofrecen altas Básicas.
5. Usá las plantillas descargables CSV/XLSX y revisá cada vista previa antes de confirmar una importación. Hacé primero un ensayo con datos ficticios.
6. Creá la escuela con el correo de su responsable y elegí Básico o Pro. Quedará en alta pendiente y se generarán los cargos de alta/capacitación y primer mes. Registrá las dos transferencias en **Cobros**; al confirmar la segunda, Nexo activa la escuela y envía la invitación. Los cambios de plan se programan desde la consola para el mes siguiente.
7. Antes de importar datos reales, revisá permisos con cada rol, la política institucional de privacidad, el acceso al servidor, el proceso de altas y bajas y la retención de datos.

La base PostgreSQL crea un rol de ejecución sin privilegios de propietario. Las migraciones se ejecutan con el rol de administración y los datos escolares tienen políticas RLS asociadas a la escuela activa guardada en la sesión. La app también comprueba escuela, membresía, rol y alcance de cada operación. Las escuelas en alta pendiente no pueden iniciar sesión; los pilotos preexistentes conservan su acceso. Los pagos se registran manualmente por transferencia: el sistema no hace débitos automáticos ni emite facturas fiscales. Los abonos del mes se generan desde la consola, los vencimientos se muestran para seguimiento y la suspensión o cancelación queda en manos de administración de plataforma.

Las escuelas Pro habilitan estadísticas académicas para administración escolar, dirección, secretaría y preceptoría. El tablero presenta medias simples de notas cargadas, aprobación según la escala de la escuela, distribución de calificaciones y evolución por período. Las notas faltantes se excluyen de los promedios.

## Copias y recuperación

Compose genera una copia PostgreSQL diaria en `./backups` y elimina las copias de más de 14 días. Protegé ese directorio con permisos del sistema y una copia fuera del servidor; las variables y credenciales no deben quedar en el repositorio. Probá una restauración en un servidor de ensayo antes de abrir el piloto y después de cada cambio de procedimiento. Ejemplo:

```bash
./deploy/backup-restore-check.sh backups/nexo-AAAAMMDD-HHMMSS.dump
```

El script restaura la copia en una base temporal y verifica que el esquema principal esté presente; la validación operativa del piloto también debe comprobar relaciones y una muestra de registros.

## Comandos útiles

```bash
python manage.py test
python manage.py check
python manage.py makemigrations --check --dry-run
```

Las pruebas locales corren con SQLite y verifican permisos por rol, suscripciones, activación después del pago, historial de transferencias, vínculos de tutores, calendario, boletines PDF, seguimiento académico, importaciones CSV/XLSX y devoluciones de biblioteca. La política RLS se activa únicamente con PostgreSQL; este entorno de desarrollo no incluye un servidor PostgreSQL para ejecutar una prueba integrada sobre esa base.

## Alcance y siguientes decisiones

La demo SQLite anterior (`school.db`) y sus usuarios no se migran. Los datos actuales de demostración se regeneran desde `seed_demo`. Para habilitar el piloto faltan decisiones propias de la institución: jurisdicción, reglas académicas, servidor y dominio, responsable de operación, correo, retención y procedimiento de respaldo/restauración. No se envían datos reales a SInIDE ni se presupone una API provincial disponible. La revisión de privacidad para datos de niñas, niños y adolescentes debe completarse antes de cargar padrones reales.
