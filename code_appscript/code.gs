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
   LOGIKA ANGGARAN
================================*/
function simpanAnggaran(data) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); 
    var ss = SpreadsheetApp.openById(ANGGARAN_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(ANGGARAN_SHEET); 
    if (!sheet) return { status: "error", message: "Sheet INPUTAN tidak ditemukan!" };

    var timestamp = new Date();
    var user = getUser(); 

    // [Timestamp, PJ, Item, Bulan, Tahun, Jumlah, Ket, User]
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

function getMonitoringData() {
  const user = getUser();
  const ss = SpreadsheetApp.openById(ANGGARAN_SPREADSHEET_ID);
  
  // 1. AMBIL DATA MASTER ITEM (Detailed)
  const shMaster = ss.getSheetByName(MASTER_ITEM_SHEET);
  let masterItems = [];
  let totalPagu = 0;

  if(shMaster) {
    const dataMaster = shMaster.getDataRange().getValues();
    // Mulai dari row 1 (karena row 0 header)
    for(let i = 1; i < dataMaster.length; i++){
      let itemName = dataMaster[i][0];
      let itemPagu = parseFloat(dataMaster[i][1]) || 0;
      
      if(itemName !== "") {
        masterItems.push({ name: itemName, pagu: itemPagu });
        totalPagu += itemPagu;
      }
    }
  }

  // 2. AMBIL DATA INPUTAN
  const shInput = ss.getSheetByName(ANGGARAN_SHEET);
  let totalRealisasi = 0;
  let rows = [];
  
  if (shInput && shInput.getLastRow() > 1) {
    const rawData = shInput.getRange(2, 1, shInput.getLastRow() - 1, 8).getDisplayValues();
    const valuesData = shInput.getRange(2, 1, shInput.getLastRow() - 1, 8).getValues();

    for(let i = 0; i < rawData.length; i++) {
       let rowDisplay = rawData[i];
       let rowValue = valuesData[i]; 
       
       let jumlahDiajukan = parseFloat(rowValue[5]) || 0; 
       let rowUsername = rowDisplay[7]; 
       let realRowIndex = i + 2; 

       totalRealisasi += jumlahDiajukan;

       if(user.role === 'admin' || user.username === 'PPK1372' || rowUsername === user.username) {
         let dataToSend = [...rowDisplay, realRowIndex]; 
         rows.push(dataToSend);
       }
    }
  }
  
  let sisaAnggaran = totalPagu - totalRealisasi;
  
  return { 
    rows: rows, 
    masterItems: masterItems, // Kirim detail master ke frontend
    totalPagu: totalPagu,
    totalRealisasi: totalRealisasi,
    sisaAnggaran: sisaAnggaran
  };
}

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

function getMasterItems() {
  var ss = SpreadsheetApp.openById(ANGGARAN_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MASTER_ITEM_SHEET);
  if (!sheet) return []; 
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; 
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return data.map(function(r){ return r[0]; }).filter(function(r){ return r !== ""; });
}
