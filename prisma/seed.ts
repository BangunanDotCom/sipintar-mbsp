import { departments, districts } from "./reference-data.js";
import { db } from "../apps/api/src/core.js";
import {
  roles,
  permissions,
  templateCategories,
} from "../packages/shared/src/index.js";
export async function seed() {
  for (const [id, label] of Object.entries(roles)) {
    await db.role.upsert({
      where: { id },
      create: { id, label },
      update: { label },
    });
    await db.permission.deleteMany({ where: { roleId: id } });
    await db.permission.createMany({
      data: permissions[id as keyof typeof roles].map((action) => ({
        roleId: id,
        action,
      })),
    });
  }
  for (const [id, name] of Object.entries(districts))
    await db.district.upsert({
      where: { id },
      create: { id, name },
      update: { name },
    });
  for (const [id, name] of Object.entries(departments))
    await db.department.upsert({
      where: { id },
      create: { id, name },
      update: { name },
    });
  for (const category of templateCategories) {
    if (!(await db.templateDefinition.findFirst({ where: { category } })))
      await db.templateDefinition.create({
        data: { name: category, category },
      });
  }
}
if (process.argv[1]?.endsWith("seed.ts")) {
  await seed();
  await db.$disconnect();
}
