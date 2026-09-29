# Puesta en producción de Nexo Escolar

## Estado actual

El servidor `testsv` expone HTTP en 8014 mediante `docker-compose.server.yml`. No cargar padrones reales ni anunciar disponibilidad continua mientras siga siendo un único equipo. Los discos actuales no forman un RAID y la interfaz física negocia 100 Mb/s.

## Requisitos previos

**Punto de partida para cotizaciones, sujeto a prueba de carga:** para 500 escuelas de 300–600 alumnos, presupuestar dos nodos de aplicación de 16 núcleos y 64 GiB RAM, PostgreSQL en un equipo de 16 núcleos y 128 GiB RAM con SSD NVMe en espejo, y una réplica en otra ubicación. Para 1.000 escuelas, aumentar nodos y base según métricas medidas. Para 10.000, dividir escuelas entre varias instalaciones con bases independientes; no dimensionar una sola máquina para ese objetivo. Incluir UPS, enlaces redundantes, repuestos y copias externas en el presupuesto.

1. Registrar un dominio y apuntarlo a la IP pública; verificar desde fuera que llegan 80 y 443. Retirar el override `docker-compose.server.yml`, usar `Caddyfile` y configurar `NEXO_DOMAIN`, `DJANGO_ALLOWED_HOSTS` y `DJANGO_CSRF_TRUSTED_ORIGINS` para el dominio. Verificar redirección HTTPS, certificado, cookies `Secure` y `python manage.py check --deploy` sin advertencias.
2. Contratar o montar un segundo equipo en otra ubicación, UPS, segundo enlace y un destino externo para copias cifradas. Definir responsables y procedimiento de conmutación. La réplica de PostgreSQL requiere un diseño y ensayo aparte; una copia diaria no es conmutación automática.
3. Configurar `restic` y `RESTIC_REPOSITORY`/`RESTIC_PASSWORD_FILE` para un destino aprobado, inicializarlo una vez, ejecutar `deploy/backup-offsite.sh` tras cada volcado local y alertar ante fallos. No guardar la contraseña de restic dentro de este repositorio ni solo en el servidor principal.
4. Ejecutar `deploy/health-check.sh` en el servidor para comprobar `/healthz/` y la edad del volcado local, y comprobar `https://<dominio>/healthz/` desde un monitor externo. Supervisar también espacio, CPU, RAM, errores HTTP, PostgreSQL, vencimiento TLS y edad del último respaldo externo.
5. Ensayar `deploy/backup-restore-check.sh` con una copia externa descargada en un entorno aislado. Registrar duración y verificar objetivos RPO de 24 horas y RTO de 4 horas.

## Lanzamiento comercial

Las altas nuevas muestran un abono promocional durante 12 meses desde la aprobación y el valor cotizado para renovar. La fecha concreta se comunica al aprobar el alta, antes de registrar el pago. El alta por autoservicio tiene importe cero; capacitación y migración asistidas se cotizan aparte. Las suscripciones preexistentes conservan su importe mientras no haya un ajuste programado.

No vender primaria todavía. Antes de 500 secundarias, probar con datos sintéticos equivalentes a 150.000–300.000 alumnos y medir concurrencia, tiempos de respuesta, tamaño de base, tráfico y horas de soporte. Repetir restauración y conmutación; presupuestar el déficit de los primeros 12 meses de cada alta.
