// Geração do "Pix copia e cola" (BR Code estático, padrão EMV do Banco Central).
// Permite cobrar sem depender de API bancária: o jogador paga pela chave do
// clube e o txid identifica a cobrança na conferência.

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), exigido pelo BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove acentos e caracteres fora do conjunto aceito pelo BR Code. */
function sanitize(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, "")
    .trim()
    .slice(0, max)
    .toUpperCase();
}

export interface BrCodeInput {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amountCents?: number;
  txid?: string;
  description?: string;
}

export function buildBrCode(input: BrCodeInput): string {
  const gui = field("00", "br.gov.bcb.pix");
  const key = field("01", input.pixKey.trim());
  const desc = input.description ? field("02", sanitize(input.description, 40)) : "";
  const account = field("26", gui + key + desc);

  const txid = (input.txid ?? "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  let payload =
    field("00", "01") +
    account +
    field("52", "0000") +
    field("53", "986") +
    (input.amountCents && input.amountCents > 0 ? field("54", (input.amountCents / 100).toFixed(2)) : "") +
    field("58", "BR") +
    field("59", sanitize(input.merchantName, 25) || "CLUBE") +
    field("60", sanitize(input.merchantCity, 15) || "BRASIL") +
    field("62", field("05", txid));

  payload += "6304";
  return payload + crc16(payload);
}
