"""
Generate mock news articles and sentiment signals for Jakarta housing data.

Produces 36 months (Mar 2023 - Feb 2026) of news data correlated with the
existing price_history.csv movements. Outputs:
  - data/articles.csv        (~700 articles with sentiment metadata)
  - data/news_signals.csv    (aggregated monthly signals per region/scope)

Usage:
  python generate_mock_news.py
"""

import os
import random
import shutil
from collections import Counter
from datetime import datetime, timedelta

import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REGIONS = [
    "Jakarta Selatan",
    "Jakarta Pusat",
    "Jakarta Barat",
    "Jakarta Timur",
    "Jakarta Utara",
]

SOURCES = [
    ("Kompas.com", 0.25),
    ("Detik Finance", 0.20),
    ("Bisnis Indonesia", 0.15),
    ("Jakarta Post", 0.10),
    ("Kontan", 0.10),
    ("CNBC Indonesia", 0.10),
    ("Tribun News", 0.10),
]
SOURCE_NAMES = [s[0] for s in SOURCES]
SOURCE_WEIGHTS = [s[1] for s in SOURCES]

CATEGORIES = [
    "infrastructure",
    "policy",
    "market",
    "disaster",
    "development",
    "economy",
    "environment",
]

# Impact magnitude ranges by category
CATEGORY_IMPACT = {
    "infrastructure": (0.05, 0.15),
    "policy": (0.05, 0.15),
    "disaster": (0.05, 0.15),
    "development": (0.05, 0.12),
    "market": (0.05, 0.12),
    "economy": (0.05, 0.12),
    "environment": (0.05, 0.12),
}

MONTHS = 36  # Mar 2023 - Feb 2026
random.seed(42)

# ---------------------------------------------------------------------------
# Region-specific news templates
# Each template: (category, title, summary, sentiment_range, seasonal_months)
# seasonal_months=None means any month; otherwise a list of favored months.
# ---------------------------------------------------------------------------

