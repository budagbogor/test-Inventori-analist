import { InventoryRow } from '../types';

export const generateMockData = (): InventoryRow[] => {
  const brands = ['Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'Michelin', 'Bridgestone'];
  const categories = ['Tyre Related Products', 'Understeer', 'Engine Parts', 'Body Parts', 'Accessories', 'Oil & Lubricants'];
  const data: InventoryRow[] = [];

  for (let i = 1; i <= 200; i++) {
    const isOOS = Math.random() < 0.15; // 15% chance of being OOS
    const salesM1 = Math.floor(Math.random() * 50);
    const salesM2 = Math.floor(Math.random() * 60);
    const salesM3 = Math.floor(Math.random() * 40);
    
    // Some slow moving items intentionally built
    const isSlow = Math.random() < 0.05;
    const avgSales = isSlow ? Math.floor(Math.random() * 2) : Math.floor((salesM1 + salesM2 + salesM3) / 3);
    const spd = avgSales / 30;
    const spdMtd = isSlow ? spd / 2 : spd * (1 + Math.random() * 0.5);

    const goodStockDC = isSlow ? Math.floor(Math.random() * 500) + 100 : Math.floor(Math.random() * 100);
    const goodStockToko = isOOS ? 0 : (isSlow ? Math.floor(Math.random() * 200) + 50 : Math.floor(Math.random() * 50));
    
    // Some potential loss sales intentional buildup
    const isPotentialLoss = !isOOS && Math.random() < 0.08;
    const finalSpdMtd = isPotentialLoss ? Math.floor(Math.random() * 10) + 5 : spdMtd;
    const finalTokoStock = isPotentialLoss ? Math.floor(Math.random() * 3) + 1 : goodStockToko;

    data.push({
      SKU: `SKU-${Math.floor(10000 + Math.random() * 90000)}`,
      Deskripsi: `Part ${categories[Math.floor(Math.random() * categories.length)]} ${i}`,
      Brand: brands[Math.floor(Math.random() * brands.length)],
      Kategori: categories[Math.floor(Math.random() * categories.length)],
      Sales_M3: salesM3,
      Sales_M2: salesM2,
      Sales_M1: salesM1,
      Avg_Sales_3M: avgSales,
      SPD: Number(spd.toFixed(2)),
      SPD_MTD: Number(finalSpdMtd.toFixed(2)),
      Good_Stock_DC: goodStockDC,
      Good_Stock_Toko: finalTokoStock,
      Booking_Stock: Math.floor(Math.random() * 10),
      Bad_Stock: Math.floor(Math.random() * 5),
      BDP: Math.floor(Math.random() * 20),
      Min_Stock: isPotentialLoss ? 10 : 5,
      Max_Stock: isSlow ? 50 : 100,
      Status_OOS: isOOS || finalTokoStock === 0 ? 'Yes' : 'No',
    });
  }

  return data;
};
