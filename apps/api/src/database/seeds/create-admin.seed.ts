import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../../config/data-source';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';

async function run() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD env vars are required');
  }

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(User);

  const existing = await repo.findOne({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists, skipping.`);
    await AppDataSource.destroy();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = repo.create({
    email,
    passwordHash,
    fullName: 'Admin',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    emailVerified: true,
  });
  await repo.save(admin);
  console.log(`Admin ${email} created.`);
  await AppDataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