REGION_TEMPLATES = {
    "Jakarta Utara": [
        # Disaster / flooding (seasonal Nov-Mar)
        ("disaster",
         "Banjir Melanda Kawasan Pesisir Jakarta Utara",
         "Banjir rob kembali menerjang permukiman warga di wilayah pesisir Jakarta Utara, menyebabkan kerugian material yang signifikan.",
         (-0.08, -0.02), [11, 12, 1, 2, 3]),
        ("disaster",
         "Ratusan Rumah Terendam Banjir di Penjaringan",
         "Intensitas hujan tinggi mengakibatkan banjir setinggi 50 cm di Penjaringan, Jakarta Utara.",
         (-0.06, -0.02), [11, 12, 1, 2, 3]),
        ("disaster",
         "Tanggul Laut Jakarta Utara Jebol Akibat Gelombang Tinggi",
         "Gelombang pasang merusak tanggul pelindung di kawasan Muara Baru, mengancam permukiman sekitar.",
         (-0.08, -0.02), [12, 1, 2]),
        # Environment
        ("environment",
         "Penurunan Tanah di Jakarta Utara Semakin Mengkhawatirkan",
         "Studi terbaru menunjukkan laju penurunan muka tanah di Jakarta Utara mencapai 7 cm per tahun.",
         (-0.06, -0.02), None),
        ("environment",
         "Kualitas Air Bersih di Jakarta Utara Memburuk",
         "Pencemaran air tanah di wilayah pesisir utara semakin meningkat akibat intrusi air laut.",
         (-0.06, -0.02), None),
        # Development (PIK)
        ("development",
         "PIK 2 Tahap Baru Mulai Konstruksi",
         "Pembangunan fase terbaru Pantai Indah Kapuk 2 dimulai dengan target penyelesaian 2 tahun.",
         (0.02, 0.08), None),
        ("development",
         "Kawasan Reklamasi Jakarta Utara Tarik Investasi Baru",
         "Pengembang besar mengumumkan proyek mixed-use di area reklamasi pantai utara Jakarta.",
         (0.02, 0.06), None),
        ("development",
         "Mall Premium Baru Dibuka di PIK Avenue",
         "Pusat perbelanjaan premium baru dengan lebih dari 200 tenant resmi beroperasi di PIK Avenue.",
         (0.02, 0.06), None),
        ("development",
         "RS Internasional Baru Dibangun di Kelapa Gading",
         "Rumah sakit berstandar internasional dengan 300 bed akan dibangun di kawasan Kelapa Gading.",
         (0.02, 0.08), None),
        ("development",
         "Sekolah Internasional Baru Hadir di Pantai Indah Kapuk",
         "Sekolah internasional berkurikulum Cambridge akan dibuka untuk melayani keluarga di PIK dan sekitarnya.",
         (0.02, 0.06), None),
        # Infrastructure
        ("infrastructure",
         "Modernisasi Pelabuhan Tanjung Priok Rampung",
         "Peningkatan kapasitas pelabuhan diharapkan mendorong ekonomi Jakarta Utara.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Jalan Tol Akses Baru ke Pelabuhan Utara Dibuka",
         "Akses tol baru mempersingkat waktu tempuh ke kawasan pelabuhan Jakarta Utara.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Flyover Kelapa Gading-Sunter Rampung Dibangun",
         "Flyover baru menghubungkan Kelapa Gading dan Sunter, mengurangi kemacetan 40% di jam sibuk.",
         (0.02, 0.08), None),
        ("infrastructure",
         "Sistem Drainase Baru untuk Kawasan Pesisir Utara",
         "Proyek perbaikan drainase senilai Rp 500 miliar dimulai untuk mengatasi banjir tahunan.",
         (0.02, 0.06), [3, 4, 5, 6]),
        ("infrastructure",
         "Jaringan Fiber Optik 5G Diperluas ke Seluruh Jakarta Utara",
         "Operator telekomunikasi menyelesaikan pemasangan jaringan 5G untuk kawasan Jakarta Utara.",
         (0.02, 0.06), None),
        ("infrastructure",
         "PDAM Perluas Jaringan Air Bersih ke Cilincing",
         "Proyek perluasan jaringan air bersih menjangkau 15.000 rumah tangga baru di Cilincing.",
         (0.02, 0.06), None),
    ],
    "Jakarta Selatan": [
        # Infrastructure (MRT/LRT/roads)
        ("infrastructure",
         "MRT Fase 2 Capai Stasiun Fatmawati",
         "Proyek perpanjangan MRT Jakarta menuju selatan terus menunjukkan kemajuan signifikan.",
         (0.02, 0.08), None),
        ("infrastructure",
         "LRT Jabodebek Tingkatkan Konektivitas Jakarta Selatan",
         "Pengoperasian LRT membuka akses baru ke kawasan premium di selatan Jakarta.",
         (0.02, 0.08), None),
        ("infrastructure",
         "Jalan Layang Antasari-Blok M Resmi Beroperasi",
         "Jalan layang baru memangkas waktu tempuh Antasari ke Blok M dari 45 menjadi 15 menit.",
         (0.02, 0.08), None),
        ("infrastructure",
         "Koridor TransJakarta Baru Hubungkan Cilandak ke Sudirman",
         "Rute BRT baru meningkatkan opsi transportasi umum untuk warga Cilandak dan sekitarnya.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Underpass Mampang Selesai Dibangun",
         "Underpass baru di Mampang Prapatan mengurangi kemacetan di persimpangan utama Jakarta Selatan.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Jaringan Pipa Gas Baru untuk Kawasan Kebayoran",
         "PGN menyelesaikan instalasi jaringan gas rumah tangga untuk 10.000 rumah di Kebayoran.",
         (0.02, 0.06), None),
        # Development (premium residential)
        ("development",
         "Proyek Residensial Premium Baru di Kebayoran",
         "Pengembang luncurkan hunian mewah berkonsep smart home di kawasan Kebayoran Baru.",
         (0.02, 0.06), None),
        ("development",
         "Kawasan Kemang Transformasi Jadi Hub Mixed-Use",
         "Proyek revitalisasi Kemang mencakup residensial, komersial, dan ruang publik baru.",
         (0.02, 0.06), None),
        ("development",
         "Rumah Sakit Tipe A Baru Dibangun di Pasar Minggu",
         "RS tipe A dengan fasilitas lengkap termasuk helipad dan pusat jantung mulai dibangun di Pasar Minggu.",
         (0.02, 0.08), None),
        ("development",
         "Kampus Universitas Ternama Buka Cabang di Pondok Indah",
         "Universitas terkemuka Indonesia membuka kampus cabang baru di kawasan Pondok Indah.",
         (0.02, 0.06), None),
        ("development",
         "Pusat Perbelanjaan Baru Hadir di Cilandak",
         "Mall lifestyle berkonsep open-air dengan 150 tenant akan dibuka di Cilandak Town Square.",
         (0.02, 0.06), None),
        ("development",
         "Taman Kota Seluas 5 Hektar Dibangun di Jagakarsa",
         "Pemda DKI membangun taman kota baru lengkap dengan jogging track, playground, dan skatepark.",
         (0.02, 0.06), None),
        # Market (expat demand)
        ("market",
         "Permintaan Ekspat Dorong Harga Sewa di Senayan",
         "Komunitas ekspatriat yang berkembang mendorong kenaikan harga sewa di kawasan premium Jakarta Selatan.",
         (0.02, 0.06), None),
        ("market",
         "Harga Properti Pondok Indah Tembus Rekor Baru",
         "Kawasan Pondok Indah mencatat harga tanah tertinggi sepanjang sejarah.",
         (0.02, 0.06), None),
        # Environment
        ("environment",
         "Ruang Terbuka Hijau Jakarta Selatan Bertambah",
         "Pemkot DKI Jakarta meresmikan taman kota baru di kawasan Kebayoran Lama.",
         (0.02, 0.06), None),
    ],
    "Jakarta Pusat": [
        # Policy (government/CBD)
        ("policy",
         "Regulasi Zonasi Baru untuk CBD Jakarta Pusat",
         "Pemerintah provinsi mengumumkan pembaruan zonasi untuk kawasan bisnis pusat Jakarta.",
         (-0.03, 0.05), None),
        ("policy",
         "Moratorium Pembangunan Hotel di Kawasan Thamrin",
         "Kebijakan pembatasan pembangunan hotel baru di koridor Thamrin-Sudirman berlaku efektif.",
         (-0.02, 0.04), None),
        # Development
        ("development",
         "Superblok Baru Direncanakan di Dekat Monas",
         "Proyek pengembangan mixed-use berskala besar diumumkan untuk area sekitar Monas.",
         (0.02, 0.06), None),
        ("development",
         "Revitalisasi Pasar Tanah Abang Dimulai",
         "Proyek modernisasi pasar terbesar di Asia Tenggara resmi dimulai.",
         (0.02, 0.06), None),
        ("development",
         "Hotel Bintang 5 Baru di Koridor Thamrin",
         "Jaringan hotel internasional membangun properti bintang 5 baru di Jalan Thamrin.",
         (0.02, 0.06), None),
        ("development",
         "Gedung Perkantoran Grade A Baru di SCBD",
         "Menara perkantoran 50 lantai berkonsep green building mulai konstruksi di SCBD.",
         (0.02, 0.06), None),
        ("development",
         "Pusat Kebudayaan Nasional Baru di Kemayoran",
         "Kompleks kebudayaan mencakup galeri seni, auditorium, dan museum akan dibangun di Kemayoran.",
         (0.02, 0.06), None),
        # Infrastructure
        ("infrastructure",
         "Hub Transit Bawah Tanah Sudirman Disetujui",
         "Proyek hub transit terintegrasi di bawah jalan Sudirman akan menghubungkan MRT, LRT, dan bus rapid transit.",
         (0.02, 0.08), None),
        ("infrastructure",
         "Pedestrianisasi Jalan Sabang Selesai",
         "Proyek pedestrianisasi kawasan kuliner Sabang meningkatkan kualitas ruang publik Jakarta Pusat.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Terowongan Bawah Tanah Tanah Abang-Sudirman Disetujui",
         "Proyek terowongan kendaraan akan menghubungkan Tanah Abang langsung ke Sudirman tanpa macet.",
         (0.02, 0.08), None),
        ("infrastructure",
         "Smart Traffic System Dipasang di 50 Persimpangan Pusat",
         "Sistem lampu lalu lintas cerdas berbasis AI mengurangi kemacetan 25% di Jakarta Pusat.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Jaringan Listrik Bawah Tanah untuk Kawasan Menteng",
         "PLN menyelesaikan proyek kabel listrik bawah tanah di kawasan heritage Menteng.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Stasiun MRT Baru di Glodok Mulai Konstruksi",
         "Pembangunan stasiun MRT fase 2 di Glodok meningkatkan konektivitas Kota Tua.",
         (0.02, 0.08), None),
        # Market
        ("market",
         "Tingkat Hunian Perkantoran Jakarta Pusat Pulih",
         "Occupancy rate kantor di CBD Jakarta kembali ke level pra-pandemi.",
         (0.02, 0.06), None),
    ],
    "Jakarta Barat": [
        # Development (townships/facilities)
        ("development",
         "Pengembangan Township Baru di Jakarta Barat",
         "Proyek kota mandiri berskala besar diumumkan untuk kawasan barat Jakarta.",
         (0.02, 0.06), None),
        ("development",
         "Green Office Park Baru di Puri Indah",
         "Kawasan perkantoran berkonsep hijau akan dibangun di koridor Puri Indah.",
         (0.02, 0.06), None),
        ("development",
         "Hypermarket dan Pusat Grosir Baru di Cengkareng",
         "Pusat perbelanjaan grosir dan hypermarket berskala besar akan dibuka di Cengkareng.",
         (0.02, 0.06), None),
        ("development",
         "RS Ibu dan Anak Baru Beroperasi di Kebon Jeruk",
         "Rumah sakit spesialis ibu dan anak dengan 150 bed resmi beroperasi di Kebon Jeruk.",
         (0.02, 0.06), None),
        ("development",
         "Sekolah Bertaraf Internasional Baru di Meruya",
         "Sekolah dengan kurikulum nasional plus dan fasilitas modern dibuka di Meruya Utara.",
         (0.02, 0.06), None),
        ("development",
         "Data Center Hyperscale Dibangun di Kawasan Industri Barat",
         "Perusahaan teknologi global membangun data center berskala besar di Jakarta Barat.",
         (0.02, 0.06), None),
        # Infrastructure
        ("infrastructure",
         "Tol Tangerang-Jakarta Ruas Baru Dibuka",
         "Pembukaan ruas tol baru mempersingkat waktu tempuh Jakarta Barat ke Tangerang.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Stasiun KRL Baru di Kembangan Beroperasi",
         "Stasiun commuter line baru meningkatkan aksesibilitas kawasan barat Jakarta.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Flyover Tomang-Grogol Selesai Dibangun",
         "Flyover baru mengurai kemacetan parah di simpang Tomang-Grogol setiap jam sibuk.",
         (0.02, 0.08), None),
        ("infrastructure",
         "Pelebaran Jalan Daan Mogot Rampung",
         "Proyek pelebaran Jalan Daan Mogot dari 4 menjadi 6 lajur selesai setelah 18 bulan.",
         (0.02, 0.06), None),
        ("infrastructure",
         "SPAM Baru Sediakan Air Bersih untuk 20.000 KK di Kalideres",
         "Sistem penyediaan air minum baru menjangkau ribuan rumah tangga di Kalideres.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Jembatan Penyeberangan Modern di Slipi Diresmikan",
         "JPO modern dengan lift dan eskalator dibangun di kawasan padat Slipi.",
         (0.01, 0.04), None),
        # Market
        ("market",
         "Harga Lahan Industri Jakarta Barat Naik",
         "Permintaan lahan industri dan logistik di koridor barat Jakarta meningkat tajam.",
         (0.02, 0.06), None),
        ("market",
         "Pasar Properti Cengkareng Tumbuh Stabil",
         "Kawasan Cengkareng mencatat pertumbuhan transaksi properti yang konsisten.",
         (0.01, 0.04), None),
        # Disaster
        ("disaster",
         "Banjir Rendam Kawasan Kalideres Jakarta Barat",
         "Hujan deras mengakibatkan genangan di beberapa titik di Kalideres.",
         (-0.06, -0.02), [11, 12, 1, 2, 3]),
    ],
    "Jakarta Timur": [
        # Infrastructure (LRT/toll/roads)
        ("infrastructure",
         "Perpanjangan LRT ke Bekasi via Jakarta Timur Disetujui",
         "Rencana perpanjangan LRT dari Jakarta Timur ke Bekasi mendapat persetujuan pemerintah.",
         (0.02, 0.08), None),
        ("infrastructure",
         "Jalan Tol JORR Timur Selesai Diperbaiki",
         "Perbaikan ruas JORR timur meningkatkan konektivitas Jakarta Timur.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Flyover Cipinang-Jatinegara Mulai Dibangun",
         "Flyover baru akan mengurai kemacetan di persimpangan padat Cipinang-Jatinegara.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Pelebaran Jalan Raya Bogor Selesai Tahap Pertama",
         "Pelebaran Jalan Raya Bogor dari Pasar Rebo hingga Ciracas rampung, lalu lintas membaik.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Koridor TransJakarta Baru ke Pulogebang Beroperasi",
         "Rute BRT baru menghubungkan Terminal Pulogebang langsung ke Kampung Melayu.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Waduk Retensi Baru di Cipinang Selesai Dibangun",
         "Waduk baru berkapasitas 1 juta meter kubik mengurangi risiko banjir di Jakarta Timur.",
         (0.02, 0.06), None),
        ("infrastructure",
         "Gardu Induk PLN Baru untuk Jakarta Timur Beroperasi",
         "Gardu induk 150 kV baru meningkatkan keandalan pasokan listrik untuk 200.000 pelanggan.",
         (0.02, 0.06), None),
        # Market (affordable housing)
        ("market",
         "Permintaan Rumah Terjangkau di Jakarta Timur Melonjak",
         "Pembeli rumah pertama semakin memilih kawasan timur Jakarta karena harga yang lebih terjangkau.",
         (0.02, 0.06), None),
        ("market",
         "Harga Properti Cakung Naik Signifikan",
         "Kawasan Cakung mencatat kenaikan harga properti tertinggi di Jakarta Timur.",
         (0.02, 0.06), None),
        # Development
        ("development",
         "Pusat Komersial Baru Direncanakan di Cipinang",
         "Proyek pengembangan retail dan perkantoran baru akan dibangun di Cipinang.",
         (0.02, 0.06), None),
        ("development",
         "Kawasan TOD Baru di Stasiun Jatinegara",
         "Pengembangan transit-oriented development di sekitar Stasiun Jatinegara diumumkan.",
         (0.02, 0.06), None),
        ("development",
         "RSUD Baru Tipe B Dibangun di Duren Sawit",
         "Rumah sakit umum daerah baru dengan 250 bed mulai dibangun untuk melayani warga Jakarta Timur.",
         (0.02, 0.06), None),
        ("development",
         "Pasar Rakyat Modern Dibuka di Kramat Jati",
         "Pasar tradisional Kramat Jati selesai direvitalisasi menjadi pasar modern berfasilitas lengkap.",
         (0.02, 0.06), None),
        ("development",
         "Klaster Perumahan Baru Sasar Milenial di Cakung",
         "Pengembang luncurkan 500 unit rumah terjangkau khusus untuk pembeli milenial di Cakung.",
         (0.02, 0.06), None),
        # Environment
        ("environment",
         "Sungai Ciliwung di Jakarta Timur Dinormalisasi",
         "Proyek normalisasi sungai mengurangi risiko banjir di kawasan bantaran.",
         (0.02, 0.06), None),
    ],
}

