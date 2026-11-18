import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Variável de ambiente ${name} não definida`);
  return value;
}

const isProduction = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT ?? 3333),
  isProduction,
  jwtSecret: required("JWT_SECRET", isProduction ? undefined : "dev-secret-varzea"),
  jwtExpiresIn: "7d",
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  whatsappProvider: process.env.WHATSAPP_PROVIDER ?? "console",
  pixProvider: process.env.PIX_PROVIDER ?? "manual",
};
