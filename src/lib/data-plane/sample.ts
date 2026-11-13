import "client-only";

/**
 * A small synthetic contact list for "Try a sample file". Every name, address
 * and number is made up (example.test domains, Ofcom/NANP drama ranges), and it
 * is built in the browser like any dropped file, so nothing is fetched.
 *
 * It is chosen to show every stage: exact and fuzzy duplicates, a phone match
 * across formats, a likely email typo, a malformed email and phone, an invalid
 * date, inconsistent capitalization and a contact with no email.
 */
export const SAMPLE_FILE_NAME = "sample-contacts.csv";

export const SAMPLE_CSV = [
  "First Name,Last Name,Email,Phone,Company,Signup Date",
  "Avery,Example,avery@example.test,+44 20 7946 0111,Example Widgets Ltd,2024-01-15",
  "avery,example,AVERY@EXAMPLE.TEST,,Example Widgets Ltd.,2024-01-15",
  "Robin,Sample,robin.sample@gmial.com,+44 20 7946 0000,Sample Holdings,2024-02-03",
  "Robin,Sample,,020 7946 0000,Sample Holdings,",
  "José,Núñez,jose@example.test,,Núñez y Asociados,2024-02-30",
  "Jose,Nunez,jose.n@example.test,,Nunez y Asociados,2024-03-12",
  "ZOË,MÜLLER,zoe@example.test,+49 30 1234567,Müller GmbH,2024-04-01",
  "Zoë,Müller,zoe.mueller@example.test,+49 30 1234567,Müller GmbH,",
  "Sam,Placeholder,sam@@example.test,555-CALL-NOW,ACME corp,2024-05-20",
  "Kai,Fictional,kai@example.test,+33 6 12 34 56 78,Acme Corp,2024-06-01",
  "Mira,Invented,,+81-3-1234-5678,Ünïcode Ltd,2024-06-18",
  "Lee,Madeup,lee@example.test,+33 1 23 45 67 89,Example Widgets Ltd,2024-07-07",
].join("\r\n");

/** The sample as a File, so it goes through exactly the same path as a dropped one. */
export function sampleFile(): File {
  return new File([SAMPLE_CSV], SAMPLE_FILE_NAME, { type: "text/csv" });
}