# National templates (region_id will be empty)
NATIONAL_TEMPLATES = [
    ("policy",
     "Bank Indonesia Pertahankan Suku Bunga Acuan",
     "Bank sentral mempertahankan suku bunga acuan di level stabil untuk mendukung pertumbuhan ekonomi.",
     (-0.02, 0.04)),
    ("policy",
     "Regulasi Baru Kepemilikan Properti Asing Diumumkan",
     "Pemerintah mengumumkan pembaruan regulasi kepemilikan properti untuk warga negara asing.",
     (0.02, 0.06)),
    ("policy",
     "Insentif Pajak untuk Pembeli Rumah Pertama Diperpanjang",
     "Pemerintah memperpanjang pembebasan PPnBM untuk pembelian rumah pertama.",
     (0.02, 0.08)),
    ("policy",
     "BI Naikkan Suku Bunga untuk Stabilkan Rupiah",
     "Bank Indonesia menaikkan suku bunga acuan sebagai respons terhadap tekanan nilai tukar.",
     (-0.06, -0.02)),
    ("policy",
     "Perubahan Aturan IMB Menjadi PBG Resmi Berlaku",
     "Transisi dari Izin Mendirikan Bangunan ke Persetujuan Bangunan Gedung resmi berlaku nasional.",
     (-0.02, 0.04)),
    ("economy",
     "PDB Indonesia Tumbuh di Atas Ekspektasi",
     "Pertumbuhan ekonomi Indonesia melampaui proyeksi analis untuk kuartal ini.",
     (0.02, 0.06)),
    ("economy",
     "Investasi Asing Langsung Meningkat Tajam",
     "Arus investasi asing ke sektor properti Indonesia mencatat kenaikan signifikan.",
     (0.02, 0.06)),
    ("economy",
     "Perkembangan Ibu Kota Nusantara (IKN)",
     "Progres pembangunan ibu kota baru Nusantara di Kalimantan Timur dilaporkan.",
     (-0.02, 0.04)),
    ("economy",
     "Inflasi Indonesia Terkendali di Level Rendah",
     "Tingkat inflasi tahunan Indonesia tetap berada di kisaran target Bank Indonesia.",
     (0.01, 0.04)),
    ("economy",
     "Rupiah Menguat Terhadap Dolar AS",
     "Penguatan rupiah meningkatkan daya beli dan menarik minat investor asing di sektor properti.",
     (0.02, 0.06)),
    ("market",
     "Indeks Harga Properti Nasional Menunjukkan Tren Positif",
     "Indeks harga properti residensial Indonesia mencatat kenaikan kuartalan.",
     (0.02, 0.06)),
    ("market",
     "Volume Transaksi Properti Nasional Menurun",
     "Jumlah transaksi jual beli properti secara nasional mengalami penurunan kuartalan.",
     (-0.06, -0.02)),
    ("market",
     "Sektor Properti Komersial Alami Pemulihan",
     "Tingkat hunian dan harga sewa properti komersial menunjukkan tanda pemulihan pasca pandemi.",
     (0.02, 0.06)),
    ("market",
     "Kredit Properti Perbankan Tumbuh Dua Digit",
     "Penyaluran kredit pemilikan rumah (KPR) perbankan nasional tumbuh lebih dari 10% year-on-year.",
     (0.02, 0.06)),
    ("infrastructure",
     "Proyek Kereta Cepat Jakarta-Surabaya Disetujui",
     "Pemerintah menyetujui studi kelayakan kereta cepat Jakarta-Surabaya sepanjang 720 km.",
     (0.02, 0.06)),
    ("infrastructure",
     "Tol Trans Jawa Seluruh Ruas Beroperasi Penuh",
     "Seluruh ruas jalan tol Trans Jawa resmi beroperasi, menghubungkan Anyer hingga Surabaya.",
     (0.02, 0.06)),
    ("infrastructure",
     "Program Satu Juta Rumah Capai Target Tahunan",
     "Program pembangunan satu juta rumah pemerintah melampaui target untuk tahun ini.",
     (0.02, 0.06)),
    ("environment",
     "Kebijakan Bangunan Hijau Wajib untuk Proyek Baru",
     "Pemerintah mewajibkan standar green building untuk semua proyek konstruksi baru berskala besar.",
     (0.01, 0.04)),
    ("environment",
     "Jakarta Targetkan Net Zero Emission Bangunan 2050",
     "Pemda DKI Jakarta menetapkan roadmap menuju bangunan nol emisi karbon pada 2050.",
     (-0.02, 0.04)),
]

