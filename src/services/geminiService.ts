import { GoogleGenAI } from '@google/genai';
import { InventoryRow, AnalysisSummary } from '../types';

let genAI: GoogleGenAI | null = null;

export interface TrendRowBase {
  SKU: string;
  Deskripsi: string;
  TrendPercent: number;
}

export const getGeminiInsights = async (
  summary: AnalysisSummary,
  slowMoving: InventoryRow[],
  lossSales: InventoryRow[],
  declining: TrendRowBase[]
): Promise<string> => {
  if (!genAI) {
    // Process.env injection from VITE config
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is missing. Please configure it in AI Studio Secrets.');
    }
    genAI = new GoogleGenAI({ apiKey });
  }

  const prompt = `Anda adalah Ahli Analis Inventory otomotif dan Supply Chain berpengalaman.
Tolong berikan analisa DEEP ANALYSIS berdasarkan data KPI dari Monitoring Stock Harian (MSH) ini:

DATA RINGKASAN & HEALTH STATUS:
- Total SKU: ${summary.totalSKU}
- Healthy Stock: ${summary.health.healthy} SKU
- Overstock: ${summary.health.overstock} SKU
- Understock: ${summary.health.understock} SKU
- OOS: ${summary.health.oos} SKU (${summary.oosPercentage.toFixed(2)}%)
- Bad Stock (Dead Stock): ${summary.totalBadStock} unit
- Total BDP (Barang Dalam Perjalanan): ${summary.totalBDP} unit

DATA 10 SKU SLOW MOVING (Overstock - Good Stock tinggi, Avg Sales rendah):
${JSON.stringify(slowMoving.map(s => ({ SKU: s.SKU, TotalStock: s.Good_Stock_DC + s.Good_Stock_Toko, AvgSales3M: s.Avg_Sales_3M })))}

DATA 10 SKU POTENTIAL LOSS SALES (Demand tinggi, Stock Toko kritis):
${JSON.stringify(lossSales.map(l => ({ SKU: l.SKU, StockToko: l.Good_Stock_Toko, SPD_MTD: l.SPD_MTD })))}

DATA TERINDIKASI DEAD STOCK (Trend Sales Menurun drastis M-1 vs M-3):
${JSON.stringify(declining)}

Berdasarkan data di atas, tolong HASILKAN laporan dalam format Markdown yang mencakup:

### 4. Analisa Kesehatan Inventory & Trend
(Analisa kondisi distribusi stok, proporsi overstock/understock, ancaman Dead Stock, dan keefektifan BDP. Buat 1-2 paragraf tajam.)

### 5. Strategi Operasional (3 Langkah)
(Berikan 3 langkah operasional konkrit berdasarkan indikator KPI yang spesifik seperti markdown, redistribusi, atau hold supplier. Profesional dan langsung pada intinya.)

Hanya output Markdown untuk bagian 4 dan 5 saja.`;

  try {
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return result.text || 'Tidak dapat menghasilkan analisa saat ini.';
  } catch (error) {
    console.error('Error fetching Gemini insights:', error);
    throw new Error('Gagal menghubungi AI untuk analisa.');
  }
};
