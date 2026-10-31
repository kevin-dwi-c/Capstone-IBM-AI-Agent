# 💰 PocketBuddy

**Catat Pemasukan, Pantau Pengeluaran, Kendalikan Budget**

PocketBuddy adalah aplikasi web sederhana untuk membantu mahasiswa dan anak kos mengatur uang bulanan agar cukup sampai akhir bulan. Project ini dibuat sebagai Capstone Project **IBM SkillsBuild x Hacktiv8 (Track IT)** dengan bantuan **IBM Bob** sebagai AI coding agent.

🔗 **Demo:** https://kevin-dwi-c.github.io/Capstone-IBM-AI-Agent/

---

## ✨ Fitur Utama

- **Pengaturan budget bulanan**: atur uang bulanan dan budget per kategori (Makan, Jajan, Transport, Kuliah, Lainnya), dengan validasi agar total budget tidak melebihi uang bulanan.
- **Pencatatan transaksi**: tambah, edit, dan hapus pemasukan serta pengeluaran, dengan format ribuan otomatis.
- **Dashboard ringkasan**: total pemasukan, total pengeluaran, sisa saldo, dan sisa uang per hari.
- **Peringatan otomatis**: progress bar per kategori berubah warna (hijau, oranye, merah) saat budget hampir habis atau terlampaui.
- **Grafik**: donut chart pengeluaran per kategori dan grafik cashflow pemasukan vs pengeluaran per rentang tanggal.
- **Data per bulan**: navigasi bulan lalu, bulan ini, dan bulan depan, dengan pergantian bulan otomatis.
- **Responsif**: nyaman dipakai di desktop maupun HP.

## 🛠️ Teknologi

- HTML, Tailwind CSS (CDN), Vanilla JavaScript
- Chart.js untuk grafik
- localStorage untuk penyimpanan data di browser
- IBM Bob (mode Agent) sebagai AI coding assistant

## 🚀 Cara Menjalankan

1. Clone repository ini:
   ```bash
   git clone https://github.com/kevin-dwi-c/Capstone-IBM-AI-Agent.git
   ```
2. Buka file `index.html` di browser, atau jalankan dengan ekstensi **Live Server** di VS Code / IBM Bob.

Tidak perlu instalasi tambahan atau backend.

## 🤖 Proses Pengembangan dengan IBM Bob

Aplikasi dikembangkan menggunakan **prompt 3 layer**:

1. **Role & Context**: peran Bob, tujuan aplikasi, dan batasan teknologi.
2. **Task & Requirements**: daftar fitur yang harus dibangun.
3. **Constraints & Output**: standar tampilan, format, dan kualitas kode.

Pengembangan dilakukan dalam **10 iterasi**. Setiap hasil dites terlebih dahulu, lalu prompt direvisi hanya pada layer yang bermasalah (Layer 2 untuk fitur, Layer 3 untuk tampilan).

## 🔮 Pengembangan Selanjutnya

- Login dan database cloud agar data tersimpan per pengguna dan sinkron antar perangkat
- Riwayat dan rekap keuangan per tahun
- PWA (bisa di-install di HP), backup, dan export data
- Asisten AI (IBM Granite / watsonx.ai) untuk saran hemat dan prediksi saldo

## 👤 Author

**Kevin Dwi Cahyadi**, Capstone Project IBM SkillsBuild x Hacktiv8
