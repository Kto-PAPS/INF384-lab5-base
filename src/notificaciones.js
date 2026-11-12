const net = require('net');

// Rangos internos o reservados. BlockList es nativo de Node y también evalúa
// las direcciones IPv4 mapeadas en IPv6 (::ffff:127.0.0.1) contra las reglas IPv4.
const INTERNAS = new net.BlockList();
INTERNAS.addSubnet('0.0.0.0', 8, 'ipv4');
INTERNAS.addSubnet('10.0.0.0', 8, 'ipv4');
INTERNAS.addSubnet('100.64.0.0', 10, 'ipv4');
INTERNAS.addSubnet('127.0.0.0', 8, 'ipv4');
INTERNAS.addSubnet('169.254.0.0', 16, 'ipv4');
INTERNAS.addSubnet('172.16.0.0', 12, 'ipv4');
INTERNAS.addSubnet('192.168.0.0', 16, 'ipv4');
INTERNAS.addAddress('::', 'ipv6');
INTERNAS.addAddress('::1', 'ipv6');
INTERNAS.addSubnet('fc00::', 7, 'ipv6');
INTERNAS.addSubnet('fe80::', 10, 'ipv6');

function esDireccionInterna(host) {
  const version = net.isIP(host);
  if (version === 0) return false;
  return INTERNAS.check(host, version === 4 ? 'ipv4' : 'ipv6');
}

const comercios = new Map();

function validarUrlNotificacion(valor) {
  let url;
  try {
    url = new URL(valor);
  } catch (e) {
    return { ok: false, error: 'url invalida' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: 'solo https' };
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost') {
    return { ok: false, error: 'destino interno' };
  }
  if (esDireccionInterna(host)) {
    return { ok: false, error: 'destino interno' };
  }
  return { ok: true, url: url.toString() };
}

function registrarComercio(comercio, urlNotificacion) {
  const resultado = validarUrlNotificacion(urlNotificacion);
  if (!resultado.ok) return resultado;
  comercios.set(comercio, resultado.url);
  return { ok: true, comercio, url: resultado.url };
}

function urlDeComercio(comercio) {
  return comercios.get(comercio) || null;
}

module.exports = { validarUrlNotificacion, registrarComercio, urlDeComercio };