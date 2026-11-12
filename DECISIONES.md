# Decisiones · Laboratorio 5

## Equipo

Número de equipo: 6

| Código PUCP | Nombre | Rol | Usuario de GitHub |
|---|---|---|---|
| 20210888 | Piero Perezanelli | Moderador | Kto-PAPS |
| 20221943 | Lucas Alvites | Escriba | lalvitesg |
| 20206795 | Darwin Caceres | Abogado del diablo | Windar25 |
| 20221377 | Santiago Yábar | Guardián del tiempo | sy11219 |
| 20220867 | Mario Saico | Integrador | mSaico |

## A1 · Postmortem

### Resumen

El viernes 06/11 a las 17:55 se aplicó a producción un cambio en `infra/s3.tf` para que el proveedor de conciliación pudiera leer los comprobantes. El cambio desactivó los cuatro controles del bloqueo de acceso público del bucket y agregó una bucket policy con `Principal = "*"` y `s3:GetObject`. Con eso, cualquier persona en Internet podía descargar cualquier comprobante, y como los nombres de archivo son números correlativos, bastaba cambiar el número al final de la URL para obtener otro. El bucket estuvo público 63 horas y 25 minutos, hasta que on-call activó el bloqueo desde la consola de AWS el lunes 09/11 a las 09:20. El código de `infra/` no se corrigió y sigue con la configuración pública.

### Impacto

- Confidencialidad: los 41 300 comprobantes del bucket (origen, destino, monto y fecha de cada transferencia) quedaron expuestos públicamente durante 63 h 25 min (vie 06/11 17:55 a lun 09/11 09:20).
- Alcance desconocido: el bucket no tenía registros de acceso, así que no se puede saber cuántos comprobantes se descargaron ni quién los descargó. Se debe asumir que todos pudieron ser leídos.
- Exposición pública confirmada: al menos un comprobante de un cliente fue publicado en redes sociales por otro cliente.
- Negocio: el proveedor de conciliación perdió el acceso el lun 09/11 a las 09:25 y sigue sin acceso. El proveedor cobra S/ 15 000 por cada día sin acceso y exige recuperarlo hoy (12/11).
- Deriva de configuración: el estado real del bucket (bloqueado a mano) no coincide con `infra/`. El próximo `terraform apply` volvería a dejarlo público.

### Línea de tiempo

| Fecha y hora | Hecho |
|---|---|
| Jue 05/11 · 15:10 | El área comercial informa que el proveedor de conciliación debe leer los comprobantes desde el viernes 06/11, con penalidad por cada día de retraso. |
| Vie 06/11 · 09:30 | La tarea se asigna a un desarrollador backend que no había modificado `infra/` antes. La ingeniera de plataforma, única persona con experiencia en Terraform, está de vacaciones. |
| Vie 06/11 · 16:20 | El desarrollador pide al proveedor el ID de su cuenta de AWS para darle acceso específico. No recibe respuesta. |
| Vie 06/11 · 17:30 | El desarrollador pide revisión por chat. El líder técnico, en reunión, responde "dale, lo vemos el lunes". |
| Vie 06/11 · 17:42 | Commit `bd600fe` directo a `main` (sin branch protection ni pull request). El pipeline `ci` solo corre pruebas unitarias y pasa. |
| Vie 06/11 · 17:55 | `terraform apply` desde la laptop del desarrollador. **Inicio de la exposición.** El proveedor confirma que puede leer los comprobantes. |
| Lun 09/11 · 08:15 | Un cliente publica en redes sociales el link de un comprobante ajeno, obtenido cambiando el número de la URL. **Detección (externa).** |
| Lun 09/11 · 08:50 | Soporte escala a on-call por chat (35 min después de la publicación). |
| Lun 09/11 · 09:20 | On-call activa el bloqueo de acceso público desde la consola de AWS. **Fin de la exposición (63 h 25 min).** `infra/` no se modifica. |
| Lun 09/11 · 09:25 | El proveedor de conciliación pierde el acceso. |
| Lun 09/11 · 11:00 | El equipo busca registros de acceso al bucket para medir la descarga. No existen. |
| Mar 10/11 · 10:00 | Gerencia pide un informe del incidente y un plan para que no se repita. |
| Jue 12/11 · 16:40 | El proveedor exige acceso hoy y cobra S/ 15 000 por día sin acceso. Gerencia pide el nombre de quien hizo el cambio (ver A3). |

