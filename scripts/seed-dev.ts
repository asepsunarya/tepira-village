/**
 * Seed data contoh untuk DEVELOPMENT LOKAL.
 * Jalankan: DATABASE_URL=postgresql://localhost/tepira_village_dev npm run seed:dev
 * Tidak dipakai di production — database produksi sudah berisi data tepira.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = process.env.DEV_LOGIN_EMAIL || "dev@tepira.local";

async function main() {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Asep Dev" }
  });
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);

  const existing = await prisma.goal.count({ where: { userId: user.id } });
  if (existing > 0) {
    console.log("Data sudah ada untuk", email, "- seed dilewati.");
    return;
  }

  const [bca, gopay, cash, cc] = await Promise.all([
    prisma.wallet.create({ data: { userId: user.id, name: "BCA", type: "bank", balance: 7_850_000, sortOrder: 0 } }),
    prisma.wallet.create({ data: { userId: user.id, name: "GoPay", type: "e-wallet", balance: 420_000, sortOrder: 1 } }),
    prisma.wallet.create({ data: { userId: user.id, name: "Dompet tunai", type: "cash", balance: 185_000, sortOrder: 2 } }),
    prisma.wallet.create({ data: { userId: user.id, name: "Kartu kredit", type: "credit", balance: 1_250_000, isDebt: true, sortOrder: 3 } })
  ]);

  // Dana darurat sengaja telat dari jadwal (rumput liar), Laptop lebih cepat (ada tukang).
  await prisma.goal.create({
    data: {
      userId: user.id,
      title: "Dana darurat",
      description: "3 bulan pengeluaran",
      targetAmount: 15_000_000,
      createdAt: ago(150),
      deadline: ago(-60),
      contributions: {
        create: [
          { amount: 2_000_000, note: "Sisa gaji", date: ago(70) },
          { amount: 1_500_000, note: "Bonus kecil", date: ago(40) },
          { amount: 250_000, note: "Teu pira", date: ago(12) },
          { amount: 100_000, note: "Sisa jajan", date: ago(3) }
        ]
      }
    }
  });
  await prisma.goal.create({
    data: {
      userId: user.id,
      title: "Laptop baru",
      targetAmount: 12_000_000,
      createdAt: ago(60),
      deadline: new Date(year + 1, 2, 1),
      contributions: { create: [{ amount: 9_600_000, note: "Tabungan lama", date: ago(20) }] }
    }
  });
  await prisma.goal.create({
    data: {
      userId: user.id,
      title: "Liburan ke Jogja",
      targetAmount: 3_000_000,
      contributions: {
        create: [
          { amount: 1_000_000, date: ago(60) },
          { amount: 2_000_000, note: "Lunas!", date: ago(15) }
        ]
      }
    }
  });
  await prisma.goal.create({
    data: { userId: user.id, title: "Sepeda", targetAmount: 4_500_000 }
  });

  await prisma.salary.create({
    data: {
      userId: user.id,
      amount: 9_000_000,
      month,
      year,
      totalExpenseAllocation: 6_500_000,
      savingsAllocation: 2_500_000,
      allocations: {
        create: [
          { category: "Makan harian", amount: 2_000_000 },
          { category: "Transport", amount: 800_000 },
          { category: "Pulsa & Internet", amount: 300_000 },
          { category: "Listrik / Air / Kos", amount: 1_800_000 },
          { category: "Langganan (Spotify, Netflix, dll)", amount: 150_000 },
          { category: "Kesehatan / Obat", amount: 200_000 },
          { category: "Sosial (sedekah / bantu keluarga)", amount: 400_000 },
          { category: "Nongkrong / jajan", amount: 550_000 },
          { category: "Belanja kecil", amount: 300_000 }
        ]
      }
    }
  });

  const expenses = [
    { amount: 35_000, category: "Makan harian", note: "Makan siang", walletId: gopay.id, days: 0 },
    { amount: 22_000, category: "Transport", note: "Ojek", walletId: gopay.id, days: 1 },
    { amount: 1_800_000, category: "Listrik / Air / Kos", note: "Kos bulan ini", walletId: bca.id, days: 2 },
    { amount: 54_900, category: "Langganan (Spotify, Netflix, dll)", note: "Spotify", walletId: cc.id, days: 3 },
    { amount: 120_000, category: "Nongkrong / jajan", note: "Kopi bareng teman", walletId: cash.id, days: 4 },
    { amount: 48_000, category: "Makan harian", note: "Makan malam", walletId: cash.id, days: 5 }
  ];
  for (const e of expenses) {
    const d = ago(e.days);
    if (d.getMonth() + 1 !== month) continue;
    await prisma.expense.create({
      data: { userId: user.id, amount: e.amount, category: e.category, note: e.note, source: "gaji", date: d, walletId: e.walletId }
    });
  }

  // Kebiasaan mencatat: jajan kecil hampir tiap hari supaya lampu streak & warga terlihat.
  // Hari ke-10 s.d. 16 lalu sengaja bolong, jadi ada dua deret (± 10 dan 14 hari → 3 warga).
  const habitDays = [6, 7, 8, 9, ...Array.from({ length: 14 }, (_, i) => 17 + i)];
  for (const days of habitDays) {
    await prisma.expense.create({
      data: {
        userId: user.id,
        amount: 12_000 + (days % 4) * 3_000,
        category: "Nongkrong / jajan",
        note: "Jajan sore",
        source: "gaji",
        date: ago(days),
        walletId: cash.id
      }
    });
  }

  // Surat mingguan minggu ini, bentuknya sama dengan cron /api/reports/weekly-insights di tepira.
  const wib = new Date(now.getTime() + 7 * 3_600_000);
  const mondayWib = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() - (wib.getUTCDay() || 7) + 1);
  const weekStart = new Date(mondayWib - 7 * 3_600_000);
  await prisma.weeklyFinancialInsight.create({
    data: {
      userId: user.id,
      weekStart,
      weekEnd: new Date(weekStart.getTime() + 7 * 86_400_000),
      month: new Date(mondayWib).getUTCMonth() + 1,
      year: new Date(mondayWib).getUTCFullYear(),
      healthScore: 78,
      status: "SEHAT",
      summary:
        "Cyrene melihat skor minggu ini 78/100 (SEHAT). Rasio tabungan 27.8%, disiplin budget 100%, runway sekitar 3.2 bulan, dan rasio kewajiban 13.9% dari pemasukan.",
      recommendations: [
        "Tabungan sudah cantik; pertahankan minimal 20% supaya masa depanmu makin aman.",
        "Budget masih disiplin. Jangan kasih celah ke pengeluaran impulsif kecil-kecil ya.",
        "Runway sudah nyaman. Berikutnya boleh fokus memperbesar goal penting.",
        "Kurangi kewajiban aktif dulu sebelum menambah goal baru yang agresif."
      ]
    }
  });

  console.log("Seed selesai untuk", email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
