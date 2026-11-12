const test = require('node:test');
const assert = require('node:assert');
const { validarUrlNotificacion, registrarComercio, urlDeComercio } = require('../src/notificaciones');

test('acepta una url publica https', () => {
  assert.strictEqual(validarUrlNotificacion('https://comercio.example.com/pagos').ok, true);
});

test('rechaza http', () => {
  assert.strictEqual(validarUrlNotificacion('http://comercio.example.com/pagos').ok, false);
});

test('rechaza una direccion privada', () => {
  assert.strictEqual(validarUrlNotificacion('https://10.0.0.8/pagos').ok, false);
  assert.strictEqual(validarUrlNotificacion('https://192.168.1.20/pagos').ok, false);
});

test('rechaza localhost', () => {
  assert.strictEqual(validarUrlNotificacion('https://localhost/pagos').ok, false);
  assert.strictEqual(validarUrlNotificacion('https://127.0.0.1/pagos').ok, false);
});

test('registra la url del comercio', () => {
  const r = registrarComercio('bodega-lucha', 'https://bodega.example.com/aviso');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(urlDeComercio('bodega-lucha'), 'https://bodega.example.com/aviso');
});

test('rechaza direcciones internas (CVE-2024-29415)', () => {
  const internas = [
    'https://127.0.0.1/pagos',
    'https://10.0.0.1/pagos',
    'https://192.168.1.1/pagos',
    'https://[::1]/pagos',
    'https://[::ffff:127.0.0.1]/pagos',
    'https://[::ffff:a9fe:a9fe]/pagos',
    'https://169.254.169.254/pagos',
  ];
  for (const url of internas) {
    assert.strictEqual(validarUrlNotificacion(url).ok, false, url);
  }
});

test('acepta urls publicas validas', () => {
  const publicas = [
    'https://comercio.example.com/pagos',
    'https://8.8.8.8/pagos',
    'https://1.1.1.1/pagos',
    'https://[2001:4860:4860::8888]/pagos',
  ];
  for (const url of publicas) {
    assert.strictEqual(validarUrlNotificacion(url).ok, true, url);
  }
});