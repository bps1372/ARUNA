/* ===============================
   KONFIGURASI SPREADSHEET
================================*/
const SPREADSHEET_ID = "1I_ep09_tnTSqycD_HL6kXXZchhkDYk8tGvcdqRX5Z7U"; // ID Spreadsheet USER
const SHEET_NAME = "user";

// ID Spreadsheet DATABASE (INPUTAN & MASTER ITEM)
const ANGGARAN_SPREADSHEET_ID = "1nYki_KwwQdPpIlE7A-TOhFO1-jucrwOTmrM3SJnha3o"; 
const ANGGARAN_SHEET = "INPUTAN";
const MASTER_ITEM_SHEET = "MasterItem"; 

/* ===============================
   DO GET (Render HTML)
================================*/
function doGet(e) {
  const page = e.parameter.page || "login";
  return HtmlService.createTemplateFromFile(page)
    .evaluate()
    .setTitle("ARUNA - BPS Kota Solok")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ===============================
   LOGIKA LOGIN & SESSION
================================*/
function loginUser(username, password) {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username && data[i][1] === password) {
      const user = { username: data[i][0], nama: data[i][2], jabatan: data[i][3], role: data[i][4] };
      PropertiesService.getUserProperties().setProperty("user", JSON.stringify(user));
      return { status: "success", url: ScriptApp.getService().getUrl() + "?page=dashboard" };
    }
  }
  return { status: "error" };
}

function getUser() {
  const user = PropertiesService.getUserProperties().getProperty("user");
  return user ? JSON.parse(user) : { nama: "Guest", jabatan: "-", role: "guest", username: "" };
}

function logout() {
  PropertiesService.getUserProperties().deleteAllProperties();
  return HtmlService.createHtmlOutputFromFile("login").getContent();
}

/* ===============================
   USER MANAGEMENT
================================*/
function getAllUsers() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME).getDataRange().getValues();
}

function addUser(data) {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  sh.appendRow([data.username, data.password, data.nama, data.jabatan, data.role]);

  if (data.email && data.email.includes("@")) {
    try {
      MailApp.sendEmail({
        to: data.email,
        subject: "Akses Login ARUNA - BPS Kota Solok",
        htmlBody: `Halo ${data.nama},<br>Akun Anda telah dibuat.<br>User: ${data.username}<br>Pass: ${data.password}`
      });
    } catch (e) { console.log("Email error: " + e); }
  }
}

function deleteUser(username) {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) { sh.deleteRow(i + 1); break; }
  }
}

function updateUser(u, p, n, j, r) {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === u) {
      sh.getRange(i + 1, 2, 1, 4).setValues([[p, n, j, r]]);
      break;
    }
  }
}

/* ===============================
   LOGIKA ANGGARAN & REALISASI
================================*/

