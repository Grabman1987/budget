/** Suggests a device name from the user agent, e.g. "iPhone". Falls back to "Dieses Gerät". */
export function guessDeviceName(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/Android/i.test(userAgent)) return 'Android-Gerät';
  if (/Windows/i.test(userAgent)) return 'Windows-PC';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac';
  if (/CrOS/i.test(userAgent)) return 'Chromebook';
  if (/Linux/i.test(userAgent)) return 'Linux-PC';
  return 'Dieses Gerät';
}

export const defaultDeviceName = () =>
  guessDeviceName(typeof navigator === 'undefined' ? '' : navigator.userAgent);
