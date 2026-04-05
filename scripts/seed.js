// Run: node scripts/seed.js
// Generates 10 months of fake data and inserts into local D1

const data = {
  cashAccounts: [
    { name: "國泰",    currency: "TWD" },
    { name: "玉山",    currency: "TWD" },
    { name: "台新",    currency: "TWD" },
    { name: "Wise",   currency: "USD" },
  ],
  2025: {},
};

// Base values
let cash    = { 國泰: 120000, 玉山: 55000, 台新: 80000, Wise: 800 };
let ins     = 320000;
let stock   = 480000;
let stockUS = 3200;
let fund    = 160000;

const jitter = (v, pct = 0.04) => Math.round(v * (1 + (Math.random() - 0.5) * pct));
const grow   = (v, pct)        => Math.round(v * (1 + pct));

for (let m = 0; m < 10; m++) {
  // Slow monthly drift
  cash    = { 國泰: jitter(grow(cash.國泰, 0.005)), 玉山: jitter(grow(cash.玉山, 0.003)), 台新: jitter(grow(cash.台新, 0.002)), Wise: jitter(cash.Wise, 0.06) };
  stock   = jitter(grow(stock,   m < 3 ? -0.01 : 0.025), 0.06); // dip early, then recover
  stockUS = jitter(grow(stockUS, m < 2 ? -0.015 : 0.03), 0.08);
  fund    = jitter(grow(fund,    0.008));
  // Insurance is stable
  ins     = ins;

  data[2025][m] = {
    cash:      { ...cash },
    insurance: ins,
    stock,
    stockUS,
    fund,
    etf: "",
  };
}

const json = JSON.stringify(data);

// Output the wrangler command
console.log("Inserting seed data into local D1...\n");
console.log(`npx wrangler d1 execute asset-tracker-db --local --command "INSERT OR REPLACE INTO kv (key, value) VALUES ('asset-tracker-data', '${json.replace(/'/g, "''")}')" `);