### Causas

1. **Pipeline: `ci` no analiza la infraestructura.** El workflow `.github/workflows/ci.yml` solo ejecuta pruebas unitarias. No corre ningún escáner de IaC sobre `infra/`. Checkov, sobre el mismo commit, reporta CKV_AWS_53, 54, 55, 56 y CKV_AWS_70 en el bucket: el cambio habría quedado detenido antes de llegar a `main`.
2. **Proceso: no hay revisión obligatoria antes de integrar.** `main` no tiene branch protection, así que se pudo hacer un commit directo sin pull request. La aprobación fue informal, por chat y diferida ("lo vemos el lunes"), y el cambio se aplicó igual porque nada en el proceso exigía la revisión antes de desplegar.
3. **Plataforma: el despliegue de infraestructura es manual y desde laptops.** `terraform apply` lo ejecuta quien hace el cambio, desde su máquina y con sus credenciales, sin pipeline de despliegue ni `plan` revisado. Nada separa "el código está en `main`" de "el cambio está en producción", ni registra quién aplicó qué.
4. **Plataforma: no hay guardas a nivel de cuenta ni monitoreo de configuración.** No existe S3 Block Public Access a nivel de cuenta ni una alerta ante buckets públicos (p. ej. AWS Config o Access Analyzer). Por eso la exposición se detectó por redes sociales y no por un sistema, tras más de 60 horas.
5. **Plataforma: falta de trazabilidad y diseño del dato.** El bucket no tiene access logging (CKV_AWS_18), así que no se puede medir el impacto. Los nombres correlativos de los comprobantes permiten enumerarlos con solo cambiar un número.
6. **Proceso / organización: concentración de conocimiento y presión de plazo.** Solo una persona del equipo conoce Terraform y estaba de vacaciones sin reemplazo designado. El plazo contractual con penalidad diaria llegó con menos de un día de aviso, y no había un camino definido para dar acceso entre cuentas a un tercero (el ID de la cuenta 111122223333 y el rol `conciliacion-lectura` no estaban disponibles), así que la solución disponible fue abrir el bucket con `Principal = "*"`.

### Qué funcionó y qué no funcionó

**Funcionó**

- Una vez escalado, on-call contuvo la exposición en 30 minutos gracias a su acceso a la consola de AWS.
- Soporte identificó el problema y lo escaló por el canal definido.
- El intento inicial de pedir el ID de la cuenta del proveedor fue el enfoque correcto (acceso por cuenta y rol, no público).

**No funcionó**

- La detección dependió de un cliente en redes sociales, no de un control propio.
- La revisión del cambio se postergó y el sistema permitió desplegarlo sin ella.
- El pipeline no tenía ningún control sobre `infra/`.
- La contención se hizo en la consola y no en el código: hay deriva entre `infra/` y producción, y el próximo `apply` reabriría el bucket.
- La contención cortó también el acceso legítimo del proveedor, sin plan para restaurarlo de forma segura. No había un mecanismo seguro de acceso para terceros ni un procedimiento de recuperación que considerara a la vez seguridad y continuidad.
- Sin registros de acceso no se puede dimensionar la fuga ni notificar con precisión a los afectados.

### Acciones