EVENT_NEWS = {
    # 2023 Q1-Q2: post-pandemic correction dip — AMPLIFIED
    (2023, 3): [
        ("national", "economy",
         "Koreksi Pasar Properti Pasca-Pandemi Berlanjut",
         "Harga properti di Indonesia mengalami penyesuaian tajam setelah lonjakan selama pandemi.",
         -0.85, 0.90),
        ("national", "market",
         "Kekhawatiran Kelebihan Pasokan Properti Jakarta",
         "Analis memperingatkan potensi oversupply apartemen dan rumah di kawasan Jabodetabek.",
         -0.80, 0.85),
        ("national", "economy",
         "Bank Besar Perketat Syarat KPR",
         "Perbankan memperketat persyaratan kredit properti di tengah ketidakpastian pasar.",
         -0.70, 0.80),
    ],
    (2023, 4): [
        ("national", "economy",
         "Pemulihan Ekonomi Lebih Lambat dari Prediksi",
         "Data ekonomi kuartal pertama menunjukkan pemulihan yang lebih lamban dari ekspektasi pasar.",
         -0.80, 0.85),
        ("national", "market",
         "Penjualan Properti Baru Turun 20% Year-on-Year",
         "Pengembang melaporkan penurunan signifikan dalam penjualan unit baru.",
         -0.75, 0.80),
        ("national", "market",
         "Harga Rumah Bekas Ikut Terkoreksi",
         "Pasar properti sekunder juga mengalami tekanan harga yang signifikan.",
         -0.65, 0.75),
    ],
    (2023, 5): [
        ("national", "market",
         "Volume Transaksi Properti Turun 15% Tahunan",
         "Data BPS menunjukkan penurunan volume transaksi properti dibandingkan tahun lalu.",
         -0.70, 0.80),
        ("national", "economy",
         "Daya Beli Masyarakat untuk Properti Menurun",
         "Survei menunjukkan penurunan kemampuan masyarakat membeli rumah.",
         -0.65, 0.75),
    ],
    (2023, 6): [
        ("national", "economy",
         "Tanda Stabilisasi Pasar Mulai Terlihat",
         "Indikator pasar properti menunjukkan koreksi mulai mereda di kuartal kedua 2023.",
         -0.40, 0.70),
        ("national", "market",
         "Pengembang Optimis Pasar Pulih Semester Kedua",
         "Asosiasi pengembang memperkirakan pemulihan bertahap mulai paruh kedua 2023.",
         -0.30, 0.65),
    ],
    # 2024 Q1: Jakarta Utara flood disaster — REGIONAL
    (2024, 1): [
        ("national", "disaster",
         "Banjir Besar Jakarta Utara Terjang Ribuan Rumah",
         "Banjir terparah dalam 5 tahun melanda kawasan pesisir Jakarta Utara.",
         -0.90, 0.90),
        ("national", "disaster",
         "Kerugian Banjir Jakarta Utara Capai Triliunan Rupiah",
         "Kerugian material akibat banjir diperkirakan mencapai Rp 2 triliun.",
         -0.85, 0.85),
        ("national", "disaster",
         "Ribuan Warga Jakarta Utara Mengungsi",
         "Evakuasi besar-besaran dilakukan di kawasan Penjaringan dan Cilincing.",
         -0.80, 0.80),
    ],
    (2024, 2): [
        ("national", "disaster",
         "Pemulihan Pasca Banjir Jakarta Utara Berjalan Lambat",
         "Proses rehabilitasi rumah warga terdampak banjir masih terkendala.",
         -0.70, 0.80),
        ("national", "environment",
         "Harga Properti Pesisir Utara Tertekan Pasca Banjir",
         "Pasar properti di Jakarta Utara mengalami penurunan permintaan.",
         -0.65, 0.75),
    ],
    # 2024 Q3: election bump — AMPLIFIED
    (2024, 7): [
        ("national", "policy",
         "Pemerintahan Baru Sinyal Kebijakan Pro-Pembangunan",
         "Kabinet baru mengumumkan prioritas pembangunan infrastruktur dan perumahan rakyat.",
         0.80, 0.90),
        ("national", "economy",
         "Kepercayaan Investor Meningkat Pasca Pemilu",
         "Survei menunjukkan peningkatan kepercayaan investor di sektor properti.",
         0.75, 0.85),
        ("national", "policy",
         "Stimulus Fiskal untuk Sektor Properti Diumumkan",
         "Pemerintah mengalokasikan anggaran khusus untuk mendorong sektor properti.",
         0.70, 0.80),
    ],
    (2024, 8): [
        ("national", "policy",
         "Pemerintah Luncurkan Paket Stimulus Perumahan",
         "Program stimulus baru mencakup subsidi bunga KPR dan kemudahan perizinan.",
         0.85, 0.90),
        ("national", "economy",
         "Investasi Asing Melonjak Pasca Pemilu",
         "Arus modal asing ke sektor properti Indonesia mencatat lonjakan signifikan.",
         0.80, 0.85),
        ("national", "market",
         "Penjualan Properti Baru Melonjak 30% Pasca Stimulus",
         "Paket stimulus pemerintah langsung berdampak pada peningkatan transaksi properti.",
         0.75, 0.85),
    ],
    (2024, 9): [
        ("national", "policy",
         "Anggaran Infrastruktur Naik 30% dari Pemerintahan Sebelumnya",
         "Alokasi anggaran infrastruktur dalam APBN meningkat tajam.",
         0.80, 0.85),
        ("national", "infrastructure",
         "Proyek Infrastruktur Strategis Nasional Dipercepat",
         "Pemerintah mempercepat 12 proyek strategis nasional termasuk jaringan transportasi.",
         0.85, 0.90),
        ("national", "economy",
         "PDB Indonesia Tumbuh Melampaui Ekspektasi",
         "Pertumbuhan ekonomi kuartal ketiga melampaui proyeksi seluruh analis.",
         0.75, 0.80),
    ],
    # 2025 Q2: MRT Phase 2 opening — REGIONAL (positive for Jakarta Selatan)
    (2025, 5): [
        ("national", "infrastructure",
         "MRT Fase 2 Jakarta Resmi Beroperasi",
         "Pembukaan MRT fase 2 meningkatkan aksesibilitas kawasan selatan Jakarta secara drastis.",
         0.90, 0.90),
        ("national", "infrastructure",
         "Harga Properti Sekitar Stasiun MRT Melonjak",
         "Properti dalam radius 500m dari stasiun MRT baru mengalami kenaikan harga 15-25%.",
         0.85, 0.85),
        ("national", "development",
         "TOD Masif Direncanakan di Sepanjang Rute MRT Fase 2",
         "Pengembang berlomba mengajukan proposal transit-oriented development.",
         0.80, 0.85),
    ],
    (2025, 6): [
        ("national", "infrastructure",
         "Dampak MRT Fase 2 pada Properti Melebihi Ekspektasi",
         "Data transaksi menunjukkan lonjakan minat beli di koridor MRT selatan.",
         0.80, 0.85),
        ("national", "market",
         "Jakarta Selatan Jadi Kawasan Properti Terpanas",
         "Wilayah Jakarta Selatan mencatat pertumbuhan harga tercepat di Jabodetabek.",
         0.75, 0.80),
    ],
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def pick_source():
    """Pick a random news source weighted by distribution."""
    return random.choices(SOURCE_NAMES, weights=SOURCE_WEIGHTS, k=1)[0]


def index_to_date(month_idx):
    """Convert month index (0=Mar 2023) to (year, month)."""
    m = 3 + month_idx
    year = 2023 + (m - 1) // 12
    month = ((m - 1) % 12) + 1
    return year, month


def random_day_in_month(year, month):
    """Pick a random day within a given month."""
    if month == 12:
        max_day = 31
    else:
        next_month = datetime(year, month + 1, 1)
        max_day = (next_month - timedelta(days=1)).day
    day = random.randint(1, max_day)
    return f"{year}-{month:02d}-{day:02d}"


def compute_price_changes(price_df):
    """
    Compute average month-over-month % change per region per month.
    Returns dict: (region, 'YYYY-MM-01') -> pct_change
    """
    changes = {}
    grouped = price_df.groupby("property_id")

    region_map = {}
    for pid, group in grouped:
        group = group.sort_values("date")
        rows = group.to_dict("records")
        if len(rows) < 2:
            continue
        # We need region — infer from the housing data or just store first
        region_map[pid] = None  # filled below

    # We need region info — load housing CSV
    housing = pd.read_csv("data/jakarta_housing_clean.csv")
    for _, row in housing.iterrows():
        pid = row.get("property_id", "")
        region = row.get("region", "")
        if pid:
            region_map[pid] = region

    # Compute per-region per-month average change
    region_month_changes = {}
    for pid, group in grouped:
        region = region_map.get(pid)
        if not region:
            continue
        group = group.sort_values("date")
        rows = group.to_dict("records")
        for i in range(1, len(rows)):
            prev_price = float(rows[i - 1]["price"])
            curr_price = float(rows[i]["price"])
            if prev_price <= 0:
                continue
            pct = (curr_price - prev_price) / prev_price
            date = rows[i]["date"]
            key = (region, date)
            if key not in region_month_changes:
                region_month_changes[key] = []
            region_month_changes[key].append(pct)

    # Average
    for key in region_month_changes:
        vals = region_month_changes[key]
        changes[key] = sum(vals) / len(vals)

    return changes


def sentiment_bias_from_price(pct_change):
    """Map price % change to a sentiment bias in [-0.1, 0.1]."""
    bias = pct_change * 5
    return max(-0.1, min(0.1, bias))


def make_article(article_id, year, month, scope, region_id, category,
                 title, summary, sentiment_raw, impact_magnitude, source):
    """Create an article dict."""
    weighted = round(sentiment_raw * impact_magnitude, 4)
    return {
        "article_id": article_id,
        "published_date": random_day_in_month(year, month),
        "title": title,
        "summary": summary,
        "source": source,
        "url": f"https://example.com/news/{article_id}",
        "scope": scope,
        "region_id": region_id,
        "category": category,
        "sentiment_raw": round(sentiment_raw, 4),
        "impact_magnitude": round(impact_magnitude, 4),
        "weighted_sentiment": weighted,
    }


# ---------------------------------------------------------------------------
# Article Generation
# ---------------------------------------------------------------------------


def generate_articles(price_changes):
    """Generate all mock articles across 36 months."""
    articles = []
    counter = 0

    for month_idx in range(MONTHS):
        year, month = index_to_date(month_idx)
        date_key = f"{year}-{month:02d}-01"

        # 1. Event-correlated national articles
        events = EVENT_NEWS.get((year, month), [])
        for ev in events:
            ev_scope, ev_cat, ev_title, ev_summary, ev_sent, ev_impact = ev
            counter += 1
            aid = f"art-{year}{month:02d}-{counter:04d}"
            articles.append(make_article(
                aid, year, month, ev_scope, "", ev_cat,
                ev_title, ev_summary, ev_sent, ev_impact, pick_source()
            ))

        # 2. Per-region local/regional articles
        for region in REGIONS:
            pct_change = price_changes.get((region, date_key), 0.0)
            bias = sentiment_bias_from_price(pct_change)

            templates = REGION_TEMPLATES[region]

            # Filter templates by seasonal relevance
            eligible = []
            for t in templates:
                cat, title, summary, sent_range, seasonal = t
                if seasonal and month not in seasonal:
                    # Off-season: lower weight but not zero
                    eligible.append((t, 0.2))
                elif seasonal and month in seasonal:
                    # In-season: high weight
                    eligible.append((t, 3.0))
                else:
                    eligible.append((t, 1.0))

            t_items = [e[0] for e in eligible]
            t_weights = [e[1] for e in eligible]

            # 2-3 local articles
            n_local = random.choice([1, 1, 2])
            for _ in range(n_local):
                t = random.choices(t_items, weights=t_weights, k=1)[0]
                cat, title, summary, sent_range, _ = t

                # Compute sentiment with bias
                base_sent = random.uniform(*sent_range)
                sentiment = max(-1.0, min(1.0, base_sent + bias * 0.1))
                impact = random.uniform(*CATEGORY_IMPACT[cat])

                counter += 1
                aid = f"art-{year}{month:02d}-{counter:04d}"
                articles.append(make_article(
                    aid, year, month, "local", region, cat,
                    title, summary, sentiment, impact, pick_source()
                ))

            # 1-2 regional articles
            if random.random() < 0.40:
                t = random.choices(t_items, weights=t_weights, k=1)[0]
                cat, title, summary, sent_range, _ = t

                base_sent = random.uniform(*sent_range)
                sentiment = max(-1.0, min(1.0, base_sent + bias * 0.05))
                impact = random.uniform(*CATEGORY_IMPACT[cat])

                counter += 1
                aid = f"art-{year}{month:02d}-{counter:04d}"
                articles.append(make_article(
                    aid, year, month, "regional", region, cat,
                    title, summary, sentiment, impact, pick_source()
                ))

        # 3. National articles (non-event months)
        if not events:
            n_national = random.choice([0, 1, 1])
            for _ in range(n_national):
                t = random.choice(NATIONAL_TEMPLATES)
                cat, title, summary, sent_range = t

                # National sentiment: slight bias from average across all regions
                avg_change = 0.0
                count = 0
                for r in REGIONS:
                    pc = price_changes.get((r, date_key), 0.0)
                    avg_change += pc
                    count += 1
                if count > 0:
                    avg_change /= count
                nat_bias = sentiment_bias_from_price(avg_change)

                base_sent = random.uniform(*sent_range)
                sentiment = max(-1.0, min(1.0, base_sent + nat_bias * 0.05))
                impact = random.uniform(*CATEGORY_IMPACT[cat])

                counter += 1
                aid = f"art-{year}{month:02d}-{counter:04d}"
                articles.append(make_article(
                    aid, year, month, "national", "", cat,
                    title, summary, sentiment, impact, pick_source()
                ))

    return articles


# ---------------------------------------------------------------------------
# Signal Aggregation
# ---------------------------------------------------------------------------


def aggregate_signals(articles_df):
    """Roll up articles into monthly signals per region/scope."""
    signals = []

    for month_idx in range(MONTHS):
        year, month = index_to_date(month_idx)
        period = f"{year}-{month:02d}-01"

        for region in REGIONS:
            # Collect articles relevant to this region
            local_arts = articles_df[
                (articles_df["region_id"] == region) &
                (articles_df["scope"] == "local") &
                (articles_df["published_date"].str.startswith(f"{year}-{month:02d}"))
            ]
            regional_arts = articles_df[
                (articles_df["region_id"] == region) &
                (articles_df["scope"] == "regional") &
                (articles_df["published_date"].str.startswith(f"{year}-{month:02d}"))
            ]
            national_arts = articles_df[
                (articles_df["scope"] == "national") &
                (articles_df["published_date"].str.startswith(f"{year}-{month:02d}"))
            ]

            scope_data = {
                "local": local_arts,
                "regional": regional_arts,
                "national": national_arts,
            }

            # Combined = all articles affecting this region
            combined = pd.concat([local_arts, regional_arts, national_arts])

            scope_data["combined"] = combined

            for scope_name, subset in scope_data.items():
                if len(subset) == 0:
                    signals.append({
                        "region_id": region,
                        "period_start": period,
                        "scope": scope_name,
                        "article_count": 0,
                        "positive_count": 0,
                        "negative_count": 0,
                        "neutral_count": 0,
                        "avg_sentiment": 0.0,
                        "weighted_avg_sentiment": 0.0,
                        "dominant_category": "",
                        "signal_strength": 0.0,
                    })
                    continue

                sentiments = subset["sentiment_raw"].tolist()
                weighted = subset["weighted_sentiment"].tolist()
                categories = subset["category"].tolist()

                n = len(sentiments)
                positive = sum(1 for s in sentiments if s > 0.1)
                negative = sum(1 for s in sentiments if s < -0.1)
                neutral = n - positive - negative

                avg_sent = sum(sentiments) / n
                weighted_avg = sum(weighted) / n

                cat_counts = Counter(categories)
                dominant = cat_counts.most_common(1)[0][0] if cat_counts else ""

                # Signal strength composite
                magnitude = abs(weighted_avg)
                volume_factor = min(1.0, n / 5.0)
                if n > 1 and max(positive, negative) > 0:
                    consensus = 1.0 - (min(positive, negative) / max(positive, negative))
                else:
                    consensus = 1.0
                signal_strength = magnitude * 0.5 + volume_factor * 0.2 + consensus * 0.3

                signals.append({
                    "region_id": region,
                    "period_start": period,
                    "scope": scope_name,
                    "article_count": n,
                    "positive_count": positive,
                    "negative_count": negative,
                    "neutral_count": neutral,
                    "avg_sentiment": round(avg_sent, 4),
                    "weighted_avg_sentiment": round(weighted_avg, 4),
                    "dominant_category": dominant,
                    "signal_strength": round(signal_strength, 4),
                })

    return signals


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    print("=== Mock News Generator ===")

    # Load price history
    price_df = pd.read_csv("data/price_history.csv")
    print(f"Loaded price history: {len(price_df)} rows")

    # Compute price changes for correlation
    price_changes = compute_price_changes(price_df)
    print(f"Computed price changes for {len(price_changes)} (region, month) pairs")

    # Generate articles
    articles = generate_articles(price_changes)
    articles_df = pd.DataFrame(articles)
    articles_csv = "data/articles.csv"
    articles_df.to_csv(articles_csv, index=False, encoding="utf-8-sig")
    print(f"\nArticles: {len(articles_df)} -> {articles_csv}")

    # Aggregate signals
    signals = aggregate_signals(articles_df)
    signals_df = pd.DataFrame(signals)
    signals_csv = "data/news_signals.csv"
    signals_df.to_csv(signals_csv, index=False, encoding="utf-8-sig")
    print(f"Signals: {len(signals_df)} -> {signals_csv}")

    # Copy to viz/public
    for fname in ["articles.csv", "news_signals.csv"]:
        src = f"data/{fname}"
        dst = f"viz/public/{fname}"
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        print(f"Copied to {dst}")

    # Summary
    print(f"\n--- Summary ---")
    print(f"Articles: {len(articles_df)}")
    print(f"  Scope distribution:")
    for scope, count in articles_df["scope"].value_counts().items():
        print(f"    {scope}: {count} ({count/len(articles_df)*100:.0f}%)")
    print(f"  Category distribution:")
    for cat, count in articles_df["category"].value_counts().items():
        print(f"    {cat}: {count}")
    print(f"  Region distribution:")
    for region in REGIONS:
        count = len(articles_df[articles_df["region_id"] == region])
        print(f"    {region}: {count}")
    national_count = len(articles_df[articles_df["scope"] == "national"])
    print(f"    National: {national_count}")
    print(f"  Sentiment range: {articles_df['sentiment_raw'].min():.2f} to {articles_df['sentiment_raw'].max():.2f}")
    print(f"  Date range: {articles_df['published_date'].min()} to {articles_df['published_date'].max()}")
    print(f"\nSignals: {len(signals_df)} rows")
    print(f"  {len(signals_df[signals_df['scope'] == 'combined'])} combined-scope signal rows")


if __name__ == "__main__":
    main()
