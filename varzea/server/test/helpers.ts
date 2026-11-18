import request from "supertest";
import { createApp } from "../src/app.js";

export const app = createApp();
export const api = () => request(app);

let n = 0;
export async function newUser(overrides: Record<string, unknown> = {}) {
  n++;
  const body = {
    name: `Jogador ${n}`,
    email: `user${n}-${Date.now()}@teste.com`,
    password: "senha-segura",
    phone: `8198${String(Date.now()).slice(-5)}${n}`,
    ...overrides,
  };
  const res = await api().post("/api/auth/register").send(body);
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return { token: res.body.token as string, user: res.body.user, body };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
