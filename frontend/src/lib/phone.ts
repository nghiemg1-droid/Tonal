// Phone numbers in the international format the login service needs (E.164: +84912345678)

export const COUNTRIES = [
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+84', label: '🇻🇳 +84' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+61', label: '🇦🇺 +61' },
  { code: '+81', label: '🇯🇵 +81' },
  { code: '+82', label: '🇰🇷 +82' },
  { code: '+65', label: '🇸🇬 +65' },
  { code: '+49', label: '🇩🇪 +49' },
  { code: '+33', label: '🇫🇷 +33' },
]

// Returns "+<country><number>" or null if it doesn't look like a phone number
export function toE164(countryCode: string, input: string): string | null {
  let digits = input.replace(/\D/g, '')
  const country = countryCode.replace(/\D/g, '')
  if (input.trim().startsWith('+')) {
    // typed the full international number already
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }
  if (digits.startsWith(country) && digits.length > 10) digits = digits.slice(country.length)
  digits = digits.replace(/^0+/, '') // local format like 0912 345 678
  const full = country + digits
  return digits.length >= 6 && full.length <= 15 ? `+${full}` : null
}
