const BY_SLUG: Record<string, string> = { 'western-cape': 'Western Cape', gauteng: 'Gauteng', 'kwazulu-natal': 'KwaZulu-Natal', 'eastern-cape': 'Eastern Cape', 'free-state': 'Free State', limpopo: 'Limpopo', mpumalanga: 'Mpumalanga', 'north-west': 'North West', 'northern-cape': 'Northern Cape' };
const BY_CITY: Record<string, string> = { 'cape town': 'Western Cape', stellenbosch: 'Western Cape', george: 'Western Cape', johannesburg: 'Gauteng', pretoria: 'Gauteng', tshwane: 'Gauteng', ekurhuleni: 'Gauteng', durban: 'KwaZulu-Natal', pietermaritzburg: 'KwaZulu-Natal', gqeberha: 'Eastern Cape', 'east london': 'Eastern Cape', bloemfontein: 'Free State', polokwane: 'Limpopo', nelspruit: 'Mpumalanga', mbombela: 'Mpumalanga', kimberley: 'Northern Cape', rustenburg: 'North West' };
/** Province from the listing URL slug when present, otherwise from the city. Unknown cities give undefined, never a guess. */
export const provinceOf = (city?: string, url?: string) => {
  const slug = url?.match(/\/(western-cape|gauteng|kwazulu-natal|eastern-cape|free-state|limpopo|mpumalanga|north-west|northern-cape)(?:\/|$)/i)?.[1]?.toLowerCase();
  return (slug && BY_SLUG[slug]) || (city ? BY_CITY[city.toLowerCase()] : undefined);
};