// 1. INPUT RPD
function simpanAnggaran(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); 
    var ss = SpreadsheetApp.openById(ANGGARAN_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(ANGGARAN_SHEET); 
    if (!sheet) return { status: "error", message: "Sheet INPUTAN tidak ditemukan!" };

    var timestamp = new Date();
    var user = getUser(); 

    // Append 8 Kolom: [Timestamp, PJ, Item, Bulan, Tahun, Jumlah, Ket, User]
    sheet.appendRow([
      timestamp, data.pj, data.item, data.bulan, data.tahun, data.jumlah, data.ket, user.username
    ]);
    
    SpreadsheetApp.flush();
    return { status: "success" };
  } catch (e) {
    return { status: "error", message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// 2. MONITORING DATA (RPD + REALISASI)
function getMonitoringData() {
  const user = getUser();
  const ss = SpreadsheetApp.openById(ANGGARAN_SPREADSHEET_ID);
  
  // A. DATA MASTER ITEM
  const shMaster = ss.getSheetByName(MASTER_ITEM_SHEET);
  let masterItems = [];
  let totalPagu = 0;

  if(shMaster) {
    const dataMaster = shMaster.getDataRange().getValues();
    for(let i = 1; i < dataMaster.length; i++){
      let itemName = dataMaster[i][0];
      let itemPagu = parseFloat(dataMaster[i][1]) || 0;
      if(itemName !== "") {
        masterItems.push({ name: itemName, pagu: itemPagu });
        totalPagu += itemPagu;
      }
    }
  }

  // B. DATA TRANSAKSI (INPUTAN)
  const shInput = ss.getSheetByName(ANGGARAN_SHEET);
  let totalRPD = 0;
  let totalRealisasi = 0;
  let rows = [];
  
  if (shInput && shInput.getLastRow() > 1) {
    // AMBIL 9 KOLOM (A s/d I) -> Kolom I adalah Realisasi
    const dataRange = shInput.getRange(2, 1, shInput.getLastRow() - 1, 9);
    const rawData = dataRange.getDisplayValues();
    const valuesData = dataRange.getValues();

    for(let i = 0; i < rawData.length; i++) {
       let rowDisplay = rawData[i]; 
       let rowValue = valuesData[i]; 
       
       let jumlahDiajukan = parseFloat(rowValue[5]) || 0; // Kolom F
       let nilaiRealisasi = parseFloat(rowValue[8]) || 0; // Kolom I (Realisasi)
       let rowUsername = rowDisplay[7]; 
       let realRowIndex = i + 2; // Baris asli di spreadsheet

       totalRPD += jumlahDiajukan;
       totalRealisasi += nilaiRealisasi;

       // Filter Hak Akses
       if(user.role === 'admin' || user.username === 'PPK1372' || user.username === 'BENDAHARA1372' || rowUsername === user.username) {
         // KITA KIRIM ARRAY BERSIH (10 ELEMEN)
         // 0-7: Data Inputan Standar
         // 8: Data Realisasi (Kolom I)
         // 9: Index Baris (Untuk Hapus/Edit)
         let cleanRow = [
            rowDisplay[0], // Timestamp
            rowDisplay[1], // PJ
            rowDisplay[2], // Item
            rowDisplay[3], // Bulan
            rowDisplay[4], // Tahun
            rowValue[5],   // Jumlah (Raw Number)
            rowDisplay[6], // Ket
            rowDisplay[7], // User
            nilaiRealisasi, // Realisasi (Raw Number) - Index 8
            realRowIndex    // ID Baris - Index 9
         ];
         rows.push(cleanRow);
       }
    }
  }
  
  let sisaAnggaran = totalPagu - totalRPD;
  let sisaRealisasi = totalRPD - totalRealisasi;
  
  return { 
    rows: rows, 
    masterItems: masterItems,
    totalPagu: totalPagu,
    totalRPD: totalRPD,
    totalRealisasi: totalRealisasi,
    sisaAnggaran: sisaAnggaran,
    sisaRealisasi: sisaRealisasi
  };
}

// 3. GET MASTER ITEMS (UNTUK DROPDOWN) - INI YANG TADI HILANG
function getMasterItems() {
  var ss = SpreadsheetApp.openById(ANGGARAN_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MASTER_ITEM_SHEET);
  if (!sheet) return []; 
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; 
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return data.map(function(r){ return r[0]; }).filter(function(r){ return r !== ""; });
}

// 4. HAPUS DATA
function deleteAnggaran(row) {
  try {
    const ss = SpreadsheetApp.openById(ANGGARAN_SPREADSHEET_ID);
    const sh = ss.getSheetByName(ANGGARAN_SHEET);
    sh.deleteRow(row);
    SpreadsheetApp.flush();
    return { status: "success" };
  } catch(e) {
    return { status: "error", message: e.toString() };
  }
}

// 5. EDIT DATA (RPD)
function updateEntry(data) {
  try {
    var ss = SpreadsheetApp.openById(ANGGARAN_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(ANGGARAN_SHEET);
    var rowIndex = parseInt(data.rowIndex);
    
    if (rowIndex < 2) return { status: "error", message: "Baris data tidak valid!" };

    sheet.getRange(rowIndex, 3).setValue(data.item); 
    sheet.getRange(rowIndex, 4).setValue(data.bulan); 
    sheet.getRange(rowIndex, 5).setValue(data.tahun); 
    sheet.getRange(rowIndex, 6).setValue(data.jumlah); 
    sheet.getRange(rowIndex, 7).setValue(data.ket); 
    
    return { status: "success" };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

// 6. UPDATE REALISASI (BARU - KHUSUS BENDAHARA)
function updateRealisasiEntry(data) {
  try {
    var ss = SpreadsheetApp.openById(ANGGARAN_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(ANGGARAN_SHEET);
    
    var rowIndex = parseInt(data.rowIndex);
    if (rowIndex < 2) return { status: "error", message: "Baris data tidak valid!" };

    // Update Kolom I (Kolom ke-9) untuk Realisasi
    sheet.getRange(rowIndex, 9).setValue(data.realisasi); 
    
    return { status: "success" };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}


/* =========================================
   KELOLA MASTER ITEM (FUNGSI BARU & FIXED)
   ========================================= */

// 1. Ambil Data Master Item (Untuk Tabel & Dropdown)
function getMasterItemData() {
  try {
    var ss = SpreadsheetApp.openById(ANGGARAN_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(MASTER_ITEM_SHEET);
    
    if (!sheet) return []; 

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return []; 

    // Ambil Data: Baris 2 sampai akhir, Kolom A(1) dan B(2)
    var range = sheet.getRange(2, 1, lastRow - 1, 2);
    var values = range.getValues();

    // FILTER PENTING: Hanya ambil yang Nama Item (index 0) TIDAK KOSONG
    // Kita juga simpan rowIndex (index array) untuk keperluan edit nanti
    var cleanData = values.map(function(row, index) {
       return {
         rowIndex: index, // index array (0-based)
         item: row[0],
         pagu: row[1]
       };
    }).filter(function(row) {
       return row.item !== "" && row.item != null;
    });

    return cleanData; 
  } catch(e) {
    return [];
  }
}

// 2. Simpan Perubahan Master Item (Edit & Tambah)
function saveMasterItemData(data) {
  var ss = SpreadsheetApp.openById(ANGGARAN_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MASTER_ITEM_SHEET);
  
  try {
    // Jika rowIndex kosong/null, berarti Tambah Baru
    if (data.rowIndex === "" || data.rowIndex === null || data.rowIndex === undefined) {
      sheet.appendRow([data.item, data.pagu]);
    } else {
      // Jika ada rowIndex, berarti Edit
      // Konversi index array ke baris spreadsheet: index + 2 (header ada di baris 1)
      var row = parseInt(data.rowIndex) + 2; 
      
      sheet.getRange(row, 1).setValue(data.item); // Update Nama
      sheet.getRange(row, 2).setValue(data.pagu); // Update Pagu
    }
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}