| Acción | Rol responsable | Fecha límite |
|---|---|---|
| Corregiremos `infra/s3.tf`: activaremos los cuatro controles del bloqueo de acceso público y eliminaremos la policy con `Principal = "*"`, para que el código coincida con lo que on-call aplicó a mano. | Desarrolladores backend (con revisión del líder técnico) | 12/11/2026 |
| Agregaremos el job `iac` con Checkov en `ci.yml` que bloquea los checks de exposición pública del bucket (CKV_AWS_53, 54, 55, 56, 70). | Desarrolladores backend | 12/11/2026 |
| Agregaremos el job `sca` con Trivy sobre `package-lock.json`. | Desarrolladores backend | 12/11/2026 |
| Activaremos branch protection en `main`: pull request obligatorio, una aprobación y los jobs `unit`, `iac` y `sca` como checks requeridos. | Líder técnico | 13/11/2026 |
| Restableceremos el acceso del proveedor con una bucket policy limitada a `arn:aws:iam::111122223333:role/conciliacion-lectura` y solo `s3:GetObject`, sin desactivar el bloqueo de acceso público. | Líder técnico (la ingeniera de plataforma vuelve recién el 14/11) | 12/11/2026 |
| Habilitaremos access logging del bucket de comprobantes y S3 Block Public Access a nivel de cuenta. | Ingeniera de plataforma | 16/11/2026 |
| Configuraremos una alerta (AWS Config / IAM Access Analyzer) que avise a on-call si un bucket queda público. | Ingeniera de plataforma | 20/11/2026 |
| Moveremos `terraform plan` y `terraform apply` a un pipeline con aprobación, y retiraremos las credenciales de despliegue de las laptops. | Ingeniera de plataforma | 30/11/2026 |
| Cambiaremos el nombre de los comprobantes de correlativo a un identificador no predecible (UUID) y serviremos las descargas con URLs prefirmadas de corta duración. | Desarrolladores backend | 30/11/2026 |
| Capacitaremos a los desarrolladores backend en Terraform y definiremos un reemplazo para la ingeniera de plataforma en sus ausencias. | Líder técnico | 30/11/2026 |
| Acordaremos con el área comercial que los pedidos con plazo contractual que toquen infraestructura pasen primero por el líder técnico, con al menos 3 días hábiles de aviso. | Líder técnico | 20/11/2026 |

### Datos del repositorio

- SHA del commit que introdujo el cambio: `bd600fe3307d5aa35bb3acbff8df91e0e02fcf35`
- Fecha y hora de ese commit: 06/11/2026, 17:42 (Hora Perú)
- Checks de Checkov que fallan sobre el bucket de comprobantes: 48 controles evaluados, 20 aprobados y 28 fallidos. Checks que fallan sobre el bloqueo público del bucket en infra/s3.tf, líneas 5–12:
  - CKV_AWS_53
  - CKV_AWS_54
  - CKV_AWS_55
  - CKV_AWS_56

## A2 · Decisiones

### Decisión 1 · Qué bloquea y qué informa

- Decisión:
  - Checkov (job `iac`) bloquea los checks de exposición pública del bucket de comprobantes: CKV_AWS_53, CKV_AWS_54, CKV_AWS_55, CKV_AWS_56 y CKV_AWS_70. Los demás hallazgos se informan en el log del run y quedan para tratamiento posterior.
  - Trivy (job `sca`) bloquea las vulnerabilidades de severidad HIGH y CRITICAL en las dependencias de `package-lock.json`. Los hallazgos actuales se corrigen actualizando o reemplazando las librerías (ver Decisión 2).
- Dato del repositorio que la sustenta:
  - Checkov sobre `infra/` en el repositorio base: 48 controles evaluados, 20 aprobados y 28 fallidos. Los cinco que bloquean son exactamente los que causaron el incidente: `aws_s3_bucket_public_access_block.comprobantes` (CKV_AWS_53, 54, 55, 56) y `aws_s3_bucket_policy.conciliacion` con `Principal = "*"` (CKV_AWS_70), ambos en `infra/s3.tf` desde el commit `bd600fe`.
  - Trivy sobre `package-lock.json` en el repositorio base: 3 vulnerabilidades HIGH y 0 CRITICAL. Son CVE-2024-29415 en `ip@2.0.1`, y CVE-2021-23337 y CVE-2026-4800 en `lodash@4.17.20`. Run: https://github.com/Kto-PAPS/INF384-lab5-base/actions/runs/43315459013
- Alternativa descartada y por qué: bloquear los 28 hallazgos de Checkov. La descartamos porque la mayoría son controles de endurecimiento (cifrado KMS, X-Ray, DLQ, replicación) que no causaron el incidente. Bloquearlos todos dejaría el pipeline en rojo de forma permanente, y el equipo terminaría ignorando el gate o desactivándolo.
- Posición en minoría (abogado del diablo): dejar checks como informativos normaliza ignorar alertas. Los atacantes reales no dependen de un solo fallo crítico: encadenan errores medios y bajos (por ejemplo, sin logs y sin cifrado), que con esta política el pipeline dejaría pasar.

