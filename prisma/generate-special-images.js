const { PrismaClient } = require('@prisma/client');
const { generateCocktailImage } = require('../helpers');

const prisma = new PrismaClient();

async function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    force: args.has('--force') || args.has('--regenerate'),
    day: (args.has('--day') && process.argv[process.argv.findIndex((arg) => arg === '--day') + 1]) || null,
  };
}

function summarizeResult(results) {
  const summary = {
    total: 0,
    attempted: 0,
    generated: 0,
    skipped: 0,
  };
  for (const item of results) {
    summary.total += 1;
    if (item.skipped) summary.skipped += 1;
    else if (item.generated) summary.generated += 1;
    summary.attempted += item.attempted;
  }
  return summary;
}

async function main() {
  const { force, day } = await parseArgs();
  const targetDay = day ? String(day).trim().toUpperCase() : null;

  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY is not set; no images will be generated.');
  }

  const where = { isActive: true };
  if (targetDay) {
    where.dayTheme = { isActive: true, dayOfWeek: targetDay };
  }

  const specials = await prisma.dailySpecial.findMany({
    where,
    include: {
      dayTheme: {
        select: { dayOfWeek: true, name: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const candidateSpecials = force ? specials : specials.filter((s) => !s.imageUrl);
  const groupedByKey = new Map();
  const toGenerate = [];
  const now = new Date().toISOString();

  for (const special of candidateSpecials) {
    const key = `${(special.name || '').toLowerCase().trim()}|${(special.description || '').toLowerCase().trim()}|${(special.detailText || '').toLowerCase().trim()}`;
    if (!groupedByKey.has(key)) {
      groupedByKey.set(key, {
        key,
        name: special.name,
        description: special.description,
        detailText: special.detailText,
        category: special.category,
        section: special.section,
        ids: [special.id],
      });
      toGenerate.push(groupedByKey.get(key));
    } else {
      groupedByKey.get(key).ids.push(special.id);
    }
  }

  if (!toGenerate.length) {
    console.log('No specials needed image generation.');
    return;
  }

  const results = [];
  let generatedCount = 0;
  let failedCount = 0;

  for (const entry of toGenerate) {
    const payload = {
      name: entry.name,
      description: entry.description,
      detailText: entry.detailText,
      category: entry.category,
      section: entry.section,
    };

    if (!payload.name) {
      failedCount += 1;
      results.push({ attempted: 0, generated: 0, skipped: 1 });
      continue;
    }

    const imageUrl = await generateCocktailImage(payload);
    if (imageUrl) {
      await Promise.all(entry.ids.map((id) => (
        prisma.dailySpecial.update({ where: { id }, data: { imageUrl } }).catch(() => {})
      )));
      generatedCount += 1;
      results.push({ attempted: entry.ids.length, generated: 1, skipped: 0 });
    } else {
      failedCount += 1;
      results.push({ attempted: 0, generated: 0, skipped: entry.ids.length });
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  const summary = summarizeResult(results);
  const missing = targetDay ? ` for ${targetDay}` : '';
  console.log(`Image seeding complete${missing}.`);
  console.log(`  total active specials: ${specials.length}`);
  console.log(`  candidates considered: ${candidateSpecials.length}`);
  console.log(`  generated groups: ${generatedCount}`);
  console.log(`  failed groups: ${failedCount}`);
  console.log(`  updated rows: ${candidateSpecials.length > 0 ? candidateSpecials.length : 0}`);
  console.log(`  elapsed: ${new Date().toISOString()} (from ${now})`);
  console.log(`  summary: attempted=${summary.attempted}, generated=${summary.generated}, unchanged=${summary.unchanged}, skipped=${summary.skipped}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
