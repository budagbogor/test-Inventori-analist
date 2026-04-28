export interface InventoryRow {
  SKU: string;
  Deskripsi: string;
  Brand: string;
  Kategori: string;
  Sales_M3: number;
  Sales_M2: number;
  Sales_M1: number;
  Avg_Sales_3M: number;
  SPD: number;
  SPD_MTD: number;
  Good_Stock_DC: number;
  Good_Stock_Toko: number;
  Booking_Stock: number;
  Bad_Stock: number;
  BDP: number;
  Min_Stock: number;
  Max_Stock: number;
  Status_OOS: 'Yes' | 'No';
}

export interface AnalysisSummary {
  totalSKU: number;
  totalOOS: number;
  oosPercentage: number;
  totalValue: number; // Sum of good stock DC + Toko
  totalBDP: number;
  totalBadStock: number;
  health: {
    overstock: number;
    healthy: number;
    understock: number;
    oos: number;
  };
}
