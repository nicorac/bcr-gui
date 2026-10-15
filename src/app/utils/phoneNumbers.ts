import { BcrGui } from '@plugins/bcrgui';

/**
 * Test if the given string contains a phone number.
 */
export function isPhoneNumber(phoneNumber?: string): boolean {
  phoneNumber = phoneNumber?.trim() ?? '';
  return phoneNumber.length !== 0 && !/[^\d\.\-\+ ]/g.test(phoneNumber);
}

/**
 * Test if the given string contains a phone number in E.164 format.
 */
export function isE164Number(phoneNumber?: string): boolean {
  return !!phoneNumber
    && phoneNumber.startsWith('+')
    && !(/\s-_\./.test(phoneNumber))
  ;
}

/**
 * Return the E.164 format of the given raw number by using Android native lib.
 * NOTE: no conversion is called if the input number already is an E.164 number.
 */
export async function getE164Number(rawNumber: string) {
  return isE164Number(rawNumber)
    ? rawNumber
    : (await BcrGui.formatNumberToE164({ number: rawNumber }))?.number ?? rawNumber;
}
