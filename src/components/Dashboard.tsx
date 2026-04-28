import React, { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { Upload, FileType, Play, Loader2, AlertCircle, TrendingDown, TrendingUp, Package, Truck } from 'lucide-react';
import { InventoryRow, AnalysisSummary } from '../types';
import { generateMockData } from '../lib/mockData';
import { getGeminiInsights } from '../services/geminiService';
import Markdown from 'react-markdown';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

export interface TrendRow extends InventoryRow {
  TrendPercent: number;
}

export default function Dashboard() {
  const [data, setData] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<string>('');

  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [slowMoving, setSlowMoving] = useState<InventoryRow[]>([]);
  const [lossSales, setLossSales] = useState<InventoryRow[]>([]);
  const [decliningItems, setDecliningItems] = useState<TrendRow[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const fileName = file.name.toLowerCase();

    try {
      if (fileName.endsWith('.csv')) {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: (results) => {
            try {
              if (results.errors.length > 0) {
                console.error('Parse errors:', results.errors);
              }
              const parsedData = results.data as InventoryRow[];
              processData(parsedData);
            } catch (err) {
              setError("Gagal memproses file CSV. Pastikan format header sesuai dengan standard MSH.");
            } finally {
              setLoading(false);
            }
          },
          error: (error) => {
            setError(error.message);
            setLoading(false);
          }
        });
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: null });
        
        processData(json as InventoryRow[]);
        setLoading(false);
      } else {
        setError("Format file tidak didukung. Harap unggah file CSV atau Excel (.xlsx/.xls).");
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError("Gagal memproses file.");
      setLoading(false);
    }
  };

  const processData = async (inventoryData: InventoryRow[]) => {
    if (!inventoryData || inventoryData.length === 0) {
      setError("Data kosong atau format salah.");
      return;
    }

    // 1. Ringkasan & Status Stok
    const totalSKU = inventoryData.length;
    let oosCount = 0;
    let overstockCount = 0;
    let understockCount = 0;
    let healthyCount = 0;
    let totalValue = 0;
    let totalBDP = 0;
    let totalBadStock = 0;

    inventoryData.forEach(item => {
      totalValue += (item.Good_Stock_DC || 0) + (item.Good_Stock_Toko || 0);
      totalBDP += (item.BDP || 0);
      totalBadStock += (item.Bad_Stock || 0);

      const stockToko = item.Good_Stock_Toko || 0;
      if (item.Status_OOS === 'Yes' || stockToko === 0) oosCount++;
      else if (stockToko < (item.Min_Stock || 0)) understockCount++;
      else if (stockToko > (item.Max_Stock || 999)) overstockCount++;
      else healthyCount++;
    });

    const oosPercentage = totalSKU > 0 ? (oosCount / totalSKU) * 100 : 0;
    
    const calculatedSummary: AnalysisSummary = { 
      totalSKU, 
      totalOOS: oosCount, 
      oosPercentage, 
      totalValue, 
      totalBDP,
      totalBadStock,
      health: { overstock: overstockCount, healthy: healthyCount, understock: understockCount, oos: oosCount }
    };
    setSummary(calculatedSummary);

    // 2. Analisa Slow Moving
    // High total stock but low avg sales. Formula: sort descending by ratio of Stock/Sales
    const slow = [...inventoryData]
      .filter(d => d.Avg_Sales_3M < 5 && (d.Good_Stock_DC + d.Good_Stock_Toko) > 10) // Custom threshold filter
      .sort((a, b) => {
        const ratioA = (a.Good_Stock_DC + a.Good_Stock_Toko) / (a.Avg_Sales_3M || 0.1);
        const ratioB = (b.Good_Stock_DC + b.Good_Stock_Toko) / (b.Avg_Sales_3M || 0.1);
        return ratioB - ratioA; // Descending
      })
      .slice(0, 10);
    
    setSlowMoving(slow);

    // 3. Potensi Loss Sales
    // High SPD_MTD but Good_Stock_Toko is nearing 0
    const loss = [...inventoryData]
      .filter(d => d.SPD_MTD > 0 && d.Good_Stock_Toko <= (d.SPD_MTD * 3)) // Stock less than 3 days of sales MTD
      .sort((a, b) => {
        const riskA = a.SPD_MTD - a.Good_Stock_Toko;
        const riskB = b.SPD_MTD - b.Good_Stock_Toko;
        return riskB - riskA; // Descending risk
      })
      .slice(0, 10);

    setLossSales(loss);
    
    // 4. Trend Analisa (M1 vs M3)
    const trendData: TrendRow[] = inventoryData.map(item => {
      const trendPercent = item.Sales_M3 > 0 ? ((item.Sales_M1 - item.Sales_M3) / item.Sales_M3) * 100 : (item.Sales_M1 > 0 ? 100 : 0);
      return { ...item, TrendPercent: Math.round(trendPercent * 10) / 10 };
    });

    const declining = [...trendData]
      .filter(item => item.TrendPercent < -15 && item.Avg_Sales_3M > 5)
      .sort((a,b) => a.TrendPercent - b.TrendPercent)
      .slice(0, 5);

    setDecliningItems(declining);
    setData(inventoryData);

    // AI Analysis (Points 4 & 5)
    setAnalyzing(true);
    try {
      const aiResponse = await getGeminiInsights(calculatedSummary, slow, loss, declining.map(d => ({ SKU: d.SKU, Deskripsi: d.Deskripsi, TrendPercent: d.TrendPercent })));
      setInsights(aiResponse);
    } catch (err: any) {
      setError(err.message || "Gagal mendapatkan insight AI. Pastikan GEMINI_API_KEY terkonfigurasi.");
    } finally {
      setAnalyzing(false);
    }
  };

  const loadMockData = () => {
    setLoading(true);
    setTimeout(() => {
      const mock = generateMockData();
      processData(mock);
      setLoading(false);
    }, 500);
  };

  const resetData = () => {
    setData([]);
    setSummary(null);
    setSlowMoving([]);
    setLossSales([]);
    setDecliningItems([]);
    setInsights('');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans flex flex-col pb-20">
      {/* Header */}
      <header className="flex justify-between items-end mb-6 border-b border-gray-200 pb-4 pt-6 px-8 max-w-7xl mx-auto w-full">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Inventory <span className="font-semibold">AI Analyst</span></h1>
          <p className="text-gray-500 text-sm mt-1">Sistem Cerdas Penganalisa Monitoring Stock Harian (MSH)</p>
        </div>
        {data.length > 0 && (
          <button 
            onClick={resetData}
            className="text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A] hover:bg-gray-100 px-3 py-1.5 rounded-md transition-colors"
          >
            Upload Baru
          </button>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-8 flex-grow w-full">
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
              <div className="mx-auto w-16 h-16 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mb-6">
                <Upload className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Upload Data MSH (CSV / Excel)</h2>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                Unggah file Monitoring Stock Harian Anda untuk mendapatkan analisa efisiensi stok dan loss sales secara instan.
              </p>
              
              <div className="flex flex-col items-center gap-4">
                <label className="relative cursor-pointer bg-[#1A1A1A] hover:bg-gray-800 text-white px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors shadow-sm inline-flex items-center space-x-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileType className="w-5 h-5" />}
                  <span>{loading ? 'Memproses...' : 'PILIH FILE CSV / EXCEL'}</span>
                  <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" className="sr-only" onChange={handleFileUpload} disabled={loading} />
                </label>
                
                <div className="mt-8 flex items-center justify-center space-x-4">
                  <div className="h-px bg-gray-200 w-16"></div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">ATAU</span>
                  <div className="h-px bg-gray-200 w-16"></div>
                </div>
                
                <button 
                  onClick={loadMockData}
                  disabled={loading}
                  className="mt-6 flex items-center space-x-2 mx-auto text-xs font-bold uppercase tracking-widest text-gray-600 hover:text-black border border-gray-200 bg-white hover:bg-gray-50 px-5 py-2.5 rounded-lg transition-all shadow-sm"
                >
                  <Play className="w-4 h-4" />
                  <span>GUNAKAN DATA DUMMY</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500 flex flex-col gap-6">
            {/* 1. Ringkasan Status Stok */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <SummaryCard title="Total SKU" value={summary?.totalSKU || 0} subvalue="Items Analyzed" />
              <SummaryCard 
                title="Stock Status (OOS %)" 
                value={`${summary?.oosPercentage.toFixed(1)}%`} 
                subvalue={`${summary?.totalOOS} SKU`}
                alert={(summary?.oosPercentage || 0) > 10}
              />
              <SummaryCard title="Total Inventory Value (Est)" value={summary?.totalValue?.toLocaleString('id-ID') || '0'} subvalue="Pcs in DC & Stores" />
              <SummaryCard title="BDP Balance (DC to Store)" value={summary?.totalBDP?.toLocaleString('id-ID') || '0'} subvalue="In Transit" alert={false} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
              {/* Left Side: Tables */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                {/* 2. Analisa Slow Moving */}
                <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-600">Top 10 Slow Moving SKU (High Stock / Low Sales)</h2>
                    <span className="text-[10px] text-gray-400">Action: Markdown / Bundle</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-white text-[10px] uppercase text-gray-400">
                        <tr>
                          <th className="px-4 py-2 font-semibold">SKU ID</th>
                          <th className="px-4 py-2 font-semibold text-right">Good Stock</th>
                          <th className="px-4 py-2 font-semibold text-right">Avg Sales (3M)</th>
                          <th className="px-4 py-2 font-semibold text-center text-amber-600">DOI</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-gray-100">
                        {slowMoving.map((item, i) => {
                          const stock = item.Good_Stock_DC + item.Good_Stock_Toko;
                          const doi = item.Avg_Sales_3M > 0 ? Math.round((stock / item.Avg_Sales_3M) * 30) : '> 999';
                          return (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-4 py-2">
                                <div className="font-mono">{item.SKU}</div>
                                <div className="text-xs text-gray-500 truncate max-w-[200px]" title={item.Deskripsi}>{item.Deskripsi}</div>
                              </td>
                              <td className="px-4 py-2 text-right font-medium">{stock}</td>
                              <td className="px-4 py-2 text-right">{item.Avg_Sales_3M}</td>
                              <td className="px-4 py-2 text-center text-amber-700">{doi} hr</td>
                            </tr>
                          )
                        })}
                        {slowMoving.length === 0 && (
                          <tr>
                            <td colSpan={4} className="text-center py-6 text-gray-500">Tidak ada item slow moving kritikal.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 3. Potensi Loss Sales */}
                <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-600">Critical OOS: High SPD MTD</h2>
                    <span className="text-[10px] text-rose-500 font-bold uppercase">Stock Out Alert</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-white text-[10px] uppercase text-gray-400">
                        <tr>
                          <th className="px-4 py-2 font-semibold">SKU ID</th>
                          <th className="px-4 py-2 font-semibold text-right">SPD MTD</th>
                          <th className="px-4 py-2 font-semibold text-right">Store Stock</th>
                          <th className="px-4 py-2 font-semibold text-center text-rose-600">Loss Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-gray-100">
                        {lossSales.map((item, i) => {
                          const isCritical = item.Good_Stock_Toko === 0;
                          return (
                            <tr key={i} className={isCritical ? "bg-rose-50/30" : "hover:bg-gray-50"}>
                              <td className="px-4 py-2">
                                <div className="font-mono">{item.SKU}</div>
                                <div className="text-xs text-gray-500 truncate max-w-[200px]" title={item.Deskripsi}>{item.Deskripsi}</div>
                              </td>
                              <td className="px-4 py-2 text-right font-bold">{item.SPD_MTD}</td>
                              <td className={cn("px-4 py-2 text-right", isCritical ? "text-rose-600 font-bold" : "text-rose-500")}>
                                {item.Good_Stock_Toko}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {isCritical ? (
                                  <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-bold uppercase">Critical</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase">Review</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        {lossSales.length === 0 && (
                          <tr>
                            <td colSpan={4} className="text-center py-6 text-gray-500">Stok toko dalam kondisi aman.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 4. Sales Declining Trend */}
                <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-gray-600">Terindikasi Dead Stock (Sales Menurun M-1 vs M-3)</h2>
                    <span className="text-[10px] text-gray-400">Action: Cek Promo</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-white text-[10px] uppercase text-gray-400">
                        <tr>
                          <th className="px-4 py-2 font-semibold">SKU ID</th>
                          <th className="px-4 py-2 font-semibold text-right">Sales M-3</th>
                          <th className="px-4 py-2 font-semibold text-right">Sales M-1</th>
                          <th className="px-4 py-2 font-semibold text-right">Trend</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs divide-y divide-gray-100">
                        {decliningItems.map((item, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-2">
                              <div className="font-mono">{item.SKU}</div>
                              <div className="text-xs text-gray-500 truncate max-w-[200px]" title={item.Deskripsi}>{item.Deskripsi}</div>
                            </td>
                            <td className="px-4 py-2 text-right">{item.Sales_M3}</td>
                            <td className="px-4 py-2 text-right font-medium">{item.Sales_M1}</td>
                            <td className="px-4 py-2 text-right text-rose-600 font-bold">{item.TrendPercent}%</td>
                          </tr>
                        ))}
                        {decliningItems.length === 0 && (
                          <tr>
                            <td colSpan={4} className="text-center py-6 text-gray-500">Tidak ada penurunan sales signifikan.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              {/* Right Side: Charts & AI Strategy */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                {/* Inventory Health Chart */}
                <section className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-4">Inventory Health</h2>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Healthy', value: summary?.health.healthy || 0, color: '#10b981' },
                            { name: 'Overstock', value: summary?.health.overstock || 0, color: '#f59e0b' },
                            { name: 'Understock', value: summary?.health.understock || 0, color: '#f43f5e' },
                            { name: 'OOS', value: summary?.health.oos || 0, color: '#be123c' }
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {
                            [
                              { name: 'Healthy', color: '#10b981' },
                              { name: 'Overstock', color: '#f59e0b' },
                              { name: 'Understock', color: '#f43f5e' },
                              { name: 'OOS', color: '#be123c' }
                            ].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))
                          }
                        </Pie>
                        <RechartsTooltip />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 p-3 bg-rose-50 rounded-lg flex justify-between items-center border border-rose-100">
                    <div>
                      <p className="text-[10px] text-rose-500 font-bold uppercase">Bad Stock (Dead Stock)</p>
                      <p className="text-xl font-bold text-rose-700">{summary?.totalBadStock?.toLocaleString('id-ID') || 0} <span className="text-sm font-normal">Pcs</span></p>
                    </div>
                    <AlertCircle className="w-6 h-6 text-rose-400" />
                  </div>
                </section>

                <section className="bg-[#1A1A1A] p-6 rounded-xl text-white flex-grow shadow-lg relative min-h-[300px]">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-5 flex items-center justify-between">
                    <span>Operational Strategy: AI</span>
                    <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  </h2>
                  
                  {analyzing ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4 h-full">
                      <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Analyzing Data...</p>
                    </div>
                  ) : insights ? (
                    <div className="prose prose-invert max-w-none prose-sm prose-h3:text-sm prose-h3:font-semibold prose-h3:uppercase prose-h3:tracking-widest prose-h3:text-gray-300 prose-h3:mb-3 prose-h3:mt-0 prose-p:text-gray-400 prose-p:leading-relaxed prose-li:text-gray-300">
                      <Markdown>{insights}</Markdown>
                      <button className="w-full bg-white text-black text-xs font-bold uppercase tracking-widest py-3 mt-8 rounded-lg hover:bg-gray-200 transition-colors shadow-sm">
                        Export Report
                      </button>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 text-sm mt-10">Data AI insights will appear here</div>
                  )}
                </section>
              </div>
            </div>
            
            <footer className="mt-4 flex justify-between items-center text-[10px] text-gray-400 uppercase tracking-widest font-bold">
              <span>Internal Use Only — Confidential</span>
              <span>Inventory Intelligence System v4.2.1</span>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({ title, value, subvalue, alert }: { title: string, value: string | number, subvalue?: string, alert?: boolean }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
      <div>
        <p className="text-xs text-gray-500 mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-2xl font-bold", alert ? "text-rose-500" : "text-[#1A1A1A]")}>
            {value}
          </span>
          {subvalue && (
            <span className="text-xs text-gray-400">{subvalue}</span>
          )}
        </div>
      </div>
      {alert && (
        <div className="w-full bg-gray-100 h-1.5 mt-3 rounded-full overflow-hidden">
          <div className="bg-rose-500 h-full" style={{ width: String(value).replace('%', '') + '%' }}></div>
        </div>
      )}
      {!alert && subvalue === "In Transit" && (
         <p className="text-[10px] text-emerald-600 mt-1 font-medium">Stable Distribution</p>
      )}
    </div>
  )
}
