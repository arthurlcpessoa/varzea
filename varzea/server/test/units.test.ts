import { describe, expect, it } from "vitest";
import { drawTeams } from "../src/services/teamDraw.js";
import { buildBrCode, crc16 } from "../src/services/pix/brcode.js";
import { detectIntent } from "../src/services/bot/engine.js";

describe("sorteio de times", () => {
  const players = [
    { id: "gk1", skill: 4, position: "GOLEIRO", isGoalkeeper: true },
    { id: "gk2", skill: 3, position: "GOLEIRO", isGoalkeeper: true },
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      skill: (i % 5) + 1,
      position: ["DEFESA", "MEIO", "ATAQUE"][i % 3],
    })),
  ];

  it("coloca um goleiro em cada time e mantém os tamanhos iguais", () => {
    for (let run = 0; run < 50; run++) {
      const r = drawTeams(players);
      expect(r.A.length).toBe(7);
      expect(r.B.length).toBe(7);
      expect(r.A.includes("gk1")).not.toBe(r.A.includes("gk2"));
    }
  });

  it("equilibra o nível técnico", () => {
    for (let run = 0; run < 50; run++) {
      const r = drawTeams(players);
      expect(Math.abs(r.skillA - r.skillB)).toBeLessThanOrEqual(5);
    }
  });

  it("lida com número ímpar de jogadores", () => {
    const r = drawTeams(players.slice(0, 5));
    expect(Math.abs(r.A.length - r.B.length)).toBe(1);
  });
});

describe("Pix copia e cola", () => {
  it("calcula o CRC16 conforme o padrão (vetor conhecido)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("gera payload com valor, recebedor e CRC válido", () => {
    const code = buildBrCode({
      pixKey: "resenha@pix.com",
      merchantName: "Resenha Futebol Clube",
      merchantCity: "Recife",
      amountCents: 2500,
      txid: "VZ123",
    });
    expect(code).toContain("540525.00");
    expect(code).toContain("5921RESENHA FUTEBOL CLUBE");
    expect(code.slice(-4)).toBe(crc16(code.slice(0, -4)));
  });
});

describe("intenções do bot", () => {
  it.each([
    ["Vou!", "confirm"],
    ["1", "confirm"],
    ["tô dentro", "confirm"],
    ["Não vou", "decline"],
    ["2", "decline"],
    ["manda o pix", "pay"],
    ["quem vai? lista", "list"],
    ["onde é o jogo", "info"],
    ["bom dia", "help"],
  ])("%s → %s", (text, intent) => {
    expect(detectIntent(text)).toBe(intent);
  });
});
