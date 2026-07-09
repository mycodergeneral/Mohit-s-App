// Flag Guesser pool — ISO alpha-2 codes and country names.
// The flag emoji is derived from the code (regional indicator symbols),
// so no image assets are needed.
const COUNTRIES = [
  ['AR', 'Argentina'], ['AU', 'Australia'], ['AT', 'Austria'], ['BD', 'Bangladesh'],
  ['BE', 'Belgium'], ['BR', 'Brazil'], ['BG', 'Bulgaria'], ['CA', 'Canada'],
  ['CL', 'Chile'], ['CN', 'China'], ['CO', 'Colombia'], ['HR', 'Croatia'],
  ['CU', 'Cuba'], ['CZ', 'Czechia'], ['DK', 'Denmark'], ['EG', 'Egypt'],
  ['EE', 'Estonia'], ['ET', 'Ethiopia'], ['FI', 'Finland'], ['FR', 'France'],
  ['DE', 'Germany'], ['GH', 'Ghana'], ['GR', 'Greece'], ['HU', 'Hungary'],
  ['IS', 'Iceland'], ['IN', 'India'], ['ID', 'Indonesia'], ['IR', 'Iran'],
  ['IQ', 'Iraq'], ['IE', 'Ireland'], ['IL', 'Israel'], ['IT', 'Italy'],
  ['JM', 'Jamaica'], ['JP', 'Japan'], ['JO', 'Jordan'], ['KZ', 'Kazakhstan'],
  ['KE', 'Kenya'], ['KR', 'South Korea'], ['KW', 'Kuwait'], ['LV', 'Latvia'],
  ['LB', 'Lebanon'], ['LT', 'Lithuania'], ['LU', 'Luxembourg'], ['MY', 'Malaysia'],
  ['MV', 'Maldives'], ['MX', 'Mexico'], ['MC', 'Monaco'], ['MN', 'Mongolia'],
  ['MA', 'Morocco'], ['MM', 'Myanmar'], ['NP', 'Nepal'], ['NL', 'Netherlands'],
  ['NZ', 'New Zealand'], ['NG', 'Nigeria'], ['NO', 'Norway'], ['OM', 'Oman'],
  ['PK', 'Pakistan'], ['PA', 'Panama'], ['PE', 'Peru'], ['PH', 'Philippines'],
  ['PL', 'Poland'], ['PT', 'Portugal'], ['QA', 'Qatar'], ['RO', 'Romania'],
  ['RU', 'Russia'], ['SA', 'Saudi Arabia'], ['RS', 'Serbia'], ['SG', 'Singapore'],
  ['SK', 'Slovakia'], ['SI', 'Slovenia'], ['ZA', 'South Africa'], ['ES', 'Spain'],
  ['LK', 'Sri Lanka'], ['SE', 'Sweden'], ['CH', 'Switzerland'], ['TW', 'Taiwan'],
  ['TZ', 'Tanzania'], ['TH', 'Thailand'], ['TR', 'Turkey'], ['UA', 'Ukraine'],
  ['AE', 'United Arab Emirates'], ['GB', 'United Kingdom'], ['US', 'United States'],
  ['UY', 'Uruguay'], ['UZ', 'Uzbekistan'], ['VE', 'Venezuela'], ['VN', 'Vietnam'],
  ['ZW', 'Zimbabwe'], ['FJ', 'Fiji'], ['GE', 'Georgia'], ['DZ', 'Algeria'],
  ['AF', 'Afghanistan'], ['AL', 'Albania'], ['BT', 'Bhutan'], ['BO', 'Bolivia'],
  ['KH', 'Cambodia'], ['CM', 'Cameroon'], ['CR', 'Costa Rica'], ['CY', 'Cyprus'],
  ['DO', 'Dominican Republic'], ['EC', 'Ecuador'], ['SV', 'El Salvador'],
  ['GT', 'Guatemala'], ['HN', 'Honduras'], ['LA', 'Laos'], ['MT', 'Malta'],
  ['PY', 'Paraguay'], ['SN', 'Senegal'], ['TN', 'Tunisia'], ['UG', 'Uganda']
];

function codeToEmoji(code) {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

module.exports = { COUNTRIES, codeToEmoji };
