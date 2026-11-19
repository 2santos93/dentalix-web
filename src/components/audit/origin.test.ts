import { deviceLabel, ipLabel, originLabel } from './origin';

const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const WIN_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0';

describe('origen legible', () => {
  it('navegador · sistema a partir del User-Agent', () => {
    expect(deviceLabel(MAC_CHROME)).toBe('Chrome · macOS');
    expect(deviceLabel(WIN_EDGE)).toBe('Edge · Windows');
    expect(deviceLabel(IPHONE_SAFARI)).toBe('Safari · iPhone');
    expect(deviceLabel(ANDROID_FIREFOX)).toBe('Firefox · Android');
    expect(deviceLabel('Mozilla/5.0 (iPad)')).toBe('iPad');
    expect(deviceLabel('un-bot/1.0')).toBeNull();
    expect(deviceLabel(null)).toBeNull();
  });

  it('DX-582: la etiqueta que ya resume el servidor se pinta igual que la del navegador', () => {
    expect(deviceLabel('Chrome en macOS')).toBe('Chrome · macOS');
    expect(deviceLabel('Safari en iOS')).toBe('Safari · iOS');
    expect(deviceLabel('Firefox')).toBe('Firefox');
    expect(deviceLabel('Linux')).toBe('Linux');
    expect(deviceLabel('Dispositivo desconocido')).toBeNull();
    expect(originLabel('190.202.15.0/24', 'Edge en Windows')).toEqual({
      device: 'Edge · Windows',
      ip: '190.202.15.0/24',
      userAgent: 'Edge en Windows',
    });
    expect(originLabel(null, 'Dispositivo desconocido').device).toBe('Dispositivo desconocido');
    // Un texto que solo se le parece no es una etiqueta del servidor.
    expect(deviceLabel('Opera en macOS')).toBe('Opera');
  });

  it('el loopback es este equipo; sin IP lo dice', () => {
    expect(ipLabel('::1')).toBe('Este equipo (local)');
    expect(ipLabel('127.0.0.1')).toBe('Este equipo (local)');
    expect(ipLabel('::ffff:127.0.0.1')).toBe('Este equipo (local)');
    expect(ipLabel('127.0.0.0/24')).toBe('Este equipo (local)');
    expect(ipLabel('203.0.113.7')).toBe('203.0.113.7');
    expect(ipLabel(null)).toBe('Sin IP');
  });

  it('un User-Agent ilegible no se pinta crudo, pero se conserva para el tooltip', () => {
    expect(originLabel('203.0.113.7', 'un-bot/1.0')).toEqual({
      device: 'Dispositivo desconocido',
      ip: '203.0.113.7',
      userAgent: 'un-bot/1.0',
    });
    expect(originLabel(null, null)).toEqual({ device: null, ip: 'Sin IP', userAgent: null });
  });
});
