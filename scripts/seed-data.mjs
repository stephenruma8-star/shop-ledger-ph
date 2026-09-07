#!/usr/bin/env node
/**
 * seed-data.mjs - Generate realistic test data for Shop Ledger PH
 * 
 * Output: JSON that can be imported via the backup restore feature.
 * Usage: node scripts/seed-data.mjs > seed-backup.json
 */

function generateId() {
  return Math.floor(Math.random() * 1000000) + 1;
}

function randomDate(daysAgo = 90) {
  const now = new Date();
  const past = new Date(now.getTime() - Math.random() * daysAgo * 24 * 60 * 60 * 1000);
  return past.toISOString();
}

function randomPhone() {
  const prefix = ['0917', '0918', '0919', '0927', '0928', '0929', '0937', '0938', '0939', '0947', '0948', '0949'];
  const p = prefix[Math.floor(Math.random() * prefix.length)];
  const rest = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
  return p + rest;
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Filipino names
const firstNames = ['Juan', 'Maria', 'Jose', 'Ana', 'Pedro', 'Rosa', 'Miguel', 'Carmen', 'Carlos', 'Teresa', 'Antonio', 'Elena', 'Ricardo', 'Lorna', 'Fernando'];
const lastNames = ['dela Cruz', 'Santos', 'Reyes', 'Garcia', 'Mendoza', 'Torres', 'Ramos', 'Gonzales', 'Aquino', 'Castillo', 'Rivera', 'Flores', 'Villanueva', 'Cruz', 'Bautista'];

// Sari-sari store items
const inventoryItems = [
  { name: 'Coca-Cola 350ml', category: 'Beverages', costPrice: 8, sellPrice: 12, stock: 48 },
  { name: 'Pepsi 350ml', category: 'Beverages', costPrice: 8, sellPrice: 12, stock: 36 },
  { name: 'Royal 350ml', category: 'Beverages', costPrice: 8, sellPrice: 12, stock: 24 },
  { name: 'Sprite 350ml', category: 'Beverages', costPrice: 8, sellPrice: 12, stock: 24 },
  { name: 'Lucky Me Pancit Canton', category: 'Noodles', costPrice: 5, sellPrice: 8, stock: 72 },
  { name: 'Lucky Me Batchoy', category: 'Noodles', costPrice: 5, sellPrice: 8, stock: 48 },
  { name: 'Payless Instant Mami', category: 'Noodles', costPrice: 4, sellPrice: 6, stock: 60 },
  { name: '555 Tuna Sardines', category: 'Canned Goods', costPrice: 15, sellPrice: 22, stock: 36 },
  { name: 'Ligo Sardines', category: 'Canned Goods', costPrice: 14, sellPrice: 20, stock: 36 },
  { name: 'Argentina Corned Beef', category: 'Canned Goods', costPrice: 28, sellPrice: 42, stock: 24 },
  { name: 'Jasmine Rice 1kg', category: 'Rice', costPrice: 42, sellPrice: 55, stock: 20 },
  { name: 'Sinandomeng Rice 1kg', category: 'Rice', costPrice: 38, sellPrice: 48, stock: 15 },
  { name: 'Magnolia Ice Cream Cup', category: 'Frozen', costPrice: 22, sellPrice: 35, stock: 12 },
  { name: 'Selecta Ice Cream', category: 'Frozen', costPrice: 85, sellPrice: 120, stock: 8 },
  { name: 'Nestle Milk 1L', category: 'Dairy', costPrice: 55, sellPrice: 75, stock: 10 },
  { name: 'Bear Brand Powdered Milk', category: 'Dairy', costPrice: 45, sellPrice: 65, stock: 12 },
  { name: 'Bread Pan de Sal (10pcs)', category: 'Bakery', costPrice: 25, sellPrice: 40, stock: 20 },
  { name: 'Gardenia Bread', category: 'Bakery', costPrice: 38, sellPrice: 55, stock: 15 },
  { name: 'Surf Powder Detergent 500g', category: 'Household', costPrice: 32, sellPrice: 48, stock: 24 },
  { name: 'Joy Dishwashing Liquid', category: 'Household', costPrice: 25, sellPrice: 38, stock: 18 },
];

// Generate clients
const clients = [];
for (let i = 0; i < 10; i++) {
  const firstName = randomPick(firstNames);
  const lastName = randomPick(lastNames);
  const balance = Math.random() > 0.3 ? 0 : -(Math.floor(Math.random() * 2000) + 50);
  clients.push({
    id: generateId(),
    name: `${firstName} ${lastName}`,
    contact: randomPick(firstNames),
    phone: randomPhone(),
    address: `${Math.floor(Math.random() * 200) + 1} ${randomPick(['Rizal', 'Mabini', 'Bonifacio', 'Aguinaldo', 'Luna', 'Del Pilar'])} St., ${randomPick(['Barangay San Isidro', 'Barangay San Jose', 'Barangay San Antonio', 'Barangay Poblacion'])}`,
    balance,
    loyaltyPoints: Math.floor(Math.random() * 500),
    totalSpent: Math.floor(Math.random() * 50000) + 1000,
    createdAt: randomDate(180),
  });
}

// Generate inventory
const inventory = inventoryItems.map((item, i) => ({
  id: generateId(),
  name: item.name,
  description: item.name,
  sku: `SKU-${(i + 1).toString().padStart(5, '0')}`,
  barcode: `480${(100000000 + i).toString()}`,
  category: item.category,
  stock: item.stock,
  minStock: Math.floor(item.stock * 0.2),
  lowStock: Math.floor(item.stock * 0.1),
  costPrice: item.costPrice,
  sellPrice: item.sellPrice,
  price: item.sellPrice,
  image: null,
  variants: [],
  createdAt: randomDate(120),
}));

// Generate transactions (15 sales)
const transactions = [];
const paymentMethods = ['Cash', 'GCash', 'Maya', 'Cash'];
const statuses = ['paid', 'partial', 'paid', 'paid', 'paid'];

for (let i = 0; i < 15; i++) {
  const numItems = Math.floor(Math.random() * 4) + 1;
  const items = [];
  let subtotal = 0;

  for (let j = 0; j < numItems; j++) {
    const inv = randomPick(inventory);
    const qty = Math.floor(Math.random() * 3) + 1;
    const lineTotal = inv.sellPrice * qty;
    items.push({
      name: inv.name,
      description: inv.description,
      qty,
      unitCost: inv.sellPrice,
      lineTotal,
    });
    subtotal += lineTotal;
  }

  const discount = Math.random() > 0.7 ? Math.floor(subtotal * 0.1) : 0;
  const grandTotal = subtotal - discount;
  const status = randomPick(statuses);
  const clientId = status === 'paid' ? null : randomPick(clients).id;
  const clientName = status === 'paid' ? '' : clients.find(c => c.id === clientId)?.name || '';

  transactions.push({
    id: generateId(),
    invoiceNo: `INV-${(1000 + i).toString()}`,
    clientId,
    clientName,
    date: randomDate(60),
    createdAt: randomDate(60),
    items,
    subtotal,
    totalInterest: 0,
    discount,
    scDiscount: 0,
    grandTotal,
    paymentMethod: randomPick(paymentMethods),
    status,
    balanceAdded: status === 'partial' ? grandTotal : 0,
    commissionRate: 0,
    commissionAmount: 0,
  });
}

// Generate payments (10 for utang clients)
const payments = [];
const utangClients = clients.filter(c => c.balance < 0);

for (let i = 0; i < 10; i++) {
  const client = utangClients[i % utangClients.length];
  const amount = Math.floor(Math.random() * 500) + 50;
  
  payments.push({
    id: generateId(),
    clientId: client.id,
    amount,
    type: Math.random() > 0.5 ? 'Full' : 'Partial',
    date: randomDate(30),
    notes: randomPick(['Cash payment', 'GCash transfer', 'Partial payment', 'Full settlement', '']),
    createdAt: randomDate(30),
    paymentMethod: randomPick(['Cash', 'GCash', 'Maya']),
    referenceNo: Math.random() > 0.5 ? `REF-${Math.floor(Math.random() * 100000)}` : '',
  });
}

// Generate expenses (5)
const expenseCategories = ['Rent', 'Utilities', 'Supplies', 'Maintenance', 'Transportation', 'Others'];
const expenses = [];
for (let i = 0; i < 5; i++) {
  expenses.push({
    id: generateId(),
    date: randomDate(45),
    category: randomPick(expenseCategories),
    description: randomPick([
      'Monthly rent payment',
      'Electric bill',
      'Water bill',
      'Store supplies',
      'Repair of display cabinet',
      'Transportation to supplier',
      'Cleaning supplies',
      'Phone load',
    ]),
    amount: Math.floor(Math.random() * 2000) + 100,
    payee: randomPick(['Meralco', 'Maynilad', 'Landlord', 'Hardware Store', 'Supplier', 'Self']),
    type: randomPick(['recurring', 'one-time']),
    createdAt: randomDate(45),
  });
}

// Generate suppliers (3)
const supplierNames = [
  { name: 'Juancho Grocery Distributor', category: 'Groceries', contact: 'Mr. Juancho Reyes' },
  { name: 'San Miguel Beverages Direct', category: 'Beverages', contact: 'Ms. Patricia Santos' },
  { name: 'Lucky Me Factory Outlet', category: 'Noodles', contact: 'Mr. Eduardo Cruz' },
];

const suppliers = supplierNames.map((s, i) => ({
  id: generateId(),
  name: s.name,
  contact: s.contact,
  email: `${s.name.toLowerCase().replace(/\s+/g, '.')}@supplier.ph`,
  category: s.category,
  address: `${Math.floor(Math.random() * 100) + 1} Industrial St., ${randomPick(['Makati', 'Pasig', 'Quezon City', 'Mandaluyong'])}`,
  loyaltyPoints: Math.floor(Math.random() * 1000),
  totalSpent: Math.floor(Math.random() * 100000) + 5000,
  createdAt: randomDate(200),
}));

// Build the backup dump
const backup = {
  clients,
  transactions,
  payments,
  inventory,
  quickItems: [
    { id: generateId(), name: 'Coke Can', price: 12, category: 'Beverages', createdAt: randomDate(90) },
    { id: generateId(), name: 'Pancit Canton', price: 8, category: 'Noodles', createdAt: randomDate(90) },
    { id: generateId(), name: 'Rice Meal', price: 45, category: 'Meals', createdAt: randomDate(90) },
  ],
  settings: [
    { id: 1, key: 'shopName', value: 'Sample Sari-Sari Store' },
    { id: 2, key: 'ownerName', value: 'Maria Santos' },
    { id: 3, key: 'shopAddress', value: '123 Rizal St., Barangay San Isidro, Manila' },
    { id: 4, key: 'shopPhone', value: '09171234567' },
    { id: 5, key: 'currency', value: '₱' },
  ],
  auditLogs: [
    { id: generateId(), action: 'APP_INIT', details: 'Application started', createdAt: randomDate(30) },
    { id: generateId(), action: 'USER_LOGIN', details: 'Admin logged in', createdAt: randomDate(15) },
  ],
  users: [
    { id: 1, username: 'admin', password: 'admin123', role: 'admin', createdAt: randomDate(365) },
    { id: 2, username: 'staff1', password: 'staff123', role: 'staff', createdAt: randomDate(180) },
  ],
  expenses,
  suppliers,
  purchaseOrders: [
    {
      id: generateId(),
      poNo: 'PO-00001',
      supplierId: suppliers[0].id,
      supplierName: suppliers[0].name,
      date: randomDate(30),
      items: [
        { name: 'Coca-Cola 350ml', description: 'Coca-Cola 350ml', qty: 48, unitCost: 8, lineTotal: 384 },
        { name: 'Pepsi 350ml', description: 'Pepsi 350ml', qty: 36, unitCost: 8, lineTotal: 288 },
      ],
      total: 672,
      status: 'received',
      createdAt: randomDate(30),
    },
  ],
  supplierPayments: [
    {
      id: generateId(),
      supplierId: suppliers[0].id,
      amount: 672,
      date: randomDate(25),
      paymentMethod: 'Cash',
      referenceNo: '',
      createdAt: randomDate(25),
    },
  ],
  notifications: [
    { id: generateId(), type: 'low_stock', message: 'Sprite 350ml is below minimum stock level', read: false, createdAt: randomDate(7) },
    { id: generateId(), type: 'payment_received', message: 'Payment received from Juan dela Cruz', read: true, createdAt: randomDate(5) },
  ],
  version: '3.10.8',
  exportedAt: new Date().toISOString(),
};

// Output the backup JSON
console.log(JSON.stringify(backup, null, 2));

// Print summary to stderr
const summary = Object.entries(backup)
  .filter(([k]) => Array.isArray(backup[k]))
  .map(([k, v]) => `  ${k}: ${v.length} records`)
  .join('\n');
console.error(`\nGenerated seed data:\n${summary}`);
console.error(`\nImport this file via: Backups → Import JSON`);
