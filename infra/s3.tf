resource "aws_s3_bucket" "comprobantes" {
  bucket = "${var.proyecto}-comprobantes-${var.ambiente}"
}

resource "aws_s3_bucket_public_access_block" "comprobantes" {
  bucket = aws_s3_bucket.comprobantes.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "conciliacion" {
  bucket = aws_s3_bucket.comprobantes.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "LecturaConciliacion"
      Effect = "Allow"
      Principal = {
        AWS = "arn:aws:iam::111122223333:role/conciliacion-lectura"
      }
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.comprobantes.arn}/*"
    }]
  })
}