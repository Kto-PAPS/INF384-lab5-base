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
  # Vencimiento: 11/12/2026 (dd/mm/aaaa)
  # Control compensatorio: validar en el handler el token del servicio de autenticacion antes del vencimiento
  # Riesgo aceptado: sin autenticacion en la URL, cualquiera con el enlace puede invocar la API
  #checkov:skip=CKV_AWS_258:La app movil consume la URL directamente; excepcion hasta 11/12/2026
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
}
