import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.argv[3];
  if (!email || !password || password.length < 8) {
    throw new Error("Usage: npm run user:set-password -- user@example.com 'new-password-of-8+-characters'");
  }
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!existing) throw new Error(`No existing user has email ${email}.`);
  await prisma.user.update({
    where: { id: existing.id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`Password updated for ${existing.name} (${email}).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