### Decisión 2 · La vulnerabilidad sin versión corregida

- Decisión: reemplazar la librería `ip@2.0.1` por `net.BlockList`, que es nativo de Node.js, en `src/notificaciones.js`, función `validarUrlNotificacion`. Con esto la dependencia vulnerable desaparece de `package-lock.json` y no hace falta una excepción. Por separado, `lodash` se actualiza de 4.17.20 a 4.18.1, que corrige CVE-2021-23337 y CVE-2026-4800.
- Dato del repositorio que la sustenta:
  - CVE-2024-29415, librería `ip`, versión 2.0.1, sin versión corregida.
  - En el repositorio base se usa en `src/notificaciones.js`: `require('ip')` en la línea 2 y `ip.isPrivate(host)` en la línea 20, dentro de `validarUrlNotificacion` (línea 6). Es justamente la validación que impide que un comercio registre una URL de notificación interna (SSRF), así que la vulnerabilidad afecta un control de seguridad.
  - El reemplazo está en `main` (PR #6, `fix/dependencias`), con 16 pruebas en verde en el job `unit`.
- Alternativa descartada y por qué: mantener `ip@2.0.1` con una excepción en `.trivyignore`, o bloquear los despliegues hasta que exista una versión corregida. Descartamos la excepción porque no tiene fecha de salida (no hay parche anunciado) y deja abierto el riesgo de SSRF en la validación de URLs de comercios. Descartamos bloquear porque detendría todos los despliegues por tiempo indefinido, cuando el reemplazo con una API nativa es pequeño y se puede probar.
- Riesgo residual reconocido: la validación revisa la IP literal de la URL, pero no resuelve DNS ni sigue redirecciones. Un dominio público que resuelva a una IP interna, o una redirección hacia una, no quedan cubiertos.
- Posición en minoría (abogado del diablo): `net.BlockList` bloquea IPs directas, pero si la app no valida a qué IP resuelve un dominio después de una redirección, seguimos siendo vulnerables a SSRF por DNS rebinding. Reemplazar la librería no basta por sí solo.

### Decisión 3 · La Function URL sin autenticación

- Decisión: abrir una excepción temporal sobre CKV_AWS_258 en lugar de cambiar la autenticación a `AWS_IAM` de inmediato. La app móvil consume la Function URL directamente, y el servicio de autenticación de usuarios está fuera de este repositorio. La excepción está escrita en el recurso con `#checkov:skip=CKV_AWS_258` y sus cuatro datos:
  - Responsable: líder técnico.
  - Vencimiento: 26/11/2026.
  - Control compensatorio: `reserved_concurrent_executions = 10` en `aws_lambda_function.api`. Es limitado: acota el volumen de abuso, pero no impide el acceso indebido.
  - Riesgo aceptado: quien invoque la URL directamente puede llamar a `/saldo`, `/historial` y `/transferir` sin autorización, porque el handler no valida tokens.
- Dato del repositorio que la sustenta: CKV_AWS_258 ("Lambda function URLs AuthType is not None"), recurso `aws_lambda_function_url.api` en `infra/lambda.tf`, con `authorization_type = "NONE"` (líneas 28–38 en `main`).
- Alternativa descartada y por qué: cambiar de inmediato a `authorization_type = "AWS_IAM"` sin adaptar el mecanismo de acceso de la app. La descartamos porque la app móvil dejaría de funcionar para todos los usuarios: necesitaría firmar las solicitudes con SigV4 y obtener credenciales (por ejemplo, con Cognito), y ese cambio no se puede hacer ni probar desde este repositorio antes del vencimiento.
- Posición en minoría (abogado del diablo): el límite de 10 ejecuciones concurrentes evita facturas gigantes de AWS, pero facilita una denegación de servicio (DoS). A un atacante le basta enviar 10 peticiones simultáneas para saturar la Lambda y tumbar todas las notificaciones legítimas.

## A3 · Dato nuevo

Dato recibido el 12/11 a las 16:40: el proveedor de conciliación exige acceso hoy y cobra S/ 15 000 por cada día sin acceso. Gerencia pide el nombre de quien hizo el cambio para sancionarlo.

- Qué cambia en el postmortem:
  - Se incorpora el impacto económico y operativo. El proveedor exige recuperar el acceso a los comprobantes hoy y cobra S/ 15 000 por cada día sin acceso. Desde la pérdida de acceso (lun 09/11 · 09:25) ya van varios días de penalidad acumulada.
  - La contención del 09/11 eliminó la exposición pública, pero interrumpió el servicio de conciliación. Esto muestra que el equipo no tenía un mecanismo seguro de acceso para terceros ni un procedimiento de recuperación que considerara a la vez seguridad y continuidad operativa. Se agregó este punto en "Impacto", en "No funcionó" y en la línea de tiempo.
  - La acción de restablecer el acceso restringido del proveedor pasa de prioridad media a inmediata: su fecha límite cambia del 16/11 al 12/11.
- Qué cambia en las decisiones:
  - Se mantiene la decisión de bloquear el acceso público a S3: los checks CKV_AWS_53, 54, 55, 56 y 70 siguen bloqueando en el job `iac`. No se acepta volver a usar `Principal = "*"` ni abrir una excepción sobre esos checks, aunque haya presión económica.
  - Se prioriza configurar `s3:GetObject` solo para el rol `arn:aws:iam::111122223333:role/conciliacion-lectura`, verificar que esa política sea compatible con el bloqueo de acceso público (una policy con principal específico no es pública, así que pasa CKV_AWS_70) y coordinar una restauración controlada del servicio.
  - La urgencia aumenta la prioridad de esta corrección, pero no justifica desactivar los controles de seguridad.
- Respuesta del equipo al pedido recibido:
  - No entregamos un nombre para sancionar. El historial de Git permite identificar qué commit introdujo el cambio (`bd600fe`), pero el postmortem no atribuye la responsabilidad a una persona, y ese dato no basta para una sanción. La exposición fue posible por varias condiciones del sistema: no había revisión obligatoria, el CI no tenía controles sobre `infra/`, los despliegues eran manuales y no había monitoreo. Cualquier persona en el mismo rol y con las mismas condiciones podía haber llegado al mismo resultado, y sancionar a una persona no elimina ninguna de esas condiciones.
  - Entregamos a gerencia los hechos verificables (SHA, fechas, checks de Checkov, línea de tiempo) y el plan de acciones con roles responsables y fechas. La prioridad inmediata es restaurar hoy el acceso restringido del proveedor, sin reabrir el bucket al público.
  - Si gerencia considera necesario evaluar responsabilidades individuales, debe hacerse en un procedimiento separado del postmortem, considerando las circunstancias y la evidencia disponible.

## Parte B · Evidencia

| Evidencia | Link |
|---|---|
| Run fallido: el gate detiene el bucket público | Checkov (job `iac`): <https://github.com/Kto-PAPS/INF384-lab5-base/actions/runs/43310141946> |
| Run fallido: Trivy detiene las dependencias vulnerables | Trivy (job `sca`): <https://github.com/Kto-PAPS/INF384-lab5-base/actions/runs/43315459013> |
| Run en verde en `main` después de las correcciones | Jobs `unit`, `iac` y `sca` en verde: <https://github.com/Kto-PAPS/INF384-lab5-base/actions/runs/43317677015> |
| Pull requests del equipo | <https://github.com/Kto-PAPS/INF384-lab5-base/pulls?q=is%3Apr> |

### Observación pendiente

SonarQube Cloud reportó **Security Rating C** en el código nuevo del PR #5. Queda registrado como observación pendiente, a revisar después del laboratorio: SonarQube no forma parte de los tres jobs obligatorios del pipeline (`unit`, `iac` y `sca`) y no cambia la política de bloqueo de la Decisión 1.

## Declaración de uso de IA

Herramientas usadas y para qué se usó cada una:
- Se registra uso de IA: Claude Opus 5.5 Medium para ayudar en la detección de errores y redacción de este documento.
- Uso de ChatGPT para apoyo en l detección y análisis postmortem.
