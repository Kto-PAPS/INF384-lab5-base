resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.proyecto}-api-${var.ambiente}"
  retention_in_days = 7
}

resource "aws_lambda_function" "api" {
  function_name = "${var.proyecto}-api-${var.ambiente}"
  role          = aws_iam_role.api.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.api.repository_url}:${var.version_imagen}"
  timeout       = 10
  memory_size   = 256
  reserved_concurrent_executions = 10

  environment {
    variables = {
      BUCKET_COMPROBANTES = aws_s3_bucket.comprobantes.bucket
    }
  }

  lifecycle {
    ignore_changes = [image_uri]
  }

  depends_on = [aws_cloudwatch_log_group.api]
}

resource "aws_lambda_function_url" "api" {
  # Excepcion CKV_AWS_258 - Decision 3 de DECISIONES.md
  # Responsable: Lider tecnico
  # Vencimiento: 2026-11-26 (aaaa-mm-dd)
  # Control compensatorio: limite de 10 ejecuciones concurrentes en aws_lambda_function.api, que acota abuso y enumeracion.
  #   La autenticacion de usuarios la resuelve un servicio externo segun el caso; no es verificable en este repositorio.
  # Riesgo aceptado: el handler no valida tokens; quien invoque la URL directamente puede llamar /saldo, /historial y /transferir.
  #checkov:skip=CKV_AWS_258:La app movil consume la URL directamente; excepcion hasta 2026-11-26
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
}
