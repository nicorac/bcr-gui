/**
 * Test if the given string contains a phone number.
 */
export function isPhoneNumber(phoneNumber?: string): boolean {
  phoneNumber = phoneNumber?.trim() ?? '';
  return phoneNumber.length !== 0 && !/[^\d\.\-\+ ]/g.test(phoneNumber);
}

/**
 * Cleanup the given phone number by keeping only "+" and digits.
 */
export function cleanupPhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/[^\d\+]/g, '');
}
